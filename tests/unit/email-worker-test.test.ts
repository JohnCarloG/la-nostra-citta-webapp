import { describe, it, expect, vi } from 'vitest';
import { executeTestEmailWorker, validateTestWorkerEnv } from '../../src/lib/email-test-worker-core';
import type { IEmailTransport } from '../../src/lib/email-transport';
import type { PrismaClient } from '@prisma/client';

describe('Worker Outbox di Collaudo Isolato (Guardie di Sicurezza e Modalità Protetta)', () => {
  const dummyJob = {
    id: 'job-uuid-1234',
    tipo_evento: 'INVIO_EMAIL',
    elaborata_il: null,
    tentativi: 0,
    payload_json: JSON.stringify({
      tipo: 'VERIFICA_EMAIL',
      to: 'operatore.autorizzato@scuola.edu.it',
      subject: 'Conferma registrazione',
      body: 'Clicca per verificare il tuo account.',
      token: 'tok-abc-xyz',
      utente_id: 'user-uuid-1'
    })
  };

  function createMockPrisma(options: {
    liveDbName?: string;
    job?: Record<string, unknown>;
    dbQueryFails?: boolean;
  }) {
    const updateSpy = vi.fn().mockResolvedValue({ id: options.job?.id || 'job-uuid-1234' });
    const findUniqueSpy = vi.fn().mockResolvedValue(options.job !== undefined ? options.job : dummyJob);
    const queryRawSpy = vi.fn().mockImplementation(async () => {
      if (options.dbQueryFails) {
        throw new Error('Connessione al database rifiutata');
      }
      return [{ current_db: options.liveDbName !== undefined ? options.liveDbName : 'la_nostra_citta_test' }];
    });

    return {
      prisma: {
        $queryRaw: queryRawSpy,
        outbox: {
          findUnique: findUniqueSpy,
          update: updateSpy
        }
      },
      spies: {
        queryRawSpy,
        findUniqueSpy,
        updateSpy
      }
    };
  }

  function createMockTransport(options?: { sendSuccess?: boolean; sendError?: string }) {
    const sendEmailSpy = vi.fn().mockResolvedValue({
      success: options?.sendSuccess ?? true,
      accepted: options?.sendSuccess ?? true,
      messageId: '<test-message-id@mail.test>',
      error: options?.sendError
    });

    const transport: IEmailTransport = {
      sendEmail: sendEmailSpy
    };

    return { transport, sendEmailSpy };
  }

  describe('1. Validazione Parametri d\'Ambiente', () => {
    it('Rifiuta l\'avvio se --job-id non è specificato', () => {
      const res = validateTestWorkerEnv({
        jobId: undefined,
        allowedRecipient: 'operatore@scuola.it',
        appUrl: 'http://localhost:3001'
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('--job-id');
    });

    it('Rifiuta l\'avvio se SMTP_TEST_ALLOWED_RECIPIENT non è definita', () => {
      const res = validateTestWorkerEnv({
        jobId: 'job-123',
        allowedRecipient: undefined,
        appUrl: 'http://localhost:3001'
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SMTP_TEST_ALLOWED_RECIPIENT');
    });

    it('Rifiuta l\'avvio se APP_URL è assente o non valido', () => {
      const resNoUrl = validateTestWorkerEnv({
        jobId: 'job-123',
        allowedRecipient: 'operatore@scuola.it',
        appUrl: ''
      });
      expect(resNoUrl.valid).toBe(false);
      expect(resNoUrl.error).toContain('APP_URL');

      const resInvalidProto = validateTestWorkerEnv({
        jobId: 'job-123',
        allowedRecipient: 'operatore@scuola.it',
        appUrl: 'ftp://localhost:3001'
      });
      expect(resInvalidProto.valid).toBe(false);
      expect(resInvalidProto.error).toContain('HTTP/HTTPS');
    });

    it('Accetta parametri completi e corretti', () => {
      const res = validateTestWorkerEnv({
        jobId: 'job-123',
        allowedRecipient: 'operatore@scuola.it',
        appUrl: 'http://localhost:3001'
      });
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe('2. Guardia Live del Database', () => {
    it('Interrompe immediatamente se il database live interrogato non è la_nostra_citta_test', async () => {
      const { prisma, spies } = createMockPrisma({ liveDbName: 'defaultdb' });
      const { transport, sendEmailSpy } = createMockTransport();

      const result = await executeTestEmailWorker(prisma as unknown as PrismaClient, transport, {
        jobId: 'job-uuid-1234',
        send: false,
        allowedRecipient: 'operatore.autorizzato@scuola.edu.it',
        appUrl: 'http://localhost:3001'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SICUREZZA VIOLATA: Il database live \'defaultdb\' non corrisponde a quello autorizzato');
      expect(result.emailSent).toBe(false);
      expect(result.outboxUpdated).toBe(false);
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(spies.updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Protezione Destinatario Autorizzato', () => {
    it('Blocca categoricamente l\'invio se il destinatario del job non coincide con SMTP_TEST_ALLOWED_RECIPIENT', async () => {
      const jobDiffRecipient = {
        ...dummyJob,
        payload_json: JSON.stringify({
          tipo: 'VERIFICA_EMAIL',
          to: 'utente.estraneo@altrodominio.org',
          subject: 'Verifica',
          body: 'Test',
          token: 'tok-123',
          utente_id: 'user-2'
        })
      };

      const { prisma, spies } = createMockPrisma({ job: jobDiffRecipient });
      const { transport, sendEmailSpy } = createMockTransport();

      const result = await executeTestEmailWorker(prisma as unknown as PrismaClient, transport, {
        jobId: 'job-uuid-1234',
        send: true,
        allowedRecipient: 'operatore.autorizzato@scuola.edu.it',
        appUrl: 'http://localhost:3001'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SICUREZZA VIOLATA: Destinatario del job \'utente.estraneo@altrodominio.org\' non coincide con l\'indirizzo autorizzato');
      expect(result.emailSent).toBe(false);
      expect(result.outboxUpdated).toBe(false);
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(spies.updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. Modalità Senza --send (Dry-Run Verificativo)', () => {
    it('Valida le condizioni senza invocare il transport SMTP e senza aggiornare l\'Outbox', async () => {
      const { prisma, spies } = createMockPrisma({ liveDbName: 'la_nostra_citta_test' });
      const { transport, sendEmailSpy } = createMockTransport();

      const result = await executeTestEmailWorker(prisma as unknown as PrismaClient, transport, {
        jobId: 'job-uuid-1234',
        send: false, // SENZA --send
        allowedRecipient: 'operatore.autorizzato@scuola.edu.it',
        appUrl: 'http://localhost:3001'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('DRY_RUN_VERIFICATION');
      expect(result.emailSent).toBe(false);
      expect(result.outboxUpdated).toBe(false);
      expect(result.recipient).toBe('operatore.autorizzato@scuola.edu.it');

      // Verifica fondamentale: nessun invio e nessuna modifica DB
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(spies.updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('5. Modalità Con --send (Invio Reale Autorizzato)', () => {
    it('Invia l\'email e aggiorna l\'Outbox se tutti i controlli hanno esito positivo', async () => {
      const { prisma, spies } = createMockPrisma({ liveDbName: 'la_nostra_citta_test' });
      const { transport, sendEmailSpy } = createMockTransport({ sendSuccess: true });

      const result = await executeTestEmailWorker(prisma as unknown as PrismaClient, transport, {
        jobId: 'job-uuid-1234',
        send: true, // CON --send esplicito
        allowedRecipient: 'operatore.autorizzato@scuola.edu.it',
        appUrl: 'http://localhost:3001'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('REAL_SEND');
      expect(result.emailSent).toBe(true);
      expect(result.outboxUpdated).toBe(true);

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        'operatore.autorizzato@scuola.edu.it',
        'Conferma registrazione',
        'Clicca per verificare il tuo account.',
        'tok-abc-xyz'
      );
      expect(spies.updateSpy).toHaveBeenCalledTimes(1);
      expect(spies.updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-uuid-1234' },
          data: expect.objectContaining({
            elaborata_il: expect.any(Date),
            prossimo_tentativo_il: null
          })
        })
      );
    });
  });
});
