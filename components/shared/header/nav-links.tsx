"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface SubLink {
  href: string;
  label: string;
}

interface NavItem {
  href: string;
  label: string;
  subLinks?: SubLink[];
}

const navLinks: NavItem[] = [
  { href: "/", label: "Home" },
  {
    href: "/reading/shuffle",
    label: "Reading",
    subLinks: [
      { href: "/reading/shuffle", label: "Reading Shuffle" },
      { href: "/reading/island-dialogues", label: "Island Dialogues" },
    ],
  },
  {
    href: "/writing",
    label: "Writing",
    subLinks: [
      { href: "/writing", label: "My Texts" },
      { href: "/writing/templates", label: "Templates" },
      { href: "/writing/exercises", label: "Exercises" },
    ],
  },
  {
    href: "/vocabulary/shuffle",
    label: "Vocabulary",
    subLinks: [
      { href: "/vocabulary/shuffle", label: "Vocab Shuffle" },
      { href: "/vocabulary/flashcards", label: "Flashcards" },
    ],
  },
  {
    href: "/vocabulary-analyzer",
    label: "Analyzer",
    subLinks: [
      { href: "/vocabulary-analyzer", label: "Analyze Text" },
      { href: "/vocabulary-analyzer/history", label: "Recent Analyses" },
    ],
  },
  {
    href: "/notes",
    label: "Notes",
    subLinks: [
      { href: "/notes", label: "All Notes" },
      { href: "/notes/quick", label: "Quick Notes" },
      { href: "/notes/study", label: "Study Notes" },
    ],
  },
];

interface NavLinksProps {
  isMobile?: boolean;
  onLinkClick?: () => void;
}

export default function NavLinks({
  isMobile = false,
  onLinkClick,
}: NavLinksProps) {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleMouseEnter = (label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenDropdown(label);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const isPathActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  if (isMobile) {
    return (
      <>
        {navLinks.map((link) => {
          const isActive =
            isPathActive(link.href) ||
            link.subLinks?.some((sub) => isPathActive(sub.href));
          const isExpanded = expandedMobile === link.label;

          if (link.subLinks) {
            return (
              <div key={link.href}>
                <button
                  onClick={() =>
                    setExpandedMobile(isExpanded ? null : link.label)
                  }
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-base font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {link.label}
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    isExpanded ? "max-h-48" : "max-h-0"
                  }`}
                >
                  {link.subLinks.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={onLinkClick}
                      className={`block rounded-lg py-2 pl-8 pr-4 text-sm transition-all duration-200 ${
                        isPathActive(sub.href)
                          ? "text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onLinkClick}
              className={`rounded-lg px-4 py-3 text-base font-medium transition-all duration-200 ${
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {navLinks.map((link) => {
        const isActive =
          isPathActive(link.href) ||
          link.subLinks?.some((sub) => isPathActive(sub.href));

        if (link.subLinks) {
          return (
            <div
              key={link.href}
              className="relative"
              onMouseEnter={() => handleMouseEnter(link.label)}
              onMouseLeave={handleMouseLeave}
            >
              <Link
                href={link.href}
                className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {link.label}
                <svg
                  className={`h-3 w-3 transition-transform duration-200 ${
                    openDropdown === link.label ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </Link>

              {/* Mega-menu dropdown panel */}
              <div
                className={`absolute left-0 top-full z-50 mt-1 min-w-55 rounded-lg bg-gray-800 py-3 shadow-xl border border-gray-700 transition-all duration-200 ${
                  openDropdown === link.label
                    ? "visible translate-y-0 opacity-100"
                    : "invisible -translate-y-1 opacity-0"
                }`}
              >
                <div className="px-4 pb-2 mb-2 border-b border-gray-700">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    {link.label}
                  </span>
                </div>
                {link.subLinks.map((sub) => (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`block px-4 py-2 text-sm transition-colors duration-150 ${
                      isPathActive(sub.href)
                        ? "bg-gray-700 text-white"
                        : "text-gray-300 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {sub.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-gray-700 text-white"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
