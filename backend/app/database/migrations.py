"""
ThermalWatch — Database Migrations
===================================

All migrations are:
  - Additive only (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS)
  - Idempotent (safe to run repeatedly)
  - Non-destructive (never DROP, TRUNCATE, or DELETE existing data)

Run order:
  1. migrate_phase1_columns()       — add new operational columns
  2. create_pipeline_status_table() — create pipeline_status if missing
  3. backfill_event_identity()      — populate event_id + source_event_hash
  4. replace_unique_constraint()    — add firms_source to uniqueness rule
"""

from __future__ import annotations

import hashlib
import logging
from typing import Dict, Tuple

from app.database.connection import get_db_cursor

logger = logging.getLogger(__name__)


# =============================================================================
# HASH HELPERS
# =============================================================================

def compute_event_id(
    satellite: str,
    acquisition_date: str,
    acquisition_time,
    latitude: float,
    longitude: float,
) -> str:
    """
    Deterministic FIRMS event identity.

    Format:  FIRMS_{first 10 chars of SHA-1}
    Example: FIRMS_a1b2c3d4e5

    Latitude and longitude are rounded to 5 decimal places (~1.1m precision),
    sufficient to uniquely identify distinct VIIRS (375m) and MODIS (1km) pixels
    without false merging of adjacent detections.

    FRP and brightness are intentionally excluded — they can be revised
    without creating a new event.
    """
    lat_r = round(float(latitude), 5)
    lon_r = round(float(longitude), 5)
    acq_time = str(acquisition_time) if acquisition_time is not None else ""
    acq_date = str(acquisition_date)

    raw = f"{satellite}|{acq_date}|{acq_time}|{lat_r}|{lon_r}"
    sha1 = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return f"FIRMS_{sha1[:10]}"


def compute_source_event_hash(
    firms_source: str,
    satellite: str,
    acquisition_date: str,
    acquisition_time,
    latitude: float,
    longitude: float,
    frp,
    brightness,
    confidence,
    daynight,
    instrument,
    version,
) -> str:
    """
    Deterministic content hash (SHA-256) representing the authoritative
    state of a FIRMS record.

    If any of these fields change in a subsequent FIRMS response, the hash
    will differ, signalling a CHANGED event.

    Uses a deterministic '||' delimited serialization.
    None values are serialized as the empty string.
    """
    def s(v) -> str:
        if v is None:
            return ""
        return str(v).strip()

    lat_r = round(float(latitude), 6)
    lon_r = round(float(longitude), 6)

    parts = [
        s(firms_source),
        s(satellite),
        s(acquisition_date),
        s(acquisition_time),
        f"{lat_r:.6f}",
        f"{lon_r:.6f}",
        s(frp),
        s(brightness),
        s(confidence),
        s(daynight),
        s(instrument),
        s(version),
    ]
    raw = "||".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# =============================================================================
# MIGRATION 1 — ADD OPERATIONAL COLUMNS TO thermal_events
# =============================================================================

