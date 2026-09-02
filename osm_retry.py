"""
OSM Retry Script
Re-queries only the OSM keys that previously returned query_failed.
Skips keys that are already ok or not_found.
Updates feature_dataset.csv in-place, saving after every row.
Run: python osm_retry.py
"""
import sys, time, yaml, pandas as pd
sys.path.insert(0, ".")
from src.firms.parser import parse_firms
from src.osm.spatial_features import (
    _query_overpass, _nearest_from_elements,
    FACILITY_TAGS, NEAR_KEY,
    STATUS_QUERY_FAILED,
)

SLEEP_BETWEEN_KEYS = 4   # seconds between individual Overpass requests
SLEEP_BETWEEN_ROWS = 8   # seconds between rows

with open("config/config.yaml") as f:
    cfg = yaml.safe_load(f)

feature_path = cfg["output"]["feature_dataset"]
radius_km    = cfg["spatial"]["search_radius_km"]
radius_m     = int(radius_km * 1000)

# ------------------------------------------------------------------ #
# Load feature dataset and join lat/lon from raw FIRMS
# ------------------------------------------------------------------ #
df = pd.read_csv(feature_path)
print(f"Loaded {len(df)} rows from {feature_path}")

raw = pd.read_csv("data/raw/firms/firms_recent.csv")
raw_parsed, _ = parse_firms(raw)
latlon = raw_parsed[["event_id", "latitude", "longitude"]].drop_duplicates("event_id")
df = df.merge(latlon, on="event_id", how="left")

missing_latlon = df["latitude"].isna().sum()
if missing_latlon:
    print(f"  WARNING: {missing_latlon} rows have no lat/lon — they will be skipped")

# ------------------------------------------------------------------ #
# Retry only rows with at least one query_failed key
# ------------------------------------------------------------------ #
needs_retry = df["osm_query_status"].str.contains("query_failed", na=False)
print(f"Rows needing OSM retry: {needs_retry.sum()}")
print()

updated = 0

for idx, row in df[needs_retry].iterrows():
    lat = row.get("latitude")
    lon = row.get("longitude")
    if pd.isna(lat) or pd.isna(lon):
        print(f"  [{idx}] {row['event_id']} — no lat/lon, skipping")
        continue

    # Parse current per-key statuses
    status_parts = {}
    for part in str(row["osm_query_status"]).split(";"):
        part = part.strip()
        if ":" in part:
            k, v = part.split(":", 1)
            status_parts[k.strip()] = v.strip()

    failed_keys = [k for k, v in status_parts.items() if v == "query_failed"]
    if not failed_keys:
        continue

    print(f"  [{idx}] {row['event_id']}  retrying: {failed_keys}")
    row_changed = False

    for key in failed_keys:
        if key not in FACILITY_TAGS:
            continue

        elements, status = _query_overpass(FACILITY_TAGS[key], lat, lon, radius_m)

        if status == STATUS_QUERY_FAILED:
            print(f"    {key}: still failed")
            time.sleep(SLEEP_BETWEEN_KEYS)
            continue

        best = _nearest_from_elements(lat, lon, elements)
        df.at[idx, f"distance_to_{key}"] = round(best, 4) if best is not None else radius_km
        if key in NEAR_KEY:
            df.at[idx, NEAR_KEY[key]] = int(best is not None and best <= radius_km)

        status_parts[key] = "ok" if elements else "not_found"
        print(f"    {key}: {status_parts[key]}  dist={df.at[idx, f'distance_to_{key}']}")
        row_changed = True
        time.sleep(SLEEP_BETWEEN_KEYS)

    df.at[idx, "osm_query_status"] = "; ".join(f"{k}:{v}" for k, v in status_parts.items())

    # Clear osm_partial_failure flag if no keys remain failed
    if not any(v == "query_failed" for v in status_parts.values()):
        flags = str(df.at[idx, "data_quality_flags"])
        flags = flags.replace("osm_partial_failure", "").replace(";;", ";").strip("; ")
        df.at[idx, "data_quality_flags"] = flags if flags else "ok"

    if row_changed:
        updated += 1
        # Drop the temporary lat/lon columns before saving
        df.drop(columns=["latitude", "longitude"], errors="ignore").to_csv(feature_path, index=False)

    time.sleep(SLEEP_BETWEEN_ROWS)

# Final save (drop temp lat/lon columns)
df.drop(columns=["latitude", "longitude"], errors="ignore").to_csv(feature_path, index=False)

print()
print(f"OSM retry complete. {updated} rows updated.")
print(f"Feature dataset saved: {feature_path}")
print()
print("Next steps:")
print("  1. python relabel.py")
print("  2. Check wildfire uncertain count")
print("  3. If needed: set proxy_validation.wildfire.min_frp_no_baseline: 10.0 in config/config.yaml")
print("  4. python relabel.py  (again)")
