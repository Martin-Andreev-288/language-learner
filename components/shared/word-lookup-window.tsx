"use client";

import { useEffect, useRef, useState } from "react";
import { lookupWord, translateWordInContext } from "@/app/actions/word-lookup-actions";
import { addVocabularyEntries } from "@/app/actions/vocabulary-entry-actions";
import { describeClientError } from "@/lib/client-error";
import { guessLanguageCode, languageNameForCode, languageTag } from "@/lib/language-codes";
import { speakableText } from "@/lib/speech-text";
import { uniqueLanguages, type WordTranslation } from "@/lib/word-lookup";

// One window for looking a word up, wherever the app offers it (Question
// 55, chapter B). Before this there were two that did different halves of
// the job: Inline Translate's popup gave a translation, and Flashcards'
// window a definition with examples. This one gives the translation first,
// since that is what a learner reading most often wants, and the
// definition one press away — "Definition and examples" — so the richer
// answer costs a second request only when someone asks for it.
//
// It opens beside the word rather than over a darkened page, and stays
// inside the screen: below the word, or above it when the word sits low.
// When the page scrolls it moves with the word (Question 65 — closing on a
// scroll made it vanish the moment a phone user moved the page), and it
// closes on Esc, a tap or click outside it, or once the word has scrolled
// out of sight. The page decides when it opens and with what; a new word
// means a new window (the page gives each one its own key), so nothing
// from the last word can leak into the next.

export interface LookupTarget {
  word: string;
  // The sentence the word is in (lib/word-lookup.ts), so it is read in the
  // sense it has there.
  context: string;
  // The word on the page, which the window stays beside.
  element: HTMLElement;
}

type Translated = { translations: WordTranslation[]; languageCode: string };
type Defined = { definition: string; examples: string[] };

// Where the word is on screen, and which side of it the window is on.
type Placement = { left: number; top: number; bottom: number; above: boolean };

// The space kept between the window and the screen's edge.
const EDGE = 14;
// How far a press may move and still be a tap rather than a drag.
const TAP_SLOP = 10;

// The first time, the side with room: below the word, or above it when the
// word sits low. After that the window keeps its side while it still fits
// there, so a scroll doesn't flip it from one side of the word to the other
// and back.
function placeBeside(word: HTMLElement, previous?: Placement, height = 0): Placement {
  const { left, top, bottom } = word.getBoundingClientRect();
  let above = bottom > window.innerHeight * 0.6;
  if (previous) {
    const roomAbove = top - EDGE;
    const roomBelow = window.innerHeight - bottom - EDGE;
    const [here, there] = previous.above ? [roomAbove, roomBelow] : [roomBelow, roomAbove];
    above = height > here && there > here ? !previous.above : previous.above;
  }
  return { left, top, bottom, above };
}

// Answers already given in this visit, so looking the same word up again in
// the same sentence is instant and spends nothing from the shared daily
// allowance. Only successful answers are kept.
const translatedCache = new Map<string, Translated>();
const definedCache = new Map<string, Defined>();
const cacheKey = (...parts: string[]) =>
  parts.map((part) => part.trim().toLowerCase()).join("\u0000");

// When a page has no language to translate into — no default set in the
// account — the answer comes in English, as the definition always has.
const FALLBACK_LANGUAGE = "English";

