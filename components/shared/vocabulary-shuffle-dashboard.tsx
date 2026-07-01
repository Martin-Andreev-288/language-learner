"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  appendCardsToShuffleList,
  createShuffleListWithCards,
  deleteShuffleList,
  renameShuffleList,
} from "@/app/actions/shuffle-actions";

type ShuffleType = "word" | "phrase";

type DashboardList = {
  id: string;
  title: string;
  type: ShuffleType;
  counts: {
    total: number;
    memorized: number;
    unmemorized: number;
    favorites: number;
  };
};

type DashboardData = {
  lists: DashboardList[];
  totals: {
    lists: number;
    cards: number;
    memorized: number;
    unmemorized: number;
    favorites: number;
  };
};

type AddModal =
  | { open: false }
  | {
      open: true;
      mode: "existing" | "new";
      listId: string;
      title: string;
      items: string;
    };

type EditModal =
  | { open: false }
  | { open: true; list: DashboardList; title: string };
type DeleteModal = { open: false } | { open: true; list: DashboardList };
type AppendModal =
  | { open: false }
  | { open: true; list: DashboardList; items: string };

type Props = {
  type: ShuffleType;
  reviewBasePath: string;
  data: DashboardData;
};

export default function VocabularyShuffleDashboard({
  type,
  reviewBasePath,
  data,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [addModal, setAddModal] = useState<AddModal>({ open: false });
  const [editModal, setEditModal] = useState<EditModal>({ open: false });
  const [deleteModal, setDeleteModal] = useState<DeleteModal>({ open: false });
  const [appendModal, setAppendModal] = useState<AppendModal>({ open: false });

  const lists = data.lists;
  const label = type === "word" ? "word" : "phrase";

  async function runMutation(task: () => Promise<unknown>) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await task();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      window.alert(message);
    } finally {
      setIsBusy(false);
    }
  }

  function openCreateModal() {
    setAddModal({
      open: true,
      mode: lists.length > 0 ? "existing" : "new",
      listId: lists[0]?.id ?? "",
      title: "",
      items: "",
    });
  }

  function submitCreateModal() {
    if (!addModal.open) return;

    if (addModal.mode === "existing") {
      void runMutation(async () => {
        await appendCardsToShuffleList(addModal.listId, addModal.items);
        setAddModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await createShuffleListWithCards(type, addModal.title, addModal.items);
      setAddModal({ open: false });
    });
  }

  function submitEditModal() {
    if (!editModal.open) return;

    void runMutation(async () => {
      await renameShuffleList(editModal.list.id, editModal.title);
      setEditModal({ open: false });
    });
  }

  function submitDeleteModal() {
    if (!deleteModal.open) return;

    void runMutation(async () => {
      await deleteShuffleList(deleteModal.list.id);
      setDeleteModal({ open: false });
    });
  }

  function submitAppendModal() {
    if (!appendModal.open) return;

    void runMutation(async () => {
      await appendCardsToShuffleList(appendModal.list.id, appendModal.items);
      setAppendModal({ open: false });
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {type === "word" ? "Vocab Shuffle" : "Phrase Shuffle"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {data.totals.lists} list{data.totals.lists !== 1 ? "s" : ""} ·{" "}
              {data.totals.cards} {label}
              {data.totals.cards !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            disabled={isBusy}
          >
            <PlusIcon />
            Add new list
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.length > 0 && (
            <button
              type="button"
              onClick={() => router.push(`${reviewBasePath}/all`)}
              className="group flex flex-col justify-between rounded-xl border border-indigo-500/50 bg-indigo-950/50 p-5 text-left transition-colors hover:bg-indigo-950/80"
            >
              <div className="mb-3 flex items-center gap-2">
                <LayersIcon className="text-indigo-400" />
                <span className="font-semibold text-indigo-300">
                  Review All
                </span>
              </div>
              <p className="text-sm text-zinc-400">
                {data.totals.cards} {label}
                {data.totals.cards !== 1 ? "s" : ""} across all lists
                {data.totals.memorized > 0 && (
                  <span className="text-zinc-600">
                    {" "}
                    · {data.totals.memorized} memorized
                  </span>
                )}
                {data.totals.favorites > 0 && (
                  <span className="text-amber-500/80">
                    {" "}
                    · {data.totals.favorites} favorites
                  </span>
                )}
              </p>
            </button>
          )}

          {lists.length > 0 && (
            <button
              type="button"
              onClick={() =>
                router.push(`/unmemorized?type=${type}&from=shuffle`)
              }
              className="group flex flex-col justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-5 text-left transition-colors hover:bg-emerald-950/70"
            >
              <div className="mb-3 flex items-center gap-2">
                <DotListIcon className="text-emerald-300" />
                <span className="font-semibold text-emerald-300">
                  Unmemorized
                </span>
              </div>
              <p className="text-sm text-zinc-400">
                {data.totals.unmemorized} unmemorized {label}
                {data.totals.unmemorized !== 1 ? "s" : ""}
              </p>
            </button>
          )}

          {lists.map((list) => (
            <div
              key={list.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`${reviewBasePath}/${list.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`${reviewBasePath}/${list.id}`);
                }
              }}
              className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700"
            >
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Add items"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAppendModal({ open: true, list, items: "" });
                  }}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-indigo-300"
                >
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  title="Edit list title"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditModal({ open: true, list, title: list.title });
                  }}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  title="Delete list"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteModal({ open: true, list });
                  }}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                >
                  <TrashIcon />
                </button>
              </div>

              <h2 className="mb-3 pr-16 font-semibold leading-snug text-zinc-100">
                {list.title}
              </h2>
              <p className="text-sm text-zinc-500">
                {list.counts.total} {label}
                {list.counts.total !== 1 ? "s" : ""}
                {list.counts.total > 0 && (
                  <span className="text-zinc-600">
                    {" "}
                    · {list.counts.memorized}/{list.counts.total} memorized
                  </span>
                )}
                {list.counts.favorites > 0 && (
                  <span className="text-amber-500/80">
                    {" "}
                    · {list.counts.favorites} favorites
                  </span>
                )}
              </p>
            </div>
          ))}

          {lists.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <p className="mb-1 text-lg text-zinc-500">No lists yet</p>
              <p className="text-sm text-zinc-600">
                Click &ldquo;Add new list&rdquo; to create your first {label}{" "}
                list.
              </p>
            </div>
          )}
        </div>
      </div>

      {addModal.open && (
        <Modal onClose={() => setAddModal({ open: false })}>
          <h2 className="mb-5 text-lg font-semibold text-zinc-100">
            Add new list
          </h2>

          {lists.length > 0 && (
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
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                List title
              </label>
              <input
                autoFocus
                type="text"
                value={addModal.title}
                onChange={(event) =>
                  setAddModal({ ...addModal, title: event.target.value })
                }
                placeholder={
                  type === "word"
                    ? "e.g. French vocabulary"
                    : "e.g. French phrases"
                }
                className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
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
            placeholder={
              type === "word"
                ? "Motherboard (дънна платка)\naffichage (дисплей)\ncarte mère (дънна платка)"
                : "Je me sens bien (Чувствам се добре)\nBonjour tout le monde"
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
              onClick={submitCreateModal}
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

      {editModal.open && (
        <Modal onClose={() => setEditModal({ open: false })}>
          <h2 className="mb-5 text-lg font-semibold text-zinc-100">
            Edit list title
          </h2>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            List title
          </label>
          <input
            autoFocus
            type="text"
            value={editModal.title}
            onChange={(event) =>
              setEditModal({ ...editModal, title: event.target.value })
            }
            onKeyDown={(event) => event.key === "Enter" && submitEditModal()}
            className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEditModal}
              disabled={isBusy || !editModal.title.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {deleteModal.open && (
        <Modal onClose={() => setDeleteModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Delete list?
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            This will permanently delete{" "}
            <span className="font-medium text-zinc-200">
              &ldquo;{deleteModal.list.title}&rdquo;
            </span>{" "}
            and all its {label}s.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDeleteModal}
              disabled={isBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {appendModal.open && (
        <Modal onClose={() => setAppendModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Add items
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            List:{" "}
            <span className="text-zinc-300">{appendModal.list.title}</span>
          </p>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Items{" "}
            <span className="normal-case font-normal text-zinc-500">
              (one per line)
            </span>
          </label>
          <textarea
            autoFocus
            value={appendModal.items}
            onChange={(event) =>
              setAppendModal({ ...appendModal, items: event.target.value })
            }
            placeholder={
              type === "word"
                ? "additional word\nanother one"
                : "additional phrase\nanother phrase"
            }
            rows={7}
            className="mb-5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAppendModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAppendModal}
              disabled={isBusy || !appendModal.items.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M7.5 1.5v12M1.5 7.5h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      className={className}
    >
      <path
        d="M7.5 1.5 13 4.5 7.5 7.5 2 4.5 7.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M2 7.5 7.5 10.5 13 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 10.5 7.5 13.5 13 10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotListIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      className={className}
    >
      <path
        d="M4 4.5h8M4 7.5h8M4 10.5h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="2.5" cy="4.5" r="0.75" fill="currentColor" />
      <circle cx="2.5" cy="7.5" r="0.75" fill="currentColor" />
      <circle cx="2.5" cy="10.5" r="0.75" fill="currentColor" />
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
