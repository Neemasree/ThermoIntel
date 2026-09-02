import pandas as pd

df = pd.read_csv('data/processed/feature_dataset.csv')
print('Shape:', df.shape)
print()

print('=== verification_status ===')
print(df['verification_status'].value_counts(dropna=False).to_string())
print()

print('=== candidate_label ===')
print(df['candidate_label'].value_counts(dropna=False).to_string())
print()

print('=== data_quality_flags ===')
print(df['data_quality_flags'].value_counts(dropna=False).to_string())
print()

print('=== osm_query_status (first 5) ===')
for i, v in enumerate(df['osm_query_status'].head()):
    print(f'  [{i}] {v}')
print()

print('=== Null counts across ALL rows ===')
nulls = df.isnull().sum()
print(nulls[nulls > 0].to_string())
print()

print('=== Sample: 3 data_invalid rows ===')
inv = df[df['verification_status'] == 'data_invalid']
cols = ['event_id', 'distance_to_industrial', 'near_industrial_facility',
        'forest_pct', 'cropland_pct', 'persistence_score',
        'data_quality_flags', 'osm_query_status']
print(inv[cols].head(3).to_string())
print()

print('=== Sample: 3 uncertain rows ===')
unc = df[df['verification_status'] == 'uncertain']
print(unc[cols].head(3).to_string())
print()

print('=== Feature value ranges (valid rows only) ===')
valid = df[df['verification_status'] != 'data_invalid']
feature_cols = [
    'brightness', 'frp', 'confidence',
    'distance_to_industrial', 'distance_to_road',
    'near_industrial_facility',
    'forest_pct', 'cropland_pct', 'grassland_pct', 'builtup_pct', 'water_pct',
    'detections_7d', 'detections_30d', 'persistence_score',
    'frp_ratio', 'brightness_ratio',
]
print(valid[feature_cols].describe().round(3).to_string())
