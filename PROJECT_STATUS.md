# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro  
**Target Autorizzato**: Next.js 16 (App Router) + Prisma ORM (5.22.0) + MySQL 8.4 su Aiven  
**Stato Globale**: **Fase 4, Fase 5 e Blocco Scelta del Luogo (Nuova Segnalazione) Completati e Verificati con Test Automatici**.  
- **134/134 Unit Test passati (100%)** (inclusi 18 nuovi test specifici per scelta luogo, ricerca, race-conditions, GPS, EXIF e submit)  
- **45/45 Test di Integrazione DB superati** su Aiven live (inclusi i test formali di specifica **T05, T06, T07, T08, T09, T10, T11, T12, T13, T14**)  
- **12/12 Step E2E Auth superati**  
- **17 Route di produzione** compilate con successo in Next.js Turbopack (inclusa la rotta `/api/geo/search`)  
- **TypeScript**: 0 errori (`tsc --noEmit`)  
- **ESLint**: 0 errori e 0 warning nei nuovi moduli (file preesistenti isolati)  
- **Storage Privato e Media**: protetto tramite endpoint dedicato `/api/media/[id]` con cache-control `no-cache, must-revalidate`. Collaudo manuale browser **RINVIATO al collaudo finale** per scelta dell'operatore (non bloccante).  
- **Integrazione IA**: realizzata con **Adattatori Simulati Deterministici** (`DeterministicMockModerationAdapter`, `DeterministicMockClassificationAdapter`, `DeterministicMockMetadataAdapter`, `DeterministicMockCoherenceAdapter`). Nessuna chiamata esterna a pagamento o non autorizzata attivata.
- **Scelta del Luogo**: implementata nel form Nuova Segnalazione con ricerca indirizzi Milano (debounce, gestione risposte tardive, policy OSM), mappa Leaflet con singolo segnaposto trascinabile/click-to-pick, GPS opzionale (gestione permessi negati non bloccante), suggerimento EXIF da confermare esplicitamente senza sovrascritture, alternativa testuale e riepilogo con conferma esplicita. Collaudo browser manuale rinviato.

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

### Fase 5 - Pipeline IA, Worker Asincrono, Policy Conservativa e Protezione Concorrenza (COMPLETATA)
- **Architettura a 4 Moduli (05 riga 22-26)**:
  - `ModerationAdapter` (NLP): verdict `ALLOW`/`REVIEW`/`BLOCK`, reasons, score, model/policy version.
  - `ClassificationAdapter` (Multi-label): suggerimenti categorie con confidenza e validazione schema catalogo ammesso (scarto duplicati e codici inesistenti, T08). Categorie assenti non bloccano l'approvazione (T07).
  - `MetadataAdapter` (EXIF): estrazione coordinate e stato `SUCCESS`/`NO_EXIF`/`UNSUPPORTED` (T04/T09).
  - `CoherenceAdapter` (Visivo-Testuale): verdict `CONSISTENT`/`UNCERTAIN`/`INCONSISTENT`/`UNSUPPORTED`. Video non supportato inviato a `IN_REVISIONE` con dichiarazione esplicita (T09).
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
- **Ricerca Geografica Protetta con Contesto Milano (`/api/geo/search`)**:
  - Endpoint server-side protetto: nessuna chiave API o header interno esposto al browser.
  - Pieno rispetto della Nominatim Usage Policy di OpenStreetMap: header `User-Agent` descrittivo obbligatorio, timeout a 5 secondi (`AbortSignal`), gestione rate-limit HTTP 429 e attribuzione OpenStreetMap ODbL inclusa nel payload.
  - Bounding box configurata per l'area di Milano (`viewbox=9.04,45.54,9.28,45.38`) e lingua italiana.
- **Interfaccia Luogo nel Form Nuova Segnalazione (`src/components/segnalazioni/luogo-picker.tsx`)**:
  - Ricerca con debounce (400ms), annuncio di stato via live region ARIA (`aria-live="polite"`), navigazione accessibile da tastiera con focus visibile e dropdown dei risultati.
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

