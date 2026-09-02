"""
ThermalWatch — ESA WorldCover Enrichment Service
=================================================

Enriches thermal_events with ESA WorldCover 2021 v200 land-cover data.

TWO enrichment outputs per event
---------------------------------
1. Single-pixel classification (EXISTING — PRESERVED)
   worldcover_class_code  SMALLINT  — dominant class at the exact pixel
   worldcover_class_name  VARCHAR   — human-readable dominant class

2. Area percentage breakdown (NEW)
   wc_forest_pct       REAL  — % Tree cover
   wc_shrubland_pct    REAL  — % Shrubland
   wc_grassland_pct    REAL  — % Grassland
   wc_cropland_pct     REAL  — % Cropland
   wc_builtup_pct      REAL  — % Built-up
   wc_water_pct        REAL  — % Permanent water bodies
   wc_other_pct        REAL  — % all other valid classes
   wc_nodata_pct       REAL  — % NoData/unclassified pixels in window
   wc_sample_radius_km REAL  — radius used (km, for reproducibility)
   wc_sample_pixels    INT   — total pixels sampled in window

   Percentages sum to 100.0 ± floating-point rounding.
   NoData pixels contribute to wc_nodata_pct, not to category counts.

SAMPLING AREA
-------------
⚠ AMBIGUITY FLAG: No authoritative sampling radius is defined in the
project spec. Using WC_SAMPLE_RADIUS_KM (env var, default 1.0 km).
Team must confirm before ML training.

The window is a square bounding box of side 2 × radius centred on the
event coordinate, converted to pixel offsets from the COG.
rasterio.DatasetReader.read(window=...) fetches only the required COG
blocks over HTTPS — it does not download the entire tile.

At 10 m resolution, radius=1.0 km → ~200×200 px window (~40,000 pixels).

Dataset
-------
  Name       : ESA WorldCover 10 m 2021 v200
  Version    : v200
  Year       : 2021
  Resolution : 10 m (~0.0000834 degrees)
  CRS        : EPSG:4326  (WGS84)
  Format     : Cloud-Optimised GeoTIFF (COG)
  Tile size  : 3 × 3 degrees
  Source     : s3://esa-worldcover (public, no auth required)
  License    : CC-BY-4.0

Class mapping
-------------
  10  Tree cover
  20  Shrubland
  30  Grassland
  40  Cropland
  50  Built-up
  60  Bare / sparse vegetation
  70  Snow and ice
  80  Permanent water bodies
  90  Herbaceous wetland
  95  Mangroves
  100 Moss and lichen
   0  NoData
"""

from __future__ import annotations

import argparse
import math
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import rasterio
from rasterio.errors import RasterioIOError
from rasterio.windows import from_bounds

from app.database.connection import get_db_cursor

import os
from dotenv import load_dotenv
load_dotenv()

import logging
logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

WORLDCOVER_VERSION = "v200"
WORLDCOVER_YEAR    = 2021
S3_BASE_URL        = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"

# ⚠ AMBIGUITY: sampling radius not defined in spec. Env-configurable.
# Team must confirm before using percentages for ML training.
WC_SAMPLE_RADIUS_KM = float(os.getenv("WC_SAMPLE_RADIUS_KM", "1.0"))

WORLDCOVER_CLASSES: Dict[int, str] = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse vegetation",
    70: "Snow and ice",
    80: "Permanent water bodies",
    90: "Herbaceous wetland",
    95: "Mangroves",
    100: "Moss and lichen",
}
WORLDCOVER_NODATA = 0
DB_BATCH_SIZE     = 500
DEFAULT_TEST_LIMIT = 5

# Category → output column mapping for percentages
_PCT_GROUPS: Dict[str, List[int]] = {
    "forest":    [10],
    "shrubland": [20],
    "grassland": [30],
    "cropland":  [40],
    "builtup":   [50],
    "water":     [80],
    # "other" = all remaining valid classes (60,70,90,95,100)
}


# =============================================================================
# TILE HELPERS
# =============================================================================

def _tile_origin(lon: float, lat: float) -> Tuple[int, int]:
    return int(math.floor(lon / 3.0)) * 3, int(math.floor(lat / 3.0)) * 3


def _tile_name(lon: float, lat: float) -> str:
    tile_lon, tile_lat = _tile_origin(lon, lat)
    lat_hemi = "N" if tile_lat >= 0 else "S"
    lon_hemi = "E" if tile_lon >= 0 else "W"
    return f"{lat_hemi}{abs(tile_lat):02d}{lon_hemi}{abs(tile_lon):03d}"


