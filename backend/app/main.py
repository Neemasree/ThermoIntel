"""
ThermalWatch — FastAPI Application
====================================

Endpoints:
  GET /                         — root / health ping
  GET /health                   — health + DB row count
  GET /pipeline-status          — scheduler + enrichment status
  GET /statistics               — aggregate event statistics
  GET /events                   — paginated + filtered event list
  GET /latest-events            — most recent N events (polling)
  GET /events/{id}              — single event by database id
  GET /feature-completeness     — per-column feature fill rates  [NEW]
  GET /events/{id}/features     — ML-ready feature row for one event [NEW]
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import get_db_cursor

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)


# =============================================================================
# LIFESPAN — MIGRATIONS + SCHEDULER
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Phase 2 migrations (idempotent — safe every startup)
    try:
        from app.database.migrations_phase2 import migrate_phase2
        migrate_phase2()
    except Exception as exc:
        logger.error("Phase 2 migration failed (non-fatal): %s", exc)

    from app.services.pipeline_worker import start_scheduler, stop_scheduler
    started = start_scheduler()
    logger.info("Pipeline worker %s", "started" if started else "skipped (lock held)")
    yield
    stop_scheduler()
    logger.info("Pipeline worker stopped")


# =============================================================================
# APP
# =============================================================================

app = FastAPI(
    title="ThermalWatch",
    version="2.0.0",
    description="Global thermal anomaly monitoring — ML-ready pipeline.",
    lifespan=lifespan,
)

_CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# =============================================================================
# SERIALISATION — existing event row
# =============================================================================

def _row_to_event(row: tuple) -> Dict[str, Any]:
    (
        db_id, event_id, lat, lon,
        frp, brightness, confidence,
        acq_date, acq_time, satellite, instrument, daynight,
        firms_source, version,
        wc_code, wc_name, wc_ver, wc_at, wc_status,
        d_ind, d_ref, d_pow, d_mine, d_gas, d_road,
        n_ind, n_ref, n_pow, n_mine, n_gas,
        osm_status, osm_at, osm_ver,
        synced_at, created_at, last_error,
    ) = row

    return {
        "id":            db_id,
        "event_id":      event_id,
        "latitude":      float(lat),
        "longitude":     float(lon),
        "frp":           float(frp)        if frp        is not None else None,
        "brightness":    float(brightness) if brightness is not None else None,
        "confidence":    confidence,
        "acquisition_date": str(acq_date) if acq_date else None,
        "acquisition_time": acq_time,
        "satellite":     satellite,
        "instrument":    instrument,
        "daynight":      daynight,
        "firms_source":  firms_source,
        "version":       version,
        # WorldCover
        "worldcover_class_code":          wc_code,
        "worldcover_class_name":          wc_name,
        "worldcover_version":             wc_ver,
        "worldcover_enriched_at":         wc_at.isoformat() if wc_at else None,
        "worldcover_enrichment_status":   wc_status,
        # OSM
        "distance_to_industrial":         d_ind,
        "distance_to_refinery":           d_ref,
        "distance_to_powerplant":         d_pow,
        "distance_to_mine":               d_mine,
        "distance_to_gas_facility":       d_gas,
        "distance_to_road":               d_road,
        "near_industrial_facility":       n_ind,
        "near_refinery":                  n_ref,
        "near_powerplant":                n_pow,
        "near_mine":                      n_mine,
        "near_gas_facility":              n_gas,
        "osm_enrichment_status":          osm_status,
        "osm_enriched_at":                osm_at.isoformat() if osm_at else None,
        "osm_source_version":             osm_ver,
        # operational
        "firms_synced_at": synced_at.isoformat() if synced_at else None,
        "created_at":      created_at.isoformat() if created_at else None,
        "last_error":      last_error,
    }


_EVENT_SELECT = """
    SELECT
        id, event_id, latitude, longitude,
        frp, brightness, confidence,
        acquisition_date, acquisition_time, satellite, instrument, daynight,
        firms_source, version,
        worldcover_class_code, worldcover_class_name, worldcover_version,
        worldcover_enriched_at, worldcover_enrichment_status,
        distance_to_industrial, distance_to_refinery, distance_to_powerplant,
        distance_to_mine, distance_to_gas_facility, distance_to_road,
        near_industrial_facility, near_refinery, near_powerplant,
        near_mine, near_gas_facility,
        osm_enrichment_status, osm_enriched_at, osm_source_version,
        firms_synced_at, created_at, last_error
    FROM thermal_events
