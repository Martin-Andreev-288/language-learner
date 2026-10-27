"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteShuffleCard,
  markShuffleListsReviewed,
  toggleShuffleCardFavorite,
  toggleShuffleCardMemorized,
  updateShuffleCardText,
} from "@/app/actions/shuffle-actions";
import { shuffle } from "@/lib/shuffle";
import { tokenizeWords, type TextToken } from "@/lib/clickable-words";
import { isTouchScreen } from "@/lib/is-touch-screen";
import { sentenceAroundToken } from "@/lib/word-lookup";
import KeyboardHints from "@/components/shared/keyboard-hints";
import WordLookupWindow, {
  type LookupTarget,
} from "@/components/shared/word-lookup-window";

// The word open in the shared lookup window (Question 55, chapter B), on
// which card: the window shows only while that card is the one on screen.
// `key` is new for every opening, so each word gets a window of its own.
type OpenLookup = {
  key: number;
  cardId: string;
  target: LookupTarget;
};

function renderClickableText(
  text: string,
  onWordClick: (tokens: TextToken[], index: number, word: HTMLElement) => void,
) {
  const tokens = tokenizeWords(text);
  return tokens.map((token, index) =>
    token.isWord ? (
      <button
        key={index}
        type="button"
        onClick={(event) => onWordClick(tokens, index, event.currentTarget)}
        className="cursor-pointer rounded bg-transparent p-0 text-inherit transition-colors hover:bg-indigo-600/30 hover:text-indigo-200"
      >
        {token.text}
      </button>
    ) : (
      token.text
    ),
  );
}

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
  // The lists that "Mark as reviewed" records: the one list, or every list
  // in a due or hand-picked review. Empty for Review All, which spans every
  // list and so has no button — marking all of them would reset the
  // schedule of lists that were never actually due.
  reviewListIds: string[];
  // Which language a lookup's definition comes back in. Empty means the
  // model's own default, which is English — what this page did before.
  defaultTranslateLanguage: string;
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
  reviewListIds,
  defaultTranslateLanguage,
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
  const [reviewMarked, setReviewMarked] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [lookup, setLookup] = useState<OpenLookup | null>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  const current = queue[index];
  const done = queue.length === 0 || index >= queue.length;

  function handleStartEdit() {
    if (!current) return;
    setEditText(current.text);
    setEditing(true);
    setConfirmDelete(false);
  }

  // A word on a phrase card, looked up in the shared window: translated
  // first, with its definition one press away (Question 55).
  function handleWordClick(tokens: TextToken[], index: number, word: HTMLElement) {
    if (!current) return;
    // A new key for each word, so each one gets a window of its own.
    setLookup((open) => ({
      key: (open?.key ?? 0) + 1,
      cardId: current.id,
      target: {
        word: tokens[index].text,
        context: sentenceAroundToken(tokens, index),
        element: word,
      },
    }));
  }

  const currentMemorized = current?.memorized ?? false;
  const currentFavorite = current?.favorite ?? false;
  const totalInFilter = queue.length;
  const label = type === "word" ? "word" : "phrase";

  function handleNext() {
    setEditing(false);
    setConfirmDelete(false);
    setIndex((currentIndex) => Math.min(currentIndex + 1, queue.length));
  }

  // Back one card (Question 386, item 2). Shadowing has had this since
  // Question 361; flashcards only ever went forwards, so a card you skipped
  // past by a keystroke was gone for the rest of the session.
  //
  // Safe as a plain index step, which is worth stating because it wouldn't
  // be under a different queue model: marking a card memorized here *edits*
  // it in place rather than dropping it from the queue, so the list you are
  // walking doesn't change shape underneath you and the card at index - 1 is
  // still the card you just saw. Deleting is the one thing that does shorten
  // the queue, and it already re-clamps the index itself.
  function handlePrev() {
    setEditing(false);
    setConfirmDelete(false);
    setIndex((currentIndex) => Math.max(currentIndex - 1, 0));
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
    setReviewMarked(false);
  }

  function handleRestart() {
    setQueue(getFilteredQueue(allCards, filter, listId));
    setIndex(0);
    setEditing(false);
    setConfirmDelete(false);
    setReviewMarked(false);
  }

  function handleMarkReviewed() {
    if (reviewListIds.length === 0 || reviewMarked) return;

    void markShuffleListsReviewed(reviewListIds);
    setReviewMarked(true);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (editing) return;
      // While a word is being looked up, the keys belong to the window: a
      // press of Enter or Space would otherwise move to the next card
      // behind it.
      if (lookup) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      switch (event.key) {
        case "Enter":
        case " ":
        case "ArrowRight":
          event.preventDefault();
          handleNext();
          break;
        case "ArrowLeft":
          event.preventDefault();
          handlePrev();
          break;
        case "m":
        case "M":
          event.preventDefault();
          handleToggleMemorized();
          break;
        case "f":
        case "F":
          event.preventDefault();
          handleToggleFavorite();
          break;
        case "e":
        case "E":
          event.preventDefault();
          handleStartEdit();
          break;
        case "Delete":
          event.preventDefault();
          if (current) setConfirmDelete((value) => !value);
          break;
        case "b":
        case "B":
          event.preventDefault();
          router.push(dashboardPath);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg">
        <button
          onClick={() => router.push(dashboardPath)}
          title="Shortcut: B"
          className="absolute -top-10 right-0 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ChevronLeftIcon />
          Back to dashboard
        </button>

        {/* A ceiling on the whole card, as a backstop (Question 386,
            item 5). The real fix is the scrolling text box further down —
            this is for the case that one can't cover: a narrow window where
            the six buttons wrap onto three rows and push the card past the
            screen anyway. Scrolling then is ugly; a Next button you cannot
            reach at all is worse.

            85vh rather than 95: the modal centres the card, so the leftover
            is split top and bottom, and "Back to dashboard" is positioned
            40px *above* the card. Much taller and that button is the thing
            that goes off-screen instead.

            overflow-y-auto rather than the overflow-hidden that was here —
            it still clips children to the rounded corners, which is what
            that was for. */}
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
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
                  <div className="mt-2 flex items-center gap-3">
                    {reviewListIds.length > 0 && (
                      <button
                        onClick={handleMarkReviewed}
                        disabled={reviewMarked}
                        className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {reviewMarked ? "Reviewed ✓" : "Mark as reviewed"}
                      </button>
                    )}
                    <button
                      onClick={handleRestart}
                      className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                    >
                      Restart &amp; reshuffle
                    </button>
                  </div>
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

              {/* The bug this step exists for (Question 386, item 5): a
                  card holding a whole paragraph grew until the buttons
                  underneath it were off the bottom of the screen, with no
                  way to scroll to them — so a long phrase in Reading
                  Shuffle was a dead end you had to leave the page to escape.

                  The cap goes on an inner box rather than on this one, and
                  that is the part worth not "simplifying" later: this
                  container centres its child, and a centred child that
                  overflows spills equally past the top and the bottom.
                  Scrolling cannot recover the top half — scrollTop has no
                  negative side — so putting the scroll here would have left
                  the first lines of a long phrase permanently unreachable.
                  A bounded child never overflows its parent, so the
                  centring stays honest and the scrolling happens inside.

                  The cap is the card's own 85vh ceiling minus the furniture
                  around it — header, progress bar, buttons, hints — because
                  that furniture costs a fixed number of pixels rather than
                  a share of the screen. A flat "half the viewport" looked
                  right and quietly failed under about 620px tall, where
                  212px of fixed chrome plus half the screen adds up to more
                  than 85% of it, and the card would have started scrolling
                  as a whole instead of just the phrase. */}
              <div className="flex min-h-35 items-center px-5 pb-2 pt-6">
                <div className="max-h-[calc(85vh-14rem)] w-full overflow-y-auto">
                  {editing ? (
                    <textarea
                      ref={editRef}
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      onKeyDown={(event) => {
                        // Enter saves only where Shift+Enter can be typed
                        // for a line break. A phone keyboard has no Shift+
                        // Enter, so there Enter saving left no way to break
                        // a line at all — and a phone user reaches for the
                        // Save button anyway. So on a touch screen Enter
                        // does what it does in any other text box.
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !isTouchScreen()
                        ) {
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
                      {type === "phrase" && current
                        ? renderClickableText(current.text, handleWordClick)
                        : current?.text}
                    </p>
                  )}
                </div>
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

              {/* Wraps rather than sits on one line (Question 391). The
                  card is max-w-lg — 512px — and the row held five buttons
                  before Previous joined it. Six never fit, and because the
                  card is overflow-hidden the surplus wasn't pushed out of
                  view, it was sliced off mid-button.

                  justify-between traded for ml-auto on the nav pair: with
                  wrapping enabled, justify-between drops a wrapped group to
                  the *left* of the new line, while ml-auto keeps it right
                  whether it shares the line or takes its own. The result is
                  actions on one row and movement on the next, which is a
                  better grouping than the accident that produced it. */}
              <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleToggleMemorized}
                    title="Shortcut: M"
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
                    title="Shortcut: F"
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
                    <>
                      <button
                        onClick={handleEditSave}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
                      >
                        Save
                      </button>
                      {/* Escape was the only way out of an edit, and a
                          phone has no Escape key — so on a phone an edit
                          you'd changed your mind about couldn't be
                          abandoned, only saved. */}
                      <button
                        onClick={() => setEditing(false)}
                        title="Shortcut: Esc"
                        className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleStartEdit}
                      title="Shortcut: E"
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <EditIcon />
                      Edit
                    </button>
                  )}

                  {!editing && (
                    <button
                      onClick={() => setConfirmDelete((value) => !value)}
                      title="Shortcut: Del"
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-red-400"
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  )}
                </div>

                {/* Previous sits beside Next rather than the new key
                    being keyboard-only. A shortcut with nothing on screen
                    that corresponds to it is a feature only the person who
                    built it knows about — which is the complaint that
                    started this pair of changes in the first place. */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={index === 0}
                    title="Shortcut: ←"
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeftIcon />
                    Previous
                  </button>
                  <button
                    onClick={handleNext}
                    title="Shortcut: Enter / Space / →"
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    Next
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>

              {/* Listed rather than left in the buttons' tooltips
                  (Question 386, item 1). Ordered by how often you'd reach
                  for them, not alphabetically or by keyboard position. */}
              {/* While editing, the card's own shortcuts are switched off
                  (the key handler returns early), so listing them would
                  describe keys that do nothing. The edit keys replace them
                  — and they were never written down anywhere before. */}
              <KeyboardHints
                className="px-5 pb-5"
                hints={
                  editing
                    ? [
                        { keys: ["Enter"], label: "save" },
                        { keys: ["Shift + Enter"], label: "new line" },
                        { keys: ["Esc"], label: "cancel" },
                      ]
                    : [
                        { keys: ["←", "→"], label: "move" },
                        { keys: ["Space"], label: "next" },
                        { keys: ["M"], label: "memorized" },
                        { keys: ["F"], label: "favourite" },
                        { keys: ["E"], label: "edit" },
                        { keys: ["B"], label: "back" },
                      ]
                }
              />
            </>
          )}
        </div>
      </div>

      {lookup && lookup.cardId === current?.id && (
        <WordLookupWindow
          key={lookup.key}
          target={lookup.target}
          translateInto={[defaultTranslateLanguage]}
          explainInLanguage={defaultTranslateLanguage}
          onClose={() => setLookup(null)}
        />
      )}
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
