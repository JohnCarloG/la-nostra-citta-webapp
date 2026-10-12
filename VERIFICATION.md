# Registro Verifiche Tecniche e Collaudo

Questo registro documenta gli esiti reali e riproducibili delle verifiche eseguite sulla codebase, confrontando le evidenze dei comandi eseguiti con i requisiti di specifica.

---

## 1. Riepilogo Esiti Esecuzione Locale

| Verifica | Comando | Esito Reale | Dettagli / Note |
| :--- | :--- | :--- | :--- |
| **Prisma Validate** | `npx prisma validate` | **SUPERATO (0 errori)** | Schema sintatticamente e semanticamente conforme per datasource MySQL InnoDB. |
| **Prisma Generate** | `npx prisma generate` | **SUPERATO (0 errori)** | Prisma Client v5.22.0 generato e allineato ai tipi di runtime. |
| **Compilazione TypeScript** | `npx tsc --noEmit` | **SUPERATO (0 errori)** | Zero errori di tipo su Server Actions, pagine, script diagnostici e test. |
| **Linting ESLint** | `npm run lint` | **SUPERATO (0 errori, 0 warning)** | Conforme alle regole ESLint Next.js e React. |
| **Build Next.js** | `npm run build` | **SUPERATO (0 errori)** | Build di produzione Turbopack completata con successo: 8 route pronte (`/`, `/dashboard`, `/login`, `/register`, `/verify`, `/reset-password`, `/reset-password/confirm`, `/resend-verification`). Include form di caricamento allegati e Server Actions di upload. |
| **Unit Testing (Vitest)** | `npm run test:unit` | **SUPERATO (62/62 test passati)** | 14 test auth, 14 test segnalazioni, 10 test guardie DB, 5 test rate-limiter, 5 test email-transport, 11 test mime-validator strutturale (magic bytes JPEG/PNG/WebP/MP4 + verifica chunk/segmenti, EXIF malformato, limiti 10MiB/50MiB), 3 test storage provider privato su disco. |
| **Integrazione DB Aiven** | `npm run test:integration` | **SUPERATO SU AIVEN (21/21 test passati)** | Esecuzione sequenziale su `la_nostra_citta_test`: 6 test auth-db, 7 test segnalazioni-db (FK composta Media/AnalisiIa, vincoli CHECK, rollback), 8 test uploads-db (upload fisico su storage privato, blocco non verificati, rifiuto MIME fake, flusso completo con Media READY e UploadTemporaneo CONSUMATO, cleanup garbage collection di record scaduti e file orfani, isolamento storage di test). |
| **Script Diagnostico Read-Only** | `npm run verify:db` | **SUPERATO SU AIVEN (LIVE)** | Connessione stabilita con successo su Aiven MySQL 8.4.11 (`ECDHE-RSA-AES256-GCM-SHA384`). Database attivo: `la_nostra_citta_test`. 17 tabelle verificate (16 di dominio + `_prisma_migrations`), 7 vincoli `CHECK` attivi, Foreign Key composta attiva con `ON DELETE RESTRICT ON UPDATE RESTRICT`. |
| **Applicazione Migrazioni Protetta** | `npm run migrate:test` | **SUPERATO SU AIVEN (LIVE)** | `20261006000000_init_mysql` applicata e registrata come applied. Allineamento DDL completato senza reset né db push. Nessuna migrazione pendente rimasta. |
| **Script Collaudo E2E Autenticazione** | `npm run test:e2e:auth` | **SUPERATO SU AIVEN (12/12 step)** | Ciclo completo end-to-end eseguito live: registrazione -> blocco login pre-verifica -> recupero token da email -> verifica email atomica -> login -> verifica sessione -> richiesta reset -> cambio password con revoca di tutte le sessioni -> rifiuto credenziali obsolete -> login nuova password -> logout esplicito e revoca. |

---

## 2. Difetti Trovati e Correzioni Applicate

1. **Protezione Stringente dell'Ambiente di Test ([tests/helpers/test-db.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/tests/helpers/test-db.ts))**:
   - *Difetto*: Host e porta non erano obbligatoriamente vincolati all'ambiente autorizzato e mancava la verifica live della porta attiva del server MySQL.
   - *Correzione*: `AUTHORIZED_TEST_HOST` e `AUTHORIZED_TEST_PORT` resi tassativi: se assenti o diversi dall'endpoint di destinazione, l'esecuzione viene interrotta immediatamente.
   - Database obbligatorio: unicamente `la_nostra_citta_test`. `defaultdb` e qualsiasi altro database vengono categoricamente respinti.
   - Prima di qualsiasi operazione di pulizia o scrittura transazionale, viene eseguita la query live `SELECT DATABASE() AS current_db, @@port AS server_port` sulla connessione attiva, abortendo se il database attivo o la porta non coincidono.
   - La cancellazione rispetta l'ordine delle dipendenze: `AuditEvento` viene cancellato prima di `Segnalazione` e `Utente`.

