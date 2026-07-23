import React, { useRef } from "react";
import { Link as LinkIcon, Sparkles, HelpCircle } from "lucide-react";

interface SmartMarkdownInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  required?: boolean;
  className?: string;
}

/**
 * Converts pasted HTML or formatted plain text into Telegram Markdown links [text](url)
 */
export function convertHtmlOrTextToMarkdown(htmlText: string, plainText: string): string {
  if (htmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");

      // Replace <a> tags with [text](href)
      const anchors = doc.querySelectorAll("a");
      anchors.forEach((a) => {
        const href = a.getAttribute("href");
        const text = a.textContent?.trim();
        if (href && text) {
          const markdownLink = doc.createTextNode(`[${text}](${href})`);
          a.parentNode?.replaceChild(markdownLink, a);
        }
      });

      // Convert <b> / <strong>
      const bolds = doc.querySelectorAll("b, strong");
      bolds.forEach((b) => {
        const text = b.textContent;
        if (text) {
          const node = doc.createTextNode(`*${text}*`);
          b.parentNode?.replaceChild(node, b);
        }
      });

      // Convert <i> / <em>
      const italics = doc.querySelectorAll("i, em");
      italics.forEach((i) => {
        const text = i.textContent;
        if (text) {
          const node = doc.createTextNode(`_${text}_`);
          i.parentNode?.replaceChild(node, i);
        }
      });

      const bodyText = doc.body.textContent || "";
      if (bodyText.includes("[") && bodyText.includes("](") && bodyText.includes(")")) {
        return bodyText;
      }
    } catch (err) {
      console.error("HTML Markdown parse error:", err);
    }
  }

  if (plainText) {
    // 1. Convert "слово (https://...)" -> "[слово](https://...)"
    let converted = plainText.replace(/([^\s\n()\[\]]+)\s*\((https?:\/\/[^\s()]+)\)/gi, "[$1]($2)");
    // 2. Convert "слово - https://..." -> "[слово](https://...)"
    converted = converted.replace(/([a-яА-Яa-zA-Z0-9_-]+)\s*[-–—]\s*(https?:\/\/[^\s()]+)/gi, "[$1]($2)");
    return converted;
  }

  return plainText;
}

/**
 * Renders Telegram Markdown [text](url), *bold*, _italic_ as React JSX elements for preview
 */
export function renderTelegramMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Regex to match [text](url)
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={match.index}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-400 underline hover:text-sky-300 font-bold break-all cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        {linkText}
      </a>
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export const SmartMarkdownInput: React.FC<SmartMarkdownInputProps> = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  label,
  required = false,
  className = ""
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle smart paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const htmlData = e.clipboardData.getData("text/html");
    const textData = e.clipboardData.getData("text/plain");

    if ((htmlData && (htmlData.includes("<a ") || htmlData.includes("<A "))) ||
        (textData && (/\([a-z]+:\/\/[^)]+\)/i.test(textData) || /[-–—]\s*https?:\/\//i.test(textData)))) {
      e.preventDefault();
      const converted = convertHtmlOrTextToMarkdown(htmlData, textData);

      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const newVal = val.substring(0, start) + converted + val.substring(end);
        onChange(newVal);

        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + converted.length;
        }, 10);
      } else {
        onChange(converted);
      }
    }
  };

  // Insert link at selection or prompt
  const handleInsertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end).trim();

    const linkText = selectedText || prompt("Введите текст ссылки (слово, которое станет кнопкой/гиперссылкой):", "Наш канал");
    if (!linkText) return;

    const url = prompt(`Введите URL ссылки для "${linkText}":`, "https://t.me/...");
    if (!url) return;

    const formattedUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    const markdownLink = `[${linkText}](${formattedUrl})`;

    const newVal = value.substring(0, start) + markdownLink + value.substring(end);
    onChange(newVal);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + markdownLink.length;
    }, 10);
  };

  // Auto-fix all raw links in current value
  const handleAutoFixLinks = () => {
    const converted = convertHtmlOrTextToMarkdown("", value);
    if (converted !== value) {
      onChange(converted);
      alert("✅ Все ссылки в тексте автоматически преобразованы в формат Telegram гиперссылок [текст](ссылка)!");
    } else {
      alert("💡 В тексте не найдено обычных ссылок вида 'слово (http...)' для конвертации.");
    }
  };

  // Wrap selection in bold or italic
  const handleWrapFormat = (symbol: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const wrapped = `${symbol}${selectedText || "текст"}${symbol}`;
    const newVal = value.substring(0, start) + wrapped + value.substring(end);
    onChange(newVal);

    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.selectionStart = textarea.selectionEnd = start + wrapped.length;
      } else {
        textarea.selectionStart = start + symbol.length;
        textarea.selectionEnd = start + symbol.length + 5;
      }
    }, 10);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider block">
            {label}
          </label>
        </div>
      )}

      {/* Formatting Toolbar */}
      <div className="border border-brand-border rounded-xl overflow-hidden shadow-2xs bg-white">
        <div className="flex items-center justify-between gap-1 p-1.5 bg-slate-100 border-b border-brand-border text-xs flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={handleInsertLink}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-indigo-600 border border-brand-border rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
              title="Выделите текст и нажмите, чтобы прикрепить гиперссылку"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>🔗 Сделать гиперссылку</span>
            </button>

            <button
              type="button"
              onClick={handleAutoFixLinks}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-amber-700 border border-brand-border rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
              title="Автоматически превратить 'слово (https://...)' в [слово](https://...)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>⚡ Исправить ссылки</span>
            </button>

            <div className="h-4 w-[1px] bg-slate-300 my-auto mx-0.5" />

            <button
              type="button"
              onClick={() => handleWrapFormat("*")}
              className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-800 border border-brand-border rounded-lg font-black text-[11px] shadow-2xs cursor-pointer"
              title="Жирный текст (*текст*)"
            >
              B
            </button>

            <button
              type="button"
              onClick={() => handleWrapFormat("_")}
              className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-800 border border-brand-border rounded-lg font-serif italic font-bold text-[11px] shadow-2xs cursor-pointer"
              title="Курсив (_текст_)"
            >
              I
            </button>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium ml-auto">
            <HelpCircle className="w-3 h-3 text-indigo-500" />
            <span className="hidden sm:inline">
              Формат: <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded border border-slate-200">[слово](https://ссылка)</code>
            </span>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder || "Введите текст сообщения..."}
          rows={rows}
          required={required}
          className="w-full bg-white p-3 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none text-xs leading-relaxed resize-y border-0"
        />
      </div>
      <p className="text-[10px] text-slate-400 font-medium">
        💡 При вставке (Ctrl+V) скопированных ссылок из Telegram или браузера они автоматически трансформируются в гиперссылки!
      </p>
    </div>
  );
};
