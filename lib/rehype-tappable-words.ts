import type { Element, ElementContent, Root } from "hast";
import { tokenizeWords } from "./clickable-words";

// The Notes preview's words, made tappable for the shared lookup window
// (Question 55, B3). A step in the Markdown rendering rather than a pass
// over the page afterwards: React draws the preview from this, so the
// words stay React's, and the rest of the Markdown — headings, lists,
// tables, bold — comes out exactly as before, with each word of its text
// wrapped in a span the preview's tap handler recognises.

// Where words stay as they are: code is code, not language, and the words
// of a link are for following it.
const LEFT_ALONE = new Set(["code", "pre", "a"]);

export default function rehypeTappableWords({ className }: { className: string }) {
  return (tree: Root) => {
    markWords(tree, className.split(" "));
  };
}

function markWords(parent: Root | Element, className: string[]) {
  const children: ElementContent[] = [];
  for (const child of parent.children) {
    if (child.type === "text") {
      children.push(...wordsOf(child.value, className));
    } else {
      if (child.type === "element" && !LEFT_ALONE.has(child.tagName)) {
        markWords(child, className);
      }
      children.push(child as ElementContent);
    }
  }
  parent.children = children;
}

function wordsOf(text: string, className: string[]): ElementContent[] {
  return tokenizeWords(text)
    .filter((token) => token.text)
    .map(
      (token): ElementContent =>
        token.isWord
          ? {
              type: "element",
              tagName: "span",
              properties: { dataWord: "", className },
              children: [{ type: "text", value: token.text }],
            }
          : { type: "text", value: token.text },
    );
}
