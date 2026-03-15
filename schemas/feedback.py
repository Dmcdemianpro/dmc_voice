"""Schemas Pydantic para el sistema de feedback loop y few-shot learning."""
from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
import uuid


# ── Report Sessions ───────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    report_id: str
    audio_duration_seconds: Optional[float] = None
    transcript_length: Optional[int] = None

class SessionUpdate(BaseModel):
    edit_count: Optional[int] = None
    keystrokes: Optional[int] = None
    time_to_sign_seconds: Optional[float] = None

class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    report_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    started_at: datetime
    ended_at: Optional[datetime]
    edit_count: int
    keystrokes: int
    time_to_sign_seconds: Optional[float]
    audio_duration_seconds: Optional[float]
    transcript_length: int


# ── Correction Pairs ──────────────────────────────────────────────────────────

class CorrectionPairCreate(BaseModel):
    """Payload enviado desde el frontend al momento de firmar."""
    report_id: str
    session_id: Optional[str] = None
    original_text: str = Field(..., description="Texto que generó Claude (texto_informe_final original)")
    corrected_text: str = Field(..., description="Texto final que firmó el radiólogo")
    modalidad: Optional[str] = None
    region_anatomica: Optional[str] = None
    raw_transcript: Optional[str] = None
    # Métricas de sesión opcionales (si no se creó sesión aparte)
    edit_count: Optional[int] = None
    keystrokes: Optional[int] = None
    time_to_sign_seconds: Optional[float] = None
    audio_duration_seconds: Optional[float] = None

class DiffOperation(BaseModel):
    op: str              # "equal" | "insert" | "delete" | "replace"
    text: Optional[str] = None
    old: Optional[str] = None
    new: Optional[str] = None

class DiffResult(BaseModel):
    similarity_ratio: float      # 0.0–1.0
    diff_score: float            # 0–100 (inverso de similarity)
    char_insertions: int
    char_deletions: int
    char_unchanged: int
    ops: List[DiffOperation]
    summary: str                 # e.g. "15 palabras cambiadas, ratio 0.85"

class CorrectionPairOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    report_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    original_text: str
    corrected_text: str
    diff_json: Optional[Dict[str, Any]]
    diff_score: Optional[float]
    similarity_ratio: Optional[float]
    modalidad: Optional[str]
    region_anatomica: Optional[str]
    created_at: datetime


# ── Training Examples ─────────────────────────────────────────────────────────

class TrainingExampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    correction_pair_id: uuid.UUID
    transcript: str
    corrected_text: str
    modalidad: Optional[str]
    region_anatomica: Optional[str]
    quality_score: Optional[float]
    is_validated: bool
    used_for_fewshot: bool
    used_for_finetune: bool
    created_at: datetime

class TrainingExampleValidate(BaseModel):
    is_validated: bool
    used_for_finetune: Optional[bool] = None

class SimilarReportResult(BaseModel):
    """Resultado de búsqueda de informes similares para few-shot."""
    example_id: uuid.UUID
    transcript: str
    corrected_text: str
    modalidad: Optional[str]
    region_anatomica: Optional[str]
    similarity_score: float   # cosine similarity 0–1


# ── Dashboard de métricas ─────────────────────────────────────────────────────

class TrainingStats(BaseModel):
    total_sessions: int
    total_correction_pairs: int
    total_training_examples: int
    validated_examples: int
    avg_diff_score: Optional[float]
    avg_time_to_sign_seconds: Optional[float]
    pairs_by_modalidad: Dict[str, int]
    diff_score_distribution: List[Dict[str, Any]]  # [{range, count}]
    quality_over_time: List[Dict[str, Any]]         # [{date, avg_score}]
    wer_history: List[Dict[str, Any]]               # [{date, wer_before, wer_after}]
