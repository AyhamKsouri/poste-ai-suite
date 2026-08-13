"""Phase 4 - real Groq failure-mode testing: invalid key, network down, timeout.
Uses the real groq SDK making real network calls (except the network-down case),
not mocks - these are genuine failure conditions, not simulated ones."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

from groq import Groq

print("=== 1. Invalid API key (real network call to Groq) ===")
try:
    bad_client = Groq(api_key="gsk_invalid_key_for_qa_audit_testing_00000000000000000000")
    resp = bad_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        max_completion_tokens=10,
        messages=[{"role": "user", "content": "test"}],
    )
    print("UNEXPECTED: call succeeded with invalid key:", resp)
except Exception as e:
    print(f"Exception type: {type(e).__name__}")
    print(f"Exception message: {e}")

print("\n=== 2. Network unreachable (bogus base_url) ===")
try:
    unreachable_client = Groq(api_key="gsk_whatever", base_url="http://10.255.255.1:1/")
    start = time.time()
    resp = unreachable_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        max_completion_tokens=10,
        messages=[{"role": "user", "content": "test"}],
        timeout=5,
    )
    print("UNEXPECTED: call succeeded:", resp)
except Exception as e:
    elapsed = time.time() - start
    print(f"Exception type: {type(e).__name__} after {elapsed:.1f}s")
    print(f"Exception message: {str(e)[:300]}")

print("\n=== 3. Client-side timeout (real endpoint, artificially short timeout) ===")
try:
    from app.config import settings
    real_client = Groq(api_key=settings.groq_api_key)
    start = time.time()
    resp = real_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        max_completion_tokens=500,
        messages=[{"role": "user", "content": "Write a very long detailed essay about postal history."}],
        timeout=0.05,  # unreasonably short to force a timeout
    )
    print("UNEXPECTED: call succeeded despite 0.05s timeout")
except Exception as e:
    elapsed = time.time() - start
    print(f"Exception type: {type(e).__name__} after {elapsed:.2f}s")
    print(f"Exception message: {str(e)[:300]}")
