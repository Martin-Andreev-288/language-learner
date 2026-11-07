import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, deleteMany } = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { vocabularyEntry: { deleteMany } },
}));

import { deleteVocabularyEntries } from "./vocabulary-entry-actions";

// The ids come from the browser, so they prove nothing about who owns the
// words. What stands between one account and another's list is the userId in
// this query, and that is the line worth holding in place.
describe("deleteVocabularyEntries", () => {
  beforeEach(() => {
    auth.mockReset();
    deleteMany.mockReset();
    auth.mockResolvedValue({ user: { id: "me" } });
    deleteMany.mockResolvedValue({ count: 2 });
  });

  it("only reaches the signed-in user's own words", async () => {
    await deleteVocabularyEntries(["a", "b"]);
    expect(deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["a", "b"] }, userId: "me" },
    });
  });

  it("reports how many really went, not how many were asked for", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteVocabularyEntries(["a", "b"])).resolves.toEqual({
      deleted: 1,
    });
  });

  it("refuses without a session, and touches nothing", async () => {
    auth.mockResolvedValue(null);
    await expect(deleteVocabularyEntries(["a"])).rejects.toThrow("Unauthorized");
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
