"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import LanguageCombobox from "@/components/shared/language-combobox";
import { checkWriting } from "@/app/actions/writing-check-actions";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";

interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

// Per-message mistake check. Runs on its own, alongside the streamed reply,
// rather than as a tool the model chooses to call: this has to happen for
// every message, and tool-calling leaves that to the model's judgement
// (Answer 256). Keyed by message id so a slow check can never attach itself
// to the wrong message if you send another one meanwhile.
type FeedbackState =
  | { status: "checking" }
  | { status: "done"; corrections: Correction[] }
  | { status: "error"; message: string };

// A plain, read-only Markdown record of the conversation so far — not a
// format meant to be loaded back in and resumed (Answer 263 scoped that
// out deliberately, as its own later feature). Corrections sit right under
// the message they belong to, in the same struck-through/corrected/
// explanation shape the chat itself already shows, rather than collected
// into a separate list at the end — the point of saving this is a record
// of what was actually wrong and why, in the moment it happened.
function buildConversationNote(
  messages: UIMessage[],
  feedback: Map<string, FeedbackState>,
  language: string,
) {
  const title = language.trim() || "Chat";
  const turns = messages.map((message) => {
    const speaker = message.role === "user" ? "You" : `${title} partner`;
    let block = `**${speaker}:** ${messageText(message)}`;

    const state = feedback.get(message.id);
    if (message.role === "user" && state?.status === "done") {
      const corrections = state.corrections
        .map(
          (correction) =>
            `> ~~${correction.original}~~ → **${correction.corrected}**\n>\n> ${correction.explanation}`,
        )
        .join("\n>\n");
      if (corrections) block += `\n\n${corrections}`;
    }

    return block;
  });

  return turns.join("\n\n---\n\n");
}

// Message content arrives as an array of parts rather than a plain string —
// only the text ones are of interest here, since this chat has no tools.
function messageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

export default function LanguageChat() {
  const [language, setLanguage] = useState("");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Map<string, FeedbackState>>(
    new Map(),
  );
  const [openFeedback, setOpenFeedback] = useState<Set<string>>(new Set());
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  // No transport configured: /api/chat is already useChat's default
  // endpoint. The language rides along per message instead (see
  // handleSubmit), which keeps it read from state at send time rather than
  // captured once when the hook was set up.
  const { messages, sendMessage, status, error, setMessages } = useChat();

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
      setMessageFeedback(id, {
        status: "done",
        corrections: result.corrections,
      });
    } catch (err) {
      setMessageFeedback(id, {
        status: "error",
        message:
          err instanceof Error ? err.message : "Couldn't check that message.",
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
  }

  async function handleSaveToNote() {
    if (messages.length === 0) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      const title = language.trim() || "Chat";
      await createNote(
        NotePage.writing,
        title,
        buildConversationNote(messages, feedback, language),
      );
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
                  title="Save this conversation, with any feedback found so far, as a note"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    noteSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  } disabled:cursor-not-allowed`}
                >
                  {noteSaved
                    ? "Saved!"
                    : savingNote
                      ? "Saving…"
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