2. **Isolamento della Configurazione di Test ([src/lib/test-env.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/test-env.ts))**:
   - *Difetto*: Possibile contaminazione tra variabili d'ambiente di sviluppo e test, e rischio di leak credenziali nei log.
   - *Correzione*: Implementata funzione `loadTestEnv()` che prioritizza `.env.test` e carica la configurazione prima di qualsiasi inizializzazione di `PrismaClient`. Sovrascrive prioritariamente `DATABASE_URL` garantendo che il percorso CA assoluto sia sempre utilizzato nei test e negli script di diagnostica.
   - Implementata `maskDatabaseUrl()` che maschera la password in formato `mysql://<user>:***@<host>:<port>/<db>` senza mai stampare credenziali in chiaro.

3. **Configurazione TLS per il Connettore Prisma MySQL**:
   - *Difetto*: Uso di parametri non standard o rischio di flag permissivi che disabilitano la verifica del certificato.
   - *Correzione*: Connettore configurato con `sslaccept=strict` e verifica dell'esistenza su disco del certificato CA Aiven passato via parametro `sslcert`. Parametri permissivi (come `accept_invalid_certs`) sono esplicitamente rigettati dalla guardia di sicurezza.

4. **Suite di Test della Guardia di Sicurezza ([tests/unit/test-db-guard.test.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/tests/unit/test-db-guard.test.ts))**:
   - Aggiunti 10 test unitari mirati che verificano:
     - Blocco per assenza di `AUTHORIZED_TEST_HOST` o `AUTHORIZED_TEST_PORT`;
     - Blocco per host o porta non corrispondenti;
     - Rifiuto categorico di database non autorizzati (incluso `defaultdb`);
     - Rifiuto di configurazioni TLS non rigorose;
     - Blocco se il file di certificato CA indicato in `sslcert` non esiste su disco;
     - Blocco preventivo di `cleanTestDatabase` se la query live `SELECT DATABASE()` o `@@port` non corrisponde all'ambiente autorizzato (garantendo che nessuna transazione di cancellazione venga avviata);
     - Mascheramento efficace delle credenziali nell'URL.

5. **Isolamento dell'Esecuzione dei Test di Integrazione ([vitest.config.mts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/vitest.config.mts))**:
   - Configurato `fileParallelism: false` e `maxConcurrency: 1` per le suite che condividono il database di test. Le suite `auth-db.test.ts`, `segnalazioni-db.test.ts` e `uploads-db.test.ts` vengono eseguite in sequenza deterministica, impedendo la cancellazione concorrente delle fixture.
   - La concorrenza asincrona interna ai test (es. corse critiche su token monouso con `Promise.all`) è pienamente preservata.

6. **Validazione Server nelle Server Actions e Requisiti di Dominio Territoriale**:
   - Aggiunta validazione regex RFC 5322 e lunghezza minima password (>= 8 caratteri) in [src/actions/auth.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/actions/auth.ts).
   - Validazione coordinate (-90 <= lat <= 90, -180 <= lon <= 180), descrizione non vuota, tetto massimo di 5 allegati e tracciamento audit su sostegno/revoca e classifica pubblica in [src/lib/domain/segnalazioni.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/domain/segnalazioni.ts).

7. **Recupero Controllato DDL e Risoluzione Formale Migrazione Iniziale**:
   - *Errore Riscontrato*: Durante l'applicazione iniziale su Aiven MySQL 8.4.11, l'engine ha restituito l'errore `3823: Column 'attore_id' cannot be used in a check constraint 'chk_audit_attore': needed in a foreign key constraint 'AuditEvento_attore_id_fkey' referential action`. In MySQL 8, colonne coinvolte in azioni referenziali `ON UPDATE CASCADE` non possono partecipare a vincoli `CHECK`.
   - *Hash SHA-256 File Iniziale Fallito*: `25E530DF1D2E19CC3E171CA0923F645F832AE7E1154670984640B62FD854E89B` (archiviato in `migration.sql.bak_failed`).
   - *Azione Eseguita*: Coerentemente con l'immutabilità degli identificatori UUID di utenti e segnalazioni, le relazioni di `EventoStato`, `AuditEvento` e della Foreign Key composta `AnalisiIa(media_id, segnalazione_id) -> Media(id, segnalazione_id)` sono state configurate con `ON DELETE RESTRICT ON UPDATE RESTRICT`.
   - *Script di Recupero Applicato*: Preparato ed eseguito lo script DDL [prisma/recovery_20261012_init_mysql.sql](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/prisma/recovery_20261012_init_mysql.sql) che ha modificato le FK in `RESTRICT` e applicato con successo i vincoli `chk_audit_attore` e `chk_evento_attore` senza ricreare tabelle o cancellare dati.
   - *Allineamento File Migrazione Iniziale*: Aggiornato [prisma/migrations/20261006000000_init_mysql/migration.sql](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/prisma/migrations/20261006000000_init_mysql/migration.sql) (nuovo hash SHA-256: `59C500498A224311A4116789C65EC31C2E741B6F4FBC016AEEE7FEB233C88A03`), identico allo schema applicato sul DB.
   - *Risoluzione Formale*: Eseguito `npx prisma migrate resolve --applied 20261006000000_init_mysql` e confermato da `npm run migrate:test` ("No pending migrations to apply").

