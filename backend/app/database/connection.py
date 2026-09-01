import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_database_config() -> dict:
    """Read PostgreSQL configuration from environment variables."""
    host = os.getenv("DATABASE_HOST", "localhost")
    port = int(os.getenv("DATABASE_PORT", "5432"))
    dbname = os.getenv("DATABASE_NAME", "thermalwatch")
    user = os.getenv("DATABASE_USER", "postgres")
    password = os.getenv("DATABASE_PASSWORD", "")

    config = {
        "host": host,
        "port": port,
        "dbname": dbname,
        "user": user,
    }

    # Only add password if it's provided; allows trust auth fallback
    if password:
        config["password"] = password

    return config


def get_connection() -> psycopg2.extensions.connection:
    """Create a PostgreSQL connection using the app environment settings.
    
    Supports both password auth and trust auth (local connections).
    """
    config = get_database_config()

    try:
        conn = psycopg2.connect(**config)
        conn.set_isolation_level(0)  # autocommit mode
        return conn
    except psycopg2.OperationalError as exc:
        raise RuntimeError(
            f"Failed to connect to PostgreSQL at {config['host']}:{config['port']} "
            f"database {config['dbname']}: {exc}"
        ) from exc


@contextmanager
def get_db_cursor():
    """Context manager for database cursor."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        yield cursor
        cursor.close()
    except Exception:
        if conn:
            conn.close()
        raise
    finally:
        if conn:
            conn.close()


def is_postgis_enabled() -> bool:
    """Check if PostGIS extension is enabled."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
        )
        return cursor.fetchone()[0]


def enable_postgis() -> None:
    """Enable PostGIS extension on the database."""
    with get_db_cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        print("✓ PostGIS extension enabled")
