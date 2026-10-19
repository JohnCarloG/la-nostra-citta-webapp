/**
 * Modulo di trasporto email per la piattaforma civica "La Nostra Città, Il Nostro Futuro".
 * 
 * Supporta:
 * - Trasporto SMTP reale per produzione e ambiente applicativo, configurabile via variabili d'ambiente.
 * - Trasporto mock isolato in-memory esclusivamente per suite di test automatici (NODE_ENV === 'test' o VITEST).
 * - Distinzione rigorosa tra accettazione del provider SMTP e ricezione effettiva.
 * - Protezione dei token: nessun token salvato in file o mailbox di sviluppo al di fuori dell'ambiente di test.
 * - Risoluzione degli URL tramite APP_URL configurato (evitando localhost su dispositivi esterni).
 */

import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
  token?: string;
  link?: string;
  timestamp: Date;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  accepted: boolean;
  response?: string;
  error?: string;
}

export interface IEmailTransport {
  sendEmail(to: string, subject: string, body: string, token?: string, html?: string): Promise<EmailSendResult>;
}

/**
 * Converte esplicitamente la variabile d'ambiente SMTP_SECURE in booleano.
 * Previene tassativamente che la stringa "false" sia interpretata come truthy.
 */
export function parseSmtpSecure(value: string | undefined, port: number): boolean {
  if (value !== undefined && value.trim().length > 0) {
    const lower = value.trim().toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
  }
  return port === 465;
}

/**
 * Trasporto isolato per test automatici (Vitest)
 */
export class TestMockEmailTransport implements IEmailTransport {
  private sentMessages: EmailMessage[] = [];

  async sendEmail(to: string, subject: string, body: string, token?: string, html?: string): Promise<EmailSendResult> {
    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    let link: string | undefined = undefined;

    if (token) {
      if (subject.toLowerCase().includes('verifica')) {
        link = `${baseUrl}/verify?token=${encodeURIComponent(token)}`;
      } else if (subject.toLowerCase().includes('reset')) {
        link = `${baseUrl}/reset-password/confirm?token=${encodeURIComponent(token)}`;
      }
    }

    const msg: EmailMessage = {
      to,
      subject,
      body,
      html,
      token,
      link,
      timestamp: new Date()
    };
    this.sentMessages.push(msg);

    // Persistenza per test runner se necessario
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const mailboxPath = path.resolve(process.cwd(), '.test-mailbox.json');
        fs.writeFileSync(mailboxPath, JSON.stringify(this.sentMessages, null, 2), 'utf8');
      } catch {
        // Ignora
      }
    }

    console.log(`[TEST EMAIL TRANSPORT] To: ${to} | Subject: ${subject} | Token: ${token ? '[TOKEN_REGISTERED]' : 'none'}`);
    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      accepted: true,
      response: '250 Mock email accepted in-memory'
    };
  }

  getMessages(): EmailMessage[] {
    return [...this.sentMessages];
  }

  getLatestMessageFor(to: string): EmailMessage | undefined {
    return this.sentMessages.filter(m => m.to.toLowerCase() === to.toLowerCase()).pop();
  }

  getLatestTokenFor(to: string): string | undefined {
    const msg = this.getLatestMessageFor(to);
    return msg?.token;
  }

  clear(): void {
    this.sentMessages = [];
  }
}

/**
 * Trasporto SMTP Reale per runtime applicativo
 */
export class SmtpEmailTransport implements IEmailTransport {
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
  }

  getTransporter(): Transporter {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const secure = parseSmtpSecure(process.env.SMTP_SECURE, port);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (!host) {
        throw new Error('Configurazione SMTP incompleta: variabile SMTP_HOST mancante.');
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        // Rigorosa verifica dei certificati TLS senza bypass
        tls: {
          rejectUnauthorized: true,
        },
      });
    }
    return this.transporter;
  }

  async verifyConnection(): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Configurazione SMTP incompleta: definire SMTP_HOST e SMTP_PORT' };
    }
    try {
      const transporter = this.getTransporter();
      const res = await transporter.verify();
      return { ok: true, response: typeof res === 'string' ? res : '250 Server pronto per l\'accettazione messaggi' };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendEmail(to: string, subject: string, body: string, token?: string, html?: string): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      const err = 'Configurazione SMTP incompleta: definire SMTP_HOST, SMTP_PORT (e opzionalmente SMTP_USER, SMTP_PASS, EMAIL_FROM, APP_URL).';
      console.warn(`[SMTP TRANSPORT WARN] ${err}`);
      return {
        success: false,
        accepted: false,
        error: err
      };
    }

    const from = process.env.EMAIL_FROM || 'La Nostra Città <noreply@lanostracitta.it>';
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    let link: string | undefined = undefined;

    if (token) {
      if (subject.toLowerCase().includes('verifica')) {
        link = `${baseUrl}/verify?token=${encodeURIComponent(token)}`;
      } else if (subject.toLowerCase().includes('reset')) {
        link = `${baseUrl}/reset-password/confirm?token=${encodeURIComponent(token)}`;
      }
    }

    const fullBody = link ? `${body}\n\nPer confermare, visita il seguente link sicuro:\n${link}` : body;
    const fullHtml = html || (link ? `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0b3b60; margin-top: 0;">La Nostra Città, Il Nostro Futuro</h2>
        <p style="font-size: 15px; color: #1e293b; line-height: 1.5;">${body.replace(/\n/g, '<br/>')}</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${link}" style="background-color: #005a9c; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Conferma e attiva account</a>
        </div>
        <p style="font-size: 12px; color: #64748b; line-height: 1.4;">Se non hai richiesto tu questa attivazione o se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:<br/><a href="${link}" style="color: #005a9c;">${link}</a></p>
      </div>
    ` : undefined);

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text: fullBody,
        html: fullHtml
      });

      const wasAccepted = Array.isArray(info.accepted) && info.accepted.length > 0;
      console.log(`[SMTP TRANSPORT OK] To: ${to} | ID: ${info.messageId} | Accepted: ${wasAccepted}`);

      return {
        success: true,
        messageId: info.messageId,
        accepted: wasAccepted,
        response: info.response
      };
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error(`[SMTP TRANSPORT ERROR] Invio a ${to} fallito: ${errMsg}`);
      return {
        success: false,
        accepted: false,
        error: errMsg
      };
    }
  }
}

// Seleziona il trasporto corretto: TestMock per ambienti test / vitest, Smtp per dev e prod
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

export interface TestEmailHelper {
  getMessages(): EmailMessage[];
  getLatestMessageFor(to: string): EmailMessage | undefined;
  getLatestTokenFor(to: string): string | undefined;
  clear(): void;
}

export const emailTransport: IEmailTransport & TestEmailHelper =
  (isTestEnv ? new TestMockEmailTransport() : new SmtpEmailTransport()) as unknown as IEmailTransport & TestEmailHelper;