"""


# =============================================================================
# EXISTING ENDPOINTS (unchanged)
# =============================================================================

@app.get("/")
def root() -> dict:
    return {"message": "ThermalWatch API is running.", "version": "2.0.0"}


@app.get("/health")
def health_check() -> dict:
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM thermal_events")
            count = cursor.fetchone()[0]
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {str(exc)[:120]}"
        count = None
    return {
        "status":        "ok",
        "service":       "thermalwatch-backend",
        "database":      db_status,
        "total_events":  count,
    }


@app.get("/pipeline-status")
def pipeline_status() -> dict:
    from app.services.pipeline_worker import get_scheduler_status
    try:
        with get_db_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM thermal_events")
            total = cur.fetchone()[0]

            cur.execute("SELECT MAX(acquisition_date) FROM thermal_events")
            latest_date = cur.fetchone()[0]

            cur.execute("SELECT MAX(firms_synced_at) FROM thermal_events")
            latest_synced = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM thermal_events "
                "WHERE created_at >= NOW() - INTERVAL '24 hours'"
            )
            new_24h = cur.fetchone()[0]

            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE worldcover_enrichment_status='enriched'),
                    COUNT(*) FILTER (WHERE worldcover_enrichment_status='nodata'),
                    COUNT(*) FILTER (WHERE worldcover_enrichment_status='pending'
                                      OR  worldcover_enrichment_status IS NULL)
                FROM thermal_events
            """)
            wc = cur.fetchone()

            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE osm_enrichment_status='enriched'),
                    COUNT(*) FILTER (WHERE osm_enrichment_status='pending'
                                      OR  osm_enrichment_status IS NULL),
                    COUNT(*) FILTER (WHERE osm_enrichment_status='error')
                FROM thermal_events
            """)
            osm = cur.fetchone()

            cur.execute("""
                SELECT source, last_attempt, last_success,
                       last_fetched, last_inserted, last_updated,
                       last_unchanged, last_error, worker_status
                FROM pipeline_status ORDER BY source
            """)
            sources = [
                {
                    "source":        r[0],
                    "last_attempt":  r[1].isoformat() if r[1] else None,
                    "last_success":  r[2].isoformat() if r[2] else None,
                    "last_fetched":  r[3],
                    "last_inserted": r[4],
                    "last_updated":  r[5],
                    "last_unchanged":r[6],
                    "last_error":    r[7],
                    "worker_status": r[8],
                }
                for r in cur.fetchall()
            ]

        return {
            "status":    "ok",
            "scheduler": get_scheduler_status(),
            "firms": {
                "total_records":           total,
                "latest_acquisition_date": str(latest_date) if latest_date else None,
                "latest_synced_at":        latest_synced.isoformat() if latest_synced else None,
                "new_records_24h":         new_24h,
                "sources":                 sources,
            },
            "worldcover": {
                "enriched": wc[0],
                "nodata":   wc[1],
                "pending":  wc[2],
                "version":  "v200",
            },
            "osm": {
                "enriched": osm[0],
                "pending":  osm[1],
                "errors":   osm[2],
            },
        }
    except Exception as exc:
        logger.error("pipeline-status error: %s", exc)
        return {"status": "error", "error": str(exc)[:200]}


@app.get("/statistics")
def statistics() -> dict:
    try:
        with get_db_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM thermal_events")
            total = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM thermal_events "
                "WHERE acquisition_date = CURRENT_DATE"
            )
            today = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM thermal_events "
                "WHERE acquisition_date >= CURRENT_DATE - INTERVAL '7 days'"
            )
            last_7d = cur.fetchone()[0]

            cur.execute(
                "SELECT ROUND(AVG(frp)::numeric,2), MAX(frp) "
                "FROM thermal_events WHERE frp IS NOT NULL"
            )
            frp_row = cur.fetchone()

            cur.execute(
                "SELECT ROUND(AVG(brightness)::numeric,2) "
                "FROM thermal_events WHERE brightness IS NOT NULL"
            )
            avg_bright = cur.fetchone()[0]

            cur.execute(
                "SELECT satellite, COUNT(*) FROM thermal_events "
                "GROUP BY satellite ORDER BY COUNT(*) DESC"
            )
            by_satellite = {r[0]: r[1] for r in cur.fetchall()}

            cur.execute(
                "SELECT firms_source, COUNT(*) FROM thermal_events "
                "GROUP BY firms_source ORDER BY COUNT(*) DESC"
            )
            by_source = {r[0]: r[1] for r in cur.fetchall()}

            cur.execute(
                "SELECT daynight, COUNT(*) FROM thermal_events "
                "WHERE daynight IS NOT NULL GROUP BY daynight"
            )
            by_daynight = {r[0]: r[1] for r in cur.fetchall()}

            cur.execute(
                "SELECT worldcover_class_name, COUNT(*) FROM thermal_events "
                "WHERE worldcover_class_name IS NOT NULL "
                "GROUP BY worldcover_class_name ORDER BY COUNT(*) DESC"
            )
            by_landcover = {r[0]: r[1] for r in cur.fetchall()}

            cur.execute("SELECT MAX(created_at) FROM thermal_events")
            last_sync = cur.fetchone()[0]

        return {
            "total_detections":   total,
            "detections_today":   today,
            "detections_last_7d": last_7d,
            "avg_frp":            float(frp_row[0]) if frp_row[0] else None,
            "max_frp":            float(frp_row[1]) if frp_row[1] else None,
            "avg_brightness":     float(avg_bright) if avg_bright else None,
            "by_satellite":       by_satellite,
            "by_source":          by_source,
            "by_daynight":        by_daynight,
            "by_landcover":       by_landcover,
            "last_sync_at":       last_sync.isoformat() if last_sync else None,
        }
    except Exception as exc:
        logger.error("statistics error: %s", exc)
        return {"error": str(exc)[:200]}


@app.get("/events")
def get_events(
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    date_from: Optional[str] = Query(default=None),
    date_to:   Optional[str] = Query(default=None),
    satellite: Optional[str] = Query(default=None),
    daynight:  Optional[str] = Query(default=None),
    min_frp:   Optional[float] = Query(default=None),
    firms_source: Optional[str] = Query(default=None),
    worldcover_class_code: Optional[int] = Query(default=None),
    osm_status: Optional[str] = Query(default=None),
    lat_min: Optional[float] = Query(default=None),
    lat_max: Optional[float] = Query(default=None),
    lon_min: Optional[float] = Query(default=None),
    lon_max: Optional[float] = Query(default=None),
) -> dict:
    try:
        conditions: List[str] = []
        params: List[Any]    = []

        if date_from:
            conditions.append("acquisition_date >= %s"); params.append(date_from)
        if date_to:
            conditions.append("acquisition_date <= %s"); params.append(date_to)
        if satellite:
            conditions.append("satellite = %s"); params.append(satellite)
        if daynight:
            conditions.append("daynight = %s"); params.append(daynight.upper())
        if min_frp is not None:
            conditions.append("frp >= %s"); params.append(min_frp)
        if firms_source:
            conditions.append("firms_source = %s"); params.append(firms_source)
        if worldcover_class_code is not None:
            conditions.append("worldcover_class_code = %s")
            params.append(worldcover_class_code)
        if osm_status:
            conditions.append("osm_enrichment_status = %s"); params.append(osm_status)
        if lat_min is not None:
            conditions.append("latitude >= %s"); params.append(lat_min)
        if lat_max is not None:
            conditions.append("latitude <= %s"); params.append(lat_max)
        if lon_min is not None:
            conditions.append("longitude >= %s"); params.append(lon_min)
        if lon_max is not None:
            conditions.append("longitude <= %s"); params.append(lon_max)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        with get_db_cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM thermal_events {where}", params)
            total = cur.fetchone()[0]

            cur.execute(
                f"{_EVENT_SELECT} {where} "
                "ORDER BY acquisition_date DESC, acquisition_time DESC "
                "LIMIT %s OFFSET %s",
                params + [limit, offset],
            )
            rows = cur.fetchall()

        return {
            "total":  total,
            "limit":  limit,
            "offset": offset,
            "events": [_row_to_event(r) for r in rows],
        }
    except Exception as exc:
        logger.error("GET /events error: %s", exc)
        return {"error": str(exc)[:200], "total": 0, "events": []}


@app.get("/latest-events")
def get_latest_events(
    limit: int = Query(default=200, ge=1, le=500)
) -> dict:
    try:
        with get_db_cursor() as cur:
            cur.execute(
                f"{_EVENT_SELECT} ORDER BY created_at DESC, id DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
        return {"count": len(rows), "events": [_row_to_event(r) for r in rows]}
    except Exception as exc:
        logger.error("GET /latest-events error: %s", exc)
        return {"error": str(exc)[:200], "events": []}


@app.get("/events/{event_db_id}")
def get_event_by_id(event_db_id: int) -> dict:
    try:
        with get_db_cursor() as cur:
            cur.execute(f"{_EVENT_SELECT} WHERE id = %s", (event_db_id,))
            row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Event {event_db_id} not found")
        return _row_to_event(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GET /events/%d error: %s", event_db_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


# =============================================================================
# NEW ENDPOINT — /feature-completeness
# =============================================================================

@app.get("/feature-completeness")
def feature_completeness() -> dict:
    """
    Returns per-column fill rates for every ML-relevant feature.

    Response shape:
      {
        "total_events": N,
        "features": {
          "column_name": {
            "populated": N,
            "null": N,
            "pct": 0.0–100.0
          }, ...
        },
        "summary": {
          "osm_enriched": N, "osm_pending": N, "osm_error": N,
          "wc_enriched": N, "wc_pending": N,
          "temporal_computed": N, "temporal_pending": N,
          "fully_ml_ready": N   ← rows with all core features non-NULL
        }
      }

    "fully_ml_ready" = events where OSM + WorldCover + temporal are all populated.
    This is the count the ML teammate can use for training.
    """
    try:
        with get_db_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM thermal_events")
            total = cur.fetchone()[0]

            if total == 0:
                return {"total_events": 0, "features": {}, "summary": {}}

            # Feature columns to check
            feature_cols = [
                # Thermal (always present if FIRMS ingested correctly)
                "frp", "brightness", "confidence", "daynight", "scan", "track",
                # OSM spatial
                "distance_to_industrial", "distance_to_refinery",
                "distance_to_powerplant", "distance_to_mine",
                "distance_to_gas_facility", "distance_to_road",
                # OSM flags
                "near_industrial_facility", "near_refinery", "near_powerplant",
                "near_mine", "near_gas_facility",
                # WorldCover percentages
                "wc_forest_pct", "wc_shrubland_pct", "wc_grassland_pct",
                "wc_cropland_pct", "wc_builtup_pct", "wc_water_pct",
                "wc_other_pct", "wc_nodata_pct",
                # Temporal
                "detections_7d", "detections_30d", "detections_90d",
                "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
                "days_active_30d", "persistence_score",
                # Anomaly
                "frp_deviation", "frp_ratio",
                "brightness_deviation", "brightness_ratio",
            ]

            # Build one query counting non-NULL per column
            selects = ", ".join(
                f"COUNT({c}) AS {c}" for c in feature_cols
            )
            cur.execute(f"SELECT {selects} FROM thermal_events")
            counts_row = cur.fetchone()
            populated = dict(zip(feature_cols, counts_row))

            features: Dict[str, Any] = {}
            for col in feature_cols:
                pop = populated[col]
                null_count = total - pop
                features[col] = {
                    "populated": pop,
                    "null":      null_count,
                    "pct":       round(pop / total * 100.0, 2),
                }

            # Summary counts
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE osm_enrichment_status='enriched'),
                    COUNT(*) FILTER (WHERE osm_enrichment_status='pending'
                                      OR  osm_enrichment_status IS NULL),
                    COUNT(*) FILTER (WHERE osm_enrichment_status='error'),
                    COUNT(*) FILTER (WHERE worldcover_version IS NOT NULL),
                    COUNT(*) FILTER (WHERE worldcover_version IS NULL),
                    COUNT(*) FILTER (WHERE temporal_computed_at IS NOT NULL),
                    COUNT(*) FILTER (WHERE temporal_computed_at IS NULL)
                FROM thermal_events
            """)
            s = cur.fetchone()

            # Fully ML-ready: OSM enriched + WC enriched + temporal computed
            # (distance_to_road serves as proxy for OSM enriched)
            cur.execute("""
                SELECT COUNT(*) FROM thermal_events
                WHERE osm_enrichment_status   = 'enriched'
                  AND worldcover_version      IS NOT NULL
                  AND temporal_computed_at    IS NOT NULL
                  AND frp                     IS NOT NULL
                  AND brightness              IS NOT NULL
            """)
            fully_ready = cur.fetchone()[0]

        return {
            "total_events": total,
            "features":     features,
            "summary": {
                "osm_enriched":       s[0],
                "osm_pending":        s[1],
                "osm_error":          s[2],
                "wc_enriched":        s[3],
                "wc_pending":         s[4],
                "temporal_computed":  s[5],
                "temporal_pending":   s[6],
                "fully_ml_ready":     fully_ready,
            },
        }
    except Exception as exc:
        logger.error("feature-completeness error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


# =============================================================================
# NEW ENDPOINT — /events/{id}/predict  (XGBoost inference)
# =============================================================================

_cached_model = None

def _get_model():
    global _cached_model
    if _cached_model is None:
        from app.ml.pipeline import load_model
        _cached_model = load_model()
    return _cached_model


@app.get("/events/{event_db_id}/predict")
def predict_event(event_db_id: int) -> dict:
    """
    Run XGBoost inference for one event using its ML-ready feature row.
    Returns predicted class, confidence, and feature completeness flags.
    """
    import pandas as pd
    from app.ml.features import prepare_features
    from app.ml.labels import INT_TO_LABEL
    import numpy as np

    # Check model exists
    import os
    model_path = os.path.join(os.path.dirname(__file__), "ml", "saved_model.json")
    if not os.path.exists(model_path):
        return {"event_id": None, "prediction": None, "status": "model_not_found"}

    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT
                    event_id,
                    brightness, frp, confidence, daynight, scan, track,
                    distance_to_industrial, distance_to_refinery,
                    distance_to_powerplant, distance_to_mine,
                    distance_to_gas_facility, distance_to_road,
                    near_industrial_facility, near_refinery, near_powerplant,
                    near_mine, near_gas_facility,
                    wc_forest_pct, wc_cropland_pct, wc_grassland_pct,
                    wc_builtup_pct, wc_water_pct,
                    detections_7d, detections_30d, detections_90d,
                    mean_frp_30d, max_frp_30d, mean_brightness_30d,
                    days_active_30d, persistence_score,
                    frp_deviation, frp_ratio, brightness_deviation, brightness_ratio,
                    osm_enrichment_status, worldcover_version, temporal_computed_at
                FROM thermal_events
                WHERE id = %s
            """, (event_db_id,))
            row = cur.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail=f"Event {event_db_id} not found")

        (
            event_id,
            brightness, frp, confidence, daynight, scan, track,
            d_ind, d_ref, d_pow, d_mine, d_gas, d_road,
            n_ind, n_ref, n_pow, n_mine, n_gas,
            wc_forest, wc_crop, wc_grass, wc_built, wc_water,
            det7, det30, det90, mean_frp, max_frp, mean_brt,
            days_active, persistence,
            frp_dev, frp_rat, brt_dev, brt_rat,
            osm_status, wc_version, temporal_at,
        ) = row

        # Build DataFrame with model field names
        record = {
            "brightness":               brightness,
            "frp":                      frp,
            "confidence":               confidence,
            "day_night":                daynight,   # model uses day_night
            "scan":                     scan,
            "track":                    track,
            "distance_to_industrial":   d_ind,
            "distance_to_refinery":     d_ref,
            "distance_to_powerplant":   d_pow,
            "distance_to_mine":         d_mine,
            "distance_to_gas_facility": d_gas,
            "distance_to_road":         d_road,
            "near_industrial_facility": int(n_ind) if n_ind is not None else None,
            "near_refinery":            int(n_ref) if n_ref is not None else None,
            "near_powerplant":          int(n_pow) if n_pow is not None else None,
            "near_mine":                int(n_mine) if n_mine is not None else None,
            "near_gas_facility":        int(n_gas) if n_gas is not None else None,
            "forest_pct":               wc_forest,  # model uses forest_pct
            "cropland_pct":             wc_crop,
            "grassland_pct":            wc_grass,
            "builtup_pct":              wc_built,
            "water_pct":                wc_water,
            "detections_7d":            det7,
            "detections_30d":           det30,
            "detections_90d":           det90,
            "mean_frp_30d":             mean_frp,
            "max_frp_30d":              max_frp,
            "mean_brightness_30d":      mean_brt,
            "days_active_30d":          days_active,
            "persistence_score":        persistence,
            "frp_deviation":            frp_dev,
            "frp_ratio":                frp_rat,
            "brightness_deviation":     brt_dev,
            "brightness_ratio":         brt_rat,
        }

        df = pd.DataFrame([record])
        model = _get_model()
        X = prepare_features(df)
        preds = model.predict(X)
        proba = model.predict_proba(X)
        predicted_class = INT_TO_LABEL[int(preds[0])]
        confidence_score = float(np.max(proba[0]))

        return {
            "event_id": event_id,
            "prediction": {
                "class":      predicted_class,
                "confidence": round(confidence_score, 4),
                "model":      "XGBoost",
            },
            "feature_completeness": {
                "osm_ready":       osm_status == "enriched",
                "temporal_ready":  temporal_at is not None,
                "worldcover_ready": wc_version is not None,
            },
            "status": "ok",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GET /events/%d/predict error: %s", event_db_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


# =============================================================================
# NEW ENDPOINT — /events/{id}/explain  (SHAP explainability)
# =============================================================================

_cached_explainer = None

def _get_explainer():
    global _cached_explainer
    if _cached_explainer is None:
        import shap
        model = _get_model()
        _cached_explainer = shap.TreeExplainer(model)
    return _cached_explainer


@app.get("/events/{event_db_id}/explain")
def explain_event(event_db_id: int) -> dict:
    """
    Return SHAP feature importance values for one event.
    Requires the model to be trained and saved.
    """
    import pandas as pd
    import numpy as np
    from app.ml.features import prepare_features
    from app.ml.labels import INT_TO_LABEL

    model_path = os.path.join(os.path.dirname(__file__), "ml", "saved_model.json")
    if not os.path.exists(model_path):
        return {"event_id": None, "shap_values": None, "status": "model_not_found"}

    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT
                    event_id,
                    brightness, frp, confidence, daynight, scan, track,
                    distance_to_industrial, distance_to_refinery,
                    distance_to_powerplant, distance_to_mine,
                    distance_to_gas_facility, distance_to_road,
                    near_industrial_facility, near_refinery, near_powerplant,
                    near_mine, near_gas_facility,
                    wc_forest_pct, wc_cropland_pct, wc_grassland_pct,
                    wc_builtup_pct, wc_water_pct,
                    detections_7d, detections_30d, detections_90d,
                    mean_frp_30d, max_frp_30d, mean_brightness_30d,
                    days_active_30d, persistence_score,
                    frp_deviation, frp_ratio, brightness_deviation, brightness_ratio
                FROM thermal_events
                WHERE id = %s
            """, (event_db_id,))
            row = cur.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail=f"Event {event_db_id} not found")

        (
            event_id,
            brightness, frp, confidence, daynight, scan, track,
            d_ind, d_ref, d_pow, d_mine, d_gas, d_road,
            n_ind, n_ref, n_pow, n_mine, n_gas,
            wc_forest, wc_crop, wc_grass, wc_built, wc_water,
            det7, det30, det90, mean_frp, max_frp, mean_brt,
            days_active, persistence,
            frp_dev, frp_rat, brt_dev, brt_rat,
        ) = row

        record = {
            "brightness": brightness, "frp": frp, "confidence": confidence,
            "day_night": daynight, "scan": scan, "track": track,
            "distance_to_industrial": d_ind, "distance_to_refinery": d_ref,
            "distance_to_powerplant": d_pow, "distance_to_mine": d_mine,
            "distance_to_gas_facility": d_gas, "distance_to_road": d_road,
            "near_industrial_facility": int(n_ind) if n_ind is not None else None,
            "near_refinery": int(n_ref) if n_ref is not None else None,
            "near_powerplant": int(n_pow) if n_pow is not None else None,
            "near_mine": int(n_mine) if n_mine is not None else None,
            "near_gas_facility": int(n_gas) if n_gas is not None else None,
            "forest_pct": wc_forest, "cropland_pct": wc_crop,
            "grassland_pct": wc_grass, "builtup_pct": wc_built, "water_pct": wc_water,
            "detections_7d": det7, "detections_30d": det30, "detections_90d": det90,
            "mean_frp_30d": mean_frp, "max_frp_30d": max_frp,
            "mean_brightness_30d": mean_brt, "days_active_30d": days_active,
            "persistence_score": persistence,
            "frp_deviation": frp_dev, "frp_ratio": frp_rat,
            "brightness_deviation": brt_dev, "brightness_ratio": brt_rat,
        }

        df = pd.DataFrame([record])
        model = _get_model()
        X = prepare_features(df)
        model_features = model.get_booster().feature_names
        if list(X.columns) != model_features or len(model_features) != 32:
            raise ValueError("Prepared feature contract does not match the model")

        preds = model.predict(X)
        predicted_class_idx = int(preds[0])
        predicted_class = INT_TO_LABEL[predicted_class_idx]

        explainer = _get_explainer()
        shap_vals = np.asarray(explainer.shap_values(X))
        if shap_vals.shape != (len(X), len(model_features), model.n_classes_):
            raise ValueError(f"Unexpected SHAP output shape: {shap_vals.shape}")

        feature_names = list(X.columns)
        class_shap = shap_vals[0, :, predicted_class_idx].tolist()

        contributions = [
            {"feature": name, "shap_value": round(float(val), 6)}
            for name, val in zip(feature_names, class_shap)
        ]
        ranked_contributions = sorted(
            contributions,
            key=lambda x: abs(x["shap_value"]),
            reverse=True,
        )

        return {
            "event_id": event_id,
            "predicted_class": predicted_class,
            "top_features": ranked_contributions[:15],
            "all_features": contributions,
            "status": "ok",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GET /events/%d/explain error: %s", event_db_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


# =============================================================================
# NEW ENDPOINT — /events/{id}/features  (ML-ready feature row)
# =============================================================================

@app.get("/events/{event_db_id}/features")
def get_event_features(event_db_id: int) -> dict:
    """
    Return the complete ML-ready feature row for one event.

    Reads from the ml_features VIEW which includes all feature columns.
    Returns NULL for features not yet computed.

    The ML teammate consumes this endpoint for per-event inference once
    the model is integrated.
    """
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT
                    db_id, event_id, acquisition_date, acquisition_time,
                    latitude, longitude, satellite, instrument, firms_source,
                    -- thermal
                    brightness, frp, confidence, daynight, scan, track,
                    bright_ti4, bright_ti5, bright_t31,
                    -- OSM spatial (km)
                    distance_to_industrial, distance_to_refinery,
                    distance_to_powerplant, distance_to_mine,
                    distance_to_gas_facility, distance_to_road,
                    -- OSM flags
                    near_industrial_facility, near_refinery, near_powerplant,
                    near_mine, near_gas_facility,
                    -- WorldCover pct
                    wc_forest_pct, wc_shrubland_pct, wc_grassland_pct,
                    wc_cropland_pct, wc_builtup_pct, wc_water_pct,
                    wc_other_pct, wc_nodata_pct,
                    wc_sample_pixels, wc_sample_radius_km,
                    -- temporal
                    detections_7d, detections_30d, detections_90d,
                    mean_frp_30d, max_frp_30d, mean_brightness_30d,
                    days_active_30d, persistence_score,
                    -- anomaly
                    frp_deviation, frp_ratio,
                    brightness_deviation, brightness_ratio,
                    -- context
                    worldcover_class_code, worldcover_class_name,
                    worldcover_version,
                    osm_enrichment_status, worldcover_enrichment_status,
                    firms_synced_at, created_at
                FROM ml_features
                WHERE db_id = %s;
            """, (event_db_id,))
            row = cur.fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"Event {event_db_id} not found",
            )

        cols = [
            "db_id", "event_id", "acquisition_date", "acquisition_time",
            "latitude", "longitude", "satellite", "instrument", "firms_source",
            "brightness", "frp", "confidence", "daynight", "scan", "track",
            "bright_ti4", "bright_ti5", "bright_t31",
            "distance_to_industrial", "distance_to_refinery",
            "distance_to_powerplant", "distance_to_mine",
            "distance_to_gas_facility", "distance_to_road",
            "near_industrial_facility", "near_refinery", "near_powerplant",
            "near_mine", "near_gas_facility",
            "wc_forest_pct", "wc_shrubland_pct", "wc_grassland_pct",
            "wc_cropland_pct", "wc_builtup_pct", "wc_water_pct",
            "wc_other_pct", "wc_nodata_pct",
            "wc_sample_pixels", "wc_sample_radius_km",
            "detections_7d", "detections_30d", "detections_90d",
            "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
            "days_active_30d", "persistence_score",
            "frp_deviation", "frp_ratio",
            "brightness_deviation", "brightness_ratio",
            "worldcover_class_code", "worldcover_class_name",
            "worldcover_version",
            "osm_enrichment_status", "worldcover_enrichment_status",
            "firms_synced_at", "created_at",
        ]

        result: Dict[str, Any] = {}
        for col, val in zip(cols, row):
            if hasattr(val, "isoformat"):
                result[col] = val.isoformat()
            elif col == "acquisition_date" and val is not None:
                result[col] = str(val)
            else:
                result[col] = val

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GET /events/%d/features error: %s", event_db_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])
