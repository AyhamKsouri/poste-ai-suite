import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.config import settings
from app.db import get_db
from app.models import AuditLog, Document, DocumentChunk, User
from app.schemas import DocumentOut
from app.services import vectorstore
from app.services.documents import chunk_text, extract_text

router = APIRouter(prefix="/rag", tags=["rag"])

os.makedirs(settings.upload_dir, exist_ok=True)


@router.post("/documents", response_model=DocumentOut)
def upload_document(
    file: UploadFile,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    doc_id = str(uuid.uuid4())
    safe_name = f"{doc_id}_{os.path.basename(file.filename)}"
    file_path = os.path.join(settings.upload_dir, safe_name)

    with open(file_path, "wb") as f:
        f.write(file.file.read())

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
