import { useSyncExternalStore } from "react";

// Whether this render is in the browser yet: false on the server, false in
// the browser's first render of a server-drawn page (which must match the
// server's exactly), true from then on — and true straight away when the
// page is reached by a click from another page, where there is no server
// render to match.
//
// For the pages that keep a draft of themselves in sessionStorage
// (Parallel Translate, Inline Translate, Chat and Voice Chat). The server
// can't see that storage, so a page that read its draft in its very first
// render drew something the server never had; on a full page load React
// reported the two as different (error #418) and redrew the page itself.
// Each of those pages renders its screen without the draft until this is
// true, then once more with it (see where they use it).
const subscribeToNothing = () => () => {};

export function useInBrowser(): boolean {
    return useSyncExternalStore(
        subscribeToNothing,
        () => true,
        () => false,
    );
}