def migrate_phase1_columns() -> None:
    """
    Add all Phase 1 operational columns to thermal_events.

    Uses ADD COLUMN IF NOT EXISTS throughout — safe to run on a table
    that already has some of these columns.

    Columns worldcover_version and worldcover_enriched_at already exist
    from Phase 3A and are deliberately skipped here.
    """
    with get_db_cursor() as cur:

        # ------------------------------------------------------------------
        # FIRMS identity / sync columns
        # ------------------------------------------------------------------
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS event_id
                    VARCHAR(16),
                ADD COLUMN IF NOT EXISTS source_event_hash
                    VARCHAR(64),
                ADD COLUMN IF NOT EXISTS firms_synced_at
                    TIMESTAMPTZ;
        """)

        # ------------------------------------------------------------------
        # OSM spatial enrichment columns
        # ------------------------------------------------------------------
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS distance_to_industrial
                    DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS distance_to_refinery
                    DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS distance_to_powerplant
                    DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS distance_to_mine
                    DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS distance_to_gas_facility
                    DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS distance_to_road
                    DOUBLE PRECISION;
        """)

        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS near_industrial_facility
                    BOOLEAN,
                ADD COLUMN IF NOT EXISTS near_refinery
                    BOOLEAN,
                ADD COLUMN IF NOT EXISTS near_powerplant
                    BOOLEAN,
                ADD COLUMN IF NOT EXISTS near_mine
                    BOOLEAN,
                ADD COLUMN IF NOT EXISTS near_gas_facility
                    BOOLEAN;
        """)

        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS osm_enrichment_status
                    VARCHAR(30),
                ADD COLUMN IF NOT EXISTS osm_enriched_at
                    TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS osm_source_version
                    VARCHAR(100);
        """)

        # ------------------------------------------------------------------
        # WorldCover enrichment status
        # (worldcover_version and worldcover_enriched_at already exist)
        # ------------------------------------------------------------------
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS worldcover_enrichment_status
                    VARCHAR(30);
        """)

        # ------------------------------------------------------------------
        # Operational error tracking
        # ------------------------------------------------------------------
        cur.execute("""
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS last_error
                    TEXT;
        """)

        # ------------------------------------------------------------------
        # Index on event_id for fast upsert lookups
        # (added before backfill so it builds incrementally)
        # ------------------------------------------------------------------
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_thermal_events_event_id
            ON thermal_events (event_id);
        """)

        # Index on source_event_hash for change detection lookups
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_thermal_events_source_event_hash
            ON thermal_events (source_event_hash);
        """)

    logger.info("Phase 1 column migration complete.")
    print("✓ Phase 1 columns added (or already present)")


# =============================================================================
# MIGRATION 2 — CREATE pipeline_status TABLE
# =============================================================================

def create_pipeline_status_table() -> None:
    """
    Create the pipeline_status table if it does not already exist.

    If the table already exists with a different schema, this function
    will detect and report the discrepancy rather than silently alter it.
    """
    with get_db_cursor() as cur:

        # Check whether the table already exists
        cur.execute("""
            SELECT to_regclass('public.pipeline_status');
        """)
        exists = cur.fetchone()[0]

        if exists:
            # Table exists — verify expected columns are present
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'pipeline_status'
                ORDER BY ordinal_position;
            """)
            existing = {r[0] for r in cur.fetchall()}
            required = {
                'id', 'source', 'last_attempt', 'last_success',
                'last_fetched', 'last_inserted', 'last_updated',
                'last_unchanged', 'last_error', 'worker_status', 'updated_at',
            }
            missing = required - existing
            if missing:
                raise RuntimeError(
                    f"pipeline_status table already exists but is missing "
                    f"required columns: {missing}. "
                    f"Resolve manually before proceeding."
                )
            print("✓ pipeline_status table already exists with correct schema")
            return

        # Table does not exist — create it
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_status (
                id             SERIAL PRIMARY KEY,
                source         VARCHAR(100) NOT NULL UNIQUE,
                last_attempt   TIMESTAMPTZ,
                last_success   TIMESTAMPTZ,
                last_fetched   INTEGER  NOT NULL DEFAULT 0,
                last_inserted  INTEGER  NOT NULL DEFAULT 0,
                last_updated   INTEGER  NOT NULL DEFAULT 0,
                last_unchanged INTEGER  NOT NULL DEFAULT 0,
                last_error     TEXT,
                worker_status  VARCHAR(20) NOT NULL DEFAULT 'idle',
                updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Seed one row per FIRMS source so status is always queryable
        cur.execute("""
            INSERT INTO pipeline_status (source)
            VALUES
                ('MODIS_NRT'),
                ('VIIRS_NOAA20_NRT'),
                ('VIIRS_NOAA21_NRT'),
                ('VIIRS_SNPP_NRT'),
                ('ALL_SOURCES')
            ON CONFLICT (source) DO NOTHING;
        """)

    logger.info("pipeline_status table created.")
    print("✓ pipeline_status table created")


# =============================================================================
# MIGRATION 3 — BACKFILL event_id AND source_event_hash
# =============================================================================

def backfill_event_identity(batch_size: int = 5000) -> Dict[str, int]:
    """
    Populate event_id and source_event_hash for all existing records
    where either field is currently NULL.

    This is pure metadata derivation — no authoritative FIRMS fields
    (latitude, longitude, frp, brightness, etc.) are modified.

    firms_synced_at is intentionally left NULL for historical rows.
    The timestamp cannot be accurately reconstructed. New ingestion
    runs will populate it going forward.

    Also sets worldcover_enrichment_status for rows that already have
    a worldcover_version value ('enriched' or 'nodata'), and marks
    all others as 'pending'.

    Returns:
        {'processed': N, 'skipped': N}
    """
    stats = {'processed': 0, 'skipped': 0}

    # Count how many rows need backfill
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT COUNT(*)
            FROM thermal_events
            WHERE event_id IS NULL OR source_event_hash IS NULL;
        """)
        needs_backfill = cur.fetchone()[0]

    if needs_backfill == 0:
        print("✓ All records already have event_id and source_event_hash")
        return stats

    print(f"  Backfilling {needs_backfill:,} records ...")

    offset = 0
    while True:
        # Fetch a batch of rows needing backfill
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT
                    id,
                    satellite,
                    acquisition_date,
                    acquisition_time,
                    latitude,
                    longitude,
                    frp,
                    brightness,
                    confidence,
                    daynight,
                    instrument,
                    version,
                    firms_source,
                    worldcover_version,
                    worldcover_class_code
                FROM thermal_events
                WHERE event_id IS NULL OR source_event_hash IS NULL
                ORDER BY id
                LIMIT %s;
            """, (batch_size,))
            rows = cur.fetchall()

        if not rows:
            break

        updates = []
        for row in rows:
            (
                rec_id, satellite, acq_date, acq_time,
                lat, lon, frp, brightness, confidence,
                daynight, instrument, version, firms_source,
                wc_version, wc_class_code,
            ) = row

            eid = compute_event_id(
                satellite, str(acq_date), acq_time, lat, lon
            )
            shash = compute_source_event_hash(
                firms_source, satellite, str(acq_date), acq_time,
                lat, lon, frp, brightness, confidence,
                daynight, instrument, version,
            )

            # Derive worldcover_enrichment_status from existing data
            if wc_version is not None and wc_class_code is not None:
                wc_status = 'enriched'
            elif wc_version is not None and wc_class_code is None:
                wc_status = 'nodata'
            else:
                wc_status = 'pending'

            updates.append((eid, shash, wc_status, rec_id))

        with get_db_cursor() as cur:
            cur.executemany("""
                UPDATE thermal_events
                SET
                    event_id                    = %s,
                    source_event_hash           = %s,
                    worldcover_enrichment_status = %s
                WHERE id = %s;
            """, updates)

        stats['processed'] += len(rows)
        print(f"    Backfilled {stats['processed']:,} / {needs_backfill:,} ...")

    print(f"✓ Backfill complete: {stats['processed']:,} records processed")
    return stats


