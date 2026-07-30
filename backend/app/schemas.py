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
