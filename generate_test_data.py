"""
Generate 65-row held-out test dataset for ThermoIntel.
Distribution: 16 industrial, 16 wildfire, 16 agricultural, 17 other
Based on real feature distributions from labelled_training_data.csv
"""
import numpy as np
import pandas as pd

rng = np.random.default_rng(seed=99)

def clip(val, lo, hi):
    return float(np.clip(val, lo, hi))

def generate_industrial(n):
    rows = []
    for i in range(n):
        frp = clip(rng.normal(30.4, 13.7), 8.0, 55.0)
        rows.append({
            "event_id":                  f"TEST-IND-{i+1:03d}",
            "brightness":                clip(rng.normal(345.9, 6.8), 335.0, 358.0),
            "frp":                       frp,
            "confidence":                int(rng.choice([50, 80], p=[0.85, 0.15])),
            "day_night":                 rng.choice(["D", "N"], p=[0.6, 0.4]),
            "distance_to_industrial":    clip(rng.normal(2.4, 1.3), 0.3, 5.0),
            "distance_to_refinery":      clip(rng.normal(4.0, 1.5), 1.0, 8.0),
            "distance_to_powerplant":    clip(rng.normal(5.0, 2.0), 1.0, 10.0),
            "distance_to_mine":          clip(rng.normal(6.0, 2.0), 1.0, 12.0),
            "distance_to_gas_facility":  clip(rng.normal(5.5, 2.0), 1.0, 10.0),
            "distance_to_road":          clip(rng.normal(0.8, 0.5), 0.1, 3.0),
            "near_industrial_facility":  int(rng.choice([0, 1], p=[0.22, 0.78])),
            "near_refinery":             int(rng.choice([0, 1], p=[0.7, 0.3])),
            "near_powerplant":           int(rng.choice([0, 1], p=[0.6, 0.4])),
            "near_mine":                 int(rng.choice([0, 1], p=[0.8, 0.2])),
            "near_gas_facility":         int(rng.choice([0, 1], p=[0.7, 0.3])),
            "forest_pct":                clip(rng.normal(19.0, 10.5), 1.0, 44.0),
            "cropland_pct":              clip(rng.normal(13.9, 8.7), 0.5, 39.0),
            "grassland_pct":             clip(rng.normal(18.0, 8.0), 2.0, 40.0),
            "builtup_pct":               clip(rng.normal(32.3, 14.9), 9.0, 68.0),
            "water_pct":                 clip(rng.normal(5.0, 3.0), 0.0, 15.0),
            "detections_7d":             int(clip(rng.normal(5.5, 2.0), 2, 10)),
            "detections_30d":            int(clip(rng.normal(22.2, 7.6), 8, 35)),
            "detections_90d":            int(clip(rng.normal(60.0, 15.0), 25, 90)),
            "mean_frp_30d":              clip(rng.normal(frp - 1.0, 3.0), 5.0, 55.0),
            "max_frp_30d":               clip(rng.normal(frp + 5.0, 4.0), frp, 60.0),
            "mean_brightness_30d":       clip(rng.normal(345.0, 5.0), 335.0, 358.0),
            "days_active_30d":           int(clip(rng.normal(18.0, 5.0), 8, 30)),
            "persistence_score":         clip(rng.normal(0.50, 0.23), 0.10, 1.0),
            "frp_deviation":             clip(rng.normal(3.0, 6.8), -8.0, 22.0),
            "frp_ratio":                 clip(rng.normal(1.13, 0.28), 0.67, 1.55),
            "brightness_deviation":      clip(rng.normal(0.5, 2.0), -3.0, 6.0),
            "brightness_ratio":          clip(rng.normal(1.01, 0.02), 0.97, 1.06),
            "osm_query_status":          "success",
            "data_quality_flags":        "none",
            "candidate_label":           0,
            "verified_label":            0,
            "verification_status":       "verified",
        })
    return rows


