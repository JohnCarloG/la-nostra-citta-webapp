# Registro Verifiche Tecniche e Collaudo

Questo registro documenta gli esiti reali e riproducibili delle verifiche eseguite sulla codebase, confrontando le evidenze dei comandi eseguiti con i requisiti di specifica.

---

## 1. Riepilogo Esiti Esecuzione Locale

| Verifica | Comando | Esito Reale | Dettagli / Note |
| :--- | :--- | :--- | :--- |
| **Prisma Validate** | `npx prisma validate` | **SUPERATO IN SESSIONE (0 errori)** | Schema sintatticamente e semanticamente conforme per datasource MySQL InnoDB. |
| **Prisma Generate** | `npx prisma generate` | **SUPERATO IN SESSIONE (0 errori)** | Prisma Client v5.22.0 generato e allineato ai tipi di runtime. |
| **Compilazione TypeScript** | `npx tsc --noEmit` | **SUPERATO IN SESSIONE (0 errori)** | Zero errori di tipo su Server Actions, pagine, script diagnostici, moduli IA e test. |
| **Linting ESLint** | `npm run lint` | **SUPERATO IN SESSIONE (0 errori, 0 warning)** | Conforme alle regole ESLint Next.js e TypeScript nei moduli sviluppati. |
| **Build Next.js** | `npm run build` | **SUPERATO IN SESSIONE (0 errori)** | Build di produzione Turbopack completata con successo: 18 route applicative pronte (`/`, `/api/dossier/csv`, `/api/geo/search`, `/api/media/[id]`, `/api/uploads`, `/classifica`, `/comitato`, `/dashboard`, `/dossier`, `/login`, `/mappa`, `/register`, `/resend-verification`, `/reset-password`, `/reset-password/confirm`, `/segnalazioni`, `/segnalazioni/[id]`, `/verify`) oltre a `/_not-found`. |
| **Unit Testing (Vitest)** | `npm run test:unit` | **SUPERATO IN SESSIONE (171/171 test passati)** | **171 test unitari passati su 18 file**: 19 auth, 10 codice-fiscale, 16 segnalazioni, 10 test-db-guard, 5 rate-limiter, 5 email-transport, 11 mime-validator, 3 storage provider, 17 ia-pipeline, 16 ia-real-adapters (parser EXIF reale, provider moderazione e provider classificazione con blocco se privo di credenziali), 8 ia-classification (RF08: catalogo chiuso, deduplicazione, timeout, indisponibilità, override umano), 14 nuova-segnalazione-luogo, 5 submit-segnalazione-luogo, 4 map-view, 4 nav-links, 4 media-placeholder, 8 email-worker-test, 12 dossier (RF13, T18: formula injection, escaping RFC 4180, privacy, ordinamento condiviso, gestione 503 su DB down). |
| **Integrazione DB Aiven** | `npm run test:integration` | **RISCONTRO STORICO AIVEN (45/45 test passati)** | Esecuzione sequenziale certificata su `la_nostra_citta_test`: 6 test auth-db, 7 test segnalazioni-db, 8 test uploads-db, 11 test fase4-community (T05, T06, T11, T12, T13), 13 test fase5-ia (**T07, T08, T09, T10, T14**). *Non rieseguita in questa sessione per preservare la baseline ed evitare diagnosi TLS.* |
| **Collaudo SMTP Reale (Gmail)** | `npm run smtp:check` | **RISCONTRO STORICO (SUPERATO)** | Connessione a `smtp.gmail.com:465` (SSL/TLS nativo, SMTP_SECURE=true) con autenticazione riuscita (Risposta: `250 Server pronto`). |
| **Invio e Ricezione Email Reale** | `npm run smtp:check -- <casella>` | **RISCONTRO STORICO (RICEZIONE CONFERMATA)** | Singolo invio diagnostico verso casella reale concordata. Accettato da Gmail SMTP (MessageId `<ad170106-c920-5099-bdad-a72066da2cd2@gmail.com>`) e consegna effettiva in inbox confermata dall'operatore. |
| **TLS Prisma strict per Sistema Operativo** | `npm run verify:db` (con `sslaccept=strict`) | **EVIDENZE SEPARATE PER OS** | **Windows**: verificato con successo in sessione con certificato CA Aiven e validazione strict.<br>**macOS**: vincolo Apple Security Framework (`errSecInvalidExtendedKeyUsage`, codice `-67609`) dovuto all'assenza dell'estensione standard `serverAuth` nel certificato emesso dal server database.<br>**Linux**: predisposto con stack OpenSSL; non eseguito in questa sessione e da verificare empiricamente con certificato live prima dell'esercizio. |
| **Verifica Account Reale via App** | Flusso `/register` o `/resend-verification` | **COLLAUDO MANUALE RINVIATO** | Worker isolato e testato con modalità dry-run e consenso esplicito `--send` per `la_nostra_citta_test`. In attesa del collaudo finale dell'operatore (vedi checklist). |
| **Script Diagnostico Read-Only** | `npm run verify:db` | **RISCONTRO STORICO (ISPEZIONE ESEGUITA)** | Database `defaultdb` e `la_nostra_citta_test` ispezionati in sola lettura: 17 tabelle presenti, migrazioni allineate (2 su defaultdb, 3 su test), account operatore verificato e intatto (`verificato_il` valorizzato). |
| **Applicazione Migrazioni Protetta** | `npm run migrate:test` | **RISCONTRO STORICO (SUPERATO SU AIVEN)** | `20261006000000_init_mysql` applicata e registrata come applied. Allineamento DDL completato senza reset né db push. Nessuna migrazione pendente rimasta. |
| **Script Collaudo E2E Autenticazione** | `npm run test:e2e:auth` | **RISCONTRO STORICO (12/12 step)** | Ciclo completo end-to-end eseguito live: registrazione -> blocco login pre-verifica -> recupero token da email -> verifica email atomica -> login -> verifica sessione -> richiesta reset -> cambio password con revoca di tutte le sessioni -> rifiuto credenziali obsolete -> login nuova password -> logout esplicito e revoca. |


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
| **Integrazione IA Reale vs Simulata** | **STATO DISTINTO PER MODULO** | **RF09 (EXIF)**: Reale locale nativo non simulato (`NativeExifMetadataAdapter`, `isSimulated = false`).<br>**RF07 (Moderazione)**: Integrazione implementata secondo il codice (`ProviderModerationAdapter`), chiamata reale non ancora collaudata con credenziali live.<br>**RF08 (Classificazione)**: Pipeline presente; contratti e validazione tassonomia chiusa completati; classificatore attualmente simulato (`DeterministicMockClassificationAdapter`); adattatore reale `ProviderClassificationAdapter` implementato (`isSimulated = false`, nessun fallback silenzioso al mock); scelta modello aperta (locale vs esterno).<br>**RF10 (Coerenza)**: Pipeline presente; verifica attualmente simulata (`DeterministicMockCoherenceAdapter`); blocco successivo. |

