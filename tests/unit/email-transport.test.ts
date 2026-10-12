import { describe, it, expect, beforeEach } from 'vitest';
import { emailTransport } from '../../src/lib/email-transport';

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

  it('Cancella la cronologia con clear()', async () => {
    await emailTransport.sendEmail('test@example.com', 'Oggetto', 'Messaggio');
    expect(emailTransport.getMessages()).toHaveLength(1);

    emailTransport.clear();
    expect(emailTransport.getMessages()).toHaveLength(0);
  });
});
