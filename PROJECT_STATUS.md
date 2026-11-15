# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro  
**Target Autorizzato**: Next.js 16 (App Router) + Prisma ORM (5.22.0) + MySQL 8.4 su Aiven  
**Stato Globale**: **Progetto in corso (non concluso). Fase 3 (upload e storage), Fase 4 (community e visibilità), Scelta del Luogo e Fase 6 (dossier) coperte da test offline al 100%; integrazione Ollama locale per RF08 e RF10 implementata con test di isolamento e contratti; collaudo manuale operatore nel browser e verdetto visivo Ollama rinviati**.  
- **204/204 Unit Test passati (100%)** su 21 file di test Vitest (inclusi 14 test ciclo di vita upload/storage/API route, 26 test dedicati alla pipeline e adapter IA/Ollama/coerenza/classificazione, 16 test real adapters, 12 test dossier CSV/RFC 4180/privacy/503).
- **45/45 Test di Integrazione DB superati** su Aiven live (storico certificato su `la_nostra_citta_test`: T05-T14).
- **12/12 Step E2E Auth superati**.
- **19 Route applicative di produzione** compilate con successo in Next.js Turbopack (`/`, `/_not-found`, `/api/dossier/csv`, `/api/geo/search`, `/api/media/[id]`, `/api/uploads`, `/classifica`, `/comitato`, `/dashboard`, `/dossier`, `/login`, `/mappa`, `/register`, `/resend-verification`, `/reset-password`, `/reset-password/confirm`, `/segnalazioni`, `/segnalazioni/[id]`, `/verify`).
- **TypeScript**: 0 errori (`tsc --noEmit`).
- **ESLint**: 0 errori e 0 warning nell'intero progetto.
- **Storage Privato e Media**: protetto tramite endpoint dedicato `/api/media/[id]` con cache-control `no-cache, must-revalidate` e `/api/uploads` protetto da validazione MIME chunk e limiti dimensionali. Collaudo manuale browser e resa cartacea fisica **RINVIATI al collaudo finale** per scelta dell'operatore (non bloccanti).
- **Connettività Database Aiven & TLS**: Host `mysql-d1e002e-iisgalvanimi-6770.f.aivencloud.com:11582` attivo e raggiungibile. Il client nativo `/usr/local/bin/mysql` su macOS si connette con successo con `--ssl-mode=VERIFY_IDENTITY` e `--ssl-ca=certs/ca.pem` in TLS 1.3 (`TLS_AES_128_GCM_SHA256`). Il connettore Prisma su macOS fallisce con `The certificate was not trusted`: diagnosi confermata con `/usr/bin/security verify-cert`, Apple `Security.framework` rigetta la catena con `Invalid Extended Key Usage for policy` per omissione dell'estensione `serverAuth` nel certificato del server Aiven. Docker Desktop locale non avviabile su `iMac11,3` per mancanza di `Hypervisor.framework` (`kern.hv_support: 0`), richiedendo un host Linux remoto (`DOCKER_HOST`) per container Linux.
- **Stato dei Moduli IA (Distinzione Rigida: Implementazione, Simulazione, Verifica Reale)**:
  - **RF09 (EXIF GPS)**: Parser locale reale (`NativeExifMetadataAdapter`, `isSimulated = false`), analizza segmenti JPEG APP1/TIFF direttamente dal file system privato locale; 100% offline, zero costi e zero fughe dati. **Implementato e verificato**.
  - **RF07 (Moderazione NLP)**: In modalità `ollama`, la moderazione testuale è affidata alla revisione umana del comitato civico (`verdict: 'REVIEW' -> IN_REVISIONE`), senza approvazioni automatiche né chiamate commerciali non autorizzate. Provider commerciale predisposto (`ProviderModerationAdapter`). **Chiamata commerciale reale non collaudata**.
  - **RF08 (Classificazione Categorie)**: Integrazione Ollama locale (`qwen3-vl:4b-instruct`, opzionale `2b`) su 127.0.0.1:11434 (`ollamaAdapters`). Tassonomia chiusa, Structured Outputs JSON rigido, deduplicazione e separazione in `SuggerimentoCategoria`. **Implementato e testato con successo sia in inferenza reale che in unit test**.
  - **RF10 (Coerenza Visivo-Testuale)**: Integrazione Ollama locale (`qwen3-vl:4b-instruct`, opzionale `2b`) su 127.0.0.1:11434. Invio raw bytes in base64 senza leak di path locali, video marcati `UNSUPPORTED`, fail-closed a `IN_REVISIONE` senza accuse di frode. Contratti e isolamento coperti da unit test. **Collaudo del verdetto visivo con modello live rinviato per scelta dell'operatore**.
