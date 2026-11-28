import { Fragment } from "react";
import { textParts, type WordRange } from "@/lib/word-highlight";

// A sentence being read, with the word the voice is saying marked (Question
// 118). Only the sentence being read is cut into words; every other
// sentence stays plain text.
export default function ReadingWords({
  text,
  words,
  activeWord,
  offset = 0,
}: {
  text: string;
  // The whole sentence's words (shownWords), and where this piece of it
  // starts, for a sentence shown in several pieces.
  words: WordRange[];
  activeWord: number;
  offset?: number;
}) {
  return (
    <>
      {textParts(text, words, offset).map((part, i) =>
        part.word === activeWord ? (
          <span
            key={i}
            data-reading-word=""
            className="rounded-sm bg-indigo-500/70 text-white box-decoration-clone"
          >
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
