# Reading Feature — Full Implementation Plan (v2)

**Last updated:** Q43 — revised from Q42 plan to include Island Dialogues.

This is the complete, ordered implementation roadmap for the Reading page and all its sub-features, including the Island Dialogues system.

---

## What Already Exists

| Asset                                              | Status     | Notes                                                                                                                                |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma` → `Text` model              | ✅ Exists   | Has `userId`, `content`, `language`, `type` (reading/writing), `newWords`, `totalWords`, `createdAt` — **no `title`, no `folderId`** |
| `prisma/schema.prisma` → `VocabularyEntry` model   | ✅ Exists   | `userId`, `word`, `language`, `timesSeenReading`, `timesSeenWriting`, `firstSeen`, `lastSeen`                                        |
| `app/(root)/reading/page.tsx`                      | ✅ Exists   | Placeholder only — `AuthPrompt` for guests, "coming soon" for auth users                                                             |
| `components/shared/vocabulary-analyzer-client.tsx` | ✅ Exists   | Full word analysis logic — new vs repeated, copy, stats — reusable                                                                   |
| `components/shared/auth-prompt.tsx`                | ✅ Exists   | Auth gate component                                                                                                                  |
| Database tables `Text`, `VocabularyEntry`          | ✅ Migrated | Tables exist but `Text` lacks `title`, `folderId`, and `dialogue` type                                                               |

---

## Routing Structure (Final)

```
/reading                              → Folder list (reading texts)
/reading/[folderId]                   → Texts inside a reading folder (accordion)
/reading/island-dialogues             → Island Dialogues hub page
/reading/island-dialogues/[folderId]  → User's own dialogue folder (accordion)
```

---

## The 13-Step Implementation Plan

---

### Step 1 — Database Schema: Folders + Text Updates + SystemDialogue + TextType Extension

**What to ask:**

> "Update the Prisma schema with these changes:
> 1. Add a new `Folder` model: `id`, `userId`, `name`, `order` (Int, for drag-reordering), `createdAt`, `updatedAt`. A folder belongs to a user (`User` relation with cascade delete). A folder has many `Text` records.
> 2. Add `title String?` (optional) to the `Text` model.
> 3. Add `folderId String?` to the `Text` model (optional relation to `Folder`).
> 4. Add `dialogue` to the existing `TextType` enum (currently `reading | writing`).
> 5. Add a new `SystemDialogue` model: `id`, `title String`, `content String @db.Text`, `language String`, `order Int @default(0)`, `createdAt DateTime @default(now())`. No `userId` — these are global seeded records.
> Run `prisma migrate dev --name add-folders-and-dialogues`."

**What this does:**
- `Folder` model: drives both reading folders and dialogue folders (distinguished by the `type` of `Text` inside)
- `Text.title`: optional title for each text/dialogue
- `Text.folderId`: links a text to a folder
- `TextType.dialogue`: marks user-personal dialogue texts
- `SystemDialogue`: stores the seeded "default" island dialogues — never owned by a user, never deleted

**Why first:** All other steps depend on this schema. No UI or actions make sense without the correct tables.

**Estimated scope:** Schema-only — small.

---

### Step 2 — Seed Script: Default Island Dialogues (!!! attention - there is a revised verison of this step below)

**What to ask:**

> "Create a seed script (or extend the existing `db/seed.ts`) that populates the `SystemDialogue` table with a set of default island dialogues. Add at least 5–8 sample dialogues in 2–3 languages (e.g., English, Spanish, French). Each dialogue should have a `title`, `content` (a short dialogue between 2 people), `language`, and `order`. Make the seed script idempotent (safe to run multiple times without creating duplicates). Run the seed."

**What this does:**
- Populates `SystemDialogue` with curated default content every user sees
- Idempotent: uses `upsert` or checks for existence before inserting — running the seed again won't create duplicates
- Sample content: short, natural language dialogues (greetings, asking for directions, ordering food, etc.) — useful for language learners

**Why second:** The Island Dialogues page (Step 7) needs seeded data to display. Without it, the default panel is empty.

**Estimated scope:** 1 file change (~50–80 lines of seed data).

[!!!] Revised version of step 2 after some newly added stuffs

```
Update the `SystemDialogue` model in `prisma/schema.prisma` to add `category String` (and add `@@index([category])`).
Run the migration: `prisma migrate dev --name add-systemdialogue-category`.

