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
MIN_RELEVANCE = 0.12

# Above this similarity to a chunk already picked for this result set, a candidate
# is treated as a near-duplicate (e.g. two near-identical "mandat" procedure docs)
# and skipped, so a genuinely different second document gets the context slot
# instead of two chunks saying almost the same thing.
DEDUP_THRESHOLD = 0.9

# TF-IDF's IDF weighting degenerates with a tiny corpus (a single document can't
# tell "common word" from "meaningful word" apart), which lets French function
# words create spurious matches for unrelated questions. Stripping them out
# keeps similarity scores driven by actual content words instead of grammar.
FRENCH_STOP_WORDS = [
    "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle", "elles",
    "en", "et", "eux", "il", "ils", "je", "la", "le", "les", "leur", "leurs",
    "lui", "ma", "mais", "me", "même", "mes", "moi", "mon", "ne", "nos", "notre",
    "nous", "on", "ou", "où", "par", "pas", "pour", "qu", "que", "qui", "quoi",
    "sa", "se", "ses", "son", "sur", "ta", "te", "tes", "toi", "ton", "tu",
    "un", "une", "vos", "votre", "vous", "c", "d", "j", "l", "à", "m", "n", "s",
    "t", "y", "été", "être", "avoir", "est", "sont", "suis", "es", "sommes",
    "êtes", "cette", "cet", "ceux", "quel", "quelle", "quels", "quelles",
    "comment", "pourquoi", "quand", "si", "donc", "plus", "moins", "très",
    "bien", "aussi", "alors", "tout", "tous", "toute", "toutes",
]

_state = {"vectorizer": None, "matrix": None, "chunk_ids": [], "texts": []}


def rebuild_index(db: Session) -> None:
    rows = db.query(DocumentChunk).all()
    if not rows:
        _state.update(vectorizer=None, matrix=None, chunk_ids=[], texts=[])
        return

    texts = [r.content for r in rows]
    ids = [r.id for r in rows]
    vectorizer = TfidfVectorizer(max_features=20000, stop_words=FRENCH_STOP_WORDS)
    matrix = vectorizer.fit_transform(texts)
    _state.update(vectorizer=vectorizer, matrix=matrix, chunk_ids=ids, texts=texts)


def query(question: str, top_k: int = 4) -> list[dict]:
    if _state["vectorizer"] is None:
        return []

    vec = _state["vectorizer"].transform([question])
    sims = cosine_similarity(vec, _state["matrix"])[0]
    ranked = sims.argsort()[::-1]

    out = []
    selected_idx = []
    for idx in ranked:
        if len(out) >= top_k:
            break
        similarity = float(sims[idx])
        if similarity < MIN_RELEVANCE:
            break
        if selected_idx:
            dup_sims = cosine_similarity(_state["matrix"][idx], _state["matrix"][selected_idx])[0]
            if dup_sims.max() >= DEDUP_THRESHOLD:
                continue
        out.append(
            {
                "chunk_id": _state["chunk_ids"][idx],
                "content": _state["texts"][idx],
                "similarity": similarity,
            }
        )
        selected_idx.append(idx)
    return out
