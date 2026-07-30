from datetime import datetime

from pydantic import BaseModel


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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


class AskRequest(BaseModel):
    question: str


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

    class Config:
        from_attributes = True


class RagStats(BaseModel):
    total_questions: int
    helpful_count: int
    not_helpful_count: int
    unrated_count: int
    avg_response_time_ms: float
    top_questions: list[str]
