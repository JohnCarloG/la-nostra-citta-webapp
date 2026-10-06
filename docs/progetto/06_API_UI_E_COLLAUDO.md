# Contratti API, schermate e collaudo
## Convenzioni API proposte
Prefisso /api/v1; JSON UTF-8; identificatori opachi. Date ISO 8601 UTC. Errori {code,message,field_errors?,request_id}. 400 payload malformato, 401 accesso assente, 403 identità/ruolo insufficienti, 404 risorsa inesistente o non visibile, 409 conflitto versione/idempotenza, 413 file grande, 422 vincolo dominio, 429 limite, 503 dipendenza indisponibile. Non includere stack trace o segreti.
GET collezioni: page >=1, page_size 1..100, default 20, risposta {items,total,page,page_size}; whitelist ordinamenti, filtri parametrizzati. Per scala maggiore passare a cursori con contratto documentato.

## Endpoint e autorizzazioni
POST /auth/register: nome,cognome,email,password,quartiere_id?; risposta generica senza enumerazione dell'email, invia verifica tramite servizio mail configurato.
POST /auth/verify: token; monouso; abilita profilo e registra evento.
POST /auth/login; POST /auth/logout; POST /auth/password-reset/request; POST /auth/password-reset/confirm. Sessioni server o framework equivalenti; documentare cookie/CSRF.
GET /me: solo proprio profilo; PATCH /me: nome,cognome,quartiere; cambio email con flusso separato e nuova verifica. Mai PATCH libero di ruolo, stato o verificato_il.
POST /uploads: metadati dichiarati e file o URL autorizzato secondo storage; restituisce upload_id e stato. GET /uploads/{id}: solo proprietario/comitato autorizzato. Validazione finale legge contenuto effettivo.
POST /reports: {description,location:{lat,lon,source},upload_ids}; Idempotency-Key obbligatoria. Risposta 201 se elaborazione conclusa, 202 se pendente; {id,revision,moderation_status,workflow_status}. Identità autore presa dalla sessione.
GET /reports: solo visibili al pubblico, filtri categoria, area, stato e ordinamento. GET /reports/{id}: pubblico se pubblicato; autore e comitato possono vedere privato con DTO specifici.
PATCH /reports/{id}: {expected_revision,description?,location?,replacement_upload_ids?}; autore, RICEVUTA; se cambia contenuto incrementa revisione e rivaluta. replacement_upload_ids rappresenta l'intero nuovo insieme quando presente, mai un insieme vuoto. Vecchi oggetti privati rimossi solo dopo retention tecnica.
POST /reports/{id}/withdraw: autore/comitato, {expected_revision,reason}; transazione con lock e controllo stato.
PUT /reports/{id}/support; DELETE /reports/{id}/support: solo identità dalla sessione, non accettare utente_id nel corpo.
GET /ranking: filtri come report, COUNT valido e spareggio deterministico. GET /map: bounding box validato, max risultati e indicatori di truncation; nessun report privato.
GET /categories; GET /districts: cataloghi di consultazione.
GET /committee/reviews: coda paginata di PENDENTE/IN_REVISIONE. POST /committee/reports/{id}/moderation: expected_revision,decision,reason; controlla che la revisione non sia cambiata e che nessuna decisione concorrente sia stata scritta: usare anche updated_at/ETag o lock con valore atteso di stato.
POST /committee/reports/{id}/workflow: expected_revision,expected_state,new_state,reason. PUT /committee/reports/{id}/categories: category_ids unici, motivazione e versione attesa della risorsa.
POST /committee/users/{id}/suspend: motivo; proibire sospensione dell'ultimo membro attivo del comitato e autosospensione accidentale. Provisioning ruoli separato.
GET /committee/reports/{id}/history e /analyses: accesso ristretto, niente token o oggetti completi dei provider.
GET /committee/export: CSV con escaping di formule e filtro pubblicati; versione stampabile con data estrazione e criterio ordinamento. Il conteggio è uno snapshot al momento dell'export, non retroattivamente immutabile senza entità dossier aggiuntiva.
GET /media/{id}: derivato pubblico solo se segnalazione visibile; originale solo accesso privato autorizzato. URL firmati brevi e revocabilità/cache considerate quando un contenuto viene nascosto.

