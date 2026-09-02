from typing import Any, Dict, List, Tuple

import pandas as pd

from app.database.connection import (
    enable_postgis,
    get_db_cursor,
)
from app.database.migrations import compute_event_id, compute_source_event_hash


# =========================================================
# FIRMS COLUMN DEFINITIONS
# =========================================================

COMMON_COLUMNS = {
    "latitude": "latitude",
    "longitude": "longitude",
    "frp": "frp",
    "brightness": "brightness",
    "confidence": "confidence",
    "acq_date": "acquisition_date",
    "acq_time": "acquisition_time",
    "satellite": "satellite",
    "instrument": "instrument",
    "version": "version",
    "daynight": "daynight",
}


SENSOR_SPECIFIC_FIELDS = [
    "bright_ti4",
    "bright_ti5",
    "bright_t31",
    "scan",
    "track",
]


# =========================================================
# CREATE DATABASE TABLE
# =========================================================

def create_thermal_events_table() -> None:
    """
    Create the main ThermalWatch thermal event table.

    Each FIRMS observation is stored as:
        latitude
        longitude
        PostGIS POINT geometry

    SRID 4326 = WGS84 latitude/longitude coordinates.
    """

    with get_db_cursor() as cursor:

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS thermal_events (

                id SERIAL PRIMARY KEY,

                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,

                geom geometry(Point, 4326) NOT NULL,

                frp DOUBLE PRECISION,

                brightness DOUBLE PRECISION,

                confidence VARCHAR(20),

                acquisition_date DATE NOT NULL,
                acquisition_time INTEGER,

                satellite VARCHAR(100) NOT NULL,

                instrument VARCHAR(100),

                version VARCHAR(100),

                daynight VARCHAR(10),

                firms_source VARCHAR(100) NOT NULL,

                bright_ti4 DOUBLE PRECISION,
                bright_ti5 DOUBLE PRECISION,
                bright_t31 DOUBLE PRECISION,

                scan DOUBLE PRECISION,
                track DOUBLE PRECISION,

                created_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW(),

                UNIQUE (
                    satellite,
                    acquisition_date,
                    acquisition_time,
                    latitude,
                    longitude
                )
            );
            """
        )

        # -------------------------------------------------
        # Index for date-based queries
        # -------------------------------------------------

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_thermal_events_acquisition_date
            ON thermal_events (acquisition_date);
            """
        )

        # -------------------------------------------------
        # Index for FIRMS source
        # -------------------------------------------------

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_thermal_events_firms_source
            ON thermal_events (firms_source);
            """
        )

        # -------------------------------------------------
        # Index for satellite
        # -------------------------------------------------

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_thermal_events_satellite
            ON thermal_events (satellite);
            """
        )

        # -------------------------------------------------
        # PostGIS spatial index
        # -------------------------------------------------

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_thermal_events_geom
            ON thermal_events
            USING GIST (geom);
            """
        )


# =========================================================
# UNIQUE EVENT FIELDS
# =========================================================

def get_unique_event_fields() -> List[str]:
    """
    Fields used to identify duplicate FIRMS observations.
    """

    return [
        "satellite",
        "acquisition_date",
        "acquisition_time",
        "latitude",
        "longitude",
    ]


# =========================================================
# CLEAN FIRMS NUMERIC VALUES
# =========================================================

def _coerce_firms_numeric(value):
    """
    Convert FIRMS numeric values safely.

    FIRMS can sometimes use values such as:
        n
        na
        nan
        null

    These should become Python None.

    Valid numeric values are converted to int/float.
    """

    if value is None:
        return None

    if isinstance(value, str):

        value = value.strip()

        if value == "":
            return None

        if value.lower() in {
            "n",
            "na",
            "nan",
            "null",
            "none",
        }:
            return None

        try:

            if "." in value or "e" in value.lower():
                return float(value)

            return int(value)

        except ValueError:

            return None

    return value


# =========================================================
# NORMALIZE FIRMS DATA
# =========================================================

def normalize_firms_dataframe(
    df: pd.DataFrame,
    source: str,
) -> pd.DataFrame:
    """
    Normalize MODIS and VIIRS FIRMS data
    into the ThermalWatch database format.
    """

    normalized = df.copy()

    # -----------------------------------------------------
    # Rename acquisition fields
    # -----------------------------------------------------

    normalized = normalized.rename(
        columns={
            "acq_date": "acquisition_date",
            "acq_time": "acquisition_time",
        }
    )

    # -----------------------------------------------------
    # Add missing sensor-specific fields
    # -----------------------------------------------------

    for field in SENSOR_SPECIFIC_FIELDS:

        if field not in normalized.columns:
            normalized[field] = None

    # -----------------------------------------------------
    # Make sure common fields exist
    # -----------------------------------------------------

    for source_col, destination_col in COMMON_COLUMNS.items():

        if (
            source_col in normalized.columns
            and source_col != destination_col
        ):

            normalized = normalized.rename(
                columns={
                    source_col: destination_col
                }
            )

        elif destination_col not in normalized.columns:

            normalized[destination_col] = None

    # -----------------------------------------------------
    # Clean numeric fields
    # -----------------------------------------------------

    numeric_columns = [
        "acquisition_time",
        "brightness",
        "frp",
        "scan",
        "track",
        "bright_ti4",
        "bright_ti5",
        "bright_t31",
    ]

    for field in numeric_columns:

        if field in normalized.columns:

            normalized[field] = normalized[field].map(
                _coerce_firms_numeric
            )

    # -----------------------------------------------------
    # IMPORTANT:
    #
    # confidence is intentionally NOT converted to numeric.
    #
    # MODIS may provide numeric confidence.
    # VIIRS may provide values such as:
    # l = low
    # n = nominal
    # h = high
    #
    # Therefore we store confidence as text.
    # -----------------------------------------------------

    if "confidence" in normalized.columns:

        normalized["confidence"] = normalized[
            "confidence"
        ].apply(
            lambda value:
                None
                if pd.isna(value)
                else str(value).strip()
        )

    # -----------------------------------------------------
    # Store source
    # -----------------------------------------------------

    normalized["firms_source"] = source

    return normalized


# =========================================================
# INSERT / UPSERT FIRMS RECORDS
# =========================================================

def insert_firms_records(
    df: pd.DataFrame,
    source: str,
    batch_size: int = 500,
) -> Tuple[int, int]:
    """
    Legacy compatibility wrapper around upsert_firms_records().

    Returns (inserted_count, skipped_count) to preserve backward
    compatibility with existing callers in firms_service.py.

    'inserted' = new records
    'skipped'  = unchanged records (already in DB, no changes)
    Changed records are counted as inserted for legacy callers.
    """
    result = upsert_firms_records(df, source, batch_size)
    inserted = result["new"] + result["changed"]
    skipped = result["unchanged"]
    return inserted, skipped


def upsert_firms_records(
    df: pd.DataFrame,
    source: str,
    batch_size: int = 500,
) -> Dict[str, Any]:
    """
    Upsert FIRMS records into PostgreSQL with full change detection.

    For each incoming FIRMS record:

    NEW:
        No matching event_id in the database.
        Insert the record. Set firms_synced_at = NOW().
        Set osm_enrichment_status = 'pending'.
        Set worldcover_enrichment_status = 'pending'.

    CHANGED:
        Matching event_id exists but source_event_hash differs.
        Update all authoritative FIRMS fields.
        Update source_event_hash and firms_synced_at.
        Reset osm_enrichment_status = 'pending' (context changed).
        Reset worldcover_enrichment_status = 'pending' only if
        coordinates changed (WorldCover context may be invalid).

    UNCHANGED:
        Matching event_id exists and source_event_hash is identical.
        Update only firms_synced_at = NOW().
        Do not overwrite any other field.

    Returns:
        {
            "fetched":   int,
            "new":       int,
            "changed":   int,
            "unchanged": int,
            "failed":    int,
            # legacy compatibility
            "inserted":  int,  (= new + changed)
            "skipped":   int,  (= unchanged)
        }
    """
    if df.empty:
        return {
            "fetched": 0, "new": 0, "changed": 0,
            "unchanged": 0, "failed": 0,
            "inserted": 0, "skipped": 0,
        }

    normalized = normalize_firms_dataframe(df, source)

    counts = {"new": 0, "changed": 0, "unchanged": 0, "failed": 0}

    rows = []
    for _, row in normalized.iterrows():
        latitude = row.get("latitude")
        longitude = row.get("longitude")

        if pd.isna(latitude) or pd.isna(longitude):
            counts["failed"] += 1
            continue

        latitude = float(latitude)
        longitude = float(longitude)

        if not (-90 <= latitude <= 90):
            counts["failed"] += 1
            continue
        if not (-180 <= longitude <= 180):
            counts["failed"] += 1
            continue

        acq_date = row.get("acquisition_date")
        acq_time = row.get("acquisition_time")
        satellite = row.get("satellite") or ""
        instrument = row.get("instrument")
        version = row.get("version")
        frp = row.get("frp")
        brightness = row.get("brightness")
        confidence = row.get("confidence")
        daynight = row.get("daynight")

        eid = compute_event_id(satellite, str(acq_date), acq_time, latitude, longitude)
        shash = compute_source_event_hash(
            source, satellite, str(acq_date), acq_time,
            latitude, longitude, frp, brightness, confidence,
            daynight, instrument, version,
        )

        rows.append({
            "event_id": eid,
            "source_event_hash": shash,
            "latitude": latitude,
            "longitude": longitude,
            "geom": f"POINT({longitude} {latitude})",
            "frp": frp,
            "brightness": brightness,
            "confidence": confidence,
            "acquisition_date": acq_date,
            "acquisition_time": acq_time,
            "satellite": satellite,
            "instrument": instrument,
            "version": version,
            "daynight": daynight,
            "firms_source": source,
            "bright_ti4": row.get("bright_ti4"),
            "bright_ti5": row.get("bright_ti5"),
            "bright_t31": row.get("bright_t31"),
            "scan": row.get("scan"),
            "track": row.get("track"),
        })

    if not rows:
        return {
            "fetched": len(df),
            "new": 0, "changed": 0, "unchanged": 0,
            "failed": counts["failed"],
            "inserted": 0, "skipped": 0,
        }

    # ------------------------------------------------------------------
    # Bulk-load existing event_ids + hashes for this batch in one query
    # ------------------------------------------------------------------
    event_ids = [r["event_id"] for r in rows]

    existing: Dict[str, Tuple[str, float, float]] = {}
    # existing[event_id] = (source_event_hash, latitude, longitude)
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT event_id, source_event_hash, latitude, longitude
            FROM thermal_events
            WHERE event_id = ANY(%s);
            """,
            (event_ids,),
        )
        for db_eid, db_hash, db_lat, db_lon in cursor.fetchall():
            existing[db_eid] = (db_hash, float(db_lat), float(db_lon))

    # ------------------------------------------------------------------
    # Classify each record and build operation lists
    # ------------------------------------------------------------------
    new_rows: List[dict] = []
    changed_rows: List[dict] = []
    unchanged_rows: List[dict] = []

    for row in rows:
        eid = row["event_id"]
        if eid not in existing:
            new_rows.append(row)
        else:
            db_hash, db_lat, db_lon = existing[eid]
            if row["source_event_hash"] != db_hash:
                # Detect coordinate change to decide WorldCover reset
                coords_changed = (
                    abs(row["latitude"] - db_lat) > 1e-5 or
                    abs(row["longitude"] - db_lon) > 1e-5
                )
                row["_coords_changed"] = coords_changed
                changed_rows.append(row)
            else:
                unchanged_rows.append(row)

    # ------------------------------------------------------------------
    # Process in batches
    # ------------------------------------------------------------------
    for i in range(0, len(new_rows), batch_size):
        batch = new_rows[i:i + batch_size]
        _insert_new_batch(batch)
        counts["new"] += len(batch)

    for i in range(0, len(changed_rows), batch_size):
        batch = changed_rows[i:i + batch_size]
        _update_changed_batch(batch)
        counts["changed"] += len(batch)

    for i in range(0, len(unchanged_rows), batch_size):
        batch = unchanged_rows[i:i + batch_size]
        _update_unchanged_batch(batch)
        counts["unchanged"] += len(batch)

    return {
        "fetched": len(df),
        "new": counts["new"],
        "changed": counts["changed"],
        "unchanged": counts["unchanged"],
        "failed": counts["failed"],
        "inserted": counts["new"] + counts["changed"],
        "skipped": counts["unchanged"],
    }


