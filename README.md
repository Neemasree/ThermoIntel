# ThermalWatch

ThermalWatch is a global thermal anomaly monitoring and risk-analysis platform built with Python, PostgreSQL, PostGIS, and modern geospatial tools.

## Current Status

### Phase 1 ✅ Complete
- FastAPI backend scaffold
- Multi-source NASA FIRMS ingestion (MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT)
- Real-time global thermal anomaly data fetching
- Pandas-based data processing
- Error handling for network, API, and data parsing issues
- Verified: Successfully fetches 200K+ real global observations per day

### Phase 2 ✅ In Progress
- PostgreSQL database with `thermalwatch` database
- PostGIS spatial database extension
- `thermal_events` table with geospatial geometry column
- Deduplication strategy to avoid duplicate inserts
- FIRMS data normalization and persistent storage
- Spatial indexing (GIST on geometry column)
- Temporal indexing (acquisition_date, satellite, source)

### Phase 3 (Upcoming)
- ESA WorldCover land-cover enrichment
- OpenStreetMap/Overpass infrastructure data
- Spatial analysis and buffer analysis
- Temporal pattern analysis
- Feature engineering for ML

### Phase 4+ (Future)
- XGBoost classification model
- SHAP explainability
- Risk scoring
- Alerting system
- React + Leaflet/MapLibre global dashboard

---

## Quick Start

