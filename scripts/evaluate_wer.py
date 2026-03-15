#!/usr/bin/env python3
"""
Calcula WER (Word Error Rate) antes y después del fine-tuning de Whisper.

Uso:
  # WER con modelo base (antes de fine-tuning)
  python scripts/evaluate_wer.py --model openai/whisper-small --audio-dir ./test_audio

  # WER con modelo fine-tuneado (después)
  python scripts/evaluate_wer.py --model ./whisper-finetuned --audio-dir ./test_audio

  # Comparar ambos y guardar resultado
  python scripts/evaluate_wer.py --compare --base openai/whisper-small --finetuned ./whisper-finetuned

Requiere: pip install jiwer transformers torchaudio
"""
import argparse
import json
import re
from pathlib import Path
from datetime import datetime


def normalize_text(text: str) -> str:
    """Normaliza texto para cálculo justo de WER."""
    text = text.lower()
    # Expandir abreviaciones médicas chilenas
    replacements = {
        r"\brx\b": "radiografía",
        r"\btac\b": "tomografía computada",
        r"\brm\b": "resonancia magnética",
        r"\beco\b": "ecografía",
        r"\bap\b": "anteroposterior",
        r"\bs/e\b": "sin evidencia",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text)
    # Eliminar puntuación (WER mide palabras)
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def compute_wer(reference: str, hypothesis: str) -> float:
    """
    Calcula WER con jiwer.
    WER = (S + D + I) / N
    S=substituciones, D=eliminaciones, I=inserciones, N=palabras en referencia
    """
    try:
        from jiwer import wer
        return wer(normalize_text(reference), normalize_text(hypothesis))
    except ImportError:
        # Fallback manual si jiwer no está instalado
        ref_words = normalize_text(reference).split()
        hyp_words = normalize_text(hypothesis).split()
        # Levenshtein sobre palabras
        m, n = len(ref_words), len(hyp_words)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if ref_words[i-1] == hyp_words[j-1]:
                    dp[i][j] = dp[i-1][j-1]
                else:
                    dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
        return dp[m][n] / max(1, m)


def transcribe_audio(model_name: str, audio_path: str) -> str:
    """Transcribe un archivo de audio usando Whisper."""
    from transformers import pipeline
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        generate_kwargs={"language": "spanish"},
    )
    result = pipe(audio_path)
    return result["text"]


def evaluate_model(model_name: str, test_pairs: list) -> dict:
    """Evalúa un modelo en el conjunto de prueba."""
    wer_scores = []
    results = []

    for pair in test_pairs:
        audio_path = pair.get("audio_path")
        reference  = pair.get("transcript", "")

        if not audio_path or not Path(audio_path).exists():
            print(f"  ⚠️  Audio no encontrado: {audio_path} — skipping")
            continue

        hypothesis = transcribe_audio(model_name, audio_path)
        score = compute_wer(reference, hypothesis)
        wer_scores.append(score)
        results.append({
            "audio": audio_path,
            "reference": reference[:100] + "..." if len(reference) > 100 else reference,
            "hypothesis": hypothesis[:100] + "...",
            "wer": round(score, 4),
        })
        print(f"  [{len(results)}] WER={score:.2%}  {Path(audio_path).name}")

    avg_wer = sum(wer_scores) / len(wer_scores) if wer_scores else 0.0
    return {
        "model": model_name,
        "n_samples": len(results),
        "avg_wer": round(avg_wer, 4),
        "min_wer": round(min(wer_scores), 4) if wer_scores else None,
        "max_wer": round(max(wer_scores), 4) if wer_scores else None,
        "samples": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Calcula WER de Whisper")
    parser.add_argument("--model", help="Modelo a evaluar (path o HuggingFace ID)")
    parser.add_argument("--base", default="openai/whisper-small", help="Modelo base (antes)")
    parser.add_argument("--finetuned", help="Modelo fine-tuneado (después)")
    parser.add_argument("--compare", action="store_true", help="Comparar base vs fine-tuned")
    parser.add_argument("--test-jsonl", default="./dataset/eval.jsonl", help="Archivo JSONL con pares de test")
    parser.add_argument("--output", default="./wer_results.json", help="Archivo de resultados")
    args = parser.parse_args()

    # Cargar pares de test
    test_pairs = []
    if Path(args.test_jsonl).exists():
        with open(args.test_jsonl, encoding="utf-8") as f:
            for line in f:
                test_pairs.append(json.loads(line))
    else:
        print(f"⚠️  Test file no encontrado: {args.test_jsonl}")
        print("   Generalo primero con: python scripts/prepare_dataset.py")
        return

    # Filtrar solo los que tienen audio_path
    audio_pairs = [p for p in test_pairs if p.get("audio_path")]
    if not audio_pairs:
        print("⚠️  Ningún par tiene audio_path. El WER requiere archivos .wav reales.")
        print("   Puedes calcular WER de texto usando --text-only")
        return

    print(f"📊 Evaluando {len(audio_pairs)} muestras de audio...")

    if args.compare:
        print(f"\n🔵 Modelo base: {args.base}")
        base_results = evaluate_model(args.base, audio_pairs)

        print(f"\n🟢 Modelo fine-tuneado: {args.finetuned}")
        ft_results = evaluate_model(args.finetuned, audio_pairs)

        improvement = base_results["avg_wer"] - ft_results["avg_wer"]
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "base_model": base_results,
            "finetuned_model": ft_results,
            "improvement": {
                "wer_reduction": round(improvement, 4),
                "wer_reduction_pct": round(improvement / max(0.001, base_results["avg_wer"]) * 100, 1),
            },
        }
        print(f"\n{'='*50}")
        print(f"WER base:        {base_results['avg_wer']:.2%}")
        print(f"WER fine-tuned:  {ft_results['avg_wer']:.2%}")
        print(f"Mejora:          {improvement:.2%} ({report['improvement']['wer_reduction_pct']}%)")

    else:
        report = evaluate_model(args.model, audio_pairs)
        print(f"\nWER promedio: {report['avg_wer']:.2%}")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n📁 Resultados guardados en: {args.output}")


if __name__ == "__main__":
    main()
