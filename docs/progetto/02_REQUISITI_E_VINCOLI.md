# Analisi dei requisiti e vincoli
## Obiettivo e attori
[T] Raccogliere priorità territoriali documentate e sostenute dalla comunità, da presentare alle forze politiche prima delle elezioni. La piattaforma non promette esecuzione di lavori comunali né approvazione delle proposte da parte dei candidati.
[S] Visitatore: consulta contenuti pubblicati, classifica e mappa. Cittadino verificato attivo: invia e sostiene. Comitato verificato attivo: modera, classifica, aggiorna avanzamento, esporta dossier e sospende account con motivazione. Sistema: processi tecnici con identità di servizio. Consultazione pubblica è una scelta: la traccia impone autenticazione per interagire.

## Requisiti funzionali tracciati
RF01 [T] Registrazione e accesso sicuro. [S] Nome, cognome, email normalizzata univoca e password; quartiere di residenza opzionale. Esito: email duplicata non crea secondo account e il ruolo non è accettato dal client.
RF02 [T] Interazioni riconducibili a profilo verificato. [S] Verifica email a token monouso, scadenza, hash del token, revoca al cambio email. Utente non verificato o sospeso non può inviare, sostenere o moderare.
RF03 [T] Profili speciali del comitato. Ogni operazione protetta verifica il ruolo lato server; nascondere un pulsante non basta.
RF04 [T] Invio segnalazione territoriale con descrizione non vuota e almeno una fotografia o un breve video valido. [S] Titolo facoltativo, descrizione 20–5000 caratteri, massimo 5 allegati, immagini JPEG/PNG/WebP fino a 10 MiB e video MP4 fino a 50 MiB/60 s. Limiti configurabili, scelti per il prototipo.
RF05 [T] Ciclo di vita tracciabile. [S] RICEVUTA → PRESA_IN_CARICO → INVIATA_AI_CANDIDATI; RITIRATA come uscita motivata. Nessuno stato RISOLTA presunto. Cambi in storico con attore, momento e motivazione.
RF06 [T] Sostegno da altri membri e classifica. [D] Massimo un sostegno per coppia; [S] revocabile, vietato all'autore. Ordinamento per sostegni decrescenti, poi data invio crescente, poi ID. Solo pubblicate e non ritirate entrano nella classifica; contare solo sostegni di profili attivi e verificati.
RF07 [T/E] Moderazione NLP al momento dell'invio: analizza testo e blocca la pubblicazione oppure invia in revisione. [S] Timeout o errore non pubblica automaticamente. La ricezione privata può riuscire con HTTP 202 e moderazione pendente.
RF08 [T/E] Classificazione automatica in una o più categorie. [S] Tassonomia controllata; suggerimenti IA e categorie confermate distinti; comitato può correggere. Nessuna categoria inventata fuori dal catalogo.
RF09 [T/E] Estrazione coordinate originarie dai media e mappa interattiva. [S] Proporre coordinate EXIF, far confermare il punto; se assenti chiedere selezione manuale. La provenienza resta registrata. Posizione obbligatoria all'invio, senza obbligo di EXIF; è una scelta di completezza territoriale.
RF10 [T/E] Verificare coerenza immagine/descrizione. [S] Incoerenza o impossibilità di analisi inviano a revisione, non provano frode. Per video il sistema predispone un adattatore con fotogrammi campionati, altrimenti revisione umana dichiarata: la traccia menziona esplicitamente coerenza dell'immagine.
RF11 [D] Supervisione: coda revisioni, dettaglio evidenze, approvazione/rifiuto motivati, correzione categorie, avanzamento. [S] Riapertura di un rifiuto solo dal comitato con nuova valutazione registrata.
RF12 [D] Tracciabilità di inserimenti, sostegni, rimozioni sostegno, decisioni e transizioni. Audit append-only a livello applicativo, timestamp server UTC, nessuna password/token nel payload.
RF13 [S] Dossier esportabile CSV e versione stampabile con descrizione, categorie, localizzazione, numero sostegni e stato; non include dati privati degli utenti. L'invio ai candidati è registrato manualmente dal comitato con riferimento; non è invio automatico di email.
RF14 [S] Logout, recupero password, scadenza/revoca sessioni, sospensione account. Recupero password non rivela se un'email esiste. La sospensione non cancella lo storico.