### Prerequisites
1. Python 3.10+
2. PostgreSQL 13+ with PostGIS extension
3. NASA FIRMS API key (get it from https://firms.modaps.eosdis.nasa.gov/api/)

### Installation

1. **Set up virtual environment** (from `backend/` folder):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

2. **Create PostgreSQL database**:
   ```powershell
   psql -U postgres
   # Inside psql:
   CREATE DATABASE thermalwatch;
   ```

3. **Install PostGIS**:
   See [POSTGIS_SETUP.md](POSTGIS_SETUP.md) for Windows installation instructions.

4. **Configure environment** (copy `.env.example` to `.env`):
   ```env
   FIRMS_MAP_KEY=YOUR_ACTUAL_NASA_FIRMS_KEY
   
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_NAME=thermalwatch
   DATABASE_USER=postgres
   DATABASE_PASSWORD=YOUR_PASSWORD
   ```

5. **Run Phase 2 ingestion test**:
   ```powershell
   python -m app.services.firms_service
   ```

---

## Architecture

```
NASA FIRMS API
    ↓
Python FIRMS Service
    ↓ (4 global sources)
Combine + Normalize
    ↓
PostgreSQL + PostGIS
    ↓
Persistent Observations
    ↓
Spatial Indexing (GIST)
Temporal Indexing (Date, Source, Satellite)
    ↓
Phase 3+: Enrichment, Analysis, ML
```

---

## Project Structure

```
thermalwatch/
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 (FastAPI app)
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── firms_service.py    (Multi-source FIRMS + DB ingestion)
│   │   │
│   │   └── database/
│   │       ├── __init__.py
│   │       ├── connection.py       (PostgreSQL connection management)
│   │       ├── models.py           (Data models)
│   │       └── setup.py            (Schema, insertion, verification)
│   │
│   ├── .env                        (Copy from .env.example, set your keys)
│   ├── .env.example                (Template with required variables)
│   ├── .gitignore                  (Excludes .env, venv, __pycache__)
│   └── requirements.txt            (Python dependencies)
│
├── README.md                       (This file)
├── POSTGIS_SETUP.md               (PostGIS installation guide)
├── PHASE2_COMPLETE.md             (Detailed Phase 2 documentation)
└── (frontend/ - coming in Phase 5)
```

---

## Data Fields

### thermal_events table schema

| Field | Type | Notes |
|-------|------|-------|
| id | SERIAL PRIMARY KEY | Auto-incremented record ID |
| latitude | DOUBLE PRECISION NOT NULL | Y coordinate (WGS84) |
| longitude | DOUBLE PRECISION NOT NULL | X coordinate (WGS84) |
| geom | GEOMETRY(Point, 4326) NOT NULL | PostGIS Point geometry SRID 4326 |
| frp | DOUBLE PRECISION | Fire Radiative Power (MW) |
| brightness | DOUBLE PRECISION | Brightness temperature (K) |
| confidence | INTEGER | Detection confidence (0-100%) |
| acquisition_date | DATE NOT NULL | Date of observation |
| acquisition_time | INTEGER | Time in minutes since midnight UTC |
| satellite | VARCHAR(100) NOT NULL | Satellite/instrument name |
| instrument | VARCHAR(100) | Instrument identifier |
| version | VARCHAR(100) | Data version |
| daynight | VARCHAR(10) | Day or Night observation |
| firms_source | VARCHAR(100) NOT NULL | MODIS_NRT, VIIRS_NOAA20_NRT, etc. |
| bright_ti4 | DOUBLE PRECISION | VIIRS-specific thermal band |
| bright_ti5 | DOUBLE PRECISION | VIIRS-specific thermal band |
| bright_t31 | DOUBLE PRECISION | MODIS-specific thermal band |
| scan | DOUBLE PRECISION | Pixel scan dimension |
| track | DOUBLE PRECISION | Pixel track dimension |
| created_at | TIMESTAMPTZ | Record insertion timestamp |

**Indexes**:
- Primary key: `id`
- Spatial: GIST index on `geom`
- Temporal: B-tree on `acquisition_date`, `satellite`, `firms_source`
- **Unique constraint**: `(satellite, acquisition_date, acquisition_time, latitude, longitude)` - prevents duplicates

---

## Database Verification

### Count records by source:
```sql
SELECT firms_source, COUNT(*) as count
FROM thermal_events
GROUP BY firms_source
ORDER BY count DESC;
```

### Check geometry validity:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN ST_IsValid(geom) THEN 1 END) as valid_geoms
FROM thermal_events;
```

### Spatial query example (observations within 1 degree of a location):
```sql
SELECT COUNT(*) as nearby_observations
FROM thermal_events
WHERE ST_DWithin(geom, ST_GeomFromText('POINT(0 0)', 4326), 1);
```

---

## Common Commands

### Activate Python environment:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
```

### Run FIRMS ingestion test:
```powershell
python -m app.services.firms_service
```

### Test database connection:
```powershell
python -c "from app.database.setup import verify_database; print(verify_database())"
```

### Query database via psql:
```powershell
psql -U postgres -d thermalwatch -c "SELECT COUNT(*) as total FROM thermal_events;"
```

---

## Troubleshooting

### "PostgreSQL connection failed"
- Verify PostgreSQL is running
- Check `DATABASE_HOST`, `DATABASE_PORT` in `.env`
- Ensure `thermalwatch` database exists

### "PostGIS extension not found"
- Install PostGIS (see [POSTGIS_SETUP.md](POSTGIS_SETUP.md))
- Verify: `psql -U postgres -d thermalwatch -c "SELECT PostGIS_Version();"`

### "FIRMS_MAP_KEY is missing"
- Copy `.env.example` to `.env`
- Add your NASA FIRMS API key
- Restart Python process

---

## Development Phases

| Phase | Status | Content |
|-------|--------|---------|
| 1 | ✅ Done | NASA FIRMS API ingestion (4 global sources) |
| 2 | 🔄 Active | PostgreSQL + PostGIS persistent storage |
| 3 | 📅 Next | ESA WorldCover + OSM enrichment |
| 4 | 📅 Future | ML feature engineering |
| 5 | 📅 Future | XGBoost + SHAP |
| 6 | 📅 Future | Risk scoring + alerts |
| 7 | 📅 Future | React + Leaflet GIS dashboard |

---

## Notes

- **No mock data**: All data is real NASA FIRMS observations
- **No hardcoded credentials**: All keys in environment variables
- **No git secrets**: `.env` is in `.gitignore`
- **Beginner-friendly**: Code is modular and well-commented
- **Production-ready database**: PostGIS with proper indexing and deduplication

---

## License

ThermalWatch is a research project. See LICENSE file for details.

---

## Next Steps

After Phase 2:
1. Enrich observations with ESA WorldCover land-cover classification
2. Cross-reference with OpenStreetMap/Overpass infrastructure
3. Engineer temporal and spatial features
4. Train XGBoost model on labeled events
5. Use SHAP to explain predictions
6. Calculate operational risk scores
7. Build React GIS dashboard