---

## 4. Dettaglio Verifiche Fase 5 (Pipeline IA, Worker e Policy Conservativa)

### Distinzione Rigida: Implementazione, Simulazione e Collaudo Reale
> [!IMPORTANT]
> Una risposta ottenuta da un mock deterministico non costituisce collaudo del modello reale. I test automatici in CI verificano la correttezza dei contratti, delle transizioni di stato e della gestione degli errori; le chiamate a modelli reali dipendono dalla configurazione esplicita del committente.

| Requisito / Ambito | Implementazione | Test Automatici (Vitest / DB Aiven) | Stato Collaudo Reale |
| :--- | :--- | :--- | :--- |
| **T07 (RF07)**: Moderazione NLP & Policy Conservativa | `ProviderModerationAdapter` (reale) e `DeterministicMockModerationAdapter` (CI) in `src/lib/ia/pipeline.ts` | **Superato con mock deterministico**: 17 test in `ia-pipeline.test.ts`, 16 test in `ia-real-adapters.test.ts`, 4 test in `fase5-ia.test.ts`. | **Integrazione implementata; chiamata reale non ancora collaudata**. Richiede credenziale `AI_MODERATION_API_KEY`. Fail-closed sicuro a `IN_REVISIONE`. |
| **T08 (RF08)**: Classificazione Multi-Label Civica | `ProviderClassificationAdapter` (reale), `DeterministicMockClassificationAdapter` (CI), `validateClassificationOutput` in `validators.ts` | **Superato con mock deterministico**: 8 test in `ia-classification.test.ts` (categorie valide, inesistenti, risposta malformata, nessun suggerimento, indisponibilità provider, override umano). | **Pipeline presente; classificatore attualmente simulato**. Adattatore reale implementato (`isSimulated = false`, nessun fallback silenzioso). Scelta modello/provider aperta. |
| **T09 (RF10)**: Media, Video e Coerenza Visiva | `NativeExifMetadataAdapter` (reale locale), `DeterministicMockCoherenceAdapter` (CI) | **Superato con mock deterministico**: video porta a `IN_REVISIONE` dichiarando limite formato; immagine incoerente porta a `IN_REVISIONE`; EXIF reale verifica parsing binario. | **EXIF verificato con parser reale nativo**. Verifica visivo-testuale attualmente simulata (blocco successivo). |
| **T10 (VI08)**: Revisioni Superate & Override Umano | Lock `FOR UPDATE`, check revisione e override umano in `pipeline.ts` | **Superato al 100%**: job superato marcato `OBSOLETE`; decisione umana già presa preservata intatta contro job tardivo (`SKIPPED_HUMAN_OVERRIDE`). | **Garantito a livello di transazione atomica e dominio**. |
| **T14 (Affidabilità)**: Worker Concorrente e Retry | `claimNextOutboxJob`, `processSingleOutboxJob` in `src/lib/ia/worker.ts` | **Superato al 100%**: `FOR UPDATE SKIP LOCKED` assegna job distinti; riesecuzione idempotente; fallback a `IN_REVISIONE` dopo max retry. | **Garantito a livello di transazione MySQL 8.4 e Outbox pattern**. |

