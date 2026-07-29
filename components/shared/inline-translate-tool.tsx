"use client";

import { useState } from "react";
import { tokenizeWords } from "@/lib/clickable-words";

export default function InlineTranslateTool() {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [markedWords, setMarkedWords] = useState<Set<string>>(new Set());

  function toggleWord(word: string) {
    setMarkedWords((prev) => {
      const next = new Set(prev);
      if (next.has(word)) {
        next.delete(word);
      } else {
        next.add(word);
      }
      return next;
    });
  }

  function handleClear() {
    setText("");
    setMarkedWords(new Set());
  }

  const tokens = tokenizeWords(text);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Inline Translate
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage, click the words you don&apos;t know, and get
            their translation inserted right next to them.
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
            placeholder="Paste your text here..."
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          <label className="mt-4 block text-sm font-semibold text-zinc-300">
            Translate marked words into
            <input
              type="text"
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              placeholder="e.g. German"
              className="mt-2 w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
          </label>
        </div>

        {text && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">
                Click the words you don&apos;t know
              </h2>
              <span className="text-sm text-zinc-500">
                {markedWords.size} marked
              </span>
            </div>
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-100">
              {tokens.map((token, index) =>
                token.isWord ? (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleWord(token.text)}
                    className={`cursor-pointer rounded p-0 transition-colors ${
                      markedWords.has(token.text)
                        ? "bg-indigo-600/40 font-semibold text-indigo-200 underline decoration-indigo-400 decoration-2 underline-offset-2"
                        : "bg-transparent text-inherit hover:bg-indigo-600/20"
                    }`}
                  >
                    {token.text}
                  </button>
                ) : (
                  token.text
                ),
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
