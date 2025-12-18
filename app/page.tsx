"use client";

import { useState, useMemo } from "react";

export default function Home() {
  const [text, setText] = useState("");
  const [seenWords, setSeenWords] = useState<Set<string>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);

  // Process text and identify new/repeated words
  const processedText = useMemo(() => {
    if (!text.trim()) return [];

    // Remove punctuation and split into tokens
    const tokens = text.split(/(\s+)/);

    // Track words seen in the current text
    const currentTextWords = new Map<string, number>();

    return tokens.map((token, index) => {
      // Keep whitespace as-is
      if (/^\s+$/.test(token)) {
        return { text: token, type: "whitespace", key: `ws-${index}` };
      }

      // Remove punctuation from the word
      const cleanWord = token
        .replace(/[!?.,;:"""''`()[\]{}]/g, "")
        .toLowerCase();

      // Skip empty words (only punctuation)
      if (cleanWord.length === 0) {
        return { text: token, type: "punctuation", key: `punct-${index}` };
      }

      // Check if this word has appeared before (in previous texts OR earlier in current text)
      const previousOccurrences = currentTextWords.get(cleanWord) || 0;
      const wasSeenBefore = seenWords.has(cleanWord);

      // Mark as repeated if: seen in previous texts OR appeared earlier in current text
      const isRepeated = wasSeenBefore || previousOccurrences > 0;

      // Increment occurrence count for this word in current text
      currentTextWords.set(cleanWord, previousOccurrences + 1);

      return {
        text: token,
        cleanWord,
        type: isRepeated ? "repeated" : "new",
        key: `word-${index}`,
      };
    });
  }, [text, seenWords]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleReset = () => {
    setSeenWords(new Set());
    setText("");
  };

  const handleCopyText = () => {
    // Generate the formatted text with brackets
    const formattedText = processedText
      .map((token) => {
        if (token.type === "new") {
          return `[${token.text}]`;
        }
        return token.text;
      })
      .join("");

    // Copy to clipboard
    navigator.clipboard.writeText(formattedText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const stats = useMemo(() => {
    const newCount = processedText.filter((t) => t.type === "new").length;
    const repeatedCount = processedText.filter(
      (t) => t.type === "repeated"
    ).length;
    const totalWords = newCount + repeatedCount;
    return { newCount, repeatedCount, totalWords };
  }, [processedText]);

  return (
    <div className="min-h-screen w-full bg-linear-to-br from-[#f5f7fa] to-[#c3cfe2]">
      <div className="mx-auto max-w-225 px-8 py-8">
        <header className="mb-12 text-center">
          <h1 className="m-0 text-4xl font-bold text-[#2c3e50] drop-shadow-sm">
            📚 Vocabulary Learning Tool
          </h1>
          <p className="mt-3 text-lg text-[#5a6c7d]">
            Paste text to track new and repeated words
          </p>
        </header>

        <div className="mb-8 flex justify-center gap-4">
          <button
            onClick={handleReset}
            className="rounded-lg bg-linear-to-br from-[#f093fb] to-[#f5576c] px-6 py-3 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            Reset All
          </button>
        </div>

        <div className="mb-10 flex justify-center gap-6 rounded-xl bg-white p-6 shadow-lg">
          <div className="flex flex-col items-center gap-2 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              New Words:
            </span>
            <span className="text-3xl font-bold text-emerald-600">
              {stats.newCount}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Repeated Words:
            </span>
            <span className="text-3xl font-bold text-gray-400">
              {stats.repeatedCount}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Total Words:
            </span>
            <span className="text-3xl font-bold text-[#2c3e50]">
              {stats.totalWords}
            </span>
          </div>
        </div>

        <div className="mb-8 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-2xl font-semibold text-[#2c3e50]">
            Input Text
          </h2>
          <textarea
            value={text}
            onChange={handleTextChange}
            placeholder="Paste your text here..."
            className="w-full resize-y rounded-lg border-2 border-gray-200 bg-[#fafafa] p-4 text-base font-sans transition-all duration-300 focus:border-indigo-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.1)] focus:outline-none"
            rows={8}
          />
        </div>

        {text && (
          <div className="mb-8 rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-2xl font-semibold text-[#2c3e50]">
                Analysis
              </h2>
              <button
                onClick={handleCopyText}
                className="rounded-lg bg-linear-to-br from-[#4facfe] to-[#00f2fe] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
              >
                {copySuccess ? "✓ Copied!" : "📋 Copy Text"}
              </button>
            </div>
            <div className="mb-5 flex gap-8 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <span className="rounded border border-emerald-400 bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                  [Brackets]
                </span>{" "}
                = New words
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded px-2 py-1 font-semibold text-gray-400">
                  Gray
                </span>{" "}
                = Repeated words
              </span>
            </div>
            <div className="whitespace-pre-wrap wrap-break-word rounded-lg border-2 border-gray-200 bg-linear-to-b from-white to-gray-50 p-6 text-lg leading-8">
              {processedText.map((token) => {
                if (
                  token.type === "whitespace" ||
                  token.type === "punctuation"
                ) {
                  return <span key={token.key}>{token.text}</span>;
                }

                return (
                  <span
                    key={token.key}
                    className={
                      token.type === "new"
                        ? "rounded border border-emerald-400 bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700"
                        : "text-gray-400 opacity-80"
                    }
                    title={token.cleanWord}
                  >
                    {token.type === "new" ? `[${token.text}]` : token.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
