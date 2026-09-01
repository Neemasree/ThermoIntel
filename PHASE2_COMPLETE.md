# ThermalWatch Phase 2: PostgreSQL + PostGIS

## ✅ What was created

### 1. Database Connection Module (`backend/app/database/connection.py`)
- Flexible PostgreSQL connection that supports both password auth and trust auth (local connections)
- Connection pooling via context managers
- PostGIS extension detection and activation
- Clean error handling for connection failures

### 2. Database Schema & Setup (`backend/app/database/setup.py`)
- `thermal_events` table with PostGIS geometry column:
  - Core fields: `id`, `latitude`, `longitude`, `geom` (Point geometry, SRID 4326)
  - Common FIRMS fields: `frp`, `brightness`, `confidence`, `acquisition_date`, `acquisition_time`, `satellite`, `instrument`, `version`, `daynight`
  - Data source tracking: `firms_source`
  - Sensor-specific fields: `bright_ti4`, `bright_ti5`, `bright_t31`, `scan`, `track` (NULL when not available)
  - Metadata: `created_at`, `updated_at`

- **Deduplication Strategy**:
  - Unique constraint on: `(satellite, acquisition_date, acquisition_time, latitude, longitude)`
  - Prevents duplicate observations from repeated ingestion runs
  - Uses `ON CONFLICT DO NOTHING` for safe insertion

- **Spatial Indexes**:
  - GIST index on `geom` for efficient spatial queries
  - B-tree indexes on `acquisition_date`, `firms_source`, `satellite` for temporal and source filtering

### 3. Extended FIRMS Service (`backend/app/services/firms_service.py`)
- New function: `ingest_all_firms_to_database()` - fetches all four FIRMS sources and persists them
- Normalizes different FIRMS column names to schema (e.g., `acq_date` → `acquisition_date`)
- Preserves sensor-specific fields when available (no fake data)
- Records source tracking: knows which instrument provided each observation
- Comprehensive error handling for network, API, and database errors

### 4. Configuration (`backend/.env.example`)
Updated to include database credentials:
```env
FIRMS_MAP_KEY=YOUR_MAP_KEY

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=thermalwatch
DATABASE_USER=postgres
DATABASE_PASSWORD=YOUR_PASSWORD
```

### 5. Documentation (`POSTGIS_SETUP.md`)
Step-by-step instructions for:
- Installing PostGIS on Windows via PostgreSQL Stack Builder
- Verifying PostGIS installation
- Alternative: Using PostgreSQL Docker image with PostGIS pre-installed
- Troubleshooting connection issues

---

## 📋 File Changes Summary

### New Database Module
```
backend/app/database/
├── __init__.py          (package marker)
├── connection.py        (PostgreSQL connection management)
├── models.py            (data models - currently minimal)
└── setup.py             (schema creation, insertion, verification)
```

### Modified Files
- `backend/app/services/firms_service.py` - Added `ingest_all_firms_to_database()` function
- `backend/.env.example` - Added DATABASE_* environment variables
- `backend/requirements.txt` - Already includes `psycopg2-binary==2.9.10`

---

## 🔧 How to Set Up (Windows)

### 1. Create PostgreSQL database

```powershell
# Connect as postgres user
psql -U postgres

# Inside psql:
CREATE DATABASE thermalwatch;
```

### 2. Install PostGIS (REQUIRED for Phase 2)

See [POSTGIS_SETUP.md](POSTGIS_SETUP.md) for detailed instructions.

**Option A: Stack Builder (easiest)**
- Open PostgreSQL Stack Builder
- Select "Spatial Extensions" → PostGIS
- Complete installation

**Option B: Docker (fastest)**
```powershell
docker run --name thermalwatch-pg `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=thermalwatch `
  -p 5432:5432 `
  -d postgis/postgis:latest
```

### 3. Verify PostGIS

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from app.database.connection import get_connection, is_postgis_enabled; print('PostGIS enabled:', is_postgis_enabled())"
```

Expected output:
```
PostGIS enabled: True
```

### 4. Configure `.env`

Copy `.env.example` to `.env` and set:

```env
FIRMS_MAP_KEY=YOUR_ACTUAL_NASA_FIRMS_KEY
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=thermalwatch
DATABASE_USER=postgres
DATABASE_PASSWORD=YOUR_PASSWORD_OR_EMPTY_FOR_TRUST_AUTH
```

### 5. Run Phase 2 Ingestion Test

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.services.firms_service
```

Expected output:
```
======================================================================
THERMALWATCH — PHASE 2: FIRMS DATA INGESTION TO PostgreSQL
======================================================================

[Step 1] Fetching FIRMS data from all sources...

  MODIS_NRT: 13,992 records
  VIIRS_NOAA20_NRT: 66,344 records
  VIIRS_NOAA21_NRT: 64,208 records
  VIIRS_SNPP_NRT: 72,572 records

✓ Total records fetched: 217,116

[Step 2] Ingesting FIRMS data to PostgreSQL...

✓ Database ingestion complete!

Insertion summary by source:

  MODIS_NRT:
    Total:       13,992
    Inserted:    13,992
    Skipped:          0

  VIIRS_NOAA20_NRT:
    Total:       66,344
    Inserted:    66,344
    Skipped:          0

  VIIRS_NOAA21_NRT:
    Total:       64,208
    Inserted:    64,208
    Skipped:          0

  VIIRS_SNPP_NRT:
    Total:       72,572
    Inserted:    72,572
    Skipped:          0

  TOTAL INSERTED: 217,116
  TOTAL SKIPPED:  0