def _tile_url(tile: str) -> str:
    return (
        f"{S3_BASE_URL}/v200/{WORLDCOVER_YEAR}/map/"
        f"ESA_WorldCover_10m_{WORLDCOVER_YEAR}_{WORLDCOVER_VERSION}"
        f"_{tile}_Map.tif"
    )


# =============================================================================
# SINGLE-PIXEL SAMPLING  (existing approach — unchanged)
# =============================================================================

def _sample_tile_points(
    tile_url: str,
    lons: np.ndarray,
    lats: np.ndarray,
) -> np.ndarray:
    """
    Sample exact pixel values at supplied coordinates.
    Returns uint8 array, length = len(lons). 0 = NoData.
    """
    coords = list(zip(lons.tolist(), lats.tolist()))
    result = np.zeros(len(coords), dtype=np.uint8)
    with rasterio.open(tile_url) as src:
        sampled = src.sample(coords, indexes=1, masked=True)
        for i, val in enumerate(sampled):
            result[i] = 0 if val.mask[0] else int(val[0])
    return result


# =============================================================================
# AREA PERCENTAGE SAMPLING  (new)
# =============================================================================

def _degrees_per_km_lat() -> float:
    """Approximate degrees of latitude per km (Earth mean radius)."""
    return 1.0 / 110.574


def _degrees_per_km_lon(lat_deg: float) -> float:
    """Approximate degrees of longitude per km at a given latitude."""
    return 1.0 / (111.32 * math.cos(math.radians(lat_deg)))


def _sample_area_percentages(
    tile_url: str,
    lat: float,
    lon: float,
    radius_km: float,
) -> Dict[str, float]:
    """
    Sample all WorldCover pixels within a square window of half-side
    `radius_km` centred on (lat, lon) from the given COG tile URL.

    Returns dict:
        forest_pct, shrubland_pct, grassland_pct, cropland_pct,
        builtup_pct, water_pct, other_pct, nodata_pct,
        sample_pixels (total pixels in window)

    Percentages sum to 100.0 ± floating-point rounding.
    Uses rasterio Window to fetch only the required COG blocks over HTTPS.
    """
    dlat = radius_km * _degrees_per_km_lat()
    dlon = radius_km * _degrees_per_km_lon(lat)

    min_lon = lon - dlon
    max_lon = lon + dlon
    min_lat = lat - dlat
    max_lat = lat + dlat

    with rasterio.open(tile_url) as src:
        window = from_bounds(
            left=min_lon, bottom=min_lat,
            right=max_lon, top=max_lat,
            transform=src.transform,
        )
        # Clamp to tile bounds
        window = window.intersection(
            rasterio.windows.Window(0, 0, src.width, src.height)
        )
        if window.width <= 0 or window.height <= 0:
            return _empty_pct_dict()

        data = src.read(1, window=window, masked=True)

    # data is a 2-D masked array
    flat = data.filled(0).flatten()  # masked → 0 (NoData)
    total_px = len(flat)
    if total_px == 0:
        return _empty_pct_dict()

    # Count pixels per class
    counts: Dict[int, int] = {}
    unique, ucounts = np.unique(flat, return_counts=True)
    for pv, cnt in zip(unique.tolist(), ucounts.tolist()):
        counts[int(pv)] = int(cnt)

    nodata_px = counts.get(0, 0)
    valid_px  = total_px - nodata_px

    def pct(px: int) -> float:
        return round(px / total_px * 100.0, 4) if total_px > 0 else 0.0

    # Assign to groups
    grouped: Dict[str, int] = {g: 0 for g in _PCT_GROUPS}
    other_px = 0
    for pv, cnt in counts.items():
        if pv == 0:
            continue
        placed = False
        for group, codes in _PCT_GROUPS.items():
            if pv in codes:
                grouped[group] += cnt
                placed = True
                break
        if not placed:
            other_px += cnt

    return {
        "forest_pct":    pct(grouped["forest"]),
        "shrubland_pct": pct(grouped["shrubland"]),
        "grassland_pct": pct(grouped["grassland"]),
        "cropland_pct":  pct(grouped["cropland"]),
        "builtup_pct":   pct(grouped["builtup"]),
        "water_pct":     pct(grouped["water"]),
        "other_pct":     pct(other_px),
        "nodata_pct":    pct(nodata_px),
        "sample_pixels": total_px,
    }


