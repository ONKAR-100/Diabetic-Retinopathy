import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

# Connect directly to Supabase PostgreSQL — no SQLite fallback
_connect_args = {}
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,         # Detect and recycle stale connections
    pool_size=10,               # Robust pool for concurrent web UI requests
    max_overflow=20,
    pool_recycle=180,           # Recycle connections every 3 minutes
    pool_timeout=20,            # Bounded pool checkout timeout
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def verify_db_connection() -> bool:
    """Verify connectivity to PostgreSQL database."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Connected to database successfully.")
        return True
    except Exception as exc:
        logger.error(f"Could not connect to database at {settings.DATABASE_URL}: {exc}")
        return False

def sync_schema_columns(target_engine) -> None:
    """Idempotently add any missing ORM columns to existing tables."""
    try:
        inspector = inspect(target_engine)
        existing_tables = set(inspector.get_table_names())
        with target_engine.begin() as conn:
            for table_name, table in Base.metadata.tables.items():
                if table_name not in existing_tables:
                    continue
                existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(target_engine.dialect)
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col.name} {col_type};"))
                        logger.info(f"Auto-synced missing column: {table_name}.{col.name} ({col_type})")
    except Exception as exc:
        logger.warning(f"Schema column sync notice: {exc}")

def init_db(strict: bool = False) -> None:
    """Initialize database tables and synchronize columns during FastAPI startup lifespan."""
    is_prod = settings.ENVIRONMENT in ("production", "prod")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Connected to database successfully.")
        Base.metadata.create_all(bind=engine)
        sync_schema_columns(engine)
    except Exception as exc:
        if strict or is_prod:
            raise RuntimeError(f"Database initialization failed during startup: {exc}") from exc
        logger.warning(
            f"Database initialization skipped or failed in {settings.ENVIRONMENT} mode: {exc}. "
            "Ensure DATABASE_URL is configured for live database operations."
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