## Schermate e stati
Home: obiettivo civico, elenco, filtri categorie, classifica e accesso alla mappa. Dettaglio: descrizione, prova multimediale, posizione, categorie, avanzamento, sostegni, pulsante autenticato e cronologia pubblica filtrata.
Registrazione/accesso/verifica: errori chiari, reinvio verifica limitato, recupero password. Nuova segnalazione: descrizione → media → posizione → riepilogo → invio; salvataggio locale facoltativo, nessuna bozza DB implicita. Progressione upload e stato di elaborazione visibili.
Area personale: inviate, stato moderazione privato, motivo rifiuto/revisione, modifica consentita, ritiro e sostegni. Dashboard comitato: coda, evidenze, esiti IA non presentati come verità, decisioni motivate, avanzamento, categorie, export.
Ogni schermata deve avere caricamento, vuoto, errore, retry e stato permesso negato. Mappa sempre affiancata da elenco accessibile. Non mostrare residenza, email, originali EXIF o dati di sicurezza al pubblico.

## Matrice di accettazione
T01 RF01/02: registro, verifico con token valido, accedo; token scaduto/usato rifiutato; email normalizzata duplicata non duplica account.
T02 RF02/03: anonimo, non verificato e sospeso non inviano né sostengono; cittadino non modera; corpo con ruolo COMITATO ignorato/rifiutato.
T03 RF04/VI04: zero allegati, file corrotto, tipo mascherato, video lungo/grande, upload altrui/scaduto/usato → rifiuto senza segnalazioni orfane.
T04 RF04/09: foto valida senza EXIF + posizione manuale → invio; coordinate fuori dominio o territorio → errore/revisione territoriale esplicita; EXIF discordanti richiedono scelta.
T05 RF06: due richieste simultanee di sostegno creano una riga; autosostegno rifiutato; DELETE ripetuto resta successo; sostegno di sospeso escluso dal conteggio.
T06 RF05/VI07: transizione vietata fallisce; consentita aggiorna stato e un evento; rollback non lascia metà operazione. Due moderatori con stessa versione: uno solo applica decisione.
T07 RF07: ALLOW con coerenza valida pubblica; BLOCK nasconde; REVIEW/timeout resta privato; categorie assenti non impediscono approvazione.
T08 RF08: classi duplicate/fuori catalogo scartate; correzione umana preservata da job tardivi; suggerimenti separati da conferme.
T09 RF10: immagine incoerente e video non supportato → IN_REVISIONE; UI esplicita limite e non dichiara verifica completata.
T10 VI08: modifica mentre job precedente lavora; risultato vecchio non pubblica nuova revisione; decisione umana non sovrascritta da job.
T11 RF12: autore, sostegno, moderazione e ritiro tracciabili; nessun hash password/token nei log pubblici/tecnici; IP non obbligatorio.
T12 VI06: tentativi di accesso diretto a report/file nascosto, ranking, mappa ed export non rivelano dati riservati.
T13 classifica: fixture A=2 voti validi, B=2, C=0 e D nascosta con 10; A/B ordinati per data/id, C incluso, D esclusa; più categorie/media non duplicano voti.
T14 affidabilità: arrestare worker dopo commit, riavviare, elaborare una volta a livello di effetto; stessa Idempotency-Key stesso payload stesso report, payload diverso 409.
T15 modifica/ritiro: ritiro rimuove da pubblico e classifica; riapprovazione dopo modifica non ripubblica una segnalazione ritirata; ultimo media non eliminabile.
T16 UI: intero flusso utilizzabile da tastiera, focus e feedback errori, elenco alternativo alla mappa; viewport mobile senza contenuti essenziali tagliati.
T17 rilascio: installazione da clone pulito, migrazioni e seed, test/build, riavvio con dati persistenti, backup/ripristino verificato. Provider mock esplicitamente dichiarato.
T18 export: niente email/CF/residenza privata; celle inizianti con caratteri di formula neutralizzate; riferimenti e conteggi coerenti al momento export.

## Strategia di test
Unitari per transizioni/policy; integrazione sul DB reale per FK, unicità e concorrenza; API per autorizzazioni e filtri; E2E per registrazione→invio→revisione→approvazione→sostegno→export. IA con fixture deterministiche in CI; smoke separato su provider reale quando credenziali disponibili. Non usare solamente un DB in memoria se le migrazioni target usano vincoli non equivalenti. Conservare comandi, risultati, commit e limiti in VERIFICATION.md.
