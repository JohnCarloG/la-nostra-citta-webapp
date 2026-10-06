# ADR-001: Selezione dello Stack Tecnologico

## Contesto
Il progetto richiede la realizzazione di una piattaforma web completa ("La Nostra Città, Il Nostro Futuro") con backend, frontend, database relazionale, upload di file, esecuzione di processi in background (IA e invio mail) e requisiti di accessibilità e sicurezza. Non è presente un repository di codice preesistente. È richiesto di non introdurre microservizi, ma di optare per una soluzione relazionale full stack.

## Decisione
Abbiamo scelto di utilizzare **Next.js (App Router)** come framework full stack.
*   **Linguaggio**: TypeScript.
*   **Frontend**: React, TailwindCSS, componenti UI accessibili (Radix/shadcn).
*   **Backend/API**: Next.js Route Handlers.
*   **Database**: PostgreSQL.
*   **ORM**: Prisma ORM (ottimo supporto per migrazioni, tipi sicuri e schema relazionale).
*   **Autenticazione**: NextAuth.js (v5 / Auth.js) con credentials provider.
*   **Background Jobs/Code**: Outbox pattern supportato dal database.

### Versioni Installate e Validate:
*   **Node.js**: v24.21.0
*   **npm**: 10.9.9
*   **Next.js**: 16.3.8
*   **Prisma / @prisma/client**: 5.22.0
*   **PostgreSQL**: 15 (container locale indisponibile per blocco Docker)

**Evidenze sul conflitto di dipendenze**: 
Durante l'installazione originale, si è manifestato un conflitto di dipendenze (come da log di sistema: `peer effect@"^4.0.1" from @effect/vitest@4.0.1` vs `effect@"4.0.0-rc.115"` richiesto da `alchemy` in `@prisma/composer`). Non avendo una baseline per `docs/` e `verifica/`, garantisco l'integrità perché Next.js è stato installato in directory temporanea, e poi spostato escludendo overwrite.
Ho rimosso le estensioni sperimentali (`@prisma/composer` e dipendenze) e declassato alla Major 5, senza alcun parametro `--legacy-peer-deps`. L'audit corrente non presenta warning ERESOLVE.

## Conseguenze
*   Necessario configurare PostgreSQL locale per i test.
*   La validazione dei file (es. estrazione EXIF e limiti di dimensione) avverrà in streaming o tramite caricamento temporaneo su disco locale/storage S3 compatibile prima del salvataggio finale.
