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
  link?: string;
  timestamp: Date;
}

class DevelopmentEmailTransport {
  private sentMessages: EmailMessage[] = [];

  async sendEmail(to: string, subject: string, body: string, token?: string): Promise<void> {
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
      token,
      link,
      timestamp: new Date()
    };
    this.sentMessages.push(msg);
    
    // Persistenza locale per consultazione sicura durante i test (esclusa da git)
    try {
      const fs = await import('fs');
      const path = await import('path');
      const mailboxPath = path.resolve(process.cwd(), '.test-mailbox.json');
      fs.writeFileSync(mailboxPath, JSON.stringify(this.sentMessages, null, 2), 'utf8');
    } catch {
      // Ignora errori di filesystem
    }

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
