"use client";

import { useState, useRef, useEffect } from "react";
import {
  setDefaultTranslateLanguage,
  signOutUser,
} from "@/app/actions/user-actions";
import { LANGUAGE_NAMES } from "@/lib/language-codes";

interface UserButtonProps {
  name: string | null | undefined;
  email: string | null | undefined;
  // The saved default, read on the server so this renders with the right
  // value already in it rather than filling itself in a moment later.
  defaultTranslateLanguage: string;
}

export default function UserButton({
  name,
  email,
  defaultTranslateLanguage,
}: UserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [language, setLanguage] = useState(defaultTranslateLanguage);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Applied straight away and only rolled back if the save actually fails.
  // The alternative — waiting for a round trip before the picker shows what
  // you chose — makes a one-click setting feel like it didn't register.
  async function handleLanguageChange(next: string) {
    const previous = language;
    setLanguage(next);
    setSaveError(null);
    try {
      await setDefaultTranslateLanguage(next);
    } catch {
      setLanguage(previous);
      setSaveError("Couldn't save that — try again.");
    }
  }

  const firstInitial =
    name?.charAt(0).toUpperCase() || email?.charAt(0).toUpperCase() || "U";

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold hover:bg-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-800"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {firstInitial}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-sm text-gray-500 truncate">{email}</p>
          </div>

          {/* Set here rather than on a settings page, because one setting
              doesn't warrant a page. A plain select rather than the app's
              language combobox: this is picked once and forgotten, from a
              list that's already known, and the combobox's own dropdown is
              dark-themed — right everywhere else in this app, wrong inside
              a white menu. */}
          <div className="border-b border-gray-100 px-4 py-3">
            <label
              htmlFor="default-translate-language"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
            >
              Translate into
            </label>
            <select
              id="default-translate-language"
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none transition-colors focus:border-gray-500"
            >
              {/* Empty is a real choice, not a missing one: it means "ask
                  me each time", which is how every one of these fields
                  behaved before this setting existed. */}
              <option value="">Ask me each time</option>
              {LANGUAGE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Fills in the translation language across the app. You can still
              change it anywhere.
            </p>
            {saveError && (
              <p className="mt-1 text-xs text-red-600">{saveError}</p>
            )}
          </div>

          {/* Sign Out */}
          <form action={signOutUser} className="w-full">
            <button
              type="submit"
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
