README — Thermal Anomaly Labelled Dataset Generator
AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources

This mini-project is used only for creating the labelled training dataset for the SIH 2026 Problem Statement 26162.

The project collects thermal anomaly data from NASA FIRMS, geographic information from OpenStreetMap (OSM), land-cover information from ESA WorldCover, and historical FIRMS observations. It extracts a fixed set of features for every thermal anomaly and helps generate candidate labels that can then be manually verified.

The final output is a CSV dataset that can later be directly used to train the XGBoost classification model.

1. Objective

The objective is to convert raw FIRMS thermal anomaly data into a structured dataset containing:

FIRMS thermal information
        +
OSM spatial information
        +
WorldCover land-cover information
        +
Historical FIRMS information
        ↓
Feature extraction
        ↓
Candidate label generation
        ↓
Manual verification
        ↓
labelled_training_data.csv

This project does not train or deploy the XGBoost model.

Its only purpose is:

Collect → Extract → Label → Verify → Export training data

2. Classes / Labels

Initially, the dataset will use four classes:

Label	Class
0	Industrial Thermal Source
1	Wildfire
2	Agricultural Burning
3	Other / Uncertain

The label represents the most likely source of the thermal anomaly, not the FIRMS detection confidence.

3. Data Sources
3.1 NASA FIRMS

NASA FIRMS provides the thermal anomaly observations.

It supplies information such as:

latitude
longitude
brightness
FRP
confidence
acquisition date/time
day/night
satellite
instrument
scan
track

FIRMS is the primary source of thermal events.

3.2 OpenStreetMap

OSM is used to determine the geographic context around each thermal anomaly.

The system searches for nearby:

industrial facilities
refineries
power plants
mines
gas facilities
roads

The OSM data is converted into distances and binary proximity features.

For example:

Thermal anomaly
       ↓
OSM search within radius
       ↓
Nearest refinery = 0.6 km
Nearest factory = 0.8 km
Nearest road = 0.2 km
3.3 ESA WorldCover

ESA WorldCover is used to determine the land-cover composition around the thermal anomaly.

The system calculates the percentage of the surrounding area occupied by:

industrial/built-up areas
forest
cropland
grassland
built-up areas
water

The land-cover features help distinguish environments such as:

Industrial area
Forest
Agricultural area
Urban area
3.4 Historical FIRMS Data

Historical FIRMS observations are used to determine whether thermal activity is:

temporary
repeated
persistent
unusually intense compared with the historical baseline

This is especially important for detecting persistent industrial thermal sources.

4. Fixed Feature Schema

The following feature set is fixed for the initial version of the project.

Do not change the feature names between dataset generation and XGBoost training.

4.1 Thermal Features
brightness
frp
confidence
day_night
brightness

Satellite-measured brightness temperature associated with the thermal anomaly.

frp

Fire Radiative Power, representing the radiative intensity of the detected thermal source.

confidence

Confidence associated with the FIRMS detection.

day_night

Indicates whether the observation occurred during daytime or nighttime.

5. Spatial Features
distance_to_industrial
distance_to_refinery
distance_to_powerplant
distance_to_mine
distance_to_gas_facility
distance_to_road

All distances should be stored using a consistent unit:

kilometres

Example:

distance_to_refinery = 0.42

means the nearest refinery is approximately 0.42 km away.

If no relevant feature exists within the configured search radius, use a consistent representation such as the configured maximum distance.

6. Nearby Facility Features
near_industrial_facility
near_refinery
near_powerplant
near_mine
near_gas_facility

These are binary features:

1 = facility exists within configured radius
0 = facility not found within configured radius

Example:

near_refinery = 1
distance_to_refinery = 0.42
7. Land-Cover Features
industrial_pct
forest_pct
cropland_pct
grassland_pct
builtup_pct
water_pct

Each value represents the percentage of the selected analysis area covered by that land-cover class.

Example:

industrial_pct = 72
forest_pct = 4
cropland_pct = 12
grassland_pct = 3
builtup_pct = 9
water_pct = 0

The analysis radius/window must remain consistent for all samples.

8. Temporal Features

Historical FIRMS data is used to calculate:

detections_7d
detections_30d
detections_90d
mean_frp_30d
max_frp_30d
mean_brightness_30d
days_active_30d
persistence_score
detections_7d

Number of FIRMS detections associated with the spatial analysis area during the previous 7 days.

detections_30d

Number of detections during the previous 30 days.

detections_90d

Number of detections during the previous 90 days.

mean_frp_30d

Average FRP of historical detections during the previous 30 days.

