# Ripresa Laboratorio — La Nostra Città, Il Nostro Futuro

## Obiettivo del Progetto
Realizzare un'applicazione web sicura per permettere ai cittadini di inviare, sostenere e
monitorare segnalazioni civiche. Include gestione transazionale forte, moderazione IA
(sospesa) e tracciamento audit.

## Target Tecnologico Autorizzato
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Linguaggio**: TypeScript
- **ORM**: Prisma 5.22.0
- **Database**: MySQL su cloud provider **Aiven** con connessione TLS/SSL obbligatoria.
  Target esclusivo autorizzato: `la_nostra_citta_test`. PostgreSQL dismesso.

---

---

---

## Stato Verifiche Attuale e Blocco TLS macOS

- **Integrazione IA Locale (Ollama — RF08 e RF10)**:
  - **RF08**: inferenza reale riuscita con `qwen3-vl:2b-instruct` (categoria «luce») e validazione a tassonomia chiusa coperta da unit test (`tests/unit/ollama.test.ts`, `tests/unit/ia-classification.test.ts`).
  - **RF10**: contratti di coerenza visivo-testuale, parsing schema, lettura byte privati e video `UNSUPPORTED` implementati e testati offline (`tests/unit/ia-coherence.test.ts`, `tests/unit/ollama.test.ts`).
  - **Collaudo visivo Ollama con modello live**: **RINVIATO** per disposizione esplicita dell'operatore (nessun rilancio smoke test visivo o incremento timeout nella sessione corrente).
