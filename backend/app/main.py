import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect

from app.auth import hash_password
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import User
from app.routers import auth, complaints, rag
from app.services import vectorstore

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _stamp_fresh_db_to_head(was_empty_before_create_all: bool) -> bool:
    """`create_all()` builds a brand-new DB's schema directly from the current
    models - correct, but Alembic doesn't know that DB is up to date unless
    it's told. For a DB that had no tables at all before `create_all()` ran,
    it's safe to stamp it to "head" (record-only, no migrations replay).
    Returns True if a warning about a stale schema should be logged instead:
    tables already existed before `create_all()` (from before Alembic was
    introduced here) but were never actually migrated - stamping that DB
    would be a lie, since its schema may not match `head` at all (e.g. still
    has the old single `category` column instead of `categories`)."""
    if inspect(engine).has_table("alembic_version"):
        return False
    if was_empty_before_create_all:
        alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
        command.stamp(alembic_cfg, "head")
        return False
    return True  # pre-existing, pre-Alembic DB - caller should warn


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    was_empty = not inspect(engine).get_table_names()
    Base.metadata.create_all(bind=engine)
    if _stamp_fresh_db_to_head(was_empty):
        logger.warning(
            "This database predates Alembic migrations and hasn't been stamped/migrated - "
            "its schema may be stale. Run `alembic upgrade head` from backend/ once to bring "
            "it in line with the current models (see ARCHITECTURE.md)."
        )

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == settings.admin_email).first():
            admin = User(
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                full_name="Admin",
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info(
                "Seeded default admin account: %s / %s",
                settings.admin_email,
                settings.admin_password,
            )
        vectorstore.rebuild_index(db)
    finally:
        db.close()

    if not settings.ai_enabled:
        logger.warning(
            "GROQ_API_KEY is not set - RAG answers and complaint triage are running on "
            "mock responses. Add a key to backend/.env to enable real Groq API calls."
        )

    yield


app = FastAPI(title="La Poste Tunisienne - AI Suite", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rag.router)
app.include_router(complaints.router)


@app.get("/")
def root():
    return {"status": "ok", "ai_enabled": settings.ai_enabled}
