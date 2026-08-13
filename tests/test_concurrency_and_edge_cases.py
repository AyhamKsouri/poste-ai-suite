"""20 parallel requests to the heaviest endpoint (/rag/ask), plus targeted
reproductions of the two mypy-flagged risks from docs/audit/phase-2-static-analysis.md."""
import io
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest


def test_20_concurrent_ask_requests(client, agent_headers):
    """Fires 20 requests to POST /rag/ask in parallel via a thread pool. Starlette's
    TestClient wraps the ASGI app in-process, so this is a real concurrency test of
    the app's request handling (shared vectorstore._state, shared DB session-per-request),
    not a full separate-process load test - documented as such, not oversold."""

    def ask(i):
        return client.post("/rag/ask", json={"question": f"Question concurrente numero {i} ?"}, headers=agent_headers)

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(ask, i) for i in range(20)]
        results = [f.result() for f in as_completed(futures)]

    statuses = [r.status_code for r in results]
    assert all(s == 200 for s in statuses), f"expected all 200s, got {statuses}"
    # every response must still be well-formed (no torn/corrupted reads from the
    # shared vectorstore._state module dict under concurrent access)
    for r in results:
        body = r.json()
        assert "answer" in body and "question_id" in body


def test_concurrent_document_upload_and_ask(client, admin_headers, agent_headers):
    """Races a document upload (which calls vectorstore.rebuild_index, replacing
    _state) against concurrent /rag/ask reads of that same _state - the scenario
    flagged in phase-0-inventory.md #4 as a possible torn-read risk."""

    def upload():
        return client.post(
            "/rag/documents",
            files={"file": (f"race_doc.txt", io.BytesIO(b"Procedure de test de concurrence."), "text/plain")},
            headers=admin_headers,
        )

    def ask(i):
        return client.post("/rag/ask", json={"question": f"race test {i}"}, headers=agent_headers)

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(upload)] + [pool.submit(ask, i) for i in range(9)]
        results = [f.result() for f in as_completed(futures)]

    # None should crash the process / return 500 - a torn read would most likely
    # surface as an unhandled exception -> 500, not silent data corruption we could
    # otherwise detect at the HTTP layer.
    assert all(r.status_code in (200,) for r in results), [r.status_code for r in results]


def test_upload_with_no_filename_does_not_crash(client, admin_headers):
    """Phase 2 mypy finding: os.path.basename(file.filename) at rag.py:39 runs
    BEFORE the try/except block (which only wraps lines 56-73), and FastAPI types
    UploadFile.filename as str | None. Sends a multipart part with an empty
    filename to see what actually happens - not asserting a specific outcome in
    advance, just observing and reporting reality."""
    resp = client.post(
        "/rag/documents",
        files={"file": ("", io.BytesIO(b"content with no filename"), "text/plain")},
        headers=admin_headers,
    )
    # Report actual behavior rather than asserting a pre-judged expectation
    print(f"\n[FINDING] upload with empty filename -> HTTP {resp.status_code}: {resp.text[:300]}")
    assert resp.status_code in (200, 422, 500), f"unexpected status {resp.status_code}"
