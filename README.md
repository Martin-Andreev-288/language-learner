# Foreign Language Learning Tool

Learn and practise a language with different tools, and AI where it helps.

[![Tests](https://github.com/Martin-Andreev-288/language-learner/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Martin-Andreev-288/language-learner/actions/workflows/tests.yml)

Designed, built, tested and deployed by Martin Andreev.

## Try it

- **Live app:** [language-learner-coral.vercel.app](https://language-learner-coral.vercel.app)
- **Test account:** `admin@example.com` with the password `123456`. Sign in with it to use every tool, including the sounds check in Shadowing Practice.
- Works on a computer and on a phone.
**Demo video:** [Watch on YouTube](https://youtu.be/BlxD6uhPgMY)

## What it does

- **Reading.** *Parallel Translate*: paste the same passage in two or more languages and get it back aligned sentence by sentence. *Inline Translate*: click the words you don't know and get their translations inserted right next to them. Right-click a word (or press and hold on a phone) to look it up and add it to your vocabulary.
- **Writing.** *Writing Check*: paste, write or dictate a text and get every mistake marked, with a corrected version and an explanation. *Chat*: practise a language in a written conversation.
- **Vocabulary.** *Word List*: every word and phrase you are learning in one table, with filters, a fullscreen view, deleting several at once, and an option to fill in translations and other details with AI. *Flashcards*: make lists of words or phrases, group them by topic, and go through them in random order, marking what you have memorized.
- **Listening.** *Parallel Listen* and *Inline Listen*: listen to a passage sentence by sentence, in one language or several, using the browser's speech synthesis.
- **Speaking.** *Voice Chat*: have a conversation out loud. *Shadowing Practice*: generate or paste a passage, repeat it one sentence at a time, and get your attempt checked for the words and for the sounds.
- **Notes.** Notes for every section, and one place for everything else.
- **Guides.** Twelve short how-to guides, one click away on the pages they explain.
- **Accounts.** Sign in with an email and a password, or with Google.

## Where the AI is used

The app calls Google's Gemini model (`gemini-3.5-flash-lite`) through the Vercel AI SDK for translating, checking writing, chatting, filling in word details, generating Shadowing passages and checking Shadowing attempts. Everything else (the word list, flashcards, notes, sentence splitting, listening) is plain code and database work.

- The AI is called only from the server, so the API key never reaches the browser.
- Every input has a limit that the server enforces (see `lib/limits.ts`), and the page shows the same limit.
- A missing key, a quota limit, an overloaded model and a timeout each get their own clear message, and the rest of the app keeps working.

## A problem I solved: hearing the wrong sound

The browser's speech recognition writes down the word you *meant*. Say "mude" instead of "müde" and it still returns "müde", so a wrong sound never reached a check that only reads text.

The fix is to send the recording itself. The browser turns it into a 16 kHz mono WAV file, the server checks the upload, and a model that listens writes down what it heard and reports the vowels and consonants that came out as a different sound. Empty, repeated and same-sound findings are dropped before anything is shown. The check is honest about its limits: it judges vowels and consonants, not stress or intonation, it can miss some mistakes, and the page says so.

## Technologies

- **Framework:** Next.js 16 (App Router, Server Actions), React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL (Neon in production) with Prisma 7
- **Sign-in:** Auth.js (`next-auth` v5) with email and password, and Google
- **AI:** Vercel AI SDK with Google Gemini
- **Validation:** Zod
- **Testing:** Vitest and React Testing Library, run on every push with GitHub Actions
- **Hosting:** Vercel
- **Also:** the browser's speech synthesis and speech recognition, `react-markdown`, `lucide-react`

## Getting started

You need Node.js 22, a PostgreSQL database (a local one, or a free one from [Neon](https://neon.tech)) and a Gemini API key from [Google AI Studio](https://aistudio.google.com). The free tier limits how many requests you can make per minute.

1. Clone the repository and install the packages (this also generates the Prisma client):

   ```
   git clone https://github.com/Martin-Andreev-288/language-learner.git
   cd language-learner
   npm install
   ```

2. Create a file named `.env` in the project root (see the next section).

3. Create the tables:

   ```
   npx prisma migrate deploy
   ```

4. (Optional) Create two sample users, `admin@example.com` and `user@example.com`, both with the password `123456`:

   ```
   npm run seed
   ```

   **Warning:** the seed first deletes all existing users, texts, words and notes, so run it only on a database you can lose.

5. Start the app and open [http://localhost:3000](http://localhost:3000):

   ```
   npm run dev
   ```

Dictation, Voice Chat and the sounds check use the browser's speech features and microphone. Speech recognition is available in Chrome and Edge, but not in every browser.

## Environment variables

| Variable                                                                        | Needed?          | What it is for                                                                                 |
| ------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                  | Yes              | The PostgreSQL connection string.                                                              |
| `AUTH_SECRET`                                                                   | Yes              | Signs the sign-in session. Any long random string, for example from `openssl rand -base64 32`. |
| `GOOGLE_GENERATIVE_AI_API_KEY`                                                  | For the AI tools | The Gemini API key.                                                                            |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                          | Optional         | "Sign in with Google". Email and password sign-in works without them.                          |
| `RESEND_API_KEY`                                                                | Optional         | Sends the messages from the Contact page by email.                                             |
| `CONTACT_FROM_EMAIL`, `CONTACT_BCC_EMAIL`                                       | Optional         | The sender, and a copy address, for those emails.                                              |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_SERVER_URL` | Optional         | The app's name, its description, and its address (default `http://localhost:3000`).            |

```
DATABASE_URL=your_postgresql_connection_string
AUTH_SECRET=your_long_random_string
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
```

## Running tests

```
npm test
```

This runs more than 400 tests once. Use `npm run test:watch` while you work. The tests need no database and no API key, which is why GitHub Actions can run them on every push.

## Folder structure

- `app/(auth)/` - the sign-in and sign-up pages.
- `app/(root)/` - the pages: Reading, Writing, Vocabulary, Listening, Speaking, Notes, Contact and the home page.
- `app/actions/` - server actions: the database work and every AI call.
- `app/api/` - the Auth.js handler and the streaming route for the chat tools.
- `components/` - the shared components, including each tool's interface, and the footer.
- `lib/` - the logic that doesn't depend on a page, such as input limits, sentence splitting, the Shadowing checks, WAV conversion and the guide list. Its tests sit beside it.
- `prisma/` - the database schema and its migrations.
- `db/` - the seed script and the sample users.
- `.github/workflows/` - the workflow that runs the tests.
- `auth.ts` - the Auth.js setup.