- **Scelta del Luogo e Geocodifica**: conforme alla Nominatim Usage Policy di OpenStreetMap (nessun autocomplete, 1 req/s in-memory queue, cache 24h, ODbL). Limite: rate limiter in memoria su singolo processo.
- **Stato Reale dei Conteggi**: documentato esclusivamente per riscontro empirico dei comandi eseguiti (204 test unitari su 21 file, 19 route Next.js censite dal build). Non si formulano ipotesi arbitrarie su discrepanze storiche.

---

## Avanzamento per Fasi

### Fase 0 - Setup e Specifiche
- Requisiti e modello logico formalizzati in `docs/progetto/02_REQUISITI_E_VINCOLI.md` e `docs/progetto/04_MODELLO_LOGICO.md`. Matrice dei gap allineata in `docs/GAP_MATRIX.md`.

### Fase 1 - Schema e Migrazioni MySQL
- Schema Prisma configurato nativamente per MySQL InnoDB (`provider = "mysql"`).
- Vincolo di Foreign Key composta: `AnalisiIa(media_id, segnalazione_id)` -> `Media(id, segnalazione_id)` con `@@unique([id, segnalazione_id])` su `Media`, configurata con `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- Migrazione attiva unica: `prisma/migrations/20261006000000_init_mysql/migration.sql` in **UTF-8 senza BOM**, integrata con i vincoli `CHECK` nativi MySQL 8 (`chk_segnalazione_coords`, `chk_media_bytesize`, `chk_exif_coords`, `chk_analisi_revisione`, `chk_analisi_punteggio`, `chk_audit_attore`, `chk_evento_attore`).

### Fase 2 - Dominio, Identità, Rate Limiting e Sicurezza
- **Autenticazione Stateful**: registrazione, token monouso, consumo atomico anti-race conditions, login, sessioni su DB SHA-256, sospensione dinamica dell'account (invalida immediatamente le sessioni aperte), reset password con revoca di tutte le sessioni aperte, logout esplicito.
- **Validazione e Protezione**: rate limiting su finestra scorrevole in memoria, validazione password e formato email.

### Fase 3 - Upload Fisico e Storage Privato
- **Storage Locale Privato**: `LocalDiskStorageProvider` su directory privata `.private_storage/`. Predisposizione S3 mantenuta come pura interfaccia (senza fallback silenzioso).
- **Validazione Strutturale**: magic bytes e decodifica chunk (JPEG SOI/SOF/EOI, PNG IHDR/IDAT/IEND, WebP RIFF/VP8, MP4 ftyp+moov/mdat) con limiti anti-DoS (10 MiB foto / 50 MiB video).
- **Ciclo di vita UploadTemporaneo**: consumo atomico, rollback compensativo, tracciamento orfani e garbage collection controllata.

### Fase 4 - Community, Supervisione, Visibilità e Classifica (COMPLETATA)
- **Elenco e Dettaglio con Visibilità Autorizzata (VI06, T12)**:
  - Policy di visibilità unificata `isSegnalazionePubblica`: visibile pubblicamente se e solo se `stato_moderazione === 'APPROVATA'` e `stato_avanzamento !== 'RITIRATA'`.
  - Percorsi pubblici (`/segnalazioni`, `/classifica`, `/mappa`, `/api/media/[id]`) condividono categoricamente la stessa policy.
  - Dettaglio segnalazione (`/segnalazioni/[id]`): fruibile da visitatori per segnalazioni pubbliche; se privata/in revisione/ritirata, visibile unicamente all'autore originario o a membri del `COMITATO`.
- **Filtri e Paginazione (`/segnalazioni`)**:
  - Filtri per categoria a catalogo, stato avanzamento (`RICEVUTA`, `PRESA_IN_CARICO`, `INVIATA_AI_CANDIDATI`), ricerca testuale (`q`) e ordinamento (`piu_recenti`, `piu_sostenute`, `meno_recenti`).
  - Paginazione server-side accessibile con indicatore e controlli semantici.
- **Mappa con Alternativa Testuale Pienamente Utilizzabile (RF09, T16)**:
  - Visualizzazione mappa geolocalizzata su territorio comunale di Milano (`/mappa`).
  - **Alternativa testuale accessibile integrata**: pannello tabellare completo con coordinate precise, descrizione, categorie e link, navigabile da tastiera e tecnologie assistive.
- **Sostegno e Revoca Idempotenti (RF06, VI03, T05)**:
  - Aggiunta sostegno: vincolo categorico contro l'autosostegno (`autore_id !== utenteId`), controllo account attivo e verificato, inserimento `AuditEvento` ('AGGIUNGI_SOSTEGNO').
  - Gestione concorrenza su chiavi duplicate (`P2002`): due richieste simultanee creano un'unica riga.
  - Revoca sostegno (`rimuoviSostegno`): operazione idempotente; invocazioni ripetute restituiscono successo senza sollevare errori né corrompere lo stato.
  - Esclusione sostenitori sospesi: la classifica calcola i voti solo con `COUNT(u.id)` di utenti con `stato_account = 'ATTIVO'` e `verificato_il IS NOT NULL`.
- **Classifica con Conteggio e Spareggio Deterministico (RF06, T13)**:
  - Aggregazione diretta conforme al SQL di `04_MODELLO_LOGICO.md`: `ORDER BY sostegni_validi DESC, s.creata_il ASC, s.id ASC`.
  - Include le segnalazioni con 0 voti validi in graduatoria; esclude rigorosamente segnalazioni ritirate o in revisione.
  - Molteplici categorie confermate e molteplici allegati non alterano né moltiplicano i voti.
- **Area Operativa Comitato e Categorie Confermate (RF03, RF08, RF11, VI07, T06)**:
  - Dashboard riservata `/comitato` protetta da autorizzazione server-side.
  - Coda revisioni prioritarie per segnalazioni in stato `PENDENTE` o `IN_REVISIONE`.
  - Transizioni di moderazione consentite e serializzazione con lock `FOR UPDATE` e controllo di versione/stato ottimistico.
  - Gestione categorie confermate associata alla tabella M:N `SegnalazioneCategoria`.
- **Accesso Protetto ai Media con Controllo Cache (VI06, VI10)**:
  - Endpoint dedicato `/api/media/[id]`.
  - Cache revalidation rigorosa: `Cache-Control: public, no-cache, must-revalidate` (se pubblica) e `private, no-cache, no-store, must-revalidate` (se privata), impedendo la persistenza di media ritirati in cache intermedie o pubbliche senza rivalutazione dei permessi sul server.

### Fase 5 - Pipeline IA, Worker Asincrono, Policy Conservativa e Protezione Concorrenza (IN CORSO — RF08 e RF10 implementati con Ollama locale; collaudo visivo live rinviato)
- **Architettura a 4 Moduli (05 riga 22-26) con distinzione Implementazione / Simulazione / Verifica Reale**:
  - `ModerationAdapter` (NLP — RF07): verdict `ALLOW`/`REVIEW`/`BLOCK`, reasons, score, model/policy version. In modalità `ollama`, la moderazione testuale delega al comitato (`verdict: 'REVIEW'`). Adattatore commerciale `ProviderModerationAdapter` implementato (`isSimulated = false`) con fail-closed a `IN_REVISIONE`. Conservato mock deterministico per test in CI (`DeterministicMockModerationAdapter`, `isSimulated = true`). **Chiamata reale non collaudata con credenziali live**.
  - `ClassificationAdapter` (Multi-label — RF08): integrazione locale con **Ollama** (`src/lib/ia/ollama.ts`), modello `qwen3-vl:4b-instruct` (o `2b`). Tassonomia chiusa, Structured Outputs JSON rigido con scarto codici sconosciuti (`validateClassificationOutput`), suggerimenti isolati in `SuggerimentoCategoria` e distinti dalle categorie confermate (`SegnalazioneCategoria`). **Inferenza reale locale riuscita e testata**.
  - `MetadataAdapter` (EXIF — RF09): estrazione coordinate e stato `SUCCESS`/`NO_EXIF`/`CORRUPTED`/`UNSUPPORTED` (T04/T09). Implementato l'adattatore reale binario (`NativeExifMetadataAdapter`, `isSimulated = false`) che legge i segmenti JPEG APP1/TIFF direttamente dal file system locale privato senza costi né chiamate a terzi. **Implementato e verificato**.
  - `CoherenceAdapter` (Visivo-Testuale — RF10): integrazione locale con **Ollama** (`ollamaAdapters()`). Trasmissione sicura dei soli byte grafici privati in base64 senza leak di path o ID di storage; video gestiti con esito `UNSUPPORTED`; policy conservativa fail-closed (`IN_REVISIONE`) senza imputazione di frode. Contratti e isolamento coperti da unit test (`tests/unit/ia-coherence.test.ts`, `tests/unit/ollama.test.ts`). **Collaudo del verdetto visivo con modello live rinviato per scelta dell'operatore**.
- **Elaborazione Fuori Transazione DB**:
  - Chiamate ad adattatori e calcolo hash sha256 (`calculateInputHash`) eseguiti interamente **fuori da qualsiasi transazione database aperta**.
- **Scrittura Atomica e Idempotente (`eseguiAnalisiSegnalazione`)**:
  - Lock `FOR UPDATE` su `Segnalazione`.
  - Controllo revisione superata (T10): se la segnalazione è stata modificata a revisione superiore (`modificaSegnalazione`), il risultato viene marcato `OBSOLETE` e non tocca lo stato corrente.
  - Preservazione decisione umana (T10): se `stato_moderazione !== 'PENDENTE'`, l'override umano è sovrano e non viene alterato (`SKIPPED_HUMAN_OVERRIDE`).
  - Idempotenza garantita da `upsert` su chiave univoca `chiave_idempotenza` in `AnalisiIa`.
  - Policy conservativa: `BLOCK` -> `RIFIUTATA`; `ALLOW` + tutti media `CONSISTENT` -> `APPROVATA`; `REVIEW`, timeout, provider offline, video non supportato o incoerenza visiva -> `IN_REVISIONE`.
- **Worker Asincrono Outbox (`src/lib/ia/worker.ts`) (T14)**:
  - Acquisizione concorrente dei job tramite `SELECT ... FOR UPDATE SKIP LOCKED` su MySQL 8.4.
  - Heartbeat lock di 5 minuti per evitare riacquisizione concorrente in caso di crash.
  - Retry limitati con backoff esponenziale. Raggiunto il limite `MAX_WORKER_RETRIES` (3), applicazione della policy conservativa a `IN_REVISIONE` e marcatura del job come gestito.

### Fase 5B - Nuova Segnalazione: Scelta del Luogo, Ricerca e Accessibilità (COMPLETATA)
- **Ricerca Geografica Conforme alle Policy OpenStreetMap Nominatim (`/api/geo/search`)**:
  - Endpoint server-side protetto: nessuna chiave API o header interno esposto al browser.
  - Pieno rispetto della Nominatim Usage Policy di OpenStreetMap:
    - **Nessun autocomplete o ricerca durante la digitazione**: ricerca attivata unicamente su Invio o clic su "Cerca" (debounce e proxy non sanano l'autocomplete sui server pubblici OSMF).
    - **Limite aggregato di 1 richiesta al secondo per intera applicazione** (non per singolo utente) gestito tramite coda serializzata `scheduleNominatimRequest`.
    - **Cache in memoria di 24 ore** (`X-Cache: HIT/MISS`) per azzerare richieste duplicate su indirizzi già cercati.
    - **Identificazione chiara**: header HTTP `User-Agent` descrittivo civico (`LaNostraCitta-Milano/1.0`).
    - **Attribuzione visibile ODbL 1.0**: "Dati geografici © OpenStreetMap contributors, ODbL 1.0".
  - Bounding box configurata per l'area di Milano (`viewbox=9.04,45.54,9.28,45.38`) e lingua italiana.
- **Interfaccia Luogo nel Form Nuova Segnalazione (`src/components/segnalazioni/luogo-picker.tsx`)**:
  - Input di ricerca con pulsante "Cerca" esplicito, navigazione accessibile da tastiera e dropdown dei risultati.
  - Mappa interattiva Leaflet client-only (`MappaLuogoPicker`) con **un solo segnaposto** trascinabile (`draggable: true`), click-to-pick su qualsiasi punto della mappa e icona SVG vettoriale custom (nessun asset bitmap esterno che possa andare in 404).
  - Regola di integrità: il centro iniziale della mappa (Milano Duomo) **NON** è una posizione scelta; la posizione iniziale è `null` e richiede selezione esplicita.
  - Protezione concorrenza e risposte tardive: tracciamento sequenziale `requestId`; risposte di ricerche precedenti o tardive non sovrascrivono mai una posizione già corretta manualmente dall'utente.
  - Rilevamento GPS dispositivo ("Usa la mia posizione") opzionale con gestione trasparente degli errori (permesso negato, timeout, posizione non disponibile) tramite alert accessibile senza bloccare la compilazione degli altri campi del form.
  - Suggerimento EXIF: se una foto caricata contiene coordinate GPS, viene mostrato un banner di proposta ("Usa posizione dalla foto" / "Ignora") senza sovrascrivere automaticamente la posizione già scelta o corretta a mano.
- **Alternativa Testuale Accessibile e Riepilogo Vincolante**:
  - Modalità alternativa testuale sempre disponibile (tab accessibile): consente l'inserimento manuale di latitudine (-90..90), longitudine (-180..180) e indirizzo descrittivo, garantendo piena operatività con screen-reader o in caso di guasto/blocco della mappa o della rete.
  - Scheda di riepilogo con etichetta dell'origine (Ricerca, Mappa, GPS, EXIF, Manuale), coordinate a video e casella di conferma esplicita obbligatoria per l'invio.
- **Integrità Server e Flusso Esistente**:
  - Invio tramite il servizio esistente (`submitSegnalazioneAction` e `createSegnalazioneAtomica`) con validazione server-side delle coordinate (-90..90, -180..180) e memorizzazione dell'origine (`MANUALE` o `EXIF_CONFERMATO`).
  - Nessuna confusione tra quartiere di residenza e luogo della segnalazione; nessuna migrazione DB necessaria.

### Fase 6 - RF13/T18: Dossier Esportabile e Versione Stampabile (COMPLETATA)
- **Servizio di Estrazione Condiviso (`src/lib/domain/dossier.ts`)**:
  - Funzione `getDossierSegnalazioni`: riutilizza rigorosamente le regole di dominio della classifica pubblica.
  - Filtri di visibilità (VI06): seleziona esclusivamente segnalazioni con `stato_moderazione = 'APPROVATA'` e `stato_avanzamento <> 'RITIRATA'`.
  - Sostegni validi: conteggio unicamente dei sostenitori con account `ATTIVO`, verificati (`verificato_il IS NOT NULL`), escludendo tassativamente l'autore della segnalazione (VI03).
  - Ordinamento e spareggio deterministico: identico alla classifica pubblica (`sostegni_validi DESC, creata_il ASC, s.id ASC`, oppure ordinamento cronologico).
  - Categorie confermate: arricchite dal catalogo confermato senza duplicare voti.
- **Download CSV Conforme e Protetto da Formula Injection (`src/app/api/dossier/csv/route.ts`)**:
  - Esportazione conforme a RFC 4180 con quoting e gestione corretta di newline e caratteri speciali.
  - Inserimento del Byte Order Mark UTF-8 (`\uFEFF`) per garantire corretta decodifica di caratteri accentati ed emoji in Microsoft Excel su Windows.
  - **Difesa da Formula Injection (CSV/DDE Injection)**: neutralizzazione sistematica (`sanitizeCsvFormula`) delle celle che iniziano con caratteri pericolosi (`=`, `+`, `-`, `@`, `\t`, `\r`), inclusi i casi preceduti da spazi bianchi o caratteri di controllo non stampabili, tramite prefisso con apice singolo (`'`).
  - Separazione netta tra sanitizzazione formule e quoting CSV: la neutralizzazione precede l'escaping RFC 4180.
  - **Riservatezza Dati (T18)**: esportazione strettamente limitata a campi pubblici (Posizione, ID, Descrizione, Stato Avanzamento, Categorie, Coordinate, Sostegni Validi, Data Creazione UTC). Nessun dato sensibile o interno esportato (zero email, codici fiscali, password hash, token di sessione/verifica o percorsi dello storage privato).
  - Query parameters condivisi con l'interfaccia web (`categoria`, `stato`, `ordinamento`).
