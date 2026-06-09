"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteShuffleCard,
  toggleShuffleCardFavorite,
  toggleShuffleCardMemorized,
  updateShuffleCardText,
} from "@/app/actions/shuffle-actions";
import { shuffle } from "@/lib/shuffle";

type ShuffleType = "word" | "phrase";
type ShuffleFilter = "all" | "unmemorized" | "memorized" | "favorites";

type ReviewCard = {
  id: string;
  listId: string;
  text: string;
  memorized: boolean;
  favorite: boolean;
  list: {
    id: string;
    title: string;
    type: ShuffleType;
  };
};

type Props = {
  listId: string | "all";
  type: ShuffleType;
  dashboardPath: string;
  listTitle: string;
  cards: ReviewCard[];
  initialFilter?: ShuffleFilter;
};

function getFilteredQueue(
  cards: ReviewCard[],
  filter: ShuffleFilter,
  listId: string | "all",
) {
  const scopedCards =
    listId === "all" ? cards : cards.filter((card) => card.listId === listId);
  const filtered =
    filter === "all"
      ? scopedCards
      : filter === "favorites"
        ? scopedCards.filter((card) => card.favorite)
        : filter === "memorized"
          ? scopedCards.filter((card) => card.memorized)
          : scopedCards.filter((card) => !card.memorized);

  return shuffle(filtered);
}

