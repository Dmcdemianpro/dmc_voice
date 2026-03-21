from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
import uuid


# ── Templates ────────────────────────────────────────────────────────────────

class RadTemplateCreate(BaseModel):
    modality: str
    region: str
    name: str
    description: Optional[str] = None
    template_text: str
    variables: Optional[dict[str, Any]] = None


class RadTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    template_text: Optional[str] = None
    variables: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class RadTemplateOut(BaseModel):
    id: uuid.UUID
    modality: str
    region: str
    name: str
    description: Optional[str] = None
    template_text: str
    variables: Optional[dict[str, Any]] = None
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RadTemplateVersionOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    version_number: int
    template_text: str
    variables: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Report History ───────────────────────────────────────────────────────────

class RadReportHistoryCreate(BaseModel):
    report_id: Optional[uuid.UUID] = None
    template_id: Optional[uuid.UUID] = None
    modality: str
    region: str
    clinical_context: Optional[str] = None
    prompt_sent: str
    response_received: str


class RadReportHistoryOut(BaseModel):
    id: uuid.UUID
    report_id: Optional[uuid.UUID] = None
    template_id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    modality: str
    region: str
    clinical_context: Optional[str] = None
    prompt_sent: str
    response_received: str
    findings_json: Optional[dict[str, Any]] = None
    finding_category: Optional[str] = None
    rating: Optional[int] = None
    feedback: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RatingUpdate(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: Optional[str] = None


# ── Generate request/response ────────────────────────────────────────────────

class AsistRadRequest(BaseModel):
    modality: str
    region: str
    template_id: Optional[uuid.UUID] = None
    clinical_context: Optional[str] = None
    study_info: Optional[dict[str, Any]] = None


class AsistRadResponse(BaseModel):
    pre_report_text: str
    template_used: str
    metadata: Optional[dict[str, Any]] = None
