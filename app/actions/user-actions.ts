'use server';

import { hashSync } from 'bcrypt-ts-edge';
import { signIn, signOut } from '@/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { prisma } from '@/lib/prisma';
import { signUpFormSchema, signInFormSchema } from '@/lib/validations';

// Helper function to format Prisma errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPrismaError(error: any): string {
    if (error.code === 'P2002') {
        // Unique constraint failed
        const field = error.meta?.target?.[0];
        if (field === 'email') {
            return 'Email already exists';
        }
        return `${field} already exists`;
    }
    return 'Something went wrong';
}

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

        // Hash password
        const hashedPassword = hashSync(validated.password, 10);

        // Create user in database
        await prisma.user.create({
            data: {
                name: validated.name,
                email: validated.email,
                password: hashedPassword,
            },
        });

        return { success: true, message: 'User created successfully' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Sign up error:', error);

        // Handle validation errors
        if (error.name === 'ZodError') {
            return {
                success: false,
                message: error.errors[0].message
            };
        }

        // Handle Prisma errors
        return {
            success: false,
            message: formatPrismaError(error)
        };
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
        await signIn('credentials', user);

        return { success: true, message: 'Signed in successfully' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // NextAuth throws a redirect error on successful sign-in
        // We need to re-throw it so the redirect happens
        if (isRedirectError(error)) {
            throw error;
        }

        return {
            success: false,
            message: 'Invalid email or password'
        };
    }
}

// Sign the user out
export async function signOutUser() {
    await signOut();
}
