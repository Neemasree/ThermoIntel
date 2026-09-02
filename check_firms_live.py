import csv, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

with open('d:/thermalwatch/firms_live.csv') as f:
    rows = list(csv.DictReader(f))

print(f"=== LIVE NASA FIRMS DATA (VIIRS_SNPP_NRT, 1 day) ===")
print(f"Total rows fetched RIGHT NOW: {len(rows)}")
if rows:
    print(f"Columns: {list(rows[0].keys())}")
    dates = sorted(set(r.get('acq_date','') for r in rows))
    print(f"Dates: {dates}")
    print()

    india = [r for r in rows if 8 <= float(r.get('latitude',0)) <= 37 and 68 <= float(r.get('longitude',0)) <= 97]
    print(f"India rows in live fetch: {len(india)}")
    for r in india[:5]:
        print(f"  lat={r.get('latitude')} lon={r.get('longitude')} date={r.get('acq_date')} frp={r.get('frp')} bright_ti4={r.get('bright_ti4')}")

    print()
    # Regional breakdown
    americas = [r for r in rows if float(r.get('longitude',0)) < -30]
    africa_eu = [r for r in rows if -30 <= float(r.get('longitude',0)) < 60]
    asia = [r for r in rows if float(r.get('longitude',0)) >= 60]
    print(f"Americas: {len(americas)}")
    print(f"Africa/Europe: {len(africa_eu)}")
    print(f"Asia/Oceania: {len(asia)}")

print()
print("=== DB COMPARISON ===")
from app.database.connection import get_db_cursor
with get_db_cursor() as cur:
    cur.execute("SELECT COUNT(*), MAX(acquisition_date), MIN(acquisition_date) FROM thermal_events WHERE firms_source='VIIRS_SNPP_NRT'")
    row = cur.fetchone()
    print(f"DB VIIRS_SNPP_NRT: {row[0]} rows, dates {row[2]} to {row[1]}")

    cur.execute("SELECT COUNT(*), MAX(acquisition_date) FROM thermal_events")
    row = cur.fetchone()
    print(f"DB total: {row[0]} rows, latest date: {row[1]}")

    cur.execute("""
        SELECT firms_source, COUNT(*), MAX(acquisition_date)
        FROM thermal_events GROUP BY firms_source
    """)
    print("By source:")
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]} rows, latest {r[2]}")

    # Check if live data dates match DB
    if rows:
        latest_live_date = max(r.get('acq_date','') for r in rows)
        cur.execute("SELECT COUNT(*) FROM thermal_events WHERE acquisition_date = %s AND firms_source='VIIRS_SNPP_NRT'", (latest_live_date,))
        db_count_today = cur.fetchone()[0]
        print(f"\nLive data latest date: {latest_live_date}")
        print(f"DB rows for that date (VIIRS_SNPP_NRT): {db_count_today}")
        print(f"Live rows for that date: {len([r for r in rows if r.get('acq_date')==latest_live_date])}")
