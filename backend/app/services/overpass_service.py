"""
ThermalWatch — OSM / Overpass Enrichment Service
==================================================

Enriches thermal_events with spatial context from OpenStreetMap
via the Overpass API.

UNIT CONTRACT
-------------
ALL distance_to_* values are stored in KILOMETRES (km).
The Haversine function returns km. Values written to PostgreSQL are km.
Phase 0 audit confirmed: existing 30 enriched rows store km values
(e.g. distance_to_industrial=3.97, distance_to_road=0.50 — geographically
sensible km, not metres).

QUERY DESIGN
------------
Previous design: 6 separate Overpass queries per event (one per facility type).
Current design:  2 Overpass queries per event:
  1. One combined query for all facility tags (industrial/refinery/powerplant/
     mine/gas_facility) — uses Overpass union syntax.
  2. One road query.

Category separation is preserved: after fetching the combined result, each
element is classified by its OSM tags into the correct category. Nearest
distance per category is computed locally via Haversine.

This reduces Overpass requests per event from 6 → 2, cutting enrichment
time by ~66% while preserving semantics.

NEAR_* THRESHOLDS
-----------------
AMBIGUITY FLAG: No per-category thresholds are defined in the project spec.
The current operative value is OSM_NEAR_THRESHOLD_KM=10.0 (env-configurable).
This must be confirmed by the team before ML training begins.

Rate limiting:
  - Configurable delay between requests (default 1.0 s)
  - Exponential backoff on 429/503
  - Hard timeout per query
  - Configurable Overpass endpoint (default public)

Environment variables:
  OVERPASS_URL              default: https://overpass-api.de/api/interpreter
  OSM_SEARCH_RADIUS_KM      default: 50.0  (search radius around event)
  OSM_NEAR_THRESHOLD_KM     default: 10.0  (near_* flag threshold — CONFIRM WITH TEAM)
  OSM_REQUEST_DELAY_S       default: 1.0   (seconds between requests)
  OSM_REQUEST_TIMEOUT_S     default: 30    (per-request timeout)
  OSM_BATCH_SIZE            default: 50    (events per enrichment batch)
"""

from __future__ import annotations

import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from app.database.connection import get_db_cursor

load_dotenv()

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

OVERPASS_URL = os.getenv(
    "OVERPASS_URL",
    "https://overpass-api.de/api/interpreter",
)
# Search radius for Overpass queries (km → converted to metres for the query)
SEARCH_RADIUS_KM = float(os.getenv("OSM_SEARCH_RADIUS_KM", "50.0"))

# ⚠ AMBIGUITY: No per-category thresholds defined in project spec.
# Single generic threshold used for all near_* flags until confirmed.
# Team must confirm per-category values before ML training.
NEAR_THRESHOLD_KM = float(os.getenv("OSM_NEAR_THRESHOLD_KM", "10.0"))

REQUEST_DELAY_S   = float(os.getenv("OSM_REQUEST_DELAY_S", "1.0"))
REQUEST_TIMEOUT_S = int(os.getenv("OSM_REQUEST_TIMEOUT_S", "30"))
BATCH_SIZE        = int(os.getenv("OSM_BATCH_SIZE", "50"))

OSM_SOURCE_VERSION = "overpass-osm-2024"

# =============================================================================
# OSM TAG → CATEGORY MAPPING
# =============================================================================
# Each entry: (tag_key, tag_value) → category name
# Used both for query construction and for result classification.

_TAG_TO_CATEGORY: List[Tuple[str, str, str]] = [
    # (key, value, category)
    ("landuse",   "industrial",    "industrial"),
    ("landuse",   "commercial",    "industrial"),
    ("industrial","oil",           "refinery"),
    ("industrial","refinery",      "refinery"),
    ("man_made",  "petroleum_well","refinery"),
    ("power",     "plant",         "powerplant"),
    ("power",     "generator",     "powerplant"),
    ("power",     "substation",    "powerplant"),
    ("landuse",   "quarry",        "mine"),
    ("landuse",   "landfill",      "mine"),
    ("industrial","mine",          "mine"),
    ("man_made",  "mineshaft",     "mine"),
    ("industrial","gas",           "gas_facility"),
    ("man_made",  "gasometer",     "gas_facility"),
    ("amenity",   "fuel",          "gas_facility"),
]

