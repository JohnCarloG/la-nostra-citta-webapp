# La Nostra Città, Il Nostro Futuro

Piattaforma civica web per la raccolta, documentazione, moderazione e valorizzazione delle priorità territoriali del Comune di Milano, da presentare alle forze politiche e ai candidati prima delle elezioni amministrative.

---

## 1. Architettura Tecnologica e Stack

- **Framework**: Next.js 16 (App Router con Turbopack, React 19, Server Actions, Route Handlers)
- **Database Relazionale**: MySQL 8.4 InnoDB ospitato su Aiven Cloud
- **ORM & Migrazioni**: Prisma ORM 5.22.0 (migrazioni versionate native SQL senza reset distruttivi)
- **Validazione e Storage**: Validazione strutturale MIME/magic-bytes, storage locale privato `.private_storage/`, streaming autenticato con cache-control protetto
- **Geocodifica & Mappe**: Leaflet interattivo con segnaposto unico, ricerca indirizzi Milano conforme alla Nominatim Usage Policy di OpenStreetMap (max 1 req/s aggregata, cache in-memory 24h, nessun autocomplete durante la digitazione, attribuzione ODbL 1.0 visibile)
- **Pipeline IA e Worker Asincrono**: Architettura a 4 moduli (Moderazione NLP, Classificazione categorie, Parser metadati EXIF binario nativo, Coerenza visivo-testuale) governata da Outbox pattern con lock `FOR UPDATE SKIP LOCKED` e policy conservativa fail-closed

---

## 2. Installazione delle Dipendenze

Il progetto richiede **Node.js 20+** o runtime compatibile.

```bash
# Installazione riproducibile delle dipendenze basata rigorosamente sul lockfile
npm ci
```

---

## 3. Configurazione degli Ambienti (.env.local vs .env.test)

La configurazione è rigorosamente separata tra ambiente applicativo ordinario e ambiente di collaudo e test automatici, impedendo la cancellazione o la corruzione accidentale dei dati dimostrativi o di produzione.

### 3.1 File di Configurazione Effettivamente Gestiti
- **`.env.local`**: Utilizzato localmente per lo sviluppo e l'avvio dell'applicazione (`npm run dev` o `npm run start`). Contiene i segreti locali e sovrascrive i default. Fa riferimento al database applicativo (es. `defaultdb`).
- **`.env.example`**: File modello documentato, privo di credenziali reali, utilizzato come riferimento per impostare i parametri.
- **`.env.test`**: Caricato prioritariamente dalla funzione di runtime `loadTestEnv()` ([src/lib/test-env.ts](src/lib/test-env.ts)) durante l'esecuzione di Vitest e degli script diagnostici. Applica una guardia di sicurezza obbligatoria: se l'host o la porta differiscono dai parametri autorizzati, o se il database non è categoricamente `la_nostra_citta_test`, l'esecuzione si interrompe all'istante.

### 3.2 Esempio Parametri Applicativi (`.env.local`)

```ini
APP_URL="http://localhost:3000"

# Connessione MySQL Aiven con verifica TLS
DATABASE_URL="mysql://avnadmin:<PASSWORD>@<AIVEN_HOST>:<PORT>/defaultdb?sslaccept=strict&sslcert=ca.pem"

# Trasporto Email SMTP (es. Gmail SSL/TLS nativo porta 465 o Mailtrap porta 587)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="utente@gmail.com"
SMTP_PASS="password_per_le_app"
EMAIL_FROM="La Nostra Città <noreply@lanostracitta.it>"

# Modalità Adattatori IA ("mock" per sviluppo offline deterministico, "ollama" per inferenza locale, "real" per adapter commerciali)
AI_ADAPTER_MODE="ollama"
# Modello Ollama locale ("qwen3-vl:4b-instruct" predefinito, oppure "qwen3-vl:2b-instruct")
OLLAMA_MODEL="qwen3-vl:4b-instruct"

# Per modalità con provider commerciale opzionale:
# AI_MODERATION_API_KEY="sk-..."
# AI_MODERATION_ENDPOINT="https://api.openai.com/v1/moderations"
```

### 3.3 Ambiente di Test e Collaudo (`.env.test`)

