"""
generate_synthetic.py

Generates synthetic training rows for:
  Class 0 — Industrial Thermal Source   (40 rows)
  Class 1 — Wildfire top-up             (32 rows, brings total to ~40)
  Class 3 — Other / Unclassified        (40 rows)

Design principles:
  - Value ranges derived from real feature_dataset.csv distributions
  - Class-specific patterns from domain knowledge (not single-feature rules)
  - Deliberate overlap between classes so XGBoost learns combinations
  - verification_status = "synthetic", data_quality_flags includes "synthetic"
  - Coordinates are geographically plausible (within real operating bbox)
  - event_id prefixed SYN_ to distinguish from real FIRMS events
"""

import numpy as np
import pandas as pd
import os

rng = np.random.default_rng(42)

# ------------------------------------------------------------------ #
# Column order must match feature_dataset.csv exactly
# ------------------------------------------------------------------ #
COLUMNS = [
    "event_id", "brightness", "frp", "confidence", "day_night",
    "distance_to_industrial", "distance_to_refinery", "distance_to_powerplant",
    "distance_to_mine", "distance_to_gas_facility", "distance_to_road",
    "near_industrial_facility", "near_refinery", "near_powerplant",
    "near_mine", "near_gas_facility",
    "forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct",
    "detections_7d", "detections_30d", "detections_90d",
    "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
    "days_active_30d", "persistence_score",
    "frp_deviation", "frp_ratio", "brightness_deviation", "brightness_ratio",
    "osm_query_status", "data_quality_flags",
    "candidate_label", "verified_label", "verification_status",
]

# ------------------------------------------------------------------ #
# Geographic anchor points — real sub-regions within operating bbox
# Avoids ocean / implausible locations
# ------------------------------------------------------------------ #
# Sri Lanka interior (lat 6.5-9.5, lon 80.0-81.5)
# South India (lat 10-14, lon 76-80)
# Pakistan interior (lat 27-31, lon 68-73)
GEO_REGIONS = [
    (6.5,  9.5,  80.0, 81.5),   # Sri Lanka interior
    (10.0, 14.0, 76.0, 80.0),   # South India
    (27.0, 31.0, 68.0, 73.0),   # Pakistan interior
]

def _rand_coord(n, region_weights=(0.6, 0.3, 0.1)):
    """Sample n (lat, lon) pairs from geographic regions."""
    lats, lons = [], []
    regions = rng.choice(len(GEO_REGIONS), size=n, p=region_weights)
    for r in regions:
        lat_min, lat_max, lon_min, lon_max = GEO_REGIONS[r]
        lats.append(round(rng.uniform(lat_min, lat_max), 5))
        lons.append(round(rng.uniform(lon_min, lon_max), 5))
    return lats, lons


def _clip(arr, lo, hi):
    return np.clip(arr, lo, hi)


def _round(arr, decimals=2):
    return np.round(arr, decimals)


def _osm_status(dist_ind, near_ind, dist_road):
    """Build osm_query_status string from synthetic OSM values."""
    parts = []
    parts.append(f"industrial:{'ok' if dist_ind is not None else 'not_found'}")
    parts.append("refinery:not_found")
    parts.append("powerplant:not_found")
    parts.append("mine:not_found")
    parts.append("gas_facility:not_found")
    parts.append(f"road:{'ok' if dist_road is not None else 'not_found'}")
    return "; ".join(parts)


