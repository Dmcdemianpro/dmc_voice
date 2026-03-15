from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from middleware.auth_middleware import get_current_user
from models.user import User
from services import whisper_service

router = APIRouter(prefix="/api/v1", tags=["transcription"])


@router.post("/transcribe-whisper")
async def transcribe_whisper(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Recibe un blob de audio y lo envía a la VM de Whisper para transcripción."""
    if audio.content_type not in ("audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg"):
        raise HTTPException(status_code=400, detail="Formato de audio no soportado")

    audio_bytes = await audio.read()
    if len(audio_bytes) > 50 * 1024 * 1024:  # 50MB max
        raise HTTPException(status_code=413, detail="Audio demasiado grande (máx 50MB)")

    try:
        text = await whisper_service.transcribe_audio(audio_bytes, audio.filename or "audio.webm")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error en servicio Whisper: {str(e)}")

    return {"text": text}
