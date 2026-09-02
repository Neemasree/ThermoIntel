"""
ThermoIntel XGBoost Training Script
Run from the backend folder:
    python train.py
    python train.py --data ../data/labelled/labelled_training_data.csv
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.ml.pipeline import run_training

DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "labelled", "labelled_training_data.csv")
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DATA_PATH, help="Path to labelled CSV")
    args = parser.parse_args()

    run_training(args.data)