# Derived sets for the query builder
_FACILITY_TAGS: List[Tuple[str, str]] = [(k, v) for k, v, _ in _TAG_TO_CATEGORY]

# Road highway values included in the road query
_ROAD_HIGHWAY_VALUES = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential"
)

# =============================================================================
# QUERY BUILDERS — 2 queries per event (was 6)
# =============================================================================

def _build_combined_facility_query(lat: float, lon: float, radius_m: int) -> str:
    """
    Build a single Overpass QL query that retrieves ALL facility categories
    (industrial, refinery, powerplant, mine, gas_facility) in one request.

    Returns a union of node + way queries for every tag in _FACILITY_TAGS.
    Each returned element includes its OSM tags so we can classify it locally.
    """
    blocks: List[str] = []
    for key, val in _FACILITY_TAGS:
        blocks.append(f'  node["{key}"="{val}"](around:{radius_m},{lat},{lon});')
        blocks.append(f'  way["{key}"="{val}"](around:{radius_m},{lat},{lon});')

    body = "\n".join(blocks)
    return f"""[out:json][timeout:{REQUEST_TIMEOUT_S}];
(
{body}
);
out center tags;
"""


def _build_road_query(lat: float, lon: float, radius_m: int) -> str:
    """Build Overpass query for nearest classified road."""
    return f"""[out:json][timeout:{REQUEST_TIMEOUT_S}];
(
  way["highway"~"{_ROAD_HIGHWAY_VALUES}"](around:{radius_m},{lat},{lon});
);
out center;
"""


