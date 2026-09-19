"""
Idempotent migration script to create the retinal_simulations table and indexes.
Safe to execute multiple times against PostgreSQL and SQLite databases.
"""
import sys
import os
import logging
from sqlalchemy import inspect, text, create_engine

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database.db import engine as default_engine
from database.models import RetinalSimulation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration_simulations")


def migrate_engine(target_engine, engine_name="Database"):
    inspector = inspect(target_engine)
    tables = inspector.get_table_names()
    logger.info(f"[{engine_name}] Existing tables: {tables}")

    with target_engine.begin() as conn:
        if "retinal_simulations" not in tables:
            logger.info(f"[{engine_name}] Creating 'retinal_simulations' table via ORM metadata...")
            RetinalSimulation.__table__.create(bind=conn, checkfirst=True)
            logger.info(f"[{engine_name}] [SUCCESS] 'retinal_simulations' table created.")
        else:
            logger.info(f"[{engine_name}] Table 'retinal_simulations' already exists.")

        # Ensure indexes exist
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_retinal_simulations_screening_id ON retinal_simulations(screening_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_retinal_simulations_patient_id ON retinal_simulations(patient_id);"))
        except Exception as e:
            logger.warning(f"[{engine_name}] Index creation notice: {e}")

    # Verify inspection
    inspector = inspect(target_engine)
    updated_tables = inspector.get_table_names()
    if "retinal_simulations" in updated_tables:
        cols = {col["name"] for col in inspector.get_columns("retinal_simulations")}
        logger.info(f"[{engine_name}] [SUCCESS] 'retinal_simulations' verified with {len(cols)} columns: {sorted(cols)}")
        return True
    else:
        logger.error(f"[{engine_name}] Failed to verify 'retinal_simulations' table.")
        return False


def migrate():
    success_count = 0

    # 1. Attempt primary configured database engine
    try:
        with default_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        if migrate_engine(default_engine, "Configured DATABASE_URL"):
            success_count += 1
    except Exception as exc:
        logger.warning(f"Primary DATABASE_URL unreachable ({exc}). Skipping primary migration.")

    # 2. Check and migrate local development SQLite database if present
    local_sqlite_path = os.path.join(backend_dir, "retinaai.db")
    if os.path.isfile(local_sqlite_path):
        sqlite_engine = create_engine(f"sqlite:///{local_sqlite_path}")
        logger.info(f"Migrating local development database: {local_sqlite_path}")
        if migrate_engine(sqlite_engine, "Local SQLite (retinaai.db)"):
            success_count += 1

    if success_count == 0:
        raise RuntimeError("No database targets could be migrated.")
    else:
        logger.info(f"[SUCCESS] Migration completed across {success_count} database target(s).")


if __name__ == "__main__":
    migrate()