```ini
NODE_ENV="test"
AUTHORIZED_TEST_HOST="<AIVEN_HOST>"
AUTHORIZED_TEST_PORT="<PORT>"

# Connessione vincolata al solo database isolato di collaudo
DATABASE_URL="mysql://avnadmin:<PASSWORD>@<AIVEN_HOST>:<PORT>/la_nostra_citta_test?sslaccept=strict&sslcert=ca.pem"
```

---

## 4. Gestione del Certificato CA ed Evidenze Ambientali dei Sistemi Operativi

La connessione verso il cluster gestito Aiven MySQL richiede il certificato della Certificate Authority (`ca.pem`), collocato nella root del progetto.

### Percorsi per Sistema Operativo:
- **Windows**: `sslcert=ca.pem` oppure percorso assoluto Windows normalizzato `C:/progetto/ca.pem`.
- **macOS**: `sslcert=ca.pem` o percorso assoluto Unix.
- **Linux**: `sslcert=ca.pem` o percorso assoluto standard.

### Evidenze Tecniche Distinte per Sistema Operativo:
- **Windows**: L'handshake TLS con validazione strict (`sslaccept=strict`) e verifica del certificato CA è stato **eseguito e verificato con successo in sessione** sia con Prisma Client sia tramite script diagnostici su porta 11582.
- **macOS**: 
  - *Client nativo MySQL (`/usr/local/bin/mysql`)*: **CONNESSO con SUCCESSO** con `--ssl-mode=VERIFY_IDENTITY` e `--ssl-ca=certs/ca.pem` (TLS 1.3 `TLS_AES_128_GCM_SHA256`, database `la_nostra_citta_test`, MySQL 8.4.11).
  - *Prisma engine su macOS*: fallisce con `Error opening a TLS connection: The certificate was not trusted`. Causa accertata empiricamente sul certificato foglia presentato dal cluster Aiven: Apple `Security.framework` (`kSecPolicyNameSSL` / `SecTrustEvaluateWithError`) rigetta la catena con `Cert Verify Result: Invalid Extended Key Usage for policy` poiché il certificato emesso da Aiven per MySQL non include l'estensione EKU `serverAuth`.
  - *Docker Desktop su iMac*: l'applicazione è installata ma non può avviare il demone locale su questo hardware (`iMac11,3`, Mid 2010 Intel Westmere) poiché il kernel riporta `kern.hv_support: 0` (mancanza di supporto hardware ad Apple `Hypervisor.framework`). L'esecuzione containerizzata richiede quindi un host Linux esterno puntato tramite `export DOCKER_HOST="ssh://..."` o `tcp://...`.
- **Linux**: L'ambiente adotta lo stack OpenSSL standard per Node.js (in cui la validazione certificati con la CA Aiven ha dimostrato di avere pieno successo nel client MySQL). Predisposto in `Dockerfile` e `docker-compose.yml`.

---

## 5. Migrazioni e Seed (Operazioni Esplicite)

Per principio architetturale, l'applicazione **non esegue mai migrazioni automatiche o seed all'avvio**, prevenendo blocchi o corruzioni in produzione.

### 5.1 Allineamento del Database
```bash
# 1. Generazione del client Prisma allineato allo schema
npx prisma generate

# 2. Verifica formale dello schema Prisma
npx prisma validate

# 3. Applicazione delle migrazioni su database di collaudo
npm run migrate:test

# Per l'ambiente di produzione / staging:
# npx prisma migrate deploy
```

### 5.2 Popolamento Dati Dimostrativi
```bash
# Popola 12 quartieri NIL di Milano, 8 categorie a catalogo, 10 profili sintetici e 11 segnalazioni storiche
npx tsx scripts/seed-demo-data.ts
```

---

## 6. Avvio dell'Applicazione e del Worker Asincrono

