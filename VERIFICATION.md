# Registro Verifiche Tecniche e Collaudo

Questo registro documenta gli esiti reali e riproducibili delle verifiche eseguite sulla codebase, confrontando le evidenze dei comandi eseguiti con i requisiti di specifica.

---

## 1. Riepilogo Esiti Esecuzione Locale

| Verifica | Comando | Esito Reale | Dettagli / Note |
| :--- | :--- | :--- | :--- |
| **Prisma Validate** | `npx prisma validate` | **SUPERATO (0 errori)** | Schema sintatticamente e semanticamente conforme per datasource MySQL InnoDB. |
| **Prisma Generate** | `npx prisma generate` | **SUPERATO (0 errori)** | Prisma Client v5.22.0 generato e allineato ai tipi di runtime. |
| **Compilazione TypeScript** | `npx tsc --noEmit` | **SUPERATO (0 errori)** | Zero errori di tipo su Server Actions, pagine, script diagnostici, moduli IA e test. |
| **Linting ESLint** | `npm run lint` | **SUPERATO (0 errori, 0 warning)** | Conforme alle regole ESLint Next.js e TypeScript. |
| **Build Next.js** | `npm run build` | **SUPERATO (0 errori)** | Build di produzione Turbopack completata con successo: 16 route pronte (`/`, `/segnalazioni`, `/segnalazioni/[id]`, `/classifica`, `/mappa`, `/comitato`, `/dashboard`, `/login`, `/register`, `/verify`, `/reset-password`, `/reset-password/confirm`, `/resend-verification`, `/api/media/[id]`, `/api/uploads`, `/_not-found`). |
| **Unit Testing (Vitest)** | `npm run test:unit` | **SUPERATO (78/78 test passati)** | 14 test auth, 14 test segnalazioni, 10 test guardie DB, 5 test rate-limiter, 5 test email-transport, 11 test mime-validator strutturale, 3 test storage provider, 16 test ia-pipeline (validatori Zod/TS, mock adapters deterministici, calcolo hash, gestione payload malformati). |
| **Integrazione DB Aiven** | `npm run test:integration` | **SUPERATO SU AIVEN (45/45 test passati)** | Esecuzione sequenziale su `la_nostra_citta_test`: 6 test auth-db, 7 test segnalazioni-db, 8 test uploads-db, 11 test fase4-community (T05, T06, T11, T12, T13), 13 test fase5-ia (**T07, T08, T09, T10, T14**). |
| **Script Diagnostico Read-Only** | `npm run verify:db` | **SUPERATO SU AIVEN (LIVE)** | Connessione stabilita con successo su Aiven MySQL 8.4.11 (`ECDHE-RSA-AES256-GCM-SHA384`). Database attivo: `la_nostra_citta_test`. 17 tabelle verificate (16 di dominio + `_prisma_migrations`), 7 vincoli `CHECK` attivi, Foreign Key composta attiva con `ON DELETE RESTRICT ON UPDATE RESTRICT`. |
| **Applicazione Migrazioni Protetta** | `npm run migrate:test` | **SUPERATO SU AIVEN (LIVE)** | `20261006000000_init_mysql` applicata e registrata come applied. Allineamento DDL completato senza reset né db push. Nessuna migrazione pendente rimasta. |
| **Script Collaudo E2E Autenticazione** | `npm run test:e2e:auth` | **SUPERATO SU AIVEN (12/12 step)** | Ciclo completo end-to-end eseguito live: registrazione -> blocco login pre-verifica -> recupero token da email -> verifica email atomica -> login -> verifica sessione -> richiesta reset -> cambio password con revoca di tutte le sessioni -> rifiuto credenziali obsolete -> login nuova password -> logout esplicito e revoca. |

---

## 2. Difetti Trovati e Correzioni Applicate

1. **Protezione Stringente dell'Ambiente di Test ([tests/helpers/test-db.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/tests/helpers/test-db.ts))**:
   - `AUTHORIZED_TEST_HOST` e `AUTHORIZED_TEST_PORT` resi tassativi: se assenti o diversi dall'endpoint di destinazione, l'esecuzione viene interrotta immediatamente.
   - Database obbligatorio: unicamente `la_nostra_citta_test`. `defaultdb` e qualsiasi altro database vengono categoricamente respinti.
   - Prima di qualsiasi operazione di pulizia o scrittura transazionale, viene eseguita la query live `SELECT DATABASE() AS current_db, @@port AS server_port` sulla connessione attiva, abortendo se il database attivo o la porta non coincidono.
   - La cancellazione rispetta l'ordine delle dipendenze: `AuditEvento` viene cancellato prima di `Segnalazione` e `Utente`.

2. **Isolamento della Configurazione di Test ([src/lib/test-env.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/test-env.ts))**:
   - Implementata funzione `loadTestEnv()` che prioritizza `.env.test` e carica la configurazione prima di qualsiasi inizializzazione di `PrismaClient`. Sovrascrive prioritariamente `DATABASE_URL` garantendo che il percorso CA assoluto sia sempre utilizzato nei test e negli script di diagnostica.
   - Implementata `maskDatabaseUrl()` che maschera la password in formato `mysql://<user>:***@<host>:<port>/<db>` senza mai stampare credenziali in chiaro.

