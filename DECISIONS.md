# Registro delle Decisioni

1. **Stack Tecnologico (ADR-001)**: Next.js (App Router) + Prisma ORM (5.22.0) + MySQL su Aiven. Target autorizzato esclusivo: MySQL su cloud provider Aiven con connessione sicura TLS/SSL (PostgreSQL non autorizzato per il target finale).
2. **Autenticazione e Sessioni (ADR-002)**: Sessioni stateful custom su database con token opachi e hashing SHA-256 (nessun JWT). Invalidazione immediata su logout, cambio password o sospensione account.
3. **Gestione Media e Integrità Referenziale (ADR-005)**:
   - FK composta `Media(id, segnalazione_id)` <- `AnalisiIa(media_id, segnalazione_id)` come garanzia a livello di motore DB (MySQL InnoDB).
   - Vincolo di cardinalità minima sui media (almeno uno READY) garantito a livello applicativo transazionale (`createSegnalazioneAtomica`).
   - Percorso di rimozione dell'ultimo media mancante e protetto da omissione di operazioni di modifica/cancellazione non protette.
   - Nessun retry automatico in background spacciato per implementato.
   - Rilevazione versione MySQL da eseguire a runtime tramite query al servizio.
4. **Architettura Upload Fisico e Storage Privato (ADR-006)**:
   - **Astrazione e Storage Privato (VI10)**:
     Lo storage locale privato su disco (`LocalDiskStorageProvider` con cartella `.private_storage/`) è **l'unica implementazione attiva**.
     Il supporto AWS S3 è **soltanto predisposto tramite l'interfaccia `StorageProvider`**: nessun adapter S3 è attualmente sviluppato.
     Le sole variabili d'ambiente NON sono sufficienti ad attivare S3; la richiesta esplicita di un provider non implementato solleva un'eccezione immediata bloccante e non è ammesso alcun fallback locale silenzioso.
   - **Endpoint Dedicato e Limiti di Richiesta (RF04 / VI04)**:
     L'upload fisico avviene tramite Route Handler dedicato (`POST /api/uploads`), dimensionato a 10 MiB per immagini (JPEG, PNG, WebP) e 50 MiB per video (MP4).
     Questa scelta isola il carico volumetrico ed evita di aumentare indiscriminatamente i limiti di body delle Server Action per l'intera applicazione, che rimangono protette dal limite predefinito di 1 MiB.
   - **Validazione Strutturale e Decodificabilità dei File (Zero-Trust)**:
     I magic bytes identificano solo il formato candidato. Il validatore effettua verifiche strutturali sui segmenti/chunk interni (JPEG SOI/SOF/EOI, PNG IHDR/IDAT/IEND, WebP RIFF/VP8, MP4 ftyp+moov/mdat) con limiti restrittivi sulle iterazioni per prevenire DoS.
     File troncati, frammenti orfani o payload arbitrari preceduti da sole intestazioni sono categoricamente respinti.
     I metadati EXIF GPS vengono estratti in modo resiliente (senza crash su dati malformati) e trattati esplicitamente come **indicativi e non probatori**: non costituiscono prova attendibile del luogo reale dello scatto e richiedono sempre conferma dell'utente.
   - **Mancanza di Commit Condiviso, Tracciamento Orfani e Concorrenza**:
     La transazione DB segue l'upload nello storage. In caso di fallimento della registrazione DB, scatta la cancellazione compensativa del file fisico; se anche la cancellazione compensativa fallisce, l'identificatore del file orfano viene registrato in modo persistente in `.orphaned_storage_keys.json` per recupero e bonifica da processi di audit.
     La procedura di garbage collection (`pulisciUploadTemporaneiScaduti`) opera con salvaguardie di concorrenza rigorose:
     1. Non tocca MAI record con stato `CONSUMATO` o aventi `consumato_il IS NOT NULL`, né file referenziati nella tabella `Media`.
     2. Esegue prima l'eliminazione condizionata su DB (dove `consumato_il IS NULL` e `scade_il < NOW()`): se una transazione concorrente consuma l'upload nell'istante esatto della pulizia, l'eliminazione DB restituisce 0 e il file fisico non viene toccato.
     3. La procedura NON è un demone in background (nessun esecutore attivo nel processo Next.js); viene invocata esclusivamente da comando manuale (`npm run cleanup:uploads`) o da schedulatore di sistema operativo (cron).
   - **Moderazione IA**: Rigorosamente **SOSPESA** nella presente iterazione.

