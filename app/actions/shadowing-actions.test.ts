import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, generateText } = vi.hoisted(() => ({
  auth: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("ai", () => ({ generateText, Output: { object: vi.fn() } }));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn() }));

import { checkShadowingAttempt } from "./shadowing-actions";

// Learner texts in Cyrillic mark the stressed vowel, and the recogniser
// never writes the mark (Question 114). A right attempt must not cost a
// request, and the model must not be shown the mark as a difference.
describe("checkShadowingAttempt with a stress-marked sentence", () => {
  beforeEach(() => {
    auth.mockReset();
    generateText.mockReset();
    auth.mockResolvedValue({ user: { id: "me" } });
    generateText.mockResolvedValue({
      output: { verdict: "close", summary: "One word differs.", differences: [] },
    });
  });

  it("answers a right attempt itself, without asking the model", async () => {
    const result = await checkShadowingAttempt(
      "Ты говори\u0301шь по-англи\u0301йски?",
      "ты говоришь по-английски",
      "Russian",
    );
    expect(result).toMatchObject({ ok: true, data: { verdict: "match" } });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("shows the model the sentence without its stress marks", async () => {
    await checkShadowingAttempt("Я иду\u0301 домо\u0301й.", "я иду дома", "Russian");
    expect(generateText).toHaveBeenCalledOnce();
    const { prompt } = generateText.mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain("Я иду домой.");
    expect(prompt).not.toContain("\u0301");
  });
});
