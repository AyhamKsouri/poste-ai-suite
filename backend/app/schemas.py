from datetime import datetime

from pydantic import BaseModel, ConfigDict

# ---- Auth ----

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "agent"
    office: str | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    office: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- RAG ----

class DocumentOut(BaseModel):
    id: str
    title: str
    original_filename: str | None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatTurn(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class AskRequest(BaseModel):
    question: str
    history: list[ChatTurn] = []


class SourceOut(BaseModel):
    doc_title: str
    chunk_text: str


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceOut]
    question_id: str


class FeedbackRequest(BaseModel):
    feedback: str  # 'helpful' | 'not_helpful'


class QuestionOut(BaseModel):
    id: str
    question_text: str
    answer_text: str | None
    feedback: str | None
    response_time_ms: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RagStats(BaseModel):
    total_questions: int
    helpful_count: int
    not_helpful_count: int
    unrated_count: int
    avg_response_time_ms: float
    top_questions: list[str]


# ---- Complaints ----

class ComplaintCreate(BaseModel):
    customer_name: str | None = None
    customer_contact: str | None = None
    raw_text: str


class ComplaintOut(BaseModel):
    id: str
    customer_name: str | None
    customer_contact: str | None
    raw_text: str
    category: str | None
    urgency: str | None
    confidence: float | None
    ai_summary: str | None
    draft_reply: str | None
    final_reply: str | None
    status: str
    created_at: datetime
    replied_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ReplyRequest(BaseModel):
    final_reply: str


class StatusUpdateRequest(BaseModel):
    status: str


class ComplaintStats(BaseModel):
    total: int
    by_category: dict[str, int]
    by_urgency: dict[str, int]
    avg_resolution_hours: float | None
