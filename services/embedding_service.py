"""
Servicio de embeddings para Few-Shot Learning.

Genera vectores 384-dim con sentence-transformers sobre los transcripts
y realiza búsqueda por similitud coseno para encontrar los N ejemplos
más parecidos a un nuevo dictado.

Modelo: paraphrase-multilingual-MiniLM-L12-v2
  - Soporta español nativo
  - 384 dimensiones (ligero, rápido)
  - Bueno para búsqueda semántica en textos médicos
"""
import logging
from typing import List, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Lazy loading: el modelo se carga la primera vez que se usa (evita tiempo de arranque)
_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
            logger.info("SentenceTransformer cargado correctamente")
        except ImportError:
            logger.warning(
                "sentence-transformers no instalado. "
                "Instala con: pip install sentence-transformers"
            )
            return None
    return _model


def generate_embedding(text: str) -> Optional[List[float]]:
    """
    Genera un embedding 384-dim para el texto dado.
    Retorna None si sentence-transformers no está instalado.
    """
    model = _get_model()
    if model is None:
        return None
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Similitud coseno entre dos vectores (ya normalizados → producto punto)."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    return float(np.dot(va, vb))


def find_similar(
    query_embedding: List[float],
    candidates: List[dict],   # [{"id": ..., "embedding": [...], "transcript": ..., "corrected_text": ..., ...}]
    top_n: int = 5,
    min_similarity: float = 0.60,
) -> List[dict]:
    """
    Busca los top_n candidatos más similares al query_embedding.

    Args:
        query_embedding: embedding del nuevo transcript
        candidates: lista de training examples con su embedding
        top_n: cuántos ejemplos retornar
        min_similarity: filtro mínimo de similitud coseno

    Returns:
        Lista ordenada de candidatos con campo 'similarity_score'
    """
    scored = []
    for c in candidates:
        emb = c.get("embedding")
        if not emb:
            continue
        score = cosine_similarity(query_embedding, emb)
        if score >= min_similarity:
            scored.append({**c, "similarity_score": round(score, 4)})

    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored[:top_n]


def format_fewshot_examples(examples: List[dict]) -> str:
    """
    Formatea los ejemplos similares para inyectarlos en el mensaje de usuario a Claude.
    Se inyectan en el user message (NO en el system prompt) para no invalidar el caché.
    """
    if not examples:
        return ""

    lines = [
        "=== EJEMPLOS DE INFORMES VALIDADOS (referencia de estilo y terminología) ===",
        f"Los siguientes {len(examples)} informes fueron validados y firmados por radiólogos.",
        "Úsalos como guía de formato, vocabulario médico y nivel de detalle.\n",
    ]
    for i, ex in enumerate(examples, 1):
        sim = ex.get("similarity_score", 0)
        modalidad = ex.get("modalidad", "")
        region = ex.get("region_anatomica", "")
        header = f"[Ejemplo {i} | similitud: {sim:.0%}"
        if modalidad:
            header += f" | {modalidad}"
        if region:
            header += f" | {region}"
        header += "]"

        lines.append(header)
        lines.append(f"DICTADO:\n{ex.get('transcript', '')}\n")
        lines.append(f"INFORME VALIDADO:\n{ex.get('corrected_text', '')}\n")
        lines.append("---")

    lines.append("=== FIN EJEMPLOS ===\n")
    return "\n".join(lines)
