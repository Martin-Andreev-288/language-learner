"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import {
  checkShadowingAttempt,
  generateShadowingPassage,
} from "@/app/actions/shadowing-actions";
import MicIcon from "@/components/shared/mic-icon";
import SignInToUse from "@/components/shared/sign-in-to-use";
import KeyboardHints from "@/components/shared/keyboard-hints";
import { useSpeechToText } from "@/lib/use-speech-to-text";
import {
  isWordPerfect,
  SHADOWING_CHECK_CAVEAT,
  type ShadowingCheck,
} from "@/lib/shadowing-check";
import { NotePage } from "@/app/generated/prisma";
import { describeClientError } from "@/lib/client-error";
import { speakableText } from "@/lib/speech-text";
import {
  SHADOWING_ATTEMPT_MAX_CHARACTERS,
  SHADOWING_TOPIC_MAX_CHARACTERS,
} from "@/lib/limits";
import {
  DEFAULT_SHADOWING_LENGTH,
  DEFAULT_SHADOWING_REGISTER,
  DEFAULT_SHADOWING_SENTENCE_LENGTH,
  SHADOWING_LENGTHS,
  SHADOWING_LEVELS,
  SHADOWING_REGISTERS,
  SHADOWING_SENTENCE_LENGTHS,
} from "@/lib/shadowing-generation";

// How long the loop waits after a sentence has finished playing before
// moving to the next one (Question 376).
//
// Measured from the end of playback rather than from when the sentence
// appeared, which is the one real design decision in this feature. A fixed
// time on screen would have to cover the longest sentence in the passage,
// so every short one would sit there doing nothing — and a passage with a
// sentence longer than the setting would advance while still talking. This
// way the gap means the only thing it could usefully mean: how long you get
// to say it back.
const AUTO_ADVANCE_GAPS = [3, 5, 8, 12] as const;
const DEFAULT_AUTO_ADVANCE_GAP = 5;

