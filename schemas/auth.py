from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid


class UserCreate(BaseModel):
    rut: str
    email: EmailStr
    full_name: str
    role: str
    password: str
    institution: Optional[str] = None


class UserLogin(BaseModel):
    rut: str
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    rut: str
    email: str
    full_name: str
    role: str
    institution: Optional[str] = None
    firma_url: Optional[str] = None
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    institution: Optional[str] = None
    firma_url: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str