def _empty_pct_dict() -> Dict[str, float]:
    return {
        "forest_pct": None, "shrubland_pct": None, "grassland_pct": None,
        "cropland_pct": None, "builtup_pct": None, "water_pct": None,
        "other_pct": None, "nodata_pct": None, "sample_pixels": None,
    }


# =============================================================================
# DATABASE — FETCH PENDING
# =============================================================================

def _fetch_firms_records(
    limit: Optional[int],
    unenriched_only: bool = True,
) -> List[Tuple[int, float, float]]:
    with get_db_cursor() as cur:
        if unenriched_only:
            cur.execute(
                """
                SELECT id, latitude, longitude
                FROM thermal_events
                WHERE worldcover_version IS NULL
                ORDER BY id
                LIMIT %s;
                """,
                (limit,),
            )
        else:
            cur.execute(
                """
                SELECT id, latitude, longitude
                FROM thermal_events
                ORDER BY id
                LIMIT %s;
                """,
                (limit,),
            )
        return cur.fetchall()


def _count_unenriched() -> int:
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM thermal_events WHERE worldcover_version IS NULL;"
        )
        return cur.fetchone()[0]


# =============================================================================
# DATABASE — WRITE RESULTS
# =============================================================================

def _update_worldcover_batch(
    updates: List[Tuple],
) -> int:
    """
    Bulk-update thermal_events with single-pixel + area-percentage results.

    Each tuple: (class_code, class_name, forest_pct, shrubland_pct,
                 grassland_pct, cropland_pct, builtup_pct, water_pct,
                 other_pct, nodata_pct, sample_pixels, sample_radius_km,
                 event_db_id)
    """
    now = datetime.now(timezone.utc)
    sql = """
        UPDATE thermal_events SET
            worldcover_class_code  = %s,
            worldcover_class_name  = %s,
            worldcover_version     = %s,
            worldcover_enriched_at = %s,
            wc_forest_pct          = %s,
            wc_shrubland_pct       = %s,
            wc_grassland_pct       = %s,
            wc_cropland_pct        = %s,
            wc_builtup_pct         = %s,
            wc_water_pct           = %s,
            wc_other_pct           = %s,
            wc_nodata_pct          = %s,
            wc_sample_pixels       = %s,
            wc_sample_radius_km    = %s
        WHERE id = %s;
    """
    params = [
        (
            code, name, WORLDCOVER_VERSION, now,
            t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11],
            t[12],
        )
        for t, (code, name) in (
            (tup, (tup[0], tup[1]))
            for tup in updates
        )
    ]
    # Rebuild cleanly to avoid confusion
    clean_params = []
    for tup in updates:
        (code, name, forest, shrub, grass, crop,
         built, water, other, nodata, sample_px,
         radius_km, db_id) = tup
        clean_params.append((
            code, name, WORLDCOVER_VERSION, now,
            forest, shrub, grass, crop, built, water, other, nodata,
            sample_px, radius_km, db_id,
        ))
    with get_db_cursor() as cur:
        cur.executemany(sql, clean_params)
    return len(clean_params)


# =============================================================================
# CORE ENRICHMENT LOGIC
# =============================================================================

