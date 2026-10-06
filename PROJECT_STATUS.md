# Stato del Progetto

**Progetto**: La Nostra Città, Il Nostro Futuro
**Stato Globale**: Fase 2 Parzialmente Implementata, Verifiche Fallite / Da Completare

## Fasi
- **Fase 0 - Setup Iniziale**: Completato (Requisiti acquisiti, ambiente creato).
- **Fase 1 - Database e Modello**: Modello logico generato e tradotto in schema Prisma. Migrazioni applicate a livello script (20261006000001_constraints, 20261006000002_additional_constraints). 
  - **Criticità**: Non verificato. Il demone Docker PostgreSQL è risultato inattivo. Test integrazione DB `.skip()`.
- **Fase 1B - Consolidamento**: Dipendenze parzialmente sistemate (`prisma@5.22.0`, `@prisma/client@5.22.0`). 
  - **Criticità**: Build fallisce e TS genera errori `Module '"@prisma/client"' has no exported member 'PrismaClient'`. Possibile corruzione della cache o installazione client incompleta, da verificare.
- **Fase 2 - Autenticazione e Segnalazioni base**: 
  - **Codice Implementato**: Logica auth stateful (no JWT, usa un token opaco con record `Sessione` e `tokenAccount` per verifiche). Funzioni pure implementate e modificate per consumo atomico e controlli sicurezza base. Server actions aggiunte.
  - **Verifiche Fallite**: I test unitari (`vitest`) falliscono a causa dei mock incompleti o dell'albero di importazione di `@prisma/client` corrotto. 
  - **Verifiche Bloccate**: I test d'integrazione sul dominio che necessitano di PostgreSQL per la verifica effettiva della concorrenza transazionale e dei trigger sono in stato `TODO`/`SKIP`. Non vi è evidenza che i trigger operino correttamente oltre all'analisi statica.
- **Fase 3 - Upload Fisico**: NON AVVIATA. Vietato avviare prima della piena validazione Fase 2.

## Dettaglio Implementativo Sessione
- **Architettura Auth**: Viene usato un **Token Opaco** (verificato tramite lookup su db `Sessione`). Non si usano JWT.
