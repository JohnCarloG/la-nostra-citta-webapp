# Ripresa Laboratorio - La Nostra Città, Il Nostro Futuro

## Obiettivo del Progetto
Realizzare un'applicazione web sicura per permettere ai cittadini di inviare, sostenere e monitorare segnalazioni civiche. Include gestione transazionale forte, moderazione IA e tracciamento audit.

## Riferimenti Specifica
I file autoritativi si trovano in `docs/progetto/`:
- `00_LEGGIMI.md`
- `01_REVISIONE_ELABORATO.md`
- `02_REQUISITI_E_VINCOLI.md`
- `04_MODELLO_LOGICO.md`

## Stato Fasi
- **Fase 1 / 1B**: Base implementata. Schema e migrazioni generati, ma non eseguiti su ambiente reale per fallimento Docker.
- **Fase 2 (Auth/Segnalazioni)**: Logica di dominio (token opachi, hashing, atomicità e validazione), Server Actions e pagine UI scritte, ma fallisce alla compilazione (TS2305).
- **Fase 3**: NON AVVIATA. Vietato l'avvio della Fase 3 finché la Fase 2 non sarà stabile, compilata senza errori e con test passanti.

## File Principali
- `src/lib/domain/auth.ts`: Dominio autenticazione (no JWT, stateful DB token)
- `src/lib/domain/segnalazioni.ts`: Dominio segnalazioni e lock atomici
- `prisma/schema.prisma`: Schema database
- `prisma/migrations/`: File SQL dei trigger/constraint
- `tests/unit/auth.test.ts`, `tests/unit/segnalazioni.test.ts`: Unit test

## Versioni
- **Dichiarate nel lockfile/package.json**: Next.js 15, Prisma `5.22.0`, Node.js (motore >= 18).
- **Effettivamente rilevate/in uso**: Node.js `24.21.0` (dal laboratorio locale), `vitest` v3, TypeScript presenta anomalie di risoluzione sul pacchetto generato `@prisma/client` a causa dell'ambiente ES/CommonJS misto o installazione parziale.

## Ultimi Comandi Eseguiti
- `npm run build` -> FALLITO: `TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`.
- `npx vitest run ...` -> FALLITO: Mocks Prisma incompleti / `mPrisma is not a constructor`.
- `Compress-Archive` -> RIUSCITO, ma il build/TS erano invalidi.

## Errori Aperti e Prossimi Passi
1. **Risolvere TS2305**: Ripristinare un ambiente `node_modules/@prisma/client` sano, investigando sulle peer dependencies.
2. **Mock Test**: Assicurarsi che `tests/unit/auth.test.ts` implementi `tokenAccount.updateMany` correttamente.
3. **PostgreSQL**: Verificare e se possibile riavviare Docker Daemon per applicare realmente i trigger e rimuovere `.skip()` dai test di integrazione in `tests/integration/segnalazioni-db.test.ts`.

## Avvio Locale e Test
- Per installare: `npm install`
- Per generare il client: `npx prisma generate`
- Per avviare: `npm run dev`
- Per i test: `npm run test` (esegue `vitest`)

## Prerequisiti Laboratorio
- **Node.js** ed **npm** installati.
- **Docker Desktop / PostgreSQL** funzionante e connesso (Stringa in `.env`).
- File `.env` configurato usando `.env.example` (database url, jwt mock secret, ecc).

*Attenzione: I dati del database (Volumi Docker) non sono inclusi in questo backup del codice.*

---

## Prompt di Ripresa (Copia e incolla per il prossimo agente)

Sei il developer responsabile del progetto "La Nostra Città, Il Nostro Futuro".
Inizia leggendo `RIPRESA_LABORATORIO.md`, `PROJECT_STATUS.md` e `VERIFICATION.md`, ed ispeziona le specifiche dentro `docs/progetto/`.
Ispeziona il repository effettivo in cui ti trovi, preservando scrupolosamente tutte le modifiche e l'architettura dei domini (`auth.ts`, `segnalazioni.ts`, migrazioni SQL).
Prima di scrivere nuovo codice o iniziare la Fase 3, devi OBBLIGATORIAMENTE:
1. Diagnosticare gli errori di installazione e generazione Prisma/TypeScript (TS2305) presenti in ambiente e fixarli affinché `npm run build` ed `npm test` funzionino puliti.
2. Verificare separatamente la disponibilità di PostgreSQL/Docker e, se accessibile, testare i trigger ed i vincoli.
3. Completare rigorosamente e collaudare la revisione della Fase 2; non avviare la Fase 3 finché l'ambiente non è verde.
4. Non considerare attendibili le dichiarazioni delle chat o registri precedenti prive di evidenze log effettive o codice compilante.
