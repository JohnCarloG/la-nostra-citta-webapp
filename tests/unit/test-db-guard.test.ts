import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAndVerifyDatabaseInfo, cleanTestDatabase } from '../helpers/test-db';
import { maskDatabaseUrl } from '../../src/lib/test-env';
import { PrismaClient } from '@prisma/client';

describe('Guardia di Sicurezza Database di Test (test-db.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Blocca l\'esecuzione se AUTHORIZED_TEST_HOST non è configurato', () => {
    delete process.env.AUTHORIZED_TEST_HOST;
    process.env.AUTHORIZED_TEST_PORT = '3306';

    const testUrl = 'mysql://user:pass@test-host:3306/la_nostra_citta_test';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      'SICUREZZA VIOLATA: Variabile d\'ambiente AUTHORIZED_TEST_HOST obbligatoria non definita'
    );
  });

  it('Blocca l\'esecuzione se AUTHORIZED_TEST_PORT non è configurato', () => {
    process.env.AUTHORIZED_TEST_HOST = 'test-host';
    delete process.env.AUTHORIZED_TEST_PORT;

    const testUrl = 'mysql://user:pass@test-host:3306/la_nostra_citta_test';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      'SICUREZZA VIOLATA: Variabile d\'ambiente AUTHORIZED_TEST_PORT obbligatoria non definita'
    );
  });

  it('Blocca l\'esecuzione se l\'host nell\'URL non coincide con AUTHORIZED_TEST_HOST', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    const testUrl = 'mysql://user:pass@rogue-host.com:11582/la_nostra_citta_test';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      "SICUREZZA VIOLATA: L'host specificato 'rogue-host.com' non corrisponde all'host autorizzato"
    );
  });

  it('Blocca l\'esecuzione se la porta nell\'URL non coincide con AUTHORIZED_TEST_PORT', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    const testUrl = 'mysql://user:pass@authorized-host.aivencloud.com:3306/la_nostra_citta_test';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      "SICUREZZA VIOLATA: La porta specificata '3306' non corrisponde alla porta autorizzata '11582'"
    );
  });

  it('Blocca l\'esecuzione se il database target è diverso da la_nostra_citta_test (es. defaultdb)', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    const testUrl = 'mysql://user:pass@authorized-host.aivencloud.com:11582/defaultdb';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      "SICUREZZA VIOLATA: Il database selezionato è 'defaultdb'"
    );
  });

  it('Blocca configurazioni TLS con sslaccept non strict (es. bypass certificati)', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    const testUrl = 'mysql://user:pass@authorized-host.aivencloud.com:11582/la_nostra_citta_test?sslaccept=accept_invalid_certs';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      "SICUREZZA VIOLATA: Modalità TLS 'sslaccept=accept_invalid_certs' non consentita"
    );
  });

  it('Blocca configurazioni con percorso del certificato CA inesistente', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    const testUrl = 'mysql://user:pass@authorized-host.aivencloud.com:11582/la_nostra_citta_test?sslcert=/percorso/inesistente/ca.pem';
    expect(() => getAndVerifyDatabaseInfo(testUrl)).toThrow(
      'Configurazione TLS non valida: Il certificato CA specificato'
    );
  });

  it('cleanTestDatabase: blocca la pulizia se il controllo live SELECT DATABASE() non restituisce la_nostra_citta_test', async () => {
    process.env.AUTHORIZED_TEST_HOST = 'test-host';
    process.env.AUTHORIZED_TEST_PORT = '3306';
    process.env.DATABASE_URL = 'mysql://user:pass@test-host:3306/la_nostra_citta_test';

    // Mock PrismaClient con queryRaw live che simula un server collegato a defaultdb
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ current_db: 'defaultdb', server_port: 3306 }]),
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(cleanTestDatabase(mockPrisma)).rejects.toThrow(
      "SICUREZZA VIOLATA: Il database attivo sulla connessione è 'defaultdb', atteso 'la_nostra_citta_test'"
    );

    // Verifica che nessuna transazione di cancellazione sia mai stata avviata
    expect((mockPrisma as unknown as Record<string, unknown>).$transaction).not.toHaveBeenCalled();
  });

  it('Risolve il percorso della CA in modo coerente sia esso relativo o assoluto', () => {
    process.env.AUTHORIZED_TEST_HOST = 'authorized-host.aivencloud.com';
    process.env.AUTHORIZED_TEST_PORT = '11582';

    // File package.json esiste sicuramente nella root di progetto
    const testUrl = 'mysql://user:pass@authorized-host.aivencloud.com:11582/la_nostra_citta_test?sslcert=package.json';
    const info = getAndVerifyDatabaseInfo(testUrl);
    expect(info.sslCertPath).toBeDefined();
    expect(info.sslCertPath?.endsWith('package.json')).toBe(true);
  });

  it('Maschera le password nell\'URL per prevenire leak di segreti nei log', () => {
    const rawUrl = 'mysql://avnadmin:SegretoSuperSicuro123!@mysql-test.aivencloud.com:11582/la_nostra_citta_test?sslaccept=strict';
    const masked = maskDatabaseUrl(rawUrl);

    expect(masked).not.toContain('SegretoSuperSicuro123!');
    expect(masked).toBe('mysql://avnadmin:***@mysql-test.aivencloud.com:11582/la_nostra_citta_test?sslaccept=strict');
  });
});