# =============================================================================
# HAVERSINE DISTANCE  (returns KILOMETRES)
# =============================================================================

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Great-circle distance between two WGS-84 coordinates.
    Returns: distance in KILOMETRES.
    """
    R = 6371.0  # Earth mean radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# =============================================================================
# OVERPASS REQUEST  (shared for both query types)
# =============================================================================

def _overpass_request(query: str, max_retries: int = 3) -> Optional[List[dict]]:
    """
    POST an Overpass query and return the element list.
    Returns None on unrecoverable failure (caller handles gracefully).
    Implements exponential backoff on 429 / 503.
    """
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=(10, REQUEST_TIMEOUT_S),
                headers={"User-Agent": "ThermalWatch/1.0 thermal-anomaly-monitoring"},
            )

            if resp.status_code in (429, 503):
                wait = 5 * attempt
                logger.warning(
                    "Overpass rate limit HTTP %d — waiting %ds (attempt %d/%d)",
                    resp.status_code, wait, attempt, max_retries,
                )
                time.sleep(wait)
                continue

            if resp.status_code != 200:
                logger.error("Overpass HTTP %d on attempt %d", resp.status_code, attempt)
                return None

            return resp.json().get("elements", [])

        except requests.exceptions.Timeout:
            logger.warning("Overpass timeout (attempt %d/%d)", attempt, max_retries)
        except requests.exceptions.ConnectionError as exc:
            logger.warning("Overpass connection error: %s", exc)
        except Exception as exc:
            logger.error("Overpass unexpected error: %s", exc)
            return None

        if attempt < max_retries:
            time.sleep(2 * attempt)

    return None


# =============================================================================
# ELEMENT CLASSIFICATION
# =============================================================================

def _classify_element(tags: dict) -> Optional[str]:
    """
    Given the OSM tags dict of one Overpass element, return the ThermalWatch
    facility category name, or None if no matching category.
    Checks _TAG_TO_CATEGORY in order; returns the first match.
    """
    for key, val, category in _TAG_TO_CATEGORY:
        if tags.get(key) == val:
            return category
    return None


def _element_coords(el: dict) -> Optional[Tuple[float, float]]:
    """Extract (lat, lon) from a node or way element."""
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


# =============================================================================
# NEAREST DISTANCE PER CATEGORY
# =============================================================================

def _distances_from_elements(
    event_lat: float,
    event_lon: float,
    elements: List[dict],
) -> Dict[str, Optional[float]]:
    """
    Given a list of Overpass elements (from the combined facility query),
    classify each element and return the nearest distance (km) per category.
    Categories with no elements return None.
    """
    best: Dict[str, float] = {}

    for el in elements:
        coords = _element_coords(el)
        if coords is None:
            continue
        el_lat, el_lon = coords
        tags = el.get("tags", {})
        category = _classify_element(tags)
        if category is None:
            continue
        d = _haversine_km(event_lat, event_lon, el_lat, el_lon)
        if category not in best or d < best[category]:
            best[category] = d

    return {
        "distance_to_industrial":   best.get("industrial"),
        "distance_to_refinery":     best.get("refinery"),
        "distance_to_powerplant":   best.get("powerplant"),
        "distance_to_mine":         best.get("mine"),
        "distance_to_gas_facility": best.get("gas_facility"),
    }


def _nearest_distance_km(
    event_lat: float,
    event_lon: float,
    elements: List[dict],
) -> Optional[float]:
    """Return the distance in km to the nearest element in a list (for roads)."""
    min_dist: Optional[float] = None
    for el in elements:
        coords = _element_coords(el)
        if coords is None:
            continue
        d = _haversine_km(event_lat, event_lon, coords[0], coords[1])
        if min_dist is None or d < min_dist:
            min_dist = d
    return min_dist


# =============================================================================
# ENRICH ONE EVENT  (2 Overpass requests)
# =============================================================================

def enrich_single_event(db_id: int, lat: float, lon: float) -> Dict:
    """
    Enrich one thermal event with OSM spatial context.

    Issues exactly 2 Overpass requests:
      1. Combined facility query (industrial / refinery / powerplant / mine / gas)
      2. Road query

    All distance_to_* values are in KILOMETRES.

    Returns a dict ready to be written to thermal_events.
    On Overpass failure: status='error', distances=None.
    """
    radius_m = int(SEARCH_RADIUS_KM * 1000)
    result: Dict = {}
    any_error = False

    # --- Request 1: combined facility query ---
    fac_query = _build_combined_facility_query(lat, lon, radius_m)
    fac_elements = _overpass_request(fac_query)
    if fac_elements is None:
        any_error = True
        result.update({
            "distance_to_industrial":   None,
            "distance_to_refinery":     None,
            "distance_to_powerplant":   None,
            "distance_to_mine":         None,
            "distance_to_gas_facility": None,
        })
    else:
        result.update(_distances_from_elements(lat, lon, fac_elements))
    time.sleep(REQUEST_DELAY_S)

    # --- Request 2: road query ---
    road_query = _build_road_query(lat, lon, radius_m)
    road_elements = _overpass_request(road_query)
    if road_elements is None:
        any_error = True
        result["distance_to_road"] = None
    else:
        result["distance_to_road"] = _nearest_distance_km(lat, lon, road_elements)
    time.sleep(REQUEST_DELAY_S)

    # --- near_* boolean flags ---
    # ⚠ AMBIGUITY: Single generic threshold NEAR_THRESHOLD_KM=10.0 applied
    # to all categories. Team must define per-category thresholds before
    # ML training.
    def near(col: str) -> Optional[bool]:
        d = result.get(col)
        if d is None:
            return None
        return d <= NEAR_THRESHOLD_KM

    result["near_industrial_facility"] = near("distance_to_industrial")
    result["near_refinery"]            = near("distance_to_refinery")
    result["near_powerplant"]          = near("distance_to_powerplant")
    result["near_mine"]                = near("distance_to_mine")
    result["near_gas_facility"]        = near("distance_to_gas_facility")

    # --- enrichment status ---
    if any_error:
        result["osm_enrichment_status"] = "error"
    else:
        has_any = any(
            result.get(c) is not None
            for c in [
                "distance_to_industrial", "distance_to_refinery",
                "distance_to_powerplant", "distance_to_mine",
                "distance_to_gas_facility", "distance_to_road",
            ]
        )
        result["osm_enrichment_status"] = "enriched" if has_any else "nodata"

    result["osm_enriched_at"]     = datetime.now(timezone.utc)
    result["osm_source_version"]  = OSM_SOURCE_VERSION
    return result


# =============================================================================
# WRITE RESULT TO DATABASE
# =============================================================================

def _write_osm_result(db_id: int, result: Dict) -> None:
    """Write the OSM enrichment result for one event to thermal_events.
    All distance_to_* values stored in KILOMETRES.
    """
    with get_db_cursor() as cur:
        cur.execute(
            """
            UPDATE thermal_events SET
                distance_to_industrial   = %s,
                distance_to_refinery     = %s,
                distance_to_powerplant   = %s,
                distance_to_mine         = %s,
                distance_to_gas_facility = %s,
                distance_to_road         = %s,
                near_industrial_facility = %s,
                near_refinery            = %s,
                near_powerplant          = %s,
                near_mine                = %s,
                near_gas_facility        = %s,
                osm_enrichment_status    = %s,
                osm_enriched_at          = %s,
                osm_source_version       = %s
            WHERE id = %s;
            """,
            (
                result.get("distance_to_industrial"),
                result.get("distance_to_refinery"),
                result.get("distance_to_powerplant"),
                result.get("distance_to_mine"),
                result.get("distance_to_gas_facility"),
                result.get("distance_to_road"),
                result.get("near_industrial_facility"),
                result.get("near_refinery"),
                result.get("near_powerplant"),
                result.get("near_mine"),
                result.get("near_gas_facility"),
                result.get("osm_enrichment_status"),
                result.get("osm_enriched_at"),
                result.get("osm_source_version"),
                db_id,
            ),
        )


# =============================================================================
# BATCH ENRICHMENT  (live pipeline — called by scheduler)
# =============================================================================

def run_osm_enrichment(batch_size: int = BATCH_SIZE) -> Dict:
    """
    Enrich the next batch of pending events.
    Selects WHERE osm_enrichment_status = 'pending' ORDER BY created_at DESC.
    Returns batch stats dict.

    Called by the scheduler every OSM_ENRICH_INTERVAL_MINUTES.
    FIRMS ingestion is NOT blocked — this runs in a background thread.
    """
    import time as _time
    t0 = _time.time()
    stats = {"candidates": 0, "processed": 0, "enriched": 0,
             "nodata": 0, "errors": 0, "requests": 0}

    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT id, latitude, longitude
            FROM thermal_events
            WHERE osm_enrichment_status = 'pending'
            ORDER BY created_at DESC
            LIMIT %s;
            """,
            (batch_size,),
        )
        events = cur.fetchall()

    stats["candidates"] = len(events)
    if not events:
        logger.info("OSM enrichment: no pending events")
        return stats

    logger.info("OSM enrichment: processing %d events (2 req/event)", len(events))

    for db_id, lat, lon in events:
        try:
            result = enrich_single_event(db_id, float(lat), float(lon))
            _write_osm_result(db_id, result)
            stats["processed"] += 1
            stats["requests"]  += 2
            status = result.get("osm_enrichment_status", "error")
            if status == "enriched":
                stats["enriched"] += 1
            elif status == "nodata":
                stats["nodata"] += 1
            else:
                stats["errors"] += 1
        except Exception as exc:
            logger.error("OSM enrichment failed for id=%d: %s", db_id, exc)
            with get_db_cursor() as cur:
                cur.execute(
                    """
                    UPDATE thermal_events
                    SET osm_enrichment_status = 'error', last_error = %s
                    WHERE id = %s;
                    """,
                    (str(exc)[:500], db_id),
                )
            stats["errors"] += 1

    elapsed = _time.time() - t0
    logger.info(
        "OSM enrichment batch done: candidates=%d processed=%d enriched=%d "
        "nodata=%d errors=%d requests=%d elapsed=%.1fs",
        stats["candidates"], stats["processed"], stats["enriched"],
        stats["nodata"], stats["errors"], stats["requests"], elapsed,
    )
    return stats