## Vincoli di integrità
VI01 Ogni segnalazione ha un unico autore esistente; ogni sostegno ha un utente e una segnalazione esistenti.
VI02 UNIQUE(email_normalizzata); password_hash obbligatorio per autenticazione locale; ruolo e stato account appartengono a domini chiusi.
VI03 PK composta del sostegno; divieto autosostegno e requisito account attivo/verificato verificati nella transazione. Nessuna somma lato browser.
VI04 Una segnalazione inviata ha almeno un media READY; non eliminare l'ultimo media. Controllo differito a fine transazione o procedura di servizio unica e DB non accessibile ai client. Una FK da sola non impone la cardinalità minima sul genitore.
VI05 Latitudine tra −90 e 90, longitudine tra −180 e 180; verifica del territorio di Milano tramite poligono configurato, non con un semplice rettangolo approssimativo. In mancanza del confine validato, bloccare la verifica automatica territoriale e lasciare revisione esplicita.
VI06 Visibile solo se moderazione APPROVATA e avanzamento diverso da RITIRATA. Le API pubbliche, mappa, file e classifica applicano lo stesso filtro.
VI07 Stato corrente e relativo storico si aggiornano nella stessa transazione; concorrenza tramite lock di riga o versione. Ogni modifica del testo/media incrementa revisione e riporta moderazione a PENDENTE.
VI08 Risultati IA riferiti a revisione precisa e hash dell'input. Un risultato vecchio non approva una revisione nuova.
VI09 Nessuna cancellazione a cascata indiscriminata di utenti, audit o segnalazioni. Gli allegati temporanei possono essere eliminati da garbage collection controllata.
VI10 I media pubblici sono derivati sicuri senza EXIF; originali privati accessibili solo ai processi autorizzati. Non usare percorsi client come nomi storage.
VI11 Tutte le date tecniche sono timestamp UTC generati dal server; visualizzazione nel fuso configurato. Eventi con attore SISTEMA non devono inventare un utente.
VI12 Categorie confermate senza duplicati; ogni categoria ha codice univoco. Categorie suggerite dall'IA non sostituiscono automaticamente una decisione umana successiva.

## Requisiti non funzionali e target di progetto [S]
Sicurezza: password tramite libreria consolidata di hashing adattivo; query parametrizzate/ORM, autorizzazioni per oggetto, protezione CSRF dove pertinente, output HTML escapato, cookie di sessione HttpOnly/Secure e gestione segreti fuori dal repository. Rate limiting su login, upload, invio e sostegno; controlli su MIME reale, decodifica, dimensioni e durata. Storage privato di default.
Accessibilità: etichette, tastiera, focus visibile, contrasto leggibile, messaggi d'errore associati ai campi, alternativa testuale alla mappa, nessuna informazione affidata solo al colore.
Affidabilità: invio idempotente; retry limitati con backoff; coda persistente/outbox; approvazione sempre deterministica rispetto alla revisione. Ripristino backup DB e oggetti provato prima del rilascio.
Prestazioni: dataset di prova 10.000 segnalazioni/100.000 sostegni; pagine di 20 risultati; obiettivo p95 API lettura <500 ms in ambiente dichiarato, esclusi rete e IA. Misurare, non affermare risultati senza benchmark.
Osservabilità: request_id/job_id, metriche errori, tempi provider, coda pendente, conteggio revisioni. Evitare contenuti personali nei log tecnici.
Dati personali: raccogliere solo quanto deciso; retention e informative sono attività da definire col committente prima di produzione. Queste sono scelte ingegneristiche, non attestazioni di conformità normativa.

## Fuori perimetro
Non richiesti: commenti, chat, pagamenti, identità certificata, CF obbligatorio, partiti/candidati come utenti, promesse di lavori pubblici, ricerca semantica, chatbot, addestramento di modelli proprietari. Aggiungerli solo come change request.
