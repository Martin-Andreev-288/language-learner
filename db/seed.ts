import "dotenv/config";
import { prisma } from "@/lib/prisma";
import sampleData from "@/db/sample-data";

async function main() {
    // Clear existing data (order matters due to foreign keys)
    await prisma.verificationToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.note.deleteMany();
    await prisma.vocabularyEntry.deleteMany();
    await prisma.text.deleteMany();
    await prisma.user.deleteMany();

    // Seed users
    await prisma.user.createMany({ data: sampleData.users });

    console.log("Database seeded successfully");
}

main();
