'use server';

import { hashSync } from 'bcrypt-ts-edge';
import { signIn, signOut, auth } from '@/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { prisma } from '@/lib/prisma';
import { signUpFormSchema, signInFormSchema } from '@/lib/validations';
import { formatError } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { guessLanguageCode } from '@/lib/language-codes';

// Server action for user sign-up
export async function signUpUser(
    prevState: { success: boolean; message: string },
    formData: FormData
) {
    try {
        // Extract form data
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            password: formData.get('password'),
            confirmPassword: formData.get('confirmPassword'),
        };

        // Validate with Zod schema
        const validated = signUpFormSchema.parse(data);

        // Save the plain password before hashing (for auto sign-in)
        const plainPassword = validated.password;

        // Hash password
        validated.password = hashSync(validated.password, 10);

        // Create user in database
        await prisma.user.create({
            data: {
                name: validated.name,
                email: validated.email,
                password: validated.password,
            },
        });

        // Auto sign-in after successful registration
        await signIn('credentials', {
            email: validated.email,
            password: plainPassword,
            redirectTo: '/',
        });

        return { success: true, message: 'User created successfully' };
    } catch (error) {
        if (isRedirectError(error)) {
            throw error;
        }

        return { success: false, message: formatError(error) };
    }
}

// Server action for user sign-in
export async function signInWithCredentials(
    prevState: { success: boolean; message: string },
    formData: FormData
) {
    try {
        // Extract and validate form data
        const user = signInFormSchema.parse({
            email: formData.get('email'),
            password: formData.get('password'),
        });

        // Sign in with NextAuth
        await signIn('credentials', { ...user, redirectTo: '/' });

        return { success: true, message: 'Signed in successfully' };
    } catch (error) {
        // NextAuth throws a redirect error on successful sign-in
        // We need to re-throw it so the redirect happens
        if (isRedirectError(error)) {
            throw error;
        }

        return { success: false, message: 'Invalid email or password' };
    }
}

// Sign the user out
export async function signOutUser() {
    await signOut();
}

// The user's default "translate into" language (Question 303).
//
// Read on the server and handed down as a starting value, rather than
// fetched from the browser after mount: a field that renders empty and
// then fills itself in a moment later is worse than one that was simply
// right to begin with, and every page that needs this already loads a
// session before rendering anything.
export async function getDefaultTranslateLanguage(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) return "";

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { defaultTranslateLanguage: true },
    });
    return user?.defaultTranslateLanguage ?? "";
}

// Setting it to nothing is a real choice, not a failure — it means "ask me
// every time", which is exactly how every one of these fields behaved
// before this existed. So an empty value clears the column rather than
// being rejected.
export async function setDefaultTranslateLanguage(language: string) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const trimmed = language.trim();
    // Stored as the canonical spelling this app's language list uses, so a
    // saved default always still resolves — the same guarantee the
    // recently-used language list makes for the same reason. Anything the
    // list doesn't recognize is rejected rather than stored, since a
    // default nothing can match would silently do nothing at all.
    if (trimmed && !guessLanguageCode(trimmed)) {
        throw new Error("Pick a language from the list.");
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { defaultTranslateLanguage: trimmed || null },
    });

    // Every page that uses this reads it while rendering on the server, and
    // the header holding this control lives in a layout that a client-side
    // navigation wouldn't re-render at all. Without this, changing the
    // setting and walking straight to Inline Translate could hand you a page
    // still built from the previous value.
    revalidatePath("/", "layout");

    return { language: trimmed };
}
