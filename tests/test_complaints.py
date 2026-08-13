"""POST/GET /complaints, /complaints/stats, /complaints/{id}, reply, status"""
import pytest


TUNISIAN_COMPLAINT = {
    "customer_name": "Mohamed Ben Ali",
    "customer_contact": "+216 22 345 678",
    "raw_text": (
        "Bonjour, j'ai envoyé un colis depuis le bureau de poste de Sfax il y a 10 jours "
        "et il n'est toujours pas arrivé à Tunis. Le numéro de suivi est TN123456789. "
        "C'est très urgent, merci de vérifier rapidement."
    ),
}


def test_submit_complaint_requires_auth(client):
    resp = client.post("/complaints", json=TUNISIAN_COMPLAINT)
    assert resp.status_code == 401


def test_submit_complaint_happy_path(client, agent_headers):
    resp = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "reviewed"  # set after AI triage in complaints.py:39
    assert body["category"] in ("delivery_delay", "lost_package", "billing", "damaged_item", "other")
    assert body["urgency"] in ("low", "medium", "high")
    assert body["draft_reply"]


def test_submit_complaint_missing_raw_text(client, agent_headers):
    resp = client.post(
        "/complaints",
        json={"customer_name": "Test", "customer_contact": "x"},
        headers=agent_headers,
    )
    assert resp.status_code == 422


def test_submit_complaint_empty_raw_text(client, agent_headers):
    resp = client.post("/complaints", json={"raw_text": ""}, headers=agent_headers)
    assert resp.status_code == 200  # no min_length constraint - documents actual behavior


def test_submit_complaint_only_required_field(client, agent_headers):
    resp = client.post("/complaints", json={"raw_text": "Colis perdu."}, headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json()["customer_name"] is None


def test_submit_complaint_10k_chars(client, agent_headers):
    huge_text = "Le colis est perdu depuis longtemps et je suis très mécontent. " * 160  # ~10.4k chars
    assert len(huge_text) > 10000
    resp = client.post("/complaints", json={"raw_text": huge_text}, headers=agent_headers)
    assert resp.status_code == 200, "10k-char complaint should be accepted, not rejected or 500"


def test_submit_complaint_arabic_and_dialect(client, agent_headers):
    resp = client.post(
        "/complaints",
        json={
            "raw_text": "السلام عليكم، الكوليس متاعي مازال ما وصلش. ken chkoun najem yaidini? Merci بارك الله فيكم",
            "customer_name": "سامي التونسي",
        },
        headers=agent_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["raw_text"] == (
        "السلام عليكم، الكوليس متاعي مازال ما وصلش. ken chkoun najem yaidini? Merci بارك الله فيكم"
    )


def test_submit_complaint_emoji(client, agent_headers):
    resp = client.post(
        "/complaints",
        json={"raw_text": "Colis endommagé 😡📦💔 très déçu du service !!!"},
        headers=agent_headers,
    )
    assert resp.status_code == 200


def test_submit_complaint_gibberish(client, agent_headers):
    resp = client.post("/complaints", json={"raw_text": "asdkj alksjd 12903 !@#$%^ xxxxxxx zzz"}, headers=agent_headers)
    assert resp.status_code == 200
    # mock classifier should still produce a category/urgency, never null/crash
    body = resp.json()
    assert body["category"] is not None
    assert body["urgency"] is not None


def test_submit_complaint_sql_injection(client, agent_headers):
    resp = client.post(
        "/complaints",
        json={"raw_text": "'; DROP TABLE complaints; --", "customer_name": "1' OR '1'='1"},
        headers=agent_headers,
    )
    assert resp.status_code == 200
    followup = client.get("/complaints", headers=agent_headers)
    assert followup.status_code == 200, "complaints table must be unaffected by injection-shaped input"


def test_list_complaints_requires_auth(client):
    resp = client.get("/complaints")
    assert resp.status_code == 401


def test_list_complaints_any_authenticated_user_sees_all(client, agent_headers, admin_headers):
    """Phase 0 finding: no ownership scoping on GET /complaints - any authenticated
    agent can see every complaint, not just their own."""
    admin_created = client.post("/complaints", json={"raw_text": "Created by admin for cross-user visibility test"}, headers=admin_headers)
    admin_complaint_id = admin_created.json()["id"]

    agent_list = client.get("/complaints", headers=agent_headers)
    assert agent_list.status_code == 200
    ids = [c["id"] for c in agent_list.json()]
    assert admin_complaint_id in ids, "confirms: agents can see complaints created/assigned to other users"


def test_list_complaints_with_filters(client, agent_headers):
    resp = client.get("/complaints", params={"status": "reviewed"}, headers=agent_headers)
    assert resp.status_code == 200
    for c in resp.json():
        assert c["status"] == "reviewed"


def test_list_complaints_invalid_filter_value(client, agent_headers):
    """No enum validation on the query param - should just return empty list, not error."""
    resp = client.get("/complaints", params={"status": "not-a-real-status"}, headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_complaint_stats_requires_auth(client):
    resp = client.get("/complaints/stats")
    assert resp.status_code == 401


def test_complaint_stats_any_authenticated_user(client, agent_headers):
    resp = client.get("/complaints/stats", headers=agent_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body and "by_category" in body and "by_urgency" in body


def test_get_complaint_happy_path(client, agent_headers):
    created = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    cid = created.json()["id"]
    resp = client.get(f"/complaints/{cid}", headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cid


def test_get_complaint_nonexistent(client, agent_headers):
    resp = client.get("/complaints/00000000-0000-0000-0000-000000000000", headers=agent_headers)
    assert resp.status_code == 404


def test_reply_happy_path(client, agent_headers):
    created = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    cid = created.json()["id"]
    resp = client.patch(f"/complaints/{cid}/reply", json={"final_reply": "Votre colis a été retrouvé."}, headers=agent_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "replied"
    assert body["final_reply"] == "Votre colis a été retrouvé."
    assert body["replied_at"] is not None


def test_reply_missing_field(client, agent_headers):
    created = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    cid = created.json()["id"]
    resp = client.patch(f"/complaints/{cid}/reply", json={}, headers=agent_headers)
    assert resp.status_code == 422


def test_reply_nonexistent_complaint(client, agent_headers):
    resp = client.patch(
        "/complaints/00000000-0000-0000-0000-000000000000/reply",
        json={"final_reply": "x"},
        headers=agent_headers,
    )
    assert resp.status_code == 404


def test_update_status_happy_path(client, agent_headers):
    created = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    cid = created.json()["id"]
    resp = client.patch(f"/complaints/{cid}/status", json={"status": "new"}, headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "new"


def test_update_status_invalid_value(client, agent_headers):
    created = client.post("/complaints", json=TUNISIAN_COMPLAINT, headers=agent_headers)
    cid = created.json()["id"]
    resp = client.patch(f"/complaints/{cid}/status", json={"status": "not-a-real-status"}, headers=agent_headers)
    assert resp.status_code == 400


def test_update_status_nonexistent_complaint(client, agent_headers):
    resp = client.patch(
        "/complaints/00000000-0000-0000-0000-000000000000/status",
        json={"status": "new"},
        headers=agent_headers,
    )
    assert resp.status_code == 404
