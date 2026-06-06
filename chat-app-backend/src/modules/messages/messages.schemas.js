import { z } from 'zod';

export const getMessagesSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
  query: z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('30'),
  }),
});

export const getMediaGallerySchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
});
