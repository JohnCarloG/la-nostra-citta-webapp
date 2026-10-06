# Registro Verifiche

Le verifiche formali e locali hanno evidenziato che la Fase 2 non è completa né stabile, nonostante l'implementazione logica sia stata depositata in repository.

## Verifiche Eseguite
- **Validazione Formale Codice**: Le funzioni `verificaEmail` e `eseguiResetPassword` implementano l'uso di `updateMany` con vincoli di nullità per simulare l'atomicità ("Compare-And-Swap"). La funzione `getSessionUtente` omette correttamente le password e la `createSegnalazioneAtomica` non legge più i metadati in trust dal payload client.

## Verifiche Fallite (Errori Effettivi)
- **Compilazione TypeScript**: `npm run build` ed `npx tsc --noEmit` falliscono con `error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`. La causa è ignota: si ipotizza un'errata o parziale generazione del prisma client locale.
- **Unit Testing (Vitest)**: In `tests/unit/auth.test.ts` e `segnalazioni.test.ts` l'esecuzione restituisce failure dovute a dipendenze non risolvibili ed errori nei Mock di Prisma (es. `TypeError: tx.tokenAccount.updateMany is not a function` o `is not a constructor`).

## Test Saltati o TODO
- `tests/integration/segnalazioni-db.test.ts`: 6 suite di test su vincoli logici e trigger deferibili in stato `.skip()` o `.todo()`.
- Motivazione: Test prettamente di integrazione transazionale, resi impossibili dall'assenza documentata di un demone PostgreSQL / Docker nel laboratorio locale.

## Conclusioni
La codebase è stata parzialmente adeguata ai requisiti di logica, ma non è collaudata a livello formale. L'integrità del sistema è **NON VERIFICATA**.
