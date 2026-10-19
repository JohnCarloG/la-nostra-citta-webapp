import nodemailer from 'nodemailer';
import { parseSmtpSecure } from '../src/lib/email-transport';

// Sandbox hosts not delivering to real inboxes
const SANDBOX_HOSTS = [
  'mailtrap.io',
  'ethereal.email',
  'mailinator.com',
  'mailhog',
  'smtp4dev',
  'inbucket',
  'localhost',
  '127.0.0.1'
];

async function main() {
  const recipient = process.argv[2] || process.env.SMTP_CHECK_TO;

  console.log('====================================================');
  console.log(' DIAGNOSTICA CONFIGURAZIONE SMTP - LA NOSTRA CITTÀ');
  console.log('====================================================');

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = parseSmtpSecure(process.env.SMTP_SECURE, port);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || 'La Nostra Città <noreply@lanostracitta.it>';

  console.log('1. TRASPORTO EFFETTIVO:');
  console.log(`   - Driver: Nodemailer SmtpTransport`);
  console.log(`   - Host: ${host || '(NON CONFIGURATO)'}`);
  console.log(`   - Porta: ${port}`);
  console.log(`   - TLS/Secure: ${secure} (valore interpretato da SMTP_SECURE="${process.env.SMTP_SECURE}")`);
  console.log(`   - Autenticazione utente: ${user ? `${user.slice(0, 3)}***@${user.split('@')[1] || 'domain'}` : '(NON CONFIGURATO)'}`);
  console.log(`   - Autenticazione password: ${pass ? 'Configurata (segreto oscurato)' : '(NON CONFIGURATO)'}`);
  console.log(`   - Mittente configurato: ${from}`);

  // Controllo Sandbox
  const isSandbox = SANDBOX_HOSTS.some(sh => (host || '').toLowerCase().includes(sh));
  if (isSandbox) {
    console.log(`   - Tipologia provider: ATTENZIONE -> Provider SANDBOX / simulato (${host}). I messaggi non vengono recapitati a caselle reali.`);
  } else {
    console.log(`   - Tipologia provider: Provider SMTP REALE (${host}). Recapito effettivo verso caselle reali abilitato.`);
  }

  if (!host || !port) {
    console.error('\n[ERRORE] Configurazione SMTP incompleta: definire SMTP_HOST e SMTP_PORT.');
    process.exit(1);
  }

  console.log('\n2. VERIFICA CONNESSIONE (transporter.verify):');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: true, // Rispetto rigoroso verifica certificati
    },
  });

  try {
    const verifyRes = await transporter.verify();
    console.log('   - Esito verify: SUCCESSO (Server SMTP raggiungibile e credenziali accettate)');
    console.log(`   - Risposta server: ${typeof verifyRes === 'string' ? verifyRes : '250 Server pronto'}`);
  } catch (err: unknown) {
    const error = err as { code?: string; responseCode?: number; message?: string };
    console.error('   - Esito verify: FALLITO');
    console.error(`   - Codice errore: ${error.code || error.responseCode || 'N/A'}`);
    console.error(`   - Messaggio sanitizzato: ${error.message}`);
    process.exit(1);
  }

  if (!recipient) {
    console.log('\nNessun destinatario specificato per l\'invio di prova.');
    console.log('Uso: npm run smtp:check -- <email-destinatario>');
    return;
  }

  // Sanitizzazione indirizzo destinatario per log
  const recParts = recipient.split('@');
  const sanitizedRec = recParts.length === 2 ? `${recParts[0].slice(0, 3)}***@${recParts[1]}` : recipient;

  console.log(`\n3. INVIO MESSAGGIO DIAGNOSTICO CONTROLLATO (a ${sanitizedRec}):`);
  console.log('   - Nota: Il messaggio inviato NON contiene token di account o dati sensibili.');

  try {
    const info = await transporter.sendMail({
      from,
      to: recipient,
      subject: '[Diagnostica] Verifica configurazione invio email - La Nostra Città',
      text: `Questo è un messaggio diagnostico inviato dalla piattaforma civica "La Nostra Città" per confermare la corretta configurazione e raggiungibilità del server SMTP.\n\nData e ora invio: ${new Date().toISOString()}\nNessun account, token o credenziale è associato a questo messaggio.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #d1d5db; border-radius: 8px; max-width: 550px;">
          <h2 style="color: #064e3b; margin-top: 0;">Diagnostica Piattaforma Civica "La Nostra Città"</h2>
          <p style="font-size: 14px; color: #1f2937;">Questo messaggio conferma che la configurazione del trasporto SMTP reale è attiva e funzionante.</p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-size: 13px; color: #166534;">
            <strong>Esito:</strong> Connessione e autenticazione SMTP verificate con successo.
          </div>
          <p style="font-size: 11px; color: #6b7280; margin-top: 16px;">Messaggio diagnostico generato il ${new Date().toLocaleString('it-IT')}. Nessun account o token è incluso in questa comunicazione.</p>
        </div>
      `
    });

    console.log('   - Esito invio: TRASMESSO AL PROVIDER');
    console.log(`   - MessageId: ${info.messageId}`);
    console.log(`   - Destinatari accettati: ${JSON.stringify(info.accepted)}`);
    console.log(`   - Destinatari rifiutati: ${JSON.stringify(info.rejected)}`);
    console.log(`   - Risposta SMTP: ${info.response || '250 OK'}`);
  } catch (err: unknown) {
    const error = err as { code?: string; responseCode?: number; response?: string; message?: string };
    console.error('   - Esito invio: FALLITO');
    console.error(`   - Codice errore SMTP: ${error.code || error.responseCode || 'N/A'}`);
    console.error(`   - Risposta provider: ${error.response || 'Nessuna'}`);
    console.error(`   - Dettaglio errore: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
