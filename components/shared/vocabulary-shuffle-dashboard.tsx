"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  appendCardsToShuffleList,
  createShuffleListWithCards,
  deleteShuffleList,
  renameShuffleList,
} from "@/app/actions/shuffle-actions";
import {
  createShuffleFolder,
  deleteShuffleFolder,
  moveShuffleFolder,
  moveShuffleListToFolder,
  renameShuffleFolder,
} from "@/app/actions/shuffle-folder-actions";
import {
  buildChildrenMap,
  buildItemsMap,
  flattenFolderOptions,
  getDescendantFolderIds,
  getVisibleFolderIds,
} from "@/lib/folder-tree";

type ShuffleType = "word" | "phrase";

type DashboardFolder = {
  id: string;
  name: string;
  parentFolderId: string | null;
  order: number;
};

type DashboardList = {
  id: string;
  title: string;
  folderId: string | null;
  counts: {
    total: number;
    memorized: number;
    unmemorized: number;
    favorites: number;
  };
  reviewCount: number;
  lastReviewedAt: string | Date | null;
  createdAt: string | Date;
};

type DashboardData = {
  folders: DashboardFolder[];
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
      folderId: string | null;
    };

type EditListModal =
  | { open: false }
  | { open: true; list: DashboardList; title: string };
type DeleteListModal = { open: false } | { open: true; list: DashboardList };
type AppendModal =
  | { open: false }
  | { open: true; list: DashboardList; items: string };

type FolderFormModal =
  | { open: false }
  | { open: true; mode: "create"; parentFolderId: string | null; name: string }
  | { open: true; mode: "rename"; folder: DashboardFolder; name: string };

type DeleteFolderModal =
  | { open: false }
  | { open: true; folder: DashboardFolder };

type MoveModal =
  | { open: false }
  | { open: true; kind: "list"; list: DashboardList; targetFolderId: string }
  | { open: true; kind: "folder"; folder: DashboardFolder; targetFolderId: string };

type DragItem = { kind: "list" | "folder"; id: string };

// Sentinel used as a drop-target id for "move to root" — distinct from any
// real folder id, which is always a cuid.
const ROOT_DROP_TARGET = "__root__";

type Props = {
  type: ShuffleType;
  reviewBasePath: string;
  data: DashboardData;
};

