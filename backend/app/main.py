import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import hash_password
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import User
from app.routers import auth, complaints, rag
from app.services import vectorstore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)

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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
