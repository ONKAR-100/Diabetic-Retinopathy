"""
Idempotent migration script to add nullable biomarker columns to the screenings table.
Safe to execute multiple times.
"""
import sys
import os
import logging

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import text, inspect
from database.db import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

COLUMNS = [
    ("left_biomarkers", "JSON"),
    ("left_avr", "DOUBLE PRECISION"),
    ("left_tortuosity", "DOUBLE PRECISION"),
    ("left_fractal_dim", "DOUBLE PRECISION"),
    ("right_biomarkers", "JSON"),
    ("right_avr", "DOUBLE PRECISION"),
    ("right_tortuosity", "DOUBLE PRECISION"),
    ("right_fractal_dim", "DOUBLE PRECISION"),
]

def migrate():
    inspector = inspect(engine)
    existing_cols = {col["name"] for col in inspector.get_columns("screenings")}
    logger.info(f"Existing columns in 'screenings': {len(existing_cols)}")

    with engine.begin() as conn:
        for col_name, col_type in COLUMNS:
            if col_name not in existing_cols:
                logger.info(f"Adding column '{col_name}' ({col_type})...")
                conn.execute(text(f"ALTER TABLE screenings ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            else:
                logger.info(f"Column '{col_name}' already exists.")

    # Re-inspect to verify
    inspector = inspect(engine)
    updated_cols = {col["name"] for col in inspector.get_columns("screenings")}
    all_present = all(col_name in updated_cols for col_name, _ in COLUMNS)
    if all_present:
        logger.info("[SUCCESS] All 8 biomarker columns are present in PostgreSQL 'screenings' table.")
    else:
        missing = [col_name for col_name, _ in COLUMNS if col_name not in updated_cols]
        raise RuntimeError(f"Failed to add columns: {missing}")

if __name__ == "__main__":
    migrate()