function formatReviewDate(date: string | Date) {
  const parsed = new Date(date);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

type SortBy = "title" | "lastReviewed" | "percentMemorized" | "createdAt";
type SortDirection = "asc" | "desc";

// Base comparator always returns ascending order; the caller flips the sign
// for descending. For lastReviewed, "ascending" means never-reviewed lists
// (no lastReviewedAt) come first, then oldest to newest — i.e. ascending
// surfaces neglected lists first, matching percentMemorized's same intent.
function compareLists(a: DashboardList, b: DashboardList, sortBy: SortBy) {
  if (sortBy === "createdAt") {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  if (sortBy === "lastReviewed") {
    const aTime = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : -Infinity;
    const bTime = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : -Infinity;
    return aTime - bTime;
  }

  if (sortBy === "percentMemorized") {
    const aPct = a.counts.total > 0 ? a.counts.memorized / a.counts.total : 0;
    const bPct = b.counts.total > 0 ? b.counts.memorized / b.counts.total : 0;
    return aPct - bPct;
  }

  return a.title.localeCompare(b.title);
}

export default function VocabularyShuffleDashboard({
  type,
  reviewBasePath,
  data,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [addModal, setAddModal] = useState<AddModal>({ open: false });
  const [editListModal, setEditListModal] = useState<EditListModal>({
    open: false,
  });
  const [deleteListModal, setDeleteListModal] = useState<DeleteListModal>({
    open: false,
  });
  const [appendModal, setAppendModal] = useState<AppendModal>({ open: false });
  const [folderFormModal, setFolderFormModal] = useState<FolderFormModal>({
    open: false,
  });
  const [deleteFolderModal, setDeleteFolderModal] =
    useState<DeleteFolderModal>({ open: false });
  const [moveModal, setMoveModal] = useState<MoveModal>({ open: false });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchTerm, setSearchTerm] = useState("");

  const { folders, lists, totals } = data;
  const label = type === "word" ? "word" : "phrase";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;
  const visibleFolderIds = getVisibleFolderIds(folders, lists, searchTerm);
  // visibleFolderIds only tracks folders — a root-level list can match
  // without any folder matching, so "no results" needs its own check.
  const hasSearchMatch =
    visibleFolderIds.size > 0 ||
    lists.some((list) => list.title.toLowerCase().includes(normalizedSearch)) ||
    folders.some((folder) => folder.name.toLowerCase().includes(normalizedSearch));
  const childrenMap = buildChildrenMap(folders);
  const sortedLists = [...lists].sort((a, b) => {
    const result = compareLists(a, b, sortBy);
    return sortDirection === "asc" ? result : -result;
  });
  const listsMap = buildItemsMap(sortedLists);

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

  function toggleCollapse(folderId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function handleDragEnd() {
    setDragItem(null);
    setDragOverTarget(null);
  }

  function handleDrop(target: string) {
    const dragged = dragItem;
    setDragItem(null);
    setDragOverTarget(null);

    if (!dragged) return;

    const targetFolderId = target === ROOT_DROP_TARGET ? null : target;

    if (dragged.kind === "list") {
      const list = lists.find((item) => item.id === dragged.id);
      if (!list || list.folderId === targetFolderId) return;

      void runMutation(async () => {
        await moveShuffleListToFolder(dragged.id, targetFolderId);
      });
      return;
    }

    if (dragged.id === targetFolderId) return;

    const folder = folders.find((item) => item.id === dragged.id);
    if (!folder || folder.parentFolderId === targetFolderId) return;

    if (
      targetFolderId &&
      getDescendantFolderIds(folders, dragged.id).has(targetFolderId)
    ) {
      return;
    }

    void runMutation(async () => {
      await moveShuffleFolder(dragged.id, targetFolderId);
    });
  }

  function openCreateListModal() {
    setAddModal({
      open: true,
      mode: lists.length > 0 ? "existing" : "new",
      listId: lists[0]?.id ?? "",
      title: "",
      items: "",
      folderId: null,
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
      const created = await createShuffleListWithCards(
        type,
        addModal.title,
        addModal.items,
      );
      if (addModal.folderId) {
        await moveShuffleListToFolder(created.id, addModal.folderId);
      }
      setAddModal({ open: false });
    });
  }

  function submitEditListModal() {
    if (!editListModal.open) return;

    void runMutation(async () => {
      await renameShuffleList(editListModal.list.id, editListModal.title);
      setEditListModal({ open: false });
    });
  }

  function submitDeleteListModal() {
    if (!deleteListModal.open) return;

    void runMutation(async () => {
      await deleteShuffleList(deleteListModal.list.id);
      setDeleteListModal({ open: false });
    });
  }

  function submitAppendModal() {
    if (!appendModal.open) return;

    void runMutation(async () => {
      await appendCardsToShuffleList(appendModal.list.id, appendModal.items);
      setAppendModal({ open: false });
    });
  }

  function submitFolderFormModal() {
    if (!folderFormModal.open) return;

    if (folderFormModal.mode === "create") {
      void runMutation(async () => {
        await createShuffleFolder(
          type,
          folderFormModal.name,
          folderFormModal.parentFolderId,
        );
        setFolderFormModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await renameShuffleFolder(folderFormModal.folder.id, folderFormModal.name);
      setFolderFormModal({ open: false });
    });
  }

  function submitDeleteFolderModal() {
    if (!deleteFolderModal.open) return;

    void runMutation(async () => {
      await deleteShuffleFolder(deleteFolderModal.folder.id);
      setDeleteFolderModal({ open: false });
    });
  }

  function submitMoveModal() {
    if (!moveModal.open) return;

    const targetFolderId =
      moveModal.targetFolderId === "" ? null : moveModal.targetFolderId;

    if (moveModal.kind === "list") {
      void runMutation(async () => {
        await moveShuffleListToFolder(moveModal.list.id, targetFolderId);
        setMoveModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await moveShuffleFolder(moveModal.folder.id, targetFolderId);
      setMoveModal({ open: false });
    });
  }

  const isEmpty = totals.lists === 0 && folders.length === 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {type === "word" ? "Vocab Shuffle" : "Phrase Shuffle"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {totals.lists} list{totals.lists !== 1 ? "s" : ""} ·{" "}
              {totals.cards} {label}
              {totals.cards !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setFolderFormModal({
                  open: true,
                  mode: "create",
                  parentFolderId: null,
                  name: "",
                })
              }
              className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              disabled={isBusy}
            >
              <FolderPlusIcon />
              New folder
            </button>
            <button
              onClick={openCreateListModal}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              disabled={isBusy}
            >
              <PlusIcon />
              Add new list
            </button>
          </div>
        </div>

        {lists.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                {totals.cards} {label}
                {totals.cards !== 1 ? "s" : ""} across all lists
                {totals.memorized > 0 && (
                  <span className="text-zinc-600">
                    {" "}
                    · {totals.memorized} memorized
                  </span>
                )}
                {totals.favorites > 0 && (
                  <span className="text-amber-500/80">
                    {" "}
                    · {totals.favorites} favorites
                  </span>
                )}
              </p>
            </button>

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
                {totals.unmemorized} unmemorized {label}
                {totals.unmemorized !== 1 ? "s" : ""}
              </p>
            </button>
          </div>
        )}

        {lists.length > 1 && (
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative w-64 max-w-full">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={`Search ${label}s and folders…`}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 pr-8 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                >
                  <CloseIcon />
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center">
              <label className="mr-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
              >
                <option value="title">Title (A–Z)</option>
                <option value="lastReviewed">Last reviewed</option>
                <option value="percentMemorized">% memorized</option>
                <option value="createdAt">Created date</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setSortDirection((value) => (value === "asc" ? "desc" : "asc"))
                }
                title={sortDirection === "asc" ? "Ascending" : "Descending"}
                className="ml-2 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
              >
                <ChevronDownIcon className={sortDirection === "asc" ? "rotate-180" : ""} />
              </button>
            </div>
          </div>
        )}

        {isSearching && !hasSearchMatch && (
          <div className="mb-4 flex items-center justify-center rounded-lg border border-zinc-800 py-6 text-sm text-zinc-600">
            No {label}s or folders match &ldquo;{searchTerm.trim()}&rdquo;.
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="mb-1 text-lg text-zinc-500">No lists yet</p>
            <p className="text-sm text-zinc-600">
              Click &ldquo;Add new list&rdquo; to create your first {label}{" "}
              list.
            </p>
          </div>
        ) : (
          <>
            {dragItem && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverTarget(ROOT_DROP_TARGET);
                }}
                onDragLeave={() =>
                  setDragOverTarget((prev) =>
                    prev === ROOT_DROP_TARGET ? null : prev,
                  )
                }
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(ROOT_DROP_TARGET);
                }}
                className={`mb-4 flex items-center justify-center rounded-lg border-2 border-dashed px-4 py-3 text-xs font-medium transition-colors ${
                  dragOverTarget === ROOT_DROP_TARGET
                    ? "border-indigo-500 bg-indigo-950/40 text-indigo-300"
                    : "border-zinc-800 text-zinc-600"
                }`}
              >
                Drop here to move to Root
              </div>
            )}

            <FolderSection
              folder={null}
              depth={0}
              label={label}
              reviewBasePath={reviewBasePath}
              childrenMap={childrenMap}
              listsMap={listsMap}
              collapsed={collapsed}
              dragItem={dragItem}
              dragOverTarget={dragOverTarget}
              onToggleCollapse={toggleCollapse}
              onOpenList={(listId) => router.push(`${reviewBasePath}/${listId}`)}
              onAppendList={(list) =>
                setAppendModal({ open: true, list, items: "" })
              }
              onEditList={(list) =>
                setEditListModal({ open: true, list, title: list.title })
              }
              onDeleteList={(list) => setDeleteListModal({ open: true, list })}
              onMoveList={(list) =>
                setMoveModal({
                  open: true,
                  kind: "list",
                  list,
                  targetFolderId: list.folderId ?? "",
                })
              }
              onCreateSubfolder={(parentFolderId) =>
                setFolderFormModal({
                  open: true,
                  mode: "create",
                  parentFolderId,
                  name: "",
                })
              }
              onRenameFolder={(folder) =>
                setFolderFormModal({
                  open: true,
                  mode: "rename",
                  folder,
                  name: folder.name,
                })
              }
              onDeleteFolder={(folder) =>
                setDeleteFolderModal({ open: true, folder })
              }
              onMoveFolder={(folder) =>
                setMoveModal({
                  open: true,
                  kind: "folder",
                  folder,
                  targetFolderId: folder.parentFolderId ?? "",
                })
              }
              onDragStartItem={setDragItem}
              onDragEndItem={handleDragEnd}
              onDragOverTarget={setDragOverTarget}
              onDragLeaveTarget={(target) =>
                setDragOverTarget((prev) => (prev === target ? null : prev))
              }
              onDropTarget={handleDrop}
              searchTerm={normalizedSearch}
              visibleFolderIds={visibleFolderIds}
              forceShowAll={false}
            />
          </>
        )}
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

              {folders.length > 0 && (
                <>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Folder
                  </label>
                  <select
                    value={addModal.folderId ?? ""}
                    onChange={(event) =>
                      setAddModal({
                        ...addModal,
                        folderId:
                          event.target.value === "" ? null : event.target.value,
                      })
                    }
                    className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="">— Root —</option>
                    {flattenFolderOptions(folders, new Set()).map((option) => (
                      <option key={option.id} value={option.id}>
                        {"—".repeat(option.depth)} {option.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
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

      {editListModal.open && (
        <Modal onClose={() => setEditListModal({ open: false })}>
          <h2 className="mb-5 text-lg font-semibold text-zinc-100">
            Edit list title
          </h2>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            List title
          </label>
          <input
            autoFocus
            type="text"
            value={editListModal.title}
            onChange={(event) =>
              setEditListModal({ ...editListModal, title: event.target.value })
            }
            onKeyDown={(event) => event.key === "Enter" && submitEditListModal()}
            className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditListModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEditListModal}
              disabled={isBusy || !editListModal.title.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {deleteListModal.open && (
        <Modal onClose={() => setDeleteListModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Delete list?
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            This will permanently delete{" "}
            <span className="font-medium text-zinc-200">
              &ldquo;{deleteListModal.list.title}&rdquo;
            </span>{" "}
            and all its {label}s.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteListModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDeleteListModal}
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

      {folderFormModal.open && (
        <Modal onClose={() => setFolderFormModal({ open: false })}>
          <h2 className="mb-5 text-lg font-semibold text-zinc-100">
            {folderFormModal.mode === "create" ? "New folder" : "Rename folder"}
          </h2>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Folder name
          </label>
          <input
            autoFocus
            type="text"
            value={folderFormModal.name}
            onChange={(event) =>
              setFolderFormModal({ ...folderFormModal, name: event.target.value })
            }
            onKeyDown={(event) =>
              event.key === "Enter" && submitFolderFormModal()
            }
            placeholder="e.g. 17 topics"
            className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFolderFormModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitFolderFormModal}
              disabled={isBusy || !folderFormModal.name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {folderFormModal.mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      {deleteFolderModal.open && (
        <Modal onClose={() => setDeleteFolderModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Delete folder?
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            This will permanently delete{" "}
            <span className="font-medium text-zinc-200">
              &ldquo;{deleteFolderModal.folder.name}&rdquo;
            </span>{" "}
            and everything inside it — all subfolders, all {label} lists, and
            all {label}s in those lists. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteFolderModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDeleteFolderModal}
              disabled={isBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}

      {moveModal.open && (
        <Modal onClose={() => setMoveModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Move {moveModal.kind === "list" ? "list" : "folder"}
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            {moveModal.kind === "list"
              ? moveModal.list.title
              : moveModal.folder.name}
          </p>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Destination folder
          </label>
          <select
            value={moveModal.targetFolderId}
            onChange={(event) =>
              setMoveModal({ ...moveModal, targetFolderId: event.target.value })
            }
            className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500"
          >
            <option value="">— Root —</option>
            {flattenFolderOptions(
              folders,
              moveModal.kind === "folder"
                ? new Set([
                    moveModal.folder.id,
                    ...getDescendantFolderIds(folders, moveModal.folder.id),
                  ])
                : new Set<string>(),
            ).map((option) => (
              <option key={option.id} value={option.id}>
                {"—".repeat(option.depth)} {option.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setMoveModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitMoveModal}
              disabled={isBusy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Move
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type FolderSectionProps = {
  folder: DashboardFolder | null;
  depth: number;
  label: string;
  reviewBasePath: string;
  childrenMap: Map<string | null, DashboardFolder[]>;
  listsMap: Map<string | null, DashboardList[]>;
  collapsed: Set<string>;
  dragItem: DragItem | null;
  dragOverTarget: string | null;
  onToggleCollapse: (folderId: string) => void;
  onOpenList: (listId: string) => void;
  onAppendList: (list: DashboardList) => void;
  onEditList: (list: DashboardList) => void;
  onDeleteList: (list: DashboardList) => void;
  onMoveList: (list: DashboardList) => void;
  onCreateSubfolder: (parentFolderId: string | null) => void;
  onRenameFolder: (folder: DashboardFolder) => void;
  onDeleteFolder: (folder: DashboardFolder) => void;
  onMoveFolder: (folder: DashboardFolder) => void;
  onDragStartItem: (item: DragItem) => void;
  onDragEndItem: () => void;
  onDragOverTarget: (target: string) => void;
  onDragLeaveTarget: (target: string) => void;
  onDropTarget: (target: string) => void;
  searchTerm: string;
  visibleFolderIds: Set<string>;
  // True once we're rendering inside a folder that itself matched the
  // search by name — from that point down, the whole subtree shows
  // unfiltered, like the search isn't active, so a matched folder is
  // actually browsable instead of just a dead-end label.
  forceShowAll: boolean;
};

function FolderSection(props: FolderSectionProps) {
  const {
    folder,
    depth,
    label,
    childrenMap,
    listsMap,
    collapsed,
    dragItem,
    dragOverTarget,
    onToggleCollapse,
    onOpenList,
    onAppendList,
    onEditList,
    onDeleteList,
    onMoveList,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onDragStartItem,
    onDragEndItem,
    onDragOverTarget,
    onDragLeaveTarget,
    onDropTarget,
    searchTerm,
    visibleFolderIds,
    forceShowAll,
  } = props;

  const isSearching = searchTerm.length > 0;
  const folderId = folder?.id ?? null;
  const folderNameMatches = !!folder && folder.name.toLowerCase().includes(searchTerm);
  const showAllHere = forceShowAll || folderNameMatches;
  const childFolders = (childrenMap.get(folderId) ?? []).filter(
    (child) => !isSearching || showAllHere || visibleFolderIds.has(child.id),
  );
  const directLists = (listsMap.get(folderId) ?? []).filter(
    (list) =>
      !isSearching || showAllHere || list.title.toLowerCase().includes(searchTerm),
  );
  const isCollapsed = isSearching
    ? false
    : folder
      ? collapsed.has(folder.id)
      : false;
  const isBeingDragged =
    !!folder && dragItem?.kind === "folder" && dragItem.id === folder.id;
  const isDropTarget = !!folder && dragOverTarget === folder.id;

  return (
    <div className={depth > 0 ? "mb-2 border-l border-zinc-800 pl-4" : ""}>
      {folder && (
        <div
          draggable
          onDragStart={() => onDragStartItem({ kind: "folder", id: folder.id })}
          onDragEnd={onDragEndItem}
          onDragOver={(event) => {
            event.preventDefault();
            onDragOverTarget(folder.id);
          }}
          onDragLeave={() => onDragLeaveTarget(folder.id)}
          onDrop={(event) => {
            event.preventDefault();
            onDropTarget(folder.id);
          }}
          className={`group relative mb-3 flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors ${
            isBeingDragged ? "opacity-50" : ""
          } ${
            isDropTarget
              ? "bg-indigo-950/40 ring-1 ring-indigo-500"
              : "bg-zinc-900/60"
          }`}
        >
          <button
            type="button"
            onClick={() => onToggleCollapse(folder.id)}
            title={isCollapsed ? "Expand" : "Collapse"}
            className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
          >
            <ChevronDownIcon className={isCollapsed ? "-rotate-90" : ""} />
          </button>
          <FolderIcon className="shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
            {folder.name}
          </span>
          <span className="shrink-0 text-xs text-zinc-600">
            {childFolders.length} folder{childFolders.length !== 1 ? "s" : ""} ·{" "}
            {directLists.length} list{directLists.length !== 1 ? "s" : ""}
          </span>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title="New subfolder"
              onClick={() => onCreateSubfolder(folder.id)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-indigo-300"
            >
              <FolderPlusIcon />
            </button>
            <button
              type="button"
              title="Move folder"
              onClick={() => onMoveFolder(folder)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              <MoveIcon />
            </button>
            <button
              type="button"
              title="Rename folder"
              onClick={() => onRenameFolder(folder)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              <EditIcon />
            </button>
            <button
              type="button"
              title="Delete folder"
              onClick={() => onDeleteFolder(folder)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <>
          {directLists.length > 0 && (
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
                childFolders.length > 0 ? "mb-4" : "mb-6"
              }`}
            >
              {directLists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  label={label}
                  isDragging={
                    dragItem?.kind === "list" && dragItem.id === list.id
                  }
                  onOpen={() => onOpenList(list.id)}
                  onAppend={() => onAppendList(list)}
                  onEdit={() => onEditList(list)}
                  onDelete={() => onDeleteList(list)}
                  onMove={() => onMoveList(list)}
                  onDragStart={() => onDragStartItem({ kind: "list", id: list.id })}
                  onDragEnd={onDragEndItem}
                />
              ))}
            </div>
          )}

          {childFolders.map((child) => (
            <FolderSection
              key={child.id}
              {...props}
              folder={child}
              depth={depth + 1}
              forceShowAll={showAllHere}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ListCard({
  list,
  label,
  isDragging,
  onOpen,
  onAppend,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  list: DashboardList;
  label: string;
  isDragging: boolean;
  onOpen: () => void;
  onAppend: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Add items"
          onClick={(event) => {
            event.stopPropagation();
            onAppend();
          }}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-indigo-300"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          title="Move to folder"
          onClick={(event) => {
            event.stopPropagation();
            onMove();
          }}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <MoveIcon />
        </button>
        <button
          type="button"
          title="Edit list title"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
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
            onDelete();
          }}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
        >
          <TrashIcon />
        </button>
      </div>

      <h2 className="mb-3 pr-28 font-semibold leading-snug text-zinc-100">
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
      <p className="mt-1 text-xs text-zinc-600">
        reviews: {list.reviewCount} · last:{" "}
        {list.lastReviewedAt ? formatReviewDate(list.lastReviewedAt) : "-"}
      </p>
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

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 2l8 8M10 2l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`transition-transform ${className ?? ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      className={className}
    >
      <path
        d="M1.5 3.5a1 1 0 0 1 1-1h3l1.2 1.5H12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1v-7.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1.5 3a1 1 0 0 1 1-1h2.6l1 1.2H10.5a1 1 0 0 1 1 1v5.3a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 6v3M5 7.5h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1.5 2.5h4l1 1.2H11a.5.5 0 0 1 .5.5v6.3a.5.5 0 0 1-.5.5H1.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 8.5 8.5 5.5M8.5 5.5H6M8.5 5.5V8"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
