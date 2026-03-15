import httpx
import json
from datetime import datetime, timezone
from config import settings


def build_hl7_oru(fhir_report: dict, patient_data: dict = None) -> str:
    """Construye un mensaje HL7 v2 ORU^R01 a partir de un recurso FHIR DiagnosticReport."""
    now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    msg_id = f"RISV{now}"

    loinc_code = ""
    loinc_display = ""
    if fhir_report.get("code", {}).get("coding"):
        coding = fhir_report["code"]["coding"][0]
        loinc_code = coding.get("code", "")
        loinc_display = coding.get("display", "")

    conclusion = (fhir_report.get("conclusion") or "").replace("\n", "\\n")
    report_id = fhir_report.get("id", "")

    patient_id = ""
    patient_name = ""
    if patient_data:
        patient_id = patient_data.get("rut", "")
        patient_name = patient_data.get("full_name", "")

    segments = [
        f"MSH|^~\\&|RISVOICEAI|DMCPROJECTS|RIS|HOSPITAL|{now}||ORU^R01|{msg_id}|P|2.5|||NE|NE||UNICODE UTF-8",
        f"PID|1||{patient_id}|||{patient_name}||||||",
        f"OBR|1||{report_id}|{loinc_code}^{loinc_display}^LN|||{now}|||||||||||||{now}|||F",
        f"OBX|1|FT|11526-1^Pathology study^LN||{conclusion}||||||F|||{now}",
    ]

    alerta = fhir_report.get("_alerta_critica", {})
    if alerta and alerta.get("activa"):
        segments.append(f"NTE|1|L|ALERTA CRITICA: {alerta.get('descripcion', '')}")

    return "\r".join(segments)


async def send_to_mirth(fhir_report: dict, patient_data: dict = None) -> str:
    """Envía el informe a Mirth Connect y retorna el ACK HL7."""
    hl7_message = build_hl7_oru(fhir_report, patient_data)

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        response = await client.post(
            f"{settings.mirth_url}/channels/RISVOICE/messages",
            content=hl7_message,
            headers={"Content-Type": "application/hl7-v2; charset=UTF-8"},
        )
        response.raise_for_status()
        return response.text
