import { describe, it, expect } from "vitest";
import { describeAiError } from "./ai-error";

// Only the time limit's message (item 10, iteration 4): a request cut short
// by AbortSignal.timeout throws a DOMException named TimeoutError, which the
// AI library passes through as it is.
describe("describeAiError", () => {
    it("says a request ran out of time, rather than that it couldn't reach the service", () => {
        const timedOut = new DOMException("The operation was aborted due to timeout", "TimeoutError");
        expect(describeAiError(timedOut, "Sounds check").message).toBe(
            "The sounds check took too long to answer — try again.",
        );
    });

    it("says the same for a request aborted another way", () => {
        const aborted = new DOMException("This operation was aborted", "AbortError");
        expect(describeAiError(aborted, "Attempt check").message).toMatch(/attempt check took too long/);
    });

    it("keeps the general message for anything else", () => {
        expect(describeAiError(new Error("boom"), "Sounds check").message).toMatch(/^Couldn't reach the sounds check/);
    });
});