# =============================================================================
# MIGRATION 4 — CHECK COLLISIONS THEN REPLACE UNIQUE CONSTRAINT
# =============================================================================

def check_event_id_collisions() -> int:
    """
    Check whether event_id values are unique across all records.

    Returns the number of colliding event_ids (0 = safe to proceed).
    Prints details of any collisions found.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM thermal_events;
        """)
        total = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(DISTINCT event_id)
            FROM thermal_events
            WHERE event_id IS NOT NULL;
        """)
        distinct = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM thermal_events
            WHERE event_id IS NULL;
        """)
        null_count = cur.fetchone()[0]

    collisions = total - distinct - null_count
    print(f"  Total rows           : {total:,}")
    print(f"  Distinct event_ids   : {distinct:,}")
    print(f"  NULL event_ids       : {null_count:,}")
    print(f"  Collisions           : {collisions:,}")

    if collisions > 0:
        # Show which event_ids collide
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT event_id, COUNT(*) AS cnt
                FROM thermal_events
                WHERE event_id IS NOT NULL
                GROUP BY event_id
                HAVING COUNT(*) > 1
                ORDER BY cnt DESC
                LIMIT 20;
            """)
            dupes = cur.fetchall()
        print("  Sample colliding event_ids:")
        for eid, cnt in dupes:
            print(f"    {eid}  ({cnt} rows)")

    return collisions


def check_new_constraint_duplicates() -> int:
    """
    Check for duplicates under the new unique constraint definition:
    (firms_source, satellite, acquisition_date, acquisition_time, latitude, longitude)

    Returns the number of duplicate groups (0 = safe to proceed).
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM (
                SELECT firms_source, satellite, acquisition_date,
                       acquisition_time, latitude, longitude
                FROM thermal_events
                GROUP BY firms_source, satellite, acquisition_date,
                         acquisition_time, latitude, longitude
                HAVING COUNT(*) > 1
            ) dups;
        """)
        dup_groups = cur.fetchone()[0]

    if dup_groups > 0:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT firms_source, satellite, acquisition_date,
                       acquisition_time, latitude, longitude, COUNT(*)
                FROM thermal_events
                GROUP BY firms_source, satellite, acquisition_date,
                         acquisition_time, latitude, longitude
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
                LIMIT 10;
            """)
            samples = cur.fetchall()
        print(f"  DUPLICATE GROUPS under new constraint: {dup_groups:,}")
        for r in samples:
            print(f"    {r}")
    else:
        print(f"  No duplicates under new constraint definition — safe to proceed")

    return dup_groups


