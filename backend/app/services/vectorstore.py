"""Lightweight local retrieval index for RAG document chunks.

Uses TF-IDF + cosine similarity (scikit-learn) instead of an embedding vector
store - no API key, no compiler, no model download required, fully offline.
The index is rebuilt in-process whenever documents change (and once at
startup); it holds the full corpus, which is fine at the scale this app
targets (internal procedure documents, not a web-scale corpus).
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from app.models import DocumentChunk

# Below this similarity, we treat retrieval as "nothing relevant found" (Goal A3).
MIN_RELEVANCE = 0.08

_state = {"vectorizer": None, "matrix": None, "chunk_ids": [], "texts": []}


def rebuild_index(db: Session) -> None:
    rows = db.query(DocumentChunk).all()
    if not rows:
        _state.update(vectorizer=None, matrix=None, chunk_ids=[], texts=[])
        return

    texts = [r.content for r in rows]
    ids = [r.id for r in rows]
    vectorizer = TfidfVectorizer(max_features=20000)
    matrix = vectorizer.fit_transform(texts)
    _state.update(vectorizer=vectorizer, matrix=matrix, chunk_ids=ids, texts=texts)


def query(question: str, top_k: int = 4) -> list[dict]:
    if _state["vectorizer"] is None:
        return []

    vec = _state["vectorizer"].transform([question])
    sims = cosine_similarity(vec, _state["matrix"])[0]
    ranked = sims.argsort()[::-1][:top_k]

    out = []
    for idx in ranked:
        similarity = float(sims[idx])
        if similarity < MIN_RELEVANCE:
            continue
        out.append(
            {
                "chunk_id": _state["chunk_ids"][idx],
                "content": _state["texts"][idx],
                "similarity": similarity,
            }
        )
    return out
