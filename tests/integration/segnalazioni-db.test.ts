import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Integrazione DB: Segnalazioni e Vincoli', () => {
  it.skip('Dovrebbe impedire transazione senza media READY (Trigger DB)', async () => {
    // BLOCKED: DB non disponibile.
    // await expect(
    //   prisma.$executeRaw`INSERT INTO "Segnalazione" (id, autore_id, descrizione, quartiere_id, categoria_id) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'test', 'q1', 'c1')`
    // ).rejects.toThrow();
  });

  it.todo('Dovrebbe gestire correttamente inserimento genitore e media insieme');

  it.todo('Dovrebbe fallire alla cancellazione dell\'ultimo media READY');

  it.todo('Dovrebbe bloccare il trasferimento media che lascia il genitore a 0');

  it.todo('Dovrebbe fallire il consumo simultaneo dello stesso upload (concorrenza)');

  it.todo('Dovrebbe bloccare il sostegno duplicato e l\'autosostegno');

  it.todo('Verifica transizioni e visibilità (es. T13)');
});
