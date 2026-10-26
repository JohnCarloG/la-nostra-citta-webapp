# Modello logico relazionale e dizionario
## Convenzioni
PK = chiave primaria; FK = chiave esterna; UQ = univoco; ? = nullable; tutti gli altri attributi sono obbligatori salvo default indicato. ID tecnici UUID generati dal server; timestamp UTC con fuso. Le relazioni del nucleo corrispondono al diagramma ER concettuale (`docs/progetto/schema_er_concettuale.png`, sorgente vettoriale `schema_er_concettuale.svg` e Mermaid `schema_er_concettuale.mmd`). Gli attributi tecnici di gestione e sicurezza sono raffinamenti logici, non nuove entità concettuali. Nessun campo contiene liste separate da virgole.

## Nucleo normalizzato
QUARTIERE(id PK, nome UQ). Catalogo amministrato; può essere vuoto inizialmente senza impedire registrazione.
UTENTE(id PK, nome, cognome, email_normalizzata UQ, password_hash, codice_fiscale? UQ, verificato_il?, ruolo, stato_account, quartiere_id? FK→QUARTIERE.id, creato_il). Il codice fiscale è obbligatorio alla registrazione, validato formalmente (algoritmo ministeriale D.M. 23/12/1976, carattere di controllo CIN ed omocodia). È nullable a livello di schema per retrocompatibilità con i record preesistenti. Il quartiere di residenza è selezionato dal catalogo amministrato. Il CF identifica l'unicità dell'utenza e non prova la residenza anagrafica né è mai esposto pubblicamente.
SEGNALAZIONE(id PK, autore_id FK→UTENTE.id, descrizione, latitudine, longitudine, origine_posizione, stato_avanzamento, stato_moderazione, revisione DEFAULT 1, creata_il, aggiornata_il).
MEDIA(id PK, segnalazione_id FK→SEGNALAZIONE.id, storage_key UQ, tipo, mime, byte_size, durata_secondi?, sha256, stato_file, exif_lat?, exif_lon?, derivato_key? UQ, creato_il).
SOSTEGNO(utente_id PK/FK→UTENTE.id, segnalazione_id PK/FK→SEGNALAZIONE.id, creato_il).
CATEGORIA(id PK, codice UQ, nome, attiva DEFAULT true).
SEGNALAZIONE_CATEGORIA(segnalazione_id PK/FK→SEGNALAZIONE.id, categoria_id PK/FK→CATEGORIA.id). Contiene categorie confermate, non ipotesi IA.
EVENTO_STATO(id PK, segnalazione_id FK→SEGNALAZIONE.id, attore_id? FK→UTENTE.id, tipo_attore, ambito, da_stato?, a_stato, motivazione, revisione, creato_il).

## Domini e semantica
UTENTE.ruolo: CITTADINO, COMITATO. stato_account: ATTIVO, SOSPESO. verificato_il valorizzato significa verifica del canale email completata, non identità civile certificata.
SEGNALAZIONE.stato_avanzamento: RICEVUTA, PRESA_IN_CARICO, INVIATA_AI_CANDIDATI, RITIRATA. stato_moderazione: PENDENTE, IN_REVISIONE, APPROVATA, RIFIUTATA. origine_posizione: MANUALE, EXIF_CONFERMATO. revisione intero positivo.
MEDIA.tipo: FOTO, VIDEO; stato_file: READY, QUARANTENA, ERRORE. byte_size >0; durata richiesta positiva per video, NULL per foto; exif_lat e exif_lon entrambi NULL oppure entrambi validi. Conservare separatamente la posizione confermata della segnalazione: non è duplicazione dello stesso fatto.
EVENTO_STATO.ambito: AVANZAMENTO, MODERAZIONE. tipo_attore: UTENTE, SISTEMA. CHECK (tipo_attore=UTENTE e attore_id non NULL) oppure (tipo_attore=SISTEMA e attore_id NULL). da_stato NULL solo per evento iniziale; a_stato coerente con ambito. Il primo inserimento crea due eventi iniziali. motivazione sempre presente, anche per l'automatismo.

