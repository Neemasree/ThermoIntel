import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.database.connection import get_db_cursor

with get_db_cursor() as cur:
    # India bounding box
    cur.execute("""
        SELECT COUNT(*) FROM thermal_events
        WHERE latitude BETWEEN 8 AND 37
          AND longitude BETWEEN 68 AND 97
    """)
    print("India total:", cur.fetchone()[0])

    cur.execute("""
        SELECT COUNT(*) FROM thermal_events
        WHERE latitude BETWEEN 8 AND 37
          AND longitude BETWEEN 68 AND 97
          AND acquisition_date >= CURRENT_DATE - INTERVAL '7 days'
    """)
    print("India last 7 days:", cur.fetchone()[0])

    cur.execute("""
        SELECT acquisition_date, COUNT(*) FROM thermal_events
        WHERE latitude BETWEEN 8 AND 37
          AND longitude BETWEEN 68 AND 97
        GROUP BY acquisition_date
        ORDER BY acquisition_date DESC
        LIMIT 10
    """)
    print("India by date:")
    for row in cur.fetchall():
        print(" ", row[0], row[1])

    # Check what regions ARE in the DB
    cur.execute("""
        SELECT
            CASE
                WHEN longitude BETWEEN -180 AND -30 THEN 'Americas'
                WHEN longitude BETWEEN -30 AND 60 THEN 'Europe/Africa'
                WHEN longitude BETWEEN 60 AND 150 THEN 'Asia/Oceania'
                ELSE 'Pacific'
            END as region,
            COUNT(*) as cnt
        FROM thermal_events
        WHERE acquisition_date >= CURRENT_DATE - INTERVAL '3 days'
        GROUP BY 1 ORDER BY 2 DESC
    """)
    print("\nRecent events by region:")
    for row in cur.fetchall():
        print(" ", row[0], row[1])

    # Check FIRMS sources
    cur.execute("""
        SELECT firms_source, MIN(acquisition_date), MAX(acquisition_date), COUNT(*)
        FROM thermal_events
        GROUP BY firms_source
    """)
    print("\nSources date range:")
    for row in cur.fetchall():
        print(" ", row[0], row[1], "to", row[2], "count:", row[3])
