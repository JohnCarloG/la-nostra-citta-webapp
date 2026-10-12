# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro  
**Target Autorizzato**: Next.js (App Router) + Prisma ORM (5.22.0) + MySQL su Aiven  
**Stato Globale**: Fase 2 Completata e Collaudata su Aiven MySQL (`la_nostra_citta_test`). 46/46 Unit Test passati, 13/13 Test di Integrazione DB superati su Aiven (eseguiti 2 volte con successo deterministico e idempotente), 12/12 Step E2E Auth completati su Aiven, Build Produzione con 8 Route pronta. Fase 3 rigorosamente sospesa.

---

## Avanzamento per Fasi

### Fase 0 - Setup e Specifiche
- Requisiti e modello logico formalizzati in `docs/progetto/02_REQUISITI_E_VINCOLI.md` e `docs/progetto/04_MODELLO_LOGICO.md`.

### Fase 1 - Schema e Migrazioni MySQL
- Schema Prisma configurato nativamente per MySQL InnoDB (`provider = "mysql"`).
- Vincolo di Foreign Key composta: `AnalisiIa(media_id, segnalazione_id)` -> `Media(id, segnalazione_id)` con `@@unique([id, segnalazione_id])` su `Media`, configurata con `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- Migrazione attiva unica: `prisma/migrations/20261006000000_init_mysql/migration.sql` in **UTF-8 senza BOM**, integrata con i vincoli `CHECK` nativi MySQL 8 (`chk_segnalazione_coords`, `chk_media_bytesize`, `chk_exif_coords`, `chk_analisi_revisione`, `chk_analisi_punteggio`, `chk_audit_attore`, `chk_evento_attore`).
- Recupero controllato DDL eseguito con successo su `la_nostra_citta_test` impostando `RESTRICT` sulle azioni referenziali e applicando i vincoli `CHECK` (registrata con `prisma migrate resolve --applied`).
- Migrazioni PostgreSQL storiche isolate in `prisma/migrations_archive_postgres/`.

### Fase 2 - Dominio, Pagine, Rate Limiting e Sicurezza
- **Autenticazione Stateful**:
  - Registrazione con hashing della password (`hashPassword`), emissione token monouso e salvataggio `TokenAccount`.
  - Verifica email con consumo atomico transazionale (`tx.tokenAccount.updateMany` con clausola `usato_il: null`) che impedisce categoricamente il doppio utilizzo e le race conditions.
  - Reinvio verifica (`reinviaVerificaEmail`) che invalida automaticamente tutti i token precedenti emessi per lo stesso account.
  - Login con verifica password hash, controllo dinamicamente vincolante su `stato_account === 'ATTIVO'` e `verificato_il !== null`.
  - Sessioni gestite su DB (`Sessione`) con token crittografati SHA-256 e durata 7 giorni.
  - Sospensione dinamica: `getSessionUtente` rifiuta istantaneamente sessioni aperte se l'account passa a `SOSPESO`.
  - Reset password (`richiediResetPassword` + `eseguiResetPassword`): consumo atomico del token, aggiornamento password e **revoca immediata di tutte le sessioni aperte** dell'utente.
  - Logout esplicito con notifica di errore e rimozione cookie.
- **Server Actions con Validazione di Sicurezza**:
  - Validazione regex su formato email e controllo lunghezza minima password (>= 8 caratteri) su registrazione, login, recupero e cambio password.
  - Rate limiting sliding-window su memoria (`MemoryRateLimiter`): 5 tentativi/min per login/registrazione/reinvio (`authRateLimiter`), 3 tentativi/5 min per reset password (`resetPasswordRateLimiter`).
- **Segnalazioni e Dominio Territoriale**:
  - `createSegnalazioneAtomica`: verifica idoneità autore (attivo e verificato), controllo cardinalità minima media (>= 1 media, garantito a livello applicativo), massimo 5 allegati (RF04), divieto duplicati, validazione coordinate geografiche (lat -90..90, lon -180..180), consumo atomico e monouso di `UploadTemporaneo`, creazione atomica di `Segnalazione`, `Media` (stato READY), `EventoStato`, `AuditEvento` e `Outbox`.
  - `aggiungiSostegno`: blocco categorico dell'autosostegno (`autore_id !== utenteId`), controllo requisiti utente e segnalazione approvata/non ritirata, tracciamento append-only in `AuditEvento` (RF12).
  - `rimuoviSostegno`: revoca del sostegno con cancellazione e tracciamento append-only in `AuditEvento` (RF06, RF12).
  - `getClassificaSegnalazioni`: query aggregata conforme a `04_MODELLO_LOGICO.md` che ordina per sostegni decrescenti escludendo segnalazioni ritirate e considerando esclusivamente i voti di profili attivi e verificati.
- **Interfaccia Utente (Next.js 16 App Router)**:
  - Homepage istituzionale del portale civico (`/`).
  - Dashboard protetta (`/dashboard`) con dati utente, badge di ruolo (`CITTADINO`/`COMITATO`) e stato, e logout esplicito.
  - Pagine di autenticazione: `/login`, `/register`, `/verify`, `/reset-password`, `/reset-password/confirm`, `/resend-verification`.
- **Garanzie di Sicurezza nei Test DB (`tests/helpers/test-db.ts`)**:
  - Doppia guardia obbligatoria: validazione statica dei parametri (`AUTHORIZED_TEST_HOST`, `AUTHORIZED_TEST_PORT`, target tassativo `la_nostra_citta_test`) e verifica dinamica live interrogando il server (`SELECT DATABASE()`).
  - Rifiuto categorico di TLS debole (`sslaccept=strict` obbligatorio) e verifica dell'esistenza fisica del certificato CA passato via `sslcert` con percorso assoluto.
  - Blocco assoluto di qualsiasi pulizia o test distruttivo su database diversi da `la_nostra_citta_test` (es. `defaultdb`).
  - Sequenza transazionale rigorosa: `AuditEvento` eliminato prima di `Segnalazione` e `Utente`.
  - Mascheramento delle credenziali (`maskDatabaseUrl`) nei log per azzerare rischi di esposizione password.
  - Esecuzione sequenziale deterministica dei test di integrazione (`vitest.config.mts`: `fileParallelism: false`, `maxConcurrency: 1`) per evitare conflitti tra le suite che condividono il database di test.

### Limiti Aperti e Funzionalità Non Implementate (Dichiarati Esplicitamente)
1. **Rimozione Media / Ultimo Media**: la cancellazione dei singoli file o dell'ultimo media da segnalazioni pubblicate è **non implementata** a livello di dominio per impedire la rimozione indebita di prove probatorie.
2. **Vincolo "Almeno un Media"**: garantito esclusivamente dai percorsi applicativi (`createSegnalazioneAtomica`), non da un vincolo a livello di schema MySQL (dove una scrittura diretta su tabella potrebbe creare segnalazioni senza media).
3. **Worker Asincrono di Retry**: nessun worker di retry o demone background è attivo; i campi `tentativi` e `prossimo_tentativo_il` sono predisposizioni di schema.
4. **Fase 3 (Upload S3 e Moderazione IA)**: rigorosamente **SOSPESA** fino all'approvazione del collaudo completato della Fase 2.

---

## Stato Verifiche e Collaudo
- **Unit Test (Vitest)**: **46/46 test superati** (13 auth, 14 segnalazioni, 5 rate-limiter, 4 email-transport, 10 guardie di sicurezza DB).
- **Integrazione DB Aiven (MySQL live)**: **13/13 test superati (eseguito 2 volte consecutivamente)** su `la_nostra_citta_test` (6 auth-db, 7 segnalazioni-db). Idempotenza e isolamento transazionale convalidati; migrazione da zero su DB vuoto non verificata (eseguito recupero parziale DDL).
- **Flusso Completo di Dominio (Script E2E su DB Aiven)**: **12/12 step superati** (`npm run test:e2e:auth`). Convalida la sequenza di funzioni di dominio, non ogni possibile condizione di concorrenza.
- **Collaudo Browser / UI**: **NON ESEGUITO** (driver Playwright non disponibili in locale). Compilazione e correzione form di conferma verifica applicate; checklist manuale dettagliata documentata in [VERIFICATION.md](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/VERIFICATION.md).
- **TypeScript**: **0 errori** (`tsc --noEmit`).
- **ESLint**: **0 errori e 0 warning** (`npm run lint`).
- **Build Next.js**: **8 route di produzione ottimizzate** completate con successo (`npm run build`).
- **Prisma Schema**: valido per provider `mysql`.
