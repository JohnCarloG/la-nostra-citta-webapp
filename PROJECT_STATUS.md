# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro  
**Target Autorizzato**: Next.js 16 (App Router) + Prisma ORM (5.22.0) + MySQL 8.4 su Aiven  
**Stato Globale**: **Progetto in corso (non concluso). Fase 4, Scelta del Luogo e Fase 6 completate; pipeline IA integrata con parti reali e simulate distinte; collaudo manuale operatore rinviato**.  
- **171/171 Unit Test passati (100%)** su 18 file di test Vitest (inclusi 8 test mirati per RF08 classificazione, 16 test real adapters, 12 test dossier CSV, formula injection, RFC 4180, privacy e gestione indisponibilità DB).
- **45/45 Test di Integrazione DB superati** su Aiven live (storico certificato su `la_nostra_citta_test`: T05-T14).
- **12/12 Step E2E Auth superati**.
- **18 Route applicative di produzione** compilate con successo in Next.js Turbopack (`/`, `/api/dossier/csv`, `/api/geo/search`, `/api/media/[id]`, `/api/uploads`, `/classifica`, `/comitato`, `/dashboard`, `/dossier`, `/login`, `/mappa`, `/register`, `/resend-verification`, `/reset-password`, `/reset-password/confirm`, `/segnalazioni`, `/segnalazioni/[id]`, `/verify`) oltre a `/_not-found`.
- **TypeScript**: 0 errori (`tsc --noEmit`).
- **ESLint**: 0 errori e 0 warning nei nuovi moduli.
- **Storage Privato e Media**: protetto tramite endpoint dedicato `/api/media/[id]` con cache-control `no-cache, must-revalidate`. Collaudo manuale browser e resa cartacea fisica **RINVIATI al collaudo finale** per scelta dell'operatore (non bloccanti).
- **Stato dei Moduli IA (Distinzione Rigida: Implementazione, Simulazione, Verifica Reale)**:
  - **RF09 (EXIF GPS)**: Parser locale reale (`NativeExifMetadataAdapter`, `isSimulated = false`), analizza segmenti JPEG APP1/TIFF direttamente dal file system privato locale; 100% offline, zero costi e zero fughe dati. **Implementato e verificato**.
  - **RF07 (Moderazione NLP)**: Pipeline presente; integrazione implementata secondo il codice (`ProviderModerationAdapter`, `isSimulated = false`) con prompt isolation anti-injection, timeout AbortSignal e validazione schema rigida; fail-closed sicuro a `IN_REVISIONE` con errore `MissingProviderCredentialError` in assenza di credenziali. **Chiamata reale non ancora collaudata con credenziali live**.
  - **RF08 (Classificazione Categorie)**: Pipeline presente; tassonomia chiusa ricavata dalle categorie ammesse, validazione identificativi restituiti e suggerimenti isolati in `SuggerimentoCategoria` rigidamente distinti da `SegnalazioneCategoria`. Classificatore attualmente simulato per la CI (`DeterministicMockClassificationAdapter`, `isSimulated = true`). Adattatore reale `ProviderClassificationAdapter` implementato (`isSimulated = false`, nessun fallback silenzioso al mock). **Scelta modello/provider locale vs esterno aperta** (cfr. `docs/progetto/CONFRONTO_CLASSIFICAZIONE_IA.md`).
  - **RF10 (Coerenza Visivo-Testuale)**: Pipeline presente; gestione video non supportato completata a livello di specifica con instradamento esplicito a `IN_REVISIONE`. Verifica visivo-testuale attualmente simulata (`DeterministicMockCoherenceAdapter`, `isSimulated = true`). **Blocco di sviluppo successivo**.
- **Scelta del Luogo e Geocodifica**: conforme alla Nominatim Usage Policy di OpenStreetMap (nessun autocomplete, 1 req/s in-memory queue, cache 24h, ODbL). Limite: rate limiter in memoria su singolo processo.
- **Stato Reale dei Conteggi**: documentato esclusivamente per riscontro empirico dei comandi eseguiti (171 test unitari su 18 file, 18 route Next.js censite dal build). Non si formulano ipotesi arbitrarie su discrepanze storiche.

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