def _insert_new_batch(rows: List[dict]) -> None:
    """Insert genuinely new FIRMS records."""
    if not rows:
        return

    sql = """
        INSERT INTO thermal_events (
            event_id,
            source_event_hash,
            latitude, longitude, geom,
            frp, brightness, confidence,
            acquisition_date, acquisition_time,
            satellite, instrument, version, daynight,
            firms_source,
            bright_ti4, bright_ti5, bright_t31,
            scan, track,
            firms_synced_at,
            osm_enrichment_status,
            worldcover_enrichment_status
        )
        VALUES (
            %s, %s,
            %s, %s, ST_GeomFromText(%s, 4326),
            %s, %s, %s,
            %s, %s,
            %s, %s, %s, %s,
            %s,
            %s, %s, %s,
            %s, %s,
            NOW(),
            'pending',
            'pending'
        )
        ON CONFLICT ON CONSTRAINT uq_thermal_events_firms_identity
        DO NOTHING;
    """
    params = [
        (
            r["event_id"], r["source_event_hash"],
            r["latitude"], r["longitude"], r["geom"],
            r["frp"], r["brightness"], r["confidence"],
            r["acquisition_date"], r["acquisition_time"],
            r["satellite"], r["instrument"], r["version"], r["daynight"],
            r["firms_source"],
            r["bright_ti4"], r["bright_ti5"], r["bright_t31"],
            r["scan"], r["track"],
        )
        for r in rows
    ]
    with get_db_cursor() as cursor:
        cursor.executemany(sql, params)


