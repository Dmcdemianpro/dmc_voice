/**
 * Convierte comandos verbales del dictado en sus símbolos correspondientes.
 * Espejo de la función normalize_transcript() del backend (claude_service.py).
 * Orden importa: frases compuestas van antes que palabras sueltas.
 */

const VERBAL_COMMANDS: [RegExp, string][] = [
  // Saltos de línea
  [/\bnueva\s+l[ií]nea\b/gi,              "\n"],
  [/\bnuevo\s+p[aá]rrafo\b/gi,            "\n\n"],
  [/\bfin\s+de\s+p[aá]rrafo\b/gi,         "\n\n"],
  // Signos compuestos (primero los más largos)
  [/\bpunto\s+y\s+coma\b/gi,              ";"],
  [/\bsigno\s+de\s+interrogaci[oó]n\b/gi, "?"],
  [/\bsigno\s+de\s+exclamaci[oó]n\b/gi,   "!"],
  [/\bdoble\s+barra\b/gi,                 "//"],
  [/\bdoble\s+punto\b/gi,                 ":"],
  // Signos simples
  [/\bdos\s+puntos\b/gi,                  ":"],
  [/\bpuntos\s+suspensivos\b/gi,          "..."],
  [/\bpunto\b/gi,                         "."],
  [/\bcoma\b/gi,                          ","],
  [/\binterrogaci[oó]n\b/gi,             "?"],
  [/\bexclamaci[oó]n\b/gi,               "!"],
  [/\bgui[oó]n\b/gi,                     "-"],
  [/\bsub\s*gui[oó]n\b/gi,              "_"],
  [/\bbarra\b/gi,                         "/"],
  [/\bslash\b/gi,                         "/"],
  [/\bporcentaje\b/gi,                    "%"],
  [/\bm[aá]s\b/gi,                       "+"],
  [/\bmenos\b/gi,                         "-"],
  [/\bigual\b/gi,                         "="],
  [/\barroba\b/gi,                        "@"],
  // Paréntesis y corchetes
  [/\babre\s+par[eé]ntesis\b/gi,          "("],
  [/\bcierra\s+par[eé]ntesis\b/gi,        ")"],
  [/\bpar[eé]ntesis\s+abierto\b/gi,       "("],
  [/\bpar[eé]ntesis\s+cerrado\b/gi,       ")"],
  [/\babre\s+corchete\b/gi,               "["],
  [/\bcierra\s+corchete\b/gi,             "]"],
  [/\babre\s+llave\b/gi,                  "{"],
  [/\bcierra\s+llave\b/gi,               "}"],
  // Espaciado explícito
  [/\bespacio\b/gi,                       " "],
  [/\btabulaci[oó]n\b/gi,                "\t"],
];

export function normalizeTranscript(text: string): string {
  for (const [pattern, replacement] of VERBAL_COMMANDS) {
    text = text.replace(pattern, replacement);
  }
  // Limpiar espacios dobles
  text = text.replace(/ {2,}/g, " ");
  // Limpiar espacio antes de puntuación (" ." → ".")
  text = text.replace(/\s+([.,;:?!])/g, "$1");
  return text.trim();
}
