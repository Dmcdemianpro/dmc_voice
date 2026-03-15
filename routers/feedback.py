"""
Router de Feedback Loop y Few-Shot Learning.

Endpoints:
  POST /api/v1/feedback/sessions         → iniciar sesión de edición
  PATCH /api/v1/feedback/sessions/{id}   → actualizar métricas de sesión
  POST /api/v1/feedback/corrections      → guardar par original/corregido al firmar
  GET  /api/v1/feedback/corrections      → listar pares (ADMIN/JEFE)
  GET  /api/v1/feedback/similar          → buscar ejemplos similares (few-shot)
  GET  /api/v1/feedback/examples         → listar training examples
  PATCH /api/v1/feedback/examples/{id}   → validar/marcar para fine-tuning
  GET  /api/v1/feedback/stats            → dashboard de métricas
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload

from database import get_db
from models.user import User
from models.feedback import ReportSession, CorrectionPair, TrainingExample
from schemas.feedback import (
    SessionStart, SessionUpdate, SessionOut,
    CorrectionPairCreate, CorrectionPairOut,
    TrainingExampleOut, TrainingExampleValidate,
    SimilarReportResult, TrainingStats,
)
from middleware.auth_middleware import get_current_user
from services import diff_service, embedding_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionOut, status_code=201)
async def start_session(
    body: SessionStart,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inicia una sesión de edición cuando el radiólogo abre un informe."""
    session = ReportSession(
        report_id=uuid.UUID(body.report_id),
        user_id=current_user.id,
        audio_duration_seconds=body.audio_duration_seconds,
        transcript_length=body.transcript_length or 0,
    )
    db.add(session)
    await db.flush()
    return SessionOut.model_validate(session)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualiza métricas de sesión (llamado cuando el radiólogo firma)."""
    result = await db.execute(
        select(ReportSession).where(ReportSession.id == uuid.UUID(session_id))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.ended_at = datetime.now(timezone.utc)
    if body.edit_count is not None:
        session.edit_count = body.edit_count
    if body.keystrokes is not None:
        session.keystrokes = body.keystrokes
    if body.time_to_sign_seconds is not None:
        session.time_to_sign_seconds = body.time_to_sign_seconds

    return SessionOut.model_validate(session)


# ── Correction Pairs ──────────────────────────────────────────────────────────

@router.post("/corrections", response_model=CorrectionPairOut, status_code=201)
async def save_correction(
    body: CorrectionPairCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda el par original/corregido cuando el radiólogo firma el informe.
    Calcula automáticamente el diff y promueve a training_examples si la calidad es alta.
    """
    # 1. Calcular diff
    diff_result = diff_service.compute_diff(body.original_text, body.corrected_text)

    # 2. Crear el par de corrección
    pair = CorrectionPair(
        report_id=uuid.UUID(body.report_id),
        session_id=uuid.UUID(body.session_id) if body.session_id else None,
        user_id=current_user.id,
        original_text=body.original_text,
        corrected_text=body.corrected_text,
        diff_json=diff_result.model_dump(),
        diff_score=diff_result.diff_score,
        similarity_ratio=diff_result.similarity_ratio,
        modalidad=body.modalidad,
        region_anatomica=body.region_anatomica,
        raw_transcript=body.raw_transcript,
    )
    db.add(pair)
    await db.flush()

    # 3. Actualizar sesión si se pasaron métricas inline
    if body.session_id and (body.edit_count or body.time_to_sign_seconds):
        res = await db.execute(
            select(ReportSession).where(ReportSession.id == uuid.UUID(body.session_id))
        )
        session = res.scalar_one_or_none()
        if session:
            session.ended_at = datetime.now(timezone.utc)
            if body.edit_count:
                session.edit_count = body.edit_count
            if body.keystrokes:
                session.keystrokes = body.keystrokes
            if body.time_to_sign_seconds:
                session.time_to_sign_seconds = body.time_to_sign_seconds

    # 4. Promover automáticamente a training_examples si calidad alta
    if diff_service.should_auto_promote(diff_result.diff_score) and body.raw_transcript:
        quality = diff_service.compute_quality_score(
            diff_result.diff_score, body.time_to_sign_seconds
        )
        # Generar embedding del transcript
        embedding = embedding_service.generate_embedding(body.raw_transcript)

        example = TrainingExample(
            correction_pair_id=pair.id,
            transcript=body.raw_transcript,
            corrected_text=body.corrected_text,
            modalidad=body.modalidad,
            region_anatomica=body.region_anatomica,
            quality_score=quality,
            is_validated=False,   # requiere validación manual para fine-tuning
            used_for_fewshot=True,
            used_for_finetune=False,
            embedding=embedding,
        )
        db.add(example)
        logger.info(
            f"TrainingExample auto-promovido: diff_score={diff_result.diff_score:.1f}, "
            f"quality={quality:.2f}, modalidad={body.modalidad}"
        )

    await db.flush()
    return CorrectionPairOut.model_validate(pair)


