import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Carica solo .env (non .env.test)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && datasourceUrl.includes('sslcert=ca.pem')) {
  const absCa = path.resolve(process.cwd(), 'ca.pem');
  datasourceUrl = datasourceUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
}

const prisma = new PrismaClient({
  datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
});

async function main() {
  console.log('--- ISPEZIONE AMBIENTE APPLICATIVO / DIMOSTRATIVO ---');
  try {
    const dbRows = await prisma.$queryRaw<Array<{ current_db: string | null; server_port?: string | number }>>`
      SELECT DATABASE() AS current_db, @@port AS server_port;
    `;
    const activeDb = dbRows?.[0]?.current_db;
    console.log(`Database applicativo attivo: ${activeDb}`);

    const tables = await prisma.$queryRaw<Array<Record<string, string>>>`
      SHOW TABLES;
    `;
    console.log(`Numero tabelle: ${tables.length}`);

    // Conteggio record principali
    const qs = await prisma.quartiere.findMany();
    console.log(`Quartieri totali: ${qs.length}`);
    for (const q of qs) {
      console.log(`- ${q.id}: ${q.nome}`);
    }

    const usersWithQ = await prisma.utente.findMany({
      where: { quartiere_id: { not: null } },
      select: { id: true, email_normalizzata: true, quartiere_id: true }
    });
    console.log('Utenti con quartiere_id:', usersWithQ);
  } catch (err) {
    console.error('Errore ispezione:', (err as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
