import { z } from 'zod';

// Schema for user sign-up
export const signUpFormSchema = z.object({
    name: z.string()
        .min(3, 'Name must be at least 3 characters')
        .max(50, 'Name must be less than 50 characters')
        .trim(),
    email: z.email('Invalid email address'),
    password: z.string()
        .min(6, 'Password must be at least 6 characters')
        .max(100, 'Password must be less than 100 characters'),
    confirmPassword: z.string()
        .min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

// Schema for user sign-in
export const signInFormSchema = z.object({
    email: z.email('Invalid email address'),
    password: z.string()
        .min(1, 'Password is required'),
});

export type SignUpFormInput = z.infer<typeof signUpFormSchema>;
export type SignInFormInput = z.infer<typeof signInFormSchema>;
