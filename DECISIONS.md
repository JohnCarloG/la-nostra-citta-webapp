# Registro delle Decisioni

1. **Stack Tecnologico (ADR-001)**: Next.js (App Router) + Prisma ORM (5.22.0) + MySQL su Aiven. Target autorizzato esclusivo: MySQL su cloud provider Aiven con connessione sicura TLS/SSL (PostgreSQL non autorizzato per il target finale).
2. **Autenticazione e Sessioni (ADR-002)**: Sessioni stateful custom su database con token opachi e hashing SHA-256 (nessun JWT). Invalidazione immediata su logout, cambio password o sospensione account.
3. **Gestione Media e Integrità Referenziale (ADR-005)**:
   - FK composta `Media(id, segnalazione_id)` <- `AnalisiIa(media_id, segnalazione_id)` come garanzia a livello di motore DB (MySQL InnoDB).
   - Vincolo di cardinalità minima sui media (almeno uno READY) garantito a livello applicativo transazionale (`createSegnalazioneAtomica`).
   - Percorso di rimozione dell'ultimo media mancante e protetto da omissione di operazioni di modifica/cancellazione non protette.
   - Nessun retry automatico in background spacciato per implementato.
   - Rilevazione versione MySQL da eseguire a runtime tramite query al servizio.
