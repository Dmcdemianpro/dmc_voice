"""
Plantillas de categoría por modalidad/región.
Auto-construye CATEGORY_TEMPLATES desde los módulos individuales.
"""
from services.plantillas_categoria.tc_cerebro import TEMPLATES as _tc_cerebro_templates

CATEGORY_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "TC": {
        "Cerebro": _tc_cerebro_templates,
    }
}


def get_category_template(modality: str, region: str, category: str) -> str:
    """Selecciona la plantilla correcta para la categoría dada.

    Si no existe plantilla para la categoría, retorna la de 'indeterminado'.
    Si no existe ninguna plantilla para la modalidad/región, retorna cadena vacía.
    """
    mod_templates = CATEGORY_TEMPLATES.get(modality, {})
    reg_templates = mod_templates.get(region, {})
    template = reg_templates.get(category)
    if template:
        return template
    return reg_templates.get("indeterminado", "")
