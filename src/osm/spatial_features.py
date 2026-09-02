import math
import os
import requests
from dotenv import load_dotenv

load_dotenv()
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")
PLACES_URL = "https://api.geoapify.com/v2/places"

# Confirmed valid Geoapify category strings per facility key.
# Matched locally after fetching — one call for facilities, one for roads.
FACILITY_CATEGORIES = {
    "industrial":   ["production", "production.factory"],
    "refinery":     ["power.plant.gas", "power.plant.coal"],
    "powerplant":   ["power.plant", "power.plant.gas", "power.plant.coal",
                     "power.generator"],
    "mine":         ["production"],
    "gas_facility": ["power.plant.gas"],
}

ROAD_CATEGORIES = ["highway", "highway.trunk", "highway.primary",
                   "highway.secondary", "highway.tertiary",
                   "highway.residential", "highway.service"]

ALL_FACILITY_CATS = ",".join(sorted({
    c for cats in FACILITY_CATEGORIES.values() for c in cats
}))

NEAR_KEY = {
    "industrial":   "near_industrial_facility",
    "refinery":     "near_refinery",
    "powerplant":   "near_powerplant",
    "mine":         "near_mine",
    "gas_facility": "near_gas_facility",
}

STATUS_OK           = "ok"
STATUS_NOT_FOUND    = "not_found"
STATUS_QUERY_FAILED = "query_failed"


def _haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _fetch(categories: str, lat: float, lon: float, radius_km: float) -> tuple[list, str]:
    try:
        r = requests.get(
            PLACES_URL,
            params={
                "categories": categories,
                "filter":     f"circle:{lon},{lat},{int(radius_km * 1000)}",
                "limit":      500,
                "apiKey":     GEOAPIFY_API_KEY,
            },
            timeout=20,
        )
        r.raise_for_status()
        return r.json().get("features", []), STATUS_OK
    except Exception:
        return [], STATUS_QUERY_FAILED


def _nearest(lat, lon, features, categories) -> float | None:
    matching = [
        f for f in features
        if any(c in f["properties"].get("categories", []) for c in categories)
    ]
    if not matching:
        return None
    return min(
        _haversine(lat, lon, f["properties"]["lat"], f["properties"]["lon"])
        for f in matching
    )


def get_spatial_features(lat: float, lon: float, radius_km: float) -> dict:
    """
    Two Geoapify calls per location (facility types + roads), merged locally.
    Returns distance_to_*, near_*, osm_query_status.
    """
    facility_feats, fac_status = _fetch(ALL_FACILITY_CATS, lat, lon, radius_km)
    road_feats,     road_status = _fetch("highway",         lat, lon, radius_km)

    features  = {}
    statuses  = []
    api_failed = fac_status == STATUS_QUERY_FAILED

    for key, categories in FACILITY_CATEGORIES.items():
        if api_failed:
            features[f"distance_to_{key}"] = None
            features[NEAR_KEY[key]]         = None
            statuses.append(f"{key}:{STATUS_QUERY_FAILED}")
        else:
            best = _nearest(lat, lon, facility_feats, categories)
            features[f"distance_to_{key}"] = round(best, 4) if best is not None else radius_km
            features[NEAR_KEY[key]]         = int(best is not None and best <= radius_km)
            statuses.append(f"{key}:{STATUS_OK if best is not None else STATUS_NOT_FOUND}")

    # Road
    if road_status == STATUS_QUERY_FAILED:
        features["distance_to_road"] = None
        statuses.append(f"road:{STATUS_QUERY_FAILED}")
    else:
        best = _nearest(lat, lon, road_feats, ROAD_CATEGORIES)
        features["distance_to_road"] = round(best, 4) if best is not None else radius_km
        statuses.append(f"road:{STATUS_OK if best is not None else STATUS_NOT_FOUND}")

    features["osm_query_status"] = "; ".join(statuses)
    return features
