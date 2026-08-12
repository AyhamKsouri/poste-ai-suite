"""Closes coverage gaps identified in the first full test run: PDF/DOCX
extraction paths, category/urgency complaint filters, stats-after-reply,
the upload exception branch, feedback-filtered question list, and a
valid-signature-but-no-sub JWT."""
import io
from datetime import datetime, timedelta

import docx
import jwt
import pytest
from pypdf import PdfWriter


def _make_valid_pdf_bytes(text_hint: str = "Procedure QA PDF") -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _make_valid_docx_bytes(text: str) -> bytes:
    document = docx.Document()
    document.add_paragraph(text)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def test_upload_pdf_extraction_path(client, admin_headers):
    pdf_bytes = _make_valid_pdf_bytes()
    resp = client.post(
        "/rag/documents",
        files={"file": ("proc.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    # a blank-page PDF extracts to empty text but must not crash the pipeline
    assert resp.json()["status"] in ("ready", "failed")


def test_upload_docx_extraction_path(client, admin_headers):
    docx_bytes = _make_valid_docx_bytes("Procédure DOCX : ceci est un test d'extraction.")
    resp = client.post(
        "/rag/documents",
        files={
            "file": (
                "proc.docx",
                io.BytesIO(docx_bytes),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_upload_corrupted_pdf_triggers_exception_branch(client, admin_headers):
    """A file with a .pdf extension but garbage content should make pypdf.PdfReader
    raise inside extract_text(), exercising the except Exception branch at
    rag.py:72-73 (status -> 'failed', flagged in phase-2 for swallowing the error
    with no logging)."""
    resp = client.post(
        "/rag/documents",
        files={"file": ("corrupt.pdf", io.BytesIO(b"%PDF-1.4 this is not a real pdf structure @@@@"), "application/pdf")},
        headers=admin_headers,
    )
    assert resp.status_code == 200  # upload_document itself doesn't 500 - the except catches it
    assert resp.json()["status"] == "failed", "corrupted PDF should mark the document failed, not crash the request"


def test_list_complaints_category_and_urgency_filters(client, agent_headers):
    created = client.post("/complaints", json={"raw_text": "Colis perdu depuis 2 semaines, introuvable."}, headers=agent_headers)
    category = created.json()["category"]
    urgency = created.json()["urgency"]

    by_category = client.get("/complaints", params={"category": category}, headers=agent_headers)
    assert by_category.status_code == 200
    assert all(c["category"] == category for c in by_category.json())

    by_urgency = client.get("/complaints", params={"urgency": urgency}, headers=agent_headers)
    assert by_urgency.status_code == 200
    assert all(c["urgency"] == urgency for c in by_urgency.json())


def test_complaint_stats_avg_resolution_hours_after_reply(client, agent_headers):
    """Exercises the 'resolved' branch of complaint_stats (complaints.py:84-91) -
    needs at least one complaint with replied_at set before calling /complaints/stats."""
    created = client.post("/complaints", json={"raw_text": "Test pour delai de resolution moyen."}, headers=agent_headers)
    cid = created.json()["id"]
    client.patch(f"/complaints/{cid}/reply", json={"final_reply": "Resolu."}, headers=agent_headers)

    resp = client.get("/complaints/stats", headers=agent_headers)
    assert resp.status_code == 200
    assert resp.json()["avg_resolution_hours"] is not None


def test_list_questions_with_feedback_filter(client, admin_headers, agent_headers):
    ask = client.post("/rag/ask", json={"question": "question pour test de filtre feedback"}, headers=agent_headers)
    qid = ask.json()["question_id"]
    client.post(f"/rag/questions/{qid}/feedback", json={"feedback": "not_helpful"}, headers=agent_headers)

    resp = client.get("/rag/questions", params={"feedback": "not_helpful"}, headers=admin_headers)
    assert resp.status_code == 200
    assert all(q["feedback"] == "not_helpful" for q in resp.json())
    assert any(q["id"] == qid for q in resp.json())


def test_submit_complaint_billing_category_mock_path(client, agent_headers):
    """Exercises the 'billing' branch of _mock_classify (ai_client.py:89-90),
    unreached by the other complaint tests' wording."""
    resp = client.post(
        "/complaints",
        json={"raw_text": "Le montant facturé sur ma facture est incorrect, paiement en trop."},
        headers=agent_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["category"] == "billing"


def test_ask_thanks_and_greeting_mock_replies(client, agent_headers):
    """Exercises _mock_answer's THANKS_PATTERN and OPENING_GREETING_PATTERN
    branches (ai_client.py:150-153), only reachable when retrieval returns zero
    chunks - use a fresh isolated question with no matching corpus content."""
    thanks = client.post("/rag/ask", json={"question": "merci beaucoup"}, headers=agent_headers)
    assert thanks.status_code == 200

    greeting = client.post("/rag/ask", json={"question": "Bonjour"}, headers=agent_headers)
    assert greeting.status_code == 200


def test_me_valid_token_missing_sub_claim(client):
    """Token signed with the real secret, valid exp, but no 'sub' claim at all -
    exercises auth.py:43 (if user_id is None: raise credentials_exception)."""
    from app.config import settings

    payload = {"exp": datetime.utcnow() + timedelta(minutes=5)}  # no "sub"
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