def _update_changed_batch(rows: List[dict]) -> None:
    """
    Update authoritative FIRMS fields for CHANGED records.
    Resets OSM enrichment to pending (context has changed).
    Resets WorldCover enrichment to pending only when coordinates changed.
    """
    if not rows:
        return

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    for row in rows:
        coords_changed = row.get("_coords_changed", False)
        wc_reset = "worldcover_enrichment_status = 'pending'" if coords_changed else ""
        wc_reset_geom = (
            "worldcover_class_code = NULL, "
            "worldcover_class_name = NULL, "
            "worldcover_version = NULL, "
            "worldcover_enriched_at = NULL, "
        ) if coords_changed else ""

        sql = f"""
            UPDATE thermal_events
            SET
                source_event_hash           = %s,
                latitude                    = %s,
                longitude                   = %s,
                geom                        = ST_GeomFromText(%s, 4326),
                frp                         = %s,
                brightness                  = %s,
                confidence                  = %s,
                acquisition_date            = %s,
                acquisition_time            = %s,
                satellite                   = %s,
                instrument                  = %s,
                version                     = %s,
                daynight                    = %s,
                firms_source                = %s,
                bright_ti4                  = %s,
                bright_ti5                  = %s,
                bright_t31                  = %s,
                scan                        = %s,
                track                       = %s,
                firms_synced_at             = %s,
                osm_enrichment_status       = 'pending',
                {wc_reset_geom}
                {("worldcover_enrichment_status = 'pending'," if coords_changed else "")}
                last_error                  = NULL
            WHERE event_id = %s;
        """
        params = (
            row["source_event_hash"],
            row["latitude"], row["longitude"], row["geom"],
            row["frp"], row["brightness"], row["confidence"],
            row["acquisition_date"], row["acquisition_time"],
            row["satellite"], row["instrument"], row["version"],
            row["daynight"], row["firms_source"],
            row["bright_ti4"], row["bright_ti5"], row["bright_t31"],
            row["scan"], row["track"],
            now,
            row["event_id"],
        )
        with get_db_cursor() as cursor:
            cursor.execute(sql, params)