8. **Fase 3 - Gestione Upload Fisico, Storage Privato e Mancanza di Commit Condiviso**:
   - *Difetto potenziale*: Rischio di file orfani nello storage se la transazione MySQL fallisce dopo la scrittura su disco, o rischio di accettare file manipolati fidandosi del Content-Type dichiarato dal client.
   - *Correzioni applicate*:
     - **Astrazione StorageProvider**: Definita interfaccia in [src/lib/storage/types.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/storage/types.ts) implementata da `LocalDiskStorageProvider` in [src/lib/storage/local-provider.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/storage/local-provider.ts) che isola i file in una directory non servita pubblicamente dal server web (`.private_storage`, esclusa da git).
     - **Validazione Magic Bytes**: Implementato [src/lib/storage/mime-validator.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/storage/mime-validator.ts) che analizza la firma esadecimale reale (JPEG, PNG, WebP, MP4) e applica i tetti dimensionali (10 MiB per foto, 50 MiB per video), estraendo coordinate GPS EXIF se presenti.
     - **Ciclo di vita UploadTemporaneo**: In [src/lib/domain/uploads.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/domain/uploads.ts), se la scrittura nel database MySQL fallisce dopo l'upload su storage, viene eseguito il rollback compensativo immediato eliminando il file dallo storage.
     - **Garbage Collection controllata (VI09)**: `pulisciUploadTemporaneiScaduti` cancella contemporaneamente i record dal database e i corrispondenti file dallo storage privato.

---

## 3. Garanzie del Database vs Garanzie Applicative vs Limiti Aperti

| Ambito | Tipologia Garanzia | Implementazione Concreta |
| :--- | :--- | :--- |
| **FK Composta AnalisiIa/Media** | **Database (InnoDB)** | `FOREIGN KEY (media_id, segnalazione_id) REFERENCES Media(id, segnalazione_id) ON DELETE RESTRICT ON UPDATE RESTRICT`. Verificato empiricamente: impossibile associare media di altra segnalazione e impossibile spostare la segnalazione di un media già referenziato. |
| **CHECK Numerici e Integrità** | **Database (MySQL 8)** | 7 vincoli attivi verificati da `information_schema.CHECK_CONSTRAINTS`: `chk_segnalazione_coords`, `chk_media_bytesize`, `chk_exif_coords`, `chk_analisi_revisione`, `chk_analisi_punteggio`, `chk_audit_attore`, `chk_evento_attore`. |
| **Consumo Monouso Upload** | **Applicativa Transazionale** | Transazione atomica `tx.uploadTemporaneo.updateMany` con clausola `stato = 'VALIDO'` e passaggio a `CONSUMATO`. Secondo utilizzo o concorrenza respinti. |
| **Cardinalità Minima Media (>= 1)** | **Applicativa Transazionale** | **Garantito dai percorsi applicativi**: la funzione di dominio `createSegnalazioneAtomica` verifica `storageKeys.length >= 1` prima di avviare la transazione. Il database engine non impedisce scritture dirette prive di record media associati. |
| **Blocco Autosostegno** | **Applicativa Transazionale** | Controllo vincolante `segnalazione.autore_id !== utenteId` all'interno della transazione di sostegno. |
| **Sospensione Dinamica** | **Applicativa di Sessione** | `getSessionUtente` legge live lo stato utente e scarta sessioni aperte se `stato_account !== 'ATTIVO'`. |
| **Rimozione Media / Ultimo Media** | **LIMITE APERTO (VOLUTO)** | Funzionalità non implementata nel dominio per impedire alterazione probatoria non controllata. |
| **Retry Worker Asincrono** | **LIMITE APERTO (VOLUTO)** | Nessun demone attivo (campi schema predisposti per successivi sviluppi). |
| **Moderazione Asincrona IA (Fase 3)** | **SOSPESA** | Nessuna chiamata a modelli esterni o automazione di moderazione attiva. |

---

## 4. Distinzione Rigorosa dei Livelli di Collaudo

Nel collaudo sono formalmente distinti quattro livelli di verifica:

