from sqlalchemy.ext.asyncio import AsyncSession
from models.audit import AuditLog
import uuid
from typing import Optional


async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID,
    action: str,
    report_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    detail: Optional[dict] = None,
):
    entry = AuditLog(
        user_id=user_id,
        action=action,
        report_id=report_id,
        ip_address=ip_address,
        user_agent=user_agent,
        detail=detail or {},
    )
    db.add(entry)
    # No commit here — commit is handled by the request lifecycle in get_db()