3. **Configurazione TLS per il Connettore Prisma MySQL**:
   - Connettore configurato con `sslaccept=strict` e verifica dell'esistenza su disco del certificato CA Aiven passato via parametro `sslcert`. Parametri permissivi (come `accept_invalid_certs`) sono esplicitamente rigettati dalla guardia di sicurezza.

4. **Suite di Test della Guardia di Sicurezza ([tests/unit/test-db-guard.test.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/tests/unit/test-db-guard.test.ts))**:
   - 10 test unitari mirati a verificare il blocco per assenza o discrepanza host/porta, database non autorizzati, TLS permissivo e mascheramento credenziali.

5. **Isolamento dell'Esecuzione dei Test di Integrazione ([vitest.config.mts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/vitest.config.mts))**:
   - Configurato `fileParallelism: false` e `maxConcurrency: 1` per le suite che condividono il database di test. Le suite vengono eseguite in sequenza deterministica, impedendo la cancellazione concorrente delle fixture.

6. **Cache Revalidation Endpoint Media ([src/app/api/media/[id]/route.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/app/api/media/[id]/route.ts))**:
   - *Difetto*: Header precedente (`max-age=300`) permetteva a cache intermedie o browser di servire l'immagine per 5 minuti anche se ritirata.
   - *Correzione*: Modificato in `public, no-cache, must-revalidate` (se pubblica) e `private, no-cache, no-store, must-revalidate` (se privata), forzando la verifica live dei permessi su ogni richiesta.

7. **Pipeline IA - Esecuzione Esterna alle Transazioni DB ([src/lib/ia/pipeline.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/ia/pipeline.ts))**:
   - Separazione in tre fasi: FASE A (lettura preliminare no-lock), FASE B (chiamate ad adattatori moderazione/classificazione/EXIF/coerenza completamente fuori da transazioni DB con calcolo hash sha256), FASE C (scrittura atomica breve con lock di riga `FOR UPDATE`).
   - Verifica di revisione superata: se la segnalazione ha subito modifica concorrente a revisione superiore (`modificaSegnalazione`), il risultato viene marcato `OBSOLETE` e non sovrascrive lo stato della segnalazione (T10).
   - Preservazione dell'override umano: se la segnalazione è già stata decisa da un moderatore (`stato_moderazione !== 'PENDENTE'`), l'analisi viene registrata ma non altera lo stato deciso dall'umano (`SKIPPED_HUMAN_OVERRIDE`) (T10).

