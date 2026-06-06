import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
    username: z.string().min(3, 'Username must be at least 3 characters').max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
    email: z.string().email('Invalid email address').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    securityQuestionHash: z.string().min(5, 'Security question hash is required'),
    publicKey: z.string().min(10, 'E2EE public key is required'),
    phoneNumber: z.string().max(20).optional(),
    bio: z.string().max(139).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string(),
  }),
});

export const recoverVerifySchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    securityAnswer: z.string().min(1, 'Security answer is required'),
  }),
});

export const recoverResetSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    recoveryToken: z.string().min(10, 'Recovery token is required'),
    publicKey: z.string().min(10, 'E2EE public key is required').optional(),
  }),
});