def _enrich_records(
    records: List[Tuple[int, float, float]],
    verbose: bool = False,
    radius_km: float = WC_SAMPLE_RADIUS_KM,
) -> Dict[str, int]:
    """
    Enrich a list of (id, lat, lon) records.

    For each event:
      1. Sample exact pixel → worldcover_class_code / worldcover_class_name
      2. Sample area window → wc_*_pct percentages

    Groups records by tile so each COG is opened only once.
    """
    stats = {
        "total": len(records),
        "classified": 0,
        "nodata": 0,
        "invalid_coords": 0,
        "tile_errors": 0,
        "db_updated": 0,
    }
    if not records:
        return stats

    # Group by tile
    tile_groups: Dict[str, List[Tuple[int, int, float, float]]] = defaultdict(list)
    for idx, (event_id, lat, lon) in enumerate(records):
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            stats["invalid_coords"] += 1
            continue
        tile_groups[_tile_name(lon, lat)].append((idx, event_id, lon, lat))

    pending_updates: List[Tuple] = []
    total_tiles = len(tile_groups)

    for tile_idx, (tile, points) in enumerate(tile_groups.items(), 1):
        url = _tile_url(tile)
        if verbose:
            print(f"  Tile {tile_idx}/{total_tiles}: {tile} ({len(points)} pts) ...",
                  end="", flush=True)

        try:
            lons_arr = np.array([p[2] for p in points], dtype=np.float64)
            lats_arr = np.array([p[3] for p in points], dtype=np.float64)

            # --- single-pixel classification ---
            pixel_values = _sample_tile_points(url, lons_arr, lats_arr)

            # --- area percentages — one per point ---
            # Open tile once and batch window reads
            pct_results: List[Dict] = []
            with rasterio.open(url) as src:
                for i, (_, event_id, lon, lat) in enumerate(points):
                    try:
                        pct = _sample_area_percentages_open(src, lat, lon, radius_km)
                    except Exception:
                        pct = _empty_pct_dict()
                    pct_results.append(pct)

            # Assemble updates
            for i, (_, event_id, lon, lat) in enumerate(points):
                pv = int(pixel_values[i])
                if pv == WORLDCOVER_NODATA or pv not in WORLDCOVER_CLASSES:
                    code, name = None, None
                    stats["nodata"] += 1
                else:
                    code = pv
                    name = WORLDCOVER_CLASSES[pv]
                    stats["classified"] += 1

                p = pct_results[i]
                pending_updates.append((
                    code, name,
                    p.get("forest_pct"),    p.get("shrubland_pct"),
                    p.get("grassland_pct"), p.get("cropland_pct"),
                    p.get("builtup_pct"),   p.get("water_pct"),
                    p.get("other_pct"),     p.get("nodata_pct"),
                    p.get("sample_pixels"), radius_km,
                    event_id,
                ))

            if verbose:
                print("OK")

        except (RasterioIOError, Exception) as exc:
            if verbose:
                print(f"SKIP ({type(exc).__name__}: {str(exc)[:60]})")
            for _, event_id, _, _ in points:
                pending_updates.append((
                    None, None,
                    None, None, None, None, None, None, None, None,
                    None, radius_km, event_id,
                ))
                stats["tile_errors"] += 1

        if len(pending_updates) >= DB_BATCH_SIZE:
            stats["db_updated"] += _update_worldcover_batch(pending_updates)
            pending_updates = []

    if pending_updates:
        stats["db_updated"] += _update_worldcover_batch(pending_updates)

    return stats


def _sample_area_percentages_open(
    src: "rasterio.DatasetReader",
    lat: float,
    lon: float,
    radius_km: float,
) -> Dict:
    """
    Sample area percentages from an already-open rasterio dataset.
    Used inside _enrich_records to avoid re-opening the tile per point.
    """
    dlat = radius_km * _degrees_per_km_lat()
    dlon = radius_km * _degrees_per_km_lon(lat)
    min_lon, max_lon = lon - dlon, lon + dlon
    min_lat, max_lat = lat - dlat, lat + dlat

    window = from_bounds(
        left=min_lon, bottom=min_lat,
        right=max_lon, top=max_lat,
        transform=src.transform,
    )
    window = window.intersection(
        rasterio.windows.Window(0, 0, src.width, src.height)
    )
    if window.width <= 0 or window.height <= 0:
        return _empty_pct_dict()

    data = src.read(1, window=window, masked=True)
    flat = data.filled(0).flatten()
    total_px = len(flat)
    if total_px == 0:
        return _empty_pct_dict()

    unique, ucounts = np.unique(flat, return_counts=True)
    counts = {int(pv): int(cnt) for pv, cnt in zip(unique, ucounts)}

    nodata_px = counts.get(0, 0)

    def pct(px: int) -> float:
        return round(px / total_px * 100.0, 4)

    grouped = {g: 0 for g in _PCT_GROUPS}
    other_px = 0
    for pv, cnt in counts.items():
        if pv == 0:
            continue
        placed = False
        for group, codes in _PCT_GROUPS.items():
            if pv in codes:
                grouped[group] += cnt
                placed = True
                break
        if not placed:
            other_px += cnt

    return {
        "forest_pct":    pct(grouped["forest"]),
        "shrubland_pct": pct(grouped["shrubland"]),
        "grassland_pct": pct(grouped["grassland"]),
        "cropland_pct":  pct(grouped["cropland"]),
        "builtup_pct":   pct(grouped["builtup"]),
        "water_pct":     pct(grouped["water"]),
        "other_pct":     pct(other_px),
        "nodata_pct":    pct(nodata_px),
        "sample_pixels": total_px,
    }


