import { assertIsolatedBrowserDatabase } from './isolated-database';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/lib/security';
import { syntheticGpsJpeg } from '../helpers/synthetic-gps-image';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  assertIsolatedBrowserDatabase();
  const prisma = new PrismaClient();
  try {
    const live = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (live[0]?.db !== 'la_nostra_citta_browser') throw new Error('Unexpected live database');
    if (await prisma.utente.count() || await prisma.segnalazione.count()) throw new Error('Browser database must start empty; no reset of existing data is performed.');
    const quartiere = await prisma.quartiere.create({ data: { nome: 'Quartiere sintetico browser', codice: 'BROWSER', is_ufficiale: true } });
    const passwordHash = await hashPassword('Browser-only-2026!');
    for (const [email, role, name] of [['citizen@example.invalid', 'CITTADINO', 'Cittadino'], ['committee@example.invalid', 'COMITATO', 'Operatore']] as const) {
      await prisma.utente.create({ data: { nome: name, cognome: 'Sintetico', email_normalizzata: email, password_hash: passwordHash,
        verificato_il: new Date(), ruolo: role, quartiere_id: quartiere.id } });
    }
    for (const c of [{ codice: 'STRADE_MARCIAPIEDI', nome: 'Strade, buche e marciapiedi' }, { codice: 'RIFIUTI_PULIZIA', nome: 'Rifiuti e igiene urbana' }]) await prisma.categoria.create({ data: c });
    await fs.mkdir('browser-evidence', { recursive: true });
    await fs.writeFile(path.join('browser-evidence', 'synthetic-gps.jpg'), await syntheticGpsJpeg());
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
