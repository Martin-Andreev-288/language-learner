// Temporary hand-off used to "carry" pasted content from Parallel Translate
// into Parallel Listen without persisting it anywhere. Backed only by
// sessionStorage and consumed exactly once by the receiving page — as far
// as Parallel Listen is concerned, it's just as if the user had pasted the
// text themselves.
const STORAGE_KEY = "parallel-listen:carried-columns";

export interface CarriedColumn {
  name: string;
  text: string;
}

export function writeCarriedColumns(columns: CarriedColumn[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

export function readAndClearCarriedColumns(): CarriedColumn[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
