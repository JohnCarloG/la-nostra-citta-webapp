# Piano operativo e prompt per Gemini Pro 3.1 low in Antigravity
## Modalità d'uso
Copiare tutto il pacchetto in docs/progetto. Incollare prima il prompt master, poi un prompt di fase per volta. Ogni fase produce codice, test pertinenti, aggiornamento del registro e un punto di ripresa. Il livello low rende utile ridurre il contesto operativo, non ridurre i controlli di integrità. Questi prompt non presuppongono funzioni specifiche o disponibilità verificata di una particolare versione dell'IDE/modello.

## Prompt master — incollare all'inizio
Sei il developer responsabile del progetto “La Nostra Città, Il Nostro Futuro”. Leggi docs/progetto/00_LEGGIMI.md, 01_REVISIONE_ELABORATO.md, 02_REQUISITI_E_VINCOLI.md e 04_MODELLO_LOGICO.md. Usa gli altri documenti quando pertinenti. La traccia originale allegata è autoritativa; le scelte [S] del pacchetto costituiscono le decisioni operative iniziali, da cambiare solo motivando in un ADR. Non aggiungere funzioni fuori perimetro. Non trattare CF, nascita o residenza completa come obblighi. I log non sostituiscono autore e FK. Non pubblicare contenuti in attesa di controllo. Mantieni identici nomi e domini tra schema, codice, API, UI e test, oppure documenta una mappatura completa.
Prima ispeziona repository, istruzioni locali, stato git, stack e lavoro esistente senza sovrascriverlo. Non dichiarare test o funzionalità completati se non eseguiti. Non inventare credenziali, provider, comandi o URL. Se mancano credenziali esterne, implementa adattatori e test mock espliciti, indicando cosa resta da verificare realmente. Non eseguire deploy, invii reali ai candidati o azioni distruttive. Per assunzioni reversibili procedi documentando; chiedi chiarimenti solo per conflitti sostanziali non risolvibili dalle fonti.
Lavora sulla fase richiesta. Prima elenca requisiti coinvolti, file da modificare, rischi e prove attese; poi implementa e verifica. Chiudi con file cambiati, comandi effettivamente eseguiti, esito, limiti e prossima fase. Aggiorna PROJECT_STATUS.md, DECISIONS.md e VERIFICATION.md. Non fermarti al solo piano se la fase chiede implementazione.

## Fase 0 — ricognizione e baseline
Prompt: Esegui la ricognizione del repository. Confronta codice e documenti con RF01–RF14, VI01–VI12 e test T01–T18. Produci docs/GAP_MATRIX.md con requisito, evidenza file, stato verificato/non verificato/mancante, intervento e test. Crea ADR-001 per lo stack: riusa quello presente; se manca, seleziona un'unica soluzione relazionale full stack e fissa versioni consultando fonti ufficiali correnti. Non introdurre microservizi. Registra comandi avvio/test realmente disponibili. Prepara backlog dipendente ordinato e aggiorna PROJECT_STATUS.md. Non affermare che il progetto sia vuoto senza averlo ispezionato.
Gate: matrice completa, nessuna perdita di codice utente, scelta stack riproducibile, assunzioni esplicite.

## Fase 1 — fondazioni e database
Prompt: Implementa il nucleo relazionale di 04 e le tabelle tecniche necessarie alle fasi successive tramite migrazioni versionate. Aggiungi PK/FK/UQ/CHECK e indici, strategia ultimo media e transazioni. Implementa funzioni di dominio per stati, visibilità e versione. Seed sintetici: utenti verificati/non verificati/sospesi, un comitato, categorie, segnalazioni pubbliche/private e sostegni. Nessuna password reale committata. Dimostra migrazione da DB vuoto e test dei vincoli con DB target. Aggiorna matrice e decisioni.
Gate: schema equivalente ai diagrammi, vincoli testati, nessuna tabella UTENTE duplicata, classifica corretta T13.

## Fase 2 — identità e permessi
Prompt: Implementa registrazione, verifica email, login/logout, reset password, sessioni e ruolo comitato. Applica autorizzazione server per azione e oggetto, impedisci assegnazione ruolo dal client. Mail di sviluppo locale; produzione richiede configurazione esplicita. Sospensione conserva audit ed esclude il sostegno dai conteggi. Implementa T01/T02 e test recupero password, scadenza e revoca. Aggiorna README senza esporre segreti.
Gate: cittadini non verificati o sospesi bloccati; ruoli non elevabili; password/token non in chiaro.

