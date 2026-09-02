import pandas as pd
df = pd.read_csv('data/raw/firms/firms_recent.csv')
print('lat range:', df['latitude'].min(), '->', df['latitude'].max())
print('lon range:', df['longitude'].min(), '->', df['longitude'].max())
print('total points:', len(df))
print()
sri_lanka  = df[(df['latitude'] < 10) & (df['longitude'] > 79)]
south_india = df[(df['latitude'] >= 10) & (df['latitude'] < 15)]
pak_region  = df[df['longitude'] < 75]
north       = df[(df['latitude'] >= 15) & (df['longitude'] >= 75)]
print('Sri Lanka  (<10N, >79E):', len(sri_lanka))
print('South India (10-15N):   ', len(south_india))
print('Pakistan region (<75E): ', len(pak_region))
print('North India (>=15N):    ', len(north))
print()
print('North India points:')
print(north[['latitude','longitude']].sort_values('latitude').to_string())
