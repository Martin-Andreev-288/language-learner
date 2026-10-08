// Runs once before every test suite.

// Adds the DOM matchers — toBeInTheDocument, toHaveTextContent, toHaveClass
// and the rest. Importing the "/vitest" entry point rather than the bare
// package is what registers them with Vitest's expect rather than Jest's.
import "@testing-library/jest-dom/vitest";

// Unmounts anything a test rendered once it finishes. Without this, each
// test appends another copy of the component to the same document body, and
// queries like getByText start failing with "found multiple elements" in
// whichever test happens to run second.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
    cleanup();
});

// jsdom doesn't implement this — several components scroll a ref into view
// on their own, and without a stub that throws on render rather than doing
// nothing, which is what a real browser without a reason to scroll would do.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}
