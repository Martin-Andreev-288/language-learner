"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LAST_TOOL_COOKIE, toolForPath } from "@/lib/last-tool";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

// Remembers the last tool page you opened, for the home page's Continue
// panel (see lib/last-tool.ts). In the layout, once, so every tool is
// covered without each one having to remember to report itself — the same
// reason the guide pill sits there.
//
// The href goes in unencoded: every tool's address is lowercase letters,
// hyphens and slashes, which a cookie value can hold as they are.
export default function LastToolRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    const tool = toolForPath(pathname);
    if (!tool) return;

    document.cookie = `${LAST_TOOL_COOKIE}=${tool.href}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
  }, [pathname]);

  return null;
}