- **SMTP con Ricezione Reale**: **SUPERATO** (Singolo invio diagnostico verso casella concordata accettato da Gmail SMTP e recapito confermato dall'operatore. Nessun ulteriore invio diagnostico necessario).
- **Flusso Completo di Verifica Email Reale**: **NON ESEGUITO** (In attesa dello sblocco della connessione database con TLS strict per eseguire l'attivazione end-to-end tramite app).
- **Unit Test (Vitest)**: **204/204 SUPERATI (100%)** su 21 file di test
  - **106 test preesistenti**: auth, codice fiscale, segnalazioni, guardie DB, rate-limiter, email-transport, mime-validator, storage provider, pipeline IA, layout mappa, nav-links, media-placeholder.
  - **8 test worker email**: validazione parametri, rifiuto live DB errato, blocco destinatario non autorizzato, verifica modalità dry-run senza modifiche Outbox, invio controllato solo con `--send`.
  - **26 test IA locale**: Ollama adapter isolation (6 test), validazione classificazione civica (8 test), verifica coerenza visivo-testuale fail-closed (12 test).
  - **12 test dossier**: CSV RFC 4180 con UTF-8 BOM, difesa Formula Injection, stampa multi-pagina, fail-closed 503 su DB down.
  - **14 test upload e route handler (Fase 3)**: `caricaUploadTemporaneo` (validazione utente attivo/verificato, magic bytes, persistenza), rollback compensativo su errore DB, protezione orfani in `.orphaned_storage_keys.json`, garbage collection non distruttiva e endpoint `POST /api/uploads` (401, 403, 413, 400, 200).
- **TLS Prisma strict su macOS**: **BLOCCATO**
  - **Stato Connettività Host e Porta Aiven**: `mysql-d1e002e-iisgalvanimi-6770.f.aivencloud.com:11582` risolto e raggiungibile via TCP.
  - **Client MySQL nativo su macOS (`/usr/local/bin/mysql`)**: **CONNESSO con SUCCESSO** con `--ssl-mode=VERIFY_IDENTITY` e `--ssl-ca=certs/ca.pem` (TLS 1.3 `TLS_AES_128_GCM_SHA256`, database `la_nostra_citta_test`, versione `8.4.11`).
  - **Connettore Prisma (`scripts/verify-aiven.ts`)**: fallisce con `Error opening a TLS connection: The certificate was not trusted` (categoria `TLS_CERTIFICATO`).
  - **Causa confermata sul certificato foglia Aiven**: tramite `/usr/bin/security verify-cert`, la policy generica (`-p basic`) passa con successo, mentre la policy SSL di sistema Apple (`-p ssl`) fallisce con `Cert Verify Result: Invalid Extended Key Usage for policy`. L'omissione dell'estensione `serverAuth` nel certificato del cluster Aiven ne impedisce la validazione da parte di `Security.framework` (utilizzato dal motore Rust di Prisma su macOS).
  - **Runtime Docker locale**: tentato avvio di Docker Desktop; il demone crasha all'avvio a causa della mancanza di supporto hardware ad Apple `Hypervisor.framework` (`kern.hv_support: 0`) su questo iMac (Mid 2010, `iMac11,3`). L'esecuzione in container Linux richiede il puntamento a un host Docker Linux esterno/remoto via `DOCKER_HOST`.
  - **Certificato Locale (`certs/ca.pem`)**: presente in `certs/ca.pem`, impronta SHA-256 `c42bdcbd0ec70a5dbf77e6b9c07e9037b76b18691b417713b134c2eb51914da7` identica al riferimento caricato da Prisma. La CA è corretta e valida, come confermato dal client MySQL nativo.

---

## Due Percorsi Disponibili per la Ripresa (Da Verificare)

> [!NOTE]
> Il supporto Aiven e l'ambiente Linux sono **due percorsi tecnici da verificare**, non soluzioni già collaudate sulla postazione.

### Percorso A — Risoluzione Certificato tramite Supporto Aiven (Da Verificare)
1. Richiedere al supporto Aiven l'eventuale emissione/aggiornamento del certificato TLS per il cluster MySQL con l'estensione standard:
   `X509v3 Extended Key Usage: TLS Web Server Authentication (1.3.6.1.5.5.7.3.1)`
2. Se supportato e aggiornato da Aiven, la verifica rigorosa di macOS Apple Security Framework passerà con `sslaccept=strict`.
3. Verificare con: `npm run verify:db`.

### Percorso B — Esecuzione del Progetto in Ambiente Linux con TLS strict (Da Verificare)
1. Eseguire l'applicazione o il server di test in un ambiente o container Linux (dove Prisma usa OpenSSL al posto di Apple Security Framework).
2. Generare Prisma Client per Linux (`npx prisma generate`), montare `ca.pem` in sola lettura e mantenere `DATABASE_URL` con `sslaccept=strict`.
3. Verificare la connessione rigorosa con OpenSSL su Linux senza bypass.

---

## Procedura per il Collaudo della Verifica Email (su `la_nostra_citta_test`)

Quando la connettività TLS strict al database sarà ripristinata:
1. **Configurazione Origine e Destinatario**:
   - `APP_URL` **deve coincidere con l'origine effettiva dell'app di collaudo**, attualmente `http://localhost:3001` (avviata tramite `npm run start:test`).
   - Configurare in `.env.local` la variabile obbligatoria per il destinatario autorizzato:
     `SMTP_TEST_ALLOWED_RECIPIENT="<casella-operatore>"`
2. Generare il token e il job Outbox tramite la registrazione o reinvio sull'app di collaudo (`http://localhost:3001`).
3. Eseguire la **verifica ispettiva (dry-run)** (nessun invio, nessuna modifica alla tabella Outbox):
   ```bash
   npm run worker:email:test -- --job-id <ID_JOB>
   ```
4. Eseguire l'**invio reale controllato** (richiede consenso esplicito `--send`):
   ```bash
   npm run worker:email:test -- --job-id <ID_JOB> --send
   ```
5. Confermare ricezione email reale, aprire `/verify?token=...` e verificare che la richiesta GET non attivi l'utente, quindi confermare via form POST e verificare il login.



---

## Collaudo Browser — Esiti

| Step | Esito |
| :--- | :--- |
| Accesso anonimo /dashboard -> redirect /login | SUPERATO |
| Registrazione e blocco pre-verifica | SUPERATO |
| Apertura link /verify senza consumo token | SUPERATO |
| Conferma form e login | SUPERATO |
| Dashboard e attributi cookie sessione | SUPERATO |
| Logout e invalidazione sessione | SUPERATO |
| Reset password nel browser | NON ESEGUITO (scelta operatore) |
| Reinvio verifica nel browser | NON ESEGUITO |
| **Upload foto + invio segnalazione (Fase 3)** | **NON ESEGUITO nel browser (in attesa di DB live; logica di dominio e route handler coperte offline da 14 unit test)** |

---

## Prima Attività della Prossima Sessione

**Collaudo manuale del flusso upload completo** — passi da eseguire in ordine:

1. Avviare il server con `npm run start:test` (localhost:3001, .env.test).
2. Login su `/login` con utente verificato.
3. Dashboard -> pulsante "Nuova Segnalazione".
4. Selezionare una foto JPEG o PNG reale, dimensione < 10 MiB.
5. Compilare e inviare il form (titolo, descrizione, coordinate).
6. Verificare persistenza:
   - Record `UploadTemporaneo` (stato `CONSUMATO`) e `Media` (stato `READY`) su `la_nostra_citta_test`.
   - File fisico presente in `.private_storage/<uuid>`.
   - Segnalazione visibile in dashboard.

---

## Come Riavviare il Server di Collaudo

```bash
npm run start:test
```

**Requisiti locali** (verificare senza stampare valori segreti):
- `.env.test` — contiene `DATABASE_URL` con endpoint Aiven, `sslcert` assoluto verso `certs/ca.pem`, `sslaccept=strict`.
- `certs/ca.pem` — certificato CA Aiven (percorso assoluto).
- `.private_storage/` — directory locale per file caricati (non tracciata in git).
- `.orphaned_storage_keys.json` — registro orfani (non tracciato in git).

---

## Vincoli di Sicurezza Permanenti

- **Database autorizzato**: esclusivamente `la_nostra_citta_test` (Aiven). Vietato `defaultdb` o qualsiasi altro DB.
- **TLS**: `sslaccept=strict` obbligatorio. Nessun fallback non cifrato.
- **Moderazione IA**: SOSPESA. Nessuna chiamata a modelli esterni.
- **S3**: interfaccia predisposta, nessun adapter attivo. Richiesta di provider non implementato -> eccezione esplicita, nessun fallback silenzioso.
- **Pulizia upload**: solo `npm run cleanup:uploads` (manuale o schedulatore OS). Nessun demone interno.
- **Test**: non eseguire suite su database diversi da `la_nostra_citta_test`. Non usare `db push`, `migrate reset` o `migrate resolve` per aggirare errori.

---

## File Chiave

| File | Scopo |
| :--- | :--- |
| `src/lib/domain/auth.ts` | Autenticazione stateful, token, sessioni |
| `src/lib/domain/segnalazioni.ts` | Creazione atomica segnalazione con upload |
| `src/lib/domain/uploads.ts` | Ciclo vita UploadTemporaneo, orfani, GC |
| `src/lib/storage/mime-validator.ts` | Validazione strutturale MIME (chunk/magic bytes) |
| `src/lib/storage/local-provider.ts` | LocalDiskStorageProvider |
| `src/app/api/uploads/route.ts` | Endpoint POST /api/uploads (max 50 MiB) |
| `src/app/(dashboard)/dashboard/nuova-segnalazione-form.tsx` | Form upload UI |
| `tests/helpers/test-db.ts` | Guardie di sicurezza DB test |
| `scripts/cleanup-uploads.ts` | Comando GC manuale |
| `prisma/migrations/20261006000000_init_mysql/` | Migrazione MySQL (UTF-8 no BOM) |
| `scripts/verify-aiven.ts` | Diagnostica connessione Aiven read-only |
| `docs/ADR-005.md` | Decisione architetturale vincoli media |

---

## Riferimenti Progettuali Fondamentali

- **Schema ER Concettuale (PNG)**: [`docs/progetto/schema_er_concettuale.png`](file:///Users/john/Desktop/la-nostra-citta-webapp/docs/progetto/schema_er_concettuale.png) e versione estesa [`docs/progetto/03B_ER_estensione_tecnica.png`](file:///Users/john/Desktop/la-nostra-citta-webapp/docs/progetto/03B_ER_estensione_tecnica.png)
- **Modello Logico Relazionale**: [`docs/progetto/04_MODELLO_LOGICO.md`](file:///Users/john/Desktop/la-nostra-citta-webapp/docs/progetto/04_MODELLO_LOGICO.md)
- **Checklist di Collaudo Finale Operatore**: [`docs/CHECKLIST_COLLAUDO_FINALE.md`](file:///Users/john/Desktop/la-nostra-citta-webapp/docs/CHECKLIST_COLLAUDO_FINALE.md)

---

## Distinzione Operativa: Prove Svolte vs Prove da Eseguire in Laboratorio

### 1. Prove Già Svolte con Successo (Verificate)
- **Unit Testing Offline**: 204/204 test superati (100%) su 21 file Vitest (inclusi 14 test Fase 3 upload e 26 test adapter/contratti IA Ollama).
- **Controllo Statico e Qualità**: 0 errori TypeScript (`tsc --noEmit`), 0 errori e 0 warning ESLint (`npm run lint`).
- **Build di Produzione**: 19 route Next.js App Router (Turbopack) compilate con esito positivo (`npm run build`).
- **Integrazione IA Locale (RF08)**: inferenza reale con `qwen3-vl:2b-instruct` (testo lampione -> categoria «luce») e validazione catalogo chiuso.
- **Parser EXIF (RF09)**: parser reale nativo locale (`NativeExifMetadataAdapter`), estrazione segmenti binari JPEG offline verificata.
- **SMTP Diagnostico**: invio singolo verso casella concordata accettato da Gmail SMTP e recapito reale in casella confermato dall'operatore.
- **Riscontro Storico Database (Aiven live)**: 45 test di integrazione DB superati (T05-T14) e 12/12 step E2E Auth superati su `la_nostra_citta_test`.

### 2. Prove Ancora da Eseguire in Laboratorio
- **Risoluzione TLS strict / Connettività DB**:
  - Verifica Percorso A (richiesta estensione `serverAuth` al supporto Aiven) o Percorso B (esecuzione applicazione in container/ambiente Linux con stack OpenSSL).
- **Flusso Completo di Verifica Email Reale**:
  - Registrazione via app di collaudo (`http://localhost:3001`), generazione token Outbox su `la_nostra_citta_test`, esecuzione controllata con `npm run worker:email:test -- --job-id <ID> --send`, verifica link `/verify?token=...` via form POST e login successivo.
- **Collaudo Browser Manuale Flusso Upload Foto (Fase 3)**:
  - Avvio server `npm run start:test` su porta 3001, upload file reale < 10 MiB, verifica record `UploadTemporaneo` (CONSUMATO) e `Media` (READY) su DB e persistenza file in `.private_storage/`.
- **Collaudi Browser Aggiuntivi**:
  - Reinvio verifica e reset password tramite interfaccia web.
- **Collaudo Visivo Ollama (RF10 con Modello Live)**:
  - Verifica della coerenza visivo-testuale con modello live su immagine reale/sintetica (rinviato su istruzione operatore).
- **Resa Cartacea del Dossier**:
  - Stampa fisica su carta o esportazione PDF da anteprima di stampa della rotta `/dossier`.
