"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/constants";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/reading", label: "Reading" },
  { href: "/writing", label: "Writing" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/vocabulary-analyzer", label: "Vocabulary Analyzer" },
  { href: "/notes", label: "Notes" },
];

const Header = () => {
  const pathname = usePathname();

  return (
    <header className="bg-gray-800 py-4 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4">
        {/* Logo / App Name */}
        <Link
          href="/"
          className="text-xl font-bold hover:text-gray-300 transition-colors"
        >
          📚 {APP_NAME}
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
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
        </nav>
      </div>
    </header>
  );
};

export default Header;
