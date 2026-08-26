"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import LanguageCombobox from "@/components/shared/language-combobox";
import { checkWriting } from "@/app/actions/writing-check-actions";
import { upsertNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";
import {
  CHAT_METADATA_KIND,
  encodeChatMetadata,
  formatChatTranscript,
  messageText,
  type FeedbackState,
} from "@/lib/language-chat-note-format";
import { readAndClearChatCarry } from "@/lib/language-chat-carry";
import {
  clearChatDraft,
  readChatDraft,
  writeChatDraft,
} from "@/lib/language-chat-draft";
import { describeClientError } from "@/lib/client-error";

export default function LanguageChat() {
  // Two things can seed this page, and they're read in a deliberate order
  // (Answer 171/225's discipline: as the initial state itself, not in an
  // effect afterward, and exactly once each).
  //
  // A carry wins over a draft when both exist. Clicking "Continue this
  // conversation" is an explicit request for *that* conversation, so it
  // must not be quietly overruled by whatever was last left on this page.
  // The carry read also clears itself as a side effect, so it's read once
  // into its own state rather than called again per field.
  const [initial] = useState(() => {
    const carry = readAndClearChatCarry();
    if (carry) return carry;
    return readChatDraft();
  });
  const [language, setLanguage] = useState(() => initial?.language ?? "");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Map<string, FeedbackState>>(
    () => initial?.feedback ?? new Map(),
  );
  const [openFeedback, setOpenFeedback] = useState<Set<string>>(new Set());
  // Which note this conversation is saved to, once it has been saved at
  // all — or the note it was resumed from. Saving again updates that note
  // rather than creating a second copy of the same, still-growing
  // conversation (Question 268).
  const [savedNoteId, setSavedNoteId] = useState<string | null>(
    () => initial?.noteId ?? null,
  );
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  // No transport configured: /api/chat is already useChat's default
  // endpoint. The language rides along per message instead (see
  // handleSubmit), which keeps it read from state at send time rather than
  // captured once when the hook was set up. A restored conversation's
  // messages already carry mistake feedback from `feedback` above — none of
  // that gets re-checked, so resuming costs no extra AI calls for history
  // that was already looked at.
  const { messages, sendMessage, status, error, setMessages } = useChat({
    messages: initial?.messages ?? [],
  });

  const busy = status === "submitted" || status === "streaming";

  // Keep the newest message in view as it streams in.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Put the cursor back in the input once a reply finishes, so a
  // back-and-forth conversation never needs a click between turns.
  useEffect(() => {
    if (!busy) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [busy]);

  // Keeps the conversation recoverable across a navigation (Question 274).
  // A genuine "sync React state out to an external system" effect, the same
  // legitimate use Inline Translate's own draft makes of one.
  //
  // Skipped entirely while a reply is streaming: `messages` updates on
  // every token, and serializing the whole conversation that often would be
  // pure waste. Once streaming settles, `busy` flips and this runs with the
  // finished message, so nothing is missed by waiting.
  useEffect(() => {
    if (busy) return;
    if (messages.length === 0) {
      // Nothing worth restoring — and leaving a stale draft behind would
      // resurrect a conversation the user has already cleared.
      clearChatDraft();
      return;
    }
    writeChatDraft({ language, messages, feedback, noteId: savedNoteId });
  }, [busy, messages, language, feedback, savedNoteId]);

  function setMessageFeedback(id: string, state: FeedbackState) {
    setFeedback((prev) => new Map(prev).set(id, state));
  }

  // Deliberately not awaited by the send path: the reply starts streaming
  // immediately and the badge fills in whenever the check finishes, so a
  // slow check never delays the conversation itself.
  async function runFeedback(id: string, text: string) {
    setMessageFeedback(id, { status: "checking" });
    try {
      const result = await checkWriting(text, language);
      if (!result.ok) {
        setMessageFeedback(id, { status: "error", message: result.error });
        return;
      }
      setMessageFeedback(id, {
        status: "done",
        corrections: result.data.corrections,
      });
    } catch (err) {
      setMessageFeedback(id, {
        status: "error",
        message: describeClientError(err, "Couldn't check that message."),
      });
    }
  }

  function toggleFeedback(id: string) {
    setOpenFeedback((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    // Own id rather than letting the hook generate one, so the feedback
    // check can be keyed to this message from the moment it's sent.
    //
    // Passed as `id` on an explicit message object, NOT as `messageId`:
    // despite the name, `messageId` means "replace the existing message
    // that already has this id" — it's the edit/regenerate path — so
    // handing it a fresh id throws "message with id … not found"
    // (Question 261). `id` on a CreateUIMessage is the one that assigns.
    const messageId = crypto.randomUUID();
    // Sent per message rather than configured once, so changing the
    // language mid-conversation takes effect on the very next message.
    sendMessage(
      { id: messageId, role: "user", parts: [{ type: "text", text }] },
      { body: { language } },
    );
    void runFeedback(messageId, text);
    setInput("");
  }

  function handleNewChat() {
    setMessages([]);
    setFeedback(new Map());
    setOpenFeedback(new Set());
    setNoteError(null);
    setNoteSaved(false);
    // Critically also forgotten: without this, the first save of the *next*
    // conversation would overwrite the previous one's note instead of
    // starting a new one.
    setSavedNoteId(null);
  }

  async function handleSaveToNote() {
    if (messages.length === 0) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      const title = language.trim() || "Chat";
      const data = { language, messages, feedback };
      // Updates the note this conversation is already saved to, or creates
      // one the first time. Passing the id back lets the action fall back to
      // creating if that note was deleted from Notes in the meantime, so a
      // deleted note never turns a save into an error.
      const saved = await upsertNote(
        savedNoteId,
        NotePage.writing,
        title,
        // The note's text is only the readable transcript now; everything
        // needed to resume rides in metadata instead of being hidden in it.
        formatChatTranscript(data),
        { kind: CHAT_METADATA_KIND, data: encodeChatMetadata(data) },
      );
      setSavedNoteId(saved.id);
      setNoteSaved(true);
      if (noteResetRef.current) clearTimeout(noteResetRef.current);
      noteResetRef.current = setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      setNoteError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Practise by having a conversation. Each message you send is
              checked quietly in the background — the badge beside it opens the
              feedback when you want it.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label
                htmlFor="chat-language"
                className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Language
              </label>
              <LanguageCombobox
                id="chat-language"
                value={language}
                onChange={setLanguage}
                placeholder="e.g. French"
                wrapperClassName="w-52"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
            </div>
            {messages.length > 0 && (
              <>
                <button
                  onClick={handleSaveToNote}
                  disabled={savingNote}
                  title={
                    savedNoteId
                      ? "Update the note this conversation is saved to"
                      : "Save this conversation, with any feedback found so far, as a note"
                  }
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    noteSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  } disabled:cursor-not-allowed`}
                >
                  {/* Wording follows what the click actually does — once
                      this conversation has a note, saving updates it, so
                      "Save to a new note" would be a lie. */}
                  {noteSaved
                    ? "Saved!"
                    : savingNote
                      ? "Saving…"
                      : savedNoteId
                        ? "Save"
                        : "Save to a new note"}
                </button>
                <button
                  onClick={handleNewChat}
                  disabled={busy}
                  title="Clear this conversation"
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  New chat
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-sm text-center text-sm text-zinc-600">
                  Pick a language and say something to get started — anything at
                  all. It replies in that language and keeps the conversation
                  going.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const state = feedback.get(message.id);
                const expanded = openFeedback.has(message.id);
                const mistakes =
                  state?.status === "done" ? state.corrections : [];

                return (
                  <div key={message.id}>
                    <div
                      className={`flex items-start gap-2 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      {/* Badge sits beside the bubble rather than under it
                          as a labelled button (Answer 257) — compact enough
                          not to interrupt a fast conversation. */}
                      {message.role === "user" && state && (
                        <button
                          onClick={() => toggleFeedback(message.id)}
                          disabled={state.status === "checking"}
                          title={
                            state.status === "checking"
                              ? "Checking this message…"
                              : state.status === "error"
                                ? state.message
                                : mistakes.length > 0
                                  ? `${mistakes.length} thing${mistakes.length !== 1 ? "s" : ""} to look at`
                                  : "No mistakes found"
                          }
                          className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                            state.status === "checking"
                              ? "animate-pulse bg-zinc-700 text-zinc-500"
                              : state.status === "error"
                                ? "bg-zinc-700 text-zinc-400"
                                : mistakes.length > 0
                                  ? "bg-amber-500/25 text-amber-300 hover:bg-amber-500/40"
                                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35"
                          }`}
                        >
                          {state.status === "checking"
                            ? "·"
                            : state.status === "error"
                              ? "!"
                              : mistakes.length > 0
                                ? mistakes.length
                                : "✓"}
                        </button>
                      )}
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "rounded-br-sm bg-indigo-600 text-white"
                            : "rounded-bl-sm bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        {messageText(message)}
                      </div>
                    </div>

                    {/* Expanded corrections use Writing Check's own card
                        styling — struck-through original, correction, then
                        the explanation — rather than a second look for the
                        same information. */}
                    {expanded && state?.status === "done" && (
                      <div className="mt-2 flex justify-end">
                        <div className="w-[85%] rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          {mistakes.length === 0 ? (
                            <p className="text-sm text-emerald-400">
                              Nothing to correct here ✅
                            </p>
                          ) : (
                            <ul className="space-y-3">
                              {mistakes.map((correction, index) => (
                                <li key={index}>
                                  <p className="text-sm text-red-400 line-through decoration-red-500/60">
                                    {correction.original}
                                  </p>
                                  <p className="mt-0.5 text-sm font-medium text-emerald-400">
                                    {correction.corrected}
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-400">
                                    {correction.explanation}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Only while waiting for the reply to begin — once text starts
                streaming, the message itself is the progress indicator. */}
            {status === "submitted" && (
              <div className="flex justify-start">
                <div className="flex gap-1.5 rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-zinc-500"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-zinc-500"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <p className="border-t border-zinc-800 px-6 py-3 text-sm text-red-400">
              {error.message || "Something went wrong — try sending again."}
            </p>
          )}
          {noteError && (
            <p className="border-t border-zinc-800 px-6 py-3 text-sm text-red-400">
              {noteError}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-zinc-800 p-4"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type your message…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
