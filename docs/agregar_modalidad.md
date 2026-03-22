# Cómo agregar una nueva modalidad/región al pipeline

## Paso 1: Schema de extracción

Crear archivo `services/schemas_extraccion/<modalidad>_<region>.py`:

```python
"""Schema de extracción para <Modalidad> <Región>."""

SCHEMA = """{
  "hallazgo_principal": "normal | ...",
  "descripcion_hallazgo": "...",
  "localizacion": "...",
  "lateralidad": "derecho | izquierdo | bilateral | no descrito",
  "hallazgos_secundarios": ["..."],
  "confianza_global": "alta | media | baja",
  "limitaciones": ["..."],
  "evidencia_textual": ["..."]
}"""
```

Luego agregar al dict en `services/schemas_extraccion/__init__.py`:

```python
from services.schemas_extraccion.<modulo> import SCHEMA as _nuevo_schema

EXTRACTION_SCHEMAS["<MODALIDAD>"]["<Región>"] = _nuevo_schema
```

## Paso 2: Clasificador

Crear archivo `services/clasificadores/<modalidad>_<region>.py`:

```python
from services.clasificacion_registry import register_classifier

@register_classifier("<MODALIDAD>", "<Región>")
def classify_<modalidad>_<region>(findings: dict) -> str:
    # Lógica de clasificación
    ...
```

Agregar import en `services/clasificadores/__init__.py`:

```python
from services.clasificadores import <modalidad>_<region>  # noqa: F401
```

## Paso 3: Plantillas de categoría

Crear archivo `services/plantillas_categoria/<modalidad>_<region>.py`:

```python
TEMPLATES: dict[str, str] = {
    "normal": """...""",
    "hallazgo_1": """...""",
    "indeterminado": """...""",
    "_limitado": """...""",
}
```

Agregar al dict en `services/plantillas_categoria/__init__.py`:

```python
from services.plantillas_categoria.<modulo> import TEMPLATES as _nuevo_templates

CATEGORY_TEMPLATES["<MODALIDAD>"]["<Región>"] = _nuevo_templates
```

## Paso 4: Tests

Crear `tests/test_<modalidad>_<region>.py` con tests unitarios para:
- Schema: campos requeridos presentes
- Clasificador: mapeo correcto de categorías
- Plantillas: todas las categorías tienen plantilla
- Integración: `classify_for_modality()` retorna resultado esperado

## Paso 5: Verificar

```bash
python tests/test_clasificacion_registry.py
python tests/test_asistrad_pipeline.py
python tests/test_dicom_analysis.py
```
