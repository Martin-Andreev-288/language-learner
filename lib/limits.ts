// Every input limit the server enforces, in one place the UI can also read.
//
// These deliberately live here rather than inside their action files: a
// "use server" module may only export async functions, and exporting a
// plain constant from one doesn't merely warn — it strips the module of
// *all* its exports (the failure from Question 243). Keeping them in an
// ordinary module lets the field that collects the input show the same
// limit the action will enforce, so the two can't drift apart and the user
// can see the ceiling before hitting it (Question 271).
//
// Raised across the board in Question 272. Each one is sized to what it
// actually costs, not the same number copied everywhere: a field that's
// only ever context for the model can afford to be generous, one whose
// text comes back out again (a translation, a corrected passage) costs
// roughly in proportion to its length, and one with no AI call behind it
// at all barely needs a ceiling.

// Inline Translate: the passage is context for translating the *marked*
// words, not itself translated — it never comes back in the output, so
// its size doesn't drive cost the way the phrase count does. Generous
// accordingly. Phrase count raised more moderately, since each one is a
// real output item the model has to produce.
export const INLINE_TRANSLATE_MAX_CHARACTERS = 8000;
export const INLINE_TRANSLATE_MAX_PHRASES = 60;

// Parallel Translate: the whole passage is translated, so output length
// tracks input length directly — raised, but less aggressively than a
// context-only field. Sentence cap raised to match: at the old character
// limit, short choppy sentences could already hit 30 before hitting 2500
// characters, so the sentence cap needs to scale alongside it or it
// becomes the real ceiling instead of the one this file states.
export const PARALLEL_TRANSLATE_MAX_CHARACTERS = 4000;
export const PARALLEL_TRANSLATE_MAX_SENTENCES = 50;

// Writing Check, and the chat's per-message mistake check, which reuses
// it. The corrected passage is returned in full, so this also scales
// output with input — raised moderately for the same reason as Parallel
// Translate above.
export const WRITING_CHECK_MAX_CHARACTERS = 6000;

// The chat's "Translate" on a reply. Unlike every other limit here, the
// text isn't typed by anyone — it's a message this app's own model just
// wrote, so it's already bounded by the reply length. This is a guard
// against an absurd request (a resumed conversation carrying something
// unexpected), not a ration on real use, which is why it's generous
// relative to how long a chat reply actually is.
export const CHAT_TRANSLATE_MAX_CHARACTERS = 6000;

// Vocabulary: words added in one paste. Not an AI call at all —
// addVocabularyEntries is a plain database write — so this has none of
// the cost pressure the limits above do. Raised generously; it exists to
// catch an accidental paste of something enormous, not to ration usage.
export const VOCABULARY_MAX_WORDS = 300;

// Word lookup: the clicked word, and the surrounding phrase sent as
// context. Neither is typed directly by the user — both are derived from
// what was clicked — so these are guards against a malformed click
// producing an absurd request, not ceilings on real usage. Left
// unchanged: nobody benefits from being able to right-click-translate a
// paragraph as if it were "a word", so there's no user need pushing
// these up the way there is for the fields above.
export const WORD_LOOKUP_MAX_WORD_LENGTH = 100;
export const WORD_LOOKUP_MAX_CONTEXT_LENGTH = 500;

// Shadowing's "generate a passage": the only free-text field in that form,
// and the only one worth a ceiling. The passage's own size is already
// bounded by the length preset, so nothing else there can run away — but a
// topic goes straight into the prompt, so an enormous one is both a cost
// and a way to smuggle instructions in behind a label that says "topic".
//
// Raised from 120 when the field started accepting directions as well as
// topics (Question 372): "a bakery" fits in 120 characters, but "keep it in
// the past tense and use the formal you throughout" is the kind of thing
// the field now invites, and it shouldn't be cut off mid-sentence. Still a
// ceiling rather than a licence — long enough for a line of direction,
// short enough that a pasted essay doesn't fit.
export const SHADOWING_TOPIC_MAX_CHARACTERS = 240;
