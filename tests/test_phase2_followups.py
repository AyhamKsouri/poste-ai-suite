"""Directly resolves the two 'plausible, not yet confirmed' risks flagged by
mypy in docs/audit/phase-2-static-analysis.md, using white-box mocking/raw
requests rather than needing a live Groq key (that's Phase 4's job)."""
from unittest.mock import MagicMock

import pytest

from app.services import ai_client


def test_answer_question_none_content_from_groq_bypasses_mock_fallback():
    """Reproduces the exact scenario mypy flagged at ai_client.py:196: a Groq
    response whose message.content is None but finish_reason is NOT
    'content_filter' (e.g. 'stop' with an empty completion). The code only
    special-cases content_filter before returning choice.message.content
    directly - a None here is returned as-is, not caught by the except block,
    since returning None doesn't raise."""
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

    # CONFIRMED: the function returns None instead of falling back to the mock,
    # exactly as the mypy return-type mismatch predicted.
    assert result is None, (
        "CONFIRMED BUG: answer_question() returns None (not a str, not the mock "
        "fallback) when Groq returns content=None under a non-content_filter "
        "finish_reason. Declared return type is `-> str`."
    )


def test_ask_endpoint_500s_when_groq_returns_none_content(client, agent_headers):
    """Proves the end-to-end consequence: does POST /rag/ask actually break when
    answer_question() returns None, given AskResponse.answer is a non-optional
    str in schemas.py? Result: it raises pydantic_core.ValidationError from
    inside rag.py:137 (AskResponse(answer=None, ...)) - TestClient re-raises
    server-side exceptions by default (for debuggability) rather than converting
    them to an HTTP response, but the same exception reaching a real uvicorn
    server (no such re-raise) surfaces to the client as an HTTP 500 - so this
    IS the production-equivalent confirmation of a real 500, not a milder outcome."""
    from pydantic_core import ValidationError

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
        with pytest.raises(ValidationError, match="answer"):
            client.post("/rag/ask", json={"question": "trigger the none-content bug"}, headers=agent_headers)
    finally:
        ai_client._client = original_client
    print(
        "\n[CONFIRMED BUG] POST /rag/ask raises an unhandled pydantic ValidationError "
        "(AskResponse.answer=None) when Groq returns content=None under a non-"
        "content_filter finish_reason - equivalent to an HTTP 500 in production, "
        "violating the app's own 'never 500s on AI hiccup' design goal."
    )


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
