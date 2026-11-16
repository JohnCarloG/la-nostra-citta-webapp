# Collaudo browser: cittadino → worker → comitato

## Flusso applicativo verificato nel browser

[Run Linux 43840802632](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43840802632)
conclusa **Success**, commit `5d1f234de373b670223c462ae2b6613dbded3e0b`.
Sono stati letti gli stati finali della run e di tutti gli step, incluso il
percorso Playwright: non è una deduzione dal solo push.

App Next.js reale compilata per produzione, Chromium reale, MySQL 8.4 temporaneo,
filesystem privato reale. Tre contesti browser separati: cittadino autenticato,
operatore del comitato autenticato e visitatore anonimo. I due account sintetici
sono creati verificati nel database vuoto e accedono con il normale form di login;
non sono simulate autenticazione, sessioni, permessi, query o scritture.
La registrazione e l’invio email non rientrano in questa prova.

Le risposte HTTP di Gemini sono l’unica simulazione: il test avvia il vero
`scripts/moderation-worker.ts --once` in un processo figlio con un preload
**solo sotto `tests/browser`**. Il preload risponde alle chiamate `generateContent`
attese, rifiuta qualsiasi altra richiesta HTTP e non conserva un fallback verso
la rete. Non viene caricato dall’app o da `start:cloud`; non sono state aggiunte
route di anteprima, bypass dei permessi o opzioni di simulazione al prodotto.

Il database ha nome obbligatorio `la_nostra_citta_browser`, host loopback e porta
3310; bootstrap e test rifiutano altri target e checkout con dotenv locali che
potrebbero sostituire la configurazione. Il seed richiede un database privo di
utenti/segnalazioni, senza reset distruttivi. GitHub Actions elimina il container
alla fine del job. Nessun uso di Aiven, chiavi reali o foto private.

## Azioni, risultati ed evidenze

| Azione | Risultato atteso | Risultato osservato | Evidenza |
| --- | --- | --- | --- |
| Cittadino invia una foto; worker non ancora avviato | PENDENTE non pubblico | Ricevuta di presa in carico; assente da elenco e mappa anonimi; dettaglio negato, media HTTP 404 | `01-ricevuta-pendente.png`; asserzioni browser e DB |
| Worker elabora la segnalazione civica con esiti favorevoli | APPROVATA automaticamente, pubblica | Stato APPROVATA; elenco e dettaglio visibili al visitatore, media HTTP 200 | Test Playwright, worker reale e stato DB |
| Cittadino corregge GPS sintetico prima dell’invio | Mappa usa il punto confermato | Proposta EXIF 45.464200, 9.190000; correzione UI 45.470100, 9.201200; coordinate pubbliche, URL coerente e marker MapLibre effettivamente visibile nel riquadro OpenStreetMap reale | `02-mappa-posizione-corretta.png` |
| Autore e comitato leggono categorie; operatore ne conferma una | Proposte IA separate dalle confermate | Due suggerimenti «da confermare» visibili a entrambi; conferma UI della sola categoria Strade; un badge e un’associazione confermata, senza trasformare l’altra proposta in confermata | Dettaglio browser per entrambi; DB reale `SegnalazioneCategoria` |
| Worker riceve esito fuori tema per una ricetta | RIFIUTATA senza comitato, motivo all’autore | Dashboard: «Testo: contenuto estraneo a problemi o proposte civiche.»; zero eventi di moderazione umana; visitatore escluso | `03-rifiuto-motivato-autore.png` |
| Foto ambigua → revisione → decisione motivata dalla UI | Privata, in coda con cosa verificare; pubblica dopo approvazione umana | Coda: «verificare il collegamento con la descrizione»; operatore approva con motivazione sintetica; autore e visitatore leggono la decisione nel dettaglio pubblico | `04-comitato-cosa-verificare.png`; asserzioni prima/dopo |
| Cittadino modifica una segnalazione approvata | Revisione nuova PENDENTE e privata fino al nuovo verdetto | Revisione 2, nuova descrizione nascosta a visitatori, punto rimosso, dettaglio negato e media HTTP 404; nuovamente pubblica solo dopo il worker | `05-modifica-torna-privata.png`; nuovo job e dettaglio browser |

Il test è un unico percorso sequenziale completo, senza retry: ciascuna riga
viene registrata in `observations.json` solo dopo le relative asserzioni.
Il worker è avviato dal processo di test nei punti necessari, così la fase
PENDENTE viene osservata prima dell’elaborazione. Questo non misura la latenza
di una coda in produzione e non costituisce un verdetto NLP in tempo reale.

