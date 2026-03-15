from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from passlib.context import CryptContext
from typing import Optional
from pydantic import BaseModel

from database import get_db
from models.user import User
from models.report import Report
from models.audit import AuditLog
from models.clinic_settings import ClinicSettings
from schemas.auth import UserCreate, UserOut, UserUpdate
from middleware.auth_middleware import get_current_user, require_roles
from middleware.audit_middleware import log_action


class ClinicSettingsOut(BaseModel):
    institution_name: str
    institution_subtitle: str
    report_title: str
    footer_text: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True


class ClinicSettingsUpdate(BaseModel):
    institution_name: Optional[str] = None
    institution_subtitle: Optional[str] = None
    report_title: Optional[str] = None
    footer_text: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    existing = await db.execute(select(User).where(User.rut == body.rut))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese RUT")

    new_user = User(
        rut=body.rut,
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        hashed_pw=pwd_context.hash(body.password),
        institution=body.institution,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    await log_action(db, current_user.id, "CREATE_USER", detail={"new_user_rut": body.rut})
    return UserOut.model_validate(new_user)


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if body.email is not None:
        user.email = body.email
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.institution is not None:
        user.institution = body.institution
    if body.is_active is not None:
        user.is_active = body.is_active

    await log_action(db, current_user.id, "UPDATE_USER", detail={"target_user": user_id})
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.is_active = False
    await log_action(db, current_user.id, "DEACTIVATE_USER", detail={"target_user": user_id})
    return {"message": f"Usuario {user.full_name} desactivado"}


@router.get("/audit")
async def get_audit_log(
    page: int = 1,
    per_page: int = 50,
    action: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "report_id": str(log.report_id) if log.report_id else None,
                "ip_address": log.ip_address,
                "detail": log.detail,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    total_reports = await db.scalar(select(func.count(Report.id)))
    total_alerts = await db.scalar(select(func.count(Report.id)).where(Report.has_alert == True))
    total_firmados = await db.scalar(select(func.count(Report.id)).where(Report.status == "FIRMADO"))
    total_enviados = await db.scalar(select(func.count(Report.id)).where(Report.status == "ENVIADO"))
    total_users = await db.scalar(select(func.count(User.id)).where(User.is_active == True))

    return {
        "total_reports": total_reports,
        "total_alerts": total_alerts,
        "total_firmados": total_firmados,
        "total_enviados": total_enviados,
        "active_users": total_users,
    }


@router.get("/settings", response_model=ClinicSettingsOut)
async def get_clinic_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    """Retorna la configuración actual de la plantilla de informes."""
    result = await db.execute(select(ClinicSettings).where(ClinicSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        # Auto-create default row if missing
        settings = ClinicSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return ClinicSettingsOut.model_validate(settings)


@router.put("/settings", response_model=ClinicSettingsOut)
async def update_clinic_settings(
    body: ClinicSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Actualiza la configuración de la plantilla de informes (solo ADMIN)."""
    result = await db.execute(select(ClinicSettings).where(ClinicSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ClinicSettings(id=1)
        db.add(settings)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    await log_action(db, current_user.id, "UPDATE_SETTINGS")
    return ClinicSettingsOut.model_validate(settings)
