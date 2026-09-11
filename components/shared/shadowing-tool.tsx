"use client";

import { useEffect, useRef, useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";
import { guessLanguageCode } from "@/lib/language-codes";
import LanguageCombobox from "@/components/shared/language-combobox";
import { readAndClearShadowingCarry } from "@/lib/shadowing-carry";
import {
  encodeShadowingMetadata,
  formatShadowingTranscript,
  SHADOWING_METADATA_KIND,
} from "@/lib/shadowing-note-format";
import { createNote } from "@/app/actions/note-actions";
import { generateShadowingPassage } from "@/app/actions/shadowing-actions";
import { NotePage } from "@/app/generated/prisma";
import { describeClientError } from "@/lib/client-error";
import { SHADOWING_TOPIC_MAX_CHARACTERS } from "@/lib/limits";
import {
  DEFAULT_SHADOWING_LENGTH,
  DEFAULT_SHADOWING_REGISTER,
  SHADOWING_LENGTHS,
  SHADOWING_LEVELS,
  SHADOWING_REGISTERS,
} from "@/lib/shadowing-generation";

export default function ShadowingTool() {
  // Restored from a carry, if you arrived by pressing "Practice again" on a
  // saved note — read as part of the initial state itself rather than in an
  // effect afterwards (Answer 171's discipline), and read exactly once into
  // its own piece of state, since the read clears the carry as a side
  // effect: calling it again to seed the language would find nothing there.
  const [initialCarry] = useState(() => readAndClearShadowingCarry());
  const [text, setText] = useState(() => initialCarry?.text ?? "");
  const [language, setLanguage] = useState(() => initialCarry?.language ?? "");
  // Straight into practice when a passage was carried in, rather than
  // stopping at the paste screen with the box already filled. The button
  // said "Practice again"; asking you to press Start once more would be
  // answering a slightly different request. "← Back to passage" is right
  // there if you want to edit it after all.
  const [started, setStarted] = useState(
    () => splitIntoSentences(initialCarry?.text ?? "").length > 0,
  );
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [repeatCount, setRepeatCount] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // The generator's own fields (Question 363). Level and topic start empty
  // because empty is a real answer here — "no direction" rather than a
  // default standing in for a choice you didn't make. Register and length
  // can't be empty in a dropdown, so they start at the two defaults settled
  // in Question 357.
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [register, setRegister] = useState<string>(DEFAULT_SHADOWING_REGISTER);
  const [length, setLength] = useState<string>(DEFAULT_SHADOWING_LENGTH);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Only changes the button's wording — "Generate another" once there's
  // something to generate another of. Kept through hand-edits on purpose:
  // tweaking a generated passage doesn't make the next one the first one.
  const [hasGenerated, setHasGenerated] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every stop/replay/navigate so an in-flight utterance callback
  // from a superseded run recognizes it's stale and does nothing when it
  // fires — same pattern Parallel Listen uses for the same reason.
  const playbackIdRef = useRef(0);
  // speakRemaining's callbacks are chained across multiple utterances, so
  // they need to read the *current* language, not whatever it was when the
  // repeat cycle started — same reasoning as Parallel Listen's rateRef.
  const languageRef = useRef("");
  // How many repeats are left in the cycle currently sounding, so a live
  // language change can restart from the same point instead of resetting
  // the repeat count.
  const remainingRef = useRef(0);

  const sentences = splitIntoSentences(text);
  const current = sentences[index];

  // Stop any speech in progress if the page is left mid-playback.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleStop() {
    playbackIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  }

  // Speaks the current sentence, then chains into itself for however many
  // repeats are left — shadowing usually means hearing a sentence more than
  // once before attempting it, not just once through.
  function speakRemaining(remaining: number, playId: number) {
    if (playbackIdRef.current !== playId) return; // stopped or superseded
    if (remaining <= 0 || !current) {
      setPlaying(false);
      return;
    }
    remainingRef.current = remaining;
    const utterance = new SpeechSynthesisUtterance(current);
    const lang = guessLanguageCode(languageRef.current);
    if (lang) utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => speakRemaining(remaining - 1, playId);
    utterance.onerror = () => speakRemaining(remaining - 1, playId);
    window.speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    if (!current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }
    setPlaybackError(null);
    languageRef.current = language;
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPlaying(true);
    speakRemaining(repeatCount, playId);
  }

  // Changing language mid-playback interrupts and re-speaks the sentence
  // currently sounding, at the new voice, picking up from the same point in
  // the repeat count — the same "can't retune what's already in flight, so
  // restart instead" approach Parallel Listen uses for a live speed change.
  function handleLanguageChange(next: string) {
    setLanguage(next);
    languageRef.current = next;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    speakRemaining(remainingRef.current, playId);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateShadowingPassage({
        language,
        level,
        topic,
        register,
        length,
      });
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      // Into the same box a paste would land in, editable, rather than
      // straight into practice (Question 357). Generated text shouldn't be
      // more locked down than text you dictated — Speak Check makes the
      // same promise in as many words.
      setText(result.data.passage);
      // Fills the language in when you left it open, so playback has a
      // voice to match. Never overwrites a language you chose yourself:
      // the action already decided that, and this just takes what it sends.
      setLanguage(result.data.language);
      setHasGenerated(true);
      setIndex(0);
    } catch (err) {
      setGenerateError(
        describeClientError(err, "Couldn't generate a passage — try again."),
      );
    } finally {
      setGenerating(false);
    }
  }

  // Saves the passage and its language, so "Practice again" from Notes can
  // hand both straight back (Question 360). The passage is what's worth
  // keeping — where you had got to in it isn't, and neither is anything
  // about a particular run through it.
  async function handleSaveToNote() {
    if (!text.trim()) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      const data = { text, language };
      await createNote(
        NotePage.speaking,
        language.trim() || "Shadowing",
        // Content is the readable passage; what reopening needs rides in
        // metadata instead of being hidden inside it.
        formatShadowingTranscript(data),
        null,
        {
          kind: SHADOWING_METADATA_KIND,
          data: encodeShadowingMetadata(data),
        },
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

  function handleStart() {
    if (sentences.length === 0) return;
    setIndex(0);
    setStarted(true);
  }

  function handleEditPassage() {
    handleStop();
    setStarted(false);
  }

  function handlePrev() {
    handleStop();
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleNext() {
    handleStop();
    setIndex((i) => Math.min(i + 1, sentences.length - 1));
  }

  // Keyboard control while practising: arrows move between sentences
  // (Question 361), space plays and stops, escape stops (Question 362).
  //
  // Deliberately narrower than the two buttons it mirrors: a key press only
  // acts when there's somewhere to go. handlePrev stops playback before it
  // moves, so pressing ← on the first sentence would otherwise cut the
  // audio off and then not move — a key doing half of nothing.
  //
  // No dependency array, matching Vocab Shuffle's own key handler: the
  // listener is rebound after each render so it always closes over the
  // current sentence index, rather than needing every function it calls
  // wrapped in useCallback to keep a dependency list honest.
  useEffect(() => {
    if (!started) return;

    function handleKeyDown(event: KeyboardEvent) {
      // The practice screen has a language field on it, so arrows have to
      // stay arrows while you're typing in one — same guard, same reason,
      // as the flashcard session's.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (event.key === "ArrowRight" && index < sentences.length - 1) {
        event.preventDefault();
        handleNext();
      } else if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        handlePrev();
      } else if (event.key === " ") {
        // One key for both, because there's one button for both — space
        // does whatever the button in front of you currently says.
        //
        // Skipped when a button has focus, and this is the whole reason
        // that guard exists: the browser already activates a focused
        // button on space, so handling it here as well would toggle twice
        // and land back where it started. Click Play with the mouse, press
        // space, and without this nothing would appear to happen at all.
        if (target?.tagName === "BUTTON") return;
        event.preventDefault();
        if (playing) {
          handleStop();
        } else {
          handlePlay();
        }
      } else if (event.key === "Escape" && playing) {
        // A second way out, and deliberately one-directional: escape means
        // stop, never start. It's the key you reach for when a voice is
        // talking over you, and it shouldn't be able to start one.
        event.preventDefault();
        handleStop();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleClear() {
    handleStop();
    setText("");
    setStarted(false);
    setIndex(0);
    // The generated-ness goes, the settings stay: Clear empties the
    // passage, and having to re-pick the same level and style to generate a
    // replacement would make it a worse button than it looks.
    setHasGenerated(false);
    setGenerateError(null);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Shadowing Practice
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage, then go through it one sentence at a time —
            practice repeating each one out loud at your own pace.
          </p>
        </div>

        {!started ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Passage</h2>
              <button
                onClick={handleClear}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>

            {/* Above the passage since Question 363, where it used to sit
                below it. One field doing two jobs now — it picks the voice
                for playback and tells the generator what to write in — and
                a field the generator reads from belongs above the generator
                rather than under the box it fills. */}
            <label
              htmlFor="shadowing-language"
              className="block text-xs font-medium uppercase tracking-wider text-zinc-500"
            >
              Language{" "}
              <span className="normal-case font-normal text-zinc-600">
                (optional — picks a matching voice, and what to generate in)
              </span>
            </label>
            <LanguageCombobox
              id="shadowing-language"
              value={language}
              onChange={handleLanguageChange}
              placeholder="e.g. German"
              wrapperClassName="mt-1 w-full"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />

            {/* Every field here is optional, including the two dropdowns —
                they have defaults because a dropdown can't be empty, not
                because those answers were assumed (Question 357). */}
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Generate a passage
              </p>
              <p className="mb-3 text-xs text-zinc-600">
                Leave anything blank and it won&apos;t be asked for — no
                level means no particular level, not an average one.
              </p>

              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Level
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="">Any</option>
                    {SHADOWING_LEVELS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Style
                  <select
                    value={register}
                    onChange={(event) => setRegister(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  >
                    {SHADOWING_REGISTERS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Length
                  <select
                    value={length}
                    onChange={(event) => setLength(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  >
                    {SHADOWING_LENGTHS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label} ({item.sentences} sentences)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <input
                type="text"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={SHADOWING_TOPIC_MAX_CHARACTERS}
                placeholder="Topic (optional) — e.g. ordering at a bakery"
                className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-3 rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating
                  ? "Generating…"
                  : hasGenerated
                    ? "Generate another"
                    : "Generate"}
              </button>

              {generateError && (
                <p className="mt-2 text-sm text-red-400">{generateError}</p>
              )}
            </div>

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the passage you want to practice — or generate one above…"
              className="mt-4 h-64 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />

            {text.trim() && (
              <p className="mt-2 text-xs text-zinc-500">
                {sentences.length} sentence
                {sentences.length !== 1 ? "s" : ""} found.
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={sentences.length === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Start practicing
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <span className="text-sm text-zinc-500">
                Sentence {index + 1} of {sentences.length}
              </span>
              <div className="flex items-center gap-4">
                {/* Here rather than on the paste screen, because this is
                    where you find out whether a passage was worth keeping —
                    you've just practised it (Question 360). */}
                <button
                  onClick={handleSaveToNote}
                  disabled={savingNote || !text.trim()}
                  className={`text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                    noteSaved
                      ? "text-emerald-400"
                      : "text-zinc-400 hover:text-zinc-200 disabled:text-zinc-600"
                  }`}
                >
                  {noteSaved
                    ? "Saved!"
                    : savingNote
                      ? "Saving…"
                      : "Save to a new note"}
                </button>
                <button
                  onClick={handleEditPassage}
                  className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  ← Back to passage
                </button>
              </div>
            </div>

            {noteError && (
              <p className="mb-3 text-sm text-red-400">{noteError}</p>
            )}

            <div className="flex min-h-40 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center">
              <p className="text-xl leading-relaxed text-zinc-100">
                {current}
              </p>
            </div>

            {playbackError && (
              <p className="mt-3 text-sm text-red-400">{playbackError}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <div
                title="Changing this mid-playback restarts the current repeat at the new voice, same as changing speed does"
                className="flex items-center gap-1.5 text-sm text-zinc-400"
              >
                <label htmlFor="shadowing-playback-language">Language</label>
                <LanguageCombobox
                  id="shadowing-playback-language"
                  value={language}
                  onChange={handleLanguageChange}
                  placeholder="e.g. German"
                  compact
                  className="w-28 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                Speed
                <select
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                Repeat
                <select
                  value={repeatCount}
                  onChange={(event) =>
                    setRepeatCount(Number(event.target.value))
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={3}>3×</option>
                </select>
              </label>
              {!playing ? (
                <button
                  onClick={handlePlay}
                  title="Shortcut: Space"
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  ▶ Play
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  title="Shortcut: Space or Esc"
                  className="rounded-md bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  ■ Stop
                </button>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={handlePrev}
                disabled={index === 0}
                title="Shortcut: ←"
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                onClick={handleNext}
                disabled={index === sentences.length - 1}
                title="Shortcut: →"
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
