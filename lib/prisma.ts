import { PrismaClient } from '@/app/generated/prisma/client';

// Declare global type for PrismaClient to prevent multiple instances in development
declare global {
    var prisma: PrismaClient | undefined;
}

// Create Prisma client singleton
// In development, we store the client on the global object to prevent
// creating multiple instances due to hot module reloading
export const db = globalThis.prisma || new PrismaClient();

// Only store on global in development to avoid memory leaks
if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = db;
}

export default db;