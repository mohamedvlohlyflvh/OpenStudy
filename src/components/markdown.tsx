"use client";

import { Fragment, type ReactNode, type ElementType } from "react";

// ─── Tiny, dependency-free Markdown renderer ─────────────────
// Supports: headings (#..######), bold **x**, italic *x*, inline code
// `x`, code blocks ```...```, links [t](u), unordered lists (- / *),
// ordered lists (1.), blockquotes (>), and line breaks. Escapes HTML.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  // images ![alt](url) — must come before links to avoid false matches.
  // Only http(s), site-relative, and data:image URLs are rendered; anything
  // else stays as literal (escaped) text. Combined with quote escaping in
  // escapeHtml, this closes the attribute-breakout XSS vector via card
  // content (front/back come from imports and pasted LLM output).
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|\.\.?\/[^\s)]*|data:image\/[^\s)]+)\)/gi,
    '<img src="$2" alt="$1" class="md-img" style="max-width:100%;height:auto;border-radius:4px;" />'
  );
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
  );
  return s;
}

export function Markdown({ content, className }: { content: string; className?: string }): ReactNode {
  const hasArabic = /[\u0600-\u06FF]/.test(content ?? "");
  const outerDir = hasArabic ? "rtl" as const : undefined;
  const lines = (content ?? "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre key={key++} className="md-pre">
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (`h${level}`) as ElementType;
      blocks.push(
        <Tag key={key++} className={`md-h md-h${level}`} dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="md-quote" dangerouslySetInnerHTML={{ __html: renderInline(quote.join("<br/>")) }} />
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="md-ol">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (gather consecutive non-special lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="md-p" dangerouslySetInnerHTML={{ __html: renderInline(para.join("<br/>")) }} />
    );
  }

  return <div dir={outerDir} className={className} style={hasArabic ? { unicodeBidi: "plaintext", textAlign: "right" } as React.CSSProperties : undefined}>{blocks.map((b, idx) => <Fragment key={idx}>{b}</Fragment>)}</div>;
}