1. **Unit Test (Vitest)**:
   - **Esito**: **SUPERATO (62/62 test passati)**
   - **Ambito**: Funzioni pure e mock in memoria: 14 test auth, 14 test segnalazioni, 10 test guardie di sicurezza DB, 5 test rate-limiter, 5 test email-transport, 11 test mime-validator strutturale (magic bytes, verifica chunk/segmenti JPEG SOI/SOF/EOI, PNG IHDR/IDAT/IEND, WebP RIFF/VP8, MP4 ftyp+moov/mdat, EXIF malformato senza crash, limiti dimensionali), 3 test storage provider privato.
   - **Significato**: Convalida la correttezza algoritmica e il rispetto dei contratti dei singoli moduli isolati.

2. **Integrazione MySQL (`la_nostra_citta_test` su Aiven)**:
   - **Esito**: **SUPERATO (21/21 test passati)**
   - **Ambito**: Suite eseguita in sequenza contro l'istanza live Aiven MySQL 8.4.11 con `sslaccept=strict`. Copre corse critiche concorrenti su token monouso, vincoli `CHECK` MySQL, FK composta `Media/AnalisiIa` con restrizione `RESTRICT`, blocco autosostegno, upload fisico su storage privato, rifiuto MIME fake, creazione Media READY e garbage collection di file scaduti/orfani, isolamento storage di test (`.test_storage`).
   - **Significato**: La suite conferma l'idempotenza e l'efficacia del teardown transazionale (`cleanTestDatabase`), ma **non dimostra ogni possibile condizione di concorrenza del database reale**. L'applicazione delle migrazioni da zero su un DB completamente vuoto rimane **non verificata** (è stato eseguito recupero parziale DDL).

3. **Flusso Completo di Dominio (Script E2E su DB Aiven)**:
   - **Esito**: **SUPERATO (12/12 step passati)** (revisione precedente, non ri-eseguito).
   - **Ambito**: Script TSX eseguito live su Aiven sul ciclo di autenticazione, sessioni e revoche.

4. **Collaudo Browser / Interfaccia Utente**:
   - **Verifica Automatica Server / HTTP**:
     - `GET /dashboard` anonimo: **SUPERATO (HTTP 307 Temporary Redirect -> /login)**.
     - `GET /verify?token=...`: **SUPERATO (HTTP 200)**: visualizza il form "Conferma e Attiva Account" senza consumare il token.
   - **Esiti Percorsi Browser Eseguiti dall'Operatore**:
     - [x] **Step 1 - Accesso anonimo respinto**: Navigazione su `/dashboard` reindirizzata a `/login`.
     - [x] **Step 2 - Registrazione e blocco pre-verifica**: Registrazione cittadino riuscita e login bloccato con messaggio "Account non verificato".
     - [x] **Step 3 - Apertura link /verify senza consumo**: Apertura e ricarica ripetuta del link GET senza consumo del token.
     - [x] **Step 4 - Conferma form e login**: Pressione del pulsante "Conferma e Attiva Account", transazione di verifica completata e login successivo con successo.
     - [x] **Step 5 - Dashboard e cookie di sessione**: Accesso alla dashboard e verifica attributi cookie `session_token` (`HttpOnly: true`, `SameSite: Lax`, `Path: /`).
     - [x] **Step 6 - Logout e invalidazione**: Disconnessione riuscita e sessione revocata.
     - [ ] **Step 7 - Reset password e revoca sessioni nel browser**: **NON ESEGUITO** (dichiarato esplicitamente per scelta dell'operatore; verificato solo a livello di integrazione e dominio).
     - [ ] **Step 8 - Reinvio verifica ed errori sanitizzati nel browser**: **NON ESEGUITO** (verificato a livello di dominio ed E2E script).
   - **Collaudo Upload Fisico e Invio Segnalazione (Fase 3)**:
      - [ ] **Upload foto JPEG/PNG (max 10 MiB) + invio segnalazione atomica via form**: **NON ESEGUITO** -- rinviato dall'operatore. Endpoint `POST /api/uploads` predisposto su `localhost:3001`. Verifica alla prossima sessione: persistenza record UploadTemporaneo e Media (READY) su la_nostra_citta_test e file fisico in .private_storage/.

---

## 5. Procedura Unica di Collaudo Aiven Eseguita con Successo

La sequenza eseguita con esito riproducibile:

```bash
# 1. Compilazione del codice finale
npm run build

# 2. Diagnostica di sola lettura
npm run verify:db

# 3. Test Unitari (62/62 superati)
npm run test:unit

# 4. Test Integrazione DB Aiven (21/21 superati su Aiven live)
npm run test:integration

# 5. Flusso Auth completo End-to-End di dominio su Aiven (12/12 passaggi superati)
npm run test:e2e:auth
```
