import argparse
import os
import time
from io import StringIO
from typing import Any, Dict, List, Tuple

import pandas as pd
import requests
from dotenv import load_dotenv

from app.database.setup import init_database, insert_firms_records, verify_database

load_dotenv()

FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


# Global FIRMS near-real-time sources
FIRMS_SOURCES = [
    "MODIS_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "VIIRS_SNPP_NRT",
]


def get_firms_api_key() -> str:
    """Get NASA FIRMS MAP_KEY from environment."""

    api_key = os.getenv("FIRMS_MAP_KEY")

    if not api_key or not api_key.strip():
        raise ValueError(
            "FIRMS_MAP_KEY is missing. "
            "Add it to backend/.env."
        )

    return api_key.strip()


def fetch_firms_source(
    source: str,
    days: int = 1,
    area: str = "world",
    timeout: int = 60,
    max_retries: int = 3,
) -> pd.DataFrame:
    """
    Fetch one FIRMS source with proper timeout and retry logic.
    
    Args:
        source: FIRMS source name (MODIS_NRT, VIIRS_*, etc.)
        days: Number of days (1-5)
        area: "world" or bounding box "minlon,minlat,maxlon,maxlat"
        timeout: Read timeout in seconds
        max_retries: Number of retry attempts
        
    Returns:
        DataFrame with FIRMS data
        
    Raises:
        ValueError: Invalid source or days
        TimeoutError: NASA FIRMS request timed out
        RuntimeError: Connection or request failure
    """

    if source not in FIRMS_SOURCES:
        raise ValueError(
            f"Unsupported FIRMS source: {source}"
        )

    if not 1 <= days <= 5:
        raise ValueError(
            "FIRMS day range must be between 1 and 5."
        )

    api_key = get_firms_api_key()

    url = (
        f"{FIRMS_BASE_URL}/"
        f"{api_key}/"
        f"{source}/"
        f"{area}/"
        f"{days}"
    )

    print(f"Fetching FIRMS source: {source}")
    print(f"  Area: {area}")
    print(f"  Days: {days}")
    print(f"  Timeout: {timeout}s")
    print()

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            # Use separate connection (15s) and read (timeout) timeouts
            response = requests.get(
                url,
                timeout=(15, timeout),
            )

            if response.status_code == 401:
                raise PermissionError(
                    f"{source}: Invalid NASA FIRMS MAP_KEY."
                )

            if response.status_code == 403:
                raise PermissionError(
                    f"{source}: NASA FIRMS access forbidden."
                )

            if response.status_code >= 400:
                raise RuntimeError(
                    f"{source}: NASA FIRMS returned HTTP "
                    f"{response.status_code}"
                )

            if not response.text.strip():
                raise ValueError(
                    f"{source}: NASA FIRMS returned empty data."
                )

            try:
                df = pd.read_csv(
                    StringIO(response.text)
                )
            except Exception as exc:
                raise ValueError(
                    f"{source}: Failed to parse CSV: {exc}"
                ) from exc

            if df.empty:
                raise ValueError(
                    f"{source}: No records returned."
                )

            df["firms_source"] = source
            return df

        except requests.exceptions.Timeout as exc:
            last_error = TimeoutError(
                f"{source}: NASA FIRMS request timed out"
            )
        except requests.exceptions.ConnectionError as exc:
            last_error = RuntimeError(
                f"{source}: Could not connect to NASA FIRMS"
            )
        except requests.exceptions.RequestException as exc:
            last_error = RuntimeError(
                f"{source}: NASA FIRMS request failed: {str(exc)[:100]}"
            )
        except (PermissionError, RuntimeError, ValueError) as exc:
            last_error = exc

        if attempt < max_retries:
            print(f"Attempt {attempt} failed, retrying in {2 * attempt}s...")
            time.sleep(2 * attempt)
        else:
            break

    if last_error is not None:
        raise last_error

    raise RuntimeError(f"{source}: unknown FIRMS fetch failure.")


def fetch_all_firms_global(
    days: int = 1,
    area: str = "world",
    timeout: int = 60,
) -> pd.DataFrame:
    """
    Fetch data from all configured FIRMS near-real-time sources.
    
    Fails gracefully if individual sources have issues.
    Raises RuntimeError only if all sources fail.
    """

    all_data: List[pd.DataFrame] = []
    failed_sources = []

    for source in FIRMS_SOURCES:
        try:
            df = fetch_firms_source(
                source=source,
                days=days,
                area=area,
                timeout=timeout,
            )

            print(f"✓ {source}: {len(df):,} records received\n")
            all_data.append(df)

        except Exception as exc:
            error_msg = str(exc)
            print(f"✗ {source}: FAILED\n  Error: {error_msg}\n")
            failed_sources.append(source)

    successful_count = len(all_data)
    failed_count = len(failed_sources)
    
    print("\n" + "=" * 70)
    print(f"SUMMARY: {successful_count} succeeded, {failed_count} failed")
    if failed_sources:
        print(f"Failed sources: {', '.join(failed_sources)}")
    print("=" * 70 + "\n")

    if not all_data:
        raise RuntimeError(
            f"All FIRMS sources failed. Failed: {', '.join(failed_sources)}"
        )

    combined = pd.concat(
        all_data,
        ignore_index=True,
        sort=False,
    )

    return combined


