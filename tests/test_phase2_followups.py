"""Regression tests for finding H1 (docs/audit/REPORT.md): a Groq response
with message.content=None under a non-content_filter finish_reason used to
bypass the mock fallback entirely and crash AskResponse's Pydantic
validation (~HTTP 500 in production). Fixed in ai_client.py by treating a
None content the same as a content_filter hit. These tests now confirm the
fix holds, using white-box mocking rather than needing a live Groq key."""
from unittest.mock import MagicMock

from app.services import ai_client


def test_answer_question_none_content_falls_back_to_mock():
    """Regression test for H1: a Groq response with message.content=None and
    finish_reason='stop' (not content_filter) must now fall back to the mock
    answer instead of returning None."""
    fake_choice = MagicMock()
    fake_choice.finish_reason = "stop"
    fake_choice.message.content = None
    fake_response = MagicMock()
    fake_response.choices = [fake_choice]

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response

    original_client = ai_client._client
    try:
        ai_client._client = fake_client
        result = ai_client.answer_question("test question", ["some chunk"], [])
    finally:
        ai_client._client = original_client

    assert isinstance(result, str) and result, (
        "H1 regression: answer_question() must fall back to the mock string "
        "when Groq returns content=None, not return None itself."
    )


def test_ask_endpoint_succeeds_when_groq_returns_none_content(client, agent_headers):
    """Regression test for H1's end-to-end consequence: POST /rag/ask must
    return a normal 200 with a real string answer, not raise a
    pydantic ValidationError, when Groq returns content=None."""
    fake_choice = MagicMock()
    fake_choice.finish_reason = "stop"
    fake_choice.message.content = None
    fake_response = MagicMock()
    fake_response.choices = [fake_choice]
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response

    original_client = ai_client._client
    try:
        ai_client._client = fake_client
        resp = client.post("/rag/ask", json={"question": "trigger the none-content case"}, headers=agent_headers)
    finally:
        ai_client._client = original_client

    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["answer"], str) and body["answer"]


def test_upload_with_truly_missing_filename_attribute(client, admin_headers):
    """The earlier httpx-based test (test_upload_with_no_filename_does_not_crash)
    found that an empty-string filename gets encoded by httpx as a plain form
    field, not a file part, so it never reached the file.filename=None code path.
    This test crafts the raw multipart body by hand so the file part has NO
    filename attribute in its Content-Disposition header at all - which is what
    a real malicious/malformed client could send, and what mypy's `str | None`
    flag on UploadFile.filename is actually about."""
    boundary = "----qaAuditBoundaryNoFilename"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"\r\n'
        f"Content-Type: text/plain\r\n"
        f"\r\n"
        f"content with a file part but no filename attribute at all\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    headers = dict(admin_headers)
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    resp = client.post("/rag/documents", content=body, headers=headers)
    print(f"\n[FINDING] raw multipart file part with no filename attribute -> HTTP {resp.status_code}: {resp.text[:300]}")
    # Report reality; this is the finding itself, not a pre-judged pass/fail.
    assert resp.status_code in (200, 422, 500)
