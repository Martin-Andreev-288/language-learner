"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { splitIntoSentences } from "@/lib/sentence-split";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";
import { translateSentences } from "@/app/actions/parallel-translate-actions";
import { writeCarriedColumns } from "@/lib/parallel-listen-carry";
import { describeClientError } from "@/lib/client-error";
import { PARALLEL_TRANSLATE_MAX_CHARACTERS } from "@/lib/limits";
import CharacterCount from "@/components/shared/character-count";
import LanguageCombobox from "@/components/shared/language-combobox";

type OutputFormat = "markdown" | "vertical";

interface LanguageColumn {
  id: number;
  name: string;
  text: string;
  collapsed: boolean;
}

interface ParsedData {
  rows: string[][];
}

interface PreviewData {
  rows: string[][];
  names: string[];
}

const PREVIEW_COLORS = [
  "text-blue-400",
  "text-emerald-400",
  "text-purple-400",
  "text-orange-400",
  "text-pink-400",
  "text-cyan-400",
  "text-lime-400",
  "text-amber-400",
];

function parseColumns(columns: LanguageColumn[]): ParsedData | null {
  const texts = columns.map((c) => c.text);
  if (texts.length === 0 || texts.every((t) => !t.trim())) return null;

  const sentencesPerLanguage = texts.map((text) => splitIntoSentences(text));
  const maxSentences = Math.max(...sentencesPerLanguage.map((s) => s.length));

  const rows: string[][] = [];
  for (let i = 0; i < maxSentences; i++) {
    const row = sentencesPerLanguage.map((sentences) => sentences[i] || "");
    if (row.some((text) => text)) {
      rows.push(row);
    }
  }

  return { rows };
}

function formatToMarkdown(data: ParsedData, names: string[]): string {
  let output = "| " + names.join(" | ") + " |\n";
  output += "|" + names.map(() => "---").join("|") + "|\n";
  data.rows.forEach((row) => {
    output += "| " + row.join(" | ") + " |\n";
  });
  return output;
}

// `names` here may contain blank entries — a blank name means the user
// never labeled that language, so its lines are left unprefixed instead of
// falling back to a placeholder like "Language 2", keeping copy-paste output
// clean when nobody cares about the labels.
function formatToVertical(data: ParsedData, names: string[]): string {
  let output = "";
  data.rows.forEach((row) => {
    if (row.some((text) => text)) {
      row.forEach((text, i) => {
        if (!text) return;
        output += names[i] ? `- ${names[i]}: ${text}\n` : `${text}\n`;
      });
      output += "\n";
    }
  });
  return output;
}

let nextColumnId = 0;
function makeColumn(name = ""): LanguageColumn {
  nextColumnId += 1;
  return { id: nextColumnId, name, text: "", collapsed: false };
}

