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

## Stato di Avanzamento (checkpoint 2026-10-12)

| Fase | Stato | Dettaglio |
| :--- | :--- | :--- |
| Fase 0 — Requisiti | COMPLETATA | Requisiti in `docs/progetto/` |
| Fase 1 — Schema MySQL | COMPLETATA | Migrazione `20261006000000_init_mysql` applicata, 7 CHECK attivi, FK composta RESTRICT |
| Fase 2 — Dominio, Auth, UI | COMPLETATA e collaudata | 62/62 unit, 21/21 integrazione, 12/12 E2E auth |
| Fase 3 — Upload Fisico | IMPLEMENTATA (storage locale) | Collaudo manuale NON ESEGUITO |
| Moderazione IA | SOSPESA | Nessuna chiamata esterna attiva |
| S3 | Solo interfaccia | Nessun adapter implementato |

---

## Esiti Test (ultima esecuzione dichiarata)

- **Unit Test (Vitest)**: **62/62 superati**
  - 14 auth, 14 segnalazioni, 10 guardie DB, 5 rate-limiter, 5 email-transport
  - 11 mime-validator strutturale (JPEG/PNG/WebP/MP4 chunk, EXIF malformato), 3 storage-provider
- **Integrazione DB Aiven**: **21/21 superati** su `la_nostra_citta_test`
  - 6 auth-db, 7 segnalazioni-db, 8 uploads-db
- **E2E Auth (script)**: **12/12 step superati**
- **Build Next.js**: 0 errori, 8 route pronte
- **TypeScript / ESLint**: 0 errori, 0 warning

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
| **Upload foto + invio segnalazione (Fase 3)** | **NON ESEGUITO -- prima attivita' prossima sessione** |

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