8. **Worker Outbox Asincrono e Concorrenza ([src/lib/ia/worker.ts](file:///c:/Users/net/Desktop/la-nostra-citta-webapp/src/lib/ia/worker.ts))**:
   - Acquisizione concorrente garantita da `SELECT ... FOR UPDATE SKIP LOCKED` su MySQL 8.4 InnoDB. Due worker simultanei acquisiscono job distinti senza collisioni o lock timeout (T14).
   - Heartbeat lock di 5 minuti per prevenire doppie elaborazioni in caso di crash temporaneo del worker.
   - Gestione retry limitati con backoff esponenziale. Al raggiungimento di `MAX_WORKER_RETRIES` (3 tentativi), applicazione automatica della policy conservativa (passaggio a `IN_REVISIONE`) e chiusura del job Outbox (T14).

---

## 3. Garanzie del Database vs Garanzie Applicative vs Limiti Aperti

| Ambito | Tipologia Garanzia | Implementazione Concreta |
| :--- | :--- | :--- |
| **FK Composta AnalisiIa/Media** | **Database (InnoDB)** | `FOREIGN KEY (media_id, segnalazione_id) REFERENCES Media(id, segnalazione_id) ON DELETE RESTRICT ON UPDATE RESTRICT`. Impossibile associare media di altra segnalazione e impossibile spostare la segnalazione di un media già referenziato. |
| **CHECK Numerici e Integrità** | **Database (MySQL 8)** | 7 vincoli attivi verificati da `information_schema.CHECK_CONSTRAINTS`: `chk_segnalazione_coords`, `chk_media_bytesize`, `chk_exif_coords`, `chk_analisi_revisione`, `chk_analisi_punteggio`, `chk_audit_attore`, `chk_evento_attore`. |
| **Idempotenza AnalisiIa** | **Database (MySQL 8)** | Indice univoco `chiave_idempotenza`: `@@unique([segnalazione_id, revisione, modulo, input_hash, versione_modello, versione_policy])`. Operazioni di scrittura eseguite via `upsert`. |
| **Idempotenza Outbox** | **Database (MySQL 8)** | Indice univoco `@@unique([segnalazione_id, revisione, tipo_evento])`. |
| **Consumo Monouso Upload** | **Applicativa Transazionale** | Transazione atomica `tx.uploadTemporaneo.updateMany` con clausola `stato = 'VALIDO'` e passaggio a `CONSUMATO`. Secondo utilizzo o concorrenza respinti. |
| **Cardinalità Minima Media (>= 1)** | **Applicativa Transazionale** | Funzione di dominio `createSegnalazioneAtomica` verifica `storageKeys.length >= 1` prima di avviare la transazione. |
| **Blocco Autosostegno** | **Applicativa Transazionale** | Controllo vincolante `segnalazione.autore_id !== utenteId` all'interno della transazione di sostegno. |
| **Concorrenza Decisioni** | **Applicativa Transazionale** | Lock di riga `FOR UPDATE` e controllo su `expectedRevision` e `expectedState`. In caso di conflitto, sollevato `ConcurrencyConflictError` (HTTP 409). |
| **Concorrenza Outbox Worker** | **Database (MySQL 8.4)** | `FOR UPDATE SKIP LOCKED` previene collisioni tra worker distribuiti. |
| **Preservazione Decisione Umana** | **Applicativa Transazionale** | Verifica `stato_moderazione !== 'PENDENTE'` prima di qualsiasi aggiornamento automatico da pipeline IA. |
| **Collaudo Manuale Browser** | **LIMITE APERTO (VOLUTO)** | Verificato al 100% da test automatici; collaudo manuale tramite interfaccia browser rinviato al collaudo finale per scelta operatore. |
| **Integrazione IA Reale** | **SIMULATA (DETERMINISTICA)** | 4 moduli coperti da contratti e prove con adattatori deterministici. Nessun provider a pagamento o chiamata esterna non autorizzata attivata. |

---

## 4. Dettaglio Verifiche Fase 5 (Pipeline IA, Worker e Policy Conservativa)

### Distinzione: Implementazione, Test Automatici e Prove Manuali

| Requisito / Ambito | Implementazione | Test Automatici (Vitest / DB Aiven) | Prove Manuali |
| :--- | :--- | :--- | :--- |
| **T07 (RF07)**: Moderazione NLP & Policy Conservativa | `DeterministicMockModerationAdapter`, `eseguiAnalisiSegnalazione` in `src/lib/ia/pipeline.ts` | **100% Superato (4/4 test)** in `fase5-ia.test.ts`: ALLOW + coerenza valida porta a `APPROVATA`; testo senza categorie ammesse non blocca l'approvazione; testo con violazione porta a `RIFIUTATA`; timeout o provider offline porta conservativamente a `IN_REVISIONE`. | Verificato tracciamento EventoStato e AuditEvento a database. |
| **T08 (RF08)**: Classificazione Multi-Label | `DeterministicMockClassificationAdapter`, `validateClassificationOutput` in `src/lib/ia/validators.ts` | **100% Superato (2/2 test)** in `fase5-ia.test.ts`: scarto automatico di categorie duplicate o fuori catalogo senza errori DB; suggerimenti memorizzati in `SuggerimentoCategoria` rigidamente separati dalle categorie confermate. | Ispezione tabelle `SuggerimentoCategoria` e `SegnalazioneCategoria`. |
| **T09 (RF10)**: Media, Video e Coerenza Visiva | `DeterministicMockCoherenceAdapter`, `DeterministicMockMetadataAdapter` | **100% Superato (2/2 test)** in `fase5-ia.test.ts`: allegato video porta a `IN_REVISIONE` dichiarando esplicitamente limite formato; immagine incoerente porta a `IN_REVISIONE`; estrazione EXIF gestisce NO_EXIF senza errori. | Verifica motivazione esplicita nell'evento di stato. |
| **T10 (VI08)**: Revisioni Superate & Override Umano | `modificaSegnalazione` in `segnalazioni.ts`, lock `FOR UPDATE` e check di revisione in `pipeline.ts` | **100% Superato (2/2 test)** in `fase5-ia.test.ts`: job relativo a revisione superata marcato `OBSOLETE` e non sovrascrive la revisione corrente; decisione umana già presa (`RIFIUTATA`) preservata intatta contro job tardivo (`SKIPPED_HUMAN_OVERRIDE`). | Verifica immutabilità dello stato deciso dal comitato. |
| **T14 (Affidabilità)**: Worker Concorrente e Retry | `claimNextOutboxJob`, `processSingleOutboxJob` in `src/lib/ia/worker.ts` | **100% Superato (3/3 test)** in `fase5-ia.test.ts`: `FOR UPDATE SKIP LOCKED` assegna job distinti a worker simultanei senza stalli; riesecuzione idempotente non genera record duplicati; retry con backoff e fallback conservativo a `IN_REVISIONE` su max retries. | Simulazione crash del provider con transizione a IN_REVISIONE. |

---

## 5. Procedura di Collaudo Eseguita con Successo

La sequenza completa eseguita con esito 100% positivo:

```bash
# 1. Compilazione del codice finale (16 route di produzione pronte)
npm run build

# 2. Controllo statico TypeScript (0 errori)
npm run typecheck

# 3. Controllo qualità ESLint (0 errori, 0 warning)
npm run lint

# 4. Test Unitari (78/78 superati)
npm run test:unit

# 5. Test Integrazione DB Aiven (45/45 superati su Aiven live)
npm run test:integration

# 6. Flusso Auth completo End-to-End di dominio su Aiven (12/12 passaggi superati)
npm run test:e2e:auth
```
