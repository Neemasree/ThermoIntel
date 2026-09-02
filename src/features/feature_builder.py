import pandas as pd
from src.osm.spatial_features import get_spatial_features
from src.worldcover.landcover_features import get_landcover_features
from src.temporal.historical_features import get_historical_features

# industrial_pct removed — industrial evidence comes from OSM (near_industrial_facility, distance_to_industrial)
# builtup_pct retained as built-up/urban context only
# osm_query_status added for data-quality tracking
FEATURE_COLUMNS = [
    "event_id",
    "brightness", "frp", "confidence", "day_night",
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


def build_features(row: pd.Series, history_df: pd.DataFrame, cfg: dict) -> dict:
    lat, lon  = float(row["latitude"]), float(row["longitude"])
    radius    = cfg["spatial"]["search_radius_km"]
    wc_radius = cfg["worldcover"]["analysis_radius_km"]
    t         = cfg["temporal"]

    quality_flags = []

    # --- OSM spatial features ---
    spatial = get_spatial_features(lat, lon, radius)
    if "query_failed" in spatial.get("osm_query_status", ""):
        quality_flags.append("osm_partial_failure")

    # --- WorldCover land-cover ---
    landcover = get_landcover_features(lat, lon, wc_radius)
    if landcover is None:
        quality_flags.append("worldcover_failed")
        landcover = {k: None for k in ["forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct"]}

    # --- Historical / temporal features ---
    temporal = get_historical_features(
        lat, lon, row["acq_date"], history_df,
        current_frp=float(row["frp"]),
        current_brightness=float(row["brightness"]),
        radius_km=wc_radius,
        short=t["short_window_days"],
        medium=t["medium_window_days"],
        long=t["long_window_days"],
    )
    if temporal is None:
        quality_flags.append("no_historical_data")
        temporal = {
            "detections_7d": None, "detections_30d": None, "detections_90d": None,
            "mean_frp_30d": None, "max_frp_30d": None, "mean_brightness_30d": None,
            "days_active_30d": None, "persistence_score": None,
            "frp_deviation": None, "frp_ratio": None,
            "brightness_deviation": None, "brightness_ratio": None,
        }

    return {
        "event_id":   row["event_id"],
        "brightness": row["brightness"],
        "frp":        row["frp"],
        "confidence": row["confidence"],
        "day_night":  row["day_night"],
        **spatial,
        **landcover,
        **temporal,
        "data_quality_flags":  "; ".join(quality_flags) if quality_flags else "ok",
        "candidate_label":     None,
        "verified_label":      None,
        "verification_status": "pending",
    }
