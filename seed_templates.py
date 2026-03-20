"""
Seed initial radiological templates for AsistRad module.
Run: python seed_templates.py
"""
import asyncio
import uuid
from sqlalchemy import select
from database import AsyncSessionLocal
from models.user import User
from models.asistrad import RadTemplate, RadTemplateVersion

TEMPLATES = [
    {
        "modality": "TC",
        "region": "Cerebro",
        "name": "TC Cerebro sin contraste",
        "description": "Plantilla estándar para tomografía computada de cerebro sin contraste endovenoso",
        "template_text": """INFORME TC DE CEREBRO SIN CONTRASTE

TÉCNICA:
Se realiza estudio de tomografía computada de cerebro sin administración de medio de contraste endovenoso, con cortes axiales de {{grosor}} mm de espesor.

HALLAZGOS:

Parénquima cerebral:
- Morfología y densidad del parénquima cerebral supra e infratentorial {{hallazgos_parenquima}}.
- Sistema ventricular de tamaño y configuración {{ventrículos}}.
- Surcos y cisuras de aspecto {{surcos}}.

Línea media:
- Estructuras de la línea media {{linea_media}}.

Fosa posterior:
- Cerebelo y tronco encefálico de aspecto {{fosa_posterior}}.

Estructuras óseas:
- Calota y base de cráneo {{hueso}}.

Otros:
- {{otros_hallazgos}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "TC",
        "region": "Tórax",
        "name": "TC Tórax con contraste",
        "description": "Plantilla estándar para TC de tórax con contraste EV",
        "template_text": """INFORME TC DE TÓRAX CON CONTRASTE

TÉCNICA:
Se realiza estudio de tomografía computada de tórax con administración de medio de contraste endovenoso, con cortes axiales de {{grosor}} mm.

HALLAZGOS:

Mediastino:
- {{mediastino}}

Parénquima pulmonar:
- Pulmón derecho: {{pulmon_derecho}}
- Pulmón izquierdo: {{pulmon_izquierdo}}

Vía aérea:
- Tráquea y bronquios principales {{via_aerea}}.

Pleura:
- {{pleura}}

Grandes vasos:
- Aorta torácica {{aorta}}.
- Arteria pulmonar {{arteria_pulmonar}}.

Pared torácica:
- {{pared_toracica}}

Estructuras óseas:
- {{hueso}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "TC",
        "region": "Abdomen y Pelvis",
        "name": "TC Abdomen y Pelvis con contraste",
        "description": "Plantilla estándar para TC de abdomen y pelvis con contraste oral y EV",
        "template_text": """INFORME TC DE ABDOMEN Y PELVIS CON CONTRASTE

TÉCNICA:
Se realiza estudio de tomografía computada de abdomen y pelvis con administración de medio de contraste oral y endovenoso, con cortes axiales de {{grosor}} mm.

HALLAZGOS:

Hígado:
- {{higado}}

Vesícula y vía biliar:
- {{vesicula_biliar}}

Páncreas:
- {{pancreas}}

Bazo:
- {{bazo}}

Riñones y suprarrenales:
- Riñón derecho: {{rinon_derecho}}
- Riñón izquierdo: {{rinon_izquierdo}}
- Glándulas suprarrenales: {{suprarrenales}}

Aorta abdominal:
- {{aorta}}

Intestino:
- {{intestino}}

Pelvis:
- Vejiga: {{vejiga}}
- {{organos_pelvicos}}

Peritoneo y retroperitoneo:
- {{peritoneo}}

Adenopatías:
- {{adenopatias}}

Estructuras óseas:
- {{hueso}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "RM",
        "region": "Cerebro",
        "name": "RM Cerebro con y sin contraste",
        "description": "Plantilla estándar para resonancia magnética cerebral",
        "template_text": """INFORME RM DE CEREBRO

TÉCNICA:
Se realiza estudio de resonancia magnética de cerebro con secuencias {{secuencias}}, sin y con administración de gadolinio endovenoso.

HALLAZGOS:

Parénquima cerebral:
- Señal del parénquima cerebral supra e infratentorial {{senal_parenquima}}.
- No se observan lesiones focales con restricción en difusión {{difusion}}.
- Tras la administración de gadolinio {{realce}}.

Sistema ventricular:
- {{ventriculos}}

Surcos y cisuras:
- {{surcos}}

Línea media:
- {{linea_media}}

Silla turca:
- Hipófisis {{hipofisis}}.

Fosa posterior:
- Cerebelo {{cerebelo}}.
- Tronco encefálico {{tronco}}.

Espectroscopía (si aplica):
- {{espectroscopia}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "RM",
        "region": "Columna Lumbar",
        "name": "RM Columna Lumbar",
        "description": "Plantilla estándar para RM de columna lumbosacra",
        "template_text": """INFORME RM DE COLUMNA LUMBAR

TÉCNICA:
Se realiza estudio de resonancia magnética de columna lumbosacra con secuencias {{secuencias}} en planos sagital y axial.

HALLAZGOS:

Alineación:
- {{alineacion}}

Cuerpos vertebrales:
- {{cuerpos_vertebrales}}

Discos intervertebrales:
- L1-L2: {{l1l2}}
- L2-L3: {{l2l3}}
- L3-L4: {{l3l4}}
- L4-L5: {{l4l5}}
- L5-S1: {{l5s1}}

Canal raquídeo:
- {{canal_raquideo}}

Médula y cono medular:
- {{cono_medular}}

Articulaciones facetarias:
- {{facetarias}}

Partes blandas paravertebrales:
- {{partes_blandas}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "RM",
        "region": "Rodilla",
        "name": "RM Rodilla",
        "description": "Plantilla estándar para RM de rodilla",
        "template_text": """INFORME RM DE RODILLA {{lateralidad}}

TÉCNICA:
Se realiza estudio de resonancia magnética de rodilla {{lateralidad}} con secuencias {{secuencias}} en planos sagital, coronal y axial.

HALLAZGOS:

Meniscos:
- Menisco medial: {{menisco_medial}}
- Menisco lateral: {{menisco_lateral}}

Ligamentos cruzados:
- LCA: {{lca}}
- LCP: {{lcp}}

Ligamentos colaterales:
- LCM: {{lcm}}
- LCL: {{lcl}}

Cartílago articular:
- {{cartilago}}

Superficie ósea:
- Fémur: {{femur}}
- Tibia: {{tibia}}
- Rótula: {{rotula}}

Tendones:
- Tendón rotuliano: {{tendon_rotuliano}}
- Tendón cuadricipital: {{tendon_cuadricipital}}

Líquido articular:
- {{liquido}}

Partes blandas:
- {{partes_blandas}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "RX",
        "region": "Tórax",
        "name": "RX Tórax PA y Lateral",
        "description": "Plantilla estándar para radiografía de tórax",
        "template_text": """INFORME RADIOGRAFÍA DE TÓRAX PA Y LATERAL

TÉCNICA:
Se realiza estudio radiográfico de tórax en proyecciones PA y lateral en bipedestación.

HALLAZGOS:

Parénquima pulmonar:
- {{parenquima_pulmonar}}

Silueta cardíaca:
- {{silueta_cardiaca}}
- Índice cardiotorácico: {{ict}}

Mediastino:
- {{mediastino}}

Hilios pulmonares:
- {{hilios}}

Diafragma:
- {{diafragma}}

Senos costofrénicos:
- {{senos_costofrenicos}}

Estructuras óseas:
- {{hueso}}

Partes blandas:
- {{partes_blandas}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    {
        "modality": "ECO",
        "region": "Abdomen",
        "name": "Ecografía Abdominal",
        "description": "Plantilla estándar para ecografía abdominal completa",
        "template_text": """INFORME ECOGRAFÍA ABDOMINAL

TÉCNICA:
Se realiza estudio ecográfico abdominal con transductor convexo de {{frecuencia}} MHz.

HALLAZGOS:

Hígado:
- Tamaño {{tamano_higado}}.
- Ecogenicidad {{ecogenicidad_higado}}.
- {{lesiones_higado}}

Vesícula biliar:
- {{vesicula}}

Vía biliar:
- Colédoco {{coledoco}}.

Páncreas:
- {{pancreas}}

Bazo:
- {{bazo}}

Riñón derecho:
- Tamaño: {{tamano_rd}} cm.
- {{rinon_derecho}}

Riñón izquierdo:
- Tamaño: {{tamano_ri}} cm.
- {{rinon_izquierdo}}

Aorta abdominal:
- {{aorta}}

Líquido libre:
- {{liquido_libre}}

IMPRESIÓN DIAGNÓSTICA:
{{impresion}}

RECOMENDACIONES:
{{recomendaciones}}""",
    },
    # ── Neurología / Neurorradiología ─────────────────────────────────────────
    {
        "modality": "TC",
        "region": "Encéfalo",
        "name": "TC Encéfalo Normal",
        "description": "Plantilla para TC de encéfalo sin hallazgos patológicos agudos",
        "template_text": """No se cuenta con estudios previos para comparar.

Troncoencéfalo y cerebelo sin lesiones focales.
Sistema ventricular supratentorial de morfología y dimensiones normales.
Encéfalo de densitometría conservada.
No se aprecia desplazamiento de estructuras de línea media.
No hay focos hemorrágicos intraparenquimatosos, presencia de HSA ni colecciones yuxtadurales.
En ventana ósea no se evidencian imágenes craneales de aspecto sospechoso.

No se identifica compromisos agudos del encéfalo con la presente técnica.""",
    },
    {
        "modality": "TC",
        "region": "Encéfalo",
        "name": "TC Encéfalo Patológico",
        "description": "Plantilla para TC de encéfalo con hallazgos de leucoaraiosis y ateromatosis",
        "template_text": """No se cuenta con estudios previos para comparar.

Troncoencéfalo y cerebelo sin lesiones focales.
Sistema ventricular supratentorial {{ventriculos}}.
No se aprecia desplazamiento de estructuras de línea media.
{{hallazgos_parenquima}}.
No se identifica presencia de focos hemorrágicos, HSA ni colecciones yuxtadurales.
{{hallazgos_vasculares}}.
En ventana ósea no se evidencian imágenes craneales de aspecto sospechoso.

{{impresion}}.""",
    },
    {
        "modality": "TC",
        "region": "Angiotac cerebral",
        "name": "AngioTC Cerebral Normal",
        "description": "Plantilla para angiografía por TC cerebral sin hallazgos patológicos",
        "template_text": """Cayado aórtico y vasos supraaórticos en límites normales.
Bulbos carotídeos de aspecto normal sin placas parietales evidentes.
Arterias vertebrales de origen trayecto y calibre normales en todos sus segmentos cervicales.
Segmentos intracavernosos de ambas ACI de aspecto en límites normales.
Polígono de Willis sin dilataciones aneurismáticas.
Ramas troncales de las ACA, ACM y ACP de aspecto en límites normales.
Segmento V4 de a. vertebrales y arteria basilar en límites normales.
Senos venosos no evidencian signos de trombosis.

No se identifican compromisos vasculares agudos al momento del estudio.
No hay imágenes de aneurismas, trombosis, disecciones ni malformaciones vasculares.""",
    },
    {
        "modality": "TC",
        "region": "Angiotac cerebral",
        "name": "AngioTC Cerebral Patológico",
        "description": "Plantilla para angiografía por TC cerebral con ateromatosis",
        "template_text": """{{hallazgos_cayado}} a nivel de cayado aórtico, proyectadas a vasos supraaórticos.
Bulbos carotídeos {{bulbos}}.
Arterias vertebrales de origen trayecto y calibre normales en todos sus segmentos cervicales.
{{hallazgos_aci}}.
Polígono de Willis sin dilataciones aneurismáticas.
Ramas troncales de las ACA, ACM y ACP de aspecto en límites normales.
Segmento V4 de a. vertebrales y arteria basilar en límites normales.
Senos venosos no evidencian signos de trombosis.

{{impresion}}.
No hay imágenes de aneurismas, trombosis, disecciones ni malformaciones vasculares.""",
    },
    {
        "modality": "TC",
        "region": "Macizo Facial",
        "name": "TC Macizo Facial",
        "description": "Plantilla para TC de macizo facial evaluación de fracturas",
        "template_text": """Globos oculares, grasa retrobulbar, musculatura extrínseca y nervios ópticos de densitometría y morfología conservadas.
Las paredes orbitarias sin soluciones de continuidad que sugieran fracturas.
SPN bien neumatizados sin imágenes de fracturas parietales óseas.
Maxilar inferior, maxilares superiores, huesos malares, frontal, esfenoidal y huesos propios nasales sin fracturas.

No se identifican fracturas óseas en macizo facial.""",
    },
    {
        "modality": "TC",
        "region": "Columna",
        "name": "TC Columna Normal",
        "description": "Plantilla para TC de columna sin hallazgos patológicos",
        "template_text": """Cuerpos vertebrales de altura conservada y adecuado alineamiento de muros posteriores.
Los discos intervertebrales de densitometría y altura habitual sin imágenes de protrusiones ni herniaciones.
Arcos posteriores de conformación habitual.
Articulaciones facetarias de características en límites normales.
Neuroforaminas de amplitud normal sin conflictos de espacio radiculares.
No hay raquiestenosis.

No se identifican fracturas vertebrales en el segmento evaluado.""",
    },
    {
        "modality": "TC",
        "region": "Oídos",
        "name": "TC Oídos Normal",
        "description": "Plantilla para TC de oídos sin hallazgos patológicos",
        "template_text": """Conductos auditivos externos de trayecto y calibre en límites normales.
En oídos medios, cajas timpánicas bien neumatizadas, cadenas osiculares y escutum sin erosiones.
Espacios de Prussak de aspecto normal.
Áticos, antros y celdillas mastoideas de radiotransparencia conservada.
Tegmen timpani sin alteraciones.
A nivel de oídos internos, ambos laberintos óseos impresionan de conformación normal.
Cócleas, conductos semicirculares, y trayectos de nervios faciales de aspecto normal.
Conductos auditivos internos se observan de características normales sin erosiones óseas.

Estudio de oídos sin hallazgos de significado patológico.""",
    },
    {
        "modality": "TC",
        "region": "Silla Turca",
        "name": "TC Silla Turca - Hipófisis",
        "description": "Plantilla para TC de silla turca con contraste",
        "template_text": """La silla turca de morfología y dimensiones normales, sin erosiones óseas localizadas. Tallo hipofisiario en posición central junto al dorso sellar. Senos cavernosos sin alteraciones.
Tras la administración de medio de contraste se observa un refuerzo glandular homogéneo, intraselar, con bordes superiores ligeramente cóncavos en ambos lados. Estructuras paraselares e hipotalámicas de morfología conservada.
Cisterna supraselar dentro de límites normales.
Vasos visibles del círculo arterial cerebral no evidencian alteraciones.

Estudio de silla turca sin hallazgos de significado patológico.""",
    },
    {
        "modality": "TC",
        "region": "Órbitas",
        "name": "TC Órbitas Normal",
        "description": "Plantilla para TC de órbitas sin hallazgos patológicos",
        "template_text": """Globos oculares simétricos, alineados, con cristalinos, escleras y humor vítreo de densitometría en límites normales.
Musculatura extrínseca y nervios ópticos de características morfológicas normales.
No hay imágenes de sustitución de grasa retrobulbar.
Paredes orbitarias de contornos regulares.
Glándulas lagrimales de aspecto normal.

Estudio de órbitas sin hallazgos significativos.""",
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # Get first admin user as creator
        result = await db.execute(
            select(User).where(User.role == "ADMIN", User.is_active == True).limit(1)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            print("ERROR: No hay usuario ADMIN activo. Crea uno primero.")
            return

        created = 0
        for tpl in TEMPLATES:
            # Check if template already exists
            existing = await db.execute(
                select(RadTemplate).where(
                    RadTemplate.modality == tpl["modality"],
                    RadTemplate.region == tpl["region"],
                    RadTemplate.name == tpl["name"],
                )
            )
            if existing.scalar_one_or_none():
                print(f"  SKIP: {tpl['name']} (ya existe)")
                continue

            template = RadTemplate(
                modality=tpl["modality"],
                region=tpl["region"],
                name=tpl["name"],
                description=tpl["description"],
                template_text=tpl["template_text"],
                created_by=admin.id,
            )
            db.add(template)
            await db.flush()

            # Create initial version
            version = RadTemplateVersion(
                template_id=template.id,
                version_number=1,
                template_text=tpl["template_text"],
            )
            db.add(version)
            created += 1
            print(f"  OK: {tpl['name']}")

        await db.commit()
        print(f"\nSeed completado: {created} plantillas creadas.")


if __name__ == "__main__":
    asyncio.run(seed())
