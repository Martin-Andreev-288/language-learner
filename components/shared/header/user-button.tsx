"use client";

import { useState, useRef, useEffect } from "react";
import { signOutUser } from "@/app/actions/user-actions";

interface UserButtonProps {
  name: string | null | undefined;
  email: string | null | undefined;
}

export default function UserButton({ name, email }: UserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-sm text-gray-500 truncate">{email}</p>
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
