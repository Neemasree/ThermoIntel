import os
import requests
import pandas as pd
from io import StringIO
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()

# Date-range endpoint: /api/area/csv/{key}/{source}/{bbox}/{days}/{date}
# `date` is the END date of the window; `days` counts back from that date.
# Maximum days per request: 5 (FIRMS API hard limit for NRT sources).
FIRMS_BASE  = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
MAX_DAYS_PER_REQUEST = 5

COUNTRY_BBOX = {
    "IND": "67.0,6.0,98.0,38.0",
    "USA": "-125.0,24.0,-66.0,50.0",
    "AUS": "112.0,-44.0,154.0,-10.0",
    "BRA": "-74.0,-34.0,-34.0,6.0",
    "CHN": "73.0,18.0,135.0,54.0",
}


def _fetch_window(source: str, bbox: str, days: int, end_date: date, api_key: str) -> pd.DataFrame:
    """Fetch `days` days ending on `end_date` (inclusive)."""
    url = f"{FIRMS_BASE}/{api_key}/{source}/{bbox}/{days}/{end_date.strftime('%Y-%m-%d')}"
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    text = resp.text.strip()
    if not text:
        return pd.DataFrame()
    df = pd.read_csv(StringIO(text))
    # FIRMS sometimes returns a single-line error message instead of CSV
    if len(df.columns) < 5:
        raise ValueError(f"FIRMS returned unexpected response: {text[:200]}")
    return df


def _download_range(source: str, bbox: str, total_days: int,
                    end_date: date, api_key: str) -> pd.DataFrame:
    """
    Download `total_days` days ending on `end_date` by issuing
    MAX_DAYS_PER_REQUEST-day chunks walking backwards in time.
    """
    frames = []
    remaining = total_days
    window_end = end_date

    while remaining > 0:
        chunk = min(remaining, MAX_DAYS_PER_REQUEST)
        try:
            df = _fetch_window(source, bbox, chunk, window_end, api_key)
            if not df.empty:
                frames.append(df)
        except Exception as e:
            print(f"  [WARN] FIRMS fetch failed for window ending {window_end}: {e}")

        window_end -= timedelta(days=chunk)
        remaining  -= chunk

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True).drop_duplicates()


def download_firms(source: str, country: str, days: int) -> pd.DataFrame:
    """Download the most recent `days` days of FIRMS data."""
    api_key = os.getenv("FIRMS_API_KEY")
    if not api_key:
        raise EnvironmentError("FIRMS_API_KEY not set in .env")
    bbox = COUNTRY_BBOX.get(country.upper())
    if not bbox:
        raise ValueError(f"No bounding box for country '{country}'. Add it to COUNTRY_BBOX.")
    return _download_range(source, bbox, days, date.today(), api_key)


def download_firms_history(source: str, country: str, history_days: int) -> pd.DataFrame:
    """
    Download a genuine historical window of `history_days` days ending yesterday.
    Ending yesterday (not today) avoids overlap with the current-day recent fetch.
    """
    api_key = os.getenv("FIRMS_API_KEY")
    if not api_key:
        raise EnvironmentError("FIRMS_API_KEY not set in .env")
    bbox = COUNTRY_BBOX.get(country.upper())
    if not bbox:
        raise ValueError(f"No bounding box for country '{country}'. Add it to COUNTRY_BBOX.")
    yesterday = date.today() - timedelta(days=1)
    return _download_range(source, bbox, history_days, yesterday, api_key)
