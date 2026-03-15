from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
import uuid


class ReportCreate(BaseModel):
    study_id: Optional[str] = None
    accession_number: Optional[str] = None
    raw_transcript: str


class ReportUpdate(BaseModel):
    texto_final: Optional[str] = None
    status: Optional[str] = None


class ReportAssign(BaseModel):
    assigned_to_id: uuid.UUID


class ReportLinkWorklist(BaseModel):
    worklist_id: uuid.UUID


class ReportInvalidate(BaseModel):
    password: str
    reason: Optional[str] = None


class ReportOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    study_id: Optional[str] = None
    accession_number: Optional[str] = None
    status: str
    modalidad: Optional[str] = None
    region_anatomica: Optional[str] = None
    lateralidad: Optional[str] = None
    raw_transcript: Optional[str] = None
    claude_json: Optional[Any] = None
    fhir_json: Optional[Any] = None
    texto_final: Optional[str] = None
    has_alert: bool
    alert_desc: Optional[str] = None
    pdf_url: Optional[str] = None
    signed_at: Optional[datetime] = None
    signed_by_id: Optional[uuid.UUID] = None
    signed_by_name: Optional[str] = None
    assigned_to_id: Optional[uuid.UUID] = None
    assigned_to_name: Optional[str] = None
    sent_to_ris_at: Optional[datetime] = None
    version: int
    created_at: datetime
    updated_at: datetime

    # Patient demographics — populated from linked Worklist entry
    patient_name: Optional[str] = None
    patient_rut: Optional[str] = None
    patient_dob: Optional[str] = None
    patient_sex: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    patient_address: Optional[str] = None
    patient_commune: Optional[str] = None
    patient_region: Optional[str] = None

    model_config = {"from_attributes": True}


class ReportListOut(BaseModel):
    items: list[ReportOut]
    total: int
    page: int
    per_page: int
