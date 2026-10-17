import { describe, it, expect } from "vitest";
import { toolForPath } from "./last-tool";

// toolForPath decides two things: which pages count as "using a tool", and
// what the home page links back to. The second matters more, because its
// input there is a cookie — anything the browser sends — and the panel
// links to whatever comes out.

describe("toolForPath", () => {
    it("recognises a tool's own page", () => {
        expect(toolForPath("/writing/chat")).toEqual({
            href: "/writing/chat",
            name: "Chat",
        });
    });

    it("counts a page under a tool as that tool", () => {
        expect(toolForPath("/vocabulary/shuffle/review/abc123")).toEqual({
            href: "/vocabulary/shuffle",
            name: "Vocab Shuffle",
        });
    });

    it("ignores the home page and the section pages", () => {
        expect(toolForPath("/")).toBeNull();
        expect(toolForPath("/reading")).toBeNull();
        expect(toolForPath("/speaking")).toBeNull();
    });

    it("ignores addresses that are not a tool", () => {
        expect(toolForPath("/contact")).toBeNull();
        expect(toolForPath("/unmemorized")).toBeNull();
        expect(toolForPath("")).toBeNull();
    });

    // A prefix match on characters rather than on whole path segments
    // would let "/writing/chat-old" pass as Chat.
    it("matches whole path segments only", () => {
        expect(toolForPath("/writing/chat-old")).toBeNull();
        expect(toolForPath("/notesx")).toBeNull();
    });

    it("tells the five Notes pages apart by their section", () => {
        expect(toolForPath("/reading/notes")?.name).toBe("Reading Notes");
        expect(toolForPath("/speaking/notes")?.name).toBe("Speaking Notes");
    });

    it("recognises the standalone Notes page", () => {
        expect(toolForPath("/notes")).toEqual({ href: "/notes", name: "Notes" });
    });

    it("returns the tool's own address, never the one it was given", () => {
        expect(toolForPath("/writing/chat/../../elsewhere")?.href).toBe(
            "/writing/chat",
        );
    });
});
