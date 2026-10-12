# Ripresa Laboratorio - La Nostra Città, Il Nostro Futuro

## Obiettivo del Progetto
Realizzare un'applicazione web sicura per permettere ai cittadini di inviare, sostenere e monitorare segnalazioni civiche. Include gestione transazionale forte, moderazione IA e tracciamento audit.

## Target Tecnologico Autorizzato
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Linguaggio**: TypeScript
- **ORM**: Prisma 5.22.0
- **Database**: MySQL su cloud provider **Aiven** con connessione TLS/SSL obbligatoria (target esclusivo autorizzato; PostgreSQL dismesso).
- **Ambiente Test**: Database dedicato `la_nostra_citta_test`.

## Stato di Avanzamento
- **Fase 0**: Requisiti e specifiche acquisiti in `docs/progetto/`.
- **Fase 1 / 1B**: Schema Prisma e migrazioni convertiti a MySQL InnoDB con caratteri utf8mb4. Codifiche UTF-8 senza BOM verificate. Dipendenze consolidate su Prisma 5.22.0 (errore TS2305 completamente risolto).
- **Fase 2**: Implementata con successo a livello di dominio, server actions e viste UI.
  - Validazione Prisma: 100% OK
  - Generazione Client: 100% OK
  - Compilazione TypeScript: 100% OK (0 errori)
  - Linting ESLint: 100% OK (0 errori, 0 warning)
  - Build Next.js: 100% OK
  - Unit Test (Vitest): 21/21 test passati
  - Test Integrazione MySQL: Pronti con helper di pulizia transazionale sicura `cleanTestDatabase` (bloccati solo in attesa dei parametri live Aiven).
- **Fase 3**: SOSPESA fino al collaudo formale sul database di test Aiven.

## File Chiave del Dominio e Verifiche
- `src/lib/domain/auth.ts`: Flusso di autenticazione stateful con token opachi e sessioni su DB (no JWT).
- `src/lib/domain/segnalazioni.ts`: Creazione atomica con lock upload temporanei; rimozione media non esposta.
- `prisma/schema.prisma`: Schema database per MySQL con FK composta `AnalisiIa` -> `Media`.
- `prisma/migrations/20261006000000_init_mysql/`: Migrazione iniziale MySQL (UTF-8 senza BOM).
- `tests/helpers/test-db.ts`: Utility di pulizia transazionale con controllo di sicurezza sul database esatto `la_nostra_citta_test`.
- `scripts/verify-aiven.ts`: Script di diagnostica connessione Aiven, TLS, versione server e collaudo E2E.
- `docs/ADR-005.md`: Decisione architetturale sui vincoli dei media e integrità referenziale.

## Istruzioni per il Collegamento Aiven
Per collegare l'istanza Aiven, inserire nel file `.env` locale:
```env
DATABASE_URL="mysql://<user>:<password>@<host>:<port>/la_nostra_citta_test?sslmode=REQUIRED"
```
Quindi eseguire:
1. Verifica connettività e ispezione preventiva:
   ```bash
   npx tsx scripts/verify-aiven.ts
   ```
2. Applicazione migrazioni sul database di test:
   ```bash
   npx prisma migrate deploy
   ```
3. Esecuzione suite di test (da eseguire 2 volte per verificare idempotenza e pulizia):
   ```bash
   npm run test
   ```
