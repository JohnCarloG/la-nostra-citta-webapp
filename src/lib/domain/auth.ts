import { prisma } from '../db';
import { generateSecureToken, hashPassword, verifyPassword, hashToken } from '../security';
import { validaCodiceFiscale } from './codice-fiscale';
import { accodaEmailOutbox, tentaInvioImmediatoOutbox } from '../email-outbox';

/**
 * Normalizza l'email per evitare duplicati logici (es. test@email.com vs TEST@email.com)
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export interface RegistraCittadinoResult {
  id: string;
  nome: string;
  cognome: string;
  email_normalizzata: string;
  ruolo: string;
  stato_account: string;
  verificato_il: Date | null;
  quartiere_id: string | null;
  creato_il: Date;
  emailDelivered: boolean;
  clearToken?: string;
}

/**
 * Registrazione Utente (Cittadino) con Codice Fiscale, Quartiere e Outbox Email
 */
export async function registraCittadino(
  nome: string,
  cognome: string,
  email: string,
  passwordInChiaro: string,
  codiceFiscale?: string,
  quartiereId?: string
): Promise<RegistraCittadinoResult> {
  const emailNorm = normalizeEmail(email);

  let cfNorm: string | undefined = undefined;
  if (codiceFiscale) {
    const cfValidation = validaCodiceFiscale(codiceFiscale);
    if (!cfValidation.valido || !cfValidation.cfNormalizzato) {
      throw new Error(cfValidation.motivoErrore || 'Codice fiscale non valido');
    }
    cfNorm = cfValidation.cfNormalizzato;
  }

  if (quartiereId) {
    const quartiere = await prisma.quartiere.findUnique({ where: { id: quartiereId } });
    if (!quartiere) {
      throw new Error('Il quartiere selezionato non è ammesso dal catalogo civico');
    }
  }

  // Verifica duplicati
  const existingEmail = await prisma.utente.findUnique({ where: { email_normalizzata: emailNorm } });
  let existingCf: { id: string } | null = null;
  if (cfNorm) {
    existingCf = await prisma.utente.findFirst({ where: { codice_fiscale: cfNorm } });
  }

  if (existingEmail || existingCf) {
    if (cfNorm) {
      // Politica privacy: non rivelare se il conflitto è su email o codice fiscale
      throw new Error('I dati inseriti non consentono la registrazione. Se possiedi già un account civico, accedi o richiedi il recupero credenziali.');
    }
    throw new Error('Email già registrata');
  }

  const pwdHash = await hashPassword(passwordInChiaro);

  const { utenteDb, clearToken, outboxJobId } = await prisma.$transaction(async (tx) => {
    const utente = await tx.utente.create({
      data: {
        nome,
        cognome,
        email_normalizzata: emailNorm,
        password_hash: pwdHash,
        codice_fiscale: cfNorm || null,
        quartiere_id: quartiereId || null,
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
      }
    });

    const { token, hash } = generateSecureToken();
    const scadenza = new Date();
    scadenza.setHours(scadenza.getHours() + 24); // Token valido 24h

    await tx.tokenAccount.create({
      data: {
        utente_id: utente.id,
        tipo: 'VERIFICA_EMAIL',
        token_hash: hash,
        scade_il: scadenza
      }
    });

    // Registra Outbox job dentro la transazione
    const outboxId = await accodaEmailOutbox({
      tipo: 'VERIFICA_EMAIL',
      to: emailNorm,
      subject: 'Attivazione account civico - La Nostra Città',
      body: `Gentile ${nome},\n\nGrazie per esserti registrato alla piattaforma civica "La Nostra Città, Il Nostro Futuro".\n\nPer attivare il tuo profilo civico e confermare il tuo indirizzo email, accedi al seguente link:\n${process.env.APP_URL || 'http://localhost:3000'}/verify?token=${token}\n\nOppure inserisci manualmente il tuo token di verifica:\n${token}\n\nIl token scade tra 24 ore.`,
      token,
      utente_id: utente.id
    }, tx);

    return { utenteDb: utente, clearToken: token, outboxJobId: outboxId };
  });

  // Consegna Outbox FUORI transazione DB aperta
  let emailDelivered = false;
  try {
    const dispatch = await tentaInvioImmediatoOutbox(outboxJobId);
    emailDelivered = dispatch.delivered;
  } catch {
    emailDelivered = false;
  }

  return {
    id: utenteDb.id,
    nome: utenteDb.nome,
    cognome: utenteDb.cognome,
    email_normalizzata: utenteDb.email_normalizzata,
    ruolo: utenteDb.ruolo,
    stato_account: utenteDb.stato_account,
    verificato_il: utenteDb.verificato_il,
    quartiere_id: utenteDb.quartiere_id,
    creato_il: utenteDb.creato_il,
    emailDelivered,
    clearToken
  };
}

