"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/reading", label: "Reading" },
  { href: "/writing", label: "Writing" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/vocabulary-analyzer", label: "Analyzer" },
  { href: "/notes", label: "Notes" },
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

  if (isMobile) {
    return (
      <>
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
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
        const isActive = pathname === link.href;
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
