import os
import json
from typing import Dict, Tuple, Any

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    f1_score,
)

from sklearn.utils.class_weight import compute_sample_weight

from app.ml.features import prepare_features, EXCLUDE_COLS
from app.ml.labels import ALL_LABELS, LABEL_TO_INT, INT_TO_LABEL

TARGET_COL = "verified_label"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "saved_model.json")
TEST_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..",
                 "data", "labelled", "test_data.csv")
)

# CSV stores labels as floats (0.0, 1.0, 2.0, 3.0) — map to int
FLOAT_TO_INT = {float(i): i for i in range(len(ALL_LABELS))}


# =========================================================
# LOAD & VALIDATE
# =========================================================

def load_labelled_data(path: str) -> pd.DataFrame:
    """Load labelled CSV, normalize float labels to int, drop unlabelled rows."""
    df = pd.read_csv(path)

    if TARGET_COL not in df.columns:
        raise ValueError(f"Missing target column: '{TARGET_COL}'")

    # Drop rows with no label or non-numeric labels (e.g. 'uncertain')
    df[TARGET_COL] = pd.to_numeric(df[TARGET_COL], errors="coerce")
    df = df[df[TARGET_COL].notna()].copy()

    # Convert float labels to int
    df[TARGET_COL] = df[TARGET_COL].apply(
        lambda v: FLOAT_TO_INT.get(float(v), int(v))
    )

    valid = set(range(len(ALL_LABELS)))
    unknown = set(df[TARGET_COL].unique()) - valid
    if unknown:
        raise ValueError(f"Unknown label integers found: {unknown}")

    return df.reset_index(drop=True)


# =========================================================
# SPLIT
# =========================================================

def split_data(
    df: pd.DataFrame,
    test_data_path: str = TEST_DATA_PATH,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Use all 260 training rows for train, load held-out test_data.csv for test."""

    y_train_full = df[TARGET_COL].astype(int)
    X_train = prepare_features(df)
    y_train = y_train_full.loc[X_train.index]

    df_test = load_labelled_data(test_data_path)
    y_test_full = df_test[TARGET_COL].astype(int)
    X_test = prepare_features(df_test)
    y_test = y_test_full.loc[X_test.index]

    return X_train, X_test, y_train, y_test


# =========================================================
# TRAIN
# =========================================================

def train(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    params: Dict[str, Any] = None,
) -> xgb.XGBClassifier:

    default_params = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "objective": "multi:softprob",
        "num_class": len(ALL_LABELS),
        "eval_metric": "mlogloss",
        "random_state": 42,
        "n_jobs": -1,
    }

    if params:
        default_params.update(params)

    sample_weights = compute_sample_weight("balanced", y_train)

    model = xgb.XGBClassifier(**default_params)
    model.fit(X_train, y_train, sample_weight=sample_weights)
    return model


# =========================================================
# EVALUATE
# =========================================================

def evaluate(
    model: xgb.XGBClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> Dict[str, Any]:

    y_pred = model.predict(X_test)

    label_names = [INT_TO_LABEL[i] for i in sorted(INT_TO_LABEL)]

    report = classification_report(
        y_test, y_pred,
        target_names=label_names,
        output_dict=True,
    )

    return {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "f1_macro": round(f1_score(y_test, y_pred, average="macro"), 4),
        "f1_weighted": round(f1_score(y_test, y_pred, average="weighted"), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "classification_report": report,
    }


# =========================================================
# SAVE / LOAD
# =========================================================

def save_model(model: xgb.XGBClassifier, path: str = MODEL_PATH) -> None:
    model.save_model(path)
    print(f"Model saved to {path}")


def load_model(path: str = MODEL_PATH) -> xgb.XGBClassifier:
    if not os.path.exists(path):
        raise FileNotFoundError(f"No saved model at {path}")
    model = xgb.XGBClassifier()
    model.load_model(path)
    return model


# =========================================================
# PREDICT
# =========================================================

def predict(model: xgb.XGBClassifier, df: pd.DataFrame) -> pd.DataFrame:
    """Run inference on new data. Returns df with predicted_label column."""
    X = prepare_features(df)
    preds = model.predict(X)
    proba = model.predict_proba(X)

    result = df.copy()
    result["predicted_label"] = [INT_TO_LABEL[p] for p in preds]
    result["confidence_score"] = np.max(proba, axis=1).round(4)
    return result


# =========================================================
# FULL RUN
# =========================================================

def run_training(csv_path: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    """End-to-end: load → split → train → evaluate → save."""

    print("=" * 60)
    print("THERMOINTEL XGBoost Training")
    print("=" * 60)

    print("\nLoading data...")
    df = load_labelled_data(csv_path)
    label_counts = {INT_TO_LABEL[k]: v for k, v in df[TARGET_COL].value_counts().to_dict().items()}
    print(f"  Total labelled rows : {len(df)}")
    for label, count in label_counts.items():
        print(f"  {label:<35} {count}")

    print("\nSplitting data (80/20 — fixed held-out test set)...")
    X_train, X_test, y_train, y_test = split_data(df)
    print(f"  Train : {len(X_train)} rows (100% of labelled_training_data.csv)")
    print(f"  Test  : {len(X_test)} rows (held-out test_data.csv)")
    print(f"  Ratio : {len(X_train)/(len(X_train)+len(X_test))*100:.0f}/{len(X_test)/(len(X_train)+len(X_test))*100:.0f}")
    print(f"  Features : {X_train.shape[1]}")

    print("\nTraining XGBoost...")
    model = train(X_train, y_train, params)
    print("  Done.")

    print("\nEvaluating...")
    metrics = evaluate(model, X_test, y_test)
    print(f"  Accuracy         : {metrics['accuracy']}")
    print(f"  F1 (macro)       : {metrics['f1_macro']}")
    print(f"  F1 (weighted)    : {metrics['f1_weighted']}")
    print("\nConfusion Matrix:")
    for row in metrics["confusion_matrix"]:
        print(" ", row)
    print("\nPer-class report:")
    for label in ALL_LABELS:
        r = metrics["classification_report"].get(label, {})
        if r:
            print(f"  {label:<35} precision={r['precision']:.2f}  recall={r['recall']:.2f}  f1={r['f1-score']:.2f}  support={int(r['support'])}")

    save_model(model)
    print(f"\nModel saved to: {MODEL_PATH}")
    print("=" * 60)

    return {"model": model, "metrics": metrics}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train ThermoIntel XGBoost model")
    parser.add_argument(
        "--data",
        default=os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "..",
            "data", "labelled", "labelled_training_data.csv"
        ),
        help="Path to labelled CSV",
    )
    args = parser.parse_args()

    csv_path = os.path.abspath(args.data)
    print(f"Using data: {csv_path}")
    run_training(csv_path)
