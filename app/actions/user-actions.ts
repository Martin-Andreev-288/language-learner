'use server';

import { hashSync } from 'bcrypt-ts-edge';
import { signIn, signOut } from '@/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { prisma } from '@/lib/prisma';
import { signUpFormSchema, signInFormSchema } from '@/lib/validations';
import { formatError } from '@/lib/utils';

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
