import logging
from sqlalchemy import create_engine, text
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
    pool_size=5,                # Conservative pool for Supabase free tier
    max_overflow=10,
    pool_recycle=300,           # Recycle connections every 5 minutes
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

def init_db(strict: bool = False) -> None:
    """Initialize database tables during FastAPI startup lifespan."""
    is_prod = settings.ENVIRONMENT in ("production", "prod")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Connected to database successfully.")
        Base.metadata.create_all(bind=engine)
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
