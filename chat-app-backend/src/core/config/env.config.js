import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_ALGORITHM: z.string().default('HS256'),
  JWT_REFRESH_EXPIRY_DAYS: z.string().transform(Number).default('7'),
  MAX_IMAGE_SIZE_BYTES: z.string().transform(Number).default('1024'),
  MAX_PDF_SIZE_BYTES: z.string().transform(Number).default('2097152'),
  MAX_VIDEO_SIZE_BYTES: z.string().transform(Number).default('5242880'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

// For testing purposes, we allow Cloudinary keys to be optional
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
