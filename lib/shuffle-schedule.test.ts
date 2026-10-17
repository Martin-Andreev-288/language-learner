import { describe, it, expect } from "vitest";
import {
    REVIEW_INTERVAL_DAYS,
    daysUntilDue,
    intervalAfterReviews,
    isDue,
} from "./shuffle-schedule";

// The schedule decides which lists the Review due card offers. Wrong one
// way, a list you just reviewed comes straight back; wrong the other, a list
// drops out of sight and is never offered again. Dates are built from local
// parts, because the function counts days in the viewer's own time zone.

function local(year: number, month: number, day: number, hour = 12) {
    return new Date(year, month - 1, day, hour);
}

describe("intervalAfterReviews", () => {
    it("grows 1, 3, 7, 14, 30 days with each review", () => {
        expect([1, 2, 3, 4, 5].map(intervalAfterReviews)).toEqual([
            1, 3, 7, 14, 30,
        ]);
    });

    it("stays at 30 days after the fifth review", () => {
        expect(intervalAfterReviews(6)).toBe(30);
        expect(intervalAfterReviews(40)).toBe(30);
    });

    it("treats a count of zero as the first step rather than failing", () => {
        expect(intervalAfterReviews(0)).toBe(REVIEW_INTERVAL_DAYS[0]);
    });
});

describe("daysUntilDue", () => {
    const now = local(2026, 10, 16);

    it("makes a list that was never reviewed due today", () => {
        expect(daysUntilDue({ reviewCount: 0, lastReviewedAt: null }, now)).toBe(0);
    });

    it("counts down from the last review by the current interval", () => {
        const reviewedTwice = { reviewCount: 2, lastReviewedAt: local(2026, 10, 15) };
        expect(daysUntilDue(reviewedTwice, now)).toBe(2);
    });

    it("is due on the day the interval runs out", () => {
        const reviewedOnce = { reviewCount: 1, lastReviewedAt: local(2026, 10, 15) };
        expect(daysUntilDue(reviewedOnce, now)).toBe(0);
    });

    it("goes negative once the list is overdue", () => {
        const reviewedOnce = { reviewCount: 1, lastReviewedAt: local(2026, 10, 10) };
        expect(daysUntilDue(reviewedOnce, now)).toBe(-5);
    });

    // Reviewed at 23:30, opened at 00:30: an hour later, but the next day,
    // so a one-day interval has already run out.
    it("counts calendar days, not 24-hour periods", () => {
        const lateNight = { reviewCount: 1, lastReviewedAt: local(2026, 10, 15, 23) };
        expect(daysUntilDue(lateNight, local(2026, 10, 16, 0))).toBe(0);
    });

    it("is not thrown off by a clock change in between", () => {
        // The last Sunday of October is a 25-hour day in much of Europe.
        const beforeChange = { reviewCount: 3, lastReviewedAt: local(2026, 10, 24) };
        expect(daysUntilDue(beforeChange, local(2026, 10, 31))).toBe(0);
    });

    it("accepts the date as a string, the way it arrives from the server", () => {
        const fromServer = {
            reviewCount: 1,
            lastReviewedAt: local(2026, 10, 15).toISOString(),
        };
        expect(daysUntilDue(fromServer, now)).toBe(0);
    });
});

describe("isDue", () => {
    const now = local(2026, 10, 16);

    it("is true today and when overdue, false before", () => {
        expect(isDue({ reviewCount: 1, lastReviewedAt: local(2026, 10, 15) }, now)).toBe(true);
        expect(isDue({ reviewCount: 1, lastReviewedAt: local(2026, 10, 1) }, now)).toBe(true);
        expect(isDue({ reviewCount: 2, lastReviewedAt: local(2026, 10, 15) }, now)).toBe(false);
    });
});
