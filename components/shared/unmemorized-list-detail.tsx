"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  appendCardsToShuffleList,
  deleteShuffleCard,
  toggleShuffleCardFavorite,
  toggleShuffleCardMemorized,
} from "@/app/actions/shuffle-actions";

type ShuffleType = "word" | "phrase";

type DetailList = {
  id: string;
  title: string;
  type: ShuffleType;
};

type DetailCard = {
  id: string;
  listId: string;
  text: string;
  memorized: boolean;
  favorite: boolean;
};

type Props = {
  list: DetailList;
  cards: DetailCard[];
  typeFilter?: ShuffleType;
};

export default function UnmemorizedListDetail({
  list,
  cards: initialCards,
  typeFilter,
}: Props) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [isBusy, setIsBusy] = useState(false);
  const [itemsText, setItemsText] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const backPath = typeFilter
    ? `/unmemorized?type=${typeFilter}`
    : "/unmemorized";
  const reviewPath =
    list.type === "word"
      ? `/vocabulary/shuffle/review/${list.id}`
      : `/reading/shuffle/review/${list.id}`;

  async function handleAppend() {
    if (isBusy || !itemsText.trim()) return;

    setIsBusy(true);
    try {
      await appendCardsToShuffleList(list.id, itemsText);
      setItemsText("");
      setShowAdd(false);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      window.alert(message);
    } finally {
      setIsBusy(false);
    }
  }

  function handleToggleMemorized(cardId: string) {
    void toggleShuffleCardMemorized(cardId);
    setCards((current) => current.filter((card) => card.id !== cardId));
  }

  function handleToggleFavorite(cardId: string) {
    void toggleShuffleCardFavorite(cardId);
    setCards((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, favorite: !card.favorite } : card,
      ),
    );
  }

  function handleDelete(cardId: string) {
    void deleteShuffleCard(cardId);
    setCards((current) => current.filter((card) => card.id !== cardId));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <button
          onClick={() => router.push(backPath)}
          className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ChevronLeftIcon />
          All unmemorized lists
        </button>

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span
              className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                list.type === "word"
                  ? "bg-indigo-900/60 text-indigo-300"
                  : "bg-emerald-900/60 text-emerald-300"
              }`}
            >
              {list.type === "word" ? "Vocab" : "Phrase"}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {list.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {cards.length} unmemorized item{cards.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => router.push(reviewPath)}
              className="rounded-lg border border-indigo-600 px-3 py-2 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-600 hover:text-white"
            >
              Review
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Add items
            </button>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CheckCircleIcon />
            <p className="mt-4 font-medium text-zinc-300">
              All items in this list are memorized.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            {cards.map((card) => (
              <div
                key={card.id}
                className="flex flex-col gap-2 border-b border-zinc-800 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <p className="whitespace-pre-wrap text-sm text-zinc-200">
                  {card.text}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleToggleMemorized(card.id)}
                    className="rounded-md bg-emerald-900/60 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900"
                  >
                    Memorized
                  </button>
                  <button
                    onClick={() => handleToggleFavorite(card.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      card.favorite
                        ? "bg-amber-900/60 text-amber-300 hover:bg-amber-900"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    Favorite
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              Add items
            </h2>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Items{" "}
              <span className="normal-case font-normal text-zinc-500">
                (one per line)
              </span>
            </label>
            <textarea
              value={itemsText}
              onChange={(event) => setItemsText(event.target.value)}
              rows={8}
              className="mb-5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAppend}
                disabled={isBusy || !itemsText.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9 11 5 7l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        className="text-emerald-400"
      />
      <path
        d="m8 12 2.5 2.5L16 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-400"
      />
    </svg>
  );
}
