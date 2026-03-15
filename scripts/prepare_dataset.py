#!/usr/bin/env python3
"""
Prepara el dataset de entrenamiento para fine-tuning de Whisper.

Exporta los training_examples validados desde PostgreSQL al formato
HuggingFace datasets, listo para fine-tuning con transformers.

Uso:
  python scripts/prepare_dataset.py --output ./dataset --min-quality 0.7
  python scripts/prepare_dataset.py --output ./dataset --validated-only
"""
import asyncio
import argparse
import json
import os
import sys
from pathlib import Path

# Agrega el directorio raíz al path
sys.path.insert(0, str(Path(__file__).parent.parent))


async def export_dataset(output_dir: str, min_quality: float, validated_only: bool):
    from database import AsyncSessionLocal
    from models.feedback import TrainingExample
    from sqlalchemy import select

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    async with AsyncSessionLocal() as db:
        q = select(TrainingExample).where(TrainingExample.used_for_finetune == True)
        if validated_only:
            q = q.where(TrainingExample.is_validated == True)
        if min_quality > 0:
            q = q.where(TrainingExample.quality_score >= min_quality)

        result = await db.execute(q)
        examples = result.scalars().all()

    if not examples:
        print("⚠️  No hay training examples que cumplan los filtros.")
        print("   Necesitas al menos ~50 pares para un fine-tuning útil (ideal 500+).")
        return

    print(f"✅ {len(examples)} ejemplos encontrados")

    # Formato JSONL para HuggingFace
    # Cada línea: {"transcript": "...", "corrected_text": "...", "modalidad": "...", ...}
    train_path = Path(output_dir) / "train.jsonl"
    eval_path  = Path(output_dir) / "eval.jsonl"

    # 90% train / 10% eval
    split = max(1, int(len(examples) * 0.9))
    train_examples = examples[:split]
    eval_examples  = examples[split:]

    def write_jsonl(path: Path, items):
        with open(path, "w", encoding="utf-8") as f:
            for ex in items:
                record = {
                    "id": str(ex.id),
                    "transcript": ex.transcript,
                    "corrected_text": ex.corrected_text,
                    "modalidad": ex.modalidad or "",
                    "region_anatomica": ex.region_anatomica or "",
                    "quality_score": ex.quality_score or 0.0,
                    # Formato Whisper fine-tuning: "audio_path" sería el path al .wav
                    # Por ahora exportamos solo el texto; el audio requiere el .wav original
                    "audio_path": None,
                    # Para few-shot / instrucción:
                    "prompt": f"Dictado radiólogo:\n{ex.transcript}",
                    "completion": ex.corrected_text,
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    write_jsonl(train_path, train_examples)
    write_jsonl(eval_path,  eval_examples)

    # Dataset card
    card_path = Path(output_dir) / "README.md"
    with open(card_path, "w") as f:
        f.write(f"""# RIS Voice — Dataset de Informes Radiológicos

Generado automáticamente desde correction_pairs validados.

## Estadísticas
- Total ejemplos: {len(examples)}
- Train: {len(train_examples)}
- Eval:  {len(eval_examples)}
- Calidad mínima: {min_quality}
- Solo validados: {validated_only}

## Distribución por modalidad
""")
        from collections import Counter
        dist = Counter(ex.modalidad or "DESCONOCIDA" for ex in examples)
        for modal, cnt in dist.most_common():
            f.write(f"- {modal}: {cnt}\n")

        f.write("""
## Formato
Cada registro JSONL contiene:
- `transcript`: dictado de voz transcrito por Whisper
- `corrected_text`: informe final corregido y firmado por el radiólogo
- `modalidad`: tipo de examen (RX, TC, RM, ECO, etc.)
- `region_anatomica`: región del cuerpo
- `quality_score`: 0–1, basado en cuánto tuvo que corregir el radiólogo
- `prompt` / `completion`: para fine-tuning tipo instrucción
""")

    # Metadata
    meta_path = Path(output_dir) / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump({
            "total": len(examples),
            "train": len(train_examples),
            "eval": len(eval_examples),
            "min_quality": min_quality,
            "validated_only": validated_only,
            "files": {
                "train": "train.jsonl",
                "eval": "eval.jsonl",
            },
        }, f, indent=2, ensure_ascii=False)

    print(f"📁 Dataset exportado en: {output_dir}/")
    print(f"   train.jsonl  → {len(train_examples)} ejemplos")
    print(f"   eval.jsonl   → {len(eval_examples)} ejemplos")
    print(f"   README.md    → dataset card")
    print()
    print("Para cargar en HuggingFace:")
    print(f"  from datasets import load_dataset")
    print(f"  ds = load_dataset('json', data_files={{")
    print(f"      'train': '{train_path}',")
    print(f"      'eval':  '{eval_path}',")
    print(f"  }})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Exporta dataset de training examples")
    parser.add_argument("--output", default="./dataset", help="Directorio de salida")
    parser.add_argument("--min-quality", type=float, default=0.6, help="Calidad mínima 0–1")
    parser.add_argument("--validated-only", action="store_true", help="Solo ejemplos validados manualmente")
    args = parser.parse_args()

    asyncio.run(export_dataset(args.output, args.min_quality, args.validated_only))
