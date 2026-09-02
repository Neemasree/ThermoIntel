import requests, os, sys
from dotenv import load_dotenv
load_dotenv()

key = os.getenv("FIRMS_API_KEY")
print("Key loaded:", bool(key))

url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/67.0,6.0,98.0,38.0/1/2026-08-31"
print("URL:", url)

r = requests.get(url, timeout=60)
print("HTTP:", r.status_code)
lines = r.text.strip().split("\n")
print("Rows (incl header):", len(lines))
print("Header:", lines[0][:120])
if len(lines) > 1:
    print("Row 1:", lines[1][:120])
else:
    print("NO DATA ROWS")
