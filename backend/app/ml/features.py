import pandas as pd
import numpy as np

# =========================================================
# FEATURE GROUPS
# =========================================================

THERMAL_FEATURES = [
    "brightness",
    "frp",
    "confidence",
    "day_night",
]

OSM_DISTANCE_FEATURES = [
    "distance_to_industrial",
    "distance_to_refinery",
    "distance_to_powerplant",
    "distance_to_mine",
    "distance_to_gas_facility",
    "distance_to_road",
]

OSM_FLAG_FEATURES = [
    "near_industrial_facility",
    "near_refinery",
    "near_powerplant",
    "near_mine",
    "near_gas_facility",
]

LAND_COVER_FEATURES = [
    "forest_pct",
    "cropland_pct",
    "grassland_pct",
    "builtup_pct",
    "water_pct",
]

TEMPORAL_FEATURES = [
    "detections_7d",
    "detections_30d",
    "detections_90d",
    "mean_frp_30d",
    "max_frp_30d",
    "mean_brightness_30d",
    "days_active_30d",
    "persistence_score",
]

ANOMALY_FEATURES = [
    "frp_deviation",
    "frp_ratio",
    "brightness_deviation",
    "brightness_ratio",
]

# All features fed into the model
ALL_FEATURES = (
    THERMAL_FEATURES
    + OSM_DISTANCE_FEATURES
    + OSM_FLAG_FEATURES
    + LAND_COVER_FEATURES
    + TEMPORAL_FEATURES
    + ANOMALY_FEATURES
)

# Columns excluded from X — metadata, identifiers, labels
EXCLUDE_COLS = [
    "event_id",
    "candidate_label",
    "verified_label",
    "verification_status",
    "data_source",
    "osm_query_status",
    "data_quality_flags",
]

# =========================================================
# CATEGORICAL ENCODING MAPS
# =========================================================

DAY_NIGHT_MAP = {"D": 1, "N": 0}

CONFIDENCE_MAP = {"l": 0, "n": 1, "h": 2}  # VIIRS: low/nominal/high


# =========================================================
# CLEANING
# =========================================================

def encode_categoricals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    if "day_night" in df.columns:
        df["day_night"] = df["day_night"].map(DAY_NIGHT_MAP)

    if "confidence" in df.columns:
        # VIIRS string confidence → numeric; MODIS numeric stays as-is
        df["confidence"] = df["confidence"].apply(
            lambda v: CONFIDENCE_MAP.get(str(v).strip().lower(), v)
            if isinstance(v, str)
            else v
        )
        df["confidence"] = pd.to_numeric(df["confidence"], errors="coerce")

    return df


def filter_by_data_quality(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows where osm_query_status is fully failed (not partial)."""
    if "osm_query_status" in df.columns:
        df = df[df["osm_query_status"] != "failed"]
    return df.reset_index(drop=True)


def handle_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Distance features — large sentinel value if unknown
    for col in OSM_DISTANCE_FEATURES:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(9999.0)

    # Proximity flags — assume not near if unknown
    for col in OSM_FLAG_FEATURES:
        if col in df.columns:
            df[col] = df[col].fillna(0)

    # Land-cover — fill with 0
    for col in LAND_COVER_FEATURES:
        if col in df.columns:
            df[col] = df[col].fillna(0.0)

    # Temporal — fill with 0
    for col in TEMPORAL_FEATURES:
        if col in df.columns:
            df[col] = df[col].fillna(0.0)

    # Anomaly — fill with 0 (no deviation = baseline)
    for col in ANOMALY_FEATURES:
        if col in df.columns:
            df[col] = df[col].fillna(0.0)

    # Thermal — fill with column median
    for col in ["brightness", "frp"]:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())

    return df


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Full cleaning pipeline: drop metadata → encode → missing values → select features."""
    df = filter_by_data_quality(df)
    df = encode_categoricals(df)
    df = handle_missing_values(df)

    # Drop all excluded columns, keep only known feature columns
    X = df.drop(columns=[c for c in EXCLUDE_COLS if c in df.columns])
    available = [col for col in ALL_FEATURES if col in X.columns]
    return X[available]
