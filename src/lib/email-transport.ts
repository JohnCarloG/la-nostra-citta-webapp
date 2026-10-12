/**
 * Trasporto email per sviluppo e test controllato.
 * Mantiene uno storico in-memory dei messaggi inviati e consente
 * la consultazione dei token nei test senza esporli in log non protetti.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  token?: string;
  timestamp: Date;
}

class DevelopmentEmailTransport {
  private sentMessages: EmailMessage[] = [];

  async sendEmail(to: string, subject: string, body: string, token?: string): Promise<void> {
    const msg: EmailMessage = {
      to,
      subject,
      body,
      token,
      timestamp: new Date()
    };
    this.sentMessages.push(msg);
    // Logging sicuro per console
    console.log(`[DEV EMAIL TRANSPORT] To: ${to} | Subject: ${subject} | Token: ${token ? '[TOKEN_REGISTERED]' : 'none'}`);
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

export const emailTransport = new DevelopmentEmailTransport();
