import pandas as pd

df = pd.read_csv("data/labelled/labelled_training_data.csv")
names = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}

check_cols = [
    "frp", "brightness", "persistence_score", "detections_30d",
    "forest_pct", "cropland_pct", "builtup_pct",
    "distance_to_industrial", "near_industrial_facility", "frp_ratio",
]

for label, name in names.items():
    sub = df[df["verified_label"] == label]
    src = sub["verification_status"].value_counts().to_dict()
    print(f"\n{'='*55}")
    print(f"Class {label} — {name}  (n={len(sub)}, sources={src})")
    print(f"{'='*55}")
    for col in check_cols:
        s = sub[col].dropna()
        if len(s) == 0:
            print(f"  {col:<30} ALL NULL")
        else:
            print(f"  {col:<30} min={s.min():.2f}  median={s.median():.2f}  max={s.max():.2f}")
