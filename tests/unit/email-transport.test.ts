import { describe, it, expect, beforeEach } from 'vitest';
import { emailTransport, parseSmtpSecure } from '../../src/lib/email-transport';

describe('DevelopmentEmailTransport (In-Memory)', () => {
  beforeEach(() => {
    emailTransport.clear();
  });

  it('Registra le email inviate e ne preserva i messaggi', async () => {
    await emailTransport.sendEmail('cittadino@example.com', 'Verifica', 'Corpo email', 'token123');
    const messages = emailTransport.getMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('cittadino@example.com');
    expect(messages[0].token).toBe('token123');
  });

  it('Recupera l\'ultimo token per indirizzo email con confronto case-insensitive', async () => {
    await emailTransport.sendEmail('mario.rossi@example.com', 'Token 1', 'Testo 1', 'first-token');
    await emailTransport.sendEmail('mario.rossi@example.com', 'Token 2', 'Testo 2', 'second-token');

    // Recupero con casing differente
    const latestToken = emailTransport.getLatestTokenFor('MARIO.ROSSI@example.com');
    expect(latestToken).toBe('second-token');
  });

  it('Ritorna undefined per destinatari senza messaggi inviati', () => {
    const token = emailTransport.getLatestTokenFor('inesistente@example.com');
    expect(token).toBeUndefined();
  });

  it('Genera i link corretti per verifica e reset su localhost:3001', async () => {
    await emailTransport.sendEmail('mario@example.com', 'Verifica Account', 'Testo', 'tok-ver-123');
    await emailTransport.sendEmail('mario@example.com', 'Reset Password', 'Testo', 'tok-res-456');

    const msgVerifica = emailTransport.getMessages()[0];
    const msgReset = emailTransport.getMessages()[1];

    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    expect(msgVerifica.link).toBe(`${baseUrl}/verify?token=tok-ver-123`);
    expect(msgReset.link).toBe(`${baseUrl}/reset-password/confirm?token=tok-res-456`);
  });

  it('Interpreta SMTP_SECURE come booleano esplicito ("false" non diventa true su porta 465)', () => {
    expect(parseSmtpSecure('false', 465)).toBe(false);
    expect(parseSmtpSecure('0', 465)).toBe(false);
    expect(parseSmtpSecure('no', 465)).toBe(false);
    expect(parseSmtpSecure('true', 587)).toBe(true);
    expect(parseSmtpSecure('1', 587)).toBe(true);
    expect(parseSmtpSecure(undefined, 465)).toBe(true);
    expect(parseSmtpSecure(undefined, 587)).toBe(false);
  });
});