/**
 * Reinvio token di verifica email per account non ancora verificati
 */
export async function reinviaVerificaEmail(email: string): Promise<boolean> {
  const emailNorm = normalizeEmail(email);
  const utente = await prisma.utente.findUnique({ where: { email_normalizzata: emailNorm } });

  // Se l'utente non esiste, è sospeso o già verificato, non inviamo token ma non esponiamo leak
  if (!utente || utente.stato_account === 'SOSPESO' || utente.verificato_il !== null) {
    return false;
  }

  const { token, hash } = generateSecureToken();
  const scadenza = new Date();
  scadenza.setHours(scadenza.getHours() + 24);

  const outboxJobId = await prisma.$transaction(async (tx) => {
    // Invalida token di verifica precedenti
    await tx.tokenAccount.updateMany({
      where: {
        utente_id: utente.id,
        tipo: 'VERIFICA_EMAIL',
        usato_il: null
      },
      data: {
        usato_il: new Date()
      }
    });

    await tx.tokenAccount.create({
      data: {
        utente_id: utente.id,
        tipo: 'VERIFICA_EMAIL',
        token_hash: hash,
        scade_il: scadenza
      }
    });

    return accodaEmailOutbox({
      tipo: 'VERIFICA_EMAIL',
      to: utente.email_normalizzata,
      subject: 'Nuovo Token di Verifica Account - La Nostra Città',
      body: `Gentile ${utente.nome},\n\nEcco il tuo nuovo link per l'attivazione dell'account civico:\n${process.env.APP_URL || 'http://localhost:3000'}/verify?token=${token}\n\nOppure inserisci manualmente il tuo token:\n${token}\n\nIl token scade tra 24 ore.`,
      token,
      utente_id: utente.id
    }, tx);
  });

  // Consegna fuori transazione
  await tentaInvioImmediatoOutbox(outboxJobId);
  return true;
}

/**
 * Completamento profilo per utenti esistenti (aggiunta retrocompatibile di CF e Quartiere)
 */
