'use server';

import { hashSync } from 'bcrypt-ts-edge';
import { signIn } from '@/auth';
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

// Helper function to format NextAuth errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAuthError(error: any): string {
    if (error.name === 'PrismaClientKnownRequestError') {
        return formatPrismaError(error);
    }
    if (error.code === 'P2002') {
        return 'Email already exists';
    }
    return error.message || 'Invalid email or password';
}

// Server action for user sign-up
export async function signUpUser(formData: FormData) {
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
export async function signInUser(formData: FormData) {
    try {
        // Extract form data
        const data = {
            email: formData.get('email'),
            password: formData.get('password'),
        };

        // Validate with Zod schema
        const validated = signInFormSchema.parse(data);

        // Sign in with NextAuth
        await signIn('credentials', {
            email: validated.email,
            password: validated.password,
            redirect: false,
        });

        return { success: true, message: 'Signed in successfully' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Sign in error:', error);

        // Handle validation errors
        if (error.name === 'ZodError') {
            return {
                success: false,
                message: error.errors[0].message
            };
        }

        return {
            success: false,
            message: formatAuthError(error)
        };
    }
}
