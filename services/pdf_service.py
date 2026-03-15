import io
import os
from datetime import datetime, timezone
from typing import Optional
from fpdf import FPDF
from models.report import Report
from models.user import User
from config import settings


class _ReportPDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Página {self.page_no()}", align="C")


def _safe(text: Optional[str], fallback: str = "—") -> str:
    if not text:
        return fallback
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _sex_label(sex: Optional[str]) -> str:
    return {"M": "Masculino", "F": "Femenino", "I": "Indeterminado"}.get(sex or "", "—")


async def generate_pdf(report: Report, user: User, clinic=None, worklist=None) -> bytes:
    """
    clinic : ClinicSettings instance (optional, falls back to defaults)
    worklist: Worklist instance (optional, for patient demographics)
    """
    inst_name = _safe(clinic.institution_name if clinic else "Centro de Imágenes Médicas")
    inst_subtitle = _safe(clinic.institution_subtitle if clinic else "Servicio de Radiología e Imágenes")
    report_title = _safe(clinic.report_title if clinic else "INFORME RADIOLÓGICO")
    footer_text = _safe(clinic.footer_text if clinic else None, fallback="")
    inst_address = _safe(clinic.address if clinic else None, fallback="")
    inst_phone = _safe(clinic.phone if clinic else None, fallback="")
    inst_email = _safe(clinic.email if clinic else None, fallback="")

    pdf = _ReportPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_margins(20, 15, 20)

    W = 170  # usable width

    # ── Institución ───────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(15, 30, 60)
    pdf.cell(W, 8, inst_name, ln=True)

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 110, 130)
    pdf.cell(W, 5, inst_subtitle, ln=True)

    # Datos de contacto de la institución (si existen)
    contact_parts = []
    if inst_address:
        contact_parts.append(inst_address)
    if inst_phone:
        contact_parts.append(f"Tel: {inst_phone}")
    if inst_email:
        contact_parts.append(inst_email)
    if contact_parts:
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(130, 140, 160)
        pdf.cell(W, 4, "  |  ".join(contact_parts), ln=True)

    pdf.ln(2)

    # Línea divisora
    pdf.set_draw_color(0, 180, 220)
    pdf.set_line_width(0.6)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(4)

    # ── Título ────────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(15, 30, 60)
    pdf.cell(W, 8, report_title, ln=True, align="C")
    pdf.ln(3)

    # ── Datos del paciente ────────────────────────────────────────────────────
    if worklist and (worklist.patient_name or worklist.patient_rut):
        pdf.set_fill_color(232, 244, 255)
        pdf.set_draw_color(180, 210, 240)
        pdf.set_line_width(0.3)

        # Calculate height based on available patient fields
        patient_rows = []
        if worklist.patient_name or worklist.patient_rut:
            patient_rows.append(("Paciente", _safe(worklist.patient_name), "RUT", _safe(worklist.patient_rut)))
        dob_str = worklist.patient_dob.strftime("%d/%m/%Y") if worklist.patient_dob else "—"
        patient_rows.append(("Fecha Nac.", dob_str, "Sexo", _sex_label(worklist.patient_sex)))
        if worklist.prevision:
            patient_rows.append(("Previsión", _safe(worklist.prevision), "", ""))

        box_h = len(patient_rows) * 7 + 4
        pdf.rect(20, pdf.get_y(), W, box_h, style="DF")
        y0p = pdf.get_y() + 3

        for i, (l1, v1, l2, v2) in enumerate(patient_rows):
            y_row = y0p + i * 7
            # left column
            pdf.set_xy(22, y_row)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(80, 100, 140)
            pdf.cell(22, 5, l1.upper() + ":", ln=False)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(10, 25, 55)
            pdf.cell(62, 5, v1, ln=False)
            # right column (if exists)
            if l2:
                pdf.set_xy(110, y_row)
                pdf.set_font("Helvetica", "B", 7.5)
                pdf.set_text_color(80, 100, 140)
                pdf.cell(22, 5, l2.upper() + ":", ln=False)
                pdf.set_font("Helvetica", "", 8.5)
                pdf.set_text_color(10, 25, 55)
                pdf.cell(58, 5, v2, ln=False)

        pdf.set_y(y0p + len(patient_rows) * 7)
        pdf.ln(3)

    # ── Datos del estudio ─────────────────────────────────────────────────────
    pdf.set_fill_color(240, 245, 252)
    pdf.set_draw_color(200, 210, 230)
    pdf.set_line_width(0.3)
    pdf.rect(20, pdf.get_y(), W, 22, style="DF")
    y0 = pdf.get_y() + 3

    def kv(label: str, value: str, x: float, y: float, w: float = 80):
        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(100, 110, 130)
        pdf.cell(28, 5, label.upper() + ":", ln=False)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(20, 35, 65)
        pdf.cell(w - 28, 5, _safe(value), ln=False)

    kv("Modalidad", report.modalidad or "—", 22, y0)
    kv("Accession", report.accession_number or "—", 110, y0)
    kv("Región", report.region_anatomica or "—", 22, y0 + 7)
    kv("Lateralidad", report.lateralidad or "—" if report.lateralidad not in (None, "NO_APLICA") else "—", 110, y0 + 7)
    kv("Fecha", datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"), 22, y0 + 14)
    kv("Estado", report.status, 110, y0 + 14)

    pdf.set_y(y0 + 22 + 2)
    pdf.ln(4)

    # ── Cuerpo del informe (sin etiqueta "TEXTO DEL INFORME") ─────────────────
    pdf.set_draw_color(0, 150, 200)
    pdf.set_line_width(0.3)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(3)

    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(20, 35, 65)
    texto = report.texto_final or "(Sin texto)"
    pdf.multi_cell(W, 5.5, _safe(texto))
    pdf.ln(4)

    # ── Datos Claude (si existen) ─────────────────────────────────────────────
    claude = report.claude_json or {}
    impresion = claude.get("impresion_diagnostica", [])
    if impresion:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(0, 150, 200)
        pdf.cell(W, 6, "IMPRESIÓN DIAGNÓSTICA", ln=True)
        pdf.set_line_width(0.3)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(3)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(20, 35, 65)
        for dx in impresion:
            diag = dx.get("diagnostico", "")
            certeza = dx.get("certeza", "")
            cie = dx.get("cie10_code", "")
            line = f"• {diag}"
            if certeza:
                line += f"  [{certeza}]"
            if cie:
                line += f"  CIE-10: {cie}"
            pdf.multi_cell(W, 5, _safe(line))
        pdf.ln(3)

    recomendaciones = claude.get("recomendaciones", {}).get("texto", [])
    if recomendaciones:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(0, 150, 200)
        pdf.cell(W, 6, "RECOMENDACIONES", ln=True)
        pdf.set_line_width(0.3)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(3)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(20, 35, 65)
        for rec in recomendaciones:
            pdf.multi_cell(W, 5, _safe(f"• {rec}"))
        pdf.ln(3)

    # ── Firma ─────────────────────────────────────────────────────────────────
    if report.status in ("FIRMADO", "ENVIADO"):
        pdf.ln(4)
        pdf.set_draw_color(180, 190, 210)
        pdf.set_line_width(0.3)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(4)

        signed_name = report.signed_by_name or user.full_name
        signed_date = ""
        if report.signed_at:
            signed_date = report.signed_at.strftime("%d/%m/%Y %H:%M")

        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(20, 35, 65)
        pdf.cell(W, 5, _safe(f"Aprobado por: {signed_name}"), ln=True, align="R")
        if signed_date:
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(100, 110, 130)
            pdf.cell(W, 5, f"Fecha de aprobación: {signed_date}", ln=True, align="R")

        if user.firma_url and os.path.exists(user.firma_url):
            try:
                pdf.image(user.firma_url, x=140, y=pdf.get_y() - 2, w=30)
            except Exception:
                pass

    # ── Pie de institución ────────────────────────────────────────────────────
    if footer_text:
        pdf.set_y(-25)
        pdf.set_draw_color(200, 210, 230)
        pdf.set_line_width(0.3)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(2)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(150, 160, 175)
        pdf.multi_cell(W, 4, footer_text, align="C")

    return pdf.output()


async def save_pdf(report_id: str, pdf_bytes: bytes) -> str:
    os.makedirs(settings.pdf_output_dir, exist_ok=True)
    filename = f"informe_{report_id}.pdf"
    filepath = os.path.join(settings.pdf_output_dir, filename)
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)
    return filepath
