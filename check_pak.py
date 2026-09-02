import pandas as pd
df = pd.read_csv('data/raw/firms/firms_recent.csv')
pak = df[df['longitude'] < 75]
print('Pakistan/west outlier points:')
print(pak[['latitude','longitude']].to_string())
