import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
from app.ml.pipeline import load_model, predict

model = load_model()

# 4 test samples representing each class scenario
samples = pd.DataFrame([
    {
        # Sample 1 - Expected: Industrial Thermal Source
        # Close to industry, high builtup, persistent detections day & night
        "brightness": 345.0, "frp": 25.0, "confidence": 50, "day_night": "day",
        "distance_to_industrial": 1.5, "distance_to_refinery": None,
        "distance_to_powerplant": None, "distance_to_mine": None,
        "distance_to_gas_facility": None, "distance_to_road": 0.5,
        "near_industrial_facility": 1, "near_refinery": 0,
        "near_powerplant": 0, "near_mine": 0, "near_gas_facility": 0,
        "forest_pct": 5.0, "cropland_pct": 10.0, "grassland_pct": 15.0,
        "builtup_pct": 60.0, "water_pct": 10.0,
        "detections_7d": 5, "detections_30d": 20, "detections_90d": 60,
        "mean_frp_30d": 24.0, "max_frp_30d": 35.0, "mean_brightness_30d": 344.0,
        "days_active_30d": 18, "persistence_score": 0.6,
        "frp_deviation": 1.0, "frp_ratio": 1.05,
        "brightness_deviation": 0.5, "brightness_ratio": 1.01,
    },
    {
        # Sample 2 - Expected: Wildfire
        # Deep forest, sudden high FRP spike, very low persistence
        "brightness": 362.0, "frp": 42.0, "confidence": 80, "day_night": "day",
        "distance_to_industrial": 4.8, "distance_to_refinery": None,
        "distance_to_powerplant": None, "distance_to_mine": None,
        "distance_to_gas_facility": None, "distance_to_road": 3.0,
        "near_industrial_facility": 0, "near_refinery": 0,
        "near_powerplant": 0, "near_mine": 0, "near_gas_facility": 0,
        "forest_pct": 78.0, "cropland_pct": 5.0, "grassland_pct": 12.0,
        "builtup_pct": 2.0, "water_pct": 3.0,
        "detections_7d": 1, "detections_30d": 2, "detections_90d": 3,
        "mean_frp_30d": 10.0, "max_frp_30d": 42.0, "mean_brightness_30d": 340.0,
        "days_active_30d": 1, "persistence_score": 0.03,
        "frp_deviation": 32.0, "frp_ratio": 4.2,
        "brightness_deviation": 22.0, "brightness_ratio": 1.06,
    },
    {
        # Sample 3 - Expected: Agricultural Burning
        # High cropland, low FRP, near road, zero detection history
        "brightness": 336.0, "frp": 5.5, "confidence": 50, "day_night": "day",
        "distance_to_industrial": 4.2, "distance_to_refinery": None,
        "distance_to_powerplant": None, "distance_to_mine": None,
        "distance_to_gas_facility": None, "distance_to_road": 0.3,
        "near_industrial_facility": 0, "near_refinery": 0,
        "near_powerplant": 0, "near_mine": 0, "near_gas_facility": 0,
        "forest_pct": 6.0, "cropland_pct": 88.0, "grassland_pct": 4.0,
        "builtup_pct": 2.0, "water_pct": 0.0,
        "detections_7d": 0, "detections_30d": 0, "detections_90d": 0,
        "mean_frp_30d": None, "max_frp_30d": None, "mean_brightness_30d": None,
        "days_active_30d": 0, "persistence_score": 0.0,
        "frp_deviation": 0.0, "frp_ratio": 1.0,
        "brightness_deviation": 0.0, "brightness_ratio": 1.0,
    },
    {
        # Sample 4 - Expected: Other/Uncertain
        # Mixed land, low FRP, night detection, no industry, minimal history
        "brightness": 331.0, "frp": 3.2, "confidence": 20, "day_night": "night",
        "distance_to_industrial": None, "distance_to_refinery": None,
        "distance_to_powerplant": None, "distance_to_mine": None,
        "distance_to_gas_facility": None, "distance_to_road": 1.5,
        "near_industrial_facility": 0, "near_refinery": 0,
        "near_powerplant": 0, "near_mine": 0, "near_gas_facility": 0,
        "forest_pct": 28.0, "cropland_pct": 22.0, "grassland_pct": 38.0,
        "builtup_pct": 6.0, "water_pct": 6.0,
        "detections_7d": 0, "detections_30d": 1, "detections_90d": 2,
        "mean_frp_30d": None, "max_frp_30d": None, "mean_brightness_30d": None,
        "days_active_30d": 1, "persistence_score": 0.03,
        "frp_deviation": 0.0, "frp_ratio": 1.0,
        "brightness_deviation": 0.0, "brightness_ratio": 1.0,
    },
])

EXPECTED = [
    "industrial_thermal_source",
    "wildfire",
    "agricultural_burning",
    "other_uncertain",
]

DESCRIPTIONS = [
    "Near industry | high builtup 60% | persistent 18/30 days",
    "Deep forest 78% | FRP spike x4.2 | only 1 detection",
    "Cropland 88% | low FRP 5.5 | zero history",
    "Mixed land | low FRP 3.2 | night | no industry",
]

results = predict(model, samples)

print()
print("=" * 65)
print("  ThermoIntel XGBoost - Prediction Test")
print("=" * 65)

for i, row in results.iterrows():
    predicted = row["predicted_label"]
    confidence = row["confidence_score"] * 100
    expected = EXPECTED[i]
    match = "PASS" if predicted == expected else "FAIL"

    print(f"\nSample {i+1}: {DESCRIPTIONS[i]}")
    print(f"  Expected   : {expected}")
    print(f"  Predicted  : {predicted}")
    print(f"  Confidence : {confidence:.1f}%")
    print(f"  Result     : {match}")

print()
print("=" * 65)
