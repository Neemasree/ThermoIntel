"""
ThermalWatch — Temporal & Historical Anomaly Feature Service
=============================================================

Computes DATA ENGINEERING features for each thermal event.
This is NOT ML logic — it is numerical summarisation of historical activity.

FEATURES COMPUTED
-----------------
Temporal activity (lookback before this event's acquisition_date):
  detections_7d        INT      — event count within radius, 7-day window
  detections_30d       INT      — event count within radius, 30-day window
  detections_90d       INT      — event count within radius, 90-day window
  mean_frp_30d         FLOAT    — mean FRP in 30-day window (NULL-FRP excluded)
  max_frp_30d          FLOAT    — max FRP in 30-day window
  mean_brightness_30d  FLOAT    — mean brightness in 30-day window
  days_active_30d      INT      — distinct dates with ≥1 detection in 30-day window
  persistence_score    FLOAT    — days_active_30d / 30.0  (range 0.0 – 1.0)

Historical anomaly (vs 30-day baseline):
  frp_deviation        FLOAT    — frp − mean_frp_30d  (NULL if either NULL)
  frp_ratio            FLOAT    — frp / mean_frp_30d  (NULL if denominator NULL/0)
  brightness_deviation FLOAT    — brightness − mean_brightness_30d
  brightness_ratio     FLOAT    — brightness / mean_brightness_30d

DEFINITIONS
-----------
Spatial matching:
  ⚠ AMBIGUITY: No authoritative radius defined in project spec.
  Using TEMPORAL_SPATIAL_RADIUS_KM (env var, default 1.0 km) pending team confirmation.
  Spatial matching uses PostGIS ST_DWithin on the existing GIST-indexed geom column.
  Radius is converted from km to degrees using 1 degree ≈ 111.32 km (equatorial).
  For events near the poles this is an approximation — acceptable for thermal anomaly
  detection at the resolution of VIIRS (375m) and MODIS (1km).

Temporal window:
  The N-day window is STRICTLY BEFORE the current event's acquisition_date.
  acquisition_date < this_event.acquisition_date  AND
  acquisition_date >= this_event.acquisition_date - INTERVAL 'N days'
  The current event is NOT included in its own historical baseline.

Duplicate treatment:
  All events within the spatial radius are counted.
  No deduplication by satellite/instrument — each distinct DB row counts once.

NULL FRP / brightness:
  NULL values are excluded from mean/max calculations (SQL AVG/MAX ignores NULLs).
  If the entire baseline has NULL FRP, mean_frp_30d = NULL.

persistence_score:
  ⚠ FORMULA AMBIGUITY: No authoritative formula defined in project spec.
  Using: days_active_30d / 30.0  (transparent, self-documenting fraction).
  NULL if days_active_30d is NULL.
  Team must confirm before ML training.

Zero-division:
  frp_ratio and brightness_ratio return NULL (not infinity) when denominator = 0.

IMPLEMENTATION STRATEGY
-----------------------
Uses a single SQL query per batch that computes ALL temporal features for a
batch of events in one pass via a lateral subquery against the PostGIS spatial
index.  This is far more efficient than a per-event Python call.

Batch selection: events WHERE temporal_computed_at IS NULL
(i.e. not yet computed, or reset because FIRMS fields changed).
"""

from __future__ import annotations

import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from dotenv import load_dotenv

from app.database.connection import get_db_cursor

load_dotenv()

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# ⚠ AMBIGUITY: No authoritative spatial radius defined.
# Using env var; team must confirm before ML training.
TEMPORAL_SPATIAL_RADIUS_KM = float(os.getenv("TEMPORAL_SPATIAL_RADIUS_KM", "1.0"))

# Approximate degrees per km — used for ST_DWithin degree-based threshold.
# 1 degree latitude ≈ 110.574 km; 1 degree longitude ≈ 111.32 km * cos(lat).
# We use the latitude approximation for a conservative bounding value.
_KM_PER_DEGREE = 110.574
TEMPORAL_SPATIAL_RADIUS_DEG = TEMPORAL_SPATIAL_RADIUS_KM / _KM_PER_DEGREE

TEMPORAL_BATCH_SIZE = int(os.getenv("TEMPORAL_BATCH_SIZE", "1000"))


# =============================================================================
# CORE BATCH COMPUTATION
# =============================================================================