[Step 3] Verifying database state...

✓ PostGIS version: POSTGIS="3.3.2" PGSQL="13"
✓ Table exists: True
✓ Total records in DB: 217,116

✓ Sample record:
    Latitude:  -23.45
    Longitude: 134.56
    Source: VIIRS_NOAA21_NRT
    Geometry: POINT(134.56 -23.45)

======================================================================
Phase 2 complete!
======================================================================
```

---

## ✔️ How to Test Database Connection

### Method 1: Python Script
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from app.database.setup import verify_database; print(verify_database())"
```

### Method 2: psql Query
```powershell
psql -U postgres -d thermalwatch -c "
  SELECT COUNT(*) as total_records,
         COUNT(DISTINCT firms_source) as sources,
         COUNT(DISTINCT satellite) as satellites
  FROM thermal_events;
"
```

### Method 3: Verify PostGIS Geometry
```powershell
psql -U postgres -d thermalwatch -c "
  SELECT latitude, longitude, ST_AsText(geom) as geometry
  FROM thermal_events
  LIMIT 5;
"
```

Expected geometry format: `POINT(longitude latitude)` with SRID 4326

---

## ✔️ How to Verify Records in PostgreSQL

### Count records by source:
```sql
SELECT firms_source, COUNT(*) as count
FROM thermal_events
GROUP BY firms_source
ORDER BY count DESC;
```

### View geometry validity:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN ST_IsValid(geom) THEN 1 END) as valid_geoms,
  COUNT(CASE WHEN ST_IsValid(geom) THEN 1 END)::float / COUNT(*) * 100 as validity_pct
FROM thermal_events;
```

### Find hottest observations:
```sql
SELECT latitude, longitude, brightness, frp, acquisition_date, satellite
FROM thermal_events
WHERE brightness IS NOT NULL
ORDER BY brightness DESC
LIMIT 10;
```

### Spatial query example (observations within 1 degree of a location):
```sql
SELECT COUNT(*) as nearby_observations
FROM thermal_events
WHERE ST_DWithin(geom, ST_GeomFromText('POINT(0 0)', 4326), 1);
```

---

## ⚙️ Database Configuration Details

### Connection Parameters (from .env)
- `DATABASE_HOST`: PostgreSQL server hostname (default: localhost)
- `DATABASE_PORT`: PostgreSQL port (default: 5432)
- `DATABASE_NAME`: Database name (default: thermalwatch)
- `DATABASE_USER`: PostgreSQL user (default: postgres)
- `DATABASE_PASSWORD`: User password (empty for trust auth)

### Unique Constraint Strategy
Records are identified by the combination of:
1. **satellite** - Which satellite/instrument (MODIS, VIIRS_NOAA20, etc.)
2. **acquisition_date** - Date of observation
3. **acquisition_time** - Time of observation (in minutes since midnight UTC)
4. **latitude** - Y coordinate
5. **longitude** - X coordinate

This prevents duplicate observations when re-running ingestion.

### Geometry Column (PostGIS)
- **Type**: `geometry(Point, 4326)`
- **SRID**: 4326 (WGS84 - global lat/lon system)
- **Source**: Generated from `longitude, latitude`
- **Format**: `POINT(X Y)` where X=longitude, Y=latitude

---

## 🚨 Common Issues & Solutions

### Issue: "extension 'postgis' is not available"
**Solution**: PostGIS not installed. See [POSTGIS_SETUP.md](POSTGIS_SETUP.md)

### Issue: "could not connect to database server"
**Solution**: Check DATABASE_HOST and DATABASE_PORT in .env
```powershell
# Test connection
psql -U postgres -d thermalwatch
```

### Issue: "password authentication failed"
**Solution**: Verify DATABASE_PASSWORD in .env or use trust auth
```powershell
# Check pg_hba.conf authentication method
# Usually at: C:\Program Files\PostgreSQL\<VERSION>\data\pg_hba.conf
```

### Issue: "UNIQUE constraint violated"
**Solution**: This is expected if re-running ingestion. `ON CONFLICT DO NOTHING` will skip duplicates.

---

## 📊 Phase 2 Data Flow

```
NASA FIRMS API
    ↓
fetch_all_firms_global()
    ↓ (combines 4 sources)
Pandas DataFrame
    ↓
normalize_firms_dataframe()
    ↓ (standardize column names)
PostgreSQL INSERT
    ↓
thermal_events table
    ↓
Indexed by:
  - acquisition_date
  - firms_source
  - satellite
  - geom (GIST spatial index)
```

---

## 🔄 Next Phase (Phase 3)

After Phase 2 is complete and verified:
- Spatial enrichment with ESA WorldCover land-cover data
- Temporal analysis of observation patterns
- Feature engineering for ML model
- XGBoost classification training
- SHAP explainability

**Note**: Do not proceed to Phase 3 until Phase 2 is fully tested and data is persistent in PostgreSQL.

---

## ✅ Phase 2 Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `thermalwatch` created
- [ ] PostGIS extension installed
- [ ] `.env` file created with FIRMS_MAP_KEY and database credentials
- [ ] `python -m app.services.firms_service` runs successfully
- [ ] All four FIRMS sources fetched
- [ ] Records inserted into `thermal_events` table
- [ ] Geometry column populated with valid POINT(lon lat) data
- [ ] `verify_database()` returns table_exists=True
- [ ] `thermal_events` contains expected number of records
- [ ] `ON CONFLICT` constraint prevents duplicate inserts
