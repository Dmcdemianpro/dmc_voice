"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { useEffect } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Minus, Type,
  Heading1, Heading2, Heading3,
} from "lucide-react";

// ── Font-size via TextStyle inline style ──────────────────────────────────────
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, string | null>) =>
            attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function textToHtml(text: string): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<p>/gi, "").replace(/<\/p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportEditorProps {
  content: string;
  onChange: (text: string) => void;
  readOnly?: boolean;
}

// ── Colores constantes ────────────────────────────────────────────────────────
const C = {
  elevated: "#1e2a3d",
  border: "rgba(148,163,184,0.18)",
  text: "#d0dae8",
  cyan: "#00d4ff",
  muted: "rgba(148,163,184,0.45)",
  activeBg: "rgba(0,212,255,0.15)",
  activeBorder: "rgba(0,212,255,0.4)",
};

const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px"];
const FONT_SIZE_LABELS: Record<string, string> = {
  "10px": "10", "12px": "12", "14px": "14", "16px": "16",
  "18px": "18", "20px": "20", "24px": "24",
};

// ── ToolButton ────────────────────────────────────────────────────────────────

function ToolBtn({
  onClick, active, title, disabled, children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      style={{
        padding: "4px 8px", borderRadius: 4,
        background: active ? C.activeBg : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? C.activeBorder : "rgba(148,163,184,0.18)"}`,
        color: active ? C.cyan : disabled ? C.muted : C.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s", flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        }
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: C.border, margin: "0 4px", flexShrink: 0 }} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportEditor({ content, onChange, readOnly = false }: ReportEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "El informe aparecerá aquí tras procesar el dictado…" }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: textToHtml(content),
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange(htmlToText(editor.getHTML())),
    editorProps: { attributes: { class: "tiptap-editor" } },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = textToHtml(content);
    if (incoming !== editor.getHTML() && content) {
      editor.commands.setContent(incoming, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const charCount = htmlToText(editor.getHTML()).length;

  // Detectar tamaño activo
  const activeFontSize = FONT_SIZES.find(s =>
    editor.isActive("textStyle", { fontSize: s })
  ) ?? "14px";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── Toolbar ── */}
      {!readOnly && (
        <div style={{
          display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" as const,
          padding: "6px 10px",
          background: C.elevated,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>

          {/* Deshacer / Rehacer */}
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Deshacer (Ctrl+Z)" disabled={!editor.can().undo()}>
            <Undo2 size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Rehacer (Ctrl+Y)" disabled={!editor.can().redo()}>
            <Redo2 size={13} />
          </ToolBtn>

          <Sep />

          {/* Formato de carácter */}
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrita (Ctrl+B)">
            <Bold size={13} strokeWidth={2.5} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Cursiva (Ctrl+I)">
            <Italic size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Subrayado (Ctrl+U)">
            <UnderlineIcon size={13} />
          </ToolBtn>

          <Sep />

          {/* Encabezados / tamaño */}
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título grande (H1)">
            <Heading1 size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título medio (H2)">
            <Heading2 size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Subtítulo (H3)">
            <Heading3 size={13} />
          </ToolBtn>

          {/* Selector de tamaño de fuente */}
          <select
            value={activeFontSize}
            onChange={e => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor.chain().focus() as any).setMark("textStyle", { fontSize: e.target.value }).run();
            }}
            title="Tamaño de fuente"
            style={{
              padding: "3px 6px", borderRadius: 4, height: 26,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.18)",
              color: C.text, fontSize: 11,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {FONT_SIZES.map(s => (
              <option key={s} value={s} style={{ background: "#1e2a3d" }}>
                {FONT_SIZE_LABELS[s]}
              </option>
            ))}
          </select>

          <Sep />

          {/* Listas */}
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista con viñetas">
            <List size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
            <ListOrdered size={13} />
          </ToolBtn>

          <Sep />

          {/* Alineación */}
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinear a la izquierda">
            <AlignLeft size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centrar">
            <AlignCenter size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinear a la derecha">
            <AlignRight size={13} />
          </ToolBtn>

          <Sep />

          {/* Línea horizontal */}
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Línea separadora">
            <Minus size={13} />
          </ToolBtn>

          {/* Contador de caracteres */}
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
            fontSize: 10, color: charCount > 0 ? "#94a3b8" : C.muted,
          }}>
            <Type size={10} />
            <span>{charCount.toLocaleString()} chars</span>
          </div>
        </div>
      )}

      {/* ── Área de texto ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", background: "#161f2e" }}>
        <EditorContent editor={editor} style={{ height: "100%" }} />
      </div>
    </div>
  );
}
