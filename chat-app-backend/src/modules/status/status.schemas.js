import { z } from 'zod';

export const createStatusSchema = z.object({
  body: z.object({
    statusType: z.enum(['TEXT', 'IMAGE', 'VIDEO']),
    encryptedContent: z.string().optional().nullable(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color code (e.g. #FF5733)').optional().nullable(),
  }),
});
