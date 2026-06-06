import { z } from 'zod';

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).optional(),
    bio: z.string().max(139, 'Bio cannot exceed 139 characters').optional().nullable(),
    phoneNumber: z.string().max(20, 'Phone number cannot exceed 20 characters').optional().nullable(),
  }),
});