---

## Stato Verifiche e Collaudo

| Suite di Verifica | Obiettivo / Test Coperti | Esito Reale |
| :--- | :--- | :--- |
| **Unit Test (Vitest)** | 116 test preesistenti + 18 nuovi test mirati (scelta luogo, ricerca, race-conditions, GPS, EXIF, submit, route handler) | **134/134 SUPERATI (100%)** |
| **Integrazione DB Aiven** | MySQL InnoDB su `la_nostra_citta_test`: 6 auth-db, 7 segnalazioni-db, 8 uploads-db, 11 fase4-community, 13 fase5-ia (**T05, T06, T07, T08, T09, T10, T11, T12, T13, T14**) | **45/45 SUPERATI (100%)** |
| **Collaudo SMTP Reale (Gmail)** | Verifica connessione (`smtp.gmail.com:465`) e invio diagnostico controllato a casella reale | **SUPERATO CON RICEZIONE CONFERMATA** (MessageId `<ad170106-c920-5099-bdad-a72066da2cd2@gmail.com>`, recapito confermato da operatore) |
| **TLS Prisma strict su macOS** | Connessione database MySQL con verifica rigorosa certificato CA e hostname | **BLOCCATO** (Bloccato su macOS da Apple Security Framework con errSecInvalidExtendedKeyUsage `-67609` a causa dell'assenza di `serverAuth` nel certificato del server Aiven. Convalidato con client TLS OpenSSL standard) |
| **Verifica Account Reale via App** | Flusso applicativo completo `/register` o `/resend-verification` con email reale e token | **ANCORA DA COLLAUDARE** (Worker isolato con modalità dry-run e consenso `--send` predisposto per `la_nostra_citta_test`, in attesa di sblocco TLS strict o runtime Linux) |
| **E2E Auth Script** | Ciclo end-to-end su Aiven: registrazione, verifica, login, cambio password e revoca sessioni | **12/12 SUPERATI (100%)** |


| **TypeScript Typecheck** | `tsc --noEmit` su intero progetto | **0 ERRORI** |
| **ESLint** | Regole Next.js e TypeScript | **0 errori e 0 warning nei nuovi moduli (nessun errore nei nuovi file)** |
| **Build Produzione** | `next build` Turbopack | **17 ROUTE PRONTE (inclusa la nuova rotta /api/geo/search)** |
| **Popolamento Dimostrativo** | `scripts/seed-demo-data.ts` su `defaultdb` | **11 segnalazioni, 12 quartieri Milano, 8 categorie, 10 profili sintetici, 58 sostegni relazionali** |

---

## Limiti Aperti e Funzionalità Non Implementate (Dichiarati Esplicitamente)

1. **Trasporto Email SMTP Operatore**: Collaudo del trasporto SMTP reale (`SmtpEmailTransport`) su Gmail completato con successo: connessione TLS verificata, messaggio diagnostico accettato dal server e recapito in inbox confermato dall'operatore. Il worker Outbox è stato integrato con la modalità mirata (`--job-id <id>`) per l'elaborazione selettiva anti-arretrati. Verifica del flusso completo di attivazione account via app in attesa di connettività DB Aiven.

2. **Collaudo Manuale Browser**: implementato a livello di dominio, action, API, UI e test automatici; il collaudo manuale browser resta **rinviato al collaudo finale** per scelta dell'operatore (non bloccante).
3. **Integrazione IA Reale con Provider a Pagamento**: l'architettura dei 4 moduli e i contratti sono implementati e collaudati tramite **adattatori simulati deterministici** per garantire riproducibilità in CI e assenza di costi imprevisti. L'attivazione di chiamate a modelli commerciali/a pagamento richiede esplicita configurazione autorizzata.
4. **Predisposizione Storage S3**: solo architetturale via interfaccia `StorageProvider`. Nessun adapter S3 sviluppato.
5. **Rimozione Media**: la cancellazione dei singoli media da segnalazioni pubblicate è non implementata nel dominio per tutelare l'integrità probatoria.
