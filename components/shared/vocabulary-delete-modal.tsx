"use client";

import { useEffect } from "react";

// The last stop before words are gone for good, so it says how many, what goes
// with them and what stays. Ticks survive a filter, which means a selection can
// hold words that aren't on screen; this is the one action that can't be taken
// back, so it is the one that says so.
export default function VocabularyDeleteModal({
  wordCount,
  hiddenCount,
  running,
  error,
  onCancel,
  onConfirm,
}: {
  wordCount: number;
  // How many of the selected words the current filters are hiding.
  hiddenCount: number;
  running: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !running) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, running]);

  const count = `${wordCount} word${wordCount !== 1 ? "s" : ""}`;
  const them = wordCount !== 1 ? "them" : "it";
  const their = wordCount !== 1 ? "their" : "its";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={() => !running && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-words-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="delete-words-title"
          className="mb-2 text-lg font-semibold text-zinc-100"
        >
          Delete {count}?
        </h2>
        <p className="mb-3 text-sm text-zinc-400">
          This permanently deletes {them}, with {their} translations and
          information. Flashcards you already made from {them} stay. This cannot
          be undone.
        </p>
        {hiddenCount > 0 && (
          <p className="mb-3 text-sm text-amber-400">
            {hiddenCount === wordCount
              ? `${wordCount !== 1 ? "All of them are" : "It is"} hidden by your filters or search right now.`
              : `${hiddenCount} of them ${hiddenCount !== 1 ? "are" : "is"} hidden by your filters or search right now.`}
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Deleting…" : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}
