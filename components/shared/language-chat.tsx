"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import LanguageCombobox from "@/components/shared/language-combobox";

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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    // Sent per message rather than configured once, so changing the
    // language mid-conversation takes effect on the very next message.
    sendMessage({ text }, { body: { language } });
    setInput("");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Practise by having a conversation. Your mistakes aren&apos;t
              corrected here — that&apos;s coming as its own step.
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
              <button
                onClick={() => setMessages([])}
                disabled={busy}
                title="Clear this conversation"
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                New chat
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-sm text-center text-sm text-zinc-600">
                  Pick a language and say something to get started — anything
                  at all. It replies in that language and keeps the
                  conversation going.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
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
              ))
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
