import pandas as pd

chunks_90 = 90 // 5
chunks_30 = 30 // 5
print(f"30-day history = {chunks_30} FIRMS API requests")
print(f"90-day history = {chunks_90} FIRMS API requests")
print(f"Extra requests needed = {chunks_90 - chunks_30}")

h = pd.read_csv("data/raw/firms/firms_history.csv")
h["acq_date"] = pd.to_datetime(h["acq_date"])
print(f"\nExisting history covers : {h['acq_date'].min().date()} to {h['acq_date'].max().date()}")
print(f"Unique dates            : {h['acq_date'].dt.date.nunique()}")
print(f"Total rows              : {len(h)}")
print(f"Rows per day (avg)      : {len(h) / h['acq_date'].dt.date.nunique():.0f}")