export async function completaProfiloUtente(
  utenteId: string,
  codiceFiscale: string,
  quartiereId: string
) {
  const cfValidation = validaCodiceFiscale(codiceFiscale);
  if (!cfValidation.valido || !cfValidation.cfNormalizzato) {
    throw new Error(cfValidation.motivoErrore || 'Codice fiscale non valido');
  }
  const cfNorm = cfValidation.cfNormalizzato;

  const quartiere = await prisma.quartiere.findUnique({ where: { id: quartiereId } });
  if (!quartiere) {
    throw new Error('Il quartiere selezionato non è ammesso dal catalogo civico');
  }

  // Verifica che il CF non sia già in uso da un altro utente
  const existingCf = await prisma.utente.findFirst({
    where: {
      codice_fiscale: cfNorm,
      NOT: { id: utenteId }
    }
  });

  if (existingCf) {
    throw new Error('I dati inseriti non consentono l\'aggiornamento del profilo.');
  }

  return prisma.utente.update({
    where: { id: utenteId },
    data: {
      codice_fiscale: cfNorm,
      quartiere_id: quartiereId
    }
  });
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

  await prisma.sessione.create({
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

  const outboxJobId = await prisma.$transaction(async (tx) => {
    await tx.tokenAccount.create({
      data: {
        utente_id: utente.id,
        tipo: 'RESET_PASSWORD',
        token_hash: hash,
        scade_il: scadenza
      }
    });

    return accodaEmailOutbox({
      tipo: 'RESET_PASSWORD',
      to: utente.email_normalizzata,
      subject: 'Recupero Credenziali - La Nostra Città',
      body: `Gentile ${utente.nome},\n\nAbbiamo ricevuto una richiesta di recupero credenziali per il tuo account civico.\nIl tuo token di reset è:\n${token}`,
      token,
      utente_id: utente.id
    }, tx);
  });

  // Consegna fuori transazione
  await tentaInvioImmediatoOutbox(outboxJobId);
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
 * Errore di dominio controllato per le operazioni di autenticazione e sicurezza account.
 * I messaggi di queste eccezioni sono sicuri per essere mostrati all'utente.
 */
export class AuthDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthDomainError';
  }
}

/**
 * Cambio Password per Utente Autenticato
 * Identifica l'utente tramite utenteId estratto esclusivamente dalla sessione verificata.
 * Verifica la password attuale, valida che la nuova password rispetti i criteri e sia diversa dall'attuale.
 * Esegue un aggiornamento atomico con controllo di concorrenza ottimistica: aggiorna l'hash solo se
 * l'hash coincide ancora con quello appena verificato e l'account è ancora attivo e verificato.
 * Solo se l'update ha successo (count === 1) revoca tutte le sessioni attive e invalida eventuali
 * token di reset pendenti all'interno della stessa transazione.
 */
export async function cambiaPasswordAutenticato(
  utenteId: string,
  passwordAttuale: string,
  nuovaPassword: string,
  confermaPassword: string
): Promise<{ success: boolean }> {
  if (!utenteId?.trim()) {
    throw new AuthDomainError('Utente non autenticato');
  }

  if (!passwordAttuale || !nuovaPassword || !confermaPassword) {
    throw new AuthDomainError('Tutti i campi sono obbligatori');
  }

  if (nuovaPassword !== confermaPassword) {
    throw new AuthDomainError('La nuova password e la conferma non coincidono');
  }

  if (nuovaPassword.length < 8) {
    throw new AuthDomainError('La nuova password deve contenere almeno 8 caratteri');
  }

  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: {
      id: true,
      password_hash: true,
      stato_account: true,
      verificato_il: true
    }
  });

  if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il) {
    throw new AuthDomainError('Account non valido o non autorizzato');
  }

  const isCurrentValid = await verifyPassword(passwordAttuale, utente.password_hash);
  if (!isCurrentValid) {
    throw new AuthDomainError('Password attuale non corretta');
  }

  const isSamePassword = await verifyPassword(nuovaPassword, utente.password_hash);
  if (isSamePassword) {
    throw new AuthDomainError('La nuova password deve essere diversa da quella attuale');
  }

  const nuovoHash = await hashPassword(nuovaPassword);

  await prisma.$transaction(async (tx) => {
    // 1. Aggiorna password hash SOLO se l'utente ha ancora l'hash appena verificato ed è ancora attivo e verificato
    const updateRes = await tx.utente.updateMany({
      where: {
        id: utente.id,
        password_hash: utente.password_hash,
        stato_account: 'ATTIVO',
        verificato_il: { not: null }
      },
      data: {
        password_hash: nuovoHash
      }
    });

    if (updateRes.count !== 1) {
      throw new AuthDomainError(
        'La password o lo stato dell\'account sono stati modificati nel frattempo. Riprova.'
      );
    }

    // 2. Revoca tutte le sessioni attive per questo utente (solo la richiesta vincente)
    await tx.sessione.updateMany({
      where: { utente_id: utente.id, revocata_il: null },
      data: { revocata_il: new Date() }
    });

    // 3. Invalida tutti i token di reset password ancora pendenti
    await tx.tokenAccount.updateMany({
      where: { utente_id: utente.id, tipo: 'RESET_PASSWORD', usato_il: null },
      data: { usato_il: new Date() }
    });
  });

  return { success: true };
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
          codice_fiscale: true,
          quartiere_id: true,
          quartiere: {
            select: {
              id: true,
              nome: true,
              codice: true,
              is_ufficiale: true,
            }
          },
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