### 6.1 Avvio Web Application
```bash
# Modalità sviluppo locale
npm run dev

# Modalità produzione
npm run build
npm run start
```
L'applicazione è consultabile all'indirizzo [http://localhost:3000](http://localhost:3000).

### 6.2 Avvio Worker Outbox (Invio Email e Notifiche)
Il sistema impiega l'Outbox Pattern: gli eventi di comunicazione (`INVIO_EMAIL`) vengono registrati nella stessa transazione atomica dell'operazione di business (registrazione, reset password) e consegnati asincronamente dal worker:

```bash
# Elaborazione continua dei job email
npm run worker:email

# Modalità mirata per singolo job (anti-arretrati con dry-run e sicurezza)
npm run worker:email:test -- --job-id <id> --send
```

### 6.3 Moderazione Cloud Gemini

La modalità esplicita `AI_ADAPTER_MODE=cloud` collega la pipeline all'API ufficiale
Gemini `generateContent`, senza fallback verso Ollama o mock. Il worker
`npm run worker:moderation` elabora segnalazioni nuove e modificate.
Per regole, stato del collaudo offline e configurazione futura di web e worker
su Render, leggere [Moderazione cloud](docs/MODERAZIONE_CLOUD.md).
Il collaudo cloud reale e la verifica completa del modello restano da eseguire;
nessuna attivazione o pubblicazione è implicita nell'implementazione.

---

## 7. Funzionamento dello Storage Locale Privato e Limitazioni

Gli allegati (fotografie JPEG/PNG/WebP e video MP4) non sono mai esposti pubblicamente tramite il file system web né salvati con i nomi file originali del client:
1. **Validazione strutturale**: i file caricati sono convalidati tramite `mime-validator.ts` analizzando i *magic bytes* e la struttura dei segmenti (es. JPEG SOI/EOI, PNG IHDR/IEND, WebP RIFF/VP8, MP4 ftyp/moov).
2. **Archiviazione privata**: memorizzati nella directory protetta `.private_storage/` con chiavi casuali (UUID) imprevedibili.
3. **Accesso streaming autorizzato**: l'erogazione avviene unicamente tramite l'endpoint dedicato `/api/media/[id]`, che verifica server-side se la segnalazione associata è pubblica (`APPROVATA` e non `RITIRATA`) o se il richiedente è l'autore originale o un membro del Comitato.
4. **Cache revalidation**: gli header HTTP forzano `no-cache, must-revalidate` per impedire la permanenza in cache intermedie di contenuti successivamente ritirati o rimossi.

### Limite Documentato:
L'adattatore `LocalDiskStorageProvider` opera sul file system locale della singola macchina/processo. In un deployment distribuito multi-istanza o serverless, è predisposta l'interfaccia `StorageProvider` per l'adozione di un volume di rete condiviso o di uno storage a oggetti compatibile.

---

## 8. Moduli IA, Privacy e Ricerca Territoriale

### 8.1 Parser EXIF Reale Nativo (`NativeExifMetadataAdapter` — RF09)
- Integrato nel core applicativo (`src/lib/ia/real-adapters.ts`), non simulato (`isSimulated = false`).
- Esegue l'ispezione binaria locale dei segmenti JPEG APP1/TIFF per l'estrazione delle coordinate GPS originarie.
- **Vantaggi**: 100% offline, costo zero, nessuna dipendenza da librerie esterne e nessuna fuga di dati o immagini verso terzi.

### 8.2 Moderazione NLP (`ProviderModerationAdapter` — RF07)
- Integrazione implementata secondo il codice per endpoint OpenAI Moderations (`https://api.openai.com/v1/moderations`), con isolamento dei dati non fidati anti-injection.
- **Stato di verifica**: Chiamata reale non ancora collaudata con credenziali live.
- Se la credenziale `AI_MODERATION_API_KEY` non è configurata, l'adattatore solleva `MissingProviderCredentialError` e la pipeline applica la **policy conservativa fail-closed**, instradando la segnalazione a `IN_REVISIONE` (nessuna approvazione arbitraria o simulata).

### 8.3 Classificazione Civica Automatica (RF08) e Coerenza Visivo-Testuale (RF10) tramite Ollama Locale
- **Scelta definitiva architetturale**: Integrazione locale tramite **Ollama** (`src/lib/ia/ollama.ts`), attiva impostando `AI_ADAPTER_MODE="ollama"`.
- **Endpoint e Modelli Autorizzati**:
  - Endpoint strettamente confinato a `http://127.0.0.1:11434/api/chat` con `redirect: 'error'`. Nessun accesso a host remoti né chiavi esterne.
  - Modello predefinito: `qwen3-vl:4b-instruct`.
  - Modello alternativo leggero selezionabile via variabile d'ambiente: `OLLAMA_MODEL="qwen3-vl:2b-instruct"`. Modelli non in whitelist vengono categoricamente respinti.
- **RF08 (Classificazione Categorie Civiche)**:
  - Invia rigorosamente solo testo della descrizione e array delle categorie a catalogo (`{ id, codice, nome }`).
  - Forza Structured Outputs JSON con schema `{ ids: string[] }` vincolato all'enum degli ID ammessi.
  - Deduplica gli identificativi restituiti e li salva in `SuggerimentoCategoria` senza toccare le categorie confermate.
- **RF10 (Coerenza Visivo-Testuale)**:
  - Utilizza esclusivamente l'immagine privata associata alla segnalazione, leggendo i byte raw dallo storage privato autorizzato e inviandoli in Base64 (nessun path locale o ID di storage inviato nel prompt).
  - Limite di sicurezza: max 10 MB per immagine. Video gestiti restituendo `UNSUPPORTED` con motivazione a verbale.
  - Verdetti ammessi: `CONSISTENT`, `UNCERTAIN`, `INCONSISTENT`.
  - **Nessuna equiparazione a frode**: un verdetto `INCONSISTENT` o `UNCERTAIN` indirizza la segnalazione al comitato (`IN_REVISIONE`), senza accusare il cittadino di frode né impostare `RIFIUTATA`.
- **RF07 (Moderazione)**:
  - In modalità `ollama`, la moderazione è affidata esplicitamente alla revisione umana del comitato civico (`verdict: 'REVIEW'`), senza chiamate a modelli esterni né approvazioni simulate.
- **Garanzia anti-bypass**:
  - Nessun fallback silenzioso verso cloud o mock. Se Ollama non è in esecuzione o risponde con errore, l'errore viene intercettato e registrato come `FAILED` in `AnalisiIa` instradando a `IN_REVISIONE`.
  - Smoke test diagnostico rapido senza connessione DB: `npx tsx scripts/check-ollama.ts`.

### 8.5 Ricerca Territoriale Milano (`/api/geo/search` — RF09)
- Conforme alla Nominatim Usage Policy di OpenStreetMap:
  - Nessun autocomplete o ricerca durante la digitazione.
  - Coda serializzata in memoria a max 1 req/sec (`scheduleNominatimRequest`).
  - Cache in memoria di 24 ore (`X-Cache: HIT/MISS`) per azzerare chiamate duplicate.
  - Attribuzione ODbL 1.0 mostrata visibilmente nell'interfaccia.
  - *Limite documentato*: il rate limiter in memoria opera per singolo processo Node.js.

---

## 9. Dossier Esportabile e Versione Stampabile (RF13, T18)

- **Servizio condiviso**: `/dossier` e `/api/dossier/csv` condividono le medesime regole della classifica pubblica (solo `APPROVATA` e `<> RITIRATA`, solo sostegni validi, spareggio cronologico deterministico).
- **Esportazione CSV RFC 4180**: include Byte Order Mark UTF-8 (`\uFEFF`) per la corretta visualizzazione di accenti ed emoji in Excel su Windows.
- **Protezione da Formula Injection**: celle che iniziano con `=, +, -, @, \t, \r` (anche preceduti da spazi o caratteri non stampabili) vengono neutralizzate con prefisso apice singolo `'`.
- **Riservatezza assoluta**: esclusione totale di email, codici fiscali, password hash, token o riferimenti a storage privati.
- **Versione stampabile**: layout multi-pagina con regole `@media print` (`thead { display: table-header-group; }`, `tr { break-inside: avoid; }`) e controlli interattivi nascosti.
- **Fail-Closed su errore DB**: in caso di indisponibilità del database, l'API risponde con HTTP 503 (mai un CSV vuoto che simuli successo) e l'interfaccia mostra un banner chiaro con pulsante di riprova.

---

## 10. Suite di Test e Verifica Automatica

```bash
# 1. Compilazione del codice finale (18 route pronte con Next.js Turbopack)
npm run build

# 2. Controllo statico TypeScript (0 errori)
npm run typecheck

# 3. Controllo qualità del codice ESLint (0 errori, 0 warning)
npm run lint

# 4. Esecuzione test unitari Vitest (204/204 superati su 21 file al 100%)
npm run test:unit

# 5. Esecuzione test di integrazione su database Aiven (richiede .env.test e connettività)
npm run test:integration

# 6. Collaudo del trasporto email SMTP
npm run smtp:check
```

---

## 11. Collaudo Finale Operatore

Per la guida completa e il protocollo di accettazione passo-passo da eseguire durante la consegna, fare riferimento a:  
👉 **[`docs/CHECKLIST_COLLAUDO_FINALE.md`](docs/CHECKLIST_COLLAUDO_FINALE.md)**.