---

---

## 5. Dettaglio Verifiche - Nuova Segnalazione: Scelta del Luogo, Ricerca Geografica e Accessibilità

### Distinzione: Implementazione, Test Automatici e Prove Manuali

| Ambito di Verifica | Implementazione | Test Automatici (Vitest Unit) | Prove Manuali / Browser |
| :--- | :--- | :--- | :--- |
| **1. Selezione Risultato e Coordinate** | `selezionaRisultatoRicerca` in `location-picker.ts`, `LuogoPicker` in `luogo-picker.tsx` | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 2). Aggiorna lat/lon condivise, memorizza indirizzo, imposta origine `RICERCA` e conferma a `true`. | Collaudo browser per verifica visiva rendering dropdown e centraggio mappa **rinviato al collaudo finale**. |
| **2. Protezione Correzione Manuale vs Risposte Tardive** | `riceviRisultatiRicerca` con tracciamento `requestId` in `location-picker.ts` | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 4). Risposta tardiva della richiesta 1 ignorata se superata; posizione corretta manualmente dall'utente non viene sovrascritta. | Prove di latenza simulate nei test unitari con mock. |
| **3. Proposta EXIF come Suggerimento da Confermare** | `proponiExif`, `accettaSuggerimentoExif`, `ignoraSuggerimentoExif` | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 5). Il rilevamento EXIF GPS non sovrascrive mai automaticamente la posizione; se rifiutato non altera lo stato; se accettato imposta origine `EXIF` e `EXIF_CONFERMATO`. | Collaudo browser con upload foto reali **rinviato al collaudo finale**. |
| **4. Geolocalizzazione Negata e Resilienza Errori** | `gestisciErroreGps` in `location-picker.ts`, pulsante "Usa la mia posizione" | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 6). Codici errore PERMISSION_DENIED (1), TIMEOUT (3), POSITION_UNAVAILABLE (2) generano alert accessibile dedicato senza eccezioni né cancellazione dei dati già inseriti. | Collaudo browser con permessi reali revocati **rinviato al collaudo finale**. |
| **5. Mancata Selezione e Coordinate Invalide** | `validaCoordinate` in `location-picker.ts`, controlli in `nuova-segnalazione-form.tsx` e `submitSegnalazioneAction` | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 1, 8), `submit-segnalazione-luogo.test.ts` (test 1, 2, 3), `segnalazioni.test.ts`. Posizione iniziale è `null`; coordinate fuori range (-90..90, -180..180) o non numeriche respinte client e server. | Verifica visiva messaggi di errore **rinviata al collaudo finale**. |
| **6. Invio Coordinate Confermate attraverso Servizio Esistente** | `submitSegnalazioneAction` in `src/actions/uploads.ts`, `createSegnalazioneAtomica` in `segnalazioni.ts` | **Superato (100%)**: `submit-segnalazione-luogo.test.ts` (test 4, 5). Invocazione atomica corretta con coordinate validate e origine `MANUALE` o `EXIF_CONFERMATO`. | Collaudo transazione DB completo eseguito nei test di integrazione DB. |
| **7. Route Handler Geocodifica e Policy OSM** | `GET /api/geo/search` in `src/app/api/geo/search/route.ts` | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 10, 11, 12, 13). Verifica rispetto policy Nominatim: User-Agent obbligatorio, timeout 5s, gestione rate-limit 429, fallback offline 502, estrazione indirizzi formattati Milano. | Nessuna chiamata reale al provider pubblico eseguita durante i test (solo fixture e mock). |
| **8. Alternativa Testuale e Accessibilità** | Tab switcher "Alternativa testuale", form manuale, etichette e ARIA live region | **Superato (100%)**: `nuova-segnalazione-luogo.test.ts` (test 7). Inserimento manuale di coordinate e indirizzo per fruizione senza mappa/screen reader. | Collaudo screen-reader / navigazione manuale tastiera **rinviato al collaudo finale**. |

