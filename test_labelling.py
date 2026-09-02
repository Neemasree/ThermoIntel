import sys, pandas as pd, yaml
sys.path.insert(0, ".")
from src.labeling.candidate_labels import generate_candidate_labels

with open("config/config.yaml") as f:
    cfg = yaml.safe_load(f)

LABEL = {0: "Industrial", 1: "Wildfire", 2: "Agricultural", 3: "Other"}

rows = [
    # Industrial weak: near_industrial=1 but persistence=0.07 < strict 0.5 -> uncertain
    dict(event_id="IND_WEAK",     distance_to_industrial=2.9,  near_industrial_facility=1,
         forest_pct=4.0,  cropland_pct=76.0, builtup_pct=2.0,
         persistence_score=0.07, detections_30d=2,  frp_ratio=2.53, data_quality_flags="ok"),
    # Industrial strong: all strict conditions met -> proxy_verified
    dict(event_id="IND_STRONG",   distance_to_industrial=0.4,  near_industrial_facility=1,
         forest_pct=2.0,  cropland_pct=5.0,  builtup_pct=80.0,
         persistence_score=0.70, detections_30d=18, frp_ratio=1.2,  data_quality_flags="ok"),
    # Wildfire weak: frp_ratio=1.47 < strict 1.5 -> uncertain
    dict(event_id="WILD_WEAK",    distance_to_industrial=5.0,  near_industrial_facility=0,
         forest_pct=99.0, cropland_pct=0.0,  builtup_pct=0.0,
         persistence_score=0.07, detections_30d=2,  frp_ratio=1.47, data_quality_flags="ok"),
    # Wildfire strong: forest=85%, frp_ratio=2.1 -> proxy_verified
    dict(event_id="WILD_STRONG",  distance_to_industrial=5.0,  near_industrial_facility=0,
         forest_pct=85.0, cropland_pct=2.0,  builtup_pct=0.0,
         persistence_score=0.03, detections_30d=1,  frp_ratio=2.1,  data_quality_flags="ok"),
    # Agricultural: cropland=76%, persistence=0.1 < max 0.2 -> proxy_verified
    dict(event_id="AGRI_STRONG",  distance_to_industrial=5.0,  near_industrial_facility=0,
         forest_pct=3.0,  cropland_pct=76.0, builtup_pct=5.0,
         persistence_score=0.10, detections_30d=3,  frp_ratio=1.1,  data_quality_flags="ok"),
    # Agricultural: persistence=0.4 > max 0.2 -> uncertain
    dict(event_id="AGRI_PERSIST", distance_to_industrial=5.0,  near_industrial_facility=0,
         forest_pct=3.0,  cropland_pct=65.0, builtup_pct=5.0,
         persistence_score=0.40, detections_30d=12, frp_ratio=1.0,  data_quality_flags="ok"),
    # Data invalid: null required feature -> data_invalid
    dict(event_id="DATA_INVALID", distance_to_industrial=None, near_industrial_facility=None,
         forest_pct=50.0, cropland_pct=10.0, builtup_pct=5.0,
         persistence_score=None, detections_30d=2, frp_ratio=1.0,  data_quality_flags="ok"),
]

df = pd.DataFrame(rows)
result = generate_candidate_labels(df, cfg)

print()
print(f"{'event_id':<22} {'candidate':<14} {'verified':<14} {'status'}")
print("-" * 72)
for _, r in result.iterrows():
    c = LABEL.get(r["candidate_label"], "None")
    v = LABEL.get(r["verified_label"],  "None")
    print(f"{r['event_id']:<22} {c:<14} {v:<14} {r['verification_status']}")
