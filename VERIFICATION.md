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
| **Build Next.js** | `npm run build` | **SUPERATO (0 errori)** | Build di produzione Turbopack completata con successo: 8 route pronte (`/`, `/dashboard`, `/login`, `/register`, `/verify`, `/reset-password`, `/reset-password/confirm`, `/resend-verification`). |
| **Unit Testing (Vitest)** | `npm run test:unit` | **SUPERATO (46/46 test passati)** | 13 test auth, 14 test segnalazioni (incluso audit ed esclusioni), 5 test rate-limiter, 4 test email-transport, 10 test guardie di sicurezza DB. Eseguiti a livello di funzioni pure e mock. |
| **Integrazione DB (1ª Esecuzione)** | `npm run test:integration` | **SUPERATO SU AIVEN (13/13 test passati)** | Esecuzione sequenziale su `la_nostra_citta_test`: 6 test auth-db (token monouso reale, corse critiche concorrenti, login, sospensione dinamica, reset password con revoca sessioni, reinvio), 7 test segnalazioni-db (rollback senza media, upload monouso, blocco autosostegno, sostegno/revoca con audit, FK composta Media/AnalisiIa con divieto UPDATE, CHECK MySQL su attori e coordinate). Durata: 14.02s. |
| **Integrazione DB (2ª Esecuzione - Idempotenza)** | `npm run test:integration` | **SUPERATO SU AIVEN (13/13 test passati)** | Seconda esecuzione consecutiva completata con successo: dimostra assenza di fixture orfane, corretta pulizia transazionale con `cleanTestDatabase` (ordine AuditEvento -> Segnalazione -> Utente) e perfetta ripetibilità senza alterazione di `_prisma_migrations`. Durata: 14.14s. |
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
   - *Correzione*: Implementata funzione `loadTestEnv()` che prioritizza `.env.test` e carica la configurazione prima di qualsiasi inizializzazione di `PrismaClient`.
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
   - Configurato `fileParallelism: false` e `maxConcurrency: 1` per le suite che condividono il database di test. Le suite `auth-db.test.ts` e `segnalazioni-db.test.ts` vengono eseguite in sequenza deterministica, impedendo la cancellazione concorrente delle fixture.
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
| **Storage Remoto S3 e IA (Fase 3)** | **SOSPESA** | Nessun upload a disco o chiamata a modelli esterni attiva nella Fase 2. |

---

## 4. Distinzione Rigorosa dei Livelli di Collaudo

Nel collaudo sono formalmente distinti quattro livelli di verifica:

1. **Unit Test (Vitest)**:
   - **Esito**: **SUPERATO (46/46 test passati)**
   - **Ambito**: Funzioni pure e mock in memoria (logica di dominio auth, validazione coordinate e payload segnalazioni, rate limiting in-memory, trasporto email sintetico, 10 test su guardie di sicurezza DB).
   - **Significato**: Convalida la correttezza algoritmica e il rispetto dei contratti dei singoli moduli isolati.

2. **Integrazione MySQL (`la_nostra_citta_test` su Aiven)**:
   - **Esito**: **SUPERATO (13/13 test passati, eseguito 2 volte consecutivamente)**
   - **Ambito**: Suite eseguita in sequenza contro l'istanza live Aiven MySQL 8.4.11 con `sslaccept=strict`. Copre corse critiche concorrenti su token monouso, vincoli `CHECK` MySQL (attore, coordinate, byte size), FK composta `Media/AnalisiIa` con restrizione `RESTRICT` su UPDATE/DELETE, blocco autosostegno e rollback transazionale.
   - **Significato**: La doppia esecuzione consecutiva conferma l'idempotenza e la ripetibilità della suite osservata e l'efficacia del teardown transazionale (`cleanTestDatabase`), ma **non dimostra ogni possibile condizione di concorrenza del database reale**. Inoltre, poiché è stato eseguito un recupero controllato dello schema parziale tramite script DDL, l'applicazione delle migrazioni da zero su un DB completamente vuoto rimane **non verificata**.

