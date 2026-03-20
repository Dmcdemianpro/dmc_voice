from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import hashlib
import uuid

from database import get_db
from models.user import User, RefreshToken
from schemas.auth import UserCreate, UserLogin, UserOut, TokenResponse, RefreshRequest, UserUpdate
from middleware.auth_middleware import get_current_user, require_roles
from middleware.audit_middleware import log_action
from config import settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_ttl_minutes)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> tuple[str, str]:
    raw = str(uuid.uuid4())
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


@router.get("/validate")
async def validate_token(request: Request):
    """Lightweight JWT validation for nginx auth_request.
    Reads X-Auth-Token header, validates signature + expiration (no DB query).
    Returns 200 with user info headers if valid, 401 if invalid."""
    token = request.headers.get("X-Auth-Token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return Response(
        status_code=200,
        headers={"X-User-Id": user_id, "X-User-Role": payload.get("role", "")},
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.rut == body.rut))
    user = result.scalar_one_or_none()

    if not user or not pwd_context.verify(body.password, user.hashed_pw):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="RUT o contraseña incorrectos")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva")

    # Actualizar last_login
    user.last_login = datetime.now(timezone.utc)

    # Crear refresh token
    raw_rt, hashed_rt = create_refresh_token()
    rt = RefreshToken(
        user_id=user.id,
        token_hash=hashed_rt,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_ttl_days),
    )
    db.add(rt)
    await db.commit()

    await log_action(db, user.id, "LOGIN", ip_address=request.client.host, user_agent=request.headers.get("user-agent"))

    access_token = create_access_token(str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=raw_rt, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    hashed = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hashed,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido o expirado")

    rt.revoked = True  # Rotate token

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()

    raw_new, hashed_new = create_refresh_token()
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=hashed_new,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_ttl_days),
    )
    db.add(new_rt)
    await db.commit()

    access_token = create_access_token(str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=raw_new, user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    hashed = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hashed))
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked = True
    return {"message": "Sesión cerrada correctamente"}


@router.post("/register", response_model=UserOut)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_roles("ADMIN"))):
    existing = await db.execute(select(User).where(User.rut == body.rut))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El RUT ya está registrado")

    user = User(
        rut=body.rut,
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        hashed_pw=pwd_context.hash(body.password),
        institution=body.institution,
    )
    db.add(user)
    await db.flush()
    await log_action(db, current_user.id, "CREATE_USER", detail={"new_user_rut": body.rut})
    return UserOut.model_validate(user)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
