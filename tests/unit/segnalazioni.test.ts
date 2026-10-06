import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as segnalazioni from '../../src/lib/domain/segnalazioni';
import { PrismaClient } from '@prisma/client';

vi.mock('@prisma/client', () => {
  const mPrisma = {
    utente: {
      findUnique: vi.fn(),
    },
    uploadTemporaneo: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    segnalazione: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    outbox: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(mPrisma))
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

const prisma = new PrismaClient() as any;

describe('Dominio Segnalazioni (Funzioni pure/mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Dovrebbe rifiutare array media vuoto con messaggio corretto', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, []))
      .rejects.toThrow('La segnalazione richiede almeno un media');
  });

  it('Dovrebbe rifiutare upload duplicati (stesso ID)', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, ['A', 'A']))
      .rejects.toThrow('Identificatori upload duplicati nella richiesta');
  });

  it('Dovrebbe rifiutare account sospeso', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'SOSPESO', verificato_il: new Date() });
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, ['A']))
      .rejects.toThrow('Utente non autorizzato o account non verificato');
  });

  it('Dovrebbe rifiutare account non verificato', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: null });
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, ['A']))
      .rejects.toThrow('Utente non autorizzato o account non verificato');
  });

  it('Dovrebbe lanciare errore se il consumo atomico dei token fallisce (concorrenza/inesistente)', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: new Date() });
    prisma.uploadTemporaneo.updateMany.mockResolvedValue({ count: 0 }); // Fallisce
    
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, ['A']))
      .rejects.toThrow('Impossibile consumare gli upload');
  });

  it('Creazione segnalazione usa i metadati validati dal database ignorando manipolazioni client', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: new Date() });
    prisma.uploadTemporaneo.updateMany.mockResolvedValue({ count: 1 });
    // Dati fittizi estratti da DB (sicuri)
    prisma.uploadTemporaneo.findMany.mockResolvedValue([
      { storage_key: 'A', tipo: 'FOTO', mime: 'image/jpeg', byte_size: 999, sha256: 'hashsicuro' }
    ]);
    prisma.segnalazione.create.mockResolvedValue({ id: 'seg1' });

    // Client passa solo 'A', impossibile spoofare mime e byte_size
    await segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione', 10, 10, ['A']);

    expect(prisma.segnalazione.create).toHaveBeenCalled();
    const createCallData = prisma.segnalazione.create.mock.calls[0][0].data;
    const mediaCreated = createCallData.media.create[0];
    
    // Verifichiamo che i dati iniettati siano quelli provenienti dalla findMany (DB) e non altri
    expect(mediaCreated.byte_size).toBe(999);
    expect(mediaCreated.sha256).toBe('hashsicuro');
  });
});
