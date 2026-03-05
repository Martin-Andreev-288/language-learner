import "dotenv/config";
import { prisma } from "@/lib/prisma";
import sampleData from "@/db/sample-data";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Markdown parser for dialogue files
// ---------------------------------------------------------------------------
// Expected format:
//   # Category Title          → category field
//   ## Dialogue Title         → title field
//   - line of dialogue text   → content (joined with \n, prefix stripped)
//   blank lines / other       → ignored
// ---------------------------------------------------------------------------

interface DialogueRecord {
    category: string;
    title: string;
    content: string;
    language: string;
    order: number;
}

function parseDialogueFile(filePath: string, language: string): DialogueRecord[] {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n");

    const dialogues: DialogueRecord[] = [];
    let currentCategory = "";
    let currentTitle = "";
    let currentLines: string[] = [];
    let order = 0;

    const flush = () => {
        if (currentTitle && currentLines.length > 0) {
            dialogues.push({
                category: currentCategory,
                title: currentTitle,
                content: currentLines.join("\n"),
                language,
                order: order++,
            });
        }
        currentLines = [];
        currentTitle = "";
    };

    for (const line of lines) {
        if (line.startsWith("## ")) {
            flush();
            currentTitle = line.slice(3).trim();
        } else if (line.startsWith("# ")) {
            flush();
            currentCategory = line.slice(2).trim();
        } else if (line.startsWith("- ")) {
            currentLines.push(line.slice(2).trim());
        }
        // blank lines and any other lines are silently ignored
    }
    flush(); // flush the last dialogue block

    return dialogues;
}

// ---------------------------------------------------------------------------
// Seed SystemDialogue from all 4 language files (idempotent via upsert)
// ---------------------------------------------------------------------------

async function seedSystemDialogues() {
    const files = [
        { filename: "English_Dialogues.md", language: "English" },
        // { filename: "German_Dialogues.md", language: "German" },
        // { filename: "French_Dialogues.md", language: "French" },
        // { filename: "Italian_Dialogues.md", language: "Italian" },
    ];

    let total = 0;

    for (const { filename, language } of files) {
        const filePath = join(process.cwd(), "db", filename);
        const dialogues = parseDialogueFile(filePath, language);

        for (const dialogue of dialogues) {
            await prisma.systemDialogue.upsert({
                where: {
                    language_category_title: {
                        language: dialogue.language,
                        category: dialogue.category,
                        title: dialogue.title,
                    },
                },
                update: {
                    content: dialogue.content,
                    order: dialogue.order,
                },
                create: dialogue,
            });
        }

        total += dialogues.length;
        console.log(`  ✓ ${language}: ${dialogues.length} dialogues seeded`);
    }

    console.log(`SystemDialogue total: ${total} records`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    // --- Sample user data (delete + recreate) ---
    await prisma.verificationToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.note.deleteMany();
    await prisma.vocabularyEntry.deleteMany();
    await prisma.text.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.createMany({ data: sampleData.users });
    console.log("Sample user data seeded successfully");

    // --- System dialogues (idempotent — safe to run multiple times) ---
    await seedSystemDialogues();

    console.log("Database seeded successfully");
}

main();

