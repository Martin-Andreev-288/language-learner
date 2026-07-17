"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createNote,
  deleteNote,
  getNote,
  renameNote,
  updateNoteContent,
} from "@/app/actions/note-actions";
import {
  createNoteFolder,
  deleteNoteFolder,
  moveNoteFolder,
  moveNoteToFolder,
  renameNoteFolder,
} from "@/app/actions/note-folder-actions";
import {
  buildChildrenMap,
  buildItemsMap,
  flattenFolderOptions,
  getDescendantFolderIds,
  getVisibleFolderIds,
} from "@/lib/folder-tree";

type NotePage =
  | "reading"
  | "writing"
  | "vocabulary"
  | "listening"
  | "speaking"
  | "general";

type DashboardFolder = {
  id: string;
  name: string;
  parentFolderId: string | null;
  order: number;
};

type DashboardNote = {
  id: string;
  title: string;
  folderId: string | null;
  preview: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type DashboardData = {
  folders: DashboardFolder[];
  notes: DashboardNote[];
};

type NoteEditorModal =
  | { open: false }
  | {
      open: true;
      mode: "create";
      folderId: string | null;
      title: string;
      content: string;
    }
  | {
      open: true;
      mode: "edit";
      note: DashboardNote;
      title: string;
      content: string;
    };

type DeleteNoteModal = { open: false } | { open: true; note: DashboardNote };

type FolderFormModal =
  | { open: false }
  | { open: true; mode: "create"; parentFolderId: string | null; name: string }
  | { open: true; mode: "rename"; folder: DashboardFolder; name: string };

type DeleteFolderModal =
  | { open: false }
  | { open: true; folder: DashboardFolder };

type MoveModal =
  | { open: false }
  | { open: true; kind: "note"; note: DashboardNote; targetFolderId: string }
  | {
      open: true;
      kind: "folder";
      folder: DashboardFolder;
      targetFolderId: string;
    };

type DragItem = { kind: "note" | "folder"; id: string };

// Sentinel used as a drop-target id for "move to root" — distinct from any
// real folder id, which is always a cuid.
const ROOT_DROP_TARGET = "__root__";

type Props = {
  page: NotePage;
  data: DashboardData;
};

// Styles the note content's Markdown preview to match the app's dark theme,
// since react-markdown renders plain elements with no styling of its own.
const markdownComponents: Components = {
  h1: (props) => (
    <h1 className="mb-2 mt-4 text-xl font-bold text-zinc-100 first:mt-0" {...props} />
  ),
  h2: (props) => (
    <h2 className="mb-2 mt-4 text-lg font-bold text-zinc-100 first:mt-0" {...props} />
  ),
  h3: (props) => (
    <h3
      className="mb-1 mt-3 text-base font-semibold text-zinc-100 first:mt-0"
      {...props}
    />
  ),
  p: (props) => (
    <p className="mb-3 text-sm leading-relaxed text-zinc-300 last:mb-0" {...props} />
  ),
  strong: (props) => <strong className="font-semibold text-zinc-100" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  a: (props) => (
    <a
      className="text-indigo-400 underline hover:text-indigo-300"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-zinc-300" {...props} />
  ),
  ol: (props) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 text-sm text-zinc-300" {...props} />
  ),
  li: (props) => <li {...props} />,
  pre: (props) => (
    <pre
      className="mb-3 overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-200"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs text-emerald-300"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="mb-3 border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-400"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-zinc-800" />,
  table: (props) => (
    <table className="mb-3 w-full border-collapse text-sm" {...props} />
  ),
  th: (props) => (
    <th
      className="border border-zinc-700 bg-zinc-800 px-2 py-1 text-left font-medium text-zinc-200"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border border-zinc-800 px-2 py-1 text-zinc-300" {...props} />
  ),
  del: (props) => <del className="text-zinc-500" {...props} />,
};

function formatNoteDate(date: string | Date) {
  const parsed = new Date(date);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

type SortBy = "title" | "updatedAt" | "createdAt";
type SortDirection = "asc" | "desc";

// Base comparator always returns ascending order; the caller flips the sign
// for descending — same shape as the Shuffle dashboard's compareLists.
function compareNotes(a: DashboardNote, b: DashboardNote, sortBy: SortBy) {
  if (sortBy === "updatedAt") {
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  }

  if (sortBy === "createdAt") {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  return a.title.localeCompare(b.title);
}

export default function NoteDashboard({ page, data }: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [noteEditorModal, setNoteEditorModal] = useState<NoteEditorModal>({
    open: false,
  });
  const [deleteNoteModal, setDeleteNoteModal] = useState<DeleteNoteModal>({
    open: false,
  });
  const [folderFormModal, setFolderFormModal] = useState<FolderFormModal>({
    open: false,
  });
  const [deleteFolderModal, setDeleteFolderModal] =
    useState<DeleteFolderModal>({ open: false });
  const [moveModal, setMoveModal] = useState<MoveModal>({ open: false });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortBy>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchTerm, setSearchTerm] = useState("");

  const { folders, notes } = data;
  const childrenMap = buildChildrenMap(folders);
  const sortedNotes = [...notes].sort((a, b) => {
    const result = compareNotes(a, b, sortBy);
    return sortDirection === "asc" ? result : -result;
  });
  const notesMap = buildItemsMap(sortedNotes);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;
  const visibleFolderIds = getVisibleFolderIds(folders, notes, searchTerm);
  // visibleFolderIds only tracks folders — a root-level note can match
  // without any folder matching, so "no results" needs its own check.
  const hasSearchMatch =
    visibleFolderIds.size > 0 ||
    notes.some((note) => note.title.toLowerCase().includes(normalizedSearch)) ||
    folders.some((folder) => folder.name.toLowerCase().includes(normalizedSearch));
  const isEmpty = notes.length === 0 && folders.length === 0;

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === previewRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void previewRef.current?.requestFullscreen();
    }
  }

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

    if (dragged.kind === "note") {
      const note = notes.find((item) => item.id === dragged.id);
      if (!note || note.folderId === targetFolderId) return;

      void runMutation(async () => {
        await moveNoteToFolder(dragged.id, targetFolderId);
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
      await moveNoteFolder(dragged.id, targetFolderId);
    });
  }

  function submitNoteEditorModal() {
    if (!noteEditorModal.open) return;

    if (noteEditorModal.mode === "create") {
      void runMutation(async () => {
        await createNote(
          page,
          noteEditorModal.title,
          noteEditorModal.content,
          noteEditorModal.folderId,
        );
        setNoteEditorModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await Promise.all([
        renameNote(noteEditorModal.note.id, noteEditorModal.title),
        updateNoteContent(noteEditorModal.note.id, noteEditorModal.content),
      ]);
      setNoteEditorModal({ open: false });
    });
  }

  function submitDeleteNoteModal() {
    if (!deleteNoteModal.open) return;

    void runMutation(async () => {
      await deleteNote(deleteNoteModal.note.id);
      setDeleteNoteModal({ open: false });
    });
  }

  function submitFolderFormModal() {
    if (!folderFormModal.open) return;

    if (folderFormModal.mode === "create") {
      void runMutation(async () => {
        await createNoteFolder(
          page,
          folderFormModal.name,
          folderFormModal.parentFolderId,
        );
        setFolderFormModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await renameNoteFolder(folderFormModal.folder.id, folderFormModal.name);
      setFolderFormModal({ open: false });
    });
  }

  function submitDeleteFolderModal() {
    if (!deleteFolderModal.open) return;

    void runMutation(async () => {
      await deleteNoteFolder(deleteFolderModal.folder.id);
      setDeleteFolderModal({ open: false });
    });
  }

  function submitMoveModal() {
    if (!moveModal.open) return;

    const targetFolderId =
      moveModal.targetFolderId === "" ? null : moveModal.targetFolderId;

    if (moveModal.kind === "note") {
      void runMutation(async () => {
        await moveNoteToFolder(moveModal.note.id, targetFolderId);
        setMoveModal({ open: false });
      });
      return;
    }

    void runMutation(async () => {
      await moveNoteFolder(moveModal.folder.id, targetFolderId);
      setMoveModal({ open: false });
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {notes.length} note{notes.length !== 1 ? "s" : ""}
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
              onClick={() => {
                setPreviewMode(false);
                setIsExpanded(false);
                setIsFullscreen(false);
                setNoteEditorModal({
                  open: true,
                  mode: "create",
                  folderId: null,
                  title: "",
                  content: "",
                });
              }}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              disabled={isBusy}
            >
              <PlusIcon />
              New note
            </button>
          </div>
        </div>

        {notes.length > 1 && (
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative w-64 max-w-full">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search notes and folders…"
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
                <option value="updatedAt">Last updated</option>
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
            No notes or folders match &ldquo;{searchTerm.trim()}&rdquo;.
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="mb-1 text-lg text-zinc-500">No notes yet</p>
            <p className="text-sm text-zinc-600">
              Click &ldquo;New note&rdquo; to create your first note.
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
              childrenMap={childrenMap}
              notesMap={notesMap}
              collapsed={collapsed}
              dragItem={dragItem}
              dragOverTarget={dragOverTarget}
              onToggleCollapse={toggleCollapse}
              onOpenNote={(note) => {
                void getNote(note.id).then((full) => {
                  setPreviewMode(false);
                setIsExpanded(false);
                setIsFullscreen(false);
                  setNoteEditorModal({
                    open: true,
                    mode: "edit",
                    note,
                    title: full.title,
                    content: full.content,
                  });
                });
              }}
              onDeleteNote={(note) => setDeleteNoteModal({ open: true, note })}
              onMoveNote={(note) =>
                setMoveModal({
                  open: true,
                  kind: "note",
                  note,
                  targetFolderId: note.folderId ?? "",
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

      {noteEditorModal.open && (
          <Modal
            onClose={() => setNoteEditorModal({ open: false })}
            widthClassName={isExpanded ? "max-w-5xl" : "max-w-2xl"}
          >
            <h2 className="mb-5 text-lg font-semibold text-zinc-100">
              {noteEditorModal.mode === "create" ? "New note" : "Edit note"}
            </h2>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Title
            </label>
            <input
              autoFocus
              type="text"
              value={noteEditorModal.title}
              onChange={(event) =>
                setNoteEditorModal({
                  ...noteEditorModal,
                  title: event.target.value,
                })
              }
              placeholder="e.g. Subjunctive mood notes"
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Content{" "}
                <span className="normal-case font-normal text-zinc-600">
                  (Markdown supported)
                </span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5 rounded-lg bg-zinc-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode(false)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      !previewMode
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode(true)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      previewMode
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Preview
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpanded((value) => !value)}
                  title={isExpanded ? "Collapse" : "Expand"}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                >
                  {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </button>
                {previewMode && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title="Fullscreen"
                    className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <FullscreenIcon />
                  </button>
                )}
              </div>
            </div>
            {previewMode ? (
              <div
                ref={previewRef}
                className={`relative mb-5 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 ${
                  isFullscreen
                    ? "h-screen p-10"
                    : isExpanded
                      ? "h-[65vh]"
                      : "h-64"
                }`}
              >
                {isFullscreen && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title="Exit fullscreen"
                    className="fixed right-6 top-6 rounded-md bg-zinc-900/90 p-2 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
                  >
                    <ExitFullscreenIcon />
                  </button>
                )}
                {noteEditorModal.content.trim() ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {noteEditorModal.content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm text-zinc-600">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <textarea
                value={noteEditorModal.content}
                onChange={(event) =>
                  setNoteEditorModal({
                    ...noteEditorModal,
                    content: event.target.value,
                  })
                }
                placeholder="Write your note here… Markdown supported."
                className={`mb-5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500 ${
                  isExpanded ? "h-[65vh]" : "h-64"
                }`}
              />
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setNoteEditorModal({ open: false })}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNoteEditorModal}
                disabled={isBusy || !noteEditorModal.title.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {noteEditorModal.mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </Modal>
      )}

      {deleteNoteModal.open && (
        <Modal onClose={() => setDeleteNoteModal({ open: false })}>
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">
            Delete note?
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            This will permanently delete{" "}
            <span className="font-medium text-zinc-200">
              &ldquo;{deleteNoteModal.note.title}&rdquo;
            </span>
            .
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteNoteModal({ open: false })}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDeleteNoteModal}
              disabled={isBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
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
            placeholder="e.g. Grammar"
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
            and everything inside it — all subfolders and all notes in them.
            This cannot be undone.
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
            Move {moveModal.kind === "note" ? "note" : "folder"}
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            {moveModal.kind === "note"
              ? moveModal.note.title
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
  childrenMap: Map<string | null, DashboardFolder[]>;
  notesMap: Map<string | null, DashboardNote[]>;
  collapsed: Set<string>;
  dragItem: DragItem | null;
  dragOverTarget: string | null;
  onToggleCollapse: (folderId: string) => void;
  onOpenNote: (note: DashboardNote) => void;
  onDeleteNote: (note: DashboardNote) => void;
  onMoveNote: (note: DashboardNote) => void;
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
    childrenMap,
    notesMap,
    collapsed,
    dragItem,
    dragOverTarget,
    onToggleCollapse,
    onOpenNote,
    onDeleteNote,
    onMoveNote,
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
  const directNotes = (notesMap.get(folderId) ?? []).filter(
    (note) =>
      !isSearching || showAllHere || note.title.toLowerCase().includes(searchTerm),
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
            {directNotes.length} note{directNotes.length !== 1 ? "s" : ""}
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
          {directNotes.length > 0 && (
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
                childFolders.length > 0 ? "mb-4" : "mb-6"
              }`}
            >
              {directNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isDragging={
                    dragItem?.kind === "note" && dragItem.id === note.id
                  }
                  onOpen={() => onOpenNote(note)}
                  onDelete={() => onDeleteNote(note)}
                  onMove={() => onMoveNote(note)}
                  onDragStart={() => onDragStartItem({ kind: "note", id: note.id })}
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

function NoteCard({
  note,
  isDragging,
  onOpen,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  note: DashboardNote;
  isDragging: boolean;
  onOpen: () => void;
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
          title="Delete note"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
        >
          <TrashIcon />
        </button>
      </div>

      <h2 className="mb-2 pr-16 font-semibold leading-snug text-zinc-100">
        {note.title}
      </h2>
      {note.preview && (
        <p className="mb-2 line-clamp-3 text-sm text-zinc-500">
          {note.preview}
        </p>
      )}
      <p className="text-xs text-zinc-600">
        Edited {formatNoteDate(note.updatedAt)}
      </p>
    </div>
  );
}

function Modal({
  children,
  onClose,
  widthClassName = "max-w-md",
}: {
  children: React.ReactNode;
  onClose: () => void;
  widthClassName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClassName} rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl`}
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

// Diagonal resize arrow — used for "expand the modal", distinct from the
// corner-bracket fullscreen icons below.
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 8v3h3M11 5V2H8M2 11l4-4M11 2 7 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M5 8H2v3M8 5h3V2M2 2l4 4M11 11 7 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Four corner brackets touching the frame edges — the classic video-player
// fullscreen glyph, deliberately different from ExpandIcon's diagonal arrow.
function FullscreenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M4.5 1v3.5H1M8.5 1v3.5H12M12 8.5H8.5V12M1 8.5h3.5V12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