def _update_unchanged_batch(rows: List[dict]) -> None:
    """
    For UNCHANGED records, update only firms_synced_at.
    All other fields are left exactly as they are.
    """
    if not rows:
        return

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    params = [(now, r["event_id"]) for r in rows]
    with get_db_cursor() as cursor:
        cursor.executemany("""
            UPDATE thermal_events
            SET firms_synced_at = %s
            WHERE event_id = %s;
        """, params)


# =========================================================
# WORLDCOVER SCHEMA MIGRATION
# =========================================================

def add_worldcover_columns() -> None:
    """
    Add ESA WorldCover enrichment columns to thermal_events.

    This migration is idempotent — it uses ADD COLUMN IF NOT EXISTS
    so it is safe to run against a table that already has the columns.

    Columns added:
        worldcover_class_code   SMALLINT   — official class integer (10–100)
        worldcover_class_name   VARCHAR    — human-readable class label
        worldcover_version      VARCHAR    — dataset version string, e.g. 'v200'
        worldcover_enriched_at  TIMESTAMPTZ — UTC timestamp of enrichment run
    """

    with get_db_cursor() as cursor:

        cursor.execute(
            """
            ALTER TABLE thermal_events
                ADD COLUMN IF NOT EXISTS worldcover_class_code  SMALLINT,
                ADD COLUMN IF NOT EXISTS worldcover_class_name  VARCHAR(100),
                ADD COLUMN IF NOT EXISTS worldcover_version     VARCHAR(20),
                ADD COLUMN IF NOT EXISTS worldcover_enriched_at TIMESTAMPTZ;
            """
        )

        # Index for fast grouping/filtering by land-cover class
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_thermal_events_worldcover_class_code
            ON thermal_events (worldcover_class_code);
            """
        )

        print("✓ WorldCover columns added (or already present)")


# =========================================================
# DATABASE VERIFICATION
# =========================================================

def verify_database() -> Dict[str, object]:
    """
    Verify PostgreSQL, PostGIS and thermal_events.
    """

    with get_db_cursor() as cursor:

        cursor.execute(
            "SELECT PostGIS_Version();"
        )
        postgis_version = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT to_regclass(
                'public.thermal_events'
            );
            """
        )
        table_result = cursor.fetchone()
        table_exists = table_result[0] is not None

        total_rows = 0
        source_totals = []
        geom_count = 0
        srid_count = 0
        point_count = 0

        if table_exists:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM thermal_events;
                """
            )
            total_rows = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT firms_source, COUNT(*)
                FROM thermal_events
                GROUP BY firms_source
                ORDER BY firms_source;
                """
            )
            source_totals = cursor.fetchall()

            cursor.execute(
                "SELECT COUNT(*) FROM thermal_events WHERE geom IS NOT NULL;"
            )
            geom_count = cursor.fetchone()[0]

            cursor.execute(
                "SELECT COUNT(*) FROM thermal_events WHERE ST_SRID(geom) = 4326;"
            )
            srid_count = cursor.fetchone()[0]

            cursor.execute(
                "SELECT COUNT(*) FROM thermal_events WHERE ST_GeometryType(geom) = 'ST_Point';"
            )
            point_count = cursor.fetchone()[0]

        sample = None
        if table_exists and total_rows > 0:
            cursor.execute(
                """
                SELECT
                    latitude,
                    longitude,
                    frp,
                    confidence,
                    satellite,
                    firms_source,
                    ST_AsText(geom),
                    ST_SRID(geom),
                    ST_GeometryType(geom)
                FROM thermal_events
                LIMIT 1;
                """
            )
            sample = cursor.fetchone()

    return {
        "postgis_version": postgis_version,
        "table_exists": table_exists,
        "total_rows": total_rows,
        "source_totals": source_totals,
        "geom_count": geom_count,
        "srid_count": srid_count,
        "point_count": point_count,
        "sample": sample,
    }