max_frp_30d

Maximum FRP observed during the previous 30 days.

mean_brightness_30d

Average historical brightness during the previous 30 days.

days_active_30d

Number of distinct days on which thermal activity was detected during the previous 30 days.

persistence_score

A normalized measure representing how consistently the location produces thermal detections.

The exact formula should remain fixed after being defined.

For example:

persistence_score =
days_active_30d / 30

This gives:

0   → no activity
1   → activity detected on every day
9. Anomaly Features
frp_deviation
frp_ratio
brightness_deviation
brightness_ratio

These compare the current thermal observation with the historical baseline.

For example:

historical_mean_frp = 40 MW
current_frp = 120 MW

Then:

frp_deviation = 120 - 40
               = 80 MW

and:

frp_ratio = 120 / 40
          = 3

A high ratio can indicate that the current thermal activity is considerably stronger than the historical baseline.

10. Final Dataset Structure

The generated CSV should contain the following columns.

event_id

brightness
frp
confidence
day_night

distance_to_industrial
distance_to_refinery
distance_to_powerplant
distance_to_mine
distance_to_gas_facility
distance_to_road

near_industrial_facility
near_refinery
near_powerplant
near_mine
near_gas_facility

industrial_pct
forest_pct
cropland_pct
grassland_pct
builtup_pct
water_pct

detections_7d
detections_30d
detections_90d
mean_frp_30d
max_frp_30d
mean_brightness_30d
days_active_30d
persistence_score

frp_deviation
frp_ratio
brightness_deviation
brightness_ratio

candidate_label
verified_label
verification_status

The model features are everything from brightness through brightness_ratio.

The final target used by XGBoost will be:

verified_label
11. Why Two Label Columns?

The project intentionally separates:

candidate_label

from:

verified_label
Candidate label

Generated automatically using predefined rules.

Example:

industrial_pct > 60%
AND
distance_to_industrial < 1 km
AND
persistence_score > threshold

→

candidate_label = Industrial

This is not considered ground truth.

Verified label

A human checks the candidate using available evidence such as satellite imagery, geographic information and other reliable sources.

The human can:

KEEP → Industrial
CHANGE → Wildfire
CHANGE → Agriculture
REJECT → Other/Uncertain

Only verified_label should ultimately be used as the training target.

12. Labelling Workflow
                 FIRMS
                   ↓
          Thermal anomalies
                   ↓
        Extract FIRMS features
                   ↓
          ┌────────┴────────┐
          ↓                 ↓
         OSM           WorldCover
          ↓                 ↓
     Spatial features   Land cover
          └────────┬────────┘
                   ↓
          Historical FIRMS
                   ↓
          Temporal features
                   ↓
           Anomaly features
                   ↓
            Feature Dataset
                   ↓
         Automatic candidate
              labelling
                   ↓
          ┌────────┴────────┐
          ↓                 ↓
       High confidence   Uncertain
          ↓                 ↓
      Manual review      Review
          └────────┬────────┘
                   ↓
            Verified Label
                   ↓
       labelled_training_data.csv
13. Candidate Labelling Strategy

Candidate labels should be generated using multiple pieces of evidence, rather than a single feature.

Industrial Thermal Source

Possible evidence:

industrial land present
+
industrial facility nearby
+
persistent thermal activity
Wildfire

Possible evidence:

high forest percentage
+
no significant nearby industrial facility
+
thermal activity consistent with a temporary fire
Agricultural Burning

Possible evidence:

high cropland percentage
+
no significant nearby industrial facility
+
temporary/seasonal thermal activity
Other / Uncertain

Use when the available evidence is insufficient or contradictory.

These rules should only generate candidates. They should not be treated as perfect ground truth.

14. Manual Verification

A small labelling interface should be provided for reviewing candidate events.

Example:

------------------------------------------------
Thermal Event: FIRMS_0001837

FRP:                    82 MW
Brightness:             340 K
FIRMS Confidence:       90

Distance to refinery:   0.42 km
Distance to factory:    0.71 km

Industrial land:        82%
Forest:                  3%
Cropland:                5%

30-day detections:      18
Persistence:             0.60

Candidate Label:
Industrial Thermal Source

------------------------------------------------

[ Industrial ] [ Wildfire ]
[ Agricultural ] [ Other / Uncertain ]
------------------------------------------------

The selected class is stored as:

