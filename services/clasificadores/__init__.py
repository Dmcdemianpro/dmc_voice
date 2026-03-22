"""
Clasificadores por modalidad/región.
Auto-importa todos los módulos para que los decoradores @register_classifier se ejecuten.
"""
from services.clasificadores import tc_cerebro  # noqa: F401
