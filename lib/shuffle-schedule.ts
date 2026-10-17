// When a Shuffle list is next due, worked out from the two things every
// list already stores: how many times it has been marked as reviewed, and
// when that last happened. Each review pushes the next one further out;
// after the last step the gap stays at 30 days. The schedule is per list,
// not per card — cards store only memorized and favourite.
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReviewHistory = {
    reviewCount: number;
    lastReviewedAt: string | Date | null;
};

// The gap after a list's nth review: 1 day after the first, 3 after the
// second, and so on, holding at the last step from then on.
export function intervalAfterReviews(reviewCount: number): number {
    const step = Math.min(Math.max(reviewCount, 1), REVIEW_INTERVAL_DAYS.length);
    return REVIEW_INTERVAL_DAYS[step - 1];
}

function startOfLocalDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Whole calendar days until the list is due, in the viewer's own time zone:
// 0 means due today and a negative number means overdue. A list never
// reviewed is due today. Calendar days rather than hours, so a list
// reviewed late in the evening isn't due at an odd hour the next night.
// Math.round absorbs the 23- and 25-hour days at a clock change.
export function daysUntilDue(list: ReviewHistory, now: Date): number {
    if (!list.lastReviewedAt) return 0;

    const elapsed = Math.round(
        (startOfLocalDay(now) - startOfLocalDay(new Date(list.lastReviewedAt))) /
            MS_PER_DAY,
    );

    return intervalAfterReviews(list.reviewCount) - elapsed;
}

export function isDue(list: ReviewHistory, now: Date): boolean {
    return daysUntilDue(list, now) <= 0;
}