# =========================================================
# INITIALIZE DATABASE
# =========================================================

def init_database() -> bool:
    """
    Initialize the ThermalWatch database.

    Steps:

        1. Enable PostGIS
        2. Create thermal_events
        3. Create indexes
    """

    try:

        print(
            "Initializing ThermalWatch database..."
        )

        print(
            "Enabling PostGIS..."
        )

        enable_postgis()

        print(
            "Creating thermal_events table..."
        )

        create_thermal_events_table()

        print(
            "Adding WorldCover enrichment columns..."
        )

        add_worldcover_columns()

        print(
            "Running Phase 1 live pipeline migrations..."
        )

        from app.database.migrations import (
            migrate_phase1_columns,
            create_pipeline_status_table,
        )
        migrate_phase1_columns()
        create_pipeline_status_table()

        print(
            "Database initialization completed."
        )

        return True

    except Exception as exc:

        print(
            f"Database initialization failed: {exc}"
        )

        return False


# =========================================================
# DIRECT EXECUTION
# =========================================================

if __name__ == "__main__":

    success = init_database()

    if success:

        print()
        print(
            "SUCCESS: ThermalWatch database is ready."
        )

        try:

            verification = verify_database()

            print()
            print(
                "Database verification"
            )
            print("=" * 40)

            print(
                "PostGIS:",
                verification[
                    "postgis_version"
                ],
            )

            print(
                "thermal_events table:",
                verification[
                    "table_exists"
                ],
            )

            print(
                "Current records:",
                verification[
                    "total_rows"
                ],
            )

            if verification["sample"]:

                print(
                    "Sample:",
                    verification["sample"]
                )

        except Exception as exc:

            print(
                "Warning: Verification failed:",
                exc,
            )

    else:

        print(
            "ERROR: Database initialization failed."
        )