## Cardinalità del concettuale
UTENTE (0,N) CREA SEGNALAZIONE (1,1).
UTENTE (0,1) RISIEDE_IN QUARTIERE (0,N).
SEGNALAZIONE (1,N) HA MEDIA (1,1), riferito alle segnalazioni inviate. Gli upload temporanei precedono il nucleo.
UTENTE (0,N) SOSTIENE SEGNALAZIONE (0,N), con attributo data del sostegno; diventa SOSTEGNO.
SEGNALAZIONE (0,N) CLASSIFICATA_IN CATEGORIA (0,N), perché la classificazione può essere ancora pendente.
SEGNALAZIONE (1,N) HA_STORIA EVENTO_STATO (1,1).
UTENTE (0,N) ESEGUE EVENTO_STATO (0,1); zero utente significa evento di sistema, con tipo_attore obbligatorio.

## Estensione implementativa — immagine 03B
AUDIT_EVENTO(id PK, attore_id? FK→UTENTE.id, tipo_attore, segnalazione_id? FK→SEGNALAZIONE.id, azione, request_id, dati_json, creato_il). Registra anche sostegni e azioni non rappresentate da EVENTO_STATO. JSON contiene solo dettaglio tecnico non interrogato come relazione; nessuna copia di password o contenuti privati. Segnalazione nullable per eventi di account; attore segue CHECK precedente.
ANALISI_IA(id PK, segnalazione_id FK→SEGNALAZIONE.id, media_id? FK→MEDIA.id, revisione, modulo, versione_modello, versione_policy, input_hash, stato_esecuzione, esito?, punteggio?, dettagli_json, tentativi DEFAULT 0, creata_il, completata_il?). Moduli MODERAZIONE, CLASSIFICAZIONE, EXIF, COERENZA. Stati QUEUED/RUNNING/SUCCEEDED/FAILED/OBSOLETE. EXIF usa versione_parser nel campo versione_modello, esplicitamente come identificatore tecnico. FK composta (media_id,segnalazione_id) verso MEDIA(id,segnalazione_id), che richiede UQ sulla coppia, evita collegamenti a media di un'altra segnalazione. Chiave idempotenza UQ(segnalazione_id,revisione,modulo,input_hash,versione_modello,versione_policy); hash include identificatore del media per analisi per-file. punteggio opzionale 0..1; non tutti i provider offrono confidenza calibrata.
SUGGERIMENTO_CATEGORIA(analisi_id PK/FK→ANALISI_IA.id, categoria_id PK/FK→CATEGORIA.id, confidenza?). Solo analisi CLASSIFICAZIONE; vincolo di servizio o trigger. L'associazione confermata resta SEGNALAZIONE_CATEGORIA.
UPLOAD_TEMPORANEO(id PK, proprietario_id FK→UTENTE.id, storage_key UQ, tipo, mime, byte_size, sha256, durata_secondi?, exif_lat?, exif_lon?, stato, scade_il, consumato_il?). Stati IN_CARICAMENTO/VALIDO/SCARTATO/CONSUMATO. Consumo una sola volta, nella transazione di invio; storage_key è trasferita logicamente a MEDIA senza spostamento obbligatorio del file. Limiti e colonne coerenti con MEDIA.
TOKEN_ACCOUNT(id PK, utente_id FK→UTENTE.id, tipo, token_hash UQ, scade_il, usato_il?, creato_il); tipi VERIFICA_EMAIL/RESET_PASSWORD. Mai token grezzo nel DB.
SESSIONE(id PK, utente_id FK→UTENTE.id, token_hash UQ, scade_il, revocata_il?, creato_il). Adattabile alle sessioni native del framework, mantenendo la stessa semantica.
OUTBOX(id PK, segnalazione_id? FK→SEGNALAZIONE.id, revisione DEFAULT 1, tipo_evento, payload_json, creata_il, elaborata_il?, tentativi DEFAULT 0, prossimo_tentativo_il?). Supporta sia eventi di segnalazione per la pipeline IA, sia eventi di comunicazione asincrona (INVIO_EMAIL) con instradamento dedicato, tentativi limitati e backoff esponenziale. Consegna eseguita rigorosamente fuori da transazioni DB aperte.
RICHIESTA_IDEMPOTENTE(utente_id PK/FK→UTENTE.id, chiave PK, payload_hash, segnalazione_id? FK→SEGNALAZIONE.id, stato, scade_il). Impedisce duplicazione per ritrasmissione; stessa chiave con payload diverso restituisce conflitto.

