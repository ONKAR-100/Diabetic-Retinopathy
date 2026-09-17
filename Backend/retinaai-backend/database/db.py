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

# Verify connection at startup
try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    logger.info("Connected to Supabase PostgreSQL successfully.")
except Exception as exc:
    logger.warning(
        f"Could not connect to database at {settings.DATABASE_URL}: {exc}. "
        "Ensure DATABASE_URL in .env is configured when running live database operations."
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
