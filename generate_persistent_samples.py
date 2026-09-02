"""
Generate synthetic persistent_thermal_source samples (label=2).
Run from project root: python generate_persistent_synthetic.py
"""
import numpy as np
import pandas as pd
import os

np.random.seed(42)
N = 40

def rand(lo, hi, n=N): return np.round(np.random.uniform(lo, hi, n), 4)
def randint(lo, hi, n=N): return np.random.randint(lo, hi+1, n)
def choice(opts, n=N): return np.random.choice(opts, n)

event_ids = [f"SYN_PTS_{str(i+1).zfill(3)}" for i in range(N)]

# Thermal — moderate stable brightness/FRP
brightness       = rand(335, 365)
frp              = rand(8, 35)
confidence       = choice([50, 80])
day_night        = choice(["day", "night"])

# OSM — near industrial, close distance
distance_to_industrial  = rand(0.3, 4.5)
near_industrial         = np.ones(N)

# Some also near refinery/powerplant
near_refinery    = choice([0, 1], N)
near_powerplant  = choice([0, 1], N)
near_mine        = np.zeros(N)
near_gas         = choice([0, 1], N)

dist_refinery    = np.where(near_refinery==1, rand(0.5, 4.5), np.nan)
dist_powerplant  = np.where(near_powerplant==1, rand(0.5, 4.5), np.nan)
dist_mine        = np.full(N, np.nan)
dist_gas         = np.where(near_gas==1, rand(0.5, 4.5), np.nan)
dist_road        = rand(0.05, 2.0)

# Land cover — industrial/builtup dominant, low forest
builtup_pct      = rand(20, 65)
forest_pct       = rand(1, 20)
cropland_pct     = rand(2, 20)
grassland_pct    = rand(5, 30)
water_pct        = np.round(np.clip(100 - builtup_pct - forest_pct - cropland_pct - grassland_pct, 0, 15), 4)

# Temporal — HIGH persistence, stable repeated detections
detections_7d    = randint(3, 7)
detections_30d   = randint(20, 30)
detections_90d   = randint(55, 90)
days_active_30d  = randint(20, 30)
persistence_score = np.round(days_active_30d / 30, 4)

mean_frp_30d     = np.round(frp + rand(-3, 3), 4)
max_frp_30d      = np.round(mean_frp_30d + rand(2, 8), 4)
mean_brightness_30d = np.round(brightness + rand(-3, 3), 4)

# Anomaly — stable, low deviation (persistent = consistent)
frp_deviation    = rand(-2, 2)
frp_ratio        = rand(0.92, 1.08)
brightness_deviation = rand(-2, 2)
brightness_ratio = rand(0.97, 1.03)

# Metadata
osm_status = [
    f"industrial:ok; refinery:{'ok' if near_refinery[i]==1 else 'not_found'}; "
    f"powerplant:{'ok' if near_powerplant[i]==1 else 'not_found'}; "
    f"mine:not_found; gas_facility:{'ok' if near_gas[i]==1 else 'not_found'}; road:ok"
    for i in range(N)
]

rows = []
for i in range(N):
    rows.append({
        "event_id": event_ids[i],
        "brightness": brightness[i],
        "frp": frp[i],
        "confidence": confidence[i],
        "day_night": day_night[i],
        "distance_to_industrial": distance_to_industrial[i],
        "distance_to_refinery": dist_refinery[i] if not np.isnan(dist_refinery[i]) else "",
        "distance_to_powerplant": dist_powerplant[i] if not np.isnan(dist_powerplant[i]) else "",
        "distance_to_mine": "",
        "distance_to_gas_facility": dist_gas[i] if not np.isnan(dist_gas[i]) else "",
        "distance_to_road": dist_road[i],
        "near_industrial_facility": near_industrial[i],
        "near_refinery": near_refinery[i],
        "near_powerplant": near_powerplant[i],
        "near_mine": 0.0,
        "near_gas_facility": near_gas[i],
        "forest_pct": forest_pct[i],
        "cropland_pct": cropland_pct[i],
        "grassland_pct": grassland_pct[i],
        "builtup_pct": builtup_pct[i],
        "water_pct": water_pct[i],
        "detections_7d": detections_7d[i],
        "detections_30d": detections_30d[i],
        "detections_90d": detections_90d[i],
        "mean_frp_30d": mean_frp_30d[i],
        "max_frp_30d": max_frp_30d[i],
        "mean_brightness_30d": mean_brightness_30d[i],
        "days_active_30d": days_active_30d[i],
        "persistence_score": persistence_score[i],
        "frp_deviation": frp_deviation[i],
        "frp_ratio": frp_ratio[i],
        "brightness_deviation": brightness_deviation[i],
        "brightness_ratio": brightness_ratio[i],
        "osm_query_status": osm_status[i],
        "data_quality_flags": "synthetic",
        "candidate_label": 2,
        "verified_label": 2,
        "verification_status": "synthetic",
    })

df = pd.DataFrame(rows)

out_path = os.path.join(
    os.path.dirname(__file__),
    "data", "labelled", "synthetic_persistent.csv"
)
df.to_csv(out_path, index=False)
print(f"Saved {len(df)} synthetic persistent thermal source samples to {out_path}")

# Append to labelled_training_data.csv
labelled_path = os.path.join(
    os.path.dirname(__file__),
    "data", "labelled", "labelled_training_data.csv"
)
existing = pd.read_csv(labelled_path)
combined = pd.concat([existing, df], ignore_index=True)
combined.to_csv(labelled_path, index=False)
print(f"Updated labelled_training_data.csv -> {len(combined)} total rows")
print(f"Label distribution:\n{combined['verified_label'].value_counts().sort_index().to_string()}")
