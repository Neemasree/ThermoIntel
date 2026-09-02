# ThermalWatch — Phase 3A: ESA WorldCover Enrichment

## Overview

Phase 3A enriches every FIRMS thermal anomaly observation stored in
`thermal_events` with a land-cover classification from the ESA WorldCover
2021 v200 dataset.  This allows ThermalWatch to answer:

> "What type of land surface is this thermal anomaly occurring on?"

---

## Dataset Metadata

| Property        | Value |
|-----------------|-------|
| Name            | ESA WorldCover 10 m 2021 |
| Version         | **v200** |
| Year            | 2021 |
| Resolution      | 10 m (~0.0000834 degrees) |
| CRS             | **EPSG:4326** (WGS84 geographic lat/lon) |
| Format          | Cloud-Optimised GeoTIFF (COG) |
| Tile size       | 3 × 3 degrees |
| Total tiles     | 2,651 |
| Total data size | ~124 GB (all tiles) |
| License         | CC-BY-4.0 (free, no authentication required) |
| Official site   | https://esa-worldcover.org/ |
| DOI / citation  | https://doi.org/10.5281/zenodo.7254221 |

### AWS S3 Public Bucket

The WorldCover tiles are hosted publicly on AWS S3 (eu-central-1 region).
No credentials are required.

**Tile URL pattern:**
```
https://esa-worldcover.s3.eu-central-1.amazonaws.com/
    v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif
```

Where `{tile}` is the lower-left corner of a 3×3 degree tile,
e.g. `N00E006`, `S30W060`, `N51W003`.

**Tile grid (for tile name lookup):**
```
https://esa-worldcover.s3.eu-central-1.amazonaws.com/
    v100/2020/esa_worldcover_2020_grid.geojson
```

**Bulk S3 sync (AWS CLI, optional local download):**
```bash
aws s3 sync s3://esa-worldcover/v200/2021/map /local/path --no-sign-request
```

---

## Official Class Mapping

| Code | Class Name                |
|------|---------------------------|
| 10   | Tree cover                |
| 20   | Shrubland                 |
| 30   | Grassland                 |
| 40   | Cropland                  |
| 50   | Built-up                  |
| 60   | Bare / sparse vegetation  |
| 70   | Snow and ice              |
| 80   | Permanent water bodies    |
| 90   | Herbaceous wetland        |
| 95   | Mangroves                 |
| 100  | Moss and lichen           |
| 0    | NoData (stored as NULL)   |

---

## CRS Handling

FIRMS observations are stored in **EPSG:4326**.
WorldCover tiles are also in **EPSG:4326**.

No coordinate transformation is required.

---

## Database Changes

The migration added four columns to `thermal_events`:

```sql
ALTER TABLE thermal_events
    ADD COLUMN IF NOT EXISTS worldcover_class_code  SMALLINT,
    ADD COLUMN IF NOT EXISTS worldcover_class_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS worldcover_version     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS worldcover_enriched_at TIMESTAMPTZ;
```

One index was also added:

```sql
CREATE INDEX IF NOT EXISTS idx_thermal_events_worldcover_class_code
    ON thermal_events (worldcover_class_code);
```

All existing FIRMS columns and geometry are **unchanged**.

---

## Sampling Architecture

```
FIRMS event (lat, lon)  —  EPSG:4326
        ↓
Derive 3×3 degree tile name from coordinates
        ↓
Group all events that fall on the same tile
        ↓
Open COG tile once via HTTPS (rasterio + GDAL VSI)
        ↓
rasterio.sample() — fetches only the required COG
blocks over HTTPS (does NOT download the full tile)
        ↓
Map pixel value → WorldCover class code + class name
        ↓
Batch UPDATE thermal_events (500 rows per statement)
```

Key design decisions:
- Each unique tile is opened **once**, regardless of how many FIRMS
  events fall within it.
- `rasterio.sample()` uses the COG block structure to fetch only the
  bytes needed for the requested coordinates — efficient over HTTPS.
- DB updates are batched (500 rows per `executemany`) to minimise
  round-trips.
- The enrichment can be stopped and safely re-started; already-enriched
  rows are skipped by default.

---

## Dependencies Added

| Package   | Version  | Purpose                          |
|-----------|----------|----------------------------------|
| rasterio  | 1.3.11   | COG raster access and sampling   |
| numpy     | ≥2.0.0   | Array operations (already present as 2.5.2) |

Install:
```bash
pip install rasterio==1.3.11
```

---

## Running the Service

### Test mode (read-only — does NOT write to the database)

Classifies a small number of existing FIRMS records and prints results.
Does not modify `thermal_events`.

```bash
cd backend
python -m app.services.worldcover_service --test
```

