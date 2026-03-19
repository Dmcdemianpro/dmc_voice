from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import engine
from models import user, report, worklist, audit, feedback, asistrad, pacs as pacs_models  # noqa: F401 — ensure models are registered
from database import Base

from routers import auth, dictation, transcribe, reports, worklist as worklist_router, admin, patients, feedback, asistrad, pacs


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if not exist (development only)
    if settings.app_env == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="RIS Voice AI API",
    description="Sistema de Reconocimiento de Voz para Radiología e Imagenología — DMC Projects SPA",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(auth.router)
app.include_router(dictation.router)
app.include_router(transcribe.router)
app.include_router(reports.router)
app.include_router(worklist_router.router)
app.include_router(admin.router)
app.include_router(patients.router)
app.include_router(feedback.router)
app.include_router(asistrad.router)
app.include_router(pacs.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "RIS Voice AI", "version": "1.0.0"}
