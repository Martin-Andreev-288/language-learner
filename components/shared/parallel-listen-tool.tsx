"use client";

import { useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";

interface LanguageColumn {
  id: number;
  name: string;
  text: string;
  included: boolean;
}

interface AlignedRows {
  rows: string[][];
}

function parseColumns(columns: LanguageColumn[]): AlignedRows | null {
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

let nextColumnId = 0;
function makeColumn(name = ""): LanguageColumn {
  nextColumnId += 1;
  return { id: nextColumnId, name, text: "", included: true };
}

export default function ParallelListenTool() {
  const [columns, setColumns] = useState<LanguageColumn[]>(() => [
    makeColumn(),
    makeColumn(),
  ]);

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

  function handleRemoveLanguage(id: number) {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((column) => column.id !== id));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function handleClear() {
    setColumns([makeColumn(), makeColumn()]);
  }

  const parsed = parseColumns(columns);
  const includedCount = columns.filter((column) => column.included).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Parallel Listen
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste the same passage in two or more languages, choose which
            ones to hear, and listen to them sentence by sentence in the
            order the languages are arranged below — skipping the ones you
            leave unchecked.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
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
                  <label
                    title="Include in playback"
                    className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400"
                  >
                    <input
                      type="checkbox"
                      checked={column.included}
                      onChange={(event) =>
                        updateColumn(column.id, {
                          included: event.target.checked,
                        })
                      }
                      className="accent-indigo-600"
                    />
                    Play
                  </label>
                  <input
                    type="text"
                    value={column.name}
                    onChange={(event) =>
                      updateColumn(column.id, { name: event.target.value })
                    }
                    placeholder={`Language ${index + 1}`}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
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
                  placeholder={`Paste your ${column.name || "text"} here...`}
                  className="h-32 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
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
        </div>

        {parsed && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Preview</h2>
              <span className="text-sm text-zinc-500">
                {includedCount} of {columns.length} language
                {columns.length !== 1 ? "s" : ""} will be read
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-zinc-800">
                <thead>
                  <tr className="bg-zinc-800">
                    {columns.map((column, idx) => (
                      <th
                        key={column.id}
                        className="border border-zinc-800 px-4 py-2 text-left font-semibold text-zinc-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={
                              column.included ? "text-zinc-100" : "text-zinc-600"
                            }
                          >
                            {column.name.trim() || `Language ${idx + 1}`}
                            {!column.included && " (skipped)"}
                          </span>
                          {columns.length > 1 && (
                            <div className="flex gap-1">
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
                                disabled={idx === columns.length - 1}
                                title="Move column right"
                                className="rounded px-1.5 py-1 text-xs font-bold text-indigo-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                              >
                                →
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-zinc-800/60">
                      {row.map((text, colIdx) => (
                        <td
                          key={colIdx}
                          className={`border border-zinc-800 px-4 py-2 ${
                            columns[colIdx]?.included
                              ? "text-zinc-300"
                              : "text-zinc-600"
                          }`}
                        >
                          {text}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