- **Pagina Dossier Accessibile e Stampabile (`src/app/dossier/page.tsx`)**:
  - Accessibile a tutti i cittadini, con riepilogo metadati (timestamp di estrazione in ora locale di Roma, filtri applicati, conteggio totale segnalazioni e totale sostegni).
  - Tabella accessibile e leggibile su più pagine: regole `@media print` in `src/app/globals.css` configurate con `thead { display: table-header-group; }` (ripetizione intestazione su ogni pagina cartacea) e `tr { break-inside: avoid; }` (nessun taglio di riga).
  - Nelle viste di stampa (`@media print`): controlli interattivi (pulsante stampa, link download CSV, barra filtri, navigazione di sistema e footer) rigorosamente nascosti.
  - Collegamenti bidirezionali inseriti da `/classifica`, `/comitato` e `/segnalazioni`.
- **Gestione Guasti Database e Fallback Realistici**:
  - Se il database non risponde o fallisce:
    - L'endpoint `/api/dossier/csv` restituisce HTTP 503 Service Unavailable ed errore JSON sanitizzato (mai un CSV vuoto che simuli un'esportazione riuscita).
    - La pagina `/dossier` mostra un banner accessibile di indisponibilità con pulsante "Riprova" (nessun conteggio a zero inventato).
    - Corretti i fallback anche nella pagina `/classifica`, distinguendo un database non disponibile da un'interrogazione andata a buon fine senza record.
