"""
ThermalWatch — Phase 2 Database Migrations
===========================================

Adds columns for:
  - WorldCover area percentage breakdown (wc_*_pct)
  - Temporal features (detections_7d/30d/90d, mean/max_frp_30d, etc.)
  - Historical anomaly features (frp_deviation/ratio, brightness_deviation/ratio)
  - Performance indexes

ALL changes are:
  - Additive only (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
  - Idempotent (safe to re-run)
  - Non-destructive (no DROP, TRUNCATE, DELETE)

Run order:
    python -m app.database.migrations_phase2
or imported at startup via migrate_phase2()
"""

from __future__ import annotations

import logging
from app.database.connection import get_db_cursor

logger = logging.getLogger(__name__)


# =============================================================================
# WORLDCOVER PERCENTAGE COLUMNS
# =============================================================================

def add_worldcover_pct_columns() -> None:
    """
    Add area-percentage WorldCover columns to thermal_events.

    ⚠ SAMPLING RADIUS AMBIGUITY: The wc_sample_radius_km column stores
    the radius used for each row so results are reproducible if the radius
    changes in future. Team must confirm WC_SAMPLE_RADIUS_KM before ML training.

    Column semantics:
      wc_forest_pct       — % Tree cover (class 10) in sampling window
      wc_shrubland_pct    — % Shrubland (class 20)
      wc_grassland_pct    — % Grassland (class 30)
      wc_cropland_pct     — % Cropland (class 40)
      wc_builtup_pct      — % Built-up (class 50)
      wc_water_pct        — % Permanent water (class 80)
      wc_other_pct        — % all other valid classes (60,70,90,95,100)
      wc_nodata_pct       — % NoData pixels in window
      wc_sample_pixels    — total pixels in window (for QA)
      wc_sample_radius_km — radius used (km) — enables future re-enrichment
    """
    with get_db_cursor() as cur:
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS wc_forest_pct       REAL,
                ADD COLUMN IF NOT EXISTS wc_shrubland_pct    REAL,
                ADD COLUMN IF NOT EXISTS wc_grassland_pct    REAL,
                ADD COLUMN IF NOT EXISTS wc_cropland_pct     REAL,
                ADD COLUMN IF NOT EXISTS wc_builtup_pct      REAL,
                ADD COLUMN IF NOT EXISTS wc_water_pct        REAL,
                ADD COLUMN IF NOT EXISTS wc_other_pct        REAL,
                ADD COLUMN IF NOT EXISTS wc_nodata_pct       REAL,
                ADD COLUMN IF NOT EXISTS wc_sample_pixels    INTEGER,
                ADD COLUMN IF NOT EXISTS wc_sample_radius_km REAL;
        """)
    logger.info("WorldCover pct columns added (or already present)")
    print("✓ WorldCover pct columns added (or already present)")


# =============================================================================
# TEMPORAL FEATURE COLUMNS
# =============================================================================

def add_temporal_columns() -> None:
    """
    Add temporal activity columns to thermal_events.

    These are data-engineering features, NOT ML logic.

    Definitions:
      detections_7d        — count of events within TEMPORAL_SPATIAL_RADIUS_KM
                             in the 7 days BEFORE this event's acquisition_date
                             (exclusive: current event not included in its own count)
      detections_30d       — same, 30-day window
      detections_90d       — same, 90-day window
      mean_frp_30d         — mean FRP of events in 30-day spatial window
                             (NULL FRP events excluded from mean)
      max_frp_30d          — maximum FRP in 30-day spatial window
      mean_brightness_30d  — mean brightness in 30-day spatial window
      days_active_30d      — count of distinct acquisition_dates in 30-day window
                             (how many different days had at least one detection)
      persistence_score    — days_active_30d / 30.0  (range 0.0–1.0)
                             ⚠ FORMULA AMBIGUITY: no authoritative formula defined.
                             Using days_active_30d/30.0 pending team confirmation.
      temporal_computed_at — UTC timestamp when temporal features were last computed

    SPATIAL RADIUS AMBIGUITY:
      ⚠ No authoritative radius defined in project spec.
      Using TEMPORAL_SPATIAL_RADIUS_KM (env var, default 1.0 km) pending confirmation.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS detections_7d       INTEGER,
                ADD COLUMN IF NOT EXISTS detections_30d      INTEGER,
                ADD COLUMN IF NOT EXISTS detections_90d      INTEGER,
                ADD COLUMN IF NOT EXISTS mean_frp_30d        DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS max_frp_30d         DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS mean_brightness_30d DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS days_active_30d     INTEGER,
                ADD COLUMN IF NOT EXISTS persistence_score   DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS temporal_computed_at TIMESTAMPTZ;
        """)
    logger.info("Temporal feature columns added (or already present)")
    print("✓ Temporal feature columns added (or already present)")


# =============================================================================
# HISTORICAL ANOMALY COLUMNS
# =============================================================================

def add_anomaly_columns() -> None:
    """
    Add historical anomaly feature columns to thermal_events.

    These compare the current observation against a 30-day historical baseline
    computed from events within TEMPORAL_SPATIAL_RADIUS_KM.

    Definitions:
      frp_deviation        — frp - mean_frp_30d
                             (how much current FRP deviates from 30d mean)
                             NULL if frp IS NULL or mean_frp_30d IS NULL
      frp_ratio            — frp / mean_frp_30d
                             NULL if mean_frp_30d IS NULL or = 0
                             (zero-division returns NULL, not infinity)
      brightness_deviation — brightness - mean_brightness_30d
                             NULL if either is NULL
      brightness_ratio     — brightness / mean_brightness_30d
                             NULL if mean_brightness_30d IS NULL or = 0

    BASELINE AMBIGUITY:
      ⚠ No authoritative baseline window or exclusion rules defined.
      Baseline = 30-day window before this event (same as mean_frp_30d).
      Current event excluded from its own baseline.
      Team must confirm before ML training.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS frp_deviation        DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS frp_ratio            DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS brightness_deviation DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS brightness_ratio     DOUBLE PRECISION;
        """)
    logger.info("Anomaly feature columns added (or already present)")
    print("✓ Anomaly feature columns added (or already present)")


# =============================================================================
# PERFORMANCE INDEXES
# =============================================================================

def add_phase2_indexes() -> None:
    """
    Add indexes needed for Phase 2 queries.

    osm_enrichment_status: the OSM batch query does a full sequential scan
    on 306k rows. This index cuts it to ~milliseconds.

    worldcover_enrichment_status: similarly needed for WC pending queries.

    temporal_computed_at: for finding events needing temporal recalculation.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_te_osm_status
            ON thermal_events (osm_enrichment_status);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_te_wc_status
            ON thermal_events (worldcover_enrichment_status);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_te_temporal_computed
            ON thermal_events (temporal_computed_at)
            WHERE temporal_computed_at IS NULL;
        """)
        # PostGIS index already exists but confirm it covers geom
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_te_geom_gist
            ON thermal_events USING GIST (geom);
        """)
    logger.info("Phase 2 indexes added (or already present)")
    print("✓ Phase 2 indexes added (or already present)")


