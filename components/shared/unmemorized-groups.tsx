"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  appendCardsToShuffleList,
  createShuffleListWithCards,
} from "@/app/actions/shuffle-actions";

type ShuffleType = "word" | "phrase";

type Group = {
  listId: string;
  title: string;
  type: ShuffleType;
  unmemorizedCount: number;
};

type ExistingList = {
  id: string;
  title: string;
  type: ShuffleType;
};

type AddModal =
  | { open: false }
  | {
      open: true;
      mode: "existing" | "new";
      listId: string;
      title: string;
      type: ShuffleType;
      items: string;
    };

type Props = {
  groups: Group[];
  totals: {
    groups: number;
    cards: number;
  };
  existingLists: ExistingList[];
  typeFilter?: ShuffleType;
};

export default function UnmemorizedGroups({
  groups,
  totals,
  existingLists,
  typeFilter,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [addModal, setAddModal] = useState<AddModal>({ open: false });

  const heading =
    typeFilter === "word"
      ? "Unmemorized Vocabulary"
      : typeFilter === "phrase"
        ? "Unmemorized Phrases"
        : "Unmemorized";

  function openAddModal() {
    const scopedLists = typeFilter
      ? existingLists.filter((list) => list.type === typeFilter)
      : existingLists;

    setAddModal({
      open: true,
      mode: scopedLists.length > 0 ? "existing" : "new",
      listId: scopedLists[0]?.id ?? "",
      title: "",
      type: typeFilter ?? "word",
      items: "",
    });
  }

  async function runMutation(task: () => Promise<unknown>) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await task();
      setAddModal({ open: false });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      window.alert(message);
    } finally {
      setIsBusy(false);
    }
  }

  function submitAddModal() {
    if (!addModal.open) return;

    if (addModal.mode === "existing") {
      void runMutation(async () => {
        await appendCardsToShuffleList(addModal.listId, addModal.items);
      });
      return;
    }

    void runMutation(async () => {
      await createShuffleListWithCards(
        addModal.type,
        addModal.title,
        addModal.items,
      );
    });
  }

  const backPath =
    typeFilter === "word"
      ? "/vocabulary/shuffle"
      : typeFilter === "phrase"
        ? "/reading/shuffle"
        : "/";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          onClick={() => router.push(backPath)}
          className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ChevronLeftIcon />
          Back
        </button>

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {totals.cards} item{totals.cards !== 1 ? "s" : ""} remaining
              across {totals.groups} list{totals.groups !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            disabled={isBusy}
          >
            <PlusIcon />
            Add items
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <CheckCircleIcon />
            <p className="mt-4 font-medium text-zinc-300">
              All caught up, nothing left to memorize.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <button
                key={group.listId}
                type="button"
                onClick={() =>
                  router.push(
                    `/unmemorized/${group.listId}${typeFilter ? `?type=${typeFilter}` : ""}`,
                  )
                }
                className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-colors hover:border-zinc-700"
              >
                <span
                  className={`mb-3 inline-flex self-start rounded-full px-2 py-0.5 text-xs font-medium ${
                    group.type === "word"
                      ? "bg-indigo-900/60 text-indigo-300"
                      : "bg-emerald-900/60 text-emerald-300"
                  }`}
                >
                  {group.type === "word" ? "Vocab" : "Phrase"}
                </span>
                <h2 className="mb-3 font-semibold leading-snug text-zinc-100">
                  {group.title}
                </h2>
                <p className="text-sm text-zinc-500">
                  {group.unmemorizedCount} unmemorized item
                  {group.unmemorizedCount !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {addModal.open && (
        <Modal onClose={() => setAddModal({ open: false })}>
          <h2 className="mb-5 text-lg font-semibold text-zinc-100">
            Add items
          </h2>

          {existingLists.length > 0 && (
            <div className="mb-4 flex rounded-lg bg-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => setAddModal({ ...addModal, mode: "existing" })}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  addModal.mode === "existing"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                Add to existing list
              </button>
              <button
                type="button"
                onClick={() => setAddModal({ ...addModal, mode: "new" })}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  addModal.mode === "new"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                Create new list
              </button>
            </div>
          )}

          {addModal.mode === "existing" ? (
            <>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                List
              </label>
              <select
                value={addModal.listId}
                onChange={(event) =>
                  setAddModal({ ...addModal, listId: event.target.value })
                }
                className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
              >
                {(typeFilter
                  ? existingLists.filter((list) => list.type === typeFilter)
                  : existingLists
                ).map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              {!typeFilter && (
                <>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Type
                  </label>
                  <select
                    value={addModal.type}
                    onChange={(event) =>
                      setAddModal({
                        ...addModal,
                        type: event.target.value as ShuffleType,
                      })
                    }
                    className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="word">Vocabulary</option>
                    <option value="phrase">Phrase</option>
                  </select>
                </>
              )}

              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                List title
              </label>
              <input
                value={addModal.title}
                onChange={(event) =>
                  setAddModal({ ...addModal, title: event.target.value })
                }
                className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                placeholder={
                  (typeFilter ?? addModal.type) === "word"
                    ? "e.g. Travel vocabulary"
                    : "e.g. Daily speaking phrases"
                }
              />
            </>
          )}

          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Items{" "}
            <span className="normal-case font-normal text-zinc-500">
              (one per line)
            </span>
          </label>
          <textarea
            value={addModal.items}
            onChange={(event) =>
              setAddModal({ ...addModal, items: event.target.value })
            }
            rows={7}
            className="mb-5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAddModal}
              disabled={
                isBusy ||
                (addModal.mode === "existing"
                  ? !addModal.listId || !addModal.items.trim()
                  : !addModal.title.trim() || !addModal.items.trim())
              }
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {addModal.mode === "existing" ? "Add" : "Create"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        {children}
        <button
          onClick={onClose}
          className="absolute left-0 top-0 h-full w-full -z-10"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.333v9.334M3.333 8h9.334"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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
