#!/usr/bin/env python3
"""
Fine-tuning de Whisper en español médico radiológico.

Requiere ~50 pares mínimo (ideal 500+). Usa el dataset generado por prepare_dataset.py.
Los archivos de audio deben estar disponibles (referenciados en audio_path del JSONL).

Uso:
  pip install transformers datasets accelerate librosa soundfile jiwer
  python scripts/finetune_whisper.py --dataset ./dataset --output ./whisper-finetuned

Nota: Sin GPU esto puede tardar mucho. Recomendado: Google Colab Pro / RunPod.
"""
import argparse
import json
import sys
from pathlib import Path

# Agrega el directorio raíz al path
sys.path.insert(0, str(Path(__file__).parent.parent))


def check_dependencies():
    missing = []
    for pkg in ["transformers", "datasets", "accelerate", "librosa", "soundfile", "jiwer"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"❌ Instala las dependencias faltantes:")
        print(f"   pip install {' '.join(missing)}")
        sys.exit(1)


def count_available_audio(jsonl_path: str) -> int:
    """Cuenta cuántos ejemplos tienen audio disponible."""
    count = 0
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            audio_path = record.get("audio_path")
            if audio_path and Path(audio_path).exists():
                count += 1
    return count


def run_finetune(dataset_dir: str, output_dir: str, model_name: str, epochs: int, batch_size: int):
    """Ejecuta el fine-tuning de Whisper."""
    from datasets import load_dataset, DatasetDict, Audio
    from transformers import (
        WhisperFeatureExtractor, WhisperTokenizer, WhisperProcessor,
        WhisperForConditionalGeneration, Seq2SeqTrainer, Seq2SeqTrainingArguments,
    )
    import torch
    from jiwer import wer
    import numpy as np

    train_file = Path(dataset_dir) / "train.jsonl"
    eval_file  = Path(dataset_dir) / "eval.jsonl"

    n_train = count_available_audio(str(train_file))
    n_eval  = count_available_audio(str(eval_file))

    if n_train < 10:
        print(f"❌ Solo {n_train} ejemplos con audio disponible.")
        print(f"   Necesitas al menos 10 para fine-tuning (ideal 50+).")
        print(f"   Asegúrate de que audio_path en el JSONL apunta a archivos .wav reales.")
        sys.exit(1)

    print(f"✅ {n_train} muestras de audio para entrenamiento, {n_eval} para eval")
    print(f"📦 Cargando modelo base: {model_name}")

    # Cargar componentes de Whisper
    feature_extractor = WhisperFeatureExtractor.from_pretrained(model_name)
    tokenizer         = WhisperTokenizer.from_pretrained(model_name, language="Spanish", task="transcribe")
    processor         = WhisperProcessor.from_pretrained(model_name, language="Spanish", task="transcribe")

    # Dataset
    raw_ds = load_dataset("json", data_files={
        "train": str(train_file),
        "eval":  str(eval_file),
    })

    # Filtrar los que tienen audio
    def has_audio(ex): return ex["audio_path"] and Path(ex["audio_path"]).exists()
    raw_ds = raw_ds.filter(has_audio)
    raw_ds = raw_ds.cast_column("audio_path", Audio(sampling_rate=16000))

    def prepare_dataset(batch):
        audio = batch["audio_path"]
        batch["input_features"] = feature_extractor(
            audio["array"], sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        batch["labels"] = tokenizer(batch["corrected_text"]).input_ids
        return batch

    processed = raw_ds.map(prepare_dataset, remove_columns=raw_ds["train"].column_names)

    # Modelo
    model = WhisperForConditionalGeneration.from_pretrained(model_name)
    model.generation_config.language = "spanish"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None

    # Data collator
    from dataclasses import dataclass
    from typing import Any, Dict, List, Union

    @dataclass
    class DataCollatorSpeechSeq2SeqWithPadding:
        processor: Any
        decoder_start_token_id: int

        def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, Any]:
            input_features = [{"input_features": f["input_features"]} for f in features]
            batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
            label_features = [{"input_ids": f["labels"]} for f in features]
            labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
            labels = labels_batch["input_ids"].masked_fill(
                labels_batch.attention_mask.ne(1), -100
            )
            if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
                labels = labels[:, 1:]
            batch["labels"] = labels
            return batch

    data_collator = DataCollatorSpeechSeq2SeqWithPadding(
        processor=processor,
        decoder_start_token_id=model.config.decoder_start_token_id,
    )

    # Métricas
    def compute_metrics(pred):
        pred_ids = pred.predictions
        label_ids = pred.label_ids
        label_ids[label_ids == -100] = tokenizer.pad_token_id
        pred_str  = tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        return {"wer": 100 * wer(label_str, pred_str)}

    # Training args
    training_args = Seq2SeqTrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=1,
        learning_rate=1e-5,
        warmup_steps=50,
        max_steps=min(500, n_train * epochs),
        gradient_checkpointing=True,
        fp16=torch.cuda.is_available(),
        evaluation_strategy="steps",
        per_device_eval_batch_size=batch_size,
        predict_with_generate=True,
        generation_max_length=225,
        save_steps=100,
        eval_steps=100,
        logging_steps=25,
        report_to=["tensorboard"],
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        push_to_hub=False,
    )

    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=processed["train"],
        eval_dataset=processed["eval"],
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=processor.feature_extractor,
    )

    print(f"🚀 Iniciando fine-tuning...")
    print(f"   Modelo base:  {model_name}")
    print(f"   Output:       {output_dir}")
    print(f"   Dispositivo:  {'GPU' if torch.cuda.is_available() else 'CPU'}")
    print()

    trainer.train()

    trainer.save_model(output_dir)
    processor.save_pretrained(output_dir)
    print(f"\n✅ Modelo guardado en: {output_dir}")
    print(f"   Usa --model {output_dir} en evaluate_wer.py para medir la mejora")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tuning de Whisper para radiología")
    parser.add_argument("--dataset", default="./dataset", help="Directorio del dataset JSONL")
    parser.add_argument("--output", default="./whisper-finetuned", help="Directorio de salida del modelo")
    parser.add_argument("--model", default="openai/whisper-small", help="Modelo base de Whisper")
    parser.add_argument("--epochs", type=int, default=3, help="Número de épocas")
    parser.add_argument("--batch-size", type=int, default=8, help="Tamaño del batch")
    args = parser.parse_args()

    check_dependencies()
    run_finetune(args.dataset, args.output, args.model, args.epochs, args.batch_size)
