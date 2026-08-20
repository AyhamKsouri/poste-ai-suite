from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import AuditLog, Complaint, User
from app.schemas import (
    ComplaintCreate,
    ComplaintOut,
    ComplaintStats,
    ReplyRequest,
    StatusUpdateRequest,
)
from app.services.ai_client import classify_complaint

router = APIRouter(prefix="/complaints", tags=["complaints"])


@router.post("", response_model=ComplaintOut)
def submit_complaint(payload: ComplaintCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    complaint = Complaint(
        customer_name=payload.customer_name,
        customer_contact=payload.customer_contact,
        raw_text=payload.raw_text,
        status="new",
        assigned_to=user.id,
    )
    db.add(complaint)
    db.commit()

    ai_result = classify_complaint(payload.raw_text)
    complaint.category = ai_result["category"]
    complaint.urgency = ai_result["urgency"]
    complaint.confidence = ai_result.get("confidence")
    complaint.ai_summary = ai_result["summary"]
    complaint.draft_reply = ai_result["draft_reply"]
    complaint.status = "reviewed"

    db.add(
        AuditLog(
            user_id=user.id,
            action="complaint.triaged",
            target_table="complaints",
            target_id=complaint.id,
            log_metadata={
                "category": complaint.category,
                "urgency": complaint.urgency,
                "confidence": complaint.confidence,
            },
        )
    )
    db.commit()
    db.refresh(complaint)
    return complaint


@router.get("", response_model=list[ComplaintOut])
def list_complaints(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    urgency: str | None = Query(default=None),
):
    q = db.query(Complaint)
    if status:
        q = q.filter(Complaint.status == status)
    if category:
        q = q.filter(Complaint.category == category)
    if urgency:
        q = q.filter(Complaint.urgency == urgency)
    return q.order_by(Complaint.created_at.desc()).all()


@router.get("/stats", response_model=ComplaintStats)
def complaint_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    total = db.query(func.count(Complaint.id)).scalar() or 0

    by_category_rows = (
        db.query(Complaint.category, func.count(Complaint.id)).group_by(Complaint.category).all()
    )
    by_urgency_rows = (
        db.query(Complaint.urgency, func.count(Complaint.id)).group_by(Complaint.urgency).all()
    )

    resolved = db.query(Complaint).filter(Complaint.replied_at.isnot(None)).all()
    if resolved:
        total_hours = sum(
            (c.replied_at - c.created_at).total_seconds() / 3600 for c in resolved
        )
        avg_resolution_hours = total_hours / len(resolved)
    else:
        avg_resolution_hours = None

    return ComplaintStats(
        total=total,
        by_category={(k or "unknown"): v for k, v in by_category_rows},
        by_urgency={(k or "unknown"): v for k, v in by_urgency_rows},
        avg_resolution_hours=avg_resolution_hours,
    )


@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@router.patch("/{complaint_id}/reply", response_model=ComplaintOut)
def send_reply(
    complaint_id: str,
    payload: ReplyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    complaint.final_reply = payload.final_reply
    complaint.status = "replied"
    complaint.replied_at = datetime.utcnow()

    db.add(
        AuditLog(user_id=user.id, action="complaint.reply_sent", target_table="complaints", target_id=complaint.id)
    )
    db.commit()
    db.refresh(complaint)
    return complaint


@router.patch("/{complaint_id}/status", response_model=ComplaintOut)
def update_status(
    complaint_id: str,
    payload: StatusUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if payload.status not in ("new", "reviewed", "replied"):
        raise HTTPException(status_code=400, detail="Invalid status")

    complaint.status = payload.status
    db.add(
        AuditLog(user_id=user.id, action="complaint.status_updated", target_table="complaints", target_id=complaint.id)
    )
    db.commit()
    db.refresh(complaint)
    return complaint