// How each verdict presents itself (Question 373). Out here rather than
// inline so the three stay side by side and readable as a set — and worded
// as descriptions rather than marks: "Word for word" says what happened,
// where "Excellent" would be praise for having been understood by a
// transcriber, which is not the same achievement.
//
// All three are phrases rather than single words, and that is a rule now
// rather than a coincidence (Question 375). The middle one used to be the
// bare word "Close", which sat in the corner of a bordered panel where
// English reads it as the verb — a Close button that did nothing when
// pressed. A word that can be an instruction will be read as one when it
// sits where instructions sit, so none of these may be shortened to one.
const VERDICT_STYLES = {
  match: {
    label: "Word for word",
    className: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  },
  close: {
    label: "Nearly there",
    className: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  off: {
    label: "Some way off",
    className: "border-red-900 bg-red-950/40 text-red-300",
  },
} as const;

// The one tool a signed-out visitor can open (Question 399).
//
// Everything that runs in the browser works without an account: pasting a
// passage, splitting it, playing it, moving through it, auto-advance, and
// even recording an attempt — the microphone is the browser's own, and the
// words it hears never leave the page. What needs an account is the three
// things that need a server: generating a passage, checking an attempt
// against what you said, and saving to a note.
//
// That split is not a compromise, it is the reason this tool was chosen for
// this over the other sixteen. The free parts are most of the feature, so a
// visitor sees a real tool rather than a screenshot with the buttons
// removed — and the gate lands exactly where the interesting part starts.
export default function ShadowingTool({
  isAuthenticated = true,
}: {
  // Defaulted to true so every other caller keeps working untouched. Only
  // the page that deliberately serves guests passes it.
  isAuthenticated?: boolean;
}) {
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
  // How long each sentence runs, separately from how many there are
  // (Question 372) — see lib/shadowing-generation.ts for why the two are
  // different questions.
  const [sentenceLength, setSentenceLength] = useState<string>(
    DEFAULT_SHADOWING_SENTENCE_LENGTH,
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Only changes the button's wording — "Generate another" once there's
  // something to generate another of. Kept through hand-edits on purpose:
  // tweaking a generated passage doesn't make the next one the first one.
  const [hasGenerated, setHasGenerated] = useState(false);
  // Auto-advance (Question 376). Off until asked for: a page that starts
  // moving on its own the first time you open it would be a worse first
  // impression than one that waits to be told.
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoGap, setAutoGap] = useState<number>(DEFAULT_AUTO_ADVANCE_GAP);
  // Seconds left before the next sentence, or null when nothing is pending.
  // Shown rather than kept private, because a page about to move on its own
  // should say so before it does it.
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);

  // The record-and-check loop (Question 373). The attempt is held as
  // editable text rather than being sent the instant recording stops,
  // because the recogniser guesses — and an unchecked guess would be
  // reported back to you as your own mistake. Same discipline as Speak
  // Check: nothing is sent until you have seen it.
  const [attempt, setAttempt] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ShadowingCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
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
  // The countdown between sentences, plus the count it is working through.
  // The count lives in a ref as well as in state because the interval
  // callback has to read it, and reading state from inside a timer set up
  // several renders ago gets the value from that render, not this one.
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRemainingRef = useRef(0);
  // Set immediately before an automatic move, and consumed by the effect
  // that runs after it — see there for why this isn't a dependency array.
  const autoPlayPendingRef = useRef(false);
  // Read inside the utterance callbacks, which were bound in an earlier
  // render and would otherwise see whatever these were when the sentence
  // started playing — the same reason languageRef exists just above.
  const autoAdvanceRef = useRef(false);
  const autoSuspendedRef = useRef(false);

  const sentences = splitIntoSentences(text);
  const current = sentences[index];
  const langCode = guessLanguageCode(language);

  // Appends rather than replaces: one attempt at one sentence can still
  // arrive as two or three finalized chunks if you pause in the middle of
  // it. Capped so a microphone left running can't build a string the check
  // would then refuse.
  const handleFinalResult = useCallback((spoken: string) => {
    setAttempt((prev) => {
      const joined = prev ? `${prev.replace(/\s+$/, "")} ${spoken}` : spoken;
      return joined.length <= SHADOWING_ATTEMPT_MAX_CHARACTERS
        ? joined
        : joined.slice(0, SHADOWING_ATTEMPT_MAX_CHARACTERS);
    });
  }, []);

  const {
    supported: recordingSupported,
    listening,
    interimTranscript,
    error: recordingError,
    notice: recordingNotice,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText({ lang: langCode, onFinalResult: handleFinalResult });

  // A language is required here, where playback treats it as optional, and
  // the difference is real rather than an oversight: playback without one
  // gets the wrong voice, which is merely annoying, while recognition
  // without one transcribes your French as English words and then reports
  // every single one of them as a difference.
  const canRecord = recordingSupported && langCode !== undefined;
  const recordTitle = !recordingSupported
    ? "This browser doesn't support speech recognition — try Chrome, Edge, or Safari"
    : !langCode
      ? "Pick a language first, so it listens for the right one"
      : listening
        ? "Stop recording (Esc or R)"
        : "Record your attempt (R)";

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  // The whole of Answer 356's promise, in one line: the clock stops
  // mattering the moment you start an attempt, and stays stopped while
  // there is an attempt or a verdict on screen. Nothing moves on from here
  // except Continue.
  useEffect(() => {
    autoSuspendedRef.current =
      listening || attempt.trim().length > 0 || checkResult !== null;
  }, [listening, attempt, checkResult]);

  // Stop any speech in progress if the page is left mid-playback, and take
  // the countdown with it — a timer that outlives the page it belongs to
  // would move a sentence nobody is looking at.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, []);

  // Plays the sentence the loop has just moved to. No dependency array and
  // a ref for a guard, matching the keyboard handler below: the flag is set
  // immediately before the move, so the very next render is the one that
  // should act, and every other render must not.
  useEffect(() => {
    if (!autoPlayPendingRef.current) return;
    autoPlayPendingRef.current = false;
    handlePlay();
  });

  function clearAutoTimer() {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    autoRemainingRef.current = 0;
    setAutoCountdown(null);
  }

  // Counts down a second at a time rather than sleeping for the whole gap,
  // so the page can show how long is left. The interval is the only timer —
  // it does the waiting and the displaying with one mechanism instead of a
  // timeout racing a separate ticker.
  function startAutoCountdown() {
    clearAutoTimer();
    autoRemainingRef.current = autoGap;
    setAutoCountdown(autoGap);
    autoTimerRef.current = setInterval(() => {
      autoRemainingRef.current -= 1;
      if (autoRemainingRef.current <= 0) {
        clearAutoTimer();
        autoAdvanceNow();
      } else {
        setAutoCountdown(autoRemainingRef.current);
      }
    }, 1000);
  }

  // The loop ends at the last sentence rather than wrapping around. An
  // endless carousel through the same eight sentences would keep going long
  // after you had stopped practising, and there is no way for it to notice.
  function autoAdvanceNow() {
    if (index >= sentences.length - 1) return;
    handleNext();
  }

  function handleStop() {
    // Stopping stops everything, including whatever was about to happen
    // next. Cancelling only the voice would leave the countdown running,
    // so the sentence you just silenced would move on anyway — which is
    // the opposite of what the button says.
    clearAutoTimer();
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
      // Where auto-advance's clock actually starts: the sentence has been
      // said, including every repeat of it. Reached only on a natural
      // finish — a Stop bumps playbackIdRef, so a stopped sentence returns
      // at the line above and never schedules anything.
      if (current && autoAdvanceRef.current && !autoSuspendedRef.current) {
        startAutoCountdown();
      }
      return;
    }
    remainingRef.current = remaining;
    const utterance = new SpeechSynthesisUtterance(speakableText(current));
    const lang = guessLanguageCode(languageRef.current);
    if (lang) utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => speakRemaining(remaining - 1, playId);
    utterance.onerror = () => speakRemaining(remaining - 1, playId);
    window.speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    if (!current) return;
    // Never both at once: the microphone would hear the synthesiser and
    // transcribe it, which would score the computer's reading of the
    // sentence rather than yours.
    if (listening) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }
    setPlaybackError(null);
    // A manual Play during the gap replaces the pending move rather than
    // racing it — the countdown restarts when this sentence finishes.
    clearAutoTimer();
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
        sentenceLength,
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

  // Everything a particular attempt produced, cleared in one place so
  // every way of leaving a sentence behind forgets it the same way. A
  // verdict on the sentence you were just on would be worse than no verdict
  // at all once a different sentence is on screen.
  function clearAttempt() {
    clearAutoTimer();
    stopListening();
    setAttempt("");
    setCheckResult(null);
    setCheckError(null);
  }

  function handleStartRecording() {
    // Stops playback first rather than refusing to start — you press
    // Record when the voice has said enough, and making that press mean
    // "stop talking and listen to me" is what the gesture already implies.
    handleStop();
    setAttempt("");
    setCheckResult(null);
    setCheckError(null);
    startListening();
  }

  async function handleCheckAttempt() {
    // Speaking and then checking is one gesture — a live microphone would
    // keep appending to the very attempt being checked.
    if (listening) stopListening();

    const spoken = attempt.trim();
    if (!spoken || !current) return;

    // Answered here rather than by asking the model, and it saves a request
    // from the daily allowance every time you get a sentence right — which,
    // after a couple of passes at the same passage, is most times. There is
    // also nothing a model could add: "that is the sentence" is the whole
    // finding. See lib/shadowing-check.ts.
    if (isWordPerfect(current, spoken)) {
      setCheckError(null);
      setCheckResult({
        verdict: "match",
        summary: "Word for word — that is exactly the sentence.",
        differences: [],
      });
      return;
    }

    setChecking(true);
    setCheckError(null);
    try {
      const result = await checkShadowingAttempt(current, spoken, language);
      if (!result.ok) {
        setCheckError(result.error);
        return;
      }
      setCheckResult(result.data);
    } catch (err) {
      setCheckError(
        describeClientError(err, "Couldn't check that attempt — try again."),
      );
    } finally {
      setChecking(false);
    }
  }

  // An explicit press rather than a timeout, settled back in Answer 356:
  // a countdown competing with how fast you read a correction is a worse
  // idea than one deliberate act between "here is what drifted" and
  // "moving on". Step 5's auto-advance clock hands control here too.
  function handleContinue() {
    if (index < sentences.length - 1) {
      handleNext();
    } else {
      clearAttempt();
    }
  }

  function handleStart() {
    if (sentences.length === 0) return;
    clearAttempt();
    if (autoAdvanceRef.current) autoPlayPendingRef.current = true;
    setIndex(0);
    setStarted(true);
  }

  function handleEditPassage() {
    handleStop();
    clearAttempt();
    setStarted(false);
  }

  // Both arrows arm the loop, not only the automatic one. With
  // auto-advance on, arriving at a sentence is what makes it play — and
  // stepping back to hear one again is an arrival like any other, so
  // having it sit silent would make the manual buttons feel broken.
  function handlePrev() {
    handleStop();
    clearAttempt();
    if (autoAdvanceRef.current) autoPlayPendingRef.current = true;
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleNext() {
    handleStop();
    clearAttempt();
    if (autoAdvanceRef.current) autoPlayPendingRef.current = true;
    setIndex((i) => Math.min(i + 1, sentences.length - 1));
  }

  // Back to the first sentence without leaving practice (Question 377).
  //
  // The same thing Vocab Shuffle's "Restart & reshuffle" does at the end of
  // a session, minus the reshuffling: a passage read out of order would
  // stop being a passage. What it shares is the part that matters — the end
  // of a run is a place you are likely to want to start another one, and
  // the way back shouldn't be out through the door you came in.
  //
  // Auto-advance survives it: if the loop was running, it starts running
  // again from the top rather than stopping to be switched on a second
  // time.
  function handleRestart() {
    handleStop();
    clearAttempt();
    if (autoAdvanceRef.current) autoPlayPendingRef.current = true;
    setIndex(0);
  }

  function handleAutoAdvanceChange(next: boolean) {
    setAutoAdvance(next);
    // Written straight to the ref as well, because the utterance callbacks
    // read the ref and one of them may fire before the next render.
    autoAdvanceRef.current = next;
    if (!next) {
      clearAutoTimer();
      return;
    }
    // Switching it on starts the loop rather than waiting for a press. A
    // hands-free setting that still needs you to press Play before it does
    // anything is not one, and the gap only exists after a sentence has
    // played — so with nothing playing there would be nothing to wait for.
    if (!playing && !listening && !attempt.trim() && !checkResult) {
      handlePlay();
    }
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
      } else if (
        (event.key === "r" || event.key === "R") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        // R for record, and only bare R — Ctrl+R and Cmd+R belong to the
        // browser, and stealing a page reload would be a genuinely
        // unpleasant surprise.
        if (target?.tagName === "BUTTON") return;
        if (!canRecord && !listening) return;
        event.preventDefault();
        if (listening) {
          stopListening();
        } else {
          handleStartRecording();
        }
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
        // Ignored outright while recording, rather than stopping the
        // recording: space is the key that starts the voice talking, and
        // the one moment it must not do that is while the microphone is
        // open. R and Esc both still end a recording.
        if (listening) return;
        event.preventDefault();
        if (playing) {
          handleStop();
        } else {
          handlePlay();
        }
      } else if (
        event.key === "Escape" &&
        (playing || listening || autoCountdown !== null)
      ) {
        // A second way out, and deliberately one-directional: escape means
        // stop, never start. It's the key you reach for when a voice is
        // talking over you — or when you would rather this one attempt
        // simply ended — and it shouldn't be able to start either.
        //
        // It cancels a pending auto-advance too (Question 376), and that
        // case is the reason this branch grew a third condition: during the
        // gap nothing is playing and nothing is listening, so without it
        // the one moment the page is about to act on its own would be the
        // one moment the stop key did nothing.
        event.preventDefault();
        if (listening) stopListening();
        if (playing) handleStop();
        clearAutoTimer();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleClear() {
    handleStop();
    clearAttempt();
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

          {/* Said once, up front, rather than left to be discovered three
              times (Question 399). A visitor who meets the first locked
              button with no warning reads it as the page being broken; one
              who was told which parts need an account reads the same button
              as a boundary they already knew about. */}
          {!isAuthenticated && (
            <p className="mt-4 rounded-lg border border-indigo-900/60 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200">
              You&apos;re trying this without an account. Pasting, playing and
              recording all work. Generating a passage, checking what you said
              and saving to notes need one —{" "}
              <Link
                href="/sign-up"
                className="font-medium underline underline-offset-2 transition-colors hover:text-white"
              >
                it&apos;s free
              </Link>
              .
            </p>
          )}
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
                Leave anything blank and it won&apos;t be asked for — no level
                means no particular level, not an average one.
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

                {/* "Length" on its own stopped being a usable label once
                    there were two of them (Question 372). Both say what
                    they measure now, rather than one of them assuming it's
                    the only length anyone meant. */}
                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Passage length
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

                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Sentence length
                  <select
                    value={sentenceLength}
                    onChange={(event) => setSentenceLength(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  >
                    {SHADOWING_SENTENCE_LENGTHS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label} ({item.words} words)
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
                placeholder={
                  'Topic or notes (optional) \u2014 e.g. ordering at a bakery, or "keep it in the past tense"'
                }
                className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />

              {/* The settings above stay visible and usable to a guest
                  even though the button below them doesn't. They are what
                  explain the feature — a Level, a Style, a Length and a
                  topic box say what generating a passage would do far
                  better than a sentence about it would. */}
              {isAuthenticated ? (
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
              ) : (
                <SignInToUse className="mt-3" what="Generating a passage" />
              )}

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
                {sentences.length !== 1 ? "s" : ""} found.{" "}
                {/* Said here rather than left implicit, because this is the
                    one moment the count is already on screen for you to
                    judge against the text above it (Question 371).
                    Abbreviations and titles are handled for five languages,
                    not guessed at for every one — if a split looks wrong,
                    fixing the line break by hand in the box above is the
                    right move, not a sign something's broken. */}
                <span title="A period followed by a capital letter is usually a new sentence, but not always — an abbreviation this app doesn't know about can still split wrong. Edit the passage above if a split looks off.">
                  Not always perfect — edit above if a split looks wrong.
                </span>
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
                {/* A link rather than the bordered panel the other two
                    get. This one sits in a tight row beside "Back to
                    passage", where a three-line box would shove the whole
                    header around for the least important of the three. */}
                {isAuthenticated ? (
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
                ) : (
                  <Link
                    href="/sign-up"
                    className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                    title="Saving a passage to your notes needs an account"
                  >
                    Sign in to save
                  </Link>
                )}
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
              <p className="text-xl leading-relaxed text-zinc-100">{current}</p>
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

            {/* Auto-advance (Question 376), on the row below the transport
                controls rather than in it: those four say what happens
                when you press Play, and these two say what happens when
                you don't press anything at all. */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <label
                className="flex items-center gap-2 text-sm text-zinc-400"
                title="Plays each sentence, waits for you to say it back, then moves on. Pauses itself the moment you record an attempt, and waits for Continue."
              >
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(event) =>
                    handleAutoAdvanceChange(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 accent-indigo-600"
                />
                Auto-advance
              </label>
              <label
                className={`flex items-center gap-1.5 text-sm transition-colors ${
                  autoAdvance ? "text-zinc-400" : "text-zinc-600"
                }`}
                title="How long you get to say the sentence back before the next one starts. Counted from the end of playback, not from when the sentence appeared."
              >
                Pause
                <select
                  value={autoGap}
                  disabled={!autoAdvance}
                  onChange={(event) => setAutoGap(Number(event.target.value))}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {AUTO_ADVANCE_GAPS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}s
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Said out loud rather than left to surprise you, and it
                doubles as the reminder that Stop is what cancels it. */}
            {autoCountdown !== null && (
              <p className="mt-3 text-center text-sm text-zinc-500">
                Your turn — next sentence in {autoCountdown}s.{" "}
                <span className="text-zinc-600">
                  Record, or press Esc, to stay here.
                </span>
              </p>
            )}

            {/* The record-and-check loop (Question 373). Below the
                playback controls because that is the order it happens in:
                hear it, say it, see what came back. */}
            <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Disabled rather than hidden when unavailable
                    (Answer 278): a missing button reads as a missing
                    feature, a disabled one with a reason reads as a
                    limitation of the browser. */}
                <button
                  onClick={listening ? stopListening : handleStartRecording}
                  disabled={!canRecord}
                  title={recordTitle}
                  className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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
                  {listening
                    ? "Stop recording"
                    : attempt
                      ? "Record again"
                      : "Record your attempt"}
                </button>
                <p className="flex-1 text-xs text-zinc-600">
                  {SHADOWING_CHECK_CAVEAT}
                </p>
              </div>

              {/* Kept out of the editable box on purpose: interim results
                  are rewritten on every syllable, so putting them in the
                  field would rewrite it under your cursor. */}
              {listening && (
                <p className="mt-3 flex items-start gap-2 text-sm text-zinc-500">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                  <span className="italic">
                    {interimTranscript || "Listening…"}
                  </span>
                </p>
              )}

              {/* Two different weights on purpose: an error is something to
                  fix before recording can work at all, a notice is just how
                  this recording happened to end. */}
              {recordingError && (
                <p className="mt-3 text-sm text-red-400">{recordingError}</p>
              )}
              {recordingNotice && !recordingError && (
                <p className="mt-3 text-sm text-zinc-500">{recordingNotice}</p>
              )}
              {!recordingSupported && (
                <p className="mt-3 text-sm text-amber-400">
                  Recording isn&apos;t available in this browser — try Chrome,
                  Edge, or Safari. Listening and repeating still works; only
                  the checking part needs a microphone.
                </p>
              )}

              {attempt && !listening && (
                <div className="mt-4">
                  <label
                    htmlFor="shadowing-attempt"
                    className="block text-xs font-medium uppercase tracking-wider text-zinc-500"
                  >
                    What was heard
                  </label>
                  <textarea
                    id="shadowing-attempt"
                    value={attempt}
                    onChange={(event) => setAttempt(event.target.value)}
                    maxLength={SHADOWING_ATTEMPT_MAX_CHARACTERS}
                    rows={2}
                    className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  />
                  <p className="mt-1 text-xs text-zinc-600">
                    Editable — fix anything misheard before checking, so the
                    recogniser&apos;s guess isn&apos;t reported back to you as
                    your mistake.
                  </p>
                  {/* Recording itself is left working for a guest, and
                      this is the one gate placed on purpose rather than by
                      necessity: the microphone is the browser's own and
                      costs nothing, so a visitor gets the whole loop —
                      press record, say the sentence, watch the words appear
                      — and meets the wall at the exact moment the app would
                      have told them something they didn't know. */}
                  {isAuthenticated ? (
                    <button
                      onClick={handleCheckAttempt}
                      disabled={checking || !attempt.trim()}
                      className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                      {checking ? "Checking…" : "Check my attempt"}
                    </button>
                  ) : (
                    <SignInToUse
                      className="mt-3"
                      what="Checking what you said against the sentence"
                    />
                  )}
                </div>
              )}

              {checkError && (
                <p className="mt-3 text-sm text-red-400">{checkError}</p>
              )}

              {checkResult && (
                <div
                  className={`mt-4 rounded-lg border p-4 ${VERDICT_STYLES[checkResult.verdict].className}`}
                >
                  <p className="text-sm font-semibold">
                    {VERDICT_STYLES[checkResult.verdict].label}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {checkResult.summary}
                  </p>

                  {checkResult.differences.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {checkResult.differences.map((difference, i) => (
                        <li
                          key={`${difference.expected}-${i}`}
                          className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm"
                        >
                          <p className="text-zinc-200">
                            <span className="text-zinc-500">Expected </span>
                            <span className="font-medium">
                              {difference.expected}
                            </span>
                            <span className="text-zinc-500"> · heard </span>
                            <span className="font-medium">
                              {difference.heard || "nothing"}
                            </span>
                          </p>
                          <p className="mt-1 text-zinc-400">
                            {difference.note}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* An explicit press rather than a countdown
                      (Answer 356) — nothing moves on until you say so. */}
                  <button
                    onClick={handleContinue}
                    className="mt-4 rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                  >
                    {index < sentences.length - 1
                      ? "Continue →"
                      : "Done with this passage"}
                  </button>
                </div>
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
              {/* On the last sentence this stops being a dead button and
                  becomes the way to go round again (Question 377). It is
                  the same place your hand already is after eight presses of
                  Next, which is the whole reason it lives here rather than
                  up beside "Back to passage" — and a greyed-out Next was
                  never telling you anything you couldn't already read off
                  the counter above it.

                  Deliberately not wired to the → key as well. A key that
                  wrapped around would mean holding the arrow a moment too
                  long silently restarted the passage; pressing a button
                  labelled "Start over" cannot be done by accident. */}
              {index === sentences.length - 1 ? (
                <button
                  onClick={handleRestart}
                  title="Back to the first sentence"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  ↺ Start over
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  title="Shortcut: →"
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  Next →
                </button>
              )}
            </div>

            {/* The shortcuts were only ever in the buttons' tooltips, which
                means only a mouse could find them (Question 386, item 1).
                Record is listed last because it is the one that does
                nothing until a language is set. */}
            <KeyboardHints
              className="mt-4"
              hints={[
                { keys: ["←", "→"], label: "sentence" },
                { keys: ["Space"], label: "play / stop" },
                { keys: ["R"], label: "record" },
                { keys: ["Esc"], label: "stop" },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
