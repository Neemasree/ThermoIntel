import pandas as pd
from src.labeling.candidate_labels import (
    STATUS_HUMAN_VERIFIED, STATUS_PROXY_VERIFIED, STATUS_UNCERTAIN, STATUS_DATA_INVALID
)

LABEL_MAP   = {"1": 0, "2": 1, "3": 2, "4": 3}
LABEL_NAMES = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other/Uncertain"}


def _fmt(val, suffix="") -> str:
    return f"{val}{suffix}" if pd.notna(val) else "N/A"


def run_verification(df: pd.DataFrame, labelled_path: str, feature_path: str) -> pd.DataFrame:
    """
    Human review loop — only presents rows with verification_status = 'uncertain'.
    proxy_verified and data_invalid rows are skipped (already resolved automatically).

    On exit:
      - Rows the human labels → verification_status = 'human_verified'
      - Rows the human skips  → remain 'uncertain'
      - All proxy_verified rows are included in the labelled export unchanged.
      - feature_dataset.csv is updated so re-runs skip already-resolved rows.
    """
    to_review = df[df["verification_status"] == STATUS_UNCERTAIN].copy()
    already   = df[df["verification_status"] == STATUS_PROXY_VERIFIED]

    print(f"\nProxy-verified (auto, no review needed) : {len(already)}")
    print(f"Uncertain (queued for human review)     : {len(to_review)}")
    print(f"Data-invalid (excluded)                 : {(df['verification_status'] == STATUS_DATA_INVALID).sum()}")

    if to_review.empty:
        print("\nNothing to review manually.")
    else:
        print(f"\nStarting review of {len(to_review)} uncertain events...\n")

    for idx, row in to_review.iterrows():
        print("-" * 58)
        print(f"Event         : {row['event_id']}")
        print(f"  FRP                   : {_fmt(row.get('frp'), ' MW')}")
        print(f"  Brightness            : {_fmt(row.get('brightness'), ' K')}")
        print(f"  Confidence            : {_fmt(row.get('confidence'))}")
        print(f"  Day/Night             : {_fmt(row.get('day_night'))}")
        print(f"  Dist to industrial    : {_fmt(row.get('distance_to_industrial'), ' km')}")
        print(f"  Near industrial (OSM) : {_fmt(row.get('near_industrial_facility'))}")
        print(f"  Dist to refinery      : {_fmt(row.get('distance_to_refinery'), ' km')}")
        print(f"  Forest cover          : {_fmt(row.get('forest_pct'), '%')}")
        print(f"  Cropland cover        : {_fmt(row.get('cropland_pct'), '%')}")
        print(f"  Built-up cover        : {_fmt(row.get('builtup_pct'), '%')}")
        print(f"  30-day detections     : {_fmt(row.get('detections_30d'))}")
        print(f"  Persistence score     : {_fmt(row.get('persistence_score'))}")
        print(f"  FRP ratio vs baseline : {_fmt(row.get('frp_ratio'))}")
        print(f"  OSM query status      : {_fmt(row.get('osm_query_status'))}")
        print(f"  Data quality flags    : {_fmt(row.get('data_quality_flags'))}")
        print(f"  Candidate label       : {LABEL_NAMES.get(row.get('candidate_label'), 'None')}")
        print("-" * 58)
        print("  [1] Industrial  [2] Wildfire  [3] Agricultural  [4] Other  [s] Skip  [q] Quit")

        choice = input("  Your choice: ").strip().lower()
        if choice == "q":
            break
        if choice == "s":
            continue
        if choice in LABEL_MAP:
            df.at[idx, "verified_label"]      = LABEL_MAP[choice]
            df.at[idx, "verification_status"] = STATUS_HUMAN_VERIFIED

    # Export: proxy_verified + human_verified rows only → training ground truth
    exportable = df[df["verification_status"].isin([STATUS_PROXY_VERIFIED, STATUS_HUMAN_VERIFIED])]
    exportable.to_csv(labelled_path, index=False)

    pv = (exportable["verification_status"] == STATUS_PROXY_VERIFIED).sum()
    hv = (exportable["verification_status"] == STATUS_HUMAN_VERIFIED).sum()
    print(f"\nLabelled dataset saved  : {labelled_path}")
    print(f"  proxy_verified        : {pv}")
    print(f"  human_verified        : {hv}")
    print(f"  total usable rows     : {pv + hv}")

    # Write all status updates back to feature_dataset so re-runs are idempotent
    df.to_csv(feature_path, index=False)
    print(f"Feature dataset updated : {feature_path}")

    return df
