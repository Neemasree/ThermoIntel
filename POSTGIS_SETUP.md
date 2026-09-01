## PostgreSQL + PostGIS Installation Guide (Windows)

PostgreSQL is running, but **PostGIS extension is not installed**. PostGIS is required for Phase 2 geospatial support.

### Step 1: Install PostGIS via PostgreSQL Application Stack Builder

1. **Download Stack Builder**:
   - Open PostgreSQL (pgAdmin 4 or psql)
   - Run: `C:\Program Files\PostgreSQL\<VERSION>\bin\stackbuilder.exe`
   
2. **In Stack Builder**:
   - Select your PostgreSQL installation
   - Click "Next"
   - Expand "Spatial Extensions"
   - Check "PostGIS <version> for PostgreSQL <version>"
   - Click "Next" and complete the installation

### Step 2: Verify PostGIS Installation

After installation, test it:

```powershell
cd backend
.\.venv\Scripts\python.exe -c "from app.database.connection import get_connection, is_postgis_enabled; print('PostGIS enabled:', is_postgis_enabled())"
```

Or via psql:

```powershell
psql -U postgres -d thermalwatch -c "SELECT PostGIS_Version();"
```

### Alternative: Use PostgreSQL Docker Image with PostGIS

If you want to skip the manual installation, use Docker:

```powershell
docker run --name thermalwatch-pg `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=thermalwatch `
  -p 5432:5432 `
  -d postgis/postgis:latest
```

Then update `.env`:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=thermalwatch
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
```

### Step 3: After PostGIS Installation, Run Phase 2 Test

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.services.firms_service
```

---

**Do you need help with any of these steps?**