## Normalizzazione e ridondanze intenzionali
Ogni tabella descrive un fatto e gli attributi dipendono dalla chiave. Sostegni e categorie sono relazioni associative senza gruppi ripetuti: niente categorie in un testo CSV. Nome quartiere dipende da QUARTIERE.id, non dall'utente. Le chiavi alternative email e codice categoria sono esplicite. Per il nucleo, le dipendenze funzionali degli attributi descrittivi hanno una chiave come determinante: schema in 3NF, assumendo i domini descritti.
Stato corrente e storico sono una ridondanza intenzionale per letture efficienti: non sostituire uno con l'altro; aggiornarli atomicamente e testarne la coerenza. Conteggio sostegni è derivato, non memorizzato nel nucleo. Metadati EXIF sono evidenze sul file, coordinate della segnalazione sono la decisione confermata: possono differire legittimamente.

## Applicazione dei vincoli nel DB e nel servizio
- **Vincoli garantiti dal Database (MySQL 8.4 InnoDB)**:
  - Chiavi Primarie (PK) e Univoche (UNIQUE);
  - Integrità referenziale (FK) con `ON DELETE RESTRICT ON UPDATE RESTRICT`;
  - CHECK constraints immediati su riga singola (7 vincoli verificati: `chk_segnalazione_coords`, `chk_media_bytesize`, `chk_exif_coords`, `chk_analisi_revisione`, `chk_analisi_punteggio`, `chk_audit_attore`, `chk_evento_attore`);
  - `FOR UPDATE SKIP LOCKED` e lock di riga per concorrenza priva di stalli (Outbox, transizioni di stato).
- **Vincoli garantiti dal Servizio Applicativo Transazionale**:
  - Cardinalità minima (almeno 1 media valido e non scaduto associato a ogni segnalazione creata);
  - Divieto di autosostegno (`autore_id !== utente_id`);
  - Verifica stato account attivo e verificato al momento del sostegno;
  - Consumo atomico monouso degli upload temporanei;
  - Politica di visibilità pubblica unificata (`APPROVATA` e `<> RITIRATA`);
  - Idempotenza e rispetto delle decisioni umane contro automazioni IA tardive (`SKIPPED_HUMAN_OVERRIDE`).
  - *Nota metodologica*: MySQL 8 InnoDB non supporta vincoli o trigger differiti (differibili a fine transazione, come in PostgreSQL); pertanto i vincoli multi-tabella e la cardinalità minima sul genitore sono rigorosamente governati dal servizio applicativo transazionale come unico writer di dominio.

Indice SEGNALAZIONE(stato_moderazione,stato_avanzamento,creata_il,id); SOSTEGNO(segnalazione_id); EVENTO_STATO(segnalazione_id,creato_il,id); ANALISI_IA(stato_esecuzione,creata_il); OUTBOX(elaborata_il,prossimo_tentativo_il).
FK verso fatti storici: RESTRICT. Disattivazione utente conserva riferimenti; anonimizzazione/cancellazione reale richiede una procedura dedicata con politiche concordate. Eliminazione allegato vietata se lascia senza prova una segnalazione inviata.

## Query di classifica — SQL illustrativo, adattare al DB scelto
SELECT s.id, s.descrizione, COUNT(u.id) AS sostegni_validi
FROM segnalazione s
LEFT JOIN sostegno v ON v.segnalazione_id = s.id
LEFT JOIN utente u ON u.id = v.utente_id
 AND u.stato_account = 'ATTIVO' AND u.verificato_il IS NOT NULL
WHERE s.stato_moderazione = 'APPROVATA'
 AND s.stato_avanzamento <> 'RITIRATA'
GROUP BY s.id, s.descrizione, s.creata_il
ORDER BY sostegni_validi DESC, s.creata_il ASC, s.id ASC;
Aggiungere paginazione e filtri. Contare u.id e non v.utente_id per escludere utenti sospesi. Non unire direttamente categorie e media nella stessa aggregazione perché moltiplicherebbe le righe e il conteggio.
