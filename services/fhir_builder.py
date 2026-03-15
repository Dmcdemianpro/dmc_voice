from datetime import datetime, timezone


def build_fhir_diagnostic_report(claude_result: dict, report_id: str = None) -> dict:
    """Construye un recurso FHIR R4 DiagnosticReport a partir del resultado de Claude."""
    estudio = claude_result.get("estudio", {})
    hallazgos = claude_result.get("hallazgos", [])
    diagnosticos = claude_result.get("impresion_diagnostica", [])
    texto_final = claude_result.get("texto_informe_final", "")

    loinc_code = estudio.get("modalidad_loinc", "")
    modalidad = estudio.get("modalidad", "")

    conclusion_codes = []
    for dx in diagnosticos:
        if dx.get("snomed_code"):
            conclusion_codes.append({
                "coding": [{
                    "system": "http://snomed.info/sct",
                    "code": dx["snomed_code"],
                    "display": dx.get("snomed_display", dx.get("diagnostico", "")),
                }]
            })

    fhir = {
        "resourceType": "DiagnosticReport",
        "meta": {
            "profile": [
                "https://hl7chile.cl/fhir/ig/clcore/StructureDefinition/DiagnosticReport-cl"
            ]
        },
        "status": "final",
        "category": [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                "code": "RAD",
                "display": "Radiology",
            }]
        }],
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": loinc_code,
                "display": modalidad,
            }]
        },
        "effectiveDateTime": datetime.now(timezone.utc).isoformat(),
        "conclusion": texto_final,
        "conclusionCode": conclusion_codes,
    }

    if report_id:
        fhir["id"] = report_id

    # Adjuntar alerta crítica como extensión si aplica
    alerta = claude_result.get("alerta_critica", {})
    if alerta.get("activa"):
        fhir["_alerta_critica"] = alerta

    return fhir