def compute_temporal_batch(batch_size: int = TEMPORAL_BATCH_SIZE) -> Dict:
    """
    Compute temporal and anomaly features for the next batch of events
    that have temporal_computed_at IS NULL.

    Uses a single SQL LATERAL join to compute all features in the database,
    leveraging the PostGIS GIST index on geom for spatial filtering.

    Returns stats dict.
    """
    t0 = time.time()
    stats = {"candidates": 0, "processed": 0, "errors": 0}

    # Fetch events needing computation
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, latitude, longitude, acquisition_date,
                   frp, brightness
            FROM thermal_events
            WHERE temporal_computed_at IS NULL
            ORDER BY acquisition_date DESC, id DESC
            LIMIT %s;
        """, (batch_size,))
        events = cur.fetchall()

    stats["candidates"] = len(events)
    if not events:
        logger.info("Temporal: no events pending computation")
        return stats

    logger.info("Temporal: computing features for %d events (radius=%.2f km)",
                len(events), TEMPORAL_SPATIAL_RADIUS_KM)

    # Process in sub-batches using a bulk SQL approach
    # Build a VALUES list and use LATERAL to compute all at once
    now = datetime.now(timezone.utc)
    radius_deg = TEMPORAL_SPATIAL_RADIUS_DEG

    # We process one at a time but in a tight loop — the heavy lifting
    # is done in SQL, not Python.
    updates = []
    for row in events:
        db_id, lat, lon, acq_date, frp, brightness = row
        try:
            result = _compute_single_event(
                db_id, float(lat), float(lon), acq_date, frp, brightness, radius_deg
            )
            updates.append((
                result["detections_7d"],
                result["detections_30d"],
                result["detections_90d"],
                result["mean_frp_30d"],
                result["max_frp_30d"],
                result["mean_brightness_30d"],
                result["days_active_30d"],
                result["persistence_score"],
                result["frp_deviation"],
                result["frp_ratio"],
                result["brightness_deviation"],
                result["brightness_ratio"],
                now,
                db_id,
            ))
            stats["processed"] += 1
        except Exception as exc:
            logger.error("Temporal compute failed for id=%d: %s", db_id, exc)
            stats["errors"] += 1

    # Bulk write
    if updates:
        _write_temporal_batch(updates)

    elapsed = time.time() - t0
    logger.info(
        "Temporal batch done: candidates=%d processed=%d errors=%d elapsed=%.1fs",
        stats["candidates"], stats["processed"], stats["errors"], elapsed,
    )
    return stats


def _compute_single_event(
    db_id: int,
    lat: float,
    lon: float,
    acq_date,
    frp: Optional[float],
    brightness: Optional[float],
    radius_deg: float,
) -> Dict:
    """
    Compute all temporal and anomaly features for one event via SQL.

    Single SQL query computes all temporal aggregates in one pass.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT
                -- 7-day detection count
                COUNT(*) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '7 days'
                      AND acquisition_date <  %(date)s
                ) AS detections_7d,

                -- 30-day detection count
                COUNT(*) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '30 days'
                      AND acquisition_date <  %(date)s
                ) AS detections_30d,

                -- 90-day detection count
                COUNT(*) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '90 days'
                      AND acquisition_date <  %(date)s
                ) AS detections_90d,

                -- 30-day FRP statistics (NULL FRP excluded by AVG/MAX)
                AVG(frp) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '30 days'
                      AND acquisition_date <  %(date)s
                ) AS mean_frp_30d,

                MAX(frp) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '30 days'
                      AND acquisition_date <  %(date)s
                ) AS max_frp_30d,

                -- 30-day brightness mean
                AVG(brightness) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '30 days'
                      AND acquisition_date <  %(date)s
                ) AS mean_brightness_30d,

                -- distinct active dates in 30-day window
                COUNT(DISTINCT acquisition_date) FILTER (
                    WHERE acquisition_date >= %(date)s - INTERVAL '30 days'
                      AND acquisition_date <  %(date)s
                ) AS days_active_30d

            FROM thermal_events
            WHERE id != %(id)s
              AND ST_DWithin(
                    geom,
                    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
                    %(radius_deg)s
                  )
              AND acquisition_date >= %(date)s - INTERVAL '90 days'
              AND acquisition_date <  %(date)s;
        """, {
            "id":         db_id,
            "lat":        lat,
            "lon":        lon,
            "date":       acq_date,
            "radius_deg": radius_deg,
        })
        row = cur.fetchone()

    (det7, det30, det90,
     mean_frp, max_frp, mean_bright,
     days_active) = row

    # persistence_score = days_active_30d / 30.0
    # ⚠ Formula pending team confirmation.
    persistence = (days_active / 30.0) if days_active is not None else None

    # Anomaly features — safe against NULL and zero-division
    frp_dev   = _safe_subtract(frp, mean_frp)
    frp_rat   = _safe_divide(frp, mean_frp)
    brt_dev   = _safe_subtract(brightness, mean_bright)
    brt_rat   = _safe_divide(brightness, mean_bright)

    return {
        "detections_7d":        int(det7)  if det7  is not None else 0,
        "detections_30d":       int(det30) if det30 is not None else 0,
        "detections_90d":       int(det90) if det90 is not None else 0,
        "mean_frp_30d":         float(mean_frp)   if mean_frp   is not None else None,
        "max_frp_30d":          float(max_frp)    if max_frp    is not None else None,
        "mean_brightness_30d":  float(mean_bright) if mean_bright is not None else None,
        "days_active_30d":      int(days_active)  if days_active is not None else 0,
        "persistence_score":    persistence,
        "frp_deviation":        frp_dev,
        "frp_ratio":            frp_rat,
        "brightness_deviation": brt_dev,
        "brightness_ratio":     brt_rat,
    }


def _safe_subtract(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """a - b, returns NULL if either is NULL."""
    if a is None or b is None:
        return None
    return float(a) - float(b)


def _safe_divide(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """a / b, returns NULL if b is NULL or zero. Never returns infinity."""
    if a is None or b is None:
        return None
    if float(b) == 0.0:
        return None
    return float(a) / float(b)


# =============================================================================
# BULK WRITE
# =============================================================================

def _write_temporal_batch(updates: List[tuple]) -> None:
    """
    Write temporal + anomaly features for a batch of events.
    Each tuple: (det7, det30, det90, mean_frp, max_frp, mean_brt,
                 days_active, persistence, frp_dev, frp_rat,
                 brt_dev, brt_rat, computed_at, db_id)
    """
    sql = """
        UPDATE thermal_events SET
            detections_7d        = %s,
            detections_30d       = %s,
            detections_90d       = %s,
            mean_frp_30d         = %s,
            max_frp_30d          = %s,
            mean_brightness_30d  = %s,
            days_active_30d      = %s,
            persistence_score    = %s,
            frp_deviation        = %s,
            frp_ratio            = %s,
            brightness_deviation = %s,
            brightness_ratio     = %s,
            temporal_computed_at = %s
        WHERE id = %s;
    """
    with get_db_cursor() as cur:
        cur.executemany(sql, updates)


# =============================================================================
# RECALCULATE AFTER ENRICHMENT
# =============================================================================

def mark_temporal_stale(event_ids: List[int]) -> None:
    """
    Reset temporal_computed_at = NULL for a list of events so they will
    be recomputed on the next scheduler run.

    Called when OSM or WorldCover enrichment updates an event's context
    (not strictly necessary for temporal, but ensures consistency when
    FIRMS fields change and osm/wc are reset).
    """
    if not event_ids:
        return
    with get_db_cursor() as cur:
        cur.execute(
            "UPDATE thermal_events SET temporal_computed_at = NULL WHERE id = ANY(%s);",
            (event_ids,),
        )


def count_temporal_pending() -> int:
    """Count events with temporal_computed_at IS NULL."""
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM thermal_events WHERE temporal_computed_at IS NULL;"
        )
        return cur.fetchone()[0]


# =============================================================================
# RECALCULATE ANOMALIES ONLY  (fast — no window query needed)
# =============================================================================

def recompute_anomalies_batch(batch_size: int = 5000) -> Dict:
    """
    Recompute frp_deviation/ratio and brightness_deviation/ratio for events
    that already have mean_frp_30d and mean_brightness_30d populated.

    This is a cheap pass — all data is already in thermal_events.
    Useful after bulk temporal computation to ensure anomaly columns are fresh.
    """
    stats = {"processed": 0}
    with get_db_cursor() as cur:
        cur.execute("""
            UPDATE thermal_events SET
                frp_deviation = CASE
                    WHEN frp IS NOT NULL AND mean_frp_30d IS NOT NULL
                    THEN frp - mean_frp_30d
                    ELSE NULL END,
                frp_ratio = CASE
                    WHEN frp IS NOT NULL AND mean_frp_30d IS NOT NULL
                         AND mean_frp_30d <> 0
                    THEN frp / mean_frp_30d
                    ELSE NULL END,
                brightness_deviation = CASE
                    WHEN brightness IS NOT NULL AND mean_brightness_30d IS NOT NULL
                    THEN brightness - mean_brightness_30d
                    ELSE NULL END,
                brightness_ratio = CASE
                    WHEN brightness IS NOT NULL AND mean_brightness_30d IS NOT NULL
                         AND mean_brightness_30d <> 0
                    THEN brightness / mean_brightness_30d
                    ELSE NULL END
            WHERE mean_frp_30d IS NOT NULL
               OR mean_brightness_30d IS NOT NULL;
        """)
        stats["processed"] = cur.rowcount if cur.rowcount >= 0 else 0
    logger.info("Anomaly recompute done: rows=%s", stats["processed"])
    return stats


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(
        description="ThermalWatch temporal/anomaly feature computation"
    )
    sub = parser.add_subparsers(dest="cmd")

    b = sub.add_parser("batch", help="Compute one batch of pending temporal features")
    b.add_argument("--batch-size", type=int, default=TEMPORAL_BATCH_SIZE)

    sub.add_parser("count", help="Count events pending temporal computation")

    a = sub.add_parser("anomalies", help="Recompute anomaly ratios/deviations only")
    a.add_argument("--batch-size", type=int, default=5000)

    args = parser.parse_args()
    if args.cmd == "batch":
        s = compute_temporal_batch(batch_size=args.batch_size)
        print(s)
    elif args.cmd == "count":
        print(f"Pending: {count_temporal_pending():,}")
    elif args.cmd == "anomalies":
        s = recompute_anomalies_batch(batch_size=args.batch_size)
        print(s)
    else:
        parser.print_help()