def replace_unique_constraint() -> None:
    """
    Replace the old unique constraint:
        (satellite, acquisition_date, acquisition_time, latitude, longitude)
    with the new constraint:
        (firms_source, satellite, acquisition_date, acquisition_time, latitude, longitude)

    This operation takes a brief ACCESS EXCLUSIVE lock on thermal_events.
    With 96,828 rows it completes in seconds.

    The old constraint is dropped first, then the new one is added.
    If either step fails, the database is left in a consistent state
    (autocommit means each DDL is its own transaction).
    """
    OLD_CONSTRAINT = (
        "thermal_events_satellite_acquisition_date_acquisition_time__key"
    )
    NEW_CONSTRAINT = "uq_thermal_events_firms_identity"

    with get_db_cursor() as cur:
        # Check if old constraint still exists
        cur.execute("""
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'thermal_events'::regclass
              AND conname = %s;
        """, (OLD_CONSTRAINT,))
        old_exists = cur.fetchone()

        # Check if new constraint already exists
        cur.execute("""
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'thermal_events'::regclass
              AND conname = %s;
        """, (NEW_CONSTRAINT,))
        new_exists = cur.fetchone()

    if new_exists:
        print("✓ New unique constraint already exists — skipping")
        return

    if old_exists:
        with get_db_cursor() as cur:
            cur.execute(f"""
                ALTER TABLE thermal_events
                DROP CONSTRAINT "{OLD_CONSTRAINT}";
            """)
        print(f"  Dropped old constraint: {OLD_CONSTRAINT}")

    with get_db_cursor() as cur:
        cur.execute(f"""
            ALTER TABLE thermal_events
            ADD CONSTRAINT {NEW_CONSTRAINT}
            UNIQUE (
                firms_source,
                satellite,
                acquisition_date,
                acquisition_time,
                latitude,
                longitude
            );
        """)
    print(f"✓ New unique constraint added: {NEW_CONSTRAINT}")
    print(f"  Columns: (firms_source, satellite, acquisition_date, acquisition_time, latitude, longitude)")


# =============================================================================
# CONVENIENCE: RUN ALL MIGRATIONS IN ORDER
# =============================================================================

def run_all_migrations() -> None:
    """
    Execute all Phase 1 migrations in the correct order.
    Each step is idempotent and safe to re-run.
    """
    print()
    print("=" * 60)
    print("  THERMALWATCH PHASE 1 — DATABASE MIGRATION")
    print("=" * 60)

    print("\n[1/6] Adding Phase 1 columns to thermal_events ...")
    migrate_phase1_columns()

    print("\n[2/6] Creating pipeline_status table ...")
    create_pipeline_status_table()

    print("\n[3/6] Backfilling event_id and source_event_hash ...")
    backfill_event_identity()

    print("\n[4/6] Checking event_id collisions ...")
    collisions = check_event_id_collisions()
    if collisions > 0:
        raise RuntimeError(
            f"STOP: {collisions} event_id collisions detected. "
            f"Resolve manually before adding unique constraint."
        )
    print("  PASS — no collisions")

    print("\n[5/6] Checking duplicates under new unique constraint ...")
    dup_groups = check_new_constraint_duplicates()
    if dup_groups > 0:
        raise RuntimeError(
            f"STOP: {dup_groups} duplicate groups detected under new "
            f"constraint. Resolve manually before proceeding."
        )
    print("  PASS — no duplicates")

    print("\n[6/6] Replacing unique constraint ...")
    replace_unique_constraint()

    print()
    print("=" * 60)
    print("  MIGRATION COMPLETE")
    print("=" * 60)
    print()


if __name__ == "__main__":
    run_all_migrations()
