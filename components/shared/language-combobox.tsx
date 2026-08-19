"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_NAMES } from "@/lib/language-codes";
import {
  readRecentLanguages,
  recordRecentLanguage,
} from "@/lib/recent-languages";

const TYPE_OR_CHOOSE_HINT =
  "Type a language name by hand, or click ▾ to choose one from the list.";

interface LanguageComboboxProps {
  value: string;
  onChange: (next: string) => void;
  // The field-specific part of the placeholder ("e.g. German",
  // "Language 1"). The "type or choose" hint is appended to it here rather
  // than written out at each call site, so every language field says it the
  // same way and none can be forgotten.
  placeholder?: string;
  // Skips the appended hint for fields too narrow to show it without
  // truncating. They still get the tooltip.
  compact?: boolean;
  // Paired with a <label htmlFor>. The combobox renders a button alongside
  // its input, so callers label it this way rather than wrapping the whole
  // thing in a <label> — a label wrapping interactive content is ambiguous
  // about which control it names.
  id?: string;
  // Applied to the <input>, so each caller keeps the sizing and styling its
  // own layout already used for a plain text field.
  className?: string;
  // Applied to the wrapper, for callers that need it to flex (Parallel
  // Listen's per-column row).
  wrapperClassName?: string;
}

// Where the dropdown should be drawn. Fixed coordinates rather than an
// absolutely-positioned child, because Parallel Listen renders its language
// fields inside a `max-h-112 overflow-y-auto` column list — an absolutely
// positioned panel would be clipped by that scroll container. Same reason
// Inline Translate's word popup is fixed-positioned.
interface DropdownRect {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export default function LanguageCombobox({
  value,
  onChange,
  placeholder,
  compact = false,
  id,
  className = "",
  wrapperClassName = "",
}: LanguageComboboxProps) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  // Typing filters the list; opening with the arrow shows all of it. Without
  // this, opening the arrow right after picking "German" would filter the
  // list down to just "German" — technically consistent, practically useless.
  const [typedSinceOpen, setTypedSinceOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const input = inputRef.current;
    if (!input) return;
    const bounds = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - bounds.bottom - 8;
    const spaceAbove = bounds.top - 8;
    // Flip upward only when below genuinely can't fit a usable list and
    // above is roomier — otherwise a field near the bottom of a long page
    // opens into a 40px-tall sliver.
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    setRect({
      left: bounds.left,
      width: bounds.width,
      top: openUp ? undefined : bounds.bottom + 4,
      bottom: openUp ? window.innerHeight - bounds.top + 4 : undefined,
      maxHeight: Math.max(160, Math.min(320, openUp ? spaceAbove : spaceBelow)),
    });
    // Read on open rather than on mount, so a language picked in one field
    // shows up in the next field's list immediately — Parallel Listen has
    // one of these per column.
    setRecents(readRecentLanguages());
    setOpen(true);
  }

  function handleSelect(name: string) {
    onChange(name);
    setRecents(recordRecentLanguage(name));
    setOpen(false);
    setTypedSinceOpen(false);
    inputRef.current?.focus();
  }

  // A freely-typed name still counts as "used" once the user moves on, as
  // long as it's one this app can actually voice — otherwise typing a
  // language would never make it into the recents list.
  function handleBlur() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const canonical = LANGUAGE_NAMES.find(
      (name) => name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (canonical) recordRecentLanguage(canonical);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (inputRef.current?.contains(target)) return;
      setOpen(false);
      setTypedSinceOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setTypedSinceOpen(false);
      }
    }

    // The panel is fixed-positioned, so it would visually detach if the page
    // (or the scroll container it sits in) moved underneath it. Closing is
    // simpler and less jarring than chasing the input with a reposition on
    // every scroll frame. Capture phase, since a scrolling ancestor's event
    // doesn't bubble to window.
    function handleScroll(event: Event) {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setTypedSinceOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  // Spells out both halves of how this field works, right where the user is
  // already looking (Question 238) — the arrow alone reads as "this is a
  // dropdown," which hides the fact that it stays freely typeable.
  const fieldPlaceholder = compact
    ? placeholder
    : placeholder
      ? `${placeholder} — or choose from the list`
      : "Type a language — or choose from the list";

  const query = typedSinceOpen ? value.trim().toLowerCase() : "";
  const matches = (name: string) => name.toLowerCase().includes(query);
  const recentMatches = recents.filter(matches);
  const allMatches = LANGUAGE_NAMES.filter(matches);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setTypedSinceOpen(true);
          if (!open) openDropdown();
        }}
        onBlur={handleBlur}
        placeholder={fieldPlaceholder}
        title={TYPE_OR_CHOOSE_HINT}
        className={`pr-8 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show languages"
        aria-expanded={open}
        title="Show languages"
        onClick={() => {
          if (open) {
            setOpen(false);
            setTypedSinceOpen(false);
          } else {
            setTypedSinceOpen(false);
            openDropdown();
          }
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
      >
        ▾
      </button>

      {open && rect && (
        <div
          ref={dropdownRef}
          style={{
            left: rect.left,
            width: rect.width,
            top: rect.top,
            bottom: rect.bottom,
            maxHeight: rect.maxHeight,
          }}
          className="fixed z-50 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
        >
          {recentMatches.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-semibold text-zinc-500">
                Recently used
              </p>
              {recentMatches.map((name) => (
                <button
                  key={`recent-${name}`}
                  type="button"
                  onClick={() => handleSelect(name)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  {name}
                </button>
              ))}
            </>
          )}

          {allMatches.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-semibold text-zinc-500">
                All languages
              </p>
              {allMatches.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelect(name)}
                  className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800 ${
                    name.toLowerCase() === value.trim().toLowerCase()
                      ? "text-indigo-400"
                      : "text-zinc-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </>
          )}

          {recentMatches.length === 0 && allMatches.length === 0 && (
            // The field stays freeform on purpose — this list is a
            // convenience, not a constraint, so "no match" says so rather
            // than implying the typed name is invalid.
            <p className="px-3 py-2 text-xs text-zinc-500">
              No language matches that. You can still type any name — it just
              may not have a matching voice.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
