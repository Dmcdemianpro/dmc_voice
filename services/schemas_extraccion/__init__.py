"""
Schemas de extracción por modalidad/región.
Auto-construye EXTRACTION_SCHEMAS desde los módulos individuales.
"""
from services.schemas_extraccion.tc_cerebro import SCHEMA as _tc_cerebro_schema
from services.schemas_extraccion.generico import GENERIC_EXTRACTION_SCHEMA

EXTRACTION_SCHEMAS: dict[str, dict[str, str]] = {
    "TC": {
        "Cerebro": _tc_cerebro_schema,
    }
}


def has_extraction_schema(modality: str, region: str) -> bool:
    """Verifica si existe schema de extracción para la combinación modalidad/región."""
    return modality in EXTRACTION_SCHEMAS and region in EXTRACTION_SCHEMAS[modality]


def get_extraction_schema(modality: str, region: str) -> str:
    """Retorna el schema de extracción, o el genérico si no hay específico."""
    if modality in EXTRACTION_SCHEMAS and region in EXTRACTION_SCHEMAS[modality]:
        return EXTRACTION_SCHEMAS[modality][region]
    return GENERIC_EXTRACTION_SCHEMA
