import pkgClient from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.config.js';

const { PrismaClient } = pkgClient;
const { Pool } = pg;

let prisma;

const createPrismaClient = () => {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

if (env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  // In development, avoid creating a new PrismaClient connection pool on reload
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

export default prisma;