3. **Flusso Completo di Dominio (Script E2E su DB Aiven)**:
   - **Esito**: **SUPERATO (12/12 step passati)**
   - **Ambito**: Script TSX eseguito live su Aiven: registrazione account sintetico, blocco login pre-verifica, recupero token email sintetico, verifica email atomica, login e creazione sessione, richiesta reset password, aggiornamento password con revoca di tutte le sessioni attive, rifiuto credenziali obsolete, login con nuova password, logout esplicito e revoca sessione.
   - **Significato**: Dimostra la concatenazione delle funzioni di dominio contro MySQL reale. Non definisce l'intero dominio come "completamente convalidato" al di fuori della combinazione specifica dei percorsi testati.

4. **Collaudo Browser / Interfaccia Utente**:
   - **Esito**: **NON ESEGUITO** (Driver di automazione browser Playwright non disponibili nell'ambiente di esecuzione locale: download binario fallito con HTTP 404 su CDN).
   - **Stato del Codice**: Le route e i form sono stati compilati con successo in `npm run build`. È stato corretto il difetto di consumo del token di verifica: l'apertura del link GET non consuma automaticamente il token, ma presenta un form di conferma interattivo con Server Action.
   - **Checklist Manuale di Verifica Browser (per esecuzione manuale da parte dell'operatore)**:
     - [ ] **Accesso anonimo respinto**: Navigare direttamente su `http://localhost:3001/dashboard` senza cookie di sessione. Verificare il reindirizzamento immediato a `/login`.
     - [ ] **Registrazione e blocco pre-verifica**: Compilare il form `/register` con credenziali sintetiche. Tentare subito il login su `/login`: verificare la comparsa del messaggio di errore che indica che l'account richiede la verifica dell'email.
     - [ ] **Apertura link senza consumo automatico**: Accedere via browser all'URL `/verify?token=<token>`. Verificare che la pagina mostri il form di conferma ("Conferma e Attiva Account") e che il token rimanga non consumato fino all'interazione.
     - [ ] **Conferma tramite form e login**: Cliccare sul pulsante di conferma. Verificare l'avvenuta attivazione e il successivo login con successo.
     - [ ] **Dashboard e cookie di sessione**: Verificare l'accesso a `/dashboard` con visualizzazione dei dati utente. Ispezionare nei DevTools del browser il cookie di sessione: verificare gli attributi `HttpOnly`, `SameSite=Lax` (o `Strict`), e `Path=/`.
     - [ ] **Logout e invalidazione**: Cliccare sul pulsante di logout. Verificare il reindirizzamento e l'impossibilità di accedere nuovamente a `/dashboard` tramite navigazione o pulsante "Indietro".
     - [ ] **Reset password e revoca sessioni**: Richiedere il reset su `/reset-password`. Aprire `/reset-password/confirm?token=<token>`. Inserire la nuova password. Verificare che eventuali altre sessioni aperte vengano revocate e che il login richieda la nuova password.
     - [ ] **Reinvio verifica ed errori sanitizzati**: Testare `/resend-verification` e inserire input errati o email inesistenti: verificare che i messaggi di errore non espongano dettagli interni, stack trace o query database.

---

## 5. Procedura Unica di Collaudo Aiven Eseguita con Successo

La sequenza eseguita con esito riproducibile:

```bash
# 1. Compilazione del codice finale
npm run build

# 2. Diagnostica di sola lettura
npm run verify:db

# 3. Prima esecuzione integrazione DB (13/13 superati)
npm run test:integration

# 4. Seconda esecuzione integrazione DB per verifica idempotenza e pulizia (13/13 superati)
npm run test:integration

# 5. Flusso Auth completo End-to-End di dominio su Aiven (12/12 passaggi superati)
npm run test:e2e:auth
```