## Fase 3 — upload e invio
Prompt: Implementa upload privato temporaneo, controllo contenuto e limiti, EXIF, posizione confermata, derivati senza EXIF, consumo upload e invio atomico con Idempotency-Key/outbox. Non consentire segnalazioni inviate prive di media validi. Predisponi modifica con revisione e ritiro secondo 05. Implementa T03/T04/T14/T15 e accesso diretto a file privati. UI con progressione e messaggi di errore.
Gate: nessun file altrui consumabile, nessuna pubblicazione anticipata, rollback e retry corretti.

## Fase 4 — community e supervisione
Prompt: Implementa elenco/dettaglio, filtri, mappa con alternativa testuale, sostegno idempotente, classifica e coda comitato. Usa COUNT corretto e spareggio fissato. Implementa stati avanzamento/moderazione separati, eventi atomici, categoria confermata e controllo concorrenza per decisioni. Esegui T05/T06/T11/T12/T13. Tutti i percorsi pubblici condividono la stessa policy di visibilità.
Gate: conteggi verificati con fixture, nessuna fuga di contenuti privati, transizioni e permessi server completi.

## Fase 5 — pipeline IA
Prompt: Implementa gli adattatori di 05, outbox/worker persistenti, analisi per revisione, retry, errori e override umano. NLP all'invio, classificazione multi-etichetta, estrazione EXIF e controllo coerenza. Scegli provider reali solo dopo verifica delle API ufficiali e disponibilità delle credenziali; conserva mock deterministici per CI, marcati come tali. Non inviare dati reali senza configurazione autorizzata. Per video non supportato manda in revisione dichiarandolo. Esegui T07/T08/T09/T10/T14, inclusi risultato obsoleto, doppio job e provider offline.
Gate: quattro moduli coperti da contratti e prove; disponibilità reale vs simulata dichiarata; nessuna decisione vecchia sovrascrive quella corrente.

## Fase 6 — dossier, UX e operatività
Prompt: Completa esportazione CSV sicura e versione stampabile, UI responsive/accessibile, messaggi di stato, configurazione ambienti, log redatti, quote/rate limit, procedure backup/ripristino. Scrivi README con comandi effettivi, .env.example senza segreti, istruzioni mail/storage/provider e limiti. Esegui T16/T17/T18; nessun invio automatico ai candidati.
Gate: demo end-to-end da ambiente pulito e documentazione riproducibile.

## Fase 7 — revisione senior e chiusura
Prompt: Esegui una revisione incrociata completa senza aggiungere nuove funzionalità. Per ciascun RF, VI e T porta evidenza concreta o indica NON VERIFICATO. Controlla schema/diagrammi/API/UI, concorrenza, filtri privacy, upload e fallimenti IA. Correggi i difetti bloccanti e riesegui i test coinvolti. Genera DELIVERY_REPORT.md con funzionalità reali, mock, comandi e risultati, rischi residui, istruzioni demo e stato di ogni requisito. Non dichiarare “completo” se l'IA richiesta è solo simulata o i gate non passano. Non pubblicare automaticamente.
Gate: zero discrepanze bloccanti; tutti i requisiti rendicontati; limiti residui visibili.

## Prompt di ripresa dopo cambio chat
Leggi PROJECT_STATUS.md, DECISIONS.md, VERIFICATION.md e docs/GAP_MATRIX.md. Ispeziona git diff e gli ultimi cambiamenti senza annullarli. Riassumi fase completata, fase attiva, test realmente eseguiti e impedimenti. Riprendi dal primo passo incompleto, senza rifare indiscriminatamente fasi già verificate e senza saltare vincoli del pacchetto.

## Prompt per correggere un bug
Riproduci il difetto seguente: [sintomo + passi + risultato atteso]. Collega il difetto a RF/VI/T; individua causa ed effetti su autorizzazioni, transazioni e dati. Aggiungi un test di regressione significativo, applica la correzione minima coerente e verifica. Non mascherare l'errore cambiando test o requisiti. Se un requisito è ambiguo documenta interpretazione e impatto prima di cambiarlo.

## Modello PROJECT_STATUS.md
Fase attiva; obiettivo; requisiti coperti con evidenze; file modificati; decisioni e motivi; test eseguiti con comando/esito; test non eseguiti e motivo; dipendenze esterne; prossimo passo concreto. Evitare percentuali di completamento prive di criteri.
