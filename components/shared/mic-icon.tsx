// The same icon means the same thing in Speak Check and Voice Chat — "this
// button listens" — so it lives in one place rather than being drawn twice
// (Question 293). Matches the inline-SVG house style used elsewhere:
// currentColor, rounded caps, sized by the caller's text.
export default function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M6.5 1.5a1.75 1.75 0 011.75 1.75v3a1.75 1.75 0 11-3.5 0v-3A1.75 1.75 0 016.5 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M3 6v.5a3.5 3.5 0 007 0V6M6.5 10v1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
