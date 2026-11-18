"use client";

// The Terms and Conditions editor. The old form used Quill; the terms POs
// carry are simple (paragraphs, bold, lists), so this keeps to those: a
// paragraph style, bold / italic / underline / strike, lists, quote, clear.
// What it produces is cleaned again by the server (lib/purchase/html.ts)
// before it is stored or printed.
import { Bold, Italic, List, ListOrdered, Quote, RemoveFormatting, Strikethrough, Underline } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/purchase/cn";
import { sanitizeHtml } from "@/lib/purchase/html";

const TOOLS = [
  { cmd: "bold", icon: Bold, label: "Bold" },
  { cmd: "italic", icon: Italic, label: "Italic" },
  { cmd: "underline", icon: Underline, label: "Underline" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "Strike" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { cmd: "insertUnorderedList", icon: List, label: "Bulleted list" },
  { cmd: "formatBlock:blockquote", icon: Quote, label: "Quote" },
  { cmd: "removeFormat", icon: RemoveFormatting, label: "Clear formatting" },
] as const;

export function HtmlEditor({ value, onChange, disabled }: { value: string; onChange: (html: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const clean = sanitizeHtml(value ?? "");

  // Show a value set from outside (a Terms template picked) unless the user is typing in it.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== clean) el.innerHTML = clean;
  }, [clean]);

  if (disabled) {
    return <div className="po-html min-h-[120px] rounded-md bg-[#f4f5f6] px-3 py-2 text-gray-800" dangerouslySetInnerHTML={{ __html: clean || "&nbsp;" }} />;
  }

  const run = (cmd: string) => {
    ref.current?.focus();
    const [name, arg] = cmd.split(":");
    document.execCommand(name, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1">
        <select
          className="mr-1 rounded border-0 bg-transparent py-0.5 text-xs text-gray-700 focus:ring-0"
          aria-label="Paragraph style"
          defaultValue="p"
          onChange={(e) => {
            run(`formatBlock:${e.target.value}`);
            e.target.value = "p";
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        {TOOLS.map(({ cmd, icon: Icon, label }) => (
          <button key={cmd} type="button" title={label} aria-label={label} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className={cn("po-html min-h-[220px] px-3 py-2 text-gray-800 outline-none")}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Terms and Conditions"
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={(e) => {
          // Paste as cleaned HTML, never another page's scripts or styles.
          const html = e.clipboardData.getData("text/html");
          if (html) {
            e.preventDefault();
            document.execCommand("insertHTML", false, sanitizeHtml(html));
            onChange(ref.current?.innerHTML ?? "");
          }
        }}
      />
    </div>
  );
}