def run_ingestion_test(
    days: int = 1,
    area: str = "world",
    timeout: int = 60,
    max_records_per_source: int = 5,
) -> Dict[str, Any]:
    """Test fetch of live FIRMS data without bulk ingestion."""

    try:
        source_counts = {}

        for source in FIRMS_SOURCES:
            df = fetch_firms_source(
                source=source,
                days=days,
                area=area,
                timeout=timeout,
            )

            limited_df = df.head(max_records_per_source)
            source_counts[source] = {
                "fetched": int(len(df)),
                "sample_used": int(len(limited_df)),
            }

        total_records = sum(
            info["fetched"] for info in source_counts.values()
        )

        return {
            "success": True,
            "total_records": total_records,
            "source_counts": source_counts,
        }

    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
            "total_records": 0,
            "source_counts": {},
        }


def ingest_firms_to_database(
    days: int = 1,
    area: str = "world",
    timeout: int = 60,
    max_records_per_source: int = 5,
) -> Dict[str, Any]:
    """Fetch FIRMS data for each source and insert into PostgreSQL.

    A value of None for max_records_per_source means full source data.
    A positive integer limits the dataset for controlled test runs.
    """

    if not init_database():
        return {
            "success": False,
            "error": "Database initialization failed",
            "sources": {},
            "total_fetched": 0,
            "total_inserted": 0,
            "total_skipped": 0,
            "total_failed": 0,
            "verification": {},
        }

    results: Dict[str, Dict[str, Any]] = {}
    total_fetched = 0
    total_inserted = 0
    total_skipped = 0
    total_failed = 0

    for source in FIRMS_SOURCES:
        try:
            source_df = fetch_firms_source(
                source=source,
                days=days,
                area=area,
                timeout=timeout,
            )

            if max_records_per_source is not None and max_records_per_source > 0:
                source_df = source_df.head(max_records_per_source)

            fetched_count = int(len(source_df))
            total_fetched += fetched_count

            inserted_count, skipped_count = insert_firms_records(
                source_df,
                source,
            )

            total_inserted += inserted_count
            total_skipped += skipped_count

            results[source] = {
                "downloaded": fetched_count,
                "fetched": fetched_count,
                "inserted": inserted_count,
                "skipped": skipped_count,
                "failed": 0,
            }

        except Exception as exc:
            total_failed += 1
            results[source] = {
                "downloaded": 0,
                "fetched": 0,
                "inserted": 0,
                "skipped": 0,
                "failed": 1,
                "error": str(exc),
            }

    try:
        verification = verify_database()
    except Exception as exc:
        verification = {"error": str(exc)}

    return {
        "success": True,
        "sources": results,
        "total_fetched": total_fetched,
        "total_inserted": total_inserted,
        "total_skipped": total_skipped,
        "total_failed": total_failed,
        "verification": verification,
    }


def ingest_all_firms_to_database(
    days: int = 1,
    area: str = "world",
    timeout: int = 60,
) -> Dict[str, Any]:
    """Run the full global FIRMS ingestion with no per-source cap."""

    return ingest_firms_to_database(
        days=days,
        area=area,
        timeout=timeout,
        max_records_per_source=None,
    )


def _print_source_summary(results: Dict[str, Any]) -> None:
    """Print per-source ingestion summary."""
    sources_dict = results.get("sources", {})
    
    if not sources_dict:
        return
    
    print("\nPER-SOURCE SUMMARY")
    print("==================")
    
    for source in FIRMS_SOURCES:
        source_stats = sources_dict.get(source, {})
        if not source_stats:
            print(f"{source}: Not processed")
            continue
        
        if source_stats.get("failed", 0) > 0:
            print(f"{source}: FAILED")
            if "error" in source_stats:
                print(f"  Error: {source_stats['error']}")
        else:
            print(f"{source}:")
            print(f"  Downloaded: {source_stats.get('downloaded', 0)}")
            print(f"  Inserted: {source_stats.get('inserted', 0)}")
            print(f"  Skipped: {source_stats.get('skipped', 0)}")
        print()


