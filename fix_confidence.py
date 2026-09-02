"""
Patches confidence values into the existing feature_dataset.csv
by re-parsing the raw FIRMS file.
"""
import sys, pandas as pd
sys.path.insert(0, ".")
from src.firms.parser import parse_firms

raw = pd.read_csv("data/raw/firms/firms_recent.csv")
parsed, _ = parse_firms(raw)

df = pd.read_csv("data/processed/feature_dataset.csv")

conf_lookup = dict(zip(parsed["event_id"], parsed["confidence"]))
df["confidence"] = df["event_id"].map(conf_lookup)

df.to_csv("data/processed/feature_dataset.csv", index=False)

nulls = df["confidence"].isna().sum()
counts = df["confidence"].value_counts().to_dict()
print(f"confidence nulls after patch: {nulls}/{len(df)}")
print(f"value counts: {counts}")
print(df[["event_id", "confidence"]].head(5).to_string())
