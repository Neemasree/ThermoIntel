"""
topup_history.py

1. Downloads the extra 60 days of FIRMS history (days 31-90)
2. Merges with the existing 30-day history cache
3. Recalculates temporal + anomaly features for all 249 rows in-memory
4. Re-runs two-pass labelling
5. Saves updated feature_dataset.csv and labelled_training_data.csv

No OSM or WorldCover calls are made — only FIRMS API + in-memory pandas.
Expected runtime: ~2 minutes.
"""

import sys, os, yaml, pandas as pd
from datetime import date, timedelta
from tqdm import tqdm

sys.path.insert(0, ".")
from src.firms.download import download_firms_history
from src.firms.parser import parse_firms
from src.temporal.historical_features import get_historical_features
from src.labeling.candidate_labels import generate_candidate_labels

with open("config/config.yaml") as f:
    cfg = yaml.safe_load(f)

src     = cfg["firms"]["source"]
country = cfg["firms"]["country"]
t       = cfg["temporal"]

feature_path  = cfg["output"]["feature_dataset"]
labelled_path = cfg["output"]["labelled_dataset"]

# ------------------------------------------------------------------ #
# 1. Load existing 30-day history cache
# ------------------------------------------------------------------ #
hist_cache = "data/raw/firms/firms_history.csv"
existing_hist = pd.read_csv(hist_cache)
existing_hist["acq_date"] = pd.to_datetime(existing_hist["acq_date"], format="mixed")
oldest_existing = existing_hist["acq_date"].min().date()
print(f"Existing history : {oldest_existing} to {existing_hist['acq_date'].max().date()}  ({len(existing_hist)} rows)")

# ------------------------------------------------------------------ #
# 2. Download the missing days (day 31 to day 90 back from yesterday)
# ------------------------------------------------------------------ #
yesterday  = date.today() - timedelta(days=1)
target_start = yesterday - timedelta(days=89)   # 90 days back
need_start   = target_start
need_end     = oldest_existing - timedelta(days=1)

if need_end < need_start:
    print("History already covers 90 days — no download needed.")
    extra_df = pd.DataFrame()
else:
    days_needed = (need_end - need_start).days + 1
    print(f"Downloading extra {days_needed} days ({need_start} to {need_end})...")

    from src.firms.download import _download_range, COUNTRY_BBOX
    import os as _os
    api_key = _os.getenv("FIRMS_API_KEY")
    if not api_key:
        from dotenv import load_dotenv; load_dotenv()
        api_key = _os.getenv("FIRMS_API_KEY")

    bbox = COUNTRY_BBOX[country.upper()]
    extra_raw = _download_range(src, bbox, days_needed, need_end, api_key)

    if extra_raw.empty:
        print("  No data returned for extra window.")
        extra_df = pd.DataFrame()
    else:
        extra_df, warnings = parse_firms(extra_raw)
        for w in warnings:
            print(f"  [WARN] {w}")
        print(f"  {len(extra_df)} extra historical records downloaded.")

# ------------------------------------------------------------------ #
# 3. Merge and save updated history cache
# ------------------------------------------------------------------ #
if not extra_df.empty:
    combined = pd.concat([existing_hist, extra_df], ignore_index=True).drop_duplicates(subset="event_id")
    combined["acq_date"] = pd.to_datetime(combined["acq_date"])
    combined.to_csv(hist_cache, index=False)
    print(f"History cache updated: {len(combined)} rows  ({combined['acq_date'].min().date()} to {combined['acq_date'].max().date()})")
    history_df = combined
else:
    history_df = existing_hist

# ------------------------------------------------------------------ #
# 4. Recalculate temporal features for all existing events in-memory
# ------------------------------------------------------------------ #
df = pd.read_csv(feature_path)
# Re-read the raw recent events to get lat/lon/acq_date (not stored in feature_dataset)
recent_raw = pd.read_csv("data/raw/firms/firms_recent.csv")
recent_parsed, _ = parse_firms(recent_raw)

# Build a lookup: event_id -> row with lat/lon/acq_date/frp/brightness
lookup = recent_parsed.set_index("event_id")

print(f"\nRecalculating temporal features for {len(df)} events...")

temporal_cols = [
    "detections_7d", "detections_30d", "detections_90d",
    "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
    "days_active_30d", "persistence_score",
    "frp_deviation", "frp_ratio", "brightness_deviation", "brightness_ratio",
]

updated = 0
for idx, feat_row in tqdm(df.iterrows(), total=len(df)):
    eid = feat_row["event_id"]
    if eid not in lookup.index:
        continue

    src_row = lookup.loc[eid]
    temporal = get_historical_features(
        lat=float(src_row["latitude"]),
        lon=float(src_row["longitude"]),
        acq_date=str(src_row["acq_date"]),
        history_df=history_df,
        current_frp=float(src_row["frp"]),
        current_brightness=float(src_row["brightness"]),
        radius_km=cfg["worldcover"]["analysis_radius_km"],
        short=t["short_window_days"],
        medium=t["medium_window_days"],
        long=90,   # always use full 90-day window here
    )
    if temporal:
        for col in temporal_cols:
            df.at[idx, col] = temporal[col]
        updated += 1

print(f"  Updated temporal features for {updated}/{len(df)} rows")

# ------------------------------------------------------------------ #
# 5. Check frp_ratio null coverage after update
# ------------------------------------------------------------------ #
null_ratio = df["frp_ratio"].isna().sum()
print(f"  frp_ratio nulls after update: {null_ratio}/{len(df)}  ({null_ratio/len(df)*100:.0f}%)")
print(f"  (remaining nulls = events not found in recent_parsed lookup)")

# ------------------------------------------------------------------ #
# 6. Re-run two-pass labelling
# ------------------------------------------------------------------ #
print("\nRe-running candidate + proxy labelling...")
df = generate_candidate_labels(df, cfg)

df.to_csv(feature_path, index=False)
print(f"\nFeature dataset saved : {feature_path}")

exportable = df[df["verification_status"].isin(["proxy_verified", "human_verified"])]
os.makedirs(os.path.dirname(labelled_path), exist_ok=True)
exportable.to_csv(labelled_path, index=False)
print(f"Labelled dataset saved: {labelled_path}  ({len(exportable)} rows)")

print()
label_names = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}
print("=== verified_label distribution ===")
for k, name in label_names.items():
    n = (exportable["verified_label"] == k).sum()
    print(f"  {name:<15}: {n}")

print()
print("=== frp_ratio stats (non-null rows) ===")
s = df["frp_ratio"].dropna()
print(f"  count={len(s)}  mean={s.mean():.3f}  min={s.min():.3f}  max={s.max():.3f}")
print(f"  first_occurrence rows (frp_ratio==1.0, detections_30d==0): "
      f"{((df['frp_ratio']==1.0) & (df['detections_30d']==0)).sum()}")
