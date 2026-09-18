"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ALL_FEATURES } from "@/lib/feature-sections";

interface SubLink {
  href: string;
  label: string;
}

interface NavItem {
  href: string;
  label: string;
  subLinks?: SubLink[];
}

// Built from lib/feature-sections.ts rather than written out here
// (Question 379). This array used to be the only correct list of what the
// app contains, which was the problem: the pages those labels led to still
// said the feature was coming soon.
//
// Two labels also changed where they go. "Reading" pointed at
// /reading/shuffle and "Vocabulary" at /vocabulary/shuffle — reasonable when
// /reading was a stub worth skipping, and confusing now that it isn't:
// clicking Reading in the header and clicking Reading on the home page
// landed you in two different places. Both now open the section.
const navLinks: NavItem[] = [
  { href: "/", label: "Home" },
  ...ALL_FEATURES.map((feature) => ({
    href: feature.href,
    label: feature.label,
    // A section with one page gets no dropdown at all, rather than a menu
    // holding a single item that repeats the label above it.
    ...(feature.tools.length > 0
      ? {
          subLinks: feature.tools.map((tool) => ({
            href: tool.href,
            label: tool.label,
          })),
        }
      : {}),
  })),
  // Appended rather than added to ALL_FEATURES (Question 394): that list is
  // practice tools, read by the home page grids and the section pages as
  // well as by this nav. Contact is none of those things, and putting it
  // there would have it advertised on the home page as a sixth way to
  // practise a language.
  { href: "/contact", label: "Contact" },
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
