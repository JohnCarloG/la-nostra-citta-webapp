import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auth from '../../src/lib/domain/auth';
import { hashPassword, hashToken } from '../../src/lib/security';
import { PrismaClient } from '@prisma/client';

// Creiamo un mock manuale minimo del modulo @prisma/client
vi.mock('@prisma/client', () => {
  const mPrisma = {
    utente: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    tokenAccount: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    sessione: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mPrisma))
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

const prisma = new PrismaClient() as any;

describe('Flussi di Autenticazione e Autorizzazione (Funzioni Pure/Mock)', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Registrazione normalizza email e rifiuta duplicati', async () => {
    prisma.utente.findUnique.mockResolvedValue({ id: '123' }); // Simula duplicato
    
    await expect(auth.registraCittadino('Mario', 'Rossi', ' TEST@Email.com ', 'password123'))
      .rejects.toThrow('Email già registrata');
      
    // Verifica normalizzazione
    expect(prisma.utente.findUnique).toHaveBeenCalledWith({ where: { email: 'test@email.com' } });
  });

  it('Login fallisce con password errata', async () => {
    prisma.utente.findUnique.mockResolvedValue({ 
      id: '123', 
      password_hash: await hashPassword('corretta') 
    });
    
    await expect(auth.login('test@email.com', 'sbagliata')).rejects.toThrow('Credenziali non valide');
  });

  it('Login fallisce per account non verificato', async () => {
    prisma.utente.findUnique.mockResolvedValue({ 
      id: '123', 
      password_hash: await hashPassword('password123'),
      stato_account: 'DA_VERIFICARE'
    });
    
    await expect(auth.login('test@email.com', 'password123')).rejects.toThrow('Account non verificato');
  });

  it('Login fallisce per account sospeso', async () => {
    prisma.utente.findUnique.mockResolvedValue({ 
      id: '123', 
      password_hash: await hashPassword('password123'),
      stato_account: 'SOSPESO'
    });
    
    await expect(auth.login('test@email.com', 'password123')).rejects.toThrow('Account sospeso');
  });

  it('Verifica email fallisce se token scaduto', async () => {
    prisma.tokenAccount.findUnique.mockResolvedValue({
      id: 'tok1',
      tipo: 'VERIFICA_EMAIL',
      scade_il: new Date(Date.now() - 10000) // scaduto 10 sec fa
    });
    
    await expect(auth.verificaEmail('tokenchiaro')).rejects.toThrow('Token scaduto');
  });

  it('Verifica email fallisce se token già usato', async () => {
    prisma.tokenAccount.findUnique.mockResolvedValue({
      id: 'tok1',
      tipo: 'VERIFICA_EMAIL',
      usato_il: new Date(),
      scade_il: new Date(Date.now() + 10000)
    });
    
    await expect(auth.verificaEmail('tokenchiaro')).rejects.toThrow('Token già utilizzato');
  });

  it('Sospensione annulla dinamicamente la validità della sessione', async () => {
    // Il db restituisce una sessione attiva ma l'utente collegato è SOSPESO
    prisma.sessione.findFirst.mockResolvedValue({
      id: 'sess1',
      utente: { stato_account: 'SOSPESO' }
    });
    
    const utenteSession = await auth.getSessionUtente('tokenchiaro');
    expect(utenteSession).toBeNull(); // sessione scartata
  });

  it('Reset password disconnette le sessioni esistenti', async () => {
    prisma.tokenAccount.findUnique.mockResolvedValue({
      id: 'tok1',
      tipo: 'RESET_PASSWORD',
      utente_id: 'u1',
      scade_il: new Date(Date.now() + 10000)
    });
    
    await auth.eseguiResetPassword('tokenchiaro', 'nuovapass');
    
    expect(prisma.sessione.updateMany).toHaveBeenCalledWith({
      where: { utente_id: 'u1', revocata_il: null },
      data: { revocata_il: expect.any(Date) }
    });
  });

  it('Logout revoca correttamente il token di sessione', async () => {
    await auth.logout('tokenchiaro');
    const expectedHash = hashToken('tokenchiaro');
    
    expect(prisma.sessione.updateMany).toHaveBeenCalledWith({
      where: { token_hash: expectedHash, revocata_il: null },
      data: { revocata_il: expect.any(Date) }
    });
  });

  // --- Test di Regressione Aggiuntivi richiesti ---
  it('Regressione: un account sospeso non può bypassare il blocco verificandosi con un token vecchio', async () => {
    prisma.tokenAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.tokenAccount.findUnique.mockResolvedValue({
      id: 'tok1',
      tipo: 'VERIFICA_EMAIL',
      utente_id: 'u1'
    });
    // Se update procede, l'utente è aggiornato a verificato_il = NOW()
    await auth.verificaEmail('tokenvecchio');

    // Assicuriamoci che l'update dell'utente modifichi SOLO verificato_il e NON stato_account
    expect(prisma.utente.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { verificato_il: expect.any(Date) } // stato_account non viene alterato!
    });
  });

  it('Regressione: doppio consumo dello stesso token fallisce atomico', async () => {
    // Il db restituisce count: 0 al secondo update
    prisma.tokenAccount.updateMany.mockResolvedValue({ count: 0 });
    
    await expect(auth.verificaEmail('tokenusato'))
      .rejects.toThrow('Token non valido, scaduto o già utilizzato');
  });
});