# =============================================================================
# ML FEATURES VIEW
# =============================================================================

def create_ml_features_view() -> None:
    """
    Create (or replace) the ml_features VIEW.

    This is the complete ML-ready feature representation.
    It is a VIEW — no data is duplicated; queries hit thermal_events directly.
    The ML teammate reads from this view for training and inference.

    Columns match the feature spec exactly:
      IDENTIFIERS   — event_id, acquisition_date, acquisition_time,
                      latitude, longitude, satellite, instrument, firms_source
      THERMAL       — brightness, frp, confidence, daynight, scan, track
      SPATIAL       — distance_to_* (km), near_*
      LAND COVER    — wc_*_pct (percentages from area sampling)
      TEMPORAL      — detections_7d/30d/90d, mean/max_frp_30d,
                      mean_brightness_30d, days_active_30d, persistence_score
      ANOMALY       — frp_deviation, frp_ratio,
                      brightness_deviation, brightness_ratio
      CONTEXT       — worldcover_class_code, worldcover_class_name,
                      worldcover_version, osm_enrichment_status,
                      worldcover_enrichment_status

    DO NOT add ML label/prediction columns here — those belong to the ML teammate.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            CREATE OR REPLACE VIEW ml_features AS
            SELECT
                -- Identifiers
                id                          AS db_id,
                event_id,
                acquisition_date,
                acquisition_time,
                latitude,
                longitude,
                satellite,
                instrument,
                firms_source,

                -- Thermal signal
                brightness,
                frp,
                confidence,
                daynight,
                scan,
                track,
                bright_ti4,
                bright_ti5,
                bright_t31,

                -- OSM spatial distances (kilometres)
                distance_to_industrial,
                distance_to_refinery,
                distance_to_powerplant,
                distance_to_mine,
                distance_to_gas_facility,
                distance_to_road,

                -- OSM proximity flags
                near_industrial_facility,
                near_refinery,
                near_powerplant,
                near_mine,
                near_gas_facility,

                -- WorldCover area percentages
                wc_forest_pct,
                wc_shrubland_pct,
                wc_grassland_pct,
                wc_cropland_pct,
                wc_builtup_pct,
                wc_water_pct,
                wc_other_pct,
                wc_nodata_pct,
                wc_sample_pixels,
                wc_sample_radius_km,

                -- Temporal features
                detections_7d,
                detections_30d,
                detections_90d,
                mean_frp_30d,
                max_frp_30d,
                mean_brightness_30d,
                days_active_30d,
                persistence_score,

                -- Historical anomaly features
                frp_deviation,
                frp_ratio,
                brightness_deviation,
                brightness_ratio,

                -- Context / enrichment status (useful for ML filtering)
                worldcover_class_code,
                worldcover_class_name,
                worldcover_version,
                osm_enrichment_status,
                worldcover_enrichment_status,

                -- Operational timestamps
                firms_synced_at,
                created_at

            FROM thermal_events;
        """)
    logger.info("ml_features VIEW created/replaced")
    print("✓ ml_features VIEW created (or replaced)")


# =============================================================================
# RUN ALL PHASE 2 MIGRATIONS
# =============================================================================

def migrate_phase2() -> None:
    """
    Run all Phase 2 migrations in order.
    Idempotent — safe to call on every startup.
    """
    print()
    print("=" * 60)
    print("  THERMALWATCH PHASE 2 — DATABASE MIGRATION")
    print("=" * 60)

    print("\n[1/5] WorldCover percentage columns ...")
    add_worldcover_pct_columns()

    print("\n[2/5] Temporal feature columns ...")
    add_temporal_columns()

    print("\n[3/5] Anomaly feature columns ...")
    add_anomaly_columns()

    print("\n[4/5] Performance indexes ...")
    add_phase2_indexes()

    print("\n[5/5] ml_features VIEW ...")
    create_ml_features_view()

    print()
    print("=" * 60)
    print("  PHASE 2 MIGRATION COMPLETE")
    print("=" * 60)
    print()


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    migrate_phase2()