export default function ParallelTranslateTool({
  defaultTranslateLanguage,
}: {
  defaultTranslateLanguage: string;
}) {
  const router = useRouter();
  // Only the first column starts filled in (Question 302). The second is
  // left empty deliberately: which column is the *source* here is decided
  // by whichever one you type into, so filling both in advance would be
  // guessing at something the page works out for itself.
  const [columns, setColumns] = useState<LanguageColumn[]>(() => [
    makeColumn(defaultTranslateLanguage),
    makeColumn(),
  ]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");
  const [outputText, setOutputText] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [translating, setTranslating] = useState(false);

  function runFormat(nextColumns: LanguageColumn[], format: OutputFormat) {
    const parsed = parseColumns(nextColumns);
    if (!parsed) {
      setOutputText("");
      setPreview(null);
      setError("Please paste at least one text before formatting.");
      return;
    }

    const rawNames = nextColumns.map((column) => column.name.trim());

    if (format === "vertical") {
      setOutputText(formatToVertical(parsed, rawNames));
    } else {
      const displayNames = rawNames.map(
        (name, index) => name || `Language ${index + 1}`,
      );
      setOutputText(formatToMarkdown(parsed, displayNames));
    }
    setPreview({ rows: parsed.rows, names: rawNames });
    setError(null);
  }

  function updateColumn(id: number, patch: Partial<LanguageColumn>) {
    setColumns((prev) =>
      prev.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  }

  function handleAddLanguage() {
    setColumns((prev) => [...prev, makeColumn()]);
  }

  async function handleTranslateWithAi() {
    // First non-empty column is the source; every currently-empty column is
    // a translation target. Columns already containing text are never
    // overwritten, whether they were typed by hand or filled by a previous
    // AI translation.
    const source = columns.find((column) => column.text.trim());
    const targets = columns.filter(
      (column) => column.id !== source?.id && !column.text.trim(),
    );

    if (!source) {
      setError("Paste a source text in one language before translating.");
      return;
    }
    if (targets.length === 0) {
      setError(
        "Add an empty language column for the translation to fill in.",
      );
      return;
    }

    setTranslating(true);
    try {
      const sentences = splitIntoSentences(source.text);
      const results = await Promise.all(
        targets.map(async (target) => ({
          id: target.id,
          name: target.name,
          result: await translateSentences(sentences, source.text, target.name),
        })),
      );

      // Each column is its own request, so some can succeed while others
      // fail. The successful ones are applied rather than discarded — their
      // AI calls have already been made and paid for — and the failure is
      // reported alongside, naming which language it was so it's clear what
      // is and isn't filled in.
      const failed = results.filter((entry) => !entry.result.ok);

      setColumns((prev) =>
        prev.map((column) => {
          const entry = results.find((r) => r.id === column.id);
          if (!entry || !entry.result.ok) return column;
          return { ...column, text: entry.result.data.join("\n") };
        }),
      );

      const firstFailure = failed[0];
      if (firstFailure && !firstFailure.result.ok) {
        const label = firstFailure.name.trim() || "one language";
        setError(
          failed.length > 1
            ? `${failed.length} languages couldn't be translated. ${label}: ${firstFailure.result.error}`
            : `${label}: ${firstFailure.result.error}`,
        );
      } else {
        setError(null);
      }
    } catch (err) {
      setError(describeClientError(err, "Translation failed."));
    } finally {
      setTranslating(false);
    }
  }

  function handleSendToListen() {
    const hasContent = columns.some((column) => column.text.trim());
    if (!hasContent) {
      setError(
        "Paste at least one language before sending it to Parallel Listen.",
      );
      return;
    }
    writeCarriedColumns(
      columns.map((column) => ({ name: column.name, text: column.text })),
    );
    router.push("/listening/parallel-listen");
  }

  function handleRemoveLanguage(id: number) {
    if (columns.length <= 1) return;
    const next = columns.filter((column) => column.id !== id);
    setColumns(next);
    if (preview) runFormat(next, outputFormat);
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const next = [...columns];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setColumns(next);
    runFormat(next, outputFormat);
  }

  function handleToggleCollapse(id: number) {
    updateColumn(id, {
      collapsed: !columns.find((column) => column.id === id)?.collapsed,
    });
  }

  function handleFormatClick() {
    runFormat(columns, outputFormat);
  }

  function handleFormatChange(format: OutputFormat) {
    setOutputFormat(format);
    if (preview) runFormat(columns, format);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopySuccess(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError(
        "Couldn't copy to the clipboard — copy the text manually instead.",
      );
    }
  }

  async function handleSaveToNote() {
    if (!outputText) return;

    setSavingNote(true);
    try {
      const title =
        columns
          .map((column) => column.name.trim())
          .filter(Boolean)
          .join(" / ") || "Parallel Translate";
      await createNote(NotePage.reading, title, outputText);
      setNoteSaved(true);
      setError(null);
      if (noteResetRef.current) clearTimeout(noteResetRef.current);
      noteResetRef.current = setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      setError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  }

  function handleClear() {
    setColumns([makeColumn(), makeColumn()]);
    setOutputText("");
    setPreview(null);
    setError(null);
    setCopySuccess(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Parallel Translate
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste the same passage in two or more languages and get it back
            aligned sentence by sentence.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">
            Output format
          </h3>
          <div className="flex flex-wrap gap-4">
            {(
              [
                { value: "markdown", label: "Markdown table" },
                { value: "vertical", label: "Vertical bullets" },
              ] as { value: OutputFormat; label: string }[]
            ).map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                <input
                  type="radio"
                  name="output-format"
                  value={option.value}
                  checked={outputFormat === option.value}
                  onChange={() => handleFormatChange(option.value)}
                  className="accent-indigo-600"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Input</h2>
              <button
                onClick={handleClear}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>

            <div className="max-h-112 space-y-4 overflow-y-auto pr-1">
              {columns.map((column, index) => (
                <div key={column.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <LanguageCombobox
                      value={column.name}
                      onChange={(next) =>
                        updateColumn(column.id, { name: next })
                      }
                      placeholder={`Language ${index + 1}`}
                      wrapperClassName="flex-1"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                    />
                    <button
                      onClick={() => handleRemoveLanguage(column.id)}
                      disabled={columns.length <= 1}
                      title="Remove this language"
                      className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-zinc-800 disabled:hover:text-zinc-400"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    value={column.text}
                    onChange={(event) =>
                      updateColumn(column.id, { text: event.target.value })
                    }
                    maxLength={PARALLEL_TRANSLATE_MAX_CHARACTERS}
                    placeholder={`Paste your ${column.name || "text"} here...`}
                    className="h-32 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                  />
                  {/* Per column, because the limit is per column — the
                      action receives one source text per request. */}
                  <CharacterCount
                    value={column.text}
                    max={PARALLEL_TRANSLATE_MAX_CHARACTERS}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleAddLanguage}
              className="mt-4 w-full rounded-lg border border-dashed border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-indigo-500 hover:text-indigo-400"
            >
              + Add language
            </button>

            <button
              onClick={handleTranslateWithAi}
              disabled={translating}
              title="Fills every empty language column by translating from the first language that has text"
              className="mt-2 w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-indigo-500 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translating ? "Translating…" : "Translate empty columns with AI"}
            </button>

            <button
              onClick={handleSendToListen}
              title="Carry this pasted content over to Parallel Listen — nothing is saved, it's there only for this visit"
              className="mt-2 w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-indigo-500 hover:text-indigo-400"
            >
              Send to Parallel Listen →
            </button>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <button
              onClick={handleFormatClick}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500"
            >
              {outputFormat === "vertical"
                ? "Format to Vertical"
                : "Format to Markdown"}
            </button>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Output</h2>
              <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                <button
                  onClick={handleSaveToNote}
                  disabled={!outputText || savingNote}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    noteSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  } disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500`}
                >
                  {noteSaved
                    ? "Saved!"
                    : savingNote
                      ? "Saving…"
                      : "Save to a new note"}
                </button>
                <button
                  onClick={handleCopy}
                  disabled={!outputText}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    copySuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  } disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500`}
                >
                  {copySuccess ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <textarea
              value={outputText}
              readOnly
              placeholder="Formatted text will appear here..."
              className="h-96 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-300"
            />
          </div>
        </div>

        {preview && (
          <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              Preview
            </h2>

            {outputFormat === "vertical" ? (
              <div className="space-y-4">
                {preview.rows.map((row, rowIdx) => (
                  <div key={rowIdx}>
                    {row.map((text, colIdx) => {
                      if (!text) return null;
                      const name = preview.names[colIdx];
                      return (
                        <p key={colIdx} className="text-zinc-200">
                          {name && (
                            <span
                              className={`font-semibold ${PREVIEW_COLORS[colIdx % PREVIEW_COLORS.length]}`}
                            >
                              {name}:{" "}
                            </span>
                          )}
                          {text}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-zinc-800">
                  <thead>
                    <tr className="bg-zinc-800">
                      {preview.names.map((rawName, idx) => {
                        const column = columns[idx];
                        const isCollapsed = column?.collapsed ?? false;
                        const name = rawName || `Language ${idx + 1}`;

                        if (isCollapsed) {
                          return (
                            <th
                              key={idx}
                              className="border border-zinc-800 px-1 py-1"
                            >
                              <button
                                onClick={() =>
                                  column && handleToggleCollapse(column.id)
                                }
                                title="Expand column"
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 transition-colors hover:bg-zinc-700"
                              >
                                {name.slice(0, 2).toUpperCase()}+
                              </button>
                            </th>
                          );
                        }

                        return (
                          <th
                            key={idx}
                            className="border border-zinc-800 px-4 py-2 text-left font-semibold text-zinc-300"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex-1">{name}</span>
                              <div className="flex gap-1">
                                {preview.names.length > 1 && (
                                  <button
                                    onClick={() =>
                                      column && handleToggleCollapse(column.id)
                                    }
                                    title="Collapse column"
                                    className="rounded px-1.5 py-1 text-xs font-bold text-orange-400 transition-colors hover:bg-zinc-700"
                                  >
                                    −
                                  </button>
                                )}
                                {preview.names.length > 1 && (
                                  <>
                                    <button
                                      onClick={() => handleMove(idx, -1)}
                                      disabled={idx === 0}
                                      title="Move column left"
                                      className="rounded px-1.5 py-1 text-xs font-bold text-indigo-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                                    >
                                      ←
                                    </button>
                                    <button
                                      onClick={() => handleMove(idx, 1)}
                                      disabled={
                                        idx === preview.names.length - 1
                                      }
                                      title="Move column right"
                                      className="rounded px-1.5 py-1 text-xs font-bold text-indigo-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                                    >
                                      →
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() =>
                                    column && handleRemoveLanguage(column.id)
                                  }
                                  disabled={columns.length <= 1}
                                  title="Delete this column"
                                  className="rounded px-1.5 py-1 text-xs font-bold text-red-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-zinc-800/60">
                        {row.map((text, colIdx) => {
                          const isCollapsed =
                            columns[colIdx]?.collapsed ?? false;
                          return (
                            <td
                              key={colIdx}
                              className={`border border-zinc-800 px-4 py-2 text-zinc-300 ${
                                isCollapsed ? "bg-zinc-800/60" : ""
                              }`}
                            >
                              {isCollapsed ? "" : text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-3 text-base font-semibold text-zinc-200">
            How to use
          </h3>
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-zinc-400">
            <li>
              Paste the source passage in one language, then either paste
              your own translation into another language column, or add an
              empty column, name it, and click &quot;Translate empty columns
              with AI&quot; to fill it in automatically.
            </li>
            <li>
              Sentences are split automatically (by . ! ? and paragraph breaks)
              — abbreviations aren&apos;t handled, so keep only sentence-ending
              punctuation in the pasted text.
            </li>
            <li>Pick an output format and click the format button.</li>
            <li>
              Reorder, collapse, or remove a column directly from the preview
              table headers.
            </li>
            <li>
              Click &quot;Copy&quot; to copy the formatted text anywhere, or
              &quot;Save to a new note&quot; to send it straight to your Reading
              notes.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
