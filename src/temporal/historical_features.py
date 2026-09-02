import math
import pandas as pd


def _haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


TEMPORAL_KEYS = [
    "detections_7d", "detections_30d", "detections_90d",
    "mean_frp_30d", "max_frp_30d", "mean_brightness_30d",
    "days_active_30d", "persistence_score",
    "frp_deviation", "frp_ratio",
    "brightness_deviation", "brightness_ratio",
]


def get_historical_features(
    lat: float,
    lon: float,
    acq_date: str,
    history_df: pd.DataFrame,
    current_frp: float,
    current_brightness: float,
    radius_km: float = 1.0,
    short: int = 7,
    medium: int = 30,
    long: int = 90,
) -> dict | None:
    """
    Compute temporal and anomaly features from historical FIRMS data.

    Returns None if history_df is empty or None — signals missing data to the caller.
    Returns a dict with all TEMPORAL_KEYS otherwise.
    Anomaly features (frp_ratio, brightness_ratio) are None when no historical
    baseline exists (detections_30d == 0), not 0, to distinguish "no history"
    from "ratio is zero".
    """
    if history_df is None or history_df.empty:
        return None

    ref_date = pd.to_datetime(acq_date)
    hdf = history_df.copy()
    hdf["acq_date"] = pd.to_datetime(hdf["acq_date"])

    hdf["_dist"] = hdf.apply(
        lambda r: _haversine(lat, lon, r["latitude"], r["longitude"]), axis=1
    )
    nearby = hdf[hdf["_dist"] <= radius_km]
    past   = nearby[nearby["acq_date"] < ref_date]

    def window(days):
        return past[past["acq_date"] >= ref_date - pd.Timedelta(days=days)]

    w7  = window(short)
    w30 = window(medium)
    w90 = window(long)

    det_30 = len(w30)
    has_history = det_30 > 0

    mean_frp_30    = round(float(w30["frp"].mean()),        4) if has_history else None
    max_frp_30     = round(float(w30["frp"].max()),         4) if has_history else None
    mean_bright_30 = round(float(w30["brightness"].mean()), 4) if has_history else None
    days_active_30 = int(w30["acq_date"].dt.date.nunique()) if has_history else 0
    persistence    = round(days_active_30 / medium, 4)

    # Anomaly features
    # When no prior detections exist this is a first occurrence at this location.
    # frp_ratio = 1.0 (current equals its own baseline — neutral, not anomalous)
    # frp_deviation = 0.0 (no deviation from unknown baseline)
    # This is preferable to None because it keeps the row usable for labelling
    # while correctly signalling "no historical context" to the model.
    if has_history:
        frp_dev      = round(current_frp - mean_frp_30, 4)
        frp_ratio    = round(current_frp / mean_frp_30, 4) if mean_frp_30 > 0 else 1.0
        bright_dev   = round(current_brightness - mean_bright_30, 4)
        bright_ratio = round(current_brightness / mean_bright_30, 4) if mean_bright_30 > 0 else 1.0
    else:
        # First occurrence — no baseline available
        frp_dev      = 0.0
        frp_ratio    = 1.0
        bright_dev   = 0.0
        bright_ratio = 1.0

    return {
        "detections_7d":        len(w7),
        "detections_30d":       det_30,
        "detections_90d":       len(w90),
        "mean_frp_30d":         mean_frp_30,
        "max_frp_30d":          max_frp_30,
        "mean_brightness_30d":  mean_bright_30,
        "days_active_30d":      days_active_30,
        "persistence_score":    persistence,
        "frp_deviation":        frp_dev,
        "frp_ratio":            frp_ratio,
        "brightness_deviation": bright_dev,
        "brightness_ratio":     bright_ratio,
    }