# =============================================================================
# PUBLIC ENTRY POINTS
# =============================================================================

def run_enrich(force: bool = False, batch_size: int = 5000) -> None:
    """Full WorldCover enrichment (single-pixel + area percentages)."""
    import time as _time
    t0 = _time.time()

    with get_db_cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM thermal_events;")
        total_events = cur.fetchone()[0]

    unenriched = _count_unenriched()
    to_process = total_events if force else unenriched

    logger.info(
        "WorldCover enrich start: total=%d enriched=%d pending=%d radius_km=%.2f",
        total_events, total_events - unenriched, unenriched, WC_SAMPLE_RADIUS_KM,
    )

    if to_process == 0:
        logger.info("WorldCover: nothing to do")
        return

    grand = {"total": 0, "classified": 0, "nodata": 0,
             "invalid_coords": 0, "tile_errors": 0, "db_updated": 0}
    processed_so_far = 0

    while True:
        records = _fetch_firms_records(limit=batch_size, unenriched_only=not force)
        if not records:
            break

        batch_stats = _enrich_records(records, verbose=False, radius_km=WC_SAMPLE_RADIUS_KM)
        for k in grand:
            grand[k] += batch_stats[k]
        processed_so_far += len(records)

        logger.info(
            "WorldCover batch: records=%d classified=%d nodata=%d errors=%d updated=%d",
            len(records), batch_stats["classified"], batch_stats["nodata"],
            batch_stats["tile_errors"], batch_stats["db_updated"],
        )

        if len(records) < batch_size:
            break

    elapsed = _time.time() - t0
    logger.info(
        "WorldCover enrich done: total=%d classified=%d nodata=%d "
        "tile_errors=%d db_updated=%d elapsed=%.1fs",
        grand["total"], grand["classified"], grand["nodata"],
        grand["tile_errors"], grand["db_updated"], elapsed,
    )


def run_test(limit: int = DEFAULT_TEST_LIMIT) -> None:
    """Test WorldCover enrichment on a small number of events (read-only)."""
    records = _fetch_firms_records(limit=limit, unenriched_only=False)
    if not records:
        print("No records found in thermal_events.")
        return

    print(f"\nWorldCover TEST — {limit} records, radius={WC_SAMPLE_RADIUS_KM} km")
    print("=" * 60)

    tile_groups: Dict[str, List] = defaultdict(list)
    for event_id, lat, lon in records:
        tile_groups[_tile_name(lon, lat)].append((event_id, lat, lon))

    for tile, points in tile_groups.items():
        url = _tile_url(tile)
        lons_arr = np.array([p[2] for p in points], dtype=np.float64)
        lats_arr = np.array([p[1] for p in points], dtype=np.float64)
        try:
            pixel_values = _sample_tile_points(url, lons_arr, lats_arr)
            with rasterio.open(url) as src:
                for i, (event_id, lat, lon) in enumerate(points):
                    pv = int(pixel_values[i])
                    pct = _sample_area_percentages_open(src, lat, lon, WC_SAMPLE_RADIUS_KM)
                    print(f"\nEvent {event_id}  lat={lat} lon={lon}")
                    print(f"  Single-pixel: code={pv} class={WORLDCOVER_CLASSES.get(pv, 'NoData')}")
                    print(f"  Area pcts (radius={WC_SAMPLE_RADIUS_KM}km, px={pct['sample_pixels']}):")
                    for k in ("forest_pct","shrubland_pct","grassland_pct",
                              "cropland_pct","builtup_pct","water_pct",
                              "other_pct","nodata_pct"):
                        v = pct.get(k)
                        if v is not None and v > 0:
                            print(f"    {k}: {v:.2f}%")
        except Exception as exc:
            print(f"  Tile {tile} error: {exc}")

    print("\nNOTE: test mode does NOT write to the database.")


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="ThermalWatch WorldCover enrichment")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--test",   action="store_true")
    g.add_argument("--enrich", action="store_true")
    parser.add_argument("--limit",      type=int, default=DEFAULT_TEST_LIMIT)
    parser.add_argument("--force",      action="store_true")
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()
    if args.test:
        run_test(limit=args.limit)
    else:
        run_enrich(force=args.force, batch_size=args.batch_size)