## Screenshot e report per il docente

[Scarica l’artifact browser della run verificata](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43840802632/artifacts/14212787957)
(nome `browser-evidence-5d1f234de373b670223c462ae2b6613dbded3e0b`).
Il download richiede accesso GitHub; l’agente ha letto gli esiti pubblici della
run, ma non ha potuto scaricare e ispezionare visivamente i PNG dal proprio
ambiente. Gli screenshot sono generati dal browser reale a viewport 1440×1000;
ricevuta e schede sono ritagliate sui relativi elementi. Sono anche allegati al
report HTML di Playwright. Non sono immagini illustrative o ricostruzioni.

Cinque PNG, da aprire alla dimensione originale:

1. `01-ricevuta-pendente.png` — ciò che vede il cittadino prima del worker.
2. `02-mappa-posizione-corretta.png` — posizione scelta nell’interfaccia pubblica.
3. `03-rifiuto-motivato-autore.png` — rifiuto e spiegazione nella dashboard privata.
4. `04-comitato-cosa-verificare.png` — coda operatore e motivo della revisione.
5. `05-modifica-torna-privata.png` — nuova revisione privata dopo il salvataggio.

L’artifact contiene anche `BROWSER_REPORT.md`, `observations.json`, `results.json`,
`worker.log`, la fixture JPEG sintetica e `report/` con il report HTML. Dopo
l’estrazione si può aprire con `npx playwright show-report <percorso>/report`.
Gli artifact Actions hanno una conservazione limitata: per la presentazione
conservarne una copia locale.

## Verifica cartografica: errore del test corretto

La [run 43839983941](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43839983941)
non ha superato il controllo visivo aggiuntivo del marker. La successiva
[run diagnostica 43840630764](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43840630764)
ha mostrato che il riquadro reale era caricato, con titolo «OpenStreetMap
Embedded» e coordinate corrette, ma il test cercava `.leaflet-marker-icon`.
Il [sorgente ufficiale OpenStreetMap](https://github.com/openstreetmap/openstreetmap-website/blob/61502ca1b833d0c518ebca442878d1ea68f62564/app/assets/javascripts/embed.js.erb)
usa invece MapLibre. Corretto il selettore per verificare il marker reale:
la run riuscita indicata sopra copre anche questa asserzione, senza simulare la
mappa o eliminare il controllo. Le due run fallite non sono dichiarate superate.

## Correzioni incluse nel collaudo

- Aggiunto il normale form di modifica nel dettaglio dell’autore: mancava il
  collegamento UI al dominio già esistente. La Server Action richiede sessione,
  account attivo/verificato, autore corretto, stato RICEVUTA e revisione corrente;
  riutilizza la transazione del dominio e invalida le viste coinvolte.
- Eliminato il form HTML annidato della scelta manuale del luogo: applicazione
  delle coordinate con bottone esplicito o Invio, senza inviare la segnalazione.
- Reso visibile nella coda del comitato il motivo corrente di IN_REVISIONE,
  oltre al registro già disponibile nel dettaglio.
- Nuovi test unitari su richieste anonime, autore diverso, revisione obsoleta e
  ritorno a PENDENTE. 36 test pertinenti superati localmente; lint superato.

## Riproduzione isolata

Workflow: [moderazione-cloud-browser.yml](../.github/workflows/moderazione-cloud-browser.yml),
permessi `contents: read`, senza segreti applicativi. Parte al push sul branch.
Esegue `npm ci`, client Prisma dal lockfile, migrazioni sul MySQL temporaneo,
seed sintetico, installazione Chromium, build di produzione e
`npx --no-install playwright test`. La shell preserva gli exit code.
L’altro workflow continua a verificare suite unitaria completa, typecheck e lint.
Ogni run va attribuita allo SHA effettivo, anche dopo modifiche documentali.

## Qualità del modello Gemini non ancora collaudata

**Nessuna inferenza reale è stata eseguita.** Il test controlla deliberatamente i
verdetti per dimostrare l’interfaccia e le transizioni applicative; non dimostra
che Gemini riconosca una ricetta, una critica legittima, un dato privato o una
foto incoerente. Restano da collaudare separatamente disponibilità dell’account,
schema live, qualità in italiano e immagini, falsi positivi/negativi e tempi del
provider, dopo una decisione esplicita dell’operatore. Nessuna fatturazione,
merge su main o deploy Render è stata effettuata.
