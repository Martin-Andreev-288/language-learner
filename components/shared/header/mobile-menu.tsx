"use client";

import { useState } from "react";
import Link from "next/link";
import NavLinks from "./nav-links";
import UserButton from "./user-button";

interface MobileMenuProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
    };
  } | null;
  defaultTranslateLanguage: string;
}

export default function MobileMenu({
  session,
  defaultTranslateLanguage,
}: MobileMenuProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={toggleMobileMenu}
        className="flex flex-col items-center justify-center gap-1.5 rounded-lg p-2 transition-colors duration-200 hover:bg-gray-700 md:hidden"
        aria-label="Toggle navigation menu"
        aria-expanded={isMobileMenuOpen}
      >
        <span
          className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
            isMobileMenuOpen ? "translate-y-2 rotate-45" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
            isMobileMenuOpen ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
            isMobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
          }`}
        />
      </button>

      {/* Mobile Navigation Menu */}
      <nav
        className={`overflow-hidden transition-all duration-300 ease-in-out md:hidden ${
          isMobileMenuOpen ? "max-h-128 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 border-t border-gray-700 px-4 py-3">
          <NavLinks isMobile={true} onLinkClick={closeMobileMenu} />

          {/* Auth section for mobile */}
          <div className="mt-2 pt-2 border-t border-gray-700">
            {session ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <UserButton
                  name={session.user?.name}
                  email={session.user?.email}
                  defaultTranslateLanguage={defaultTranslateLanguage}
                />
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-white truncate">
                    {session.user?.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {session.user?.email}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/sign-in"
                  onClick={closeMobileMenu}
                  className="block px-4 py-3 text-center text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  onClick={closeMobileMenu}
                  className="block px-4 py-3 text-center text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
