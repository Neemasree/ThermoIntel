# PostGIS Installation for PostgreSQL 18 (Windows)

## Quick Summary
PostgreSQL 18 is installed and running on your system, but PostGIS (spatial database extension) is not installed yet. PostGIS is required for Phase 2.

---

## Installation Method 1: PostgreSQL Stack Builder (Recommended)

### Step 1: Open Stack Builder
```powershell
# PostgreSQL 18 is at: C:\Program Files\PostgreSQL\18
# Open Stack Builder:
& 'C:\Program Files\PostgreSQL\18\bin\stackbuilder.exe'
```

### Step 2: In Stack Builder
1. Select your PostgreSQL 18 installation from the dropdown
2. Click "Next"
3. **Expand "Spatial Extensions"**
4. Check the box for **"PostGIS <version> for PostgreSQL 18"**
5. Click "Next"
6. Accept the license agreement
7. Choose installation directory (default is fine)
8. Complete the installation

### Step 3: Verify Installation
After Stack Builder completes, verify PostGIS:

```powershell
cd 'd:\thermalwatch\backend'
.\.venv\Scripts\python.exe -c "from app.database.connection import is_postgis_enabled; print('✓ PostGIS Ready!' if is_postgis_enabled() else '✗ PostGIS Not Found')"
```

Expected output: `✓ PostGIS Ready!`

---

## Installation Method 2: Docker (Alternative - Fastest)

If you prefer not to install PostGIS on your system, use Docker:

### Prerequisites
- Docker Desktop installed (download from docker.com)

### Step 1: Start PostgreSQL with PostGIS in Docker

```powershell
# Stop the local PostgreSQL if it's running
Stop-Service -Name postgresql-x64-18 -Force -ErrorAction SilentlyContinue

# Start PostGIS-enabled PostgreSQL container
docker run --name thermalwatch-pg `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=thermalwatch `
  -p 5432:5432 `
  -d postgis/postgis:latest
```

### Step 2: Wait for Container to Start

```powershell
# Wait 10 seconds for container to initialize
Start-Sleep -Seconds 10

# Verify container is running
docker ps | grep thermalwatch-pg
```

### Step 3: Update `.env`

The Docker container uses these credentials:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=thermalwatch
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
```

### Step 4: Verify Connection

```powershell
cd 'd:\thermalwatch\backend'
.\.venv\Scripts\python.exe -c "from app.database.connection import is_postgis_enabled; print('✓ PostGIS Ready!' if is_postgis_enabled() else '✗ PostGIS Not Found')"
```

---

## Troubleshooting

### Issue: Stack Builder doesn't show PostGIS
**Solution**: Make sure you expanded "Spatial Extensions" section

### Issue: "Could not find PostgreSQL installation"
**Solution**: Stack Builder needs admin privileges. Run as Administrator:
```powershell
Start-Process 'C:\Program Files\PostgreSQL\18\bin\stackbuilder.exe' -Verb RunAs
```

### Issue: Docker container won't start
**Solution**: Make sure Docker Desktop is running and port 5432 is available:
```powershell
# Check if port 5432 is in use
netstat -ano | findstr :5432

# If in use by PostgreSQL service, stop it first
Stop-Service -Name postgresql-x64-18 -Force
```

### Issue: Connection still fails after installation
**Solution**: Restart PostgreSQL service:
```powershell
# For system PostgreSQL
Restart-Service -Name postgresql-x64-18

# For Docker
docker restart thermalwatch-pg
```

---

## Verification Commands

### After Installation, Run These Commands

1. **Python verification**:
```powershell
cd 'd:\thermalwatch\backend'
.\.venv\Scripts\python.exe -c "from app.database.connection import is_postgis_enabled; print(is_postgis_enabled())"
```

2. **SQL verification**:
```powershell
# For system PostgreSQL:
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -d thermalwatch -c "SELECT PostGIS_Version();"

# For Docker:
docker exec thermalwatch-pg psql -U postgres -d thermalwatch -c "SELECT PostGIS_Version();"
```

3. **Full Phase 2 test**:
```powershell
cd 'd:\thermalwatch\backend'
.\.venv\Scripts\Activate.ps1
python -m app.services.firms_service
```

---

## Next Steps After PostGIS Installation

1. ✅ Verify PostGIS is working (run verification commands above)
2. ✅ Update `.env` with your NASA FIRMS_MAP_KEY
3. ✅ Run full Phase 2 ingestion: `python -m app.services.firms_service`
4. ✅ Verify 200K+ records in PostgreSQL

---

## System Information

Your current setup:
- **PostgreSQL**: Version 18 (installed at `C:\Program Files\PostgreSQL\18`)
- **Status**: Running (Windows Service: postgresql-x64-18)
- **Port**: 5432
- **User**: postgres
- **PostGIS**: ❌ Not yet installed

---

## Recommended: Method 1 (Stack Builder)

For simplicity and compatibility with your existing PostgreSQL installation, use **Stack Builder**:

```powershell
# Run as Administrator
Start-Process 'C:\Program Files\PostgreSQL\18\bin\stackbuilder.exe' -Verb RunAs
```

Then follow the on-screen wizard to install PostGIS.

---

**Once PostGIS is installed, reply with "postgis installed" and I'll help you complete Phase 2.**
