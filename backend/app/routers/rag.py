import logging
import os
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.config import settings
from app.db import get_db
from app.models import AuditLog, Document, DocumentChunk, Question, User
from app.schemas import (
    AskRequest,
    AskResponse,
    DocumentOut,
    FeedbackRequest,
    QuestionOut,
    RagStats,
    SourceOut,
)
from app.services import vectorstore
from app.services.ai_client import answer_question
from app.services.documents import chunk_text, extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["rag"])

os.makedirs(settings.upload_dir, exist_ok=True)

# QA audit finding M5: no size/type limit existed at all, and the file was
# read fully into memory unbounded, feeding a pypdf version with many known
# parser-crash advisories.
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".txt"}


@router.post("/documents", response_model=DocumentOut)
def upload_document(
    file: UploadFile,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
        )

    doc_id = str(uuid.uuid4())
    safe_name = f"{doc_id}_{os.path.basename(file.filename)}"
    file_path = os.path.join(settings.upload_dir, safe_name)

    content = file.file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB upload limit",
        )

    with open(file_path, "wb") as f:
        f.write(content)

    document = Document(
        id=doc_id,
        title=os.path.splitext(file.filename)[0],
        original_filename=file.filename,
        file_path=file_path,
        uploaded_by=admin.id,
        status="processing",
    )
    db.add(document)
    db.commit()

    try:
        text = extract_text(file_path, file.filename)
        pieces = chunk_text(text)

        chunk_ids = [str(uuid.uuid4()) for _ in pieces]
        for i, (chunk_id, content) in enumerate(zip(chunk_ids, pieces)):
            db.add(
                DocumentChunk(
                    id=chunk_id,
                    document_id=doc_id,
                    chunk_index=i,
                    content=content,
                    vector_id=chunk_id,
                )
            )
        document.status = "ready"
    except Exception:
        logger.exception("Document text extraction/chunking failed for document_id=%s", doc_id)
        document.status = "failed"

    db.add(AuditLog(user_id=admin.id, action="rag.document_uploaded", target_table="documents", target_id=doc_id))
    db.commit()
    db.refresh(document)
    vectorstore.rebuild_index(db)
    return document


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Document).order_by(Document.created_at.desc()).all()


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)

    db.delete(document)
    db.add(AuditLog(user_id=admin.id, action="rag.document_deleted", target_table="documents", target_id=document_id))
    db.commit()
    vectorstore.rebuild_index(db)
    return {"ok": True}


@router.post("/ask", response_model=AskResponse)
def ask(payload: AskRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    start = time.time()
    matches = vectorstore.query(payload.question, top_k=4)
    chunk_texts = [m["content"] for m in matches]

    history = [{"role": turn.role, "content": turn.content} for turn in payload.history]
    answer = answer_question(payload.question, chunk_texts, history)
    elapsed_ms = int((time.time() - start) * 1000)

    chunk_id_to_doc = {}
    if matches:
        chunk_ids = [m["chunk_id"] for m in matches]
        rows = db.query(DocumentChunk).filter(DocumentChunk.id.in_(chunk_ids)).all()
        chunk_id_to_doc = {row.id: row for row in rows}

    sources = []
    for m in matches:
        row = chunk_id_to_doc.get(m["chunk_id"])
        if row:
            sources.append(SourceOut(doc_title=row.document.title, chunk_text=m["content"][:400]))

    question = Question(
        user_id=user.id,
        question_text=payload.question,
        answer_text=answer,
        source_chunk_ids=[m["chunk_id"] for m in matches],
        response_time_ms=elapsed_ms,
    )
    db.add(question)
    db.add(AuditLog(user_id=user.id, action="rag.question_asked", target_table="questions", target_id=question.id))
    db.commit()
    db.refresh(question)

    return AskResponse(answer=answer, sources=sources, question_id=question.id)


@router.post("/questions/{question_id}/feedback")
def submit_feedback(
    question_id: str,
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if payload.feedback not in ("helpful", "not_helpful"):
        raise HTTPException(status_code=400, detail="feedback must be 'helpful' or 'not_helpful'")

    question.feedback = payload.feedback
    db.commit()
    return {"ok": True}


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    feedback: str | None = Query(default=None),
):
    q = db.query(Question)
    if feedback:
        q = q.filter(Question.feedback == feedback)
    return q.order_by(Question.created_at.desc()).all()


@router.get("/stats", response_model=RagStats)
def stats(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    total = db.query(func.count(Question.id)).scalar() or 0
    helpful = db.query(func.count(Question.id)).filter(Question.feedback == "helpful").scalar() or 0
    not_helpful = db.query(func.count(Question.id)).filter(Question.feedback == "not_helpful").scalar() or 0
    avg_ms = db.query(func.avg(Question.response_time_ms)).scalar() or 0.0

    top = (
        db.query(Question.question_text, func.count(Question.id).label("cnt"))
        .group_by(Question.question_text)
        .order_by(func.count(Question.id).desc())
        .limit(5)
        .all()
    )

    return RagStats(
        total_questions=total,
        helpful_count=helpful,
        not_helpful_count=not_helpful,
        unrated_count=total - helpful - not_helpful,
        avg_response_time_ms=float(avg_ms),
        top_questions=[t[0] for t in top],
    )
