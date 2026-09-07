"use client";

import { useEffect, useState } from "react";
import { getShuffleLists } from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import { describeClientError } from "@/lib/client-error";

// Sending words from Vocabulary into a Vocab Shuffle list (Question 306).
//
// A separate modal rather than more buttons in the word list's toolbar,
// because this asks a question that needs an answer before anything can
// happen — which list? — and a button that silently picks one for you is
// the version of this feature nobody wants.

type Destination = { kind: "new"; title: string } | { kind: "existing"; listId: string };

// What goes on the card besides the word itself (Question 307).
//
// `translation` was a single switch until Question 333, when there stopped
// being one translation for it to mean. It's now the list of languages to
// print — empty for none, which is the same "off" the boolean used to
// express, so the recall-first default from Answer 306 survives the change
// intact.
export type CardContent = { nounInfo: boolean; languages: string[] };

type ExistingList = { id: string; title: string };

export default function VocabularyToShuffleModal({
  wordCount,
  running,
  error,
  suggestedTitle,
  availableLanguages,
  suggestedLanguage,
  onCancel,
  onConfirm,
}: {
  wordCount: number;
  running: boolean;
  error: string | null;
  // The language the selected words share, when they share one — a list of
  // German words is almost always going to be called something with
  // "German" in it, so offering that beats an empty box.
  suggestedTitle: string;
  // Only the languages the selected words are actually translated into,
  // built from their real data the same way the enrich modal and the
  // language filter build theirs — offering a language that would print
  // nothing on every card is worse than not offering it.
  availableLanguages: string[];
  // Which one to tick first when translations are switched on. Empty when
  // there's nothing sensible to suggest.
  suggestedLanguage: string;
  onCancel: () => void;
  onConfirm: (destination: Destination, content: CardContent) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState(suggestedTitle);
  const [lists, setLists] = useState<ExistingList[] | null>(null);
  const [listId, setListId] = useState("");
  const [listsError, setListsError] = useState<string | null>(null);
  // Both off to begin with, which keeps the card to the word alone — the
  // recall-first default Answer 306 argued for. Turning them on is a
  // deliberate act, not something that happens to you.
  const [content, setContent] = useState<CardContent>({
    nounInfo: false,
    languages: [],
  });

  // Two decisions met here and looked like they contradicted each other:
  // Answer 306 says a card starts as the word alone, and Question 330 asks
  // for the account's default language to be chosen for you. They only
  // conflict if "chosen" means "on" — so translations stay off until you
  // ask for them, and *then* your default is already ticked. Off by
  // default, right by default the moment it isn't.
  function toggleTranslations(on: boolean) {
    setContent((prev) => ({
      ...prev,
      languages: on
        ? suggestedLanguage
          ? [suggestedLanguage]
          : availableLanguages.slice(0, 1)
        : [],
    }));
  }

  function toggleLanguage(language: string) {
    setContent((prev) => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter((existing) => existing !== language)
        : [...prev.languages, language],
    }));
  }

  const wantsTranslations = content.languages.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !running) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, running]);

  // Fetched when the modal opens rather than handed down from the page: a
  // list created a minute ago on another tab should be offered here, and a
  // page rendered before that happened wouldn't know about it.
  useEffect(() => {
    let cancelled = false;
    getShuffleLists(ShuffleListType.word)
      .then((result) => {
        if (cancelled) return;
        setLists(result.map(({ id, title: listTitle }) => ({ id, title: listTitle })));
        // Only preselected when there's something to preselect; leaving it
        // empty would make "Add to existing" look available when it isn't.
        if (result.length > 0) setListId(result[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setLists([]);
        setListsError(describeClientError(err, "Couldn't load your lists."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasLists = (lists?.length ?? 0) > 0;
  const blocked =
    running ||
    (mode === "new" ? !title.trim() : !listId) ||
    lists === null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 px-4"
      onClick={() => !running && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-100">
          Send to Vocab Shuffle
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          {wordCount} word{wordCount !== 1 ? "s" : ""} — each becomes its own
          card. The words stay in your vocabulary too.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="radio"
              checked={mode === "new"}
              onChange={() => setMode("new")}
              className="accent-indigo-500"
            />
            A new list
          </label>
          {mode === "new" && (
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="List title"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
          )}

          <label
            className={`flex items-center gap-2 text-sm ${
              hasLists ? "text-zinc-300" : "cursor-not-allowed text-zinc-600"
            }`}
          >
            <input
              type="radio"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
              disabled={!hasLists}
              className="accent-indigo-500"
            />
            An existing list
            {lists === null && (
              <span className="text-xs text-zinc-600">loading…</span>
            )}
            {lists !== null && !hasLists && (
              <span className="text-xs text-zinc-600">
                — you don&apos;t have any yet
              </span>
            )}
          </label>
          {mode === "existing" && hasLists && (
            <select
              value={listId}
              onChange={(event) => setListId(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
            >
              {lists?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-5 border-t border-zinc-800 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Put on the card
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={content.nounInfo}
                onChange={(event) =>
                  setContent((prev) => ({
                    ...prev,
                    nounInfo: event.target.checked,
                  }))
                }
                className="accent-indigo-500"
              />
              Gender &amp; plural
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${
                availableLanguages.length > 0
                  ? "text-zinc-300"
                  : "cursor-not-allowed text-zinc-600"
              }`}
            >
              <input
                type="checkbox"
                checked={wantsTranslations}
                onChange={(event) => toggleTranslations(event.target.checked)}
                disabled={availableLanguages.length === 0}
                className="accent-indigo-500"
              />
              Translation
              {availableLanguages.length === 0 && (
                <span className="text-xs text-zinc-600">
                  — none of these words has one yet
                </span>
              )}
            </label>

            {/* Only once translations are on, and only when there's a real
                choice to make: one language is answered by the switch
                above, so a list of exactly one checkbox would be asking a
                question that has already been answered. */}
            {wantsTranslations && availableLanguages.length > 1 && (
              <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                {availableLanguages.map((language) => (
                  <label
                    key={language}
                    className="flex items-center gap-1.5 text-sm text-zinc-400"
                  >
                    <input
                      type="checkbox"
                      checked={content.languages.includes(language)}
                      onChange={() => toggleLanguage(language)}
                      className="accent-indigo-500"
                    />
                    {language}
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            {wantsTranslations
              ? "The word alone is better for testing recall — a card showing the translation gives its own answer away."
              : "Words missing either are added on their own, not skipped."}
          </p>
        </div>

        {listsError && <p className="mt-3 text-sm text-red-400">{listsError}</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={running}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm(
                mode === "new"
                  ? { kind: "new", title: title.trim() }
                  : { kind: "existing", listId },
                content,
              )
            }
            disabled={blocked}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
