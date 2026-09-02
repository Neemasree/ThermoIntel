import os
import yaml
import pandas as pd
from tqdm import tqdm

from src.firms.download import download_firms, download_firms_history
from src.firms.parser import parse_firms
from src.features.feature_builder import build_features, FEATURE_COLUMNS
from src.labeling.candidate_labels import generate_candidate_labels
from src.labeling.verification import run_verification


def load_config(path="config/config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def run_pipeline(verify: bool = False):
    cfg = load_config()
    src     = cfg["firms"]["source"]
    country = cfg["firms"]["country"]
    t       = cfg["temporal"]

    # ------------------------------------------------------------------ #
    # 1. Download recent FIRMS events (the events we want to label)
    # ------------------------------------------------------------------ #
    print("Downloading recent FIRMS events...")
    raw_recent = download_firms(src, country, cfg["firms"]["days_to_fetch"])
    raw_recent.to_csv("data/raw/firms/firms_recent.csv", index=False)
    events, warnings = parse_firms(raw_recent)
    for w in warnings:
        print(f"  [WARN] {w}")
    print(f"  {len(events)} events parsed.")

    if events.empty:
        print("No events to process. Exiting.")
        return

    # ------------------------------------------------------------------ #
    # 2. Download 90-day historical FIRMS for temporal feature calculation
    # ------------------------------------------------------------------ #
    history_days = t["long_window_days"]
    print(f"Downloading {history_days}-day historical FIRMS data...")
    raw_history = download_firms_history(src, country, history_days)
    raw_history.to_csv("data/raw/firms/firms_history.csv", index=False)
    history_df, hist_warnings = parse_firms(raw_history)
    for w in hist_warnings:
        print(f"  [WARN] {w}")
    print(f"  {len(history_df)} historical records available.")

    # ------------------------------------------------------------------ #
    # 3. Build features — skip already-processed event_ids
    # ------------------------------------------------------------------ #
    feature_path = cfg["output"]["feature_dataset"]
    os.makedirs(os.path.dirname(feature_path), exist_ok=True)

    if os.path.exists(feature_path):
        existing = pd.read_csv(feature_path)
        done_ids = set(existing["event_id"])
    else:
        existing = pd.DataFrame(columns=FEATURE_COLUMNS)
        done_ids = set()

    rows = []
    for _, row in tqdm(events.iterrows(), total=len(events), desc="Extracting features"):
        if row["event_id"] in done_ids:
            continue
        try:
            feat = build_features(row, history_df, cfg)
            rows.append(feat)
        except Exception as e:
            print(f"  [ERROR] {row['event_id']}: {e}")

    if rows:
        new_df  = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
        dataset = pd.concat([existing, new_df], ignore_index=True)
    else:
        dataset = existing

    # ------------------------------------------------------------------ #
    # 4. Generate candidate labels
    #    NOTE: these are UNVERIFIED CANDIDATES only.
    #    Do NOT use candidate_label as training ground truth.
    #    Only verified_label (set during manual verification) is ground truth.
    # ------------------------------------------------------------------ #
    dataset = generate_candidate_labels(dataset, cfg)
    dataset.to_csv(feature_path, index=False)

    total = len(dataset)
    print(f"\nFeature dataset: {feature_path}  ({total} rows)")
    print(f"  Use verified_label (proxy_verified rows) as training target — not candidate_label")

    # ------------------------------------------------------------------ #
    # 5. Optional manual verification → produces verified ground truth
    # ------------------------------------------------------------------ #
    if verify:
        labelled_path = cfg["output"]["labelled_dataset"]
        os.makedirs(os.path.dirname(labelled_path), exist_ok=True)
        dataset = run_verification(dataset, labelled_path, feature_path)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true",
                        help="Run manual verification to produce verified ground truth labels")
    args = parser.parse_args()
    run_pipeline(verify=args.verify)