@router.get("/corrections", response_model=list[CorrectionPairOut])
async def list_corrections(
    modalidad: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista pares de corrección. Solo ADMIN/JEFE_SERVICIO."""
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        raise HTTPException(status_code=403, detail="Sin acceso")

    q = select(CorrectionPair).order_by(CorrectionPair.created_at.desc())
    if modalidad:
        q = q.where(CorrectionPair.modalidad == modalidad)
    q = q.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(q)
    return [CorrectionPairOut.model_validate(p) for p in result.scalars().all()]


# ── Few-Shot Similarity Search ────────────────────────────────────────────────

@router.get("/similar", response_model=list[SimilarReportResult])
async def find_similar_reports(
    transcript: str = Query(..., min_length=10),
    n: int = Query(5, ge=1, le=10),
    modalidad: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca los N informes más similares al transcript dado.
    Usado por el frontend para inyectar few-shot examples antes de llamar a Claude.
    """
    # 1. Generar embedding del nuevo transcript
    query_embedding = embedding_service.generate_embedding(transcript)
    if not query_embedding:
        return []

    # 2. Cargar ejemplos con embeddings desde la DB
    q = select(TrainingExample).where(
        TrainingExample.used_for_fewshot == True,
        TrainingExample.embedding.is_not(None),
    )
    if modalidad:
        q = q.where(TrainingExample.modalidad == modalidad)

    result = await db.execute(q)
    examples = result.scalars().all()

    if not examples:
        return []

    # 3. Búsqueda por similitud coseno
    candidates = [
        {
            "id": str(ex.id),
            "embedding": ex.embedding,
            "transcript": ex.transcript,
            "corrected_text": ex.corrected_text,
            "modalidad": ex.modalidad,
            "region_anatomica": ex.region_anatomica,
        }
        for ex in examples
    ]
    similar = embedding_service.find_similar(query_embedding, candidates, top_n=n)

    return [
        SimilarReportResult(
            example_id=uuid.UUID(s["id"]),
            transcript=s["transcript"],
            corrected_text=s["corrected_text"],
            modalidad=s.get("modalidad"),
            region_anatomica=s.get("region_anatomica"),
            similarity_score=s["similarity_score"],
        )
        for s in similar
    ]


# ── Training Examples ─────────────────────────────────────────────────────────

@router.get("/examples", response_model=list[TrainingExampleOut])
async def list_examples(
    validated_only: bool = Query(False),
    for_finetune: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista training examples. Solo ADMIN/JEFE_SERVICIO."""
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        raise HTTPException(status_code=403, detail="Sin acceso")

    q = select(TrainingExample).order_by(TrainingExample.created_at.desc())
    if validated_only:
        q = q.where(TrainingExample.is_validated == True)
    if for_finetune:
        q = q.where(TrainingExample.used_for_finetune == True)
    q = q.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(q)
    return [TrainingExampleOut.model_validate(e) for e in result.scalars().all()]


@router.patch("/examples/{example_id}", response_model=TrainingExampleOut)
async def validate_example(
    example_id: str,
    body: TrainingExampleValidate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Valida o desvalida un training example. Solo ADMIN/JEFE_SERVICIO."""
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        raise HTTPException(status_code=403, detail="Sin acceso")

    result = await db.execute(
        select(TrainingExample).where(TrainingExample.id == uuid.UUID(example_id))
    )
    example = result.scalar_one_or_none()
    if not example:
        raise HTTPException(status_code=404, detail="Ejemplo no encontrado")

    example.is_validated = body.is_validated
    if body.used_for_finetune is not None:
        example.used_for_finetune = body.used_for_finetune

    return TrainingExampleOut.model_validate(example)


# ── Stats / Dashboard ─────────────────────────────────────────────────────────

@router.get("/stats", response_model=TrainingStats)
async def get_training_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Estadísticas para el dashboard de entrenamiento. Solo ADMIN/JEFE_SERVICIO."""
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        raise HTTPException(status_code=403, detail="Sin acceso")

    # Conteos básicos
    total_sessions = (await db.execute(
        select(func.count()).select_from(ReportSession)
    )).scalar_one()

    total_pairs = (await db.execute(
        select(func.count()).select_from(CorrectionPair)
    )).scalar_one()

    total_examples = (await db.execute(
        select(func.count()).select_from(TrainingExample)
    )).scalar_one()

    validated = (await db.execute(
        select(func.count()).select_from(TrainingExample)
        .where(TrainingExample.is_validated == True)
    )).scalar_one()

    avg_diff = (await db.execute(
        select(func.avg(CorrectionPair.diff_score))
    )).scalar_one()

    avg_time = (await db.execute(
        select(func.avg(ReportSession.time_to_sign_seconds))
        .where(ReportSession.time_to_sign_seconds.is_not(None))
    )).scalar_one()

    # Pares por modalidad
    modal_result = await db.execute(
        select(CorrectionPair.modalidad, func.count())
        .group_by(CorrectionPair.modalidad)
        .order_by(func.count().desc())
    )
    pairs_by_modalidad = {
        (row[0] or "DESCONOCIDA"): row[1]
        for row in modal_result.all()
    }

    # Distribución de diff_score en rangos
    diff_dist = []
    for label, low, high in [
        ("0-10",  0,  10),
        ("10-25", 10, 25),
        ("25-50", 25, 50),
        ("50-75", 50, 75),
        ("75-100", 75, 100),
    ]:
        cnt = (await db.execute(
            select(func.count()).select_from(CorrectionPair)
            .where(CorrectionPair.diff_score >= low, CorrectionPair.diff_score < high)
        )).scalar_one()
        diff_dist.append({"range": label, "count": cnt})

    # Calidad promedio por semana (últimas 8 semanas)
    quality_result = await db.execute(
        select(
            func.date_trunc("week", TrainingExample.created_at).label("week"),
            func.avg(TrainingExample.quality_score).label("avg_quality"),
            func.count().label("count"),
        )
        .group_by(func.date_trunc("week", TrainingExample.created_at))
        .order_by(func.date_trunc("week", TrainingExample.created_at))
        .limit(8)
    )
    quality_over_time = [
        {
            "date": str(row.week)[:10] if row.week else None,
            "avg_quality": round(float(row.avg_quality), 3) if row.avg_quality else None,
            "count": row.count,
        }
        for row in quality_result.all()
    ]

    return TrainingStats(
        total_sessions=total_sessions,
        total_correction_pairs=total_pairs,
        total_training_examples=total_examples,
        validated_examples=validated,
        avg_diff_score=round(float(avg_diff), 2) if avg_diff else None,
        avg_time_to_sign_seconds=round(float(avg_time), 1) if avg_time else None,
        pairs_by_modalidad=pairs_by_modalidad,
        diff_score_distribution=diff_dist,
        quality_over_time=quality_over_time,
        wer_history=[],  # poblado por scripts/evaluate_wer.py
    )