- **Nota di Collaudo**: la resa cartacea e l'anteprima di stampa fisica nel browser restano **rinviate al collaudo finale** insieme al collaudo manuale d'insieme (non dichiarate verificate senza osservazione diretta).

---

## Stato Verifiche e Collaudo

| Suite di Verifica | Obiettivo / Test Coperti | Esito Reale |
| :--- | :--- | :--- |
| **Unit Test (Vitest)** | 21 file di test: 19 auth, 10 codice-fiscale, 16 segnalazioni, 10 test-db-guard, 5 rate-limiter, 5 email-transport, 11 mime-validator, 3 storage-provider, 17 ia-pipeline, 16 ia-real-adapters, 14 nuova-segnalazione-luogo, 5 submit-segnalazione-luogo, 4 map-view-layout, 4 nav-links, 4 media-placeholder, 8 email-worker-test, 12 dossier (RF13, T18), 14 uploads, 7 ollama, 12 ia-coherence, 8 ia-classification | **204/204 SUPERATI (100%)** |
| **Integrazione DB Aiven** | MySQL InnoDB su `la_nostra_citta_test`: 6 auth-db, 7 segnalazioni-db, 8 uploads-db, 11 fase4-community, 13 fase5-ia (**T05, T06, T07, T08, T09, T10, T11, T12, T13, T14**) | **45/45 SUPERATI (100%)** *(Storico certificato)* |
| **Collaudo SMTP Reale (Gmail)** | Verifica connessione (`smtp.gmail.com:465`) e invio diagnostico controllato a casella reale | **SUPERATO CON RICEZIONE CONFERMATA** (MessageId `<ad170106-c920-5099-bdad-a72066da2cd2@gmail.com>`, recapito confermato da operatore) |
| **Client MySQL nativo macOS** | Connessione database MySQL con verifica rigorosa certificato CA e hostname (`--ssl-mode=VERIFY_IDENTITY`) | **SUPERATO (100%)**: connessione riuscita su `la_nostra_citta_test` (MySQL 8.4.11), cifrario `TLS_AES_128_GCM_SHA256` |
| **TLS Prisma strict su macOS** | Connessione database MySQL tramite connettore Prisma (`native-tls`) | **BLOCCATO** (Bloccato su macOS da Apple Security Framework con `Invalid Extended Key Usage for policy` a causa dell'assenza di `serverAuth` nel certificato del server Aiven) |
| **Verifica Account Reale via App** | Flusso applicativo completo `/register` o `/resend-verification` con email reale e token | **ANCORA DA COLLAUDARE** (Worker isolato con modalità dry-run e consenso `--send` predisposto per `la_nostra_citta_test`, in attesa di sblocco TLS strict o runtime Linux) |
| **E2E Auth Script** | Ciclo end-to-end su Aiven: registrazione, verifica, login, cambio password e revoca sessioni | **12/12 SUPERATI (100%)** |
| **TypeScript Typecheck** | `tsc --noEmit` su intero progetto | **0 ERRORI** |
| **ESLint** | Regole Next.js e TypeScript | **0 errori e 0 warning nei nuovi moduli** |
| **Build Produzione** | `next build` Turbopack | **18 ROUTE APPLICATIVE PRONTE** (`/`, `/api/dossier/csv`, `/api/geo/search`, `/api/media/[id]`, `/api/uploads`, `/classifica`, `/comitato`, `/dashboard`, `/dossier`, `/login`, `/mappa`, `/register`, `/resend-verification`, `/reset-password`, `/reset-password/confirm`, `/segnalazioni`, `/segnalazioni/[id]`, `/verify`) oltre a `/_not-found` |
| **Popolamento Dimostrativo** | `scripts/seed-demo-data.ts` su `defaultdb` | **11 segnalazioni, 12 quartieri Milano, 8 categorie, 10 profili sintetici, 58 sostegni relazionali** |

---

## Limiti Aperti e Funzionalità Non Implementate (Dichiarati Esplicitamente)

1. **Collaudo Manuale Browser e Resa Cartacea**: implementati a livello di dominio, action, API, UI e test automatici; il collaudo manuale browser e la prova visiva della resa cartacea di stampa restano **rinviati al collaudo finale** per scelta dell'operatore (non bloccanti).
2. **Verifica Account Reale via App**: Worker outbox email integrato con modalità selettiva (`--job-id <id>`) e dry-run/send. Verifica del flusso completo di attivazione account via app in attesa di connettività DB Aiven o sblocco TLS strict su macOS.
3. **Integrazione IA Reale con Provider a Pagamento**: l'architettura dei 4 moduli e i contratti sono implementati e coperti da test con mock deterministici. L'adapter reale di moderazione gestisce timeout e fail-closed; l'attivazione effettiva richiede la fornitura di chiavi API e autorizzazione esplicita a servizi terzi a pagamento.
4. **Predisposizione Storage S3**: solo architetturale via interfaccia `StorageProvider`. Nessun adapter S3 sviluppato.
6. **Cambio Password da Utente Autenticato**: ASSENTE dall'applicazione; il sistema implementa esclusivamente il recupero password dimenticata via token email (`/reset-password`).
7. **Verifica dell'Identità vs Validazione Formale**: il codice fiscale viene validato formalmente con algoritmo ministeriale per garantire l'unicità dell'utenza e contrastare account civici duplicati; non costituisce verifica dell'identità anagrafica (SPID/CIE/documentale sono fuori perimetro).
8. **Collaudo Modello Live Ollama**: i contratti, la tassonomia chiusa, i Structured Outputs e l'isolamento sono coperti da test unitari con mock deterministici; l'inferenza live con modello scaricato locale è stata verificata in test dedicati ma non eseguita nella sessione odierna.