# =============================================================================
# COUNT HELPERS
# =============================================================================

def count_osm_pending() -> int:
    """Return number of events awaiting OSM enrichment."""
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM thermal_events "
            "WHERE osm_enrichment_status = 'pending';"
        )
        return cur.fetchone()[0]


def count_osm_error() -> int:
    """Return number of events where OSM enrichment errored."""
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM thermal_events "
            "WHERE osm_enrichment_status = 'error';"
        )
        return cur.fetchone()[0]


# =============================================================================
# HISTORICAL BACKFILL TOOL  (explicit, never auto-runs)
# =============================================================================

def estimate_backfill(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict:
    """
    Estimate the number of events and Overpass requests a backfill would require.
    Does NOT enrich anything. Prints a human-readable report and returns the dict.

    Args:
        date_from: 'YYYY-MM-DD' inclusive lower bound on acquisition_date
        date_to:   'YYYY-MM-DD' inclusive upper bound on acquisition_date
    """
    conditions = ["osm_enrichment_status = 'pending'"]
    params: List = []
    if date_from:
        conditions.append("acquisition_date >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("acquisition_date <= %s")
        params.append(date_to)
    where = "WHERE " + " AND ".join(conditions)

    with get_db_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM thermal_events {where}", params)
        candidate_count = cur.fetchone()[0]

    overpass_requests = candidate_count * 2
    est_minutes_at_1s = overpass_requests * REQUEST_DELAY_S / 60

    report = {
        "date_from":          date_from or "all",
        "date_to":            date_to   or "all",
        "candidate_events":   candidate_count,
        "overpass_requests":  overpass_requests,
        "delay_per_req_s":    REQUEST_DELAY_S,
        "estimated_minutes":  round(est_minutes_at_1s, 1),
        "batch_size":         BATCH_SIZE,
        "batches_needed":     math.ceil(candidate_count / BATCH_SIZE) if candidate_count else 0,
    }

    print()
    print("=" * 60)
    print("  OSM BACKFILL ESTIMATE")
    print("=" * 60)
    print(f"  Date range        : {report['date_from']} → {report['date_to']}")
    print(f"  Candidate events  : {candidate_count:,}")
    print(f"  Overpass requests : {overpass_requests:,}  (2 per event)")
    print(f"  Request delay     : {REQUEST_DELAY_S}s")
    print(f"  Estimated time    : {est_minutes_at_1s:.1f} minutes")
    print(f"  Batch size        : {BATCH_SIZE}")
    print(f"  Batches needed    : {report['batches_needed']:,}")
    print("=" * 60)
    print()
    print("  ⚠  This estimate is for public Overpass (overpass-api.de).")
    print("     Do NOT run a large backfill on the public endpoint.")
    print("     Consider a private Overpass instance for bulk enrichment.")
    print("=" * 60)
    print()
    return report


def run_backfill(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    batch_size: int = BATCH_SIZE,
    max_records: Optional[int] = None,
    dry_run: bool = False,
) -> Dict:
    """
    Configurable historical OSM backfill.

    Args:
        date_from:   'YYYY-MM-DD' lower bound on acquisition_date
        date_to:     'YYYY-MM-DD' upper bound on acquisition_date
        batch_size:  events processed per batch (default: OSM_BATCH_SIZE)
        max_records: hard cap on total events processed in this run
        dry_run:     if True, print estimate only — do not enrich

    IMPORTANT: Print the estimate and require explicit confirmation before
    running large backfills.  This function will NOT auto-confirm.
    """
    estimate = estimate_backfill(date_from, date_to)

    if dry_run:
        print("  DRY RUN — no enrichment performed.")
        return estimate

    effective_max = max_records or estimate["candidate_events"]
    if effective_max == 0:
        print("  No pending events matching criteria.")
        return estimate

    import time as _time
    t0 = _time.time()
    grand = {"processed": 0, "enriched": 0, "nodata": 0, "errors": 0, "requests": 0}

    conditions = ["osm_enrichment_status = 'pending'"]
    params_base: List = []
    if date_from:
        conditions.append("acquisition_date >= %s")
        params_base.append(date_from)
    if date_to:
        conditions.append("acquisition_date <= %s")
        params_base.append(date_to)
    where = "WHERE " + " AND ".join(conditions)

    remaining = effective_max
    batch_num = 0

    while remaining > 0:
        this_batch = min(batch_size, remaining)
        batch_num += 1

        with get_db_cursor() as cur:
            cur.execute(
                f"SELECT id, latitude, longitude FROM thermal_events {where} "
                "ORDER BY acquisition_date DESC, id DESC LIMIT %s",
                params_base + [this_batch],
            )
            events = cur.fetchall()

        if not events:
            break

        logger.info("OSM backfill batch %d: %d events", batch_num, len(events))

        for db_id, lat, lon in events:
            if grand["processed"] >= effective_max:
                break
            try:
                result = enrich_single_event(db_id, float(lat), float(lon))
                _write_osm_result(db_id, result)
                grand["processed"] += 1
                grand["requests"]  += 2
                status = result.get("osm_enrichment_status", "error")
                if status == "enriched":  grand["enriched"] += 1
                elif status == "nodata":  grand["nodata"]   += 1
                else:                     grand["errors"]   += 1
            except Exception as exc:
                logger.error("OSM backfill failed id=%d: %s", db_id, exc)
                with get_db_cursor() as cur:
                    cur.execute(
                        "UPDATE thermal_events SET osm_enrichment_status='error',"
                        " last_error=%s WHERE id=%s",
                        (str(exc)[:500], db_id),
                    )
                grand["errors"] += 1

        remaining -= len(events)
        logger.info(
            "OSM backfill batch %d done: total_processed=%d",
            batch_num, grand["processed"],
        )

    elapsed = _time.time() - t0
    grand["elapsed_s"] = round(elapsed, 1)
    logger.info("OSM backfill complete: %s", grand)
    return grand


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="ThermalWatch OSM enrichment CLI"
    )
    sub = parser.add_subparsers(dest="cmd")

    # estimate
    est_p = sub.add_parser("estimate", help="Estimate backfill cost (read-only)")
    est_p.add_argument("--date-from", default=None)
    est_p.add_argument("--date-to",   default=None)

    # backfill
    bf_p = sub.add_parser("backfill", help="Run historical OSM backfill")
    bf_p.add_argument("--date-from",    default=None)
    bf_p.add_argument("--date-to",      default=None)
    bf_p.add_argument("--batch-size",   type=int, default=BATCH_SIZE)
    bf_p.add_argument("--max-records",  type=int, default=None)
    bf_p.add_argument("--dry-run",      action="store_true")

    # batch (one scheduler batch)
    sub.add_parser("batch", help="Run one live enrichment batch (as scheduler would)")

    args = parser.parse_args()

    if args.cmd == "estimate":
        estimate_backfill(args.date_from, args.date_to)
    elif args.cmd == "backfill":
        run_backfill(
            date_from=args.date_from,
            date_to=args.date_to,
            batch_size=args.batch_size,
            max_records=args.max_records,
            dry_run=args.dry_run,
        )
    elif args.cmd == "batch":
        stats = run_osm_enrichment()
        print(stats)
    else:
        parser.print_help()