def generate_wildfire(n):
    rows = []
    for i in range(n):
        frp = clip(rng.normal(21.5, 11.0), 7.0, 43.0)
        frp_dev = clip(rng.normal(7.3, 8.7), 0.0, 33.0)
        rows.append({
            "event_id":                  f"TEST-WLD-{i+1:03d}",
            "brightness":                clip(rng.normal(348.8, 9.8), 334.0, 365.0),
            "frp":                       frp,
            "confidence":                int(rng.choice([50, 80], p=[0.7, 0.3])),
            "day_night":                 rng.choice(["D", "N"], p=[0.9, 0.1]),
            "distance_to_industrial":    clip(rng.normal(3.8, 0.65), 2.7, 5.0),
            "distance_to_refinery":      clip(rng.normal(6.0, 1.5), 3.0, 10.0),
            "distance_to_powerplant":    clip(rng.normal(7.0, 2.0), 3.0, 12.0),
            "distance_to_mine":          clip(rng.normal(8.0, 2.0), 3.0, 14.0),
            "distance_to_gas_facility":  clip(rng.normal(7.0, 2.0), 3.0, 12.0),
            "distance_to_road":          clip(rng.normal(3.0, 1.0), 1.0, 6.0),
            "near_industrial_facility":  0,
            "near_refinery":             0,
            "near_powerplant":           0,
            "near_mine":                 0,
            "near_gas_facility":         0,
            "forest_pct":                clip(rng.normal(71.5, 7.9), 57.0, 90.0),
            "cropland_pct":              clip(rng.normal(7.6, 5.2), 0.0, 22.0),
            "grassland_pct":             clip(rng.normal(12.0, 5.0), 2.0, 25.0),
            "builtup_pct":               clip(rng.normal(2.5, 2.2), 0.0, 8.0),
            "water_pct":                 clip(rng.normal(3.0, 2.0), 0.0, 8.0),
            "detections_7d":             int(clip(rng.normal(1.3, 0.8), 0, 4)),
            "detections_30d":            int(clip(rng.normal(1.4, 1.4), 0, 4)),
            "detections_90d":            int(clip(rng.normal(2.0, 1.5), 0, 6)),
            "mean_frp_30d":              clip(rng.normal(10.0, 3.0), 3.0, 20.0),
            "max_frp_30d":               clip(rng.normal(frp + 2.0, 3.0), frp, 45.0),
            "mean_brightness_30d":       clip(rng.normal(340.0, 5.0), 330.0, 352.0),
            "days_active_30d":           int(clip(rng.normal(1.2, 0.8), 0, 4)),
            "persistence_score":         clip(rng.normal(0.02, 0.03), 0.0, 0.10),
            "frp_deviation":             frp_dev,
            "frp_ratio":                 clip(rng.normal(1.95, 1.41), 1.0, 7.5),
            "brightness_deviation":      clip(rng.normal(8.0, 5.0), 0.0, 25.0),
            "brightness_ratio":          clip(rng.normal(1.04, 0.03), 1.0, 1.12),
            "osm_query_status":          "success",
            "data_quality_flags":        "none",
            "candidate_label":           1,
            "verified_label":            1,
            "verification_status":       "verified",
        })
    return rows


def generate_agricultural(n):
    rows = []
    for i in range(n):
        frp = clip(rng.normal(14.7, 9.9), 1.0, 35.0)
        rows.append({
            "event_id":                  f"TEST-AGR-{i+1:03d}",
            "brightness":                clip(rng.normal(344.7, 9.3), 330.0, 367.0),
            "frp":                       frp,
            "confidence":                int(rng.choice([20, 50, 80], p=[0.1, 0.75, 0.15])),
            "day_night":                 rng.choice(["D", "N"], p=[0.95, 0.05]),
            "distance_to_industrial":    clip(rng.normal(2.3, 1.3), 0.3, 5.0),
            "distance_to_refinery":      clip(rng.normal(5.0, 1.5), 2.0, 9.0),
            "distance_to_powerplant":    clip(rng.normal(6.0, 2.0), 2.0, 11.0),
            "distance_to_mine":          clip(rng.normal(7.0, 2.0), 2.0, 13.0),
            "distance_to_gas_facility":  clip(rng.normal(6.0, 2.0), 2.0, 11.0),
            "distance_to_road":          clip(rng.normal(0.5, 0.3), 0.05, 1.5),
            "near_industrial_facility":  int(rng.choice([0, 1], p=[0.32, 0.68])),
            "near_refinery":             int(rng.choice([0, 1], p=[0.8, 0.2])),
            "near_powerplant":           int(rng.choice([0, 1], p=[0.85, 0.15])),
            "near_mine":                 int(rng.choice([0, 1], p=[0.9, 0.1])),
            "near_gas_facility":         int(rng.choice([0, 1], p=[0.85, 0.15])),
            "forest_pct":                clip(rng.normal(10.3, 6.4), 0.0, 27.0),
            "cropland_pct":              clip(rng.normal(41.7, 35.2), 2.0, 100.0),
            "grassland_pct":             clip(rng.normal(15.0, 8.0), 1.0, 35.0),
            "builtup_pct":               clip(rng.normal(27.0, 24.4), 0.0, 65.0),
            "water_pct":                 clip(rng.normal(3.0, 2.5), 0.0, 10.0),
            "detections_7d":             int(clip(rng.normal(1.5, 2.0), 0, 7)),
            "detections_30d":            int(clip(rng.normal(14.2, 12.6), 0, 30)),
            "detections_90d":            int(clip(rng.normal(20.0, 15.0), 0, 55)),
            "mean_frp_30d":              clip(rng.normal(frp - 2.0, 3.0), 1.0, 35.0),
            "max_frp_30d":               clip(rng.normal(frp + 3.0, 3.0), frp, 38.0),
            "mean_brightness_30d":       clip(rng.normal(343.0, 6.0), 330.0, 358.0),
            "days_active_30d":           int(clip(rng.normal(8.0, 8.0), 0, 25)),
            "persistence_score":         clip(rng.normal(0.48, 0.42), 0.0, 1.0),
            "frp_deviation":             clip(rng.normal(0.12, 0.9), -2.0, 2.0),
            "frp_ratio":                 clip(rng.normal(1.00, 0.03), 0.92, 1.08),
            "brightness_deviation":      clip(rng.normal(0.0, 1.0), -2.0, 2.0),
            "brightness_ratio":          clip(rng.normal(1.00, 0.01), 0.97, 1.03),
            "osm_query_status":          "success",
            "data_quality_flags":        "none",
            "candidate_label":           2,
            "verified_label":            2,
            "verification_status":       "verified",
        })
    return rows


