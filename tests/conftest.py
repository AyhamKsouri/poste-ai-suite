"""
Shared pytest fixtures for the backend functional test suite (Phase 3 of the QA audit).

Runs against a fully isolated temp SQLite DB + temp upload dir, with GROQ_API_KEY
forced empty so tests are fast/deterministic and never touch the real Groq quota
or the dev instance's hand-built 9-document RAG corpus (see docs/audit/corpus-expansion.md).
AI-quality testing against the live key belongs in Phase 4, not here.
"""
import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

_TMP_DB_DIR = tempfile.mkdtemp(prefix="poste_qa_db_")
_TMP_UPLOAD_DIR = tempfile.mkdtemp(prefix="poste_qa_uploads_")

os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB_DIR}/test.db"
os.environ["UPLOAD_DIR"] = _TMP_UPLOAD_DIR
os.environ["GROQ_API_KEY"] = ""
os.environ["SECRET_KEY"] = "qa-audit-test-secret-not-for-prod"
os.environ["ADMIN_EMAIL"] = "admin@poste.tn"
os.environ["ADMIN_PASSWORD"] = "admin123"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "480"

import pytest
from fastapi.testclient import TestClient

from app.main import app  # noqa: E402
from app.config import settings  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(client):
    resp = client.post(
        "/auth/login",
        json={"email": settings.admin_email, "password": settings.admin_password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def agent_token(client, admin_headers):
    """A non-admin 'agent' user, registered once per session by the admin."""
    email = "agent.qa@poste.tn"
    password = "AgentPass123!"
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": "Agent QA", "role": "agent"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


@pytest.fixture(scope="session")
def agent_headers(agent_token):
    return {"Authorization": f"Bearer {agent_token}"}
