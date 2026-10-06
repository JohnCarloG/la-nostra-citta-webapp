# Architettura e flussi operativi
## Componenti e confini
Web UI accessibile → API applicativa → database relazionale. API e worker accedono a storage oggetti privato. Un'outbox persistente collega transazioni DB e worker. Adattatori separati per moderazione NLP, classificazione, estrazione metadati e coerenza visiva. Il comitato usa una coda revisioni con gli stessi controlli server delle altre API. L'immagine 05B rappresenta questi blocchi.
Prima scelta: monolite modulare, non microservizi. Moduli dominio: identità, segnalazioni, media, sostegni, moderazione, classificazione, audit, esportazione. La traccia non impone linguaggio, framework, DB o provider IA. In repository esistente usare convenzioni e dipendenze presenti; in nuovo repository l'agente fissa stack/versioni supportate consultando documentazione ufficiale al momento dell'implementazione, registra ADR-001 e lockfile. Nessuna versione precisa è inventata da questo pacchetto.

## Invio atomico
1. Utente attivo verificato chiede upload autorizzato; API genera chiave imprevedibile, vincoli e scadenza.
2. File rimane privato; worker/API verifica firma MIME, dimensione, decodifica, durata, metadati e produce derivato sicuro. File invalido è scartato. Nessun path client viene eseguito.
3. UI mostra posizione EXIF se disponibile, chiede conferma o punto manuale. Diversi EXIF discordanti non vengono mediati arbitrariamente: l'utente sceglie il luogo corretto, incongruenza è segnalata al revisore.
4. POST invio con Idempotency-Key, descrizione, posizione e upload_ids; server verifica proprietà, stato, scadenza e limite. Transazione crea segnalazione RICEVUTA/PENDENTE, media, eventi iniziali, audit e outbox, marca upload consumati. Un fallimento rollback non lascia una segnalazione senza allegati.
5. Avvia moderazione testuale immediatamente dopo commit, con budget breve configurato. La risposta può attendere entro budget o restituire 202 con ID; in entrambi i casi niente visibilità finché la policy non è soddisfatta.
6. Worker elabora outbox e analisi idempotenti. La classificazione propone categorie; metadati e coerenza riguardano i media della revisione. Ogni risultato conserva revisione/hash/versioni.
7. Policy conservativa: testo sicuro e coerenza di tutti i media riuscita → APPROVATA; dubbio, provider indisponibile, video non supportato o incoerenza → IN_REVISIONE; testo con esito bloccante → RIFIUTATA. Classificazione mancante non blocca da sola la pubblicazione. Soglie configurate e versionate, da validare su esempi; nessuna accuratezza presunta.
8. Prima del cambio stato lock sulla segnalazione, confronto revisione corrente e controllo di decisione umana già presa. Un'automazione non sovrascrive un override umano della stessa revisione. Aggiornamento stato + evento + audit atomici.

## Transizioni autorizzate
Avanzamento: creazione → RICEVUTA; comitato da RICEVUTA a PRESA_IN_CARICO; da PRESA_IN_CARICO a INVIATA_AI_CANDIDATI, con nota/riferimento dossier. Queste due transizioni richiedono moderazione APPROVATA. Autore o comitato possono RITIRARE da qualunque stato, con motivazione. RITIRATA terminale nella versione base; non si promette richiamo di un documento già inviato.
Moderazione: creazione → PENDENTE; sistema da PENDENTE a APPROVATA/IN_REVISIONE/RIFIUTATA; comitato da PENDENTE o IN_REVISIONE a APPROVATA/RIFIUTATA. Comitato può da APPROVATA a IN_REVISIONE per segnalata criticità e da RIFIUTATA a IN_REVISIONE con motivazione. Nessun ritorno automatico a pubblicato dopo ritiro.
Modifica contenuto: autore solo mentre avanzamento RICEVUTA, mediante controllo versione; modifica testo/media/posizione incrementa revisione e forza PENDENTE, annulla analisi obsolete e rigenera outbox. Comitato non riscrive la descrizione dell'autore: richiede correzione o modera. Categorie e avanzamento non incrementano la revisione del contenuto. Il vecchio contenuto non resta pubblico durante rivalutazione. Conservare la revisione precedente in audit solo tramite riferimento a snapshot protetto se si implementa storico contenuti; tale estensione va progettata esplicitamente e non è garantita dai soli EVENTO_STATO.
Sostegni: PUT idempotente crea o conferma, DELETE idempotente revoca. Creazione solo su pubblicata non ritirata, da altro utente. Se una segnalazione viene nascosta, i sostegni restano ma non compaiono nelle classifiche; tornano visibili dopo nuova approvazione. Revoca del proprio sostegno ammessa anche quando il contenuto non è pubblico.

## Contratti degli adattatori
ModerationInput(report_id, revision, text, input_hash) → verdict ALLOW/REVIEW/BLOCK, reasons[], optional_score, model_version, policy_version.
ClassificationInput(text, allowed_categories[]) → suggestions[{category_id, optional_confidence}]. Validare schema e appartenenza al catalogo.
MetadataInput(media_id, private_object) → gps? {lat,lon}, extraction_status, parser_version. EXIF assente non equivale a contenuto invalido.
CoherenceInput(text, media_id, private_image_or_frames) → verdict CONSISTENT/UNCERTAIN/INCONSISTENT/UNSUPPORTED, reasons[], optional_score, model_version.
Il testo e il contenuto degli allegati sono dati non fidati, mai istruzioni per tool o privilegi. Nessun provider ha accesso diretto al DB né può eseguire azioni applicative. Validare strutture JSON; timeout, retry massimi e budget economico per modulo. Mock deterministici consentiti per test, ma demo e README devono dichiarare quando non si usa un modello reale. Non chiamare completata l'integrazione IA se esistono solo stub.

## Ripresa da errori e concorrenza
Crash dopo commit: outbox riprende. Doppio job: chiave idempotenza/lock impedisce doppio effetto. Crash durante upload: cleanup dei temporanei scaduti. Oggetto caricato ma transazione fallita: resta temporaneo fino a cleanup, non viene esposto. Cambio revisione mentre IA lavora: risultato OBSOLETE. Due moderatori: secondo comando con versione superata riceve 409 e ricarica. Retry provider limitati; esauriti i tentativi, IN_REVISIONE con motivo, senza pubblicazione permissiva.

## Ambienti e operatività
Locale: DB, storage e mail di sviluppo; fixture senza dati reali; worker attivabile. CI: migrazioni da zero, test dominio/API, lint e build. Staging: storage privato e provider sandbox con quote. Produzione: HTTPS, segreti gestiti, backup DB+oggetti, monitoraggio worker, policy retention concordata. Nessun deploy o invio ai candidati è implicito nei prompt. Documentare comandi reali di avvio, migrazione, seed, test e ripristino nel README del repository.
