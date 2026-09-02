import hashlib
import pandas as pd

# VIIRS column names → canonical names
VIIRS_RENAME = {
    "bright_ti4": "brightness",
    "bright_ti5": "brightness_secondary",
    "daynight":   "day_night",
}

# MODIS column names → canonical names
MODIS_RENAME = {
    "brightness": "brightness",
    "bright_t31": "brightness_secondary",
    "daynight":   "day_night",
}

# Columns required to produce a usable row
REQUIRED = {"latitude", "longitude", "brightness", "frp", "acq_date", "acq_time", "day_night"}

# Columns to keep in the parsed output
OUTPUT_COLS = [
    "event_id", "satellite", "instrument",
    "latitude", "longitude",
    "brightness", "frp", "confidence",
    "day_night", "acq_date", "acq_time",
]


def _detect_instrument(df: pd.DataFrame) -> str:
    if "bright_ti4" in df.columns:
        return "VIIRS"
    if "brightness" in df.columns:
        return "MODIS"
    return "UNKNOWN"


def _stable_event_id(row: pd.Series) -> str:
    """
    Build a deterministic event key from satellite + date + time + rounded location.
    Rounding to 3 decimal places (~100m) keeps the key stable across re-downloads.
    """
    sat  = str(row.get("satellite", "UNK")).strip().upper()
    date = str(row.get("acq_date", "")).strip()
    time = str(row.get("acq_time", "")).strip().zfill(4)
    lat  = f"{float(row['latitude']):.3f}"
    lon  = f"{float(row['longitude']):.3f}"
    raw  = f"{sat}_{date}_{time}_{lat}_{lon}"
    return "FIRMS_" + hashlib.sha1(raw.encode()).hexdigest()[:10].upper()


def _validate_schema(df: pd.DataFrame, instrument: str) -> list[str]:
    """Return list of schema warnings (not errors — we keep rows with partial data)."""
    warnings = []
    rename = VIIRS_RENAME if instrument == "VIIRS" else MODIS_RENAME
    renamed_cols = {rename.get(c, c) for c in df.columns}
    missing = REQUIRED - renamed_cols
    if missing:
        warnings.append(f"Schema warning: missing columns after rename: {sorted(missing)}")
    return warnings


def parse_firms(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Parse and normalise a raw FIRMS DataFrame.

    Returns:
        (parsed_df, warnings)  — warnings is a list of schema/quality messages.
        Rows missing any REQUIRED field are dropped and counted in warnings.
    """
    warnings = []
    instrument = _detect_instrument(df)
    rename = VIIRS_RENAME if instrument == "VIIRS" else MODIS_RENAME
    df = df.rename(columns=rename).copy()

    schema_warnings = _validate_schema(df, instrument)
    warnings.extend(schema_warnings)

    # Normalise day_night
    if "day_night" in df.columns:
        df["day_night"] = df["day_night"].astype(str).str.lower().map(
            {"d": "day", "n": "night"}
        )
    else:
        df["day_night"] = None

    # Coerce numeric fields
    for col in ["latitude", "longitude", "brightness", "frp"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # VIIRS confidence is text: 'nominal'=50, 'high'=80, 'low'=20
    # MODIS confidence is already numeric 0-100
    if "confidence" in df.columns:
        viirs_map = {"l": 20, "low": 20, "n": 50, "nominal": 50, "h": 80, "high": 80}
        conf = df["confidence"].astype(str).str.strip().str.lower()
        numeric_conf = pd.to_numeric(df["confidence"], errors="coerce")
        mapped_conf  = conf.map(viirs_map)
        df["confidence"] = numeric_conf.combine_first(mapped_conf)

    # Add instrument column
    df["instrument"] = instrument
    if "satellite" not in df.columns:
        df["satellite"] = "UNKNOWN"

    # Drop rows missing any required field
    before = len(df)
    df = df.dropna(subset=list(REQUIRED & set(df.columns)))
    dropped = before - len(df)
    if dropped:
        warnings.append(f"{dropped} rows dropped: missing required fields")

    if df.empty:
        warnings.append("No usable rows after parsing")
        return pd.DataFrame(columns=OUTPUT_COLS), warnings

    # Build stable event_id
    df["event_id"] = df.apply(_stable_event_id, axis=1)

    # Deduplicate on event_id (same satellite pass hitting same pixel twice)
    before = len(df)
    df = df.drop_duplicates(subset="event_id")
    dupes = before - len(df)
    if dupes:
        warnings.append(f"{dupes} duplicate event_ids removed")

    # Keep only output columns that exist
    keep = [c for c in OUTPUT_COLS if c in df.columns]
    return df[keep].reset_index(drop=True), warnings
