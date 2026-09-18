"""
Idempotent migration script to add nullable biomarker comparison columns to the longitudinal_comparisons table.
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
    ("left_avr_prev", "DOUBLE PRECISION"),
    ("left_avr_curr", "DOUBLE PRECISION"),
    ("right_avr_prev", "DOUBLE PRECISION"),
    ("right_avr_curr", "DOUBLE PRECISION"),
    ("left_tortuosity_prev", "DOUBLE PRECISION"),
    ("left_tortuosity_curr", "DOUBLE PRECISION"),
    ("right_tortuosity_prev", "DOUBLE PRECISION"),
    ("right_tortuosity_curr", "DOUBLE PRECISION"),
    ("left_fractal_dim_prev", "DOUBLE PRECISION"),
    ("left_fractal_dim_curr", "DOUBLE PRECISION"),
    ("right_fractal_dim_prev", "DOUBLE PRECISION"),
    ("right_fractal_dim_curr", "DOUBLE PRECISION"),
]

def migrate():
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "longitudinal_comparisons" not in table_names:
        logger.warning("Table 'longitudinal_comparisons' does not exist yet. Migration skipped.")
        return

    existing_cols = {col["name"] for col in inspector.get_columns("longitudinal_comparisons")}
    logger.info(f"Existing columns in 'longitudinal_comparisons': {len(existing_cols)}")

    with engine.begin() as conn:
        for col_name, col_type in COLUMNS:
            if col_name not in existing_cols:
                logger.info(f"Adding column '{col_name}' ({col_type})...")
                conn.execute(text(f"ALTER TABLE longitudinal_comparisons ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            else:
                logger.info(f"Column '{col_name}' already exists.")

    # Re-inspect to verify
    inspector = inspect(engine)
    updated_cols = {col["name"] for col in inspector.get_columns("longitudinal_comparisons")}
    all_present = all(col_name in updated_cols for col_name, _ in COLUMNS)
    if all_present:
        logger.info("[SUCCESS] All 12 biomarker comparison columns are present in PostgreSQL 'longitudinal_comparisons' table.")
    else:
        missing = [col_name for col_name, _ in COLUMNS if col_name not in updated_cols]
        raise RuntimeError(f"Failed to add columns: {missing}")

if __name__ == "__main__":
    migrate()
