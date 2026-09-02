"""Repair only failed industrial OSM lookups in an existing feature CSV.

Successful historical ``industrial:not_found`` records are filled with the
configured radius and a 0 proximity flag.  Rows marked ``industrial:query_failed``
are retried against public Overpass endpoints.  A value is updated only after a
successful response; unresolved rows retain nulls and their failure status.
"""

from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import pandas as pd
import requests
import yaml

from src.firms.parser import parse_firms


ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
INDUSTRIAL_TAG = '[landuse=industrial]'
USER_AGENT = "ThermoIntel-OSM-Repair/1.0"


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _query_industrial(lat: float, lon: float, radius_km: float) -> tuple[float | None, str]:
    """Return nearest vertex distance or an explicit outcome string."""
    radius_m = int(radius_km * 1000)
    query = (
        "[out:json][timeout:40];"
        f"(node{INDUSTRIAL_TAG}(around:{radius_m},{lat},{lon});"
        f"way{INDUSTRIAL_TAG}(around:{radius_m},{lat},{lon}););"
        "out body;>;out skel qt;"
    )
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    for endpoint in ENDPOINTS:
        try:
            response = requests.post(endpoint, data={"data": query}, headers=headers, timeout=60)
            response.raise_for_status()
            elements = response.json().get("elements", [])
            nodes = {e["id"]: (e["lat"], e["lon"]) for e in elements if e.get("type") == "node" and "lat" in e}
            distances = []
            for element in elements:
                if element.get("type") == "node" and "lat" in element:
                    distances.append(_haversine(lat, lon, element["lat"], element["lon"]))
                elif element.get("type") == "way":
                    for node_id in element.get("nodes", []):
                        if node_id in nodes:
                            nlat, nlon = nodes[node_id]
                            distances.append(_haversine(lat, lon, nlat, nlon))
            return (round(min(distances), 4), "ok") if distances else (None, "not_found")
        except (requests.RequestException, ValueError):
            continue
    return None, "query_failed"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes to the feature CSV; default is dry run.")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between retry requests.")
    parser.add_argument("--limit", type=int, help="Retry at most this many failed rows (useful for a connectivity check).")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    feature_path = root / "data" / "processed" / "feature_dataset.csv"
    raw_path = root / "data" / "raw" / "firms" / "firms_recent.csv"
    config_path = root / "config" / "config.yaml"

    with config_path.open() as handle:
        radius_km = float(yaml.safe_load(handle)["spatial"]["search_radius_km"])

    features = pd.read_csv(feature_path)
    raw = pd.read_csv(raw_path)
    recent, warnings = parse_firms(raw)
    if warnings:
        print("Raw FIRMS warnings:", "; ".join(warnings))
    coords = recent.set_index("event_id")[["latitude", "longitude"]]

    statuses = features["osm_query_status"].fillna("")
    not_found = statuses.str.contains("industrial:not_found", regex=False)
    failed = statuses.str.contains("industrial:query_failed", regex=False)

    # Historical successful absence is valid OSM evidence.
    features.loc[not_found, "distance_to_industrial"] = radius_km
    features.loc[not_found, "near_industrial_facility"] = 0

    recovered = absent = unresolved = missing_coords = 0
    failed_indices = list(features.index[failed])
    if args.limit is not None:
        failed_indices = failed_indices[:max(args.limit, 0)]
    for index in failed_indices:
        event_id = features.at[index, "event_id"]
        if event_id not in coords.index:
            missing_coords += 1
            continue
        lat = float(coords.at[event_id, "latitude"])
        lon = float(coords.at[event_id, "longitude"])
        distance, outcome = _query_industrial(lat, lon, radius_km)
        if outcome == "ok":
            features.at[index, "distance_to_industrial"] = distance
            features.at[index, "near_industrial_facility"] = int(distance <= radius_km)
            features.at[index, "osm_query_status"] = features.at[index, "osm_query_status"].replace("industrial:query_failed", "industrial:ok")
            recovered += 1
        elif outcome == "not_found":
            features.at[index, "distance_to_industrial"] = radius_km
            features.at[index, "near_industrial_facility"] = 0
            features.at[index, "osm_query_status"] = features.at[index, "osm_query_status"].replace("industrial:query_failed", "industrial:not_found")
            absent += 1
        else:
            unresolved += 1
        time.sleep(args.delay)

    print(f"Successful historical not-found rows filled: {int(not_found.sum())}")
    print(f"Failed industrial rows retried: {len(failed_indices)}")
    print(f"Recovered facility distances: {recovered}")
    print(f"Confirmed absent facilities: {absent}")
    print(f"Still unresolved: {unresolved}")
    print(f"Missing source coordinates: {missing_coords}")

    if args.apply:
        features.to_csv(feature_path, index=False)
        print(f"Updated {feature_path}")
    else:
        print("Dry run only; pass --apply to write changes.")


if __name__ == "__main__":
    main()
