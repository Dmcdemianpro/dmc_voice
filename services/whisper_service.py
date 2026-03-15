import httpx
from config import settings


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Envía el audio a la VM de Whisper y retorna la transcripción."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.whisper_url}/transcribe",
            files={"audio": (filename, audio_bytes, "audio/webm")},
            data={"language": "es"},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("text", "")
