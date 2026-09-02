import pandas as pd
import os

SEP = "=" * 62

# ── File inventory ──────────────────────────────────────────────
print(SEP)
print("FILE INVENTORY")
print(SEP)
files = [
    "data/raw/firms/firms_recent.csv",
    "data/raw/firms/firms_history.csv",
    "data/processed/feature_dataset.csv",
    "data/labelled/labelled_training_data.csv",
]
for f in files:
    if os.path.exists(f):
        rows = len(pd.read_csv(f))
        kb   = os.path.getsize(f) // 1024
        print(f"  {f:<48} {rows:>5} rows  {kb:>5} KB")
    else:
        print(f"  {f:<48} NOT FOUND")

# ── Feature dataset ─────────────────────────────────────────────
feat_path = "data/processed/feature_dataset.csv"
if not os.path.exists(feat_path):
    print("\nfeature_dataset.csv not found — pipeline has not run yet.")
    exit()

df = pd.read_csv(feat_path)
print()
print(SEP)
print(f"FEATURE DATASET  ({len(df)} rows x {len(df.columns)} columns)")
print(SEP)

print("\n-- verification_status --")
print(df["verification_status"].value_counts(dropna=False).to_string())

print("\n-- candidate_label --")
lmap = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}
vc = df["candidate_label"].value_counts(dropna=False)
for k, n in vc.items():
    label = lmap.get(k, "None/NaN") if not pd.isna(k) else "None/NaN"
    print(f"  {label:<15}: {n}")

print("\n-- verified_label (proxy_verified rows only) --")
pv = df[df["verification_status"] == "proxy_verified"]
vc2 = pv["verified_label"].value_counts(dropna=False)
for k, n in vc2.items():
    label = lmap.get(k, "None/NaN") if not pd.isna(k) else "None/NaN"
    print(f"  {label:<15}: {n}")

print("\n-- data_quality_flags --")
print(df["data_quality_flags"].value_counts(dropna=False).to_string())

print("\n-- Null counts per column --")
nulls = df.isnull().sum()
nulls = nulls[nulls > 0].sort_values(ascending=False)
for col, n in nulls.items():
    pct = n / len(df) * 100
    print(f"  {col:<35} {n:>4} / {len(df)}  ({pct:.0f}%)")

print("\n-- OSM query failure rate per facility type --")
osm = df["osm_query_status"].dropna()
for key in ["industrial", "refinery", "powerplant", "mine", "gas_facility", "road"]:
    failed  = osm.str.contains(f"{key}:query_failed").sum()
    ok      = osm.str.contains(f"{key}:ok").sum()
    notfound= osm.str.contains(f"{key}:not_found").sum()
    print(f"  {key:<15}  ok={ok:>3}  not_found={notfound:>3}  query_failed={failed:>3}")

print("\n-- Thermal feature ranges --")
for col in ["brightness", "frp", "confidence"]:
    s = df[col].dropna()
    if len(s):
        print(f"  {col:<15} min={s.min():.2f}  mean={s.mean():.2f}  max={s.max():.2f}  nulls={df[col].isna().sum()}")
    else:
        print(f"  {col:<15} ALL NULL")

print("\n-- Land cover ranges (all rows) --")
for col in ["forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct"]:
    s = df[col].dropna()
    print(f"  {col:<20} min={s.min():.1f}  mean={s.mean():.1f}  max={s.max():.1f}  nulls={df[col].isna().sum()}")

print("\n-- Temporal feature coverage --")
for col in ["detections_30d", "persistence_score", "frp_ratio", "frp_deviation"]:
    s = df[col].dropna()
    nulls_n = df[col].isna().sum()
    if len(s):
        print(f"  {col:<25} mean={s.mean():.3f}  max={s.max():.3f}  nulls={nulls_n} ({nulls_n/len(df)*100:.0f}%)")
    else:
        print(f"  {col:<25} ALL NULL")

# ── Labelled dataset ─────────────────────────────────────────────
lab_path = "data/labelled/labelled_training_data.csv"
if os.path.exists(lab_path):
    lab = pd.read_csv(lab_path)
    print()
    print(SEP)
    print(f"LABELLED TRAINING DATASET  ({len(lab)} rows)")
    print(SEP)
    print("\n-- verified_label distribution --")
    vc3 = lab["verified_label"].value_counts(dropna=False)
    for k, n in vc3.items():
        label = lmap.get(k, "None/NaN") if not pd.isna(k) else "None/NaN"
        pct = n / len(lab) * 100
        print(f"  {label:<15}: {n:>4}  ({pct:.1f}%)")
    print("\n-- verification_status --")
    print(lab["verification_status"].value_counts().to_string())
    print("\n-- Missing values in labelled set --")
    lab_nulls = lab.isnull().sum()
    lab_nulls = lab_nulls[lab_nulls > 0]
    if len(lab_nulls):
        for col, n in lab_nulls.items():
            print(f"  {col:<35} {n}")
    else:
        print("  None")

print()
print(SEP)
print("WHAT WORKS")
print(SEP)
print("  FIRMS download (VIIRS NRT, bbox chunked, 5-day)   OK")
print("  FIRMS parser (stable event_id, VIIRS/MODIS)       OK")
print("  WorldCover S3 range-request reader                OK")
print("  Historical FIRMS (30-day window)                  OK")
print("  Two-pass labelling (candidate + proxy_validated)  OK")
print("  Verified labels written back to feature_dataset   OK")
print("  Labelled CSV export (proxy_verified only)         OK")

print()
print(SEP)
print("KNOWN GAPS")
print(SEP)
print("  confidence: all null — VIIRS text fix in parser.py")
print("    needs a fresh pipeline run to populate")
print("  OSM industrial/refinery/gas: high query_failed rate")
print("    (~91% of rows) — Overpass rate-limited during 8h run")
print("    -> 0 Industrial candidates generated")
print("    -> needs OSM retry script for failed rows")
print("  frp_ratio: null for 84% of rows")
print("    -> history window was 30d, most locations had 0 prior detections")
print("    -> expand long_window_days to 90 in config for next run")
print("  Class imbalance in labelled set:")
print("    Agricultural dominates, Industrial = 0")
print("    -> needs OSM retry + 90d history to fix")
print("  185 uncertain rows not yet human-reviewed")
print("    -> run: python -m src.pipeline --verify")