Then extend `db/seed.ts` to populate the `SystemDialogue` table from 4 markdown dialogue files:
- `English_Dialogues.md` → language: "English"
- `German_Dialogues.md` → language: "German"
- `French_Dialogues.md` → language: "French"
- `Italian_Dialogues.md` → language: "Italian"

The markdown format is:
- `# Category Title` → `category` field
- `## Dialogue Title` → `title` field
- `- line of dialogue` → collected as content (joined with newline, `- ` prefix stripped from each line)
- Blank lines and lines not starting with `#`, `##`, or `- ` are ignored

The seed must be idempotent: use `upsert` with `where: { language_category_title: { language, category, title } }` as the unique key.
Add a `@@unique([language, category, title])` constraint to the `SystemDialogue` model to support this upsert.
The `order` field should be auto-assigned as a sequential integer per language (0, 1, 2, … across all dialogues in that language file, in the order they appear).
Place the 4 dialogue files in the `db/` folder alongside `seed.ts`.
Tell me what command to run to execute the seed after the migration is applied.
```

---

### Step 3 — Server Actions: Folder CRUD

**What to ask:**

> "Create server actions in `app/actions/folder-actions.ts`:
> - `createFolder(name: string)` — creates a folder for the current user with auto-assigned `order` (max existing order + 1)
> - `getFolders()` — returns all user's folders ordered by `order` ascending
> - `updateFolder(id: string, name: string)` — renames a folder (user-scoped)
> - `deleteFolder(id: string)` — deletes a folder and all its texts (cascade via Prisma)
> - `reorderFolders(orderedIds: string[])` — receives folder IDs in the new order, updates each folder's `order` field
> All actions must verify the current user owns the folder before modifying. Use `await auth()` for user identification."

**What this does:**
- Full CRUD + reorder for folders
- Scoped to the authenticated user — no user can touch another user's folders
- `deleteFolder` relies on the Prisma cascade set up in Step 1 (`onDelete: Cascade` on `Text.folderId`)

**Why third:** The folder list UI (Step 5) calls these. Must exist before UI is built.

**Estimated scope:** ~100–130 lines.

---

### Step 4 — Server Actions: Text CRUD + Dialogue Copy

**What to ask:**

> "Create server actions in `app/actions/text-actions.ts`:
> - `createText(folderId: string, content: string, language: string, title?: string, type?: TextType)` — creates a text in a folder; `type` defaults to `reading`; `title` defaults to `'Untitled'`
> - `getTextsInFolder(folderId: string)` — returns all texts in a folder ordered by `createdAt` descending (user-scoped)
> - `updateText(id: string, data: { title?: string; content?: string })` — partial update
> - `deleteText(id: string)` — deletes a text (user-scoped)
>
> Also in `app/actions/dialogue-actions.ts`:
> - `getSystemDialogues()` — returns all `SystemDialogue` records ordered by `order`
> - `copyDialogueToPersonal(systemDialogueId: string, folderId?: string)` — copies a `SystemDialogue` into the user's personal folder: if `folderId` is provided, creates the text there; if not, auto-creates a folder named 'My Dialogues' first, then creates the text with `type: dialogue`"

**What this does:**
- Full text CRUD usable for both reading texts and user-personal dialogue texts (distinguished by `type`)
- `copyDialogueToPersonal`: the one-click "carry to my dialogues" action — creates a `Text` from a `SystemDialogue` with `type: dialogue`
- `getSystemDialogues`: fetches the seeded default content for the hub page

**Why fourth:** Steps 5–8 all call these actions.

**Estimated scope:** 2 files, ~120–160 lines total.

---

[!!!] Note - here you can add the mega menu. This was discussed in question 47.

### Step 5 — Reading Page: Folder List View

**What to ask:**

> "Build the main Reading page at `/reading`. Replace the existing placeholder in `app/(root)/reading/page.tsx` with a server wrapper that calls `getFolders()` and passes folders to a client component. The client component should render:
> - A page header: '📖 Reading' with a subtitle
> - An 'Add Folder' button: clicking shows an inline input to name the new folder
> - A folder list: each folder shows its name, an edit (pencil) icon, a delete (trash) icon, and is draggable for reordering
> - Empty state: 'No folders yet. Create your first folder to start reading.'
> - Each folder name is a link that navigates to `/reading/[folderId]`
> - A navigation link/button to 'Island Dialogues' at the top of the page
> Use `@hello-pangea/dnd` for drag-to-reorder. Install it with `npm install @hello-pangea/dnd`. The component should use optimistic updates for add/delete/reorder.
> Create the client component at `components/shared/reading/folder-list.tsx`."

**What this does:**
- First real visible UI on the Reading page
- Full folder management: add (inline), rename (inline edit), delete (with confirmation), drag-to-reorder
- Optimistic UI: operations feel instant; server action runs in background
- Navigation to Island Dialogues visible from the main reading page

**What this creates:**
- `app/(root)/reading/page.tsx` (reworked server wrapper)
- `components/shared/reading/folder-list.tsx` (client component)
- `app/(root)/reading/[folderId]/page.tsx` (placeholder — built in Step 6)

**Estimated scope:** 2–3 files, moderate. Drag-and-drop is the most complex part.

**Library recommendation:** `@hello-pangea/dnd` — the actively maintained fork of `react-beautiful-dnd`. Gives smooth animations, keyboard accessibility, and touch/mobile support. ~30KB bundle addition.

---

### Step 6 — Reading Page: Text List Inside a Folder (Accordion View)

**What to ask:**

> "Build the text list view at `/reading/[folderId]`. Create `app/(root)/reading/[folderId]/page.tsx` as a server wrapper that fetches the folder details and its texts via `getTextsInFolder(folderId)`. Pass the data to a client component at `components/shared/reading/text-accordion.tsx`. The accordion should:
> - Show folder name as heading with a '← Back to Folders' link
> - 'Add Text' button — opens a form with: title input (optional, placeholder 'Untitled'), language selector, content textarea
> - Each text item collapsed: shows title + formatted date ('Feb 28, 2026')
> - Each text item expanded: shows full text content + a 'Delete' button
> - Smooth expand/collapse animation with `transition-all`
> - Empty state: 'No texts in this folder yet. Add your first text.'
> Use `useState` to track which accordion items are open (no library needed)."

**What this does:**
- Completes the reading CRUD flow: Folders → Texts → Read
- Accordion pattern: each text is collapsed by default, expanded on click
- Add text form is inline (no separate page navigation needed)

**What this creates:**
- `app/(root)/reading/[folderId]/page.tsx`
- `components/shared/reading/text-accordion.tsx`

**Estimated scope:** 2–3 files, moderate.

---

### Step 7 — Island Dialogues Hub Page

**What to ask:**

> "Create the Island Dialogues hub page at `/reading/island-dialogues`. Create `app/(root)/reading/island-dialogues/page.tsx` as a server wrapper that fetches both system dialogues (via `getSystemDialogues()`) and the user's dialogue folders (via `getFolders()`, filtered to folders containing `type: dialogue` texts). Pass both to a client component at `components/shared/reading/island-dialogues-hub.tsx`.
>
> The page layout has two sections:
> **Section 1 — Default Dialogues:** A card grid showing all `SystemDialogue` records. Each card shows title, language badge, a preview of the first 80 characters of content, and a 'Copy to My Dialogues' button. Clicking the button calls `copyDialogueToPersonal(id)`. If the user has no dialogue folder yet, `copyDialogueToPersonal` auto-creates one named 'My Dialogues' and navigates to it after copying.
>
> **Section 2 — My Dialogues:** Below the default section, show the user's own dialogue folders using the same folder list component from Step 5 (or a simplified version). Each folder links to `/reading/island-dialogues/[folderId]`. Include an 'Add Folder' button for adding new personal dialogue folders.
>
> Add a '← Back to Reading' link at the top."

**What this does:**
- The central hub for the Island Dialogues feature
- Default dialogues: always visible, always the same, cannot be deleted — served from `SystemDialogue`
- Personal section: user's own dialogue folders — same CRUD as reading folders
- One-click copy: copies a default dialogue into the user's personal collection

**What this creates:**
- `app/(root)/reading/island-dialogues/page.tsx`
- `components/shared/reading/island-dialogues-hub.tsx`

**Estimated scope:** 2–3 files, moderate.

---

### Step 8 — Island Dialogues: User's Own Dialogue Folder View

**What to ask:**

> "Create the user's own dialogue folder view at `/reading/island-dialogues/[folderId]`. Create `app/(root)/reading/island-dialogues/[folderId]/page.tsx` as a server wrapper. This page is identical in structure to `/reading/[folderId]` (Step 6) — accordion of texts with add/delete. The only differences are:
> - New texts are created with `type: dialogue`
> - The heading shows the folder name with '← Back to Island Dialogues' instead of '← Back to Folders'
> - Reuse or extend `components/shared/reading/text-accordion.tsx` — accept a `backHref` prop so it renders the correct back link
> This page should also have the 'Word Analysis' toggle (to be added in Step 9), just like the main reading folder view."

**What this does:**
- Completes the personal dialogues flow: Hub → My Dialogue Folder → Read/Manage Dialogues
- Reuses the accordion component from Step 6 — no duplicate code
- The user's experience is identical to the main reading page, just under a different URL

**What this creates:**
- `app/(root)/reading/island-dialogues/[folderId]/page.tsx`
- Minor update to `components/shared/reading/text-accordion.tsx` (add `backHref` prop)

**Estimated scope:** 1 new file + small modification to existing component.

---

### Step 9 — Word Analysis Toggle (Shared)

**What to ask:**

> "Add word analysis functionality to both the main reading folder view (`/reading/[folderId]`) and the dialogue folder view (`/reading/island-dialogues/[folderId]`).
>
> First, extract the word-processing logic from `components/shared/vocabulary-analyzer-client.tsx` into a pure utility function `processTextTokens(text: string, seenWords: Set<string>)` in `lib/text-analysis.ts`. This function returns an array of tokens with type ('new', 'repeated', 'whitespace', 'punctuation'). Update the vocabulary analyzer client to import from this utility.
>
> Then add a 'Word Analysis' toggle to the folder text view. Position it at the top of the accordion, above the text list:
> - A labelled toggle switch: 'Word Analysis: ON / OFF'
> - When ON: each expanded text renders its content using `processTextTokens` with the same visual style as the analyzer (green brackets for new words, gray for repeated)
> - When OFF: each expanded text renders as plain text
> - Store the preference in `localStorage` under the key `readingWordAnalysis` so it persists across sessions
> - Apply to both `/reading/[folderId]` and `/reading/island-dialogues/[folderId]`"

**What this does:**
- Extracts shared logic: one source of truth for word processing, used by both the Vocabulary Analyzer and the Reading pages
- Per-folder toggle: one switch controls analysis for all texts in that folder view — avoids UI clutter
- `localStorage` persistence: the user's preference survives page refreshes
- The same toggle component can be reused in both reading and dialogue views

**What this creates:**
- `lib/text-analysis.ts` (new utility)
- Updates to `vocabulary-analyzer-client.tsx` (import from utility)
- Updates to `text-accordion.tsx` (toggle + conditional word analysis rendering)

**Estimated scope:** 1 new utility file + modifications to 2–3 components.

---

### Step 10 — Click-to-Save Word + Vocabulary Page

**What to ask:**

> "Make each word token in the word-analysis view clickable. When a user clicks a word in an analysed text (in either `/reading/[folderId]` or `/reading/island-dialogues/[folderId]`), call a server action `saveWord(word: string, language: string)` that creates or updates the `VocabularyEntry` for that user (increment `timesSeenReading`). Show a brief inline toast near the clicked word: 'Saved: word' — visible for 1.5 seconds then fades out. No toast library needed.
>
> Then build the Vocabulary page at `/vocabulary`. Replace the existing placeholder with a server component that calls `getVocabulary()` and renders:
> - Page header: '📘 Vocabulary'
> - Stats row: total words saved, total languages
> - A searchable, filterable table: columns are Word, Language, Times Seen (Reading), Times Seen (Writing), First Seen, Last Seen
> - Language filter dropdown
> - Search box filtering by word substring
> - Empty state: 'No vocabulary saved yet. Click words while reading to save them.'
> Create server actions `saveWord` and `getVocabulary` in `app/actions/vocabulary-actions.ts`."

**What this does:**
- Completes the reading-to-learning loop: Read → Click word → Save to Vocabulary → Review
- `saveWord` uses Prisma `upsert` on the `@@unique([userId, word, language])` constraint — safe to call repeatedly
- Toast is a simple `useState`-controlled absolutely-positioned element near the clicked word — no library
- Vocabulary page is a Server Component: fast, no loading states, data fetched at request time

**What this creates:**
- `app/actions/vocabulary-actions.ts`
- Updates to `lib/text-analysis.ts` (word spans need `onClick`)
- `app/(root)/vocabulary/page.tsx` (reworked)

**Estimated scope:** 3–4 files, moderate-to-high.

---

### Step 11 — Statistics Panel

**What to ask:**

> "Add a 'Statistics' button to the main Reading page (`/reading`). It should open a modal panel showing:
> - Summary cards: total folders, total texts, total words read, total new words saved to vocabulary
> - Language breakdown: a simple bar or list showing how many texts per language
> - Most recent 10 texts: title + date + folder name, each clickable (navigates to the folder)
> - Most recent 10 system dialogues copied: title + date copied
> - A search box that filters texts by title or content substring (client-side filter on the returned data)
>
> Create a `getReadingStats()` server action in `app/actions/reading-stats-actions.ts` that aggregates data from `Folder`, `Text`, and `VocabularyEntry`. The modal should open without a page navigation (client-side toggle). Style it as a slide-over panel from the right on desktop, full-screen modal on mobile."

**What this does:**
- Gives the user a bird's-eye view of all their reading activity
- Aggregated data: total counts, language breakdown, recent texts (useful for finding specific texts)
- Search: filter all texts by content without navigating through folders

**Estimated scope:** 2 files (action + modal component), moderate.

---

### Step 12 — Text Resources (Bookmarks & Ideas)

**What to ask:**

> "Add a 'Text Resources' section to the Reading page. Create a new `Resource` model in Prisma:
> - `id String @id @default(cuid())`
> - `userId String`
> - `title String`
> - `url String?` (optional)
> - `note String?` (optional, `@db.Text`)
> - `createdAt DateTime @default(now())`
> - `user User @relation` with cascade delete
>
> Run a migration. Create server actions `createResource`, `getResources`, `deleteResource` in `app/actions/resource-actions.ts`.
>
> Add a 'Resources' button to the Reading page header that opens a side panel showing:
> - A list of saved resources: title, clickable URL (if present), note preview
> - 'Add Resource' form: title (required), URL (optional), note (optional)
> - Delete button per resource
> - Empty state: 'No resources yet. Save links, book titles, or ideas here.'"

**What this does:**
- Bookmarking system for reading material (websites, books, ideas, YouTube channels, etc.)
- Accessible from the main reading page — doesn't require navigating away
- Resources are personal per user; no sharing

**Estimated scope:** Schema change + 1 migration + 2–3 files.

---

### Step 13 — AI Text Generation

**What to ask:**

> "Add an 'Generate with AI' button to the text list view inside a reading folder (`/reading/[folderId]` and `/reading/island-dialogues/[folderId]`). Clicking opens a modal with:
> - Text area for a prompt/topic description (e.g., 'A conversation at a coffee shop in French')
> - Language selector
> - Difficulty selector: Beginner / Intermediate / Advanced
> - Approximate length selector: Short (~100 words) / Medium (~300 words) / Long (~600 words)
> - 'Generate' button
>
> On submit, call a server action `generateText(prompt, language, difficulty, length)` in `app/actions/ai-actions.ts` that sends a request to the OpenAI API (`gpt-4o-mini` model) and returns the generated text. The action inserts the result as a new `Text` record in the current folder and returns the new text to the client. The modal closes and the accordion scrolls to the new text.
>
> Install `npm install openai`. Require `OPENAI_API_KEY` in `.env`."

**What this does:**
- AI-powered text generation: describe what you want → get a reading or dialogue text
- `gpt-4o-mini`: fast, cheap, good for short-to-medium text generation
- The generated text lands directly in the current folder as a normal `Text` record — no special handling needed afterward

**What you need before this step:**
- OpenAI account with credits: [platform.openai.com](https://platform.openai.com)
- Add `OPENAI_API_KEY=...` to `.env`
- Run `npm install openai`

**Estimated scope:** 1 API route (or server action with fetch) + 1 modal component.

**Note:** This is the only step with an external cost. `gpt-4o-mini` is approximately $0.000150 per 1K input tokens and $0.000600 per 1K output tokens — a 300-word text generation costs roughly $0.001. Very affordable for personal use.

---

## Summary Table

| Step   | Feature                         | What to ask about                                                  | Depends on    | Scope        |
| ------ | ------------------------------- | ------------------------------------------------------------------ | ------------- | ------------ |
| **1**  | Database schema                 | Folder + Text updates + SystemDialogue + TextType enum             | —             | Small        |
| **2**  | Seed default dialogues          | SystemDialogue seed script                                         | Step 1        | Small        |
| **3**  | Folder server actions           | Folder CRUD + reorder                                              | Step 1        | Small        |
| **4**  | Text + Dialogue server actions  | Text CRUD + `getSystemDialogues` + `copyDialogueToPersonal`        | Step 1        | Small–Medium |
| **5**  | Reading folder list UI          | `/reading` — folders, drag-reorder, add/edit/delete                | Step 3        | Medium       |
| **6**  | Reading text accordion UI       | `/reading/[folderId]` — accordion, add/delete texts                | Steps 4, 5    | Medium       |
| **7**  | Island Dialogues hub            | `/reading/island-dialogues` — default dialogues + personal folders | Steps 2, 4, 5 | Medium       |
| **8**  | User's own dialogue folder      | `/reading/island-dialogues/[folderId]` — reuses accordion          | Steps 6, 7    | Small        |
| **9**  | Word analysis toggle            | Shared `lib/text-analysis.ts`, toggle on folder views              | Steps 6, 8    | Medium       |
| **10** | Click-to-save + Vocabulary page | Word saving, vocabulary table                                      | Step 9        | Medium–High  |
| **11** | Statistics panel                | Aggregated stats modal                                             | Steps 5, 6    | Medium       |
| **12** | Text resources                  | Resource model, bookmarks panel                                    | Step 1        | Medium       |
| **13** | AI text generation              | OpenAI integration, generate modal                                 | Steps 6, 8    | Medium       |

---

## Recommended Execution Order

### Phase 1 — Core Reading (Steps 1–6)
Complete, test, and confirm the full reading loop before adding dialogues:
- Folders work (add, rename, delete, reorder)
- Texts work (add, read in accordion, delete)
- Navigation works (Reading → Folder → Read)

### Phase 2 — Island Dialogues (Steps 7–8)
- Hub page with default dialogues visible
- Copy-to-personal works
- Personal dialogue folders navigate to accordion (reusing Step 6 component)

### Phase 3 — Intelligence Layer (Steps 9–10)
- Word analysis toggle on reading and dialogue views
- Click-to-save vocabulary
- Vocabulary page shows saved words

### Phase 4 — Enhancements (Steps 11–13)
- Statistics panel
- Text resources/bookmarks
- AI text generation (requires OpenAI account)

**Phases 1–3 form the complete, usable feature.** Phase 4 can be done later, in any order.

---

## Architecture Decisions

| Decision              | Approach                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Folder model          | Single `Folder` model used for both reading folders and dialogue folders (distinguished by the `type` of `Text` records inside) |
| Default dialogues     | Separate `SystemDialogue` model — no `userId`, no delete capability                                                             |
| TextType              | `reading \| writing \| dialogue` — dialogue texts are user-personal, stored in `Text` table                                     |
| Drag-and-drop         | `@hello-pangea/dnd` — smooth animations, touch support, keyboard accessible                                                     |
| Word analysis sharing | `lib/text-analysis.ts` — pure function, imported by both Vocabulary Analyzer and Reading pages                                  |
| Toggle persistence    | `localStorage` key `readingWordAnalysis` — survives page refresh                                                                |
| Toast notifications   | Inline `useState`-controlled fade element near the clicked word — no library                                                    |
| Routing               | App Router dynamic segments: `[folderId]` under both `/reading` and `/reading/island-dialogues`                                 |
| Mobile responsiveness | Tailwind `sm:` / `md:` / `lg:` classes on every component; drawer-style panels on mobile                                        |
| Optimistic UI         | `useOptimistic` hook for instant feedback on add/delete/reorder                                                                 |
| AI model              | `gpt-4o-mini` — cheap (~$0.001/generation), fast, adequate quality for language learning texts                                  |
