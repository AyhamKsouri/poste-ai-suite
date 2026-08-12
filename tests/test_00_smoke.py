def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "ai_enabled": False}


def test_admin_login_works(admin_headers, client):
    resp = client.get("/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


def test_agent_is_not_admin(agent_headers, client):
    resp = client.get("/auth/me", headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "agent"
