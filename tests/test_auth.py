"""POST /auth/register, POST /auth/login, GET /auth/me"""
import jwt
import pytest
from datetime import datetime, timedelta


# ---- POST /auth/login ----

def test_login_happy_path(client):
    resp = client.post("/auth/login", json={"email": "admin@poste.tn", "password": "admin123"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body and body["token_type"] == "bearer"


def test_login_wrong_password(client):
    resp = client.post("/auth/login", json={"email": "admin@poste.tn", "password": "wrong"})
    assert resp.status_code == 401


def test_login_nonexistent_email(client):
    resp = client.post("/auth/login", json={"email": "nobody@poste.tn", "password": "x"})
    assert resp.status_code == 401


def test_login_missing_password_field(client):
    resp = client.post("/auth/login", json={"email": "admin@poste.tn"})
    assert resp.status_code == 422  # Pydantic validation error


def test_login_empty_body(client):
    resp = client.post("/auth/login", json={})
    assert resp.status_code == 422


def test_login_null_fields(client):
    resp = client.post("/auth/login", json={"email": None, "password": None})
    assert resp.status_code == 422


def test_login_wrong_types(client):
    resp = client.post("/auth/login", json={"email": 12345, "password": ["a", "list"]})
    assert resp.status_code == 422


def test_login_sql_injection_in_email(client):
    """Classic SQLi payload in the email field. ORM uses parameterized queries
    (SQLAlchemy .filter(User.email == payload.email)), so this should just be
    treated as a literal (nonexistent) email string, never bypass auth."""
    payload = {"email": "' OR '1'='1", "password": "x"}
    resp = client.post("/auth/login", json=payload)
    assert resp.status_code == 401, "SQL injection payload must not bypass authentication"


def test_login_sql_injection_classic_bypass_attempt(client):
    payload = {"email": "admin@poste.tn' --", "password": "anything"}
    resp = client.post("/auth/login", json=payload)
    assert resp.status_code == 401


def test_login_empty_string_credentials(client):
    resp = client.post("/auth/login", json={"email": "", "password": ""})
    assert resp.status_code == 401  # not 422 - schema allows empty str, so it's a normal auth failure


# ---- POST /auth/register ----

def test_register_requires_admin_unauthenticated(client):
    resp = client.post(
        "/auth/register",
        json={"email": "new1@poste.tn", "password": "x", "full_name": "New"},
    )
    assert resp.status_code == 401


def test_register_forbidden_for_non_admin(client, agent_headers):
    resp = client.post(
        "/auth/register",
        json={"email": "new2@poste.tn", "password": "x", "full_name": "New"},
        headers=agent_headers,
    )
    assert resp.status_code == 403


def test_register_happy_path_as_admin(client, admin_headers):
    resp = client.post(
        "/auth/register",
        json={"email": "newagent@poste.tn", "password": "Pass123!", "full_name": "Nouvel Agent", "role": "agent"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "newagent@poste.tn"
    assert body["role"] == "agent"
    assert "password" not in body and "password_hash" not in body


def test_register_duplicate_email(client, admin_headers):
    payload = {"email": "dupe@poste.tn", "password": "x", "full_name": "Dupe"}
    first = client.post("/auth/register", json=payload, headers=admin_headers)
    assert first.status_code == 200
    second = client.post("/auth/register", json=payload, headers=admin_headers)
    assert second.status_code == 400


def test_register_missing_required_fields(client, admin_headers):
    resp = client.post("/auth/register", json={"email": "incomplete@poste.tn"}, headers=admin_headers)
    assert resp.status_code == 422


def test_register_unicode_full_name(client, admin_headers):
    """Arabic + French-accented name, should be stored/returned verbatim."""
    resp = client.post(
        "/auth/register",
        json={
            "email": "unicode.agent@poste.tn",
            "password": "Pass123!",
            "full_name": "محمد الأمين بن صالح — Amine Bensalah",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "محمد الأمين بن صالح — Amine Bensalah"


def test_register_empty_password(client, admin_headers):
    """No min-length validation on password in schemas.py - empty string is accepted.
    This is itself a finding (see phase-2), asserting the observed (weak) behavior."""
    resp = client.post(
        "/auth/register",
        json={"email": "emptypass@poste.tn", "password": "", "full_name": "Empty Pass"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, "confirms: no server-side minimum password length is enforced"


# ---- GET /auth/me ----

def test_me_no_token(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_malformed_token(client):
    resp = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert resp.status_code == 401


def test_me_wrong_scheme(client):
    resp = client.get("/auth/me", headers={"Authorization": "Basic YWRtaW46YWRtaW4="})
    assert resp.status_code == 401


def test_me_expired_token(client):
    """Craft a token with the same secret/algorithm but an exp in the past."""
    from app.config import settings
    expired_payload = {"sub": "some-user-id", "exp": datetime.utcnow() - timedelta(minutes=5)}
    token = jwt.encode(expired_payload, settings.secret_key, algorithm="HS256")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_me_token_for_nonexistent_user(client):
    """Valid signature, valid exp, but 'sub' doesn't match any real user id."""
    from app.config import settings
    payload = {"sub": "00000000-0000-0000-0000-000000000000", "exp": datetime.utcnow() + timedelta(minutes=5)}
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_me_token_signed_with_wrong_secret(client):
    """Forged token signed with an attacker-guessed secret - must be rejected."""
    payload = {"sub": "whatever", "exp": datetime.utcnow() + timedelta(minutes=5)}
    forged = jwt.encode(payload, "wrong-secret-guess", algorithm="HS256")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


def test_me_alg_none_attack(client):
    """Classic JWT 'alg: none' forgery attempt - must be rejected. Built manually
    (base64url header.payload.<empty signature>) so this doesn't depend on PyJWT's
    client-side willingness to produce an 'alg: none' token - we're testing the
    server's decode-side rejection, not the encoder."""
    import base64
    import json as jsonlib

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header = b64url(jsonlib.dumps({"alg": "none", "typ": "JWT"}).encode())
    payload = b64url(
        jsonlib.dumps(
            {"sub": "attacker", "exp": int((datetime.utcnow() + timedelta(minutes=5)).timestamp())}
        ).encode()
    )
    forged = f"{header}.{payload}."
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401
