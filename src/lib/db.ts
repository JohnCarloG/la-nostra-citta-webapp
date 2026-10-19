import { PrismaClient } from '@prisma/client';
import path from 'path';

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && datasourceUrl.includes('sslcert=ca.pem')) {
  const absCa = path.resolve(process.cwd(), 'ca.pem');
  datasourceUrl = datasourceUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