export default function WordLookupWindow({
  target,
  translateInto,
  explainInLanguage,
  wordLanguage = "",
  onAddToText,
  onClose,
}: {
  target: LookupTarget;
  translateInto: string[];
  // The language the definition is written in. Empty means English.
  explainInLanguage: string;
  // The word's language, when the page knows it (Inline Translate's
  // "passage language"). Otherwise the translation reports it.
  wordLanguage?: string;
  // Only on a page with a passage to put the translation back into.
  onAddToText?: (translations: WordTranslation[]) => void;
  onClose: () => void;
}) {
  const languages = uniqueLanguages(translateInto);
  const intoKey = (languages.length > 0 ? languages : [FALLBACK_LANGUAGE]).join("\n");
  const translationKey = cacheKey(target.word, target.context, intoKey);
  const definitionKey = cacheKey(target.word, target.context, explainInLanguage);

  const [translated, setTranslated] = useState<Translated | null>(
    () => translatedCache.get(translationKey) ?? null,
  );
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [defined, setDefined] = useState<Defined | null>(null);
  const [defining, setDefining] = useState(false);
  const [defineError, setDefineError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [addedToText, setAddedToText] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [placement, setPlacement] = useState(() => placeBeside(target.element));
  const windowRef = useRef<HTMLDivElement>(null);
  // Where a press outside the window began, until it ends.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  // The translation is asked for as the window opens, unless this visit
  // already has it. An answer arriving after the window closed is dropped.
  useEffect(() => {
    if (translatedCache.has(translationKey)) return;
    let open = true;
    translateWordInContext(target.word, target.context, intoKey.split("\n"))
      .then((result) => {
        if (!open) return;
        if (!result.ok) {
          setTranslateError(result.error);
          return;
        }
        translatedCache.set(translationKey, result.data);
        setTranslated(result.data);
      })
      .catch((err) => {
        if (open) setTranslateError(describeClientError(err, "Translation failed."));
      });
    return () => {
      open = false;
    };
  }, [translationKey, target.word, target.context, intoKey]);

  // Into the window as it opens, so Esc and a screen reader both find it;
  // without scrolling, since it already sits beside the word.
  useEffect(() => {
    windowRef.current?.focus({ preventScroll: true });
  }, []);

  // What closes it. Esc is stopped here, so a page's own Esc — Flashcards
  // has one — doesn't also act on the same press.
  //
  // A press outside closes it only when it ends as a tap or a click. On a
  // phone a scroll starts as a press outside too, and the browser ends that
  // one with pointercancel, or it ends having moved: either way, a scroll.
  useEffect(() => {
    const isOutside = (event: Event) => {
      const node = event.target;
      return !(node instanceof Node && windowRef.current?.contains(node));
    };
    const handlePointerDown = (event: PointerEvent) => {
      pressRef.current = isOutside(event) ? { x: event.clientX, y: event.clientY } : null;
    };
    const handlePointerUp = (event: PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (moved <= TAP_SLOP) onClose();
    };
    const handlePointerCancel = () => {
      pressRef.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    // A scroll anywhere, or the screen changing size — which on a phone
    // includes the address bar sliding away as the page scrolls.
    const follow = () => {
      const word = target.element;
      if (!word.isConnected) return;
      const { top, bottom } = word.getBoundingClientRect();
      if (bottom < 0 || top > window.innerHeight) {
        onClose();
        return;
      }
      const height = windowRef.current?.scrollHeight ?? 0;
      setPlacement((previous) => placeBeside(word, previous, height));
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [onClose, target.element]);

  // A word still being read out stops with the window.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const languageCode = translated?.languageCode || guessLanguageCode(wordLanguage) || "";
  const saveLanguage =
    wordLanguage.trim() || (translated ? languageNameForCode(translated.languageCode) : undefined);
  const translations = translated?.translations ?? [];

  async function handleDefine() {
    if (defined || defining) return;
    const cached = definedCache.get(definitionKey);
    if (cached) {
      setDefined(cached);
      return;
    }
    setDefining(true);
    setDefineError(null);
    try {
      const result = await lookupWord(target.word, target.context, explainInLanguage);
      if (!result.ok) {
        setDefineError(result.error);
        return;
      }
      const answer = { definition: result.data.definition, examples: result.data.examples };
      definedCache.set(definitionKey, answer);
      setDefined(answer);
    } catch (err) {
      setDefineError(describeClientError(err, "Couldn't get the definition."));
    } finally {
      setDefining(false);
    }
  }

  function handleSpeak() {
    if (!languageCode) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechError("Pronunciation isn't supported in this browser.");
      return;
    }
    setSpeechError(null);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speakableText(target.word));
    utterance.lang = languageCode;
    utterance.onerror = () => {
      setSpeechError("Pronunciation isn't available for this language in your browser.");
    };
    window.speechSynthesis.speak(utterance);
  }

  // Saved under the word's own language, with each translation recorded
  // beside it — the way Inline Translate always saved, and now Flashcards
  // too, which used to save the word alone because it only had a
  // definition, and a definition isn't a translation.
  async function handleSave() {
    if (!saveLanguage) {
      setSaveNote(
        "This word's language isn't one the app knows, so it can't be filed under a language yet.",
      );
      return;
    }
    setSaving(true);
    setSaveNote(null);
    try {
      let first: { added: number };
      if (translations.length === 0) {
        first = await addVocabularyEntries(target.word, saveLanguage);
      } else {
        // One call per language: a word already saved still records a
        // translation arriving with it (Question 333), so the calls after
        // the first only add translations.
        first = await addVocabularyEntries(
          target.word,
          saveLanguage,
          translations[0].text,
          translations[0].language,
        );
        for (const { language, text } of translations.slice(1)) {
          await addVocabularyEntries(target.word, saveLanguage, text, language);
        }
      }
      setSaved(true);
      if (first.added === 0) {
        setSaveNote(
          translations.length > 0
            ? `Already in your ${saveLanguage} vocabulary — the translation is recorded with it.`
            : `Already in your ${saveLanguage} vocabulary.`,
        );
      }
    } catch (err) {
      setSaveNote(describeClientError(err, "Couldn't save that word."));
    } finally {
      setSaving(false);
    }
  }

  function handleAddToText() {
    if (!onAddToText || translations.length === 0) return;
    onAddToText(translations);
    setAddedToText(true);
  }

  // Beside the word and inside the screen, on the side placeBeside chose.
  const width = Math.min(288, window.innerWidth - 16);
  const left = Math.max(8, Math.min(placement.left, window.innerWidth - width - 8));
  const position = placement.above
    ? {
        left,
        width,
        bottom: window.innerHeight - placement.top + 6,
        maxHeight: placement.top - EDGE,
      }
    : {
        left,
        width,
        top: placement.bottom + 6,
        maxHeight: window.innerHeight - placement.bottom - EDGE,
      };

  const smallButton =
    "w-full rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed";

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-label={`Look up “${target.word}”`}
      tabIndex={-1}
      style={position}
      className="fixed z-50 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm shadow-2xl outline-none"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-indigo-200">{target.word}</span>
          <button
            type="button"
            onClick={handleSpeak}
            disabled={!languageCode}
            title="Play pronunciation"
            aria-label="Play pronunciation"
            className="shrink-0 text-zinc-400 transition-colors hover:text-indigo-400 disabled:opacity-40"
          >
            <SpeakerIcon />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-zinc-500 transition-colors hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      {translateError ? (
        <p className="text-red-400">{translateError}</p>
      ) : !translated ? (
        <p className="text-zinc-500">Translating…</p>
      ) : translations.length === 0 ? (
        <p className="text-zinc-500">No translation came back — try again.</p>
      ) : translations.length === 1 ? (
        <p className="text-zinc-200">{translations[0].text}</p>
      ) : (
        // Several languages as a labelled list: the window is narrow, so
        // tags on their own lines beat a run-on of them (Question 339).
        <ul className="space-y-0.5">
          {translations.map((item) => (
            <li key={item.language} className="text-zinc-200">
              <span
                title={item.language}
                className="mr-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
              >
                {languageTag(item.language)}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      )}

      {speechError && <p className="mt-1 text-xs text-amber-400">{speechError}</p>}

      <div className="mt-2 space-y-1.5">
        {onAddToText && (
          <button
            type="button"
            onClick={handleAddToText}
            disabled={addedToText || translations.length === 0}
            title="Mark this word in the passage and keep this translation — no second request"
            className={`${smallButton} ${
              addedToText
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {addedToText ? "In the text!" : "+ Add to text"}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || saved || (!translated && !translateError)}
          className={`${smallButton} ${
            saved ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {saved ? "Added!" : saving ? "Adding…" : "+ Add to vocabulary"}
        </button>
        {saveNote && <p className="text-xs text-amber-400">{saveNote}</p>}
      </div>

      <div className="mt-3 border-t border-zinc-800 pt-2">
        {defined ? (
          <div className="space-y-2">
            <p className="text-zinc-200">{defined.definition}</p>
            {defined.examples.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Examples
                </p>
                <ul className="space-y-1 text-zinc-400">
                  {defined.examples.map((example, index) => (
                    <li key={index}>{example}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDefine}
            disabled={defining}
            className="text-xs font-medium text-indigo-300 transition-colors hover:text-indigo-200 disabled:text-zinc-500"
          >
            {defining ? "Looking it up…" : "Definition and examples"}
          </button>
        )}
        {defineError && <p className="mt-1 text-xs text-red-400">{defineError}</p>}
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M1.5 5.5h2.5l3.5-3v10l-3.5-3H1.5v-4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 5.2c.9.8 1.4 1.7 1.4 2.3s-.5 1.5-1.4 2.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
