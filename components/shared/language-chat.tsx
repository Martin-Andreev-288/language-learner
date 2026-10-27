"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import LanguageCombobox from "@/components/shared/language-combobox";
import { checkWriting } from "@/app/actions/writing-check-actions";
import { translateChatMessage } from "@/app/actions/chat-translate-actions";
import { upsertNote } from "@/app/actions/note-actions";
import {
  CHAT_METADATA_KIND,
  encodeChatMetadata,
  formatChatTranscript,
  messageText,
  type FeedbackState,
} from "@/lib/language-chat-note-format";
import { readAndClearChatCarry } from "@/lib/language-chat-carry";
import { CHAT_MODES, type ChatMode } from "@/lib/language-chat-mode";
import {
  clearChatDraft,
  readChatDraft,
  writeChatDraft,
  type TranslationState,
} from "@/lib/language-chat-draft";
import { describeClientError } from "@/lib/client-error";
import { useInBrowser } from "@/lib/use-in-browser";
import {
  correctionBadges,
  findCorrectionSpans,
  unmarkedReason,
} from "@/lib/correction-spans";
import MarkedText from "@/components/shared/marked-text";
import { guessLanguageCode } from "@/lib/language-codes";
import { isTouchScreen } from "@/lib/is-touch-screen";
import { useSpeechToText } from "@/lib/use-speech-to-text";
import { useTextToSpeech } from "@/lib/use-text-to-speech";
import MicIcon from "@/components/shared/mic-icon";
import PronunciationNote from "@/components/shared/pronunciation-note";

// How long a pause means "I've finished my sentence", when auto-send is on.
// Deliberately nothing like the hook's own 45-second idle stop: that one
// exists to end a whole dictation, this one to end a single turn.
const AUTO_SEND_AFTER_SILENCE_MS = 2500;

// About six lines at this text size, after which the box scrolls instead of
// growing further.
const INPUT_MAX_HEIGHT_PX = 140;

// Drawn first as for a first visit, then — once in the browser — again with
// this tab's conversation, so a full page load matches the server's page
// instead of contradicting it (see lib/use-in-browser.ts).
export default function LanguageChat({
  mode,
  defaultTranslateLanguage,
}: {
  mode: ChatMode;
  defaultTranslateLanguage: string;
}) {
  const inBrowser = useInBrowser();
  return (
    <LanguageChatScreen
      key={inBrowser ? "browser" : "server"}
      restoreDraft={inBrowser}
      mode={mode}
      defaultTranslateLanguage={defaultTranslateLanguage}
    />
  );
}