### Fase 5 - Pipeline IA, Worker Asincrono, Policy Conservativa e Protezione Concorrenza (IN CORSO — RF08/RF10 APERTI)
- **Architettura a 4 Moduli (05 riga 22-26) con distinzione Implementazione / Simulazione / Verifica Reale**:
  - `ModerationAdapter` (NLP — RF07): verdict `ALLOW`/`REVIEW`/`BLOCK`, reasons, score, model/policy version. Integrazione implementata secondo il codice (`ProviderModerationAdapter`, `isSimulated = false`) con prompt isolation anti-injection, timeout AbortSignal, validazione schema e fail-closed sicuro (`IN_REVISIONE`) se privo di credenziali `AI_MODERATION_API_KEY`. Conservato mock deterministico per test in CI (`DeterministicMockModerationAdapter`, `isSimulated = true`). **Chiamata reale non collaudata con credenziali live**.
  - `ClassificationAdapter` (Multi-label — RF08): pipeline presente; tassonomia chiusa da catalogo ammesso, validazione schema e scarto duplicati/codici sconosciuti (`validateClassificationOutput`), suggerimenti isolati in `SuggerimentoCategoria` e distinti dalle categorie confermate comitato (`SegnalazioneCategoria`). Classificatore attualmente simulato nei test automatici (`DeterministicMockClassificationAdapter`, `isSimulated = true`). Adattatore reale implementato (`ProviderClassificationAdapter`, `isSimulated = false`) con blocco se privo di credenziali (nessun fallback silenzioso al mock). **Scelta del modello reale aperta (locale vs esterno)**.
  - `MetadataAdapter` (EXIF — RF09): estrazione coordinate e stato `SUCCESS`/`NO_EXIF`/`CORRUPTED`/`UNSUPPORTED` (T04/T09). Implementato l'adattatore reale binario (`NativeExifMetadataAdapter`, `isSimulated = false`) che legge i segmenti JPEG APP1/TIFF direttamente dal file system locale privato senza costi né chiamate a terzi. **Implementato e verificato**.
  - `CoherenceAdapter` (Visivo-Testuale — RF10): verdict `CONSISTENT`/`UNCERTAIN`/`INCONSISTENT`/`UNSUPPORTED`. Video non supportato inviato a `IN_REVISIONE` con dichiarazione esplicita (T09). Verifica visivo-testuale attualmente simulata (`DeterministicMockCoherenceAdapter`, `isSimulated = true`). **Blocco di sviluppo successivo**.
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
| **Unit Test (Vitest)** | 17 file di test: 19 auth, 10 codice-fiscale, 16 segnalazioni, 10 test-db-guard, 5 rate-limiter, 5 email-transport, 11 mime-validator, 3 storage-provider, 17 ia-pipeline, 11 ia-real-adapters, 14 nuova-segnalazione-luogo, 5 submit-segnalazione-luogo, 4 map-view-layout, 4 nav-links, 4 media-placeholder, 8 email-worker-test, 12 dossier (RF13, T18) | **158/158 SUPERATI (100%)** |
| **Integrazione DB Aiven** | MySQL InnoDB su `la_nostra_citta_test`: 6 auth-db, 7 segnalazioni-db, 8 uploads-db, 11 fase4-community, 13 fase5-ia (**T05, T06, T07, T08, T09, T10, T11, T12, T13, T14**) | **45/45 SUPERATI (100%)** |
| **Collaudo SMTP Reale (Gmail)** | Verifica connessione (`smtp.gmail.com:465`) e invio diagnostico controllato a casella reale | **SUPERATO CON RICEZIONE CONFERMATA** (MessageId `<ad170106-c920-5099-bdad-a72066da2cd2@gmail.com>`, recapito confermato da operatore) |
| **TLS Prisma strict su macOS** | Connessione database MySQL con verifica rigorosa certificato CA e hostname | **BLOCCATO** (Bloccato su macOS da Apple Security Framework con errSecInvalidExtendedKeyUsage `-67609` a causa dell'assenza di `serverAuth` nel certificato del server Aiven. Convalidato con client TLS OpenSSL standard) |
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
5. **Rimozione Media**: la cancellazione dei singoli media da segnalazioni pubblicate è non implementata nel dominio per tutelare l'integrità probatoria.
