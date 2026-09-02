import pandas as pd, numpy as np

df = pd.read_csv("data/processed/feature_dataset.csv")

cols = [
    "brightness", "frp", "confidence",
    "forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct",
    "distance_to_road",
    "distance_to_industrial", "distance_to_refinery",
    "distance_to_powerplant", "distance_to_mine", "distance_to_gas_facility",
    "detections_7d", "detections_30d", "detections_90d",
    "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
    "days_active_30d", "persistence_score",
    "frp_deviation", "frp_ratio", "brightness_deviation", "brightness_ratio",
]

for c in cols:
    s = df[c].dropna()
    if len(s) == 0:
        print(f"{c:35s}  ALL NULL")
        continue
    print(f"{c:35s}  n={len(s):3d}  min={s.min():.3f}  p25={s.quantile(.25):.3f}  "
          f"median={s.median():.3f}  p75={s.quantile(.75):.3f}  max={s.max():.3f}")

print("\nday_night counts:")
print(df["day_night"].value_counts().to_dict())
print("\nconfidence counts:")
print(df["confidence"].value_counts().to_dict())