function LanguageChatScreen({
  mode,
  defaultTranslateLanguage,
  restoreDraft,
}: {
  mode: ChatMode;
  defaultTranslateLanguage: string;
  restoreDraft: boolean;
}) {
  const config = CHAT_MODES[mode];

  // Two things can seed this page, and they're read in a deliberate order
  // (Answer 171/225's discipline: as the initial state itself, not in an
  // effect afterward, and exactly once each).
  //
  // A carry wins over a draft when both exist. Clicking "Continue this
  // conversation" is an explicit request for *that* conversation, so it
  // must not be quietly overruled by whatever was last left on this page.
  // The carry read also clears itself as a side effect, so it's read once
  // into its own state rather than called again per field.
  //
  // Both are read under this chat's own key, so the written and spoken
  // conversations can never surface in each other's page.
  //
  // Neither is read in the first, server-matching draw: the carry clears
  // itself when read, so reading it there would hand the conversation to a
  // screen about to be replaced and leave nothing for the real one.
  const [initial] = useState(() => {
    if (!restoreDraft) return null;
    const carry = readAndClearChatCarry(mode);
    if (carry) return carry;
    return readChatDraft(mode);
  });
  // Only a draft can carry these two. A carry comes out of a saved note,
  // and a note has never stored a translation — translations are a reading
  // aid for this page, not part of the conversation itself.
  const initialDraft = initial && "translations" in initial ? initial : null;
  const [language, setLanguage] = useState(() => initial?.language ?? "");
  // Same order as everywhere else: what this conversation was already using
  // wins, and the default only fills an empty field.
  const [translateInto, setTranslateInto] = useState(
    () => initialDraft?.translateInto || defaultTranslateLanguage,
  );
  const [translations, setTranslations] = useState<
    Map<string, TranslationState>
  >(() => initialDraft?.translations ?? new Map());
  const [openTranslations, setOpenTranslations] = useState<Set<string>>(
    new Set(),
  );
  // Speaking is on by default — it's what this page is for — and auto-send
  // is off, so nothing is sent without you deciding to (Question 290).
  const [speakReplies, setSpeakReplies] = useState(
    () => initialDraft?.speakReplies ?? true,
  );
  const [autoSend, setAutoSend] = useState(
    () => initialDraft?.autoSend ?? false,
  );
  // Presets rather than a slider, matching the Speed control Parallel
  // Listen and Shadowing Practice already offer, so speech speed is set the
  // same way everywhere in this app.
  const [speechRate, setSpeechRate] = useState(
    () => initialDraft?.speechRate ?? 1,
  );
  // Which reply is being read out, so its own button can offer to stop it.
  // Null whenever nothing is being said.
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null,
  );
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<Map<string, FeedbackState>>(
    () => initial?.feedback ?? new Map(),
  );
  const [openFeedback, setOpenFeedback] = useState<Set<string>>(new Set());
  // Which correction was just pointed at by clicking its mark, as
  // "messageId:index", so its line under the message lights up briefly —
  // the same answer Writing Check gives to "which explanation is this?".
  const [flashedCorrection, setFlashedCorrection] = useState<string | null>(
    null,
  );
  const flashResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Auto-send's timer fires up to a couple of seconds after it was set,
  // by which point the render that set it is long gone — so it calls
  // through this rather than capturing a stale message.
  const sendCurrentMessageRef = useRef<() => void>(() => {});

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
  //
  // Never from the first, server-matching draw: it has no conversation in
  // it, so it would clear the stored one a moment before the browser draw
  // reads it back.
  useEffect(() => {
    if (!restoreDraft || busy) return;
    if (messages.length === 0) {
      // Nothing worth restoring — and leaving a stale draft behind would
      // resurrect a conversation the user has already cleared.
      clearChatDraft(mode);
      return;
    }
    writeChatDraft(mode, {
      language,
      messages,
      feedback,
      noteId: savedNoteId,
      translateInto,
      translations,
      speakReplies,
      autoSend,
      speechRate,
    });
  }, [
    restoreDraft,
    mode,
    speakReplies,
    autoSend,
    speechRate,
    busy,
    messages,
    language,
    feedback,
    savedNoteId,
    translateInto,
    translations,
  ]);

  // Dictation (Question 293), in speaking mode only. The hook is called
  // either way because hooks can't be conditional; in the written chat
  // nothing ever starts it, so it costs one capability check and sits idle.
  //
  // Spoken words land in the same input box typing goes to, and are not
  // sent for you unless you switch that on — you read them, fix whatever
  // was misheard, then send. That's the whole reason the box stays
  // editable (Answer 278).
  const langCode = guessLanguageCode(language);

  const handleDictatedText = useCallback((chunk: string) => {
    const spoken = chunk.trim();
    if (!spoken) return;
    setInput((prev) =>
      // The browser hands back chunks with no leading space, so joining
      // them naively runs one sentence into the next.
      prev ? `${prev.replace(/\s+$/, "")} ${spoken}` : spoken,
    );
  }, []);

  const {
    supported: dictationSupported,
    listening,
    interimTranscript,
    error: dictationError,
    notice: dictationNotice,
    start: startDictation,
    stop: stopDictation,
  } = useSpeechToText({ lang: langCode, onFinalResult: handleDictatedText });

  // Whether the microphone should come back on once this turn is over.
  // Only true when the message that started the turn was actually spoken —
  // re-arming after a message you *typed* would switch your microphone on
  // uninvited, which is not something a page should do.
  const wasDictatingRef = useRef(false);

  // Which replies have already been read out. Seeded with whatever was
  // restored from a draft or a saved conversation, so returning to the page
  // doesn't make it announce the last thing it said before you left.
  const spokenIdsRef = useRef<Set<string>>(
    new Set((initial?.messages ?? []).map((message) => message.id)),
  );

  // Fires only when a reply finishes being spoken on its own, never when
  // it's cut off — see lib/use-text-to-speech.ts. That distinction is what
  // makes this safe to hang the microphone off: pressing Stop silences the
  // voice without also switching the microphone back on.
  const handleSpeechFinished = useCallback(() => {
    setSpeakingMessageId(null);
    if (!wasDictatingRef.current) return;
    wasDictatingRef.current = false;
    startDictation();
  }, [startDictation]);

  const {
    supported: speechSupported,
    speaking,
    speak,
    stop: stopSpeaking,
  } = useTextToSpeech({
    lang: langCode,
    rate: speechRate,
    onFinished: handleSpeechFinished,
  });

  // Every stop goes through here, so the "which reply is talking" marker
  // can never be left pointing at a reply that has gone quiet.
  const silence = useCallback(() => {
    stopSpeaking();
    setSpeakingMessageId(null);
  }, [stopSpeaking]);

  // Reading a specific reply out, whether that's a new one arriving or an
  // old one you asked to hear again. Interrupting whatever is currently
  // being said is right either way — two replies talking over each other
  // helps nobody.
  const speakMessage = useCallback(
    (id: string, text: string) => {
      if (!text.trim()) return;
      setSpeakingMessageId(id);
      speak(text);
    },
    [speak],
  );

  // The microphone must not be live while the voice is talking, or
  // recognition hears the app's own reply and types it back as something
  // you said — the feedback loop flagged in Answer 288, and the only
  // genuinely hard part of this step.
  //
  // In practice sending already stops dictation, so this is a belt as well
  // as braces: it also covers restarting the microphone by hand mid-reply.
  useEffect(() => {
    if (speaking && listening) stopDictation();
  }, [speaking, listening, stopDictation]);

  // Read each new reply aloud once it has finished streaming. Waiting for
  // `busy` to clear rather than speaking as tokens arrive is deliberate:
  // half a sentence read aloud is worse than a moment's pause.
  useEffect(() => {
    if (!config.voice || !speakReplies || !speechSupported || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    speakMessage(last.id, messageText(last));
  }, [
    config.voice,
    speakReplies,
    speechSupported,
    busy,
    messages,
    speakMessage,
  ]);

  // When nothing is going to be said out loud — either because you switched
  // it off, or because this browser can't speak at all — the turn ends as
  // soon as the reply has finished arriving, since there's nothing to wait
  // for it to finish saying. Without this second path the microphone would
  // sit waiting forever on a browser with no voice, for a signal that could
  // never come.
  useEffect(() => {
    if (!config.voice || busy) return;
    if (speakReplies && speechSupported) return;
    if (!wasDictatingRef.current) return;
    wasDictatingRef.current = false;
    startDictation();
  }, [config.voice, speakReplies, speechSupported, busy, startDictation]);

  const canDictate = dictationSupported && langCode !== undefined;
  const dictateTitle = !dictationSupported
    ? "This browser doesn't support speech recognition — try Chrome, Edge, or Safari"
    : !langCode
      ? "Pick a language first, so dictation listens for the right one"
      : listening
        ? "Stop dictating"
        : `Dictate in ${language.trim()}`;

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

  function flashCorrection(messageId: string, index: number) {
    document
      .getElementById(`chat-correction-${messageId}-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setFlashedCorrection(`${messageId}:${index}`);
    if (flashResetRef.current) clearTimeout(flashResetRef.current);
    flashResetRef.current = setTimeout(() => setFlashedCorrection(null), 1500);
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

  function toggleTranslation(id: string) {
    setOpenTranslations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Translating into a different language invalidates everything already
  // translated — those results are in the *old* language, and showing them
  // again under the new one would be quietly wrong. Cheaper to drop them
  // than to track which language each was translated into.
  function handleTranslateIntoChange(next: string) {
    setTranslateInto(next);
    setTranslations(new Map());
    setOpenTranslations(new Set());
  }

  async function handleTranslate(id: string, text: string) {
    const existing = translations.get(id);
    if (existing?.status === "loading") return;
    // Already have it — this click is only show/hide, not a second AI call.
    if (existing?.status === "done") {
      toggleTranslation(id);
      return;
    }
    if (!translateInto.trim()) return;

    // A previous failure falls through to here rather than toggling, so the
    // button doubles as "try again" instead of leaving a dead panel behind.
    setTranslations((prev) => new Map(prev).set(id, { status: "loading" }));
    setOpenTranslations((prev) => new Set(prev).add(id));
    try {
      const result = await translateChatMessage(text, language, translateInto);
      setTranslations((prev) =>
        new Map(prev).set(
          id,
          result.ok
            ? { status: "done", text: result.data }
            : { status: "error", message: result.error },
        ),
      );
    } catch (err) {
      setTranslations((prev) =>
        new Map(prev).set(id, {
          status: "error",
          message: describeClientError(err, "Couldn't translate that message."),
        }),
      );
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    sendCurrentMessage();
  }

  function sendCurrentMessage() {
    const text = input.trim();
    if (!text || busy) return;
    // Sending ends this turn. Leaving the microphone live would start
    // filling the box with your next sentence before you had even heard the
    // reply — it comes back on by itself once the reply has been spoken,
    // and only if this message was spoken rather than typed.
    if (listening) {
      wasDictatingRef.current = true;
      stopDictation();
    }
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

  // Auto-send, when it's switched on (Question 290). "The dictation is
  // over" has to mean *a short silence*, not "you pressed Stop" — pressing
  // Stop and pressing Send are the same single click, so that version would
  // save nothing. The timer is restarted by anything heard at all,
  // including a word still being revised, so it only fires on a real pause.
  //
  // Guarded on `listening` for a reason worth stating: without it, typing a
  // message and then pausing to think would send it out from under you.
  useEffect(() => {
    if (!config.voice || !autoSend || !listening || busy) return;
    if (!input.trim()) return;
    const timer = setTimeout(() => {
      sendCurrentMessageRef.current();
    }, AUTO_SEND_AFTER_SILENCE_MS);
    return () => clearTimeout(timer);
    // interimTranscript is in here precisely because it changes on every
    // syllable — that is what keeps the countdown from running while you
    // are still mid-sentence.
  }, [config.voice, autoSend, listening, busy, input, interimTranscript]);

  // The message box grows with the message instead of scrolling sideways,
  // so a longer sentence can be read back and corrected without dragging
  // through it (Question 294). Capped, then it scrolls — an input that ate
  // the conversation above it would be its own problem.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  useEffect(() => {
    sendCurrentMessageRef.current = sendCurrentMessage;
  });

  function handleNewChat() {
    if (listening) stopDictation();
    if (speaking) silence();
    wasDictatingRef.current = false;
    setMessages([]);
    setFeedback(new Map());
    setOpenFeedback(new Set());
    // The translations go, the chosen language stays — same rule the
    // practice language above already follows. It's a setting, not part of
    // the conversation being cleared.
    setTranslations(new Map());
    setOpenTranslations(new Set());
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
      const title = language.trim() || config.fallbackNoteTitle;
      const data = { language, messages, feedback };
      // Updates the note this conversation is already saved to, or creates
      // one the first time. Passing the id back lets the action fall back to
      // creating if that note was deleted from Notes in the meantime, so a
      // deleted note never turns a save into an error.
      const saved = await upsertNote(
        savedNoteId,
        config.notePage,
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
            <h1 className="text-2xl font-semibold tracking-tight">
              {config.heading}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{config.description}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
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
            {/* Optional, and left empty by default: the app has no notion of
                which language you already speak, so there's nothing sensible
                to guess here. Leaving it blank simply means the reply
                bubbles carry no Translate button — the chat works exactly as
                it did before this existed. */}
            <div>
              <label
                htmlFor="chat-translate-into"
                className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Translate into
              </label>
              <LanguageCombobox
                id="chat-translate-into"
                value={translateInto}
                onChange={handleTranslateIntoChange}
                placeholder="Optional"
                compact
                wrapperClassName="w-40"
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
                // Only a message of yours ever has corrections, and only
                // its own text is what they quote — so this is the text to
                // mark, not whatever the reply said.
                const spans =
                  mistakes.length > 0
                    ? findCorrectionSpans(messageText(message), mistakes)
                    : [];
                const badges = correctionBadges(spans);
                const translation = translations.get(message.id);
                const translationOpen = openTranslations.has(message.id);

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

                    {/* Expanded corrections look the way Writing Check's do:
                        your own words first, with each mistake marked and
                        numbered in place, then the numbered explanations —
                        struck-through original, correction, why. One look
                        for the same information wherever it appears. */}
                    {expanded && state?.status === "done" && (
                      <div className="mt-2 flex justify-end">
                        <div className="w-[85%] rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          {mistakes.length === 0 ? (
                            <p className="text-sm text-emerald-400">
                              Nothing to correct here ✅
                            </p>
                          ) : (
                            <>
                              {spans.length > 0 && (
                                <p className="mb-3 whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-900 p-2.5 text-sm leading-relaxed text-zinc-200">
                                  <MarkedText
                                    text={messageText(message)}
                                    spans={spans}
                                    badges={badges}
                                    onMarkClick={(index) =>
                                      flashCorrection(message.id, index)
                                    }
                                  />
                                </p>
                              )}
                              <ul className="space-y-2">
                                {mistakes.map((correction, index) => {
                                  const badge = badges.get(index);
                                  return (
                                    <li
                                      key={index}
                                      id={`chat-correction-${message.id}-${index}`}
                                      className={`-mx-2 rounded-md px-2 py-1 transition-colors ${
                                        flashedCorrection === `${message.id}:${index}`
                                          ? "bg-indigo-950/60 ring-1 ring-indigo-500"
                                          : ""
                                      }`}
                                    >
                                      <div className="flex items-start gap-2">
                                        {badge && (
                                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/30 text-xs font-bold text-red-200">
                                            {badge}
                                          </span>
                                        )}
                                        <p className="text-sm text-red-400 line-through decoration-red-500/60">
                                          {correction.original}
                                        </p>
                                      </div>
                                      <p className="mt-0.5 text-sm font-medium text-emerald-400">
                                        {correction.corrected}
                                      </p>
                                      <p className="mt-1 text-sm text-zinc-400">
                                        {correction.explanation}
                                      </p>
                                      {!badge && spans.length > 0 && (
                                        <p className="mt-1 text-xs text-zinc-600">
                                          {unmarkedReason(
                                            messageText(message),
                                            correction.original,
                                          )}
                                        </p>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Only on replies, and only once a "Translate into"
                        language is set. Your own messages don't get one —
                        you wrote them, and the badge beside them is already
                        the thing that has something to say about them. */}
                    {message.role === "assistant" &&
                      (config.voice || translateInto.trim() !== "") && (
                        <div className="mt-1 flex justify-start gap-1">
                          {/* Hearing a reply again is the whole point of a
                              spoken conversation — a sentence you didn't
                              catch shouldn't need retyping into something
                              else to hear twice. Shown even when replies
                              aren't read aloud automatically, since that
                              switch is about what happens on arrival, not
                              about whether you may ask. */}
                          {config.voice && speechSupported && (
                            <button
                              onClick={() =>
                                speakingMessageId === message.id && speaking
                                  ? silence()
                                  : speakMessage(
                                      message.id,
                                      messageText(message),
                                    )
                              }
                              disabled={busy}
                              title={
                                speakingMessageId === message.id && speaking
                                  ? "Stop reading this reply"
                                  : "Read this reply aloud again"
                              }
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:text-zinc-700"
                            >
                              {speakingMessageId === message.id && speaking
                                ? "Stop"
                                : "Play again"}
                            </button>
                          )}
                          {translateInto.trim() !== "" && (
                          <button
                            onClick={() =>
                              handleTranslate(message.id, messageText(message))
                            }
                            /* Disabled while a reply streams: the newest
                               message is still half-written, and translating
                               a fragment would spend a request on text
                               that's about to change. */
                            disabled={busy || translation?.status === "loading"}
                            title={
                              translation?.status === "done" && translationOpen
                                ? "Hide the translation"
                                : `Translate this reply into ${translateInto.trim()}`
                            }
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:text-zinc-700"
                          >
                            {translation?.status === "loading"
                              ? "Translating…"
                              : translation?.status === "error"
                                ? "Try again"
                                : translationOpen
                                  ? "Hide translation"
                                  : "Translate"}
                          </button>
                          )}
                        </div>
                      )}

                    {/* Nothing is drawn while it's still loading — the
                        button already says so, and an empty panel would
                        just push the conversation around for a second. */}
                    {translationOpen &&
                      (translation?.status === "done" ||
                        translation?.status === "error") && (
                        <div className="mt-1 flex justify-start">
                          <div className="w-[85%] rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            {translation.status === "error" ? (
                              <p className="text-sm text-red-400">
                                {translation.message}
                              </p>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-zinc-300">
                                {translation.text}
                              </p>
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

          {/* Kept out of the input's own value on purpose: interim results
              are rewritten on every syllable, so putting them in the
              editable field would rewrite it under the cursor of anyone
              typing (Answer 280). */}
          {config.voice && listening && (
            <p className="flex items-start gap-2 border-t border-zinc-800 px-6 py-2 text-sm text-zinc-500">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="italic">{interimTranscript || "Listening…"}</span>
            </p>
          )}
          {/* Two different weights on purpose: an error is something to fix
              before dictation can work at all, a notice is just how this
              dictation ended (Answer 283). */}
          {config.voice && dictationError && (
            <p className="border-t border-zinc-800 px-6 py-2 text-sm text-red-400">
              {dictationError}
            </p>
          )}
          {config.voice && dictationNotice && !dictationError && (
            <p className="border-t border-zinc-800 px-6 py-2 text-sm text-zinc-500">
              {dictationNotice}
            </p>
          )}
          {config.voice && !dictationSupported && (
            <p className="border-t border-zinc-800 px-6 py-2 text-sm text-amber-400">
              Dictation isn&apos;t available in this browser — try Chrome,
              Edge, or Safari. Typing here still works.
            </p>
          )}

          {config.voice && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-800 px-6 py-2 text-sm text-zinc-400">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={speakReplies}
                  onChange={(event) => {
                    setSpeakReplies(event.target.checked);
                    if (!event.target.checked) silence();
                  }}
                  className="accent-indigo-500"
                />
                Read replies aloud
              </label>
              <label
                className="flex cursor-pointer items-center gap-2"
                title="Send a dictated message on its own after a short pause, instead of waiting for you to press Send"
              >
                <input
                  type="checkbox"
                  checked={autoSend}
                  onChange={(event) => setAutoSend(event.target.checked)}
                  className="accent-indigo-500"
                />
                Send when I stop talking
              </label>
              {/* Takes effect on the next thing said rather than mid-
                  sentence: the browser fixes an utterance's rate when it
                  starts speaking it. Since replies are spoken sentence by
                  sentence, a change made while one is being read catches up
                  within a sentence or so. */}
              <label className="flex items-center gap-1.5">
                Speed
                <select
                  value={speechRate}
                  onChange={(event) =>
                    setSpeechRate(Number(event.target.value))
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
              {speaking && (
                <button
                  type="button"
                  onClick={silence}
                  className="ml-auto rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  Stop speaking
                </button>
              )}
              {!speechSupported && (
                <span className="text-amber-400">
                  This browser can&apos;t read replies aloud.
                </span>
              )}
            </div>
          )}
          {config.voice && (
            <PronunciationNote className="border-t border-zinc-800 px-6 py-2">
              Your messages are checked from the words the browser writes
              down, so this practises what you say, not how you pronounce
              it.
            </PronunciationNote>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t border-zinc-800 p-4"
          >
            {/* A textarea rather than a single-line input, so a longer
                message grows the box instead of scrolling sideways out of
                sight (Question 294). Enter still sends, since this is a
                chat; Shift+Enter is there for anyone who wants a line
                break — except on a touch screen, which has no Shift+Enter
                to reach for, so there Enter breaks the line instead and
                sending is left to the button beside it (Question 435). */}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !isTouchScreen()
                ) {
                  event.preventDefault();
                  sendCurrentMessage();
                }
              }}
              placeholder={
                config.voice
                  ? "Say something, or type it…"
                  : "Type your message…"
              }
              className="min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
            {/* Disabled rather than hidden when unavailable (Answer 278): a
                missing button reads as a missing feature, while a disabled
                one with a reason reads as a limitation. */}
            {config.voice && (
              <button
                type="button"
                onClick={listening ? stopDictation : startDictation}
                disabled={!canDictate}
                title={dictateTitle}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  listening
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {listening ? (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                ) : (
                  <MicIcon />
                )}
                {listening ? "Stop" : "Dictate"}
              </button>
            )}
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
