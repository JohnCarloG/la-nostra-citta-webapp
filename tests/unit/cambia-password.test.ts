import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  cambiaPasswordAutenticato, 
  richiediResetPassword, 
  eseguiResetPassword,
  AuthDomainError
} from '../../src/lib/domain/auth';
import { cambiaPasswordAction, confirmPasswordResetAction } from '../../src/actions/auth';
import { hashPassword, hashToken, verifyPassword } from '../../src/lib/security';
import { authRateLimiter } from '../../src/lib/rate-limiter';
import { PrismaClient } from '@prisma/client';

// Mock cookies di Next.js
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock manuale di @prisma/client
vi.mock('@prisma/client', () => {
  const mPrisma = {
    utente: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tokenAccount: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    sessione: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    quartiere: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    outbox: {
      create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(mPrisma)),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient() as any;

describe('RF14 / Sicurezza: Cambio Password per Utente Autenticato e Separazione da Password Dimenticata', () => {
  const utenteId = 'usr-collaudo-100';
  const vecchiaPassword = 'VecchiaPassword123!';
  const nuovaPassword = 'NuovaPassword456!';
  let vecchioHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    authRateLimiter.clearAll();
    vecchioHash = await hashPassword(vecchiaPassword);
  });

  it('1. Richiesta anonima respinta: utente non autenticato genera eccezione', async () => {
    await expect(
      cambiaPasswordAutenticato('', vecchiaPassword, nuovaPassword, nuovaPassword)
    ).rejects.toThrow('Utente non autenticato');

    await expect(
      cambiaPasswordAutenticato('   ', vecchiaPassword, nuovaPassword, nuovaPassword)
    ).rejects.toThrow('Utente non autenticato');

    expect(prisma.utente.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
  });

  it('2. Password attuale errata: respinta senza revoca delle sessioni né modifica dell’hash', async () => {
    prisma.utente.findUnique.mockResolvedValue({
      id: utenteId,
      password_hash: vecchioHash,
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
    });

    await expect(
      cambiaPasswordAutenticato(utenteId, 'PasswordSbagliata123!', nuovaPassword, nuovaPassword)
    ).rejects.toThrow('Password attuale non corretta');

    // Verifica fondamentale: nessun update eseguito su utente, sessioni o token
    expect(prisma.utente.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
    expect(prisma.tokenAccount.updateMany).not.toHaveBeenCalled();
  });

  it('3. Nuova password e conferma non coincidenti respinte', async () => {
    await expect(
      cambiaPasswordAutenticato(utenteId, vecchiaPassword, nuovaPassword, 'PasswordDiversa999!')
    ).rejects.toThrow('La nuova password e la conferma non coincidono');

    expect(prisma.utente.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
  });

  it('4. Nuova password non conforme alla policy (< 8 caratteri) respinta', async () => {
    await expect(
      cambiaPasswordAutenticato(utenteId, vecchiaPassword, 'Corto1!', 'Corto1!')
    ).rejects.toThrow('La nuova password deve contenere almeno 8 caratteri');

    expect(prisma.utente.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
  });

  it('5. Nuova password identica all’attuale respinta', async () => {
    prisma.utente.findUnique.mockResolvedValue({
      id: utenteId,
      password_hash: vecchioHash,
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
    });

    await expect(
      cambiaPasswordAutenticato(utenteId, vecchiaPassword, vecchiaPassword, vecchiaPassword)
    ).rejects.toThrow('La nuova password deve essere diversa da quella attuale');

    expect(prisma.utente.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
  });

  it('6. Cambio password valido eseguito con successo, con revoca di tutte le sessioni e invalidazione dei vecchi token di reset', async () => {
    prisma.utente.findUnique.mockResolvedValue({
      id: utenteId,
      password_hash: vecchioHash,
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
    });
    prisma.utente.updateMany.mockResolvedValue({ count: 1 });
    prisma.sessione.updateMany.mockResolvedValue({ count: 2 });
    prisma.tokenAccount.updateMany.mockResolvedValue({ count: 1 });

    const result = await cambiaPasswordAutenticato(utenteId, vecchiaPassword, nuovaPassword, nuovaPassword);

    expect(result).toEqual({ success: true });

    // 1. Password aggiornata con controllo di concorrenza sull'hash attuale
    expect(prisma.utente.updateMany).toHaveBeenCalledWith({
      where: {
        id: utenteId,
        password_hash: vecchioHash,
        stato_account: 'ATTIVO',
        verificato_il: { not: null },
      },
      data: { password_hash: expect.any(String) },
    });
    const updatedHash = prisma.utente.updateMany.mock.calls[0][0].data.password_hash;
    expect(updatedHash).not.toBe(vecchioHash);

    // 2. Tutte le sessioni attive dell'utente revocate nella transazione
    expect(prisma.sessione.updateMany).toHaveBeenCalledWith({
      where: { utente_id: utenteId, revocata_il: null },
      data: { revocata_il: expect.any(Date) },
    });

    // 3. Tutti i token di reset password ancora pendenti invalidati
    expect(prisma.tokenAccount.updateMany).toHaveBeenCalledWith({
      where: { utente_id: utenteId, tipo: 'RESET_PASSWORD', usato_il: null },
      data: { usato_il: expect.any(Date) },
    });
  });

  it('7. Concorrenza: se l’hash è cambiato nel frattempo (count=0), nessuna revoca aggiuntiva e nessun successo', async () => {
    prisma.utente.findUnique.mockResolvedValue({
      id: utenteId,
      password_hash: vecchioHash,
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
    });
    // Simula che un'altra transazione ha già modificato l'hash nel frattempo
    prisma.utente.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      cambiaPasswordAutenticato(utenteId, vecchiaPassword, nuovaPassword, nuovaPassword)
    ).rejects.toThrow(AuthDomainError);

    await expect(
      cambiaPasswordAutenticato(utenteId, vecchiaPassword, nuovaPassword, nuovaPassword)
    ).rejects.toThrow('La password o lo stato dell\'account sono stati modificati nel frattempo. Riprova.');

    // Condizione fondamentale: revoche NON eseguite se count !== 1
    expect(prisma.sessione.updateMany).not.toHaveBeenCalled();
    expect(prisma.tokenAccount.updateMany).not.toHaveBeenCalled();
  });

  it('8. Separazione percorsi: il recupero "Password dimenticata" continua a funzionare senza richiedere la password attuale', async () => {
    // Richiesta reset via email (richiede solo email, non richiede password attuale)
    prisma.utente.findUnique.mockResolvedValue({
      id: utenteId,
      email_normalizzata: 'mario.rossi@example.com',
      nome: 'Mario',
      stato_account: 'ATTIVO',
    });
    prisma.tokenAccount.create.mockResolvedValue({ id: 'tok-1' });

    await richiediResetPassword('mario.rossi@example.com');
    expect(prisma.tokenAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          utente_id: utenteId,
          tipo: 'RESET_PASSWORD',
        }),
      })
    );

    // Esecuzione reset password da token email (richiede solo token e nuova password, non la vecchia)
    const tokenChiaro = 'token-reset-monouso-valido';
    const hash = hashToken(tokenChiaro);
    prisma.tokenAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.tokenAccount.findUnique.mockResolvedValue({
      token_hash: hash,
      utente_id: utenteId,
    });
    prisma.utente.update.mockResolvedValue({ id: utenteId });
    prisma.sessione.updateMany.mockResolvedValue({ count: 1 });

    const resetSuccess = await eseguiResetPassword(tokenChiaro, 'PasswordDopoReset123!');
    expect(resetSuccess).toBe(true);
    expect(prisma.utente.update).toHaveBeenCalledWith({
      where: { id: utenteId },
      data: { password_hash: expect.any(String) },
    });
  });

  describe('Server Action cambiaPasswordAction', () => {
    it('Respinge richiesta anonima o sessione scaduta', async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const formData = new FormData();
      formData.set('passwordAttuale', vecchiaPassword);
      formData.set('nuovaPassword', nuovaPassword);
      formData.set('confermaPassword', nuovaPassword);

      const res = await cambiaPasswordAction(formData);
      expect(res).toEqual({
        error: "Sessione non valida o scaduta. Effettua nuovamente l'accesso.",
      });
      expect(mockCookieStore.delete).not.toHaveBeenCalled();
    });

    it('Identifica l’utente unicamente dalla sessione (ignora campi arbitrari nel form)', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'session-token-legittimo' });
      prisma.sessione.findFirst.mockResolvedValue({
        utente: {
          id: 'usr-legittimo',
          nome: 'Luigi',
          cognome: 'Verdi',
          email_normalizzata: 'luigi.verdi@example.com',
          ruolo: 'CITTADINO',
          stato_account: 'ATTIVO',
          verificato_il: new Date(),
        },
      });

      prisma.utente.findUnique.mockResolvedValue({
        id: 'usr-legittimo',
        password_hash: vecchioHash,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      });
      prisma.utente.updateMany.mockResolvedValue({ count: 1 });
      prisma.sessione.updateMany.mockResolvedValue({ count: 1 });
      prisma.tokenAccount.updateMany.mockResolvedValue({ count: 0 });

      const formData = new FormData();
      formData.set('userId', 'target-vittima-999');
      formData.set('passwordAttuale', vecchiaPassword);
      formData.set('nuovaPassword', nuovaPassword);
      formData.set('confermaPassword', nuovaPassword);

      const res = await cambiaPasswordAction(formData);

      expect(res).toEqual({
        success: true,
        message: 'Password aggiornata. Accedi di nuovo.',
      });

      expect(prisma.utente.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'usr-legittimo' }) })
      );
      expect(mockCookieStore.delete).toHaveBeenCalledWith('session_token');
    });

    it('Blocca i tentativi ripetuti tramite rate limiting su authRateLimiter', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'session-token-rate-limit' });
      prisma.sessione.findFirst.mockResolvedValue({
        utente: {
          id: 'usr-rate-limit',
          nome: 'Attaccante',
          cognome: 'Brute',
          email_normalizzata: 'attaccante@example.com',
          ruolo: 'CITTADINO',
          stato_account: 'ATTIVO',
          verificato_il: new Date(),
        },
      });

      for (let i = 0; i < 5; i++) {
        authRateLimiter.check('change-password:usr-rate-limit');
      }

      const formData = new FormData();
      formData.set('passwordAttuale', 'TentativoErrato123!');
      formData.set('nuovaPassword', nuovaPassword);
      formData.set('confermaPassword', nuovaPassword);

      const res = await cambiaPasswordAction(formData);
      expect(res.error).toMatch(/Troppi tentativi di modifica password/);
      expect(prisma.utente.findUnique).not.toHaveBeenCalled();
    });

    it('Errore durante la revoca: il cookie non viene cancellato e la risposta non espone dettagli interni', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'session-token-revoca-err' });
      prisma.sessione.findFirst.mockResolvedValue({
        utente: {
          id: 'usr-err-revoca',
          nome: 'Test',
          cognome: 'Revoca',
          email_normalizzata: 'test.revoca@example.com',
          ruolo: 'CITTADINO',
          stato_account: 'ATTIVO',
          verificato_il: new Date(),
        },
      });

      prisma.utente.findUnique.mockResolvedValue({
        id: 'usr-err-revoca',
        password_hash: vecchioHash,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      });
      prisma.utente.updateMany.mockResolvedValue({ count: 1 });
      // Simula errore Prisma durante la revoca delle sessioni nella transazione
      prisma.sessione.updateMany.mockRejectedValue(
        new Error('P2024: Timed out fetching a new connection from the pool. Prisma Client query failed.')
      );

      const formData = new FormData();
      formData.set('passwordAttuale', vecchiaPassword);
      formData.set('nuovaPassword', nuovaPassword);
      formData.set('confermaPassword', nuovaPassword);

      const res = await cambiaPasswordAction(formData);

      // Risposta generica controllata senza leak di dettagli interni o stack trace
      expect(res.error).toBe(
        'Si è verificato un errore di sistema durante l\'aggiornamento della password. Riprova più tardi.'
      );
      expect(res.error).not.toContain('P2024');
      expect(res.error).not.toContain('Prisma');

      // Il cookie NON deve essere cancellato se la transazione fallisce
      expect(mockCookieStore.delete).not.toHaveBeenCalled();
    });

    it('Se il DB ha confermato il cambio e fallisce solo la rimozione del cookie, non dice che la password è invariata', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'session-token-cookie-err' });
      prisma.sessione.findFirst.mockResolvedValue({
        utente: {
          id: 'usr-cookie-err',
          nome: 'Test',
          cognome: 'Cookie',
          email_normalizzata: 'test.cookie@example.com',
          ruolo: 'CITTADINO',
          stato_account: 'ATTIVO',
          verificato_il: new Date(),
        },
      });

      prisma.utente.findUnique.mockResolvedValue({
        id: 'usr-cookie-err',
        password_hash: vecchioHash,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      });
      prisma.utente.updateMany.mockResolvedValue({ count: 1 });
      prisma.sessione.updateMany.mockResolvedValue({ count: 1 });
      prisma.tokenAccount.updateMany.mockResolvedValue({ count: 0 });

      // Simula errore imprevisto nella rimozione del cookie dopo commit DB riuscito
      mockCookieStore.delete.mockImplementationOnce(() => {
        throw new Error('Header serialization error: Cannot delete cookie');
      });

      const formData = new FormData();
      formData.set('passwordAttuale', vecchiaPassword);
      formData.set('nuovaPassword', nuovaPassword);
      formData.set('confermaPassword', nuovaPassword);

      const res = await cambiaPasswordAction(formData);

      expect(res.success).toBe(false);
      // Non deve dire che la password è rimasta invariata
      expect(res.error).toContain('Password aggiornata e sessioni revocate sul server');
      expect(res.error).toContain('non è stato possibile rimuovere il cookie locale');
    });
  });

  describe('confirmPasswordResetAction con contratto esplicito e gestione spazi', () => {
    it('Accetta FormData con i nomi del form reale e preserva password con spazi iniziali o finali (no trim)', async () => {
      const pwdConSpazi = '   PasswordConSpazi123!   ';
      const token = 'token-reset-spazi-123';
      const hash = hashToken(token);

      prisma.tokenAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.tokenAccount.findUnique.mockResolvedValue({
        token_hash: hash,
        utente_id: utenteId,
      });
      prisma.utente.update.mockResolvedValue({ id: utenteId });
      prisma.sessione.updateMany.mockResolvedValue({ count: 1 });

      const formData = new FormData();
      formData.set('token', token);
      formData.set('password', pwdConSpazi);
      formData.set('confermaPassword', pwdConSpazi);

      const res = await confirmPasswordResetAction(formData);
      expect(res).toEqual({ success: true });

      // Verifica che la password salvata abbia conservato gli spazi esatti (non trimmata)
      expect(prisma.utente.update).toHaveBeenCalledWith({
        where: { id: utenteId },
        data: { password_hash: expect.any(String) },
      });
      const savedHash = prisma.utente.update.mock.calls[0][0].data.password_hash;
      const isMatch = await verifyPassword(pwdConSpazi, savedHash);
      expect(isMatch).toBe(true);

      // Una versione trimmata NON deve corrispondere all'hash salvato
      const isTrimmedMatch = await verifyPassword(pwdConSpazi.trim(), savedHash);
      expect(isTrimmedMatch).toBe(false);
    });

    it('Respinge reset se password e confermaPassword differiscono anche solo per spazi', async () => {
      const formData = new FormData();
      formData.set('token', 'token-valido-123');
      formData.set('password', '   PasswordConSpazi123!   ');
      formData.set('confermaPassword', '  PasswordConSpazi123!   '); // Uno spazio in meno

      const res = await confirmPasswordResetAction(formData);
      expect(res).toEqual({ error: 'Le password inserite non coincidono' });
      expect(prisma.utente.update).not.toHaveBeenCalled();
    });

    it('Respinge reset se confermaPassword è mancante o vuota (nessuna conferma fabbricata)', async () => {
      const formData = new FormData();
      formData.set('token', 'token-valido-123');
      formData.set('password', 'PasswordValida123!');
      // Nessun campo confermaPassword impostato

      const res = await confirmPasswordResetAction(formData);
      expect(res).toEqual({ error: 'Tutti i campi sono obbligatori' });
      expect(prisma.utente.update).not.toHaveBeenCalled();
    });

    it('Il reset via token non richiede né utilizza mai la password attuale', async () => {
      const token = 'token-no-pwd-attuale';
      const hash = hashToken(token);

      prisma.tokenAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.tokenAccount.findUnique.mockResolvedValue({
        token_hash: hash,
        utente_id: utenteId,
      });
      prisma.utente.update.mockResolvedValue({ id: utenteId });
      prisma.sessione.updateMany.mockResolvedValue({ count: 1 });

      const formData = new FormData();
      formData.set('token', token);
      formData.set('password', 'NuovaPasswordReset123!');
      formData.set('confermaPassword', 'NuovaPasswordReset123!');
      // Non passiamo alcuna passwordAttuale

      const res = await confirmPasswordResetAction(formData);
      expect(res).toEqual({ success: true });
      // Non interroga prisma.utente.findUnique per verificare vecchie password
      expect(prisma.utente.findUnique).not.toHaveBeenCalled();
    });
  });
});
