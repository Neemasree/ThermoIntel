from typing import Dict, List, Tuple

import pandas as pd

from app.database.connection import (
    enable_postgis,
    get_db_cursor,
)


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
# INSERT FIRMS RECORDS
# =========================================================

def insert_firms_records(
    df: pd.DataFrame,
    source: str,
    batch_size: int = 1000,
) -> Tuple[int, int]:
    """
    Insert FIRMS records into PostgreSQL in efficient batches.

    Returns:
        inserted_count,
        skipped_count

    Duplicate records are skipped using the database
    UNIQUE constraint.
    """

    if df.empty:
        return 0, 0

    normalized = normalize_firms_dataframe(
        df,
        source,
    )

    rows = []

    for _, row in normalized.iterrows():

        latitude = row.get("latitude")
        longitude = row.get("longitude")

        if pd.isna(latitude) or pd.isna(longitude):
            continue

        latitude = float(latitude)
        longitude = float(longitude)

        if not (-90 <= latitude <= 90):
            continue

        if not (-180 <= longitude <= 180):
            continue

        geom_wkt = f"POINT({longitude} {latitude})"

        rows.append(
            {
                "latitude": latitude,
                "longitude": longitude,
                "geom": geom_wkt,
                "frp": row.get("frp"),
                "brightness": row.get("brightness"),
                "confidence": row.get("confidence"),
                "acquisition_date": row.get("acquisition_date"),
                "acquisition_time": row.get("acquisition_time"),
                "satellite": row.get("satellite"),
                "instrument": row.get("instrument"),
                "version": row.get("version"),
                "daynight": row.get("daynight"),
                "firms_source": source,
                "bright_ti4": row.get("bright_ti4"),
                "bright_ti5": row.get("bright_ti5"),
                "bright_t31": row.get("bright_t31"),
                "scan": row.get("scan"),
                "track": row.get("track"),
            }
        )

    if not rows:
        return 0, len(normalized)

    insert_sql = """
        INSERT INTO thermal_events (
            latitude,
            longitude,
            geom,
            frp,
            brightness,
            confidence,
            acquisition_date,
            acquisition_time,
            satellite,
            instrument,
            version,
            daynight,
            firms_source,
            bright_ti4,
            bright_ti5,
            bright_t31,
            scan,
            track
        )
        VALUES (
            %s,
            %s,
            ST_GeomFromText(%s, 4326),
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s
        )
        ON CONFLICT DO NOTHING;
    """

    inserted_total = 0
    skipped_total = 0

    with get_db_cursor() as cursor:
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            batch_values = [
                (
                    row["latitude"],
                    row["longitude"],
                    row["geom"],
                    row["frp"],
                    row["brightness"],
                    row["confidence"],
                    row["acquisition_date"],
                    row["acquisition_time"],
                    row["satellite"],
                    row["instrument"],
                    row["version"],
                    row["daynight"],
                    row["firms_source"],
                    row["bright_ti4"],
                    row["bright_ti5"],
                    row["bright_t31"],
                    row["scan"],
                    row["track"],
                )
                for row in batch
            ]

            try:
                cursor.executemany(insert_sql, batch_values)
                batch_inserted = cursor.rowcount
                inserted_total += batch_inserted
                skipped_total += len(batch) - batch_inserted
            except Exception as exc:
                print(f"Warning: batch insert failed for {source}: {exc}")
                skipped_total += len(batch)

    return inserted_total, skipped_total


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