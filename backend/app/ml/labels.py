# =========================================================
# TARGET LABELS
# =========================================================

INDUSTRIAL_THERMAL_SOURCE = "industrial_thermal_source"
WILDFIRE = "wildfire"
AGRICULTURAL_BURNING = "agricultural_burning"
OTHER = "other_uncertain"

ALL_LABELS = [
    INDUSTRIAL_THERMAL_SOURCE,   # 0
    WILDFIRE,                    # 1
    AGRICULTURAL_BURNING,        # 2
    OTHER,                       # 3
]

# Numeric encoding matching training data
LABEL_TO_INT = {label: idx for idx, label in enumerate(ALL_LABELS)}
INT_TO_LABEL = {idx: label for label, idx in LABEL_TO_INT.items()}
