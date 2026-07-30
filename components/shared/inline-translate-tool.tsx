"use client";

import { useState } from "react";
import {
  groupMarkedRuns,
  tokenizeWords,
  type MarkedRun,
  type TextToken,
} from "@/lib/clickable-words";
import { translateMarkedPhrases } from "@/app/actions/inline-translate-actions";

type TranslatedResult = {
  tokens: TextToken[];
  runs: MarkedRun[];
  translations: Map<string, string>;
};

function renderResult(result: TranslatedResult, showTranslations: boolean) {
  const runByStart = new Map(result.runs.map((run) => [run.startIndex, run]));
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < result.tokens.length) {
    const run = runByStart.get(i);
    if (run) {
      if (showTranslations) {
        const translation = result.translations.get(run.text);
        nodes.push(
          <span key={i}>
            <strong className="text-indigo-200">{run.text}</strong>
            {translation && (
              <em className="text-zinc-400"> ({translation})</em>
            )}
          </span>,
        );
      } else {
        nodes.push(<span key={i}>{run.text}</span>);
      }
      i = run.endIndex + 1;
    } else {
      nodes.push(result.tokens[i].text);
      i += 1;
    }
  }

  return nodes;
}

export default function InlineTranslateTool() {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [markedWords, setMarkedWords] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showTranslations, setShowTranslations] = useState(true);
  const [result, setResult] = useState<TranslatedResult | null>(null);

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
    setResult(null);
    setTranslateError(null);
  }

  async function handleTranslate() {
    const tokens = tokenizeWords(text);
    const runs = groupMarkedRuns(tokens, markedWords);

    if (runs.length === 0) {
      setTranslateError("Mark at least one word before translating.");
      return;
    }

    const uniquePhrases = Array.from(new Set(runs.map((run) => run.text)));

    setTranslating(true);
    setTranslateError(null);
    try {
      const translated = await translateMarkedPhrases(
        uniquePhrases,
        text,
        targetLanguage,
      );
      const translations = new Map(
        uniquePhrases.map((phrase, index) => [phrase, translated[index]]),
      );
      setResult({ tokens, runs, translations });
      setShowTranslations(true);
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : "Translation failed.",
      );
    } finally {
      setTranslating(false);
    }
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
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
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

            {translateError && (
              <p className="mt-3 text-sm text-red-400">{translateError}</p>
            )}

            <button
              onClick={handleTranslate}
              disabled={translating || markedWords.size === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translating ? "Translating…" : "Translate marked words"}
            </button>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Result</h2>
              <button
                onClick={() => setShowTranslations((value) => !value)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                {showTranslations ? "Hide translations" : "Show translations"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-100">
              {renderResult(result, showTranslations)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
