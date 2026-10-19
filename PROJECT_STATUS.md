# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro  
**Target Autorizzato**: Next.js 16 (App Router) + Prisma ORM (5.22.0) + MySQL 8.4 su Aiven  
**Stato Globale**: **Fase 4 (Community e Supervisione) Completata e Collaudata con Successo** su Aiven MySQL (`la_nostra_citta_test`).  
- **62/62 Unit Test passati**  
- **32/32 Test di Integrazione DB superati** su Aiven live (inclusi i test formali di specifica **T05, T06, T11, T12, T13**)  
- **12/12 Step E2E Auth superati**  
- **16 Route di produzione** compilate con successo in Next.js  
- **TypeScript**: 0 errori (`tsc --noEmit`)  
- **ESLint**: 0 errori e 0 warning  
- **Storage Privato e Media**: protetto tramite endpoint dedicato `/api/media/[id]` conforme alle regole di visibilità. Collaudo manuale upload fisico **RINVIATO alla fine** per scelta dell'operatore (non bloccante).  
- **Moderazione IA**: rigorosamente **SOSPESA** (nessuna spesa o servizio esterno attivato).

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
  - Transizioni di moderazione consentite:
    - da `PENDENTE` o `IN_REVISIONE` a `APPROVATA` o `RIFIUTATA`.
    - da `APPROVATA` a `IN_REVISIONE` (criticità).
    - da `RIFIUTATA` a `IN_REVISIONE` (riapertura motivata).
  - Transizioni di avanzamento consentite:
    - da `RICEVUTA` a `PRESA_IN_CARICO` (richiede `APPROVATA`).
    - da `PRESA_IN_CARICO` a `INVIATA_AI_CANDIDATI` (richiede `APPROVATA`).
    - da qualunque stato ad avanzamento `RITIRATA` (con motivazione; stato terminale).
  - **Controllo Concorrenza Ottimistica e Row-Level Lock**:
    - Serializzazione con lock `FOR UPDATE` e verifica stringente su `expectedRevision` e `expectedState`. Due moderatori concorrenti: uno solo applica la decisione, il secondo riceve errore 409 `ConcurrencyConflictError`.
  - **Gestione Categorie Confermate**: associazione M:N con `Categoria` a catalogo con validazione di unicità e appartenenza.
- **Accesso Protetto ai Media senza Percorsi Fisici Esposti (VI06, VI10)**:
  - Endpoint dedicato `/api/media/[id]`. Lo storage fisico `.private_storage/` resta protetto e inaccessibile da browser.
  - La route verifica l'autorizzazione: serve il file con header corretti se la segnalazione è pubblica; per segnalazioni private, verifica sessione dell'autore o del comitato, altrimenti risponde 404 senza rivelare l'esistenza del file (T12).

---

## Stato Verifiche e Collaudo

| Suite di Verifica | Obiettivo / Test Coperti | Esito Reale |
| :--- | :--- | :--- |
| **Unit Test (Vitest)** | 14 auth, 14 segnalazioni, 10 guardie DB, 5 rate-limiter, 5 email-transport, 11 mime-validator, 3 storage-provider | **62/62 SUPERATI (100%)** |
| **Integrazione DB Aiven** | MySQL InnoDB su `la_nostra_citta_test`: 6 auth-db, 7 segnalazioni-db, 8 uploads-db, 11 fase4-community (**T05, T06, T11, T12, T13**) | **32/32 SUPERATI (100%)** |
| **E2E Auth Script** | Ciclo end-to-end su Aiven: registrazione, verifica, login, cambio password e revoca sessioni | **12/12 SUPERATI (100%)** |
| **TypeScript Typecheck** | `tsc --noEmit` su intero progetto | **0 ERRORI** |
| **ESLint** | Regole Next.js e TypeScript | **0 ERRORI, 0 WARNING** |
| **Build Produzione** | `next build` Turbopack | **16 ROUTE PRONTE** |

---

## Limiti Aperti e Funzionalità Non Implementate (Dichiarati Esplicitamente)

1. **Collaudo Manuale Upload**: implementato a livello di endpoint, validazione, storage e test automatici DB; il collaudo manuale tramite form browser resta **rinviato alla fine per scelta dell'operatore** e non blocca la Fase 4.
2. **Moderazione IA (Fase 5)**: rigorosamente **SOSPESA**. Nessun modello esterno o servizio a pagamento è stato attivato.
3. **Predisposizione Storage S3**: solo architetturale via interfaccia `StorageProvider`. Nessun adapter S3 sviluppato.
4. **Worker di Retry Asincrono**: i campi `tentativi` e `prossimo_tentativo_il` in `Outbox` e `AnalisiIa` sono predisposizioni di schema.
5. **Rimozione Media**: la cancellazione dei singoli media da segnalazioni pubblicate è non implementata nel dominio per tutelare l'integrità probatoria.
