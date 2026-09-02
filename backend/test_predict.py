import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
from app.ml.pipeline import load_model, predict, load_labelled_data
from app.ml.labels import INT_TO_LABEL

TEST_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "labelled", "test_data.csv")
)

model = load_model()
df = load_labelled_data(TEST_DATA_PATH)
results = predict(model, df)

print()
print("=" * 65)
print("  ThermoIntel XGBoost - Held-Out Test Set Evaluation")
print(f"  Total samples: {len(df)}")
print("=" * 65)

correct = 0
per_class = {}

for idx, (_, row) in enumerate(results.iterrows()):
    expected   = INT_TO_LABEL[int(row["verified_label"])]
    predicted  = row["predicted_label"]
    confidence = row["confidence_score"] * 100
    match      = predicted == expected

    if match:
        correct += 1

    label = expected
    if label not in per_class:
        per_class[label] = {"correct": 0, "total": 0}
    per_class[label]["total"] += 1
    if match:
        per_class[label]["correct"] += 1

    # Build a short description from key features
    frp       = row.get("frp", "?")
    builtup   = row.get("builtup_pct", "?")
    cropland  = row.get("cropland_pct", "?")
    forest    = row.get("forest_pct", "?")
    persist   = row.get("persistence_score", "?")
    dn        = "night" if str(row.get("day_night", "D")) in ["0", "N"] else "day"
    near_ind  = int(row.get("near_industrial_facility", 0))

    desc = f"FRP {frp:.1f} | builtup {builtup:.0f}% | cropland {cropland:.0f}% | forest {forest:.0f}% | persist {persist:.2f} | {dn}"

    result_str = "PASS" if match else "FAIL"

    print(f"\nSample {idx+1}: {desc}")
    print(f"  Expected   : {expected}")
    print(f"  Predicted  : {predicted}")
    print(f"  Confidence : {confidence:.1f}%")
    print(f"  Result     : {result_str}")

accuracy = correct / len(df) * 100

print()
print("=" * 65)
print(f"\nOverall Accuracy : {correct}/{len(df)} ({accuracy:.1f}%)")
print()
print(f"  {'Class':<35} {'Correct':>7} {'Total':>6} {'Acc':>7}")
print(f"  {'-'*35} {'-'*7} {'-'*6} {'-'*7}")
for label, stats in per_class.items():
    acc = stats["correct"] / stats["total"] * 100
    print(f"  {label:<35} {stats['correct']:>7} {stats['total']:>6} {acc:>6.1f}%")

print()
print("=" * 65)
