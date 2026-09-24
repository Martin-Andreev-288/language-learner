// Whether the device is driven by a finger rather than a mouse — the best
// available proxy for "there's no physical keyboard here" (Question 434).
//
// Read inside an event handler, never during render: the server can't
// answer this, so a render-time check would disagree with the server's
// HTML on hydration — the mismatch Question 389 already cost us once.
export function isTouchScreen() {
    return window.matchMedia("(pointer: coarse)").matches;
}
