import "dotenv/config";
import { prisma } from "@/lib/prisma";
import sampleData from "@/db/sample-data";

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

    console.log("Database seeded successfully");
}

main();