def _print_verification_summary(verification: Dict[str, Any]) -> None:
    print("DATABASE VERIFICATION")
    print("=====================")
    print(f"PostGIS: {verification.get('postgis_version', 'N/A')}")
    print(f"Table exists: {verification.get('table_exists', False)}")
    print(f"Total records: {verification.get('total_rows', 0)}")
    if verification.get("source_totals"):
        print("By source:")
        for source_name, count in verification["source_totals"]:
            print(f"  {source_name}: {count}")
    print(f"Geom rows: {verification.get('geom_count', 0)}")
    print(f"SRID 4326 rows: {verification.get('srid_count', 0)}")
    print(f"Point rows: {verification.get('point_count', 0)}")

    sample = verification.get("sample")
    if sample:
        lat, lon, frp, confidence, satellite, firms_source, geom_wkt, srid, geom_type = sample
        print("Sample:")
        print(f"Latitude: {lat}")
        print(f"Longitude: {lon}")
        print(f"FRP: {frp}")
        print(f"Confidence: {confidence}")
        print(f"Satellite: {satellite}")
        print(f"Source: {firms_source}")
        print(f"Geometry: {geom_wkt}")
        print(f"SRID: {srid}")
        print(f"Geom type: {geom_type}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ThermalWatch FIRMS ingestion commands"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run a small real-data test with limited records.",
    )
    parser.add_argument(
        "--ingest",
        action="store_true",
        help="Run the full global FIRMS ingestion for all sources.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=1,
        help="Number of days of FIRMS data to fetch per source.",
    )
    parser.add_argument(
        "--area",
        default=None,
        help="FIRMS area: 'world' for global, or 'minlon,minlat,maxlon,maxlat' for bounding box.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP read timeout in seconds for each source request.",
    )
    parser.add_argument(
        "--max-records-per-source",
        type=int,
        default=None,
        help="Limit records AFTER retrieval (post-download). Default: no limit.",
    )
    args = parser.parse_args()

    # Determine area and limits based on mode
    if args.test:
        # Small test mode: use a small geographic area
        test_area = args.area if args.area else "-73.5,-23.5,-73,-23"
        test_max_records = args.max_records_per_source if args.max_records_per_source is not None else 1
    else:
        # Production or manual mode
        test_area = args.area if args.area else "world"
        test_max_records = args.max_records_per_source

    if args.ingest:
        print()
        print("=" * 70)
        print("THERMALWATCH FIRMS FULL GLOBAL INGESTION")
        print("=" * 70)
        print(f"Days: {args.days}")
        print(f"Area: {test_area}")
        print(f"Timeout: {args.timeout}s")
        print()

        ingest_result = ingest_all_firms_to_database(
            days=args.days,
            area=test_area,
            timeout=args.timeout,
        )

        if not ingest_result["success"]:
            print(f"Database ingestion failed: {ingest_result.get('error')}")
            raise SystemExit(1)

        print(f"\nTotal fetched: {ingest_result.get('total_fetched', 0)}")
        print(f"Total inserted: {ingest_result.get('total_inserted', 0)}")
        print(f"Total skipped: {ingest_result.get('total_skipped', 0)}")
        print(f"Total failed: {ingest_result.get('total_failed', 0)}")
        _print_source_summary(ingest_result)
        _print_verification_summary(ingest_result.get("verification", {}))

        print("\n" + "=" * 70)
        print("FULL GLOBAL FIRMS INGESTION COMPLETE")
        print("=" * 70)
        raise SystemExit(0)

    # Default to test mode if neither --test nor --ingest specified
    if not args.test and not args.ingest:
        args.test = True

    if args.test:
        print()
        print("=" * 70)
        print("THERMALWATCH FIRMS SMALL REAL-DATA TEST")
        print("=" * 70)
        print(f"Days: {args.days}")
        print(f"Area: {test_area}")
        print(f"Timeout: {args.timeout}s")
        print(f"Max records per source: {test_max_records}")
        print()

        ingest_result = ingest_firms_to_database(
            days=args.days,
            area=test_area,
            timeout=args.timeout,
            max_records_per_source=test_max_records,
        )

        if not ingest_result["success"]:
            print(f"Database ingestion failed: {ingest_result.get('error')}")
            raise SystemExit(1)

        print(f"\nTotal fetched: {ingest_result.get('total_fetched', 0)}")
        print(f"Total inserted: {ingest_result.get('total_inserted', 0)}")
        print(f"Total skipped: {ingest_result.get('total_skipped', 0)}")
        print(f"Total failed: {ingest_result.get('total_failed', 0)}")
        _print_source_summary(ingest_result)
        _print_verification_summary(ingest_result.get("verification", {}))

        print("\n" + "=" * 70)
        print("SMALL REAL-DATA TEST COMPLETE")
        print("=" * 70)
        raise SystemExit(0)
