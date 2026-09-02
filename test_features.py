"""
Feature extraction test — 3 known real-world locations.

  1. Jamnagar refinery, Gujarat       → Industrial signals expected
  2. Uttarakhand forest zone          → Wildfire/Forest signals expected
  3. Punjab farmland                  → Agricultural signals expected

Run from project root:
    python test_features.py
"""

import sys, os
import pandas as pd
import yaml

sys.path.insert(0, os.path.dirname(__file__))

from src.osm.spatial_features import get_spatial_features
from src.worldcover.landcover_features import get_landcover_features
from src.temporal.historical_features import get_historical_features
from src.features.feature_builder import FEATURE_COLUMNS

with open("config/config.yaml") as f:
    cfg = yaml.safe_load(f)

SPATIAL_RADIUS = cfg["spatial"]["search_radius_km"]
WC_RADIUS      = cfg["worldcover"]["analysis_radius_km"]
T              = cfg["temporal"]

TEST_EVENTS = [
    {
        "event_id":   "TEST_INDUSTRIAL",
        "label_hint": "Industrial (Jamnagar refinery)",
        "latitude":   22.3072, "longitude": 69.9520,
        "brightness": 345.0, "frp": 95.0, "confidence": 88, "day_night": "night",
        "acq_date": "2024-03-15", "acq_time": "1830",
    },
    {
        "event_id":   "TEST_WILDFIRE",
        "label_hint": "Wildfire (Uttarakhand forest)",
        "latitude":   30.0668, "longitude": 79.0193,
        "brightness": 338.0, "frp": 55.0, "confidence": 75, "day_night": "day",
        "acq_date": "2024-04-10", "acq_time": "0530",
    },
    {
        "event_id":   "TEST_AGRICULTURAL",
        "label_hint": "Agricultural burning (Punjab)",
        "latitude":   30.7333, "longitude": 76.7794,
        "brightness": 332.0, "frp": 38.0, "confidence": 70, "day_night": "day",
        "acq_date": "2024-11-05", "acq_time": "0600",
    },
]

# Synthetic 90-day history: 4 past detections near each point
def _make_history(lat, lon, acq_date):
    base = pd.to_datetime(acq_date)
    return pd.DataFrame([
        {"latitude": lat + 0.001, "longitude": lon + 0.001,
         "brightness": 330.0, "frp": 40.0, "acq_date": str((base - pd.Timedelta(days=5)).date())},
        {"latitude": lat - 0.001, "longitude": lon - 0.001,
         "brightness": 328.0, "frp": 35.0, "acq_date": str((base - pd.Timedelta(days=20)).date())},
        {"latitude": lat + 0.001, "longitude": lon,
         "brightness": 335.0, "frp": 42.0, "acq_date": str((base - pd.Timedelta(days=45)).date())},
        {"latitude": lat, "longitude": lon + 0.001,
         "brightness": 327.0, "frp": 33.0, "acq_date": str((base - pd.Timedelta(days=80)).date())},
    ])

# Expected feature set (excluding label/status columns)
EXPECTED = {c for c in FEATURE_COLUMNS
            if c not in {"candidate_label", "verified_label", "verification_status",
                         "osm_query_status", "data_quality_flags"}}

print("=" * 60)
print("FEATURE EXTRACTION TEST")
print("=" * 60)

all_passed = True

for event in TEST_EVENTS:
    print(f"\n--- {event['label_hint']} ---")
    lat, lon = event["latitude"], event["longitude"]

    print("  [1/3] Querying OSM...", end=" ", flush=True)
    try:
        spatial = get_spatial_features(lat, lon, SPATIAL_RADIUS)
        osm_status = spatial.get("osm_query_status", "")
        failed_keys = [s for s in osm_status.split(";") if "query_failed" in s]
        print(f"OK  (failures: {failed_keys if failed_keys else 'none'})")
    except Exception as e:
        print(f"FAILED: {e}")
        spatial = {}
        all_passed = False

    print("  [2/3] Querying WorldCover...", end=" ", flush=True)
    try:
        landcover = get_landcover_features(lat, lon, WC_RADIUS)
        if landcover is None:
            print("FAILED (returned None — tile unavailable)")
            landcover = {}
            all_passed = False
        else:
            print("OK")
    except Exception as e:
        print(f"FAILED: {e}")
        landcover = {}
        all_passed = False

    print("  [3/3] Computing temporal features...", end=" ", flush=True)
    try:
        history_df = _make_history(lat, lon, event["acq_date"])
        temporal = get_historical_features(
            lat, lon, event["acq_date"], history_df,
            current_frp=event["frp"],
            current_brightness=event["brightness"],
            radius_km=WC_RADIUS,
            short=T["short_window_days"],
            medium=T["medium_window_days"],
            long=T["long_window_days"],
        )
        if temporal is None:
            print("FAILED (returned None — no history)")
            temporal = {}
            all_passed = False
        else:
            print("OK")
    except Exception as e:
        print(f"FAILED: {e}")
        temporal = {}
        all_passed = False

    row = {
        "event_id":   event["event_id"],
        "brightness": event["brightness"],
        "frp":        event["frp"],
        "confidence": event["confidence"],
        "day_night":  event["day_night"],
        **spatial,
        **landcover,
        **temporal,
    }

    present = {k for k in EXPECTED if k in row}
    missing = EXPECTED - present
    null_features = {k for k in present if row[k] is None}

    print(f"\n  Features present : {len(present)}/{len(EXPECTED)}")
    if missing:
        print(f"  MISSING          : {sorted(missing)}")
        all_passed = False
    else:
        print("  All features present [OK]")

    if null_features:
        print(f"  Null (failed src): {sorted(null_features)}")

    print(f"\n  OSM status       : {spatial.get('osm_query_status', 'n/a')}")

    print("\n  THERMAL")
    for k in ["brightness", "frp", "confidence", "day_night"]:
        print(f"    {k:<30} {row.get(k)}")

    print("\n  SPATIAL")
    for k in ["distance_to_industrial", "distance_to_refinery", "distance_to_powerplant",
              "distance_to_mine", "distance_to_gas_facility", "distance_to_road"]:
        print(f"    {k:<30} {row.get(k)}")

    print("\n  NEARBY FACILITIES")
    for k in ["near_industrial_facility", "near_refinery", "near_powerplant", "near_mine", "near_gas_facility"]:
        print(f"    {k:<30} {row.get(k)}")

    print("\n  LAND COVER  (builtup = urban context only, not industrial)")
    for k in ["forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct"]:
        print(f"    {k:<30} {row.get(k)}")

    print("\n  TEMPORAL")
    for k in ["detections_7d", "detections_30d", "detections_90d", "mean_frp_30d",
              "max_frp_30d", "mean_brightness_30d", "days_active_30d", "persistence_score"]:
        print(f"    {k:<30} {row.get(k)}")

    print("\n  ANOMALY")
    for k in ["frp_deviation", "frp_ratio", "brightness_deviation", "brightness_ratio"]:
        v = row.get(k)
        note = "  <- no baseline" if v is None else ""
        print(f"    {k:<30} {v}{note}")

print("\n" + "=" * 60)
print("RESULT:", "ALL TESTS PASSED" if all_passed else "SOME TESTS FAILED")
print("=" * 60)
print("\nNOTE: All outputs are UNVERIFIED CANDIDATES.")
print("Only verified_label (set during manual review) is ground truth.")