verified_label
15. Recommended Project Structure
thermal-label-generator/
│
├── README.md
│
├── data/
│   ├── raw/
│   │   ├── firms/
│   │   ├── osm/
│   │   └── worldcover/
│   │
│   ├── processed/
│   │   └── feature_dataset.csv
│   │
│   └── labelled/
│       └── labelled_training_data.csv
│
├── src/
│   ├── firms/
│   │   ├── download.py
│   │   └── parser.py
│   │
│   ├── osm/
│   │   └── spatial_features.py
│   │
│   ├── worldcover/
│   │   └── landcover_features.py
│   │
│   ├── temporal/
│   │   └── historical_features.py
│   │
│   ├── features/
│   │   └── feature_builder.py
│   │
│   ├── labeling/
│   │   ├── candidate_labels.py
│   │   └── verification.py
│   │
│   └── pipeline.py
│
├── config/
│   └── config.yaml
│
├── requirements.txt
│
└── .env
16. Processing Pipeline

The main pipeline should conceptually work like this:

1. Download FIRMS data
          ↓
2. Select thermal events
          ↓
3. For each event:
          ↓
4. Query OSM
          ↓
5. Obtain WorldCover information
          ↓
6. Query historical FIRMS
          ↓
7. Calculate all 34 features
          ↓
8. Generate candidate label
          ↓
9. Store candidate dataset
          ↓
10. Manually verify candidates
          ↓
11. Export verified dataset
17. Important Configuration

Keep thresholds and API settings in one configuration file rather than hardcoding them throughout the code.

Example:

spatial:
  search_radius_km: 5

temporal:
  short_window_days: 7
  medium_window_days: 30
  long_window_days: 90

labels:
  industrial:
    max_industrial_distance_km: 1
    min_industrial_pct: 60

  wildfire:
    min_forest_pct: 70

  agricultural:
    min_cropland_pct: 70

These values are initial prototype thresholds, not scientifically established universal thresholds. They should be tuned and documented during validation.

18. Environment Variables

API keys and credentials should not be hardcoded.

Use .env:

FIRMS_API_KEY=your_key

If an API does not require a key, no credential is necessary.

Never commit .env to GitHub.

Add:

.env

to .gitignore.

19. Output

The final output should be:

data/labelled/labelled_training_data.csv

Example:

event_id,brightness,frp,confidence,day_night,distance_to_industrial,...
FIRMS_0001,340,82,90,night,0.42,...
FIRMS_0002,331,45,87,day,15.2,...
FIRMS_0003,329,31,92,night,12.5,...

with:

verified_label

at the end.

20. Data Quality Requirements

Before using the dataset for XGBoost:

Check missing values
FRP              → present
brightness       → present
land cover       → present
spatial features → present
temporal features→ present
label            → present
Check duplicate events

The same FIRMS observation should not accidentally appear multiple times.

Check class balance

For example:

Industrial       1000
Wildfire         1000
Agricultural     1000
Other             500

Avoid having something like:

Industrial       5000
Wildfire          100
Agricultural       50

without addressing the imbalance.

Check label quality

Only verified labels should be used for the final training dataset.

21. Important Design Principle

The same feature-extraction logic must eventually be used in both:

Training

and:

Live Prediction

For example:

TRAINING

FIRMS + OSM + WorldCover + Historical FIRMS
                    ↓
              feature_builder
                    ↓
             training dataset
                    ↓
                 XGBoost

and later:

LIVE SYSTEM

New FIRMS hotspot
       ↓
OSM + WorldCover + Historical FIRMS
       ↓
same feature_builder
       ↓
34 features
       ↓
trained XGBoost

This ensures that the model sees features during prediction in the same format and meaning as the features it saw during training.

22. Scope of This Mini Project
Included
FIRMS data collection
OSM data collection
WorldCover processing
Historical FIRMS processing
Feature extraction
Candidate label generation
Manual label verification
CSV dataset generation
Not included
XGBoost model training
Model deployment
FastAPI prediction endpoint
React dashboard
GIS visualization application

Those will be handled by the main SIH project after the labelled dataset is ready.

Final Objective

The mini-project is successful when it produces:

                    RAW DATA
                       ↓
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
     FIRMS             OSM          WorldCover
       ↓               ↓                ↓
       └───────────────┼────────────────┘
                       ↓
               Historical FIRMS
                       ↓
               Feature Extraction
                       ↓
                 34 Features
                       ↓
              Candidate Labelling
                       ↓
               Manual Verification
                       ↓
        ┌─────────────────────────────┐
        │ labelled_training_data.csv │
        └─────────────────────────────┘
                       ↓
                 XGBoost Training
                 (MAIN PROJECT)

The key rule for this project is: candidate labels are generated automatically, but only manually/reliably verified labels become the ground truth for XGBoost.