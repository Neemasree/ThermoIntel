import math
import struct
import zlib
import requests
import numpy as np

WC_S3 = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"

# WorldCover pixel value → output feature
# builtup_pct = generic built-up/urban context only, NOT industrial evidence
PIXEL_TO_FEATURE = {
    10: "forest_pct",
    20: "grassland_pct",   # shrubland
    30: "grassland_pct",
    40: "cropland_pct",
    50: "builtup_pct",     # built-up (urban/suburban context, not industrial)
    80: "water_pct",
    90: "water_pct",       # herbaceous wetland
}

# industrial_pct is intentionally excluded — industrial evidence comes from OSM
OUTPUT_FEATURES = ["forest_pct", "cropland_pct", "grassland_pct", "builtup_pct", "water_pct"]

TILE_DEG   = 3
TILE_PX    = 36000
PX_PER_DEG = TILE_PX / TILE_DEG   # 12000 px/degree
TILE_W     = 1024
TILE_H     = 1024


def _tile_origin(lat: float, lon: float):
    lat_base = math.floor(lat / TILE_DEG) * TILE_DEG
    lon_base = math.floor(lon / TILE_DEG) * TILE_DEG
    return lat_base + TILE_DEG, lon_base


def _tile_name(lat_max: float, lon_min: float) -> str:
    lat_origin = lat_max - TILE_DEG
    lat_tag = f"N{int(abs(lat_origin)):02d}" if lat_origin >= 0 else f"S{int(abs(lat_origin)):02d}"
    lon_tag = f"E{int(abs(lon_min)):03d}" if lon_min >= 0 else f"W{int(abs(lon_min)):03d}"
    return f"ESA_WorldCover_10m_2021_v200_{lat_tag}{lon_tag}_Map.tif"


def _fetch_bytes(url: str, start: int, end: int) -> bytes | None:
    try:
        r = requests.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=20)
        if r.status_code in (200, 206):
            return r.content
    except Exception:
        pass
    return None


def _read_long_array(url: str, header: bytes, offset: int, count: int, bo: str) -> list:
    needed_end = offset + count * 4 - 1
    if needed_end < len(header):
        raw = header[offset: offset + count * 4]
    else:
        raw = _fetch_bytes(url, offset, needed_end) or b""
    return [struct.unpack(bo + "I", raw[i*4:i*4+4])[0] for i in range(min(count, len(raw) // 4))]


def get_landcover_features(lat: float, lon: float, radius_km: float) -> dict | None:
    """
    Returns dict of land-cover percentages, or None if the tile could not be fetched.
    None signals a data-quality failure — the caller should store null and exclude
    this row from automatic candidate labelling.
    """
    lat_max, lon_min = _tile_origin(lat, lon)
    url = f"{WC_S3}/{_tile_name(lat_max, lon_min)}"

    header = _fetch_bytes(url, 0, 65535)
    if not header:
        return None

    try:
        bo = "<" if header[:2] == b"II" else ">"
        ifd_offset = struct.unpack(bo + "I", header[4:8])[0]
        num_entries = struct.unpack(bo + "H", header[ifd_offset:ifd_offset+2])[0]

        tags = {}
        for i in range(num_entries):
            s = ifd_offset + 2 + i * 12
            tag, dtype, count = struct.unpack(bo + "HHI", header[s:s+8])
            raw_val = struct.unpack(bo + "I", header[s+8:s+12])[0]
            tags[tag] = (dtype, count, raw_val)

        tile_offsets     = _read_long_array(url, header, tags[324][2], tags[324][1], bo)
        tile_byte_counts = _read_long_array(url, header, tags[325][2], tags[325][1], bo)
    except Exception:
        return None

    delta_lat  = lat_max - lat
    delta_lon  = lon - lon_min
    center_row = int(delta_lat * PX_PER_DEG)
    center_col = int(delta_lon * PX_PER_DEG)
    win_px     = max(10, int(radius_km / 111.0 * PX_PER_DEG))

    row0 = max(0, center_row - win_px)
    col0 = max(0, center_col - win_px)
    row1 = min(TILE_PX, center_row + win_px)
    col1 = min(TILE_PX, center_col + win_px)

    tiles_across = math.ceil(TILE_PX / TILE_W)
    pixels = []

    for tr in range(row0 // TILE_H, row1 // TILE_H + 1):
        for tc in range(col0 // TILE_W, col1 // TILE_W + 1):
            tile_idx = tr * tiles_across + tc
            if tile_idx >= len(tile_offsets):
                continue
            raw = _fetch_bytes(url, tile_offsets[tile_idx],
                               tile_offsets[tile_idx] + tile_byte_counts[tile_idx] - 1)
            if not raw:
                continue
            try:
                tile_data = np.frombuffer(zlib.decompress(raw), dtype=np.uint8).reshape(TILE_H, TILE_W)
            except Exception:
                continue

            r_start = max(row0, tr * TILE_H) - tr * TILE_H
            r_end   = min(row1, (tr + 1) * TILE_H) - tr * TILE_H
            c_start = max(col0, tc * TILE_W) - tc * TILE_W
            c_end   = min(col1, (tc + 1) * TILE_W) - tc * TILE_W
            pixels.append(tile_data[r_start:r_end, c_start:c_end].flatten())

    if not pixels:
        return None

    all_pixels = np.concatenate(pixels)
    total = all_pixels.size
    result = {k: 0.0 for k in OUTPUT_FEATURES}

    for pixel_val, feature in PIXEL_TO_FEATURE.items():
        result[feature] = round(result[feature] + float(np.sum(all_pixels == pixel_val)) / total * 100, 2)

    return result