def generate_other(n):
    rows = []
    for i in range(n):
        frp = clip(rng.normal(9.1, 4.4), 1.5, 22.0)
        rows.append({
            "event_id":                  f"TEST-OTH-{i+1:03d}",
            "brightness":                clip(rng.normal(342.6, 6.1), 332.0, 354.0),
            "frp":                       frp,
            "confidence":                int(rng.choice([20, 50], p=[0.3, 0.7])),
            "day_night":                 rng.choice(["D", "N"], p=[0.6, 0.4]),
            "distance_to_industrial":    clip(rng.normal(3.5, 0.83), 2.1, 5.0),
            "distance_to_refinery":      clip(rng.normal(5.5, 1.5), 2.5, 9.0),
            "distance_to_powerplant":    clip(rng.normal(6.5, 2.0), 2.5, 11.0),
            "distance_to_mine":          clip(rng.normal(7.5, 2.0), 2.5, 13.0),
            "distance_to_gas_facility":  clip(rng.normal(6.5, 2.0), 2.5, 11.0),
            "distance_to_road":          clip(rng.normal(1.5, 0.8), 0.2, 4.0),
            "near_industrial_facility":  0,
            "near_refinery":             0,
            "near_powerplant":           0,
            "near_mine":                 0,
            "near_gas_facility":         0,
            "forest_pct":                clip(rng.normal(26.1, 13.7), 1.0, 45.0),
            "cropland_pct":              clip(rng.normal(31.0, 7.3), 18.0, 49.0),
            "grassland_pct":             clip(rng.normal(25.0, 10.0), 5.0, 50.0),
            "builtup_pct":               clip(rng.normal(13.9, 10.9), 2.0, 37.0),
            "water_pct":                 clip(rng.normal(5.0, 3.0), 0.0, 12.0),
            "detections_7d":             int(clip(rng.normal(0.8, 0.8), 0, 3)),
            "detections_30d":            int(clip(rng.normal(2.1, 1.8), 0, 7)),
            "detections_90d":            int(clip(rng.normal(4.0, 3.0), 0, 12)),
            "mean_frp_30d":              clip(rng.normal(frp - 1.0, 2.0), 1.0, 22.0),
            "max_frp_30d":               clip(rng.normal(frp + 2.0, 2.0), frp, 25.0),
            "mean_brightness_30d":       clip(rng.normal(341.0, 5.0), 330.0, 352.0),
            "days_active_30d":           int(clip(rng.normal(1.5, 1.2), 0, 5)),
            "persistence_score":         clip(rng.normal(0.03, 0.04), 0.0, 0.17),
            "frp_deviation":             clip(rng.normal(2.3, 2.7), -2.0, 12.0),
            "frp_ratio":                 clip(rng.normal(1.60, 0.84), 0.91, 4.8),
            "brightness_deviation":      clip(rng.normal(1.0, 1.5), -2.0, 5.0),
            "brightness_ratio":          clip(rng.normal(1.02, 0.03), 0.97, 1.08),
            "osm_query_status":          "success",
            "data_quality_flags":        "none",
            "candidate_label":           3,
            "verified_label":            3,
            "verification_status":       "verified",
        })
    return rows


rows = (
    generate_industrial(16)
    + generate_wildfire(16)
    + generate_agricultural(16)
    + generate_other(17)
)

df = pd.DataFrame(rows)
df = df.sample(frac=1, random_state=99).reset_index(drop=True)

out_path = "data/labelled/test_data.csv"
df.to_csv(out_path, index=False)

print(f"Generated {len(df)} test rows -> {out_path}")
print(df["verified_label"].value_counts().sort_index().rename({0:"industrial",1:"wildfire",2:"agricultural",3:"other"}))
