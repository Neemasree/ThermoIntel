import pandas as pd

LABEL_NAMES = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}

STATUS_PROXY_VERIFIED = "proxy_verified"
STATUS_UNCERTAIN      = "uncertain"
STATUS_DATA_INVALID   = "data_invalid"
STATUS_HUMAN_VERIFIED = "human_verified"   # reserved for future manual review

# Minimum features needed per label class to attempt labelling.
# OSM industrial query failure does NOT block Wildfire/Agricultural labelling —
# absence of industrial signal is itself informative for those classes.
REQUIRED_ALWAYS = ["forest_pct", "cropland_pct", "persistence_score"]
REQUIRED_FOR_INDUSTRIAL = ["distance_to_industrial", "near_industrial_facility"]


def _data_invalid(row: pd.Series) -> bool:
    """
    True only when land-cover or persistence data is missing entirely.
    OSM industrial query failure alone does NOT make a row data_invalid —
    it makes the industrial signal unknown, which is handled per-class below.
    """
    if any(pd.isna(row.get(f)) for f in REQUIRED_ALWAYS):
        return True
    flags = str(row.get("data_quality_flags", "ok"))
    return "worldcover_failed" in flags


def _industrial_signal(row: pd.Series, ic: dict) -> str:
    """
    Returns:
      'yes'     — OSM confirms industrial landuse nearby
      'no'      — OSM queried successfully, nothing found
      'unknown' — OSM query failed, cannot determine
    """
    dist = row.get("distance_to_industrial")
    near = row.get("near_industrial_facility")

    dist_ok = dist is not None and not pd.isna(dist)
    near_ok = near is not None and not pd.isna(near)

    if not dist_ok and not near_ok:
        return "unknown"

    close   = dist_ok and dist <= ic["max_industrial_distance_km"]
    flagged = near_ok and near == 1
    return "yes" if (close or flagged) else "no"


# ------------------------------------------------------------------ #
# Pass 1 — candidate label (loose rules)
# ------------------------------------------------------------------ #

def _candidate(row: pd.Series, cfg: dict) -> int | None:
    if _data_invalid(row):
        return None

    ic  = cfg["labels"]["industrial"]
    wc  = cfg["labels"]["wildfire"]
    ac  = cfg["labels"]["agricultural"]
    ind = _industrial_signal(row, ic)

    # Industrial: requires confirmed OSM signal + persistence
    if ind == "yes" and row["persistence_score"] >= ic["min_persistence_score"]:
        return 0

    # Wildfire: high forest + industrial signal absent or unknown
    if row["forest_pct"] >= wc["min_forest_pct"] and ind != "yes":
        return 1

    # Agricultural: high cropland + industrial signal absent or unknown
    if row["cropland_pct"] >= ac["min_cropland_pct"] and ind != "yes":
        return 2

    return 3


# ------------------------------------------------------------------ #
# Pass 2 — proxy validation (strict rules)
# ------------------------------------------------------------------ #

def _proxy_validate(row: pd.Series, candidate: int | None, cfg: dict) -> tuple[int | None, str]:
    if candidate is None:
        return None, STATUS_DATA_INVALID

    pv  = cfg["proxy_validation"]
    ic  = cfg["labels"]["industrial"]
    ind = _industrial_signal(row, ic)

    if candidate == 0:   # Industrial
        frp_ok = (
            row.get("frp_ratio") is not None
            and not pd.isna(row.get("frp_ratio"))
            and row["frp_ratio"] >= pv["industrial"]["min_frp_ratio"]
        )
        strict = (
            ind == "yes"
            and row["persistence_score"] >= pv["industrial"]["min_persistence_score"]
            and (row.get("detections_30d") or 0) >= pv["industrial"]["min_detections_30d"]
            and frp_ok
        )
        return (0, STATUS_PROXY_VERIFIED) if strict else (None, STATUS_UNCERTAIN)

    if candidate == 1:   # Wildfire
        # frp_ratio == 1.0 AND detections_30d == 0 means first occurrence — use raw FRP
        is_first_occurrence = (
            (row.get("detections_30d") or 0) == 0
        )
        if is_first_occurrence:
            intensity_ok = row.get("frp", 0) >= pv["wildfire"]["min_frp_no_baseline"]
        else:
            intensity_ok = (
                row.get("frp_ratio") is not None
                and not pd.isna(row.get("frp_ratio"))
                and row["frp_ratio"] >= pv["wildfire"]["min_frp_ratio"]
            )

        strict = (
            row["forest_pct"] >= pv["wildfire"]["min_forest_pct"]
            and ind != "yes"
            and intensity_ok
        )
        return (1, STATUS_PROXY_VERIFIED) if strict else (None, STATUS_UNCERTAIN)

    if candidate == 2:   # Agricultural
        strict = (
            row["cropland_pct"] >= pv["agricultural"]["min_cropland_pct"]
            and ind != "yes"
            and row["persistence_score"] <= pv["agricultural"]["max_persistence_score"]
        )
        return (2, STATUS_PROXY_VERIFIED) if strict else (None, STATUS_UNCERTAIN)

    # candidate == 3 (Other) — never auto-promoted
    return (None, STATUS_UNCERTAIN)


# ------------------------------------------------------------------ #
# Public entry point
# ------------------------------------------------------------------ #

def generate_candidate_labels(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    df = df.copy()

    candidates, verified, statuses = [], [], []
    for _, row in df.iterrows():
        c = _candidate(row, cfg)
        v, s = _proxy_validate(row, c, cfg)
        candidates.append(c)
        verified.append(v)
        statuses.append(s)

    df["candidate_label"]     = candidates
    df["verified_label"]      = verified
    df["verification_status"] = statuses

    total        = len(df)
    n_pv         = statuses.count(STATUS_PROXY_VERIFIED)
    n_uncertain  = statuses.count(STATUS_UNCERTAIN)
    n_invalid    = statuses.count(STATUS_DATA_INVALID)

    print(f"  Candidate labels assigned : {total - n_invalid}/{total}")
    print(f"  proxy_verified            : {n_pv}")
    print(f"  uncertain                 : {n_uncertain}")
    print(f"  data_invalid              : {n_invalid}")

    return df
