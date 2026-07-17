// Generic helpers for assembling a flat (folders[], items[]) fetch — the
// shape returned by getShuffleFolderTree/getNoteFolderTree — into a nested
// tree client-side. Shared between the Shuffle and Notes dashboards since
// both use the same unlimited-depth, self-referencing folder pattern.

type TreeFolder = { id: string; parentFolderId: string | null };

export function buildChildrenMap<F extends TreeFolder>(folders: F[]) {
  const map = new Map<string | null, F[]>();
  for (const folder of folders) {
    const key = folder.parentFolderId;
    const existing = map.get(key);
    if (existing) {
      existing.push(folder);
    } else {
      map.set(key, [folder]);
    }
  }
  return map;
}

export function buildItemsMap<T extends { folderId: string | null }>(
  items: T[],
) {
  const map = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.folderId;
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

// Walks the folder tree from `rootId` down and returns every descendant id,
// used to keep a folder (and its own subtree) out of its own "move" options.
export function getDescendantFolderIds<F extends TreeFolder & { id: string }>(
  folders: F[],
  rootId: string,
) {
  const childrenMap = buildChildrenMap(folders);
  const result = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of childrenMap.get(current) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }

  return result;
}

// Returns the set of folder ids that should stay visible while a search
// term is active: a folder counts as a "hit" if its own name matches, if
// any item directly inside it matches by title, or if any descendant
// folder (recursively) is itself a hit — so a match ten levels deep still
// keeps its whole ancestor chain visible. Leaf items are filtered
// separately, by direct title match only; a folder matching by name does
// not pull in unrelated children that don't themselves match.
export function getVisibleFolderIds<
  F extends TreeFolder & { id: string; name: string },
  T extends { folderId: string | null; title: string },
>(folders: F[], items: T[], term: string) {
  const normalized = term.trim().toLowerCase();
  const visible = new Set<string>();

  if (!normalized) return visible;

  const childrenMap = buildChildrenMap(folders);
  const itemsMap = buildItemsMap(items);

  function check(folder: F): boolean {
    let hasMatch = folder.name.toLowerCase().includes(normalized);

    for (const item of itemsMap.get(folder.id) ?? []) {
      if (item.title.toLowerCase().includes(normalized)) {
        hasMatch = true;
      }
    }

    for (const child of childrenMap.get(folder.id) ?? []) {
      if (check(child)) {
        hasMatch = true;
      }
    }

    if (hasMatch) visible.add(folder.id);
    return hasMatch;
  }

  for (const folder of folders) {
    if (folder.parentFolderId === null) check(folder);
  }

  return visible;
}

export function flattenFolderOptions<
  F extends TreeFolder & { id: string; name: string },
>(folders: F[], excludeIds: Set<string>) {
  const childrenMap = buildChildrenMap(folders);
  const result: { id: string; name: string; depth: number }[] = [];

  function walk(parentId: string | null, depth: number) {
    for (const child of childrenMap.get(parentId) ?? []) {
      if (excludeIds.has(child.id)) continue;
      result.push({ id: child.id, name: child.name, depth });
      walk(child.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
}
