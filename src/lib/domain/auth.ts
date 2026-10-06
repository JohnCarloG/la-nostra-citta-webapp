import { PrismaClient } from '@prisma/client';
import { generateSecureToken, hashPassword, verifyPassword, hashToken } from '../security';

const prisma = new PrismaClient();

// In un ambiente reale, questi verrebbero inviati via provider SMTP.
// Come richiesto dal vincolo, simuliamo l'invio separato.
async function mockSendEmail(to: string, subject: string, body: string) {
  // Evitiamo di loggare il token in chiaro in produzione, qui stampiamo solo per dev
  console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject} | Body: [SECRET_TOKEN_SENT]`);
}

/**
 * Normalizza l'email per evitare duplicati logici (es. test@email.com vs TEST@email.com)
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Registrazione Utente (Cittadino)
 */
export async function registraCittadino(nome: string, cognome: string, email: string, passwordInChiaro: string) {
  const emailNorm = normalizeEmail(email);

  const existing = await prisma.utente.findUnique({ where: { email_normalizzata: emailNorm } });
  if (existing) throw new Error('Email già registrata');

  const pwdHash = await hashPassword(passwordInChiaro);

  const utente = await prisma.$transaction(async (tx) => {
    const utenteDb = await tx.utente.create({
      data: {
        nome,
        cognome,
        email_normalizzata: emailNorm,
        password_hash: pwdHash,
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO', // Non sospeso. DA_VERIFICARE si deduce da verificato_il == null
      }
    });

    const { token, hash } = generateSecureToken();
    const scadenza = new Date();
    scadenza.setHours(scadenza.getHours() + 24); // Token valido 24h

    await tx.tokenAccount.create({
      data: {
        utente_id: utenteDb.id,
        tipo: 'VERIFICA_EMAIL',
        token_hash: hash,
        scade_il: scadenza
      }
    });
    
    // Restituiamo sia l'utente che il token per l'invio email FUORI transazione
    return { utente: utenteDb, clearToken: token };
  });

  // Invio email asincrono, fuori dalla transazione DB per non bloccarla
  await mockSendEmail(utente.utente.email_normalizzata, 'Verifica Account', `Il tuo token di verifica è: ${utente.clearToken}`);
  return utente.utente;
}

/**
 * Verifica Email
 */
export async function verificaEmail(tokenInChiaro: string) {
  const hash = hashToken(tokenInChiaro);
  
  return prisma.$transaction(async (tx) => {
    // Consumo atomico: cerchiamo e aggiorniamo solo se usato_il è null e scade_il > now
    const res = await tx.tokenAccount.updateMany({
      where: { 
        token_hash: hash, 
        tipo: 'VERIFICA_EMAIL',
        usato_il: null,
        scade_il: { gt: new Date() }
      },
      data: { usato_il: new Date() }
    });

    if (res.count === 0) {
      // Se 0, il token non esiste, è già usato o scaduto
      throw new Error('Token non valido, scaduto o già utilizzato');
    }

    // A questo punto il token è sicuramente stato acquisito da questa transazione
    // Recuperiamo il token per sapere a quale utente appartiene
    const record = await tx.tokenAccount.findUnique({ where: { token_hash: hash } });
    if (!record) throw new Error('Errore critico di congruenza');

    await tx.utente.update({
      where: { id: record.utente_id },
      data: { 
        // Aggiorna verificato_il SENZA sovrascrivere o annullare un'eventuale sospensione
        verificato_il: new Date()
      }
    });

    return true;
  });
}

/**
 * Login
 */
export async function login(email: string, passwordInChiaro: string) {
  const emailNorm = normalizeEmail(email);
  const utente = await prisma.utente.findUnique({ where: { email_normalizzata: emailNorm } });

  if (!utente) throw new Error('Credenziali non valide');

  const isMatch = await verifyPassword(passwordInChiaro, utente.password_hash);
  if (!isMatch) throw new Error('Credenziali non valide');

  if (utente.stato_account === 'SOSPESO') throw new Error('Account sospeso');
  if (!utente.verificato_il) throw new Error('Account non verificato');

  const { token, hash } = generateSecureToken();
  const scadenza = new Date();
  scadenza.setDate(scadenza.getDate() + 7); // Sessione 7 giorni

  const sessione = await prisma.sessione.create({
    data: {
      utente_id: utente.id,
      token_hash: hash,
      scade_il: scadenza
    }
  });

  return { utente, sessionTokenInChiaro: token };
}

/**
 * Logout
 */
export async function logout(sessionTokenInChiaro: string) {
  const hash = hashToken(sessionTokenInChiaro);
  await prisma.sessione.updateMany({
    where: { token_hash: hash, revocata_il: null },
    data: { revocata_il: new Date() }
  });
}

/**
 * Richiesta Reset Password
 */
export async function richiediResetPassword(email: string) {
  const emailNorm = normalizeEmail(email);
  const utente = await prisma.utente.findUnique({ where: { email_normalizzata: emailNorm } });
  
  // Per sicurezza, non confermiamo se l'email esiste o no all'utente
  if (!utente || utente.stato_account === 'SOSPESO') return; 

  const { token, hash } = generateSecureToken();
  const scadenza = new Date();
  scadenza.setHours(scadenza.getHours() + 1); // 1 ora

  await prisma.tokenAccount.create({
    data: {
      utente_id: utente.id,
      tipo: 'RESET_PASSWORD',
      token_hash: hash,
      scade_il: scadenza
    }
  });

  // Fuori transazione (essendo solo un insert singolo, l'await sopra va bene)
  await mockSendEmail(utente.email_normalizzata, 'Reset Password', `Il tuo token di reset è: ${token}`);
}

/**
 * Conferma Reset Password
 */
export async function eseguiResetPassword(tokenInChiaro: string, nuovaPassword: string) {
  const hash = hashToken(tokenInChiaro);
  
  return prisma.$transaction(async (tx) => {
    // Consumo atomico del token
    const res = await tx.tokenAccount.updateMany({
      where: { 
        token_hash: hash, 
        tipo: 'RESET_PASSWORD',
        usato_il: null,
        scade_il: { gt: new Date() }
      },
      data: { usato_il: new Date() }
    });

    if (res.count === 0) throw new Error('Token non valido, scaduto o già utilizzato');

    const record = await tx.tokenAccount.findUnique({ where: { token_hash: hash } });
    if (!record) throw new Error('Errore di congruenza');

    const pwdHash = await hashPassword(nuovaPassword);

    await tx.utente.update({
      where: { id: record.utente_id },
      data: { password_hash: pwdHash }
    });

    // Revoca di tutte le sessioni aperte! (Security best practice)
    await tx.sessione.updateMany({
      where: { utente_id: record.utente_id, revocata_il: null },
      data: { revocata_il: new Date() }
    });

    // Invalida tutti gli altri token di reset pendenti per questo utente
    await tx.tokenAccount.updateMany({
      where: { utente_id: record.utente_id, tipo: 'RESET_PASSWORD', usato_il: null },
      data: { usato_il: new Date() }
    });

    return true;
  });
}

/**
 * Validazione Sessione (Centralizzata, da usare nei Server Components / API)
 */
export async function getSessionUtente(sessionTokenInChiaro: string) {
  const hash = hashToken(sessionTokenInChiaro);
  
  const sessione = await prisma.sessione.findFirst({
    where: {
      token_hash: hash,
      revocata_il: null,
      scade_il: { gt: new Date() }
    },
    include: { 
      utente: {
        select: { // Escludiamo rigorosamente password_hash
          id: true,
          nome: true,
          cognome: true,
          email_normalizzata: true,
          ruolo: true,
          stato_account: true,
          verificato_il: true,
          quartiere_id: true,
          creato_il: true
        }
      }
    }
  });

  if (!sessione) return null;
  if (sessione.utente.stato_account !== 'ATTIVO') return null; // Respinge sospesi dinamicamente
  if (!sessione.utente.verificato_il) return null; // Respinge non verificati

  return sessione.utente;
}
