"use client";

import { useState } from "react";
import { checkWriting } from "@/app/actions/writing-check-actions";

type Correction = {
  original: string;
  corrected: string;
  explanation: string;
};

export default function WritingCheckTool() {
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);

  function handleClear() {
    setText("");
    setCorrections(null);
    setCheckError(null);
  }

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await checkWriting(text);
      setCorrections(result);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed.");
      setCorrections(null);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Writing Check
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste or write something, and get any mistakes — grammar, word
            choice, phrasing — pointed out with a corrected version and why.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Text</h2>
            <button
              onClick={handleClear}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              Clear
            </button>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write or paste your text here..."
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          {checkError && (
            <p className="mt-3 text-sm text-red-400">{checkError}</p>
          )}

          <button
            onClick={handleCheck}
            disabled={checking || !text.trim()}
            className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>

        {corrections && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              Result
            </h2>

            {corrections.length === 0 ? (
              <p className="text-sm text-emerald-400">Looks good ✅</p>
            ) : (
              <ul className="space-y-4">
                {corrections.map((correction, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="text-sm text-red-400 line-through decoration-red-500/60">
                      {correction.original}
                    </p>
                    <p className="mt-1 text-sm font-medium text-emerald-400">
                      {correction.corrected}
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {correction.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
