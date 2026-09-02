"""
Re-run candidate + proxy labelling on the existing feature_dataset.csv.
Does NOT re-fetch FIRMS, OSM, or WorldCover data.
"""
import sys, yaml, pandas as pd
sys.path.insert(0, ".")
from src.labeling.candidate_labels import generate_candidate_labels

with open("config/config.yaml") as f:
    cfg = yaml.safe_load(f)

feature_path  = cfg["output"]["feature_dataset"]
labelled_path = cfg["output"]["labelled_dataset"]

df = pd.read_csv(feature_path)
print(f"Loaded {len(df)} rows from {feature_path}")
print()

df = generate_candidate_labels(df, cfg)
df.to_csv(feature_path, index=False)
print(f"\nFeature dataset updated: {feature_path}")

# Export proxy_verified rows as the training-ready labelled dataset
exportable = df[df["verification_status"].isin(["proxy_verified", "human_verified"])]
import os; os.makedirs(os.path.dirname(labelled_path), exist_ok=True)
exportable.to_csv(labelled_path, index=False)
print(f"Labelled dataset saved : {labelled_path}  ({len(exportable)} rows)")

print()
print("=== candidate_label distribution ===")
label_names = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}
for k, name in label_names.items():
    n = (df["candidate_label"] == k).sum()
    print(f"  {name:<15}: {n}")

print()
print("=== verified_label distribution (proxy_verified only) ===")
for k, name in label_names.items():
    n = (exportable["verified_label"] == k).sum()
    print(f"  {name:<15}: {n}")