export default function VocabularyShuffleSession({
  listId,
  type,
  dashboardPath,
  listTitle,
  cards: initialCards,
  initialFilter = "unmemorized",
}: Props) {
  const router = useRouter();
  const [allCards, setAllCards] = useState<ReviewCard[]>(initialCards);
  const [filter, setFilter] = useState<ShuffleFilter>(initialFilter);
  const [queue, setQueue] = useState<ReviewCard[]>(() =>
    getFilteredQueue(initialCards, initialFilter, listId),
  );
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  const current = queue[index];
  const done = queue.length === 0 || index >= queue.length;
  const currentMemorized = current?.memorized ?? false;
  const currentFavorite = current?.favorite ?? false;
  const totalInFilter = queue.length;
  const label = type === "word" ? "word" : "phrase";

  function handleNext() {
    setEditing(false);
    setConfirmDelete(false);
    setIndex((currentIndex) => Math.min(currentIndex + 1, queue.length));
  }

  function handleToggleMemorized() {
    if (!current) return;

    void toggleShuffleCardMemorized(current.id);

    setAllCards((cards) =>
      cards.map((card) =>
        card.id === current.id ? { ...card, memorized: !card.memorized } : card,
      ),
    );
    setQueue((cards) =>
      cards.map((card) =>
        card.id === current.id ? { ...card, memorized: !card.memorized } : card,
      ),
    );
  }

  function handleToggleFavorite() {
    if (!current) return;

    void toggleShuffleCardFavorite(current.id);

    setAllCards((cards) =>
      cards.map((card) =>
        card.id === current.id ? { ...card, favorite: !card.favorite } : card,
      ),
    );
    setQueue((cards) =>
      cards.map((card) =>
        card.id === current.id ? { ...card, favorite: !card.favorite } : card,
      ),
    );
  }

  function handleDeleteCard() {
    if (!current) return;

    void deleteShuffleCard(current.id);

    setAllCards((cards) => cards.filter((card) => card.id !== current.id));
    const nextQueue = queue.filter((card) => card.id !== current.id);

    if (nextQueue.length === 0) {
      setQueue([]);
      setIndex(0);
    } else {
      setQueue(nextQueue);
      setIndex((currentIndex) => Math.min(currentIndex, nextQueue.length - 1));
    }

    setConfirmDelete(false);
    setEditing(false);
  }

  function handleEditSave() {
    if (!current) return;

    const text = editText.trim();
    if (!text || text === current.text) {
      setEditing(false);
      return;
    }

    void updateShuffleCardText(current.id, text);

    setAllCards((cards) =>
      cards.map((card) => (card.id === current.id ? { ...card, text } : card)),
    );
    setQueue((cards) =>
      cards.map((card) => (card.id === current.id ? { ...card, text } : card)),
    );
    setEditing(false);
  }

  function handleFilterChange(nextFilter: ShuffleFilter) {
    if (nextFilter === filter) return;

    setFilter(nextFilter);
    setQueue(getFilteredQueue(allCards, nextFilter, listId));
    setIndex(0);
    setEditing(false);
    setConfirmDelete(false);
  }

  function handleRestart() {
    setQueue(getFilteredQueue(allCards, filter, listId));
    setIndex(0);
    setEditing(false);
    setConfirmDelete(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg">
        <button
          onClick={() => router.push(dashboardPath)}
          className="absolute -top-10 right-0 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ChevronLeftIcon />
          Back to dashboard
        </button>

        <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 pb-3 pt-5">
            <span className="max-w-45 truncate text-xs font-medium text-zinc-400">
              {listTitle}
            </span>
            <FilterTabs value={filter} onChange={handleFilterChange} />
          </div>

          {done ? (
            <div className="flex flex-col items-center justify-center gap-4 px-5 py-16 text-center">
              {totalInFilter === 0 ? (
                <>
                  <p className="text-zinc-400">
                    No {label}s match the current filter.
                  </p>
                  <button
                    onClick={() => handleFilterChange("all")}
                    className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
                  >
                    Show all {label}s
                  </button>
                </>
              ) : (
                <>
                  <CheckCircleIcon />
                  <p className="font-medium text-zinc-200">Session complete!</p>
                  <p className="text-sm text-zinc-500">
                    You reviewed {totalInFilter} {label}
                    {totalInFilter !== 1 ? "s" : ""}.
                  </p>
                  <button
                    onClick={handleRestart}
                    className="mt-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    Restart &amp; reshuffle
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="px-5 pt-4">
                <div className="mb-1.5 flex justify-between text-xs text-zinc-600">
                  <span>
                    {index + 1} / {totalInFilter}
                  </span>
                  <span>
                    {currentMemorized ? "Memorized" : ""}
                    {currentMemorized && currentFavorite ? " | " : ""}
                    {currentFavorite ? "Favorite" : ""}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-zinc-800">
                  <div
                    className="h-1 rounded-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${((index + 1) / totalInFilter) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex min-h-35 items-center px-5 pb-2 pt-6">
                {editing ? (
                  <textarea
                    ref={editRef}
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleEditSave();
                      }
                      if (event.key === "Escape") {
                        setEditing(false);
                      }
                    }}
                    rows={3}
                    className="w-full rounded-lg border border-indigo-500 bg-zinc-800 px-3 py-2 text-base text-zinc-100 outline-none resize-none"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-xl font-medium leading-relaxed text-zinc-100">
                    {current?.text}
                  </p>
                )}
              </div>

              {confirmDelete && (
                <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-800 bg-red-950/60 px-4 py-3">
                  <span className="text-sm text-red-300">
                    Delete this {label}?
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteCard}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleMemorized}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      currentMemorized
                        ? "bg-emerald-900/60 text-emerald-400 hover:bg-emerald-900"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <CheckIcon />
                    {currentMemorized ? "Memorized" : "Mark memorized"}
                  </button>

                  <button
                    onClick={handleToggleFavorite}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      currentFavorite
                        ? "bg-amber-900/60 text-amber-400 hover:bg-amber-900"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <StarIcon />
                    {currentFavorite ? "Favorite" : "Mark favorite"}
                  </button>

                  {editing ? (
                    <button
                      onClick={handleEditSave}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
                    >
                      Save
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEditText(current?.text ?? "");
                        setEditing(true);
                        setConfirmDelete(false);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <EditIcon />
                      Edit
                    </button>
                  )}

                  {!editing && (
                    <button
                      onClick={() => setConfirmDelete((value) => !value)}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-red-400"
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  )}
                </div>

                <button
                  onClick={handleNext}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Next
                  <ChevronRightIcon />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: ShuffleFilter;
  onChange: (filter: ShuffleFilter) => void;
}) {
  const tabs: { key: ShuffleFilter; label: string }[] = [
    { key: "unmemorized", label: "Unmemorized" },
    { key: "all", label: "All" },
    { key: "memorized", label: "Memorized" },
    { key: "favorites", label: "Favorites" },
  ];

  return (
    <div className="flex gap-0.5 rounded-lg bg-zinc-800 p-0.5">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === key
              ? "bg-indigo-600 text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M5 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 6.5l3.5 3.5L11 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M6.5 1.5l1.55 3.15 3.48.5-2.52 2.46.6 3.47L6.5 9.45 3.39 11.08l.6-3.47L1.47 5.15l3.48-.5L6.5 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke="#4f46e5" strokeWidth="2" />
      <path
        d="M12 20l6 6 10-12"
        stroke="#4f46e5"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1.5 3.5h10M4.5 3.5V2.5h4v1M5 5.5v4M8 5.5v4M2.5 3.5l.7 7.5h6.6l.7-7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