With a custom record count:
```bash
python -m app.services.worldcover_service --test --limit 10
```

Expected output format:
```
============================================================
  THERMALWATCH WORLDCOVER TEST
============================================================
  Dataset  : ESA WorldCover 2021 v200
  CRS      : EPSG:4326 (WGS84 geographic)
  ...
------------------------------------------------------------
  FIRMS Event ID : 1
  Latitude       : -23.28945
  Longitude      : -58.76951
  WorldCover
    Version      : v200
    CRS          : EPSG:4326
    Tile         : S24W060
    Tile URL     : https://esa-worldcover.s3.eu-central-1.amazonaws.com/...
    Class Code   : 10
    Class Name   : Tree cover
  Result         : SUCCESS
...
============================================================
  TEST COMPLETED SUCCESSFULLY
============================================================
```

### Full enrichment (writes to database — run after approval)

Processes all unenriched records in `thermal_events`.

```bash
cd backend
python -m app.services.worldcover_service --enrich
```

Force re-enrichment of all records (including already-enriched):
```bash
python -m app.services.worldcover_service --enrich --force
```

Custom batch size (default 5,000):
```bash
python -m app.services.worldcover_service --enrich --batch-size 2000
```

---

## NoData and Error Handling

| Situation                        | Stored value          |
|----------------------------------|-----------------------|
| Valid land-cover pixel           | class code + name     |
| Pixel value = 0 (NoData)         | NULL, NULL            |
| Point over ocean (tile missing)  | NULL, NULL            |
| Invalid coordinates              | NULL, NULL            |
| Tile HTTPS fetch error           | NULL, NULL            |
| Corrupted or unreadable tile     | NULL, NULL            |

No values are ever invented or guessed.
When a classification cannot be determined, `NULL` is stored.

---

## Database Verification Queries

Run these after the full enrichment to verify results.

### 1. Land-cover distribution

```sql
SELECT
    worldcover_class_code,
    worldcover_class_name,
    COUNT(*)                                   AS event_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*))
          OVER (), 2)                           AS pct
FROM thermal_events
GROUP BY
    worldcover_class_code,
    worldcover_class_name
ORDER BY
    worldcover_class_code;
```

### 2. Total enriched vs unenriched

```sql
SELECT
    COUNT(*)                                               AS total_events,
    COUNT(*) FILTER (WHERE worldcover_class_code IS NOT NULL)
                                                           AS enriched,
    COUNT(*) FILTER (WHERE worldcover_class_code IS NULL)  AS unenriched
FROM thermal_events;
```

### 3. Enrichment version check

```sql
SELECT
    worldcover_version,
    COUNT(*) AS count
FROM thermal_events
WHERE worldcover_version IS NOT NULL
GROUP BY worldcover_version
ORDER BY worldcover_version;
```

### 4. PostGIS geometry integrity (must remain unchanged)

```sql
SELECT
    COUNT(*)                                                    AS total,
    COUNT(geom)                                                 AS geometry_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326)               AS valid_srid,
    COUNT(*) FILTER (WHERE ST_GeometryType(geom) = 'ST_Point') AS valid_points
FROM thermal_events;
```

All four values must equal 96,828 (or the current total record count).

### 5. Sample enriched records

```sql
SELECT
    id,
    latitude,
    longitude,
    firms_source,
    acquisition_date,
    worldcover_class_code,
    worldcover_class_name,
    worldcover_version,
    worldcover_enriched_at
FROM thermal_events
WHERE worldcover_class_code IS NOT NULL
LIMIT 10;
```

### 6. NoData breakdown

```sql
SELECT
    COUNT(*) FILTER (WHERE worldcover_class_code IS NOT NULL) AS classified,
    COUNT(*) FILTER (
        WHERE worldcover_class_code IS NULL
          AND worldcover_version IS NOT NULL
    )                                                          AS nodata,
    COUNT(*) FILTER (WHERE worldcover_version IS NULL)         AS not_yet_processed
FROM thermal_events;
```

### 7. Schema confirmation

```sql
SELECT
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'thermal_events'
  AND column_name LIKE 'worldcover%'
ORDER BY column_name;
```

Expected result:

| column_name              | data_type                   |
|--------------------------|-----------------------------|
| worldcover_class_code    | smallint                    |
| worldcover_class_name    | character varying (100)     |
| worldcover_enriched_at   | timestamp with time zone    |
| worldcover_version       | character varying (20)      |

---

## Attribution

When publishing results derived from this dataset, include:

> © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel
> data (2021) processed by ESA WorldCover consortium

Citation:
> Zanaga, D., Van De Kerchove, R., Daems, D., et al., 2022.
> ESA WorldCover 10 m 2021 v200.
> https://doi.org/10.5281/zenodo.7254221
