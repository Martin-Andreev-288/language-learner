"use client";

import { useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";

export default function ShadowingTool() {
  const [text, setText] = useState("");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);

  const sentences = splitIntoSentences(text);
  const current = sentences[index];

  function handleStart() {
    if (sentences.length === 0) return;
    setIndex(0);
    setStarted(true);
  }

  function handleEditPassage() {
    setStarted(false);
  }

  function handlePrev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleNext() {
    setIndex((i) => Math.min(i + 1, sentences.length - 1));
  }

  function handleClear() {
    setText("");
    setStarted(false);
    setIndex(0);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Shadowing Practice
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage, then go through it one sentence at a time —
            practice repeating each one out loud at your own pace.
          </p>
        </div>

        {!started ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Passage</h2>
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
              placeholder="Paste the passage you want to practice…"
              className="h-64 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />

            {text.trim() && (
              <p className="mt-2 text-xs text-zinc-500">
                {sentences.length} sentence
                {sentences.length !== 1 ? "s" : ""} found.
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={sentences.length === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Start practicing
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-500">
                Sentence {index + 1} of {sentences.length}
              </span>
              <button
                onClick={handleEditPassage}
                className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Edit passage
              </button>
            </div>

            <div className="flex min-h-40 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center">
              <p className="text-xl leading-relaxed text-zinc-100">
                {current}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={handlePrev}
                disabled={index === 0}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                onClick={handleNext}
                disabled={index === sentences.length - 1}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