---

## 6. Dettaglio Verifiche - Fase 6 (RF13/T18: Dossier Esportabile e Versione Stampabile)

### Distinzione: Implementazione, Test Automatici e Prove Manuali

| Ambito di Verifica | Implementazione | Test Automatici (Vitest Unit) | Prove Manuali / Browser |
| :--- | :--- | :--- | :--- |
| **1. Neutralizzazione Formula Injection** | `sanitizeCsvFormula` in `src/lib/domain/dossier.ts` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 1, 2, 3, 4). Caratteri pericolosi `=`, `+`, `-`, `@`, `\t`, `\r` prefissati con `'`, inclusi casi con spazi bianchi e caratteri di controllo non stampabili (`\0`, `\x1B`). Quoting RFC 4180 separato dalla neutralizzazione. | Ispezione file CSV esportato con fogli di calcolo. |
| **2. Conformità RFC 4180 e UTF-8 BOM** | `escapeCsvField`, `generateDossierCsv` in `dossier.ts` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 5, 6). Delimitatori con virgola, raddoppio doppi apici `""`, ritorno a capo `\r\n`, Byte Order Mark UTF-8 (`\uFEFF`) presente in testa per compatibilità con Microsoft Excel su Windows. | Verifica apertura su Microsoft Excel e LibreOffice Calc. |
| **3. Esclusione Tassativa Dati Riservati (T18)** | `generateDossierCsv` e `RawDossierRow` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 7). Nessun campo riservato presente nel CSV (zero email, codici fiscali, password hash, token, percorsi interni dello storage privato). | Audit statico dello schema e dei campi esportati. |
| **4. Servizio di Estrazione e Regole Classifica** | `getDossierSegnalazioni` in `src/lib/domain/dossier.ts` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 8, 9, 10). Filtro rigoroso su `APPROVATA` e `<> RITIRATA`; conteggio unicamente dei sostenitori con account attivo e verificato escluso l'autore; ordinamento e spareggio deterministico identici alla classifica (`sostegni_validi DESC, creata_il ASC, id ASC`); arricchimento categorie confermate; lista vuota senza errori se nessun record soddisfa i filtri. | Ispezione query parametrizzata SQL in conformità al modello logico. |
| **5. Route Handler Download CSV (`/api/dossier/csv`)** | Handler `GET` in `src/app/api/dossier/csv/route.ts` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 11). Risposta 200 con `Content-Type: text/csv; charset=utf-8`, header `Content-Disposition: attachment; filename="dossier-priorita-milano-YYYY-MM-DD.csv"`, e `Cache-Control: no-cache, no-store, must-revalidate`. | Download da browser **rinviato al collaudo finale**. |
| **6. Fail-Closed su Errore Database** | Gestione try/catch in `route.ts`, `page.tsx` e `classifica/page.tsx` | **Superato (100%)**: `tests/unit/dossier.test.ts` (test 12). In caso di crash o mancata connessione DB: API risponde con HTTP 503 ed errore JSON sanitizzato (nessun CSV vuoto apparentemente riuscito generato); `/dossier` e `/classifica` mostrano banner di indisponibilità con tasto di riprova (nessun conteggio zero inventato). | Verifica gestione errori di rete simulata con mock. |
| **7. Pagina Stampabile e Regole `@media print`** | `src/app/dossier/page.tsx`, `print-button.tsx`, `src/app/globals.css` | **Superato a livello di build e typecheck**: tabella multi-pagina con `thead { display: table-header-group; }` e `tr { break-inside: avoid; }`; controlli interattivi (pulsante stampa, download CSV, filtri, navbar, footer) nascosti in stampa via `.print\\:hidden`. | Prova fisica di stampa su carta o visualizzazione anteprima di stampa nel browser **rinviata al collaudo finale**. Non dichiarata verificata senza osservazione diretta. |

---

## 7. Procedura di Collaudo Eseguita con Successo

La sequenza completa eseguita con esito 100% positivo:

```bash
# 1. Compilazione del codice finale (18 route applicative di produzione pronte con Next.js Turbopack)
npm run build

# 2. Controllo statico TypeScript (0 errori)
npm run typecheck

# 3. Controllo qualità ESLint (0 errori, 0 warning nei nuovi moduli)
npm run lint

# 4. Test Unitari (158/158 superati su 17 file, inclusi dossier CSV, IA reale e geocodifica)
npm run test:unit

# 5. Test Integrazione DB Aiven (45/45 superati su Aiven live)
npm run test:integration

# 6. Flusso Auth completo End-to-End di dominio su Aiven (12/12 passaggi superati)
npm run test:e2e:auth
```