# ------------------------------------------------------------------ #
# CLASS 0 — Industrial Thermal Source (40 rows)
#
# Domain pattern:
#   - Moderate-high FRP, relatively stable (not extreme spikes)
#   - Persistent: detections_30d 8-35, persistence_score 0.25-0.80
#   - frp_ratio near 1.0 (stable output, not anomalous spike)
#   - Near industrial infrastructure (with overlap — not every row)
#   - Mixed land-cover: some built-up, some grassland, low forest/cropland
#   - Active day AND night (real industrial sources burn 24h)
# ------------------------------------------------------------------ #
def generate_industrial(n=40):
    rows = []
    lats, lons = _rand_coord(n, region_weights=(0.4, 0.5, 0.1))

    for i in range(n):
        # Thermal — moderate-high, stable
        brightness  = round(rng.uniform(335, 358), 2)
        frp         = round(rng.uniform(8, 55), 2)
        confidence  = rng.choice([50, 50, 50, 80], p=[0.4, 0.3, 0.2, 0.1])  # mostly nominal
        day_night   = rng.choice(["day", "night"], p=[0.55, 0.45])

        # OSM — industrial proximity with realistic spread (not all close)
        # ~70% have a confirmed industrial facility within radius
        has_industrial = rng.random() < 0.70
        if has_industrial:
            dist_ind  = round(rng.uniform(0.2, 3.5), 4)
            near_ind  = 1 if dist_ind <= 5.0 else 0
        else:
            dist_ind  = round(rng.uniform(3.5, 5.0), 4)
            near_ind  = 0

        # Refinery/powerplant — occasional
        has_refinery = rng.random() < 0.25
        dist_ref     = round(rng.uniform(0.5, 4.0), 4) if has_refinery else None
        near_ref     = 1 if has_refinery and dist_ref <= 5.0 else 0

        has_pp   = rng.random() < 0.30
        dist_pp  = round(rng.uniform(0.8, 4.5), 4) if has_pp else None
        near_pp  = 1 if has_pp and dist_pp <= 5.0 else 0

        dist_mine = None
        near_mine = 0
        dist_gas  = None
        near_gas  = 0

        # Roads — industrial areas are near roads
        dist_road = round(rng.uniform(0.05, 1.5), 4)

        # Land-cover — mixed industrial/built-up, low forest/cropland
        builtup   = round(rng.uniform(5, 35), 2)
        grassland = round(rng.uniform(5, 30), 2)
        forest    = round(rng.uniform(0, 20), 2)
        cropland  = round(rng.uniform(0, 15), 2)
        water     = round(max(0, rng.uniform(0, 5)), 2)
        total     = builtup + grassland + forest + cropland + water
        scale     = 100 / total
        builtup, grassland, forest, cropland, water = (
            round(builtup*scale, 2), round(grassland*scale, 2),
            round(forest*scale, 2),  round(cropland*scale, 2),
            round(water*scale, 2)
        )

        # Temporal — persistent, repeated detections
        det_30  = int(rng.integers(8, 36))
        det_7   = int(rng.integers(1, min(det_30, 8) + 1))
        det_90  = int(rng.integers(det_30, max(det_30 + 1, 71)))
        days_30 = int(rng.integers(max(1, det_30 // 3), min(30, det_30) + 1))
        persist = round(days_30 / 30, 4)

        mean_frp_30   = round(rng.uniform(frp * 0.6, frp * 1.3), 4)
        max_frp_30    = round(mean_frp_30 * rng.uniform(1.1, 2.0), 4)
        mean_bright_30 = round(rng.uniform(brightness - 8, brightness + 5), 4)

        # Anomaly — stable ratio (industrial output doesn't spike wildly)
        frp_ratio    = round(rng.uniform(0.65, 1.55), 4)
        frp_dev      = round(frp - mean_frp_30, 4)
        bright_ratio = round(rng.uniform(0.97, 1.06), 4)
        bright_dev   = round(brightness - mean_bright_30, 4)

        osm_status = _osm_status(dist_ind, near_ind, dist_road)

        rows.append({
            "event_id":               f"SYN_IND_{i+1:03d}",
            "brightness":             brightness,
            "frp":                    frp,
            "confidence":             float(confidence),
            "day_night":              day_night,
            "distance_to_industrial": dist_ind,
            "distance_to_refinery":   dist_ref,
            "distance_to_powerplant": dist_pp,
            "distance_to_mine":       dist_mine,
            "distance_to_gas_facility": dist_gas,
            "distance_to_road":       dist_road,
            "near_industrial_facility": float(near_ind),
            "near_refinery":          float(near_ref),
            "near_powerplant":        float(near_pp),
            "near_mine":              float(near_mine),
            "near_gas_facility":      float(near_gas),
            "forest_pct":             forest,
            "cropland_pct":           cropland,
            "grassland_pct":          grassland,
            "builtup_pct":            builtup,
            "water_pct":              water,
            "detections_7d":          det_7,
            "detections_30d":         det_30,
            "detections_90d":         det_90,
            "mean_frp_30d":           mean_frp_30,
            "max_frp_30d":            max_frp_30,
            "mean_brightness_30d":    mean_bright_30,
            "days_active_30d":        days_30,
            "persistence_score":      persist,
            "frp_deviation":          frp_dev,
            "frp_ratio":              frp_ratio,
            "brightness_deviation":   bright_dev,
            "brightness_ratio":       bright_ratio,
            "osm_query_status":       osm_status,
            "data_quality_flags":     "synthetic",
            "candidate_label":        0,
            "verified_label":         0,
            "verification_status":    "synthetic",
        })
    return rows


# ------------------------------------------------------------------ #
# CLASS 1 — Wildfire top-up (32 rows, brings total to ~40)
#
# Domain pattern:
#   - Higher FRP spikes (fires are intense but brief)
#   - High forest_pct (primary signal)
#   - Low persistence (temporary event)
#   - frp_ratio > 1 (current event exceeds historical baseline)
#   - No industrial proximity
#   - Mostly daytime detection
# ------------------------------------------------------------------ #
def generate_wildfire(n=32):
    rows = []
    lats, lons = _rand_coord(n, region_weights=(0.5, 0.4, 0.1))

    for i in range(n):
        brightness  = round(rng.uniform(333, 365), 2)
        frp         = round(rng.uniform(6, 45), 2)
        confidence  = rng.choice([50, 80, 20], p=[0.55, 0.30, 0.15])
        day_night   = rng.choice(["day", "night"], p=[0.80, 0.20])

        # No industrial proximity — but allow occasional accidental nearness
        has_industrial = rng.random() < 0.10
        dist_ind  = round(rng.uniform(2.5, 5.0), 4) if not has_industrial else round(rng.uniform(1.5, 4.0), 4)
        near_ind  = 0
        dist_ref  = None
        near_ref  = 0
        dist_pp   = None
        near_pp   = 0
        dist_mine = None
        near_mine = 0
        dist_gas  = None
        near_gas  = 0

        # Roads — wildfires can be near or far from roads
        dist_road = round(rng.uniform(0.1, 3.5), 4)

        # Land-cover — high forest, low cropland/built-up
        forest    = round(rng.uniform(45, 92), 2)
        grassland = round(rng.uniform(3, 25), 2)
        cropland  = round(rng.uniform(0, 12), 2)
        builtup   = round(rng.uniform(0, 5), 2)
        water     = round(max(0, rng.uniform(0, 4)), 2)
        total     = forest + grassland + cropland + builtup + water
        scale     = 100 / total
        forest, grassland, cropland, builtup, water = (
            round(forest*scale, 2), round(grassland*scale, 2),
            round(cropland*scale, 2), round(builtup*scale, 2),
            round(water*scale, 2)
        )

        # Temporal — low persistence, occasional prior detections
        det_30  = int(rng.integers(0, 5))
        det_7   = int(rng.integers(0, min(det_30 + 1, 3)))
        det_90  = int(rng.integers(det_30, max(det_30 + 1, 10)))
        days_30 = int(rng.integers(0, max(1, det_30) + 1))
        persist = round(days_30 / 30, 4)

        has_history = det_30 > 0
        if has_history:
            mean_frp_30    = round(rng.uniform(3, frp * 0.8), 4)
            max_frp_30     = round(mean_frp_30 * rng.uniform(1.2, 2.5), 4)
            mean_bright_30 = round(rng.uniform(330, brightness - 2), 4)
            frp_ratio      = round(frp / mean_frp_30, 4)
            frp_dev        = round(frp - mean_frp_30, 4)
            bright_ratio   = round(brightness / mean_bright_30, 4)
            bright_dev     = round(brightness - mean_bright_30, 4)
        else:
            mean_frp_30    = None
            max_frp_30     = None
            mean_bright_30 = None
            frp_ratio      = 1.0
            frp_dev        = 0.0
            bright_ratio   = 1.0
            bright_dev     = 0.0

        osm_status = _osm_status(dist_ind, near_ind, dist_road)

        rows.append({
            "event_id":               f"SYN_WF_{i+1:03d}",
            "brightness":             brightness,
            "frp":                    frp,
            "confidence":             float(confidence),
            "day_night":              day_night,
            "distance_to_industrial": dist_ind,
            "distance_to_refinery":   dist_ref,
            "distance_to_powerplant": dist_pp,
            "distance_to_mine":       dist_mine,
            "distance_to_gas_facility": dist_gas,
            "distance_to_road":       dist_road,
            "near_industrial_facility": float(near_ind),
            "near_refinery":          float(near_ref),
            "near_powerplant":        float(near_pp),
            "near_mine":              float(near_mine),
            "near_gas_facility":      float(near_gas),
            "forest_pct":             forest,
            "cropland_pct":           cropland,
            "grassland_pct":          grassland,
            "builtup_pct":            builtup,
            "water_pct":              water,
            "detections_7d":          det_7,
            "detections_30d":         det_30,
            "detections_90d":         det_90,
            "mean_frp_30d":           mean_frp_30,
            "max_frp_30d":            max_frp_30,
            "mean_brightness_30d":    mean_bright_30,
            "days_active_30d":        days_30,
            "persistence_score":      persist,
            "frp_deviation":          frp_dev,
            "frp_ratio":              frp_ratio,
            "brightness_deviation":   bright_dev,
            "brightness_ratio":       bright_ratio,
            "osm_query_status":       osm_status,
            "data_quality_flags":     "synthetic",
            "candidate_label":        1,
            "verified_label":         1,
            "verification_status":    "synthetic",
        })
    return rows


# ------------------------------------------------------------------ #
# CLASS 3 — Other / Unclassified Thermal Anomaly (40 rows)
#
# Domain pattern:
#   - Moderate FRP and brightness (not extreme)
#   - Low or irregular persistence (not clearly industrial)
#   - Mixed land-cover — no dominant class
#   - Some proximity to roads/built-up (urban heat, waste burning, etc.)
#   - No strong industrial proximity
#   - No strong agricultural or wildfire signature
#   - Deliberately sits near decision boundaries of other classes
#
# Sub-types mixed in:
#   ~35% urban heat / waste burning  — high builtup, near roads, low FRP
#   ~35% ambiguous mixed land        — no dominant land-cover, moderate FRP
#   ~30% boundary cases              — just below thresholds of classes 0/1/2
# ------------------------------------------------------------------ #
def generate_other(n=40):
    rows = []
    lats, lons = _rand_coord(n, region_weights=(0.5, 0.35, 0.15))

    subtypes = rng.choice(["urban", "mixed", "boundary"], size=n, p=[0.35, 0.35, 0.30])

    for i in range(n):
        stype = subtypes[i]

        if stype == "urban":
            brightness = round(rng.uniform(331, 348), 2)
            frp        = round(rng.uniform(1.5, 12), 2)
            builtup    = round(rng.uniform(8, 30), 2)
            forest     = round(rng.uniform(0, 15), 2)
            cropland   = round(rng.uniform(5, 25), 2)
            grassland  = round(rng.uniform(10, 35), 2)
            water      = round(rng.uniform(0, 8), 2)
            dist_road  = round(rng.uniform(0.05, 0.8), 4)
            det_30     = int(rng.integers(0, 6))
            persist    = round(rng.integers(0, max(1, det_30) + 1) / 30, 4)

        elif stype == "mixed":
            brightness = round(rng.uniform(332, 352), 2)
            frp        = round(rng.uniform(3, 18), 2)
            # No dominant land-cover class
            forest     = round(rng.uniform(10, 40), 2)
            cropland   = round(rng.uniform(10, 35), 2)
            grassland  = round(rng.uniform(10, 35), 2)
            builtup    = round(rng.uniform(1, 12), 2)
            water      = round(rng.uniform(0, 6), 2)
            dist_road  = round(rng.uniform(0.2, 2.5), 4)
            det_30     = int(rng.integers(0, 4))
            persist    = round(rng.integers(0, max(1, det_30) + 1) / 30, 4)

        else:  # boundary — just below class thresholds
            brightness = round(rng.uniform(333, 355), 2)
            frp        = round(rng.uniform(4, 22), 2)
            # Forest just below wildfire threshold (40%)
            # Cropland just below agricultural threshold (40%)
            forest     = round(rng.uniform(25, 42), 2)
            cropland   = round(rng.uniform(25, 42), 2)
            grassland  = round(rng.uniform(5, 20), 2)
            builtup    = round(rng.uniform(1, 8), 2)
            water      = round(rng.uniform(0, 5), 2)
            dist_road  = round(rng.uniform(0.1, 2.0), 4)
            det_30     = int(rng.integers(0, 8))
            persist    = round(rng.integers(0, max(1, det_30) + 1) / 30, 4)

        # Normalise land-cover to 100%
        total = forest + cropland + grassland + builtup + water
        scale = 100 / total
        forest, cropland, grassland, builtup, water = (
            round(forest*scale, 2), round(cropland*scale, 2),
            round(grassland*scale, 2), round(builtup*scale, 2),
            round(water*scale, 2)
        )

        confidence = rng.choice([50, 20], p=[0.70, 0.30])
        day_night  = rng.choice(["day", "night"], p=[0.75, 0.25])

        # OSM — no strong industrial signal
        dist_ind  = round(rng.uniform(2.0, 5.0), 4)
        near_ind  = 0
        dist_ref  = None
        near_ref  = 0
        dist_pp   = None
        near_pp   = 0
        dist_mine = None
        near_mine = 0
        dist_gas  = None
        near_gas  = 0

        det_7  = int(rng.integers(0, min(det_30 + 1, 3)))
        det_90 = int(rng.integers(det_30, max(det_30 + 1, 12)))
        days_30 = int(rng.integers(0, max(1, det_30) + 1))

        has_history = det_30 > 0
        if has_history:
            mean_frp_30    = round(rng.uniform(2, frp * 1.1), 4)
            max_frp_30     = round(mean_frp_30 * rng.uniform(1.1, 1.8), 4)
            mean_bright_30 = round(rng.uniform(330, brightness + 3), 4)
            frp_ratio      = round(frp / mean_frp_30, 4)
            frp_dev        = round(frp - mean_frp_30, 4)
            bright_ratio   = round(brightness / mean_bright_30, 4)
            bright_dev     = round(brightness - mean_bright_30, 4)
        else:
            mean_frp_30    = None
            max_frp_30     = None
            mean_bright_30 = None
            frp_ratio      = 1.0
            frp_dev        = 0.0
            bright_ratio   = 1.0
            bright_dev     = 0.0

        osm_status = _osm_status(dist_ind, near_ind, dist_road)

        rows.append({
            "event_id":               f"SYN_OTH_{i+1:03d}",
            "brightness":             brightness,
            "frp":                    frp,
            "confidence":             float(confidence),
            "day_night":              day_night,
            "distance_to_industrial": dist_ind,
            "distance_to_refinery":   dist_ref,
            "distance_to_powerplant": dist_pp,
            "distance_to_mine":       dist_mine,
            "distance_to_gas_facility": dist_gas,
            "distance_to_road":       dist_road,
            "near_industrial_facility": float(near_ind),
            "near_refinery":          float(near_ref),
            "near_powerplant":        float(near_pp),
            "near_mine":              float(near_mine),
            "near_gas_facility":      float(near_gas),
            "forest_pct":             forest,
            "cropland_pct":           cropland,
            "grassland_pct":          grassland,
            "builtup_pct":            builtup,
            "water_pct":              water,
            "detections_7d":          det_7,
            "detections_30d":         det_30,
            "detections_90d":         det_90,
            "mean_frp_30d":           mean_frp_30,
            "max_frp_30d":            max_frp_30,
            "mean_brightness_30d":    mean_bright_30,
            "days_active_30d":        days_30,
            "persistence_score":      persist,
            "frp_deviation":          frp_dev,
            "frp_ratio":              frp_ratio,
            "brightness_deviation":   bright_dev,
            "brightness_ratio":       bright_ratio,
            "osm_query_status":       osm_status,
            "data_quality_flags":     "synthetic",
            "candidate_label":        3,
            "verified_label":         3,
            "verification_status":    "synthetic",
        })
    return rows


# ------------------------------------------------------------------ #
# Main — generate, validate, append to labelled_training_data.csv
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    all_rows = generate_industrial(40) + generate_wildfire(32) + generate_other(40)
    syn_df = pd.DataFrame(all_rows, columns=COLUMNS)

    # Sanity checks
    assert syn_df["event_id"].nunique() == len(syn_df), "Duplicate event_ids"
    assert syn_df["verified_label"].notna().all(), "Missing verified_label"
    assert (syn_df["verification_status"] == "synthetic").all(), "Wrong verification_status"

    label_counts = syn_df["verified_label"].value_counts().sort_index()
    print("Synthetic rows generated:")
    names = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}
    for k, cnt in label_counts.items():
        print(f"  Class {int(k)} {names[int(k)]:<15}: {cnt}")
    print(f"  Total: {len(syn_df)}")

    # Quick distribution check — flag anything obviously out of range
    assert syn_df["brightness"].between(328, 370).all(), "brightness out of range"
    assert syn_df["frp"].between(0.5, 60).all(), "frp out of range"
    assert syn_df["persistence_score"].between(0, 1).all(), "persistence out of range"
    lc_sum = syn_df[["forest_pct","cropland_pct","grassland_pct","builtup_pct","water_pct"]].sum(axis=1)
    assert (lc_sum - 100).abs().max() < 0.5, "land-cover doesn't sum to ~100"
    print("\nAll sanity checks passed.")

    # Save synthetic-only file
    syn_path = "data/labelled/synthetic_samples.csv"
    os.makedirs(os.path.dirname(syn_path), exist_ok=True)
    syn_df.to_csv(syn_path, index=False)
    print(f"\nSynthetic samples saved : {syn_path}")

    # Append to labelled_training_data.csv
    labelled_path = "data/labelled/labelled_training_data.csv"
    if os.path.exists(labelled_path):
        real_df = pd.read_csv(labelled_path)
        # Guard: don't double-append if script is re-run
        real_df = real_df[~real_df["event_id"].str.startswith("SYN_")]
        combined = pd.concat([real_df, syn_df], ignore_index=True)
    else:
        combined = syn_df

    combined.to_csv(labelled_path, index=False)
    print(f"Labelled dataset updated: {labelled_path}  ({len(combined)} total rows)")

    print("\n=== Final labelled_training_data.csv distribution ===")
    for k, name in names.items():
        real_n = ((combined["verified_label"] == k) & (combined["verification_status"] != "synthetic")).sum()
        syn_n  = ((combined["verified_label"] == k) & (combined["verification_status"] == "synthetic")).sum()
        print(f"  Class {k} {name:<15}: {real_n} real + {syn_n} synthetic = {real_n+syn_n}")
