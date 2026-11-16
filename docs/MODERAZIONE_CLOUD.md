# Moderazione Gemini: implementazione e attivazione futura

La modalità `AI_ADAPTER_MODE=cloud` usa esclusivamente l’API ufficiale Gemini
`POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent`.
La chiave `GEMINI_API_KEY` viene letta solo dal processo server e inviata nell’header
`x-goog-api-key`; non usare nomi `NEXT_PUBLIC_*`. Nessun fallback verso Ollama o mock.

## Contratto e modello

Il payload usa `systemInstruction`, `contents[].parts`, immagini PNG in
`inlineData` e `generationConfig.responseMimeType=application/json` con
`responseJsonSchema`. Testo e singole immagini producono codici enumerati,
validati anche localmente. Il modello non scrive motivazioni libere nel registro
o nell’interfaccia: il codice genera motivazioni brevi in italiano senza citazioni.

### Capacità documentate e raccomandazione per il prototipo

Modello consigliato: **`gemini-3.5-flash`**, indicato come **stabile** nella
scheda Google fornita dall’utente. È una raccomandazione di configurazione per
il prototipo, non un default: `GEMINI_MODEL` resta **obbligatorio**, senza valore
predefinito nel codice. La raccomandazione non attiva il servizio.

**Provenienza delle evidenze:** le fonti Google elencate nella tabella seguente
sono state fornite dall’utente come verificate in questa sessione. L’agente non
le ha consultate direttamente: l’accesso alla documentazione Google dal suo
ambiente era bloccato da HTTP 403. Le capacità sono riportate sulla base di
quelle evidenze, distinguendone l’ambito e i limiti.

| Capacità richiesta | Fonte ufficiale fornita | Evidenza e limite |
| --- | --- | --- |
| ID esatto e stato | [Scheda Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) | ID `gemini-3.5-flash`, modello stabile secondo la scheda verificata dall’utente. Non prova l’abilitazione del nostro account. |
| Testo e immagini in input | [Scheda Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) | Input testuali e visivi documentati; non dimostra l’accuratezza delle valutazioni di coerenza o pubblicabilità. |
| API `generateContent` | [Guida Google per Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.5) | La guida mostra l’uso con `generateContent`; nessuna chiamata al modello è stata eseguita in questo progetto. |
| Output JSON strutturato | [Scheda Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) | Supporto agli output strutturati documentato. Il nostro specifico `responseJsonSchema`, con enum, campi obbligatori e `additionalProperties: false`, è verificato solo con trasporto simulato: l’accettazione effettiva da parte del provider resta da collaudare. |
| Italiano | [Documentazione Google Cloud sulle lingue dei modelli Google](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models) | Include l’italiano per le risposte testuali della famiglia Gemini. È un’indicazione di famiglia, non una certificazione specifica dell’accuratezza di `gemini-3.5-flash` nella moderazione civica italiana o dell’accesso tramite il nostro account Gemini API. |

Fonti tecniche ufficiali consultate dall’agente nelle verifiche precedenti,
senza chiamare modelli:

- [Google Gemini cookbook: generateContent](https://github.com/google-gemini/cookbook/blob/6c416d766328d125774e21f282e59dfdf12049c9/quickstarts/Get_started_Generate_Content.ipynb)
- [Google Gemini cookbook: JSON REST](https://github.com/google-gemini/cookbook/blob/6c416d766328d125774e21f282e59dfdf12049c9/quickstarts/rest/JSON_mode_REST.ipynb)
- [Google SDK: convertitori REST](https://github.com/googleapis/js-genai/blob/main/src/converters/_models_converters.ts)
- [Google API: GenerateContent e GenerationConfig](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto)

Queste ultime fonti documentano il contratto generale
`generateContent`/`responseJsonSchema`; un esempio nel cookbook, da solo, non
prova la disponibilità di un modello. I test usano esclusivamente l’ID fittizio
`offline-test-model` e un trasporto HTTP simulato.

### Test offline superati

Le verifiche offline della pipeline e del worker sono descritte nelle sezioni
Collaudo offline e Runner CI Linux: includono payload, decisioni deterministiche,
protezione dei media e delle revisioni, oltre a suite unitaria completa,
typecheck, lint e build superati in CI. Provano il contratto applicativo con
risposte simulate, non l’accettazione live dello schema o le capacità semantiche
del modello consigliato.

### Disponibilità per l’account e qualità reale ancora da verificare

Restano da accertare per il nostro account: accesso all’ID consigliato tramite
Gemini API, autorizzazioni, quote e accettazione dell’intero schema JSON. Restano
inoltre da misurare qualità della moderazione in italiano, falsi positivi,
falsi negativi, valutazione delle immagini e resistenza alle istruzioni ostili
nei contenuti. La documentazione pubblica non sostituisce queste prove.

Non è stata effettuata alcuna interrogazione autenticata del catalogo o del
modello. Un valore mancante/composto da soli spazi blocca il preflight del worker
con un messaggio esplicito su `GEMINI_MODEL`, prima degli import del DB e dei job.
Anche l’avvio supervisionato richiede la configurazione; nessun default presunto.
La pipeline resta conservativa se la configurazione manca o il provider fallisce.

## Piano di collaudo futuro con dati sintetici — non eseguito

Il piano seguente richiede un’attivazione futura esplicita dell’operatore e non
è stato eseguito. Preparare descrizioni inventate e immagini create per il test,
senza persone, luoghi privati o dati reali. Per il caso privacy, usare un documento
di scena con dati interamente fittizi, ad esempio un indirizzo di contatto su
`example.invalid`. Tutti gli allegati restano privati: verificare gli esiti in
un ambiente di collaudo isolato senza pubblicarli.

| Caso sintetico | Esito atteso | Esempio di motivazione visibile |
| --- | --- | --- |
| Segnalazione valida: descrizione di rifiuti alimentari sul marciapiede, con foto sintetica coerente, leggibile e pubblicabile | `APPROVATA` | Autore: «Testo pertinente e conforme; tutti gli allegati coerenti e idonei alla pubblicazione.» |
| Critica severa ma civile alla gestione comunale della pulizia, con allegato pertinente e pubblicabile | `APPROVATA` | Autore: «Testo pertinente e conforme; tutti gli allegati coerenti e idonei alla pubblicazione.» La severità della critica non è una violazione. |
| Ricetta pubblicata come tale, estranea a un problema o a una proposta civica | `RIFIUTATA` | Autore: «Testo: contenuto estraneo a problemi o proposte civiche.» Distinguere questo caso dai rifiuti alimentari in strada. |
| Descrizione di un marciapiede dissestato e foto sintetica di un piatto cucinato, chiaramente incompatibile | `RIFIUTATA` | Autore: «Allegato 1: immagine chiaramente incompatibile con la descrizione.» Nessuna accusa di frode. |
| Foto coerente con la segnalazione, ma con dati privati leggibili di una terza persona fittizia in un documento di scena | `RIFIUTATA` | Autore: «Allegato 1: diffusione di dati personali altrui.» Non ripetere i dati, nemmeno quelli sintetici, nella motivazione. |
| Foto ambigua che non consente di confermare il racconto, senza incompatibilità o violazioni certe | `IN_REVISIONE` | Comitato: «Allegato 1: verificare il collegamento con la descrizione; l’immagine non conferma da sola il racconto.» |
| Errore tecnico simulato nel controllo di un allegato, senza altre violazioni certe | `IN_REVISIONE` | Comitato: «Allegato 1: ripetere il controllo automatico non disponibile; nessuna violazione accertata.» Non imputare l’errore all’autore. |
| Due allegati: il primo dubbio, il secondo coerente ma certamente non pubblicabile per dati privati leggibili di scena | `RIFIUTATA` | Autore: «Allegato 2: diffusione di dati personali altrui.» La violazione certa del secondo prevale sul dubbio del primo; il registro conserva entrambi gli esiti. |

In una futura prova reale, usare l’ID raccomandato solo dopo la decisione esplicita
dell’operatore e verificarne disponibilità per l’account e compatibilità del
payload completo prima di giudicare la qualità delle risposte. Per ogni fixture
registrare separatamente verdetti di pertinenza, community, coerenza e
pubblicabilità, decisione deterministica, motivo mostrato, modello, revisione e
versione delle regole. Confrontare con gli esiti attesi della tabella; una
risposta formalmente valida ma semanticamente errata non è un test superato.

Il caso di errore tecnico resta riproducibile tramite trasporto simulato e non
richiede una chiamata reale. Nessuno di questi esempi autorizza oggi inferenze,
fatturazione, pubblicazione di foto, avvio di worker o deploy.

## Regole deterministiche (`civic-gemini-v1`)

- Testo: l’intera `descrizione` (unico campo libero del contenuto nello schema
  attuale), con controlli separati di pertinenza civica e community. Critiche
  severe al Comune ammesse; ricetta fuori tema distinta da rifiuti alimentari.
- Ogni immagine: coerenza e pubblicabilità valutate separatamente. Il dubbio
  sulla prova visiva non è incompatibilità e non comporta accuse di frode.
- Almeno una violazione certa, fuori tema certo o incompatibilità certa:
  `RIFIUTATA` automatica. Errori o dubbi negli altri controlli non nascondono
  una violazione già accertata.
- Senza violazioni certe, un dubbio, file assente/illeggibile/non supportato
  (inclusi video), timeout, risposta bloccata/vuota/invalida: `IN_REVISIONE` con
  indicazione di cosa verificare. Errori tecnici non sono violazioni dell’autore.
- Solo tutti i controlli superati e tutti gli allegati coerenti e pubblicabili:
  `APPROVATA`. Restano valide le normali regole pubbliche: mai contenuti ritirati.

RF08 è eseguito anche nel percorso cloud: il worker classifica l’intera descrizione
contro il catalogo attivo e salva suggerimenti separati (`AnalisiIa` CLASSIFICAZIONE,
`SuggerimentoCategoria`), senza modificare le categorie confermate. Gli ID estranei
sono scartati e le categorie ricontrollate al commit; errori del solo classificatore
sono registrati e non causano rifiuto. Nel dettaglio autorizzato autore e comitato
vedono le proposte della revisione corrente, marcate «da confermare».
Per il percorso completo RF07–RF10 e le prove, vedere [GAP_MATRIX.md](GAP_MATRIX.md).

I file provengono solo dal manifest privato della segnalazione letto per quella
revisione. Si verificano appartenenza, stato READY, dimensione e SHA-256. Ogni
immagine è decodificata e ricodificata localmente con Sharp senza copiare
EXIF/GPS/XMP/commenti; non si inviano URL, storage key, ID autore o ID segnalazione.
Le istruzioni nel testo e nei pixel sono esplicitamente dati non fidati.
Limiti: cinque allegati, 10 MiB per immagine in ingresso/uscita, 16 milioni di
pixel; immagini animate e formati diversi da JPEG/PNG/WebP richiedono revisione.

Il risultato viene salvato solo dopo lock della segnalazione, ricontrollo della
revisione e del manifest, e verifica di stato e decisioni umane. I risultati
obsoleti sono registrati ma non applicati. AnalisiIa, EventoStato e AuditEvento
conservano revisione, esito, motivi, modello e versione delle regole; nessuna
nuova migrazione è richiesta. Le motivazioni sono mostrate all’autore in dashboard
e nel dettaglio autorizzato; la coda del comitato include gli eventi di moderazione.

## Worker

`npm run worker:moderation` elabora l’Outbox per entrambi gli eventi
`SEGNALAZIONE_CREATA` e `SEGNALAZIONE_MODIFICATA`; `-- --once` esegue un solo ciclo.
Lettura dell’ambiente prima degli import del DB, claim con `FOR UPDATE SKIP LOCKED`,
lease di cinque minuti, normalmente al massimo sette chiamate sequenziali (testo, cinque immagini e classificazione) da
20 secondi. Un limite complessivo di 150 secondi mantiene contabilizzati anche
eventuali manifest precedenti oltre i cinque allegati: alla scadenza ogni
allegato ancora da verificare è marcato non valutato e richiede revisione.
La classificazione può aggiungere fino a 20 secondi al termine dei controlli media, restando entro la lease di cinque minuti.
Nessuna chiamata al provider dentro una transazione DB. Il worker rispetta
SIGTERM/SIGINT e non stampa testo, byte o errori grezzi del provider.
Gli errori di provider gestiti dalla pipeline passano al comitato e completano
il job; gli errori infrastrutturali imprevisti usano i retry già presenti.

## Render: configurazione quando si deciderà di attivare

Non è stato creato o modificato alcun servizio Render. Non attivare finché i
controlli bloccati e la verifica del modello non saranno completati.

Lo storage attuale è locale: un Web Service e un Background Worker Render
separati **non condividono** il disco. Per questa implementazione usare un
**unico Web Service Node con web e worker supervisionati sul medesimo disco**.
Un worker separato richiede prima un provider privato condiviso implementato e
collaudato: `STORAGE_PROVIDER=s3` da solo non funziona nel repository attuale.

Configurazione del singolo servizio:

1. Collegare il branch desiderato solo al momento dell’attivazione; disabilitare
   auto-deploy mentre si prepara la configurazione. Nessun merge implicito su main.
2. Runtime Node 24 (`NODE_VERSION=24`). Build: `npm ci --include=dev && npx prisma generate && npm run build`.
   `tsx` è richiesto anche dal worker a runtime: conservare le devDependencies.
3. Disco persistente privato montato sul percorso assoluto
   `<root-del-checkout>/.private_storage` del servizio. Non usare `public/`.
   Web e worker partono con la stessa directory di lavoro tramite lo script.
   Una sola istanza del servizio finché si usa storage locale.
4. Variabili server: `NODE_ENV=production`, `AI_ADAPTER_MODE=cloud`,
   `GEMINI_MODEL` con un ID esatto prima verificato nel catalogo Google (obbligatorio,
   nessun valore suggerito), `GEMINI_API_KEY` inserita
   come segreto, `DATABASE_URL` MySQL con TLS verificato e CA corretta,
   `APP_URL` con il dominio reale. Render fornisce `PORT`.
   Non distribuire `.env.local` di sviluppo né credenziali nel repository.
5. Consentire egress HTTPS verso `generativelanguage.googleapis.com` e accesso
   al MySQL autorizzato; durante la build anche registry npm e `binaries.prisma.sh`.
6. Applicare le migrazioni esistenti come operazione esplicita sul database
   scelto, con backup e normale procedura operativa. Nessuna migrazione o seed
   viene eseguita automaticamente dal web o dal worker.
7. Start: `npm run start:cloud`. Lo script avvia Next e worker, inoltra i segnali
   e termina l’altro processo se uno dei due si arresta, così Render può riavviarli.
   Un job interrotto torna acquisibile alla scadenza della lease; le guardie su
   revisione e stato impediscono l’applicazione doppia di una decisione.

La futura attivazione richiede una decisione esplicita dell’operatore su account,
chiave, trattamento dati e costi. Questo lavoro non ha usato chiavi reali,
attivato fatturazione, inviato contenuti a Gemini o pubblicato foto.

## Collaudo offline

`npx vitest run tests/unit/gemini-cloud.test.ts tests/unit/cloud-pipeline.test.ts tests/unit/cloud-supervisor.test.ts`
usa solo immagini sintetiche, HTTP simulato e DB/storage simulati per la pipeline.
Verifica payload, rimozione metadati, riduzione dei verdetti, allegati multipli,
indisponibilità del provider, obsolescenza, decisioni umane e claim dei due eventi.
I casi ricetta/critica/foto usano **verdetti del provider predisposti come fixture**:
provano il contratto e la decisione applicativa, non la capacità semantica del modello.

Separare sempre: **integrazione implementata**, **contratto verificato offline**,
**collaudo cloud reale non eseguito**. Registrare separatamente l’esito effettivo
di unit test completi, typecheck, lint e build; non equiparare i nuovi test passati
alla riuscita dei controlli bloccati dalla generazione Prisma.

## Verifiche locali e diagnosi separata

Prisma CLI e client sono entrambi **5.22.0**, come fissati nel lockfile. Sono
stati usati i binari installati (`npx --no-install prisma generate`), senza
aggiornare dipendenze o cambiare versione. La generazione fallisce su:

```
Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403 Forbidden
```

Il controllo diretto del pacchetto installato restituisce `typeof Prisma.sql ===
"undefined"`; `new PrismaClient()` solleva l’errore di inizializzazione. Il file
`node_modules/.prisma/client/default.js` è il placeholder fornito dal pacchetto,
non uno stub aggiunto per il collaudo. Nessuna sostituzione è stata applicata.
Non sono stati disabilitati checksum, TLS, test o controlli TypeScript.

Riproduzione dei cinque casi, separati nel report JSON di
`npx --no-install vitest run tests/unit/dossier.test.ts tests/unit/ia-pipeline.test.ts tests/unit/submit-segnalazione-luogo.test.ts --reporter=json`:

| Caso | Primo errore utile | Causa riscontrata localmente |
| --- | --- | --- |
| `dossier.test.ts` → `applica le regole di visibilità pubblica (APPROVATA e NON RITIRATA) e spareggio coerente con la classifica` | `Prisma.sql is not a function`, `src/lib/domain/dossier.ts:109` | Costruzione della query prima di chiamare `$queryRaw`: l’export SQL manca nel client non generato; il mock DB del test non è ancora invocato. |
| `dossier.test.ts` → `restituisce lista vuota senza errori se non ci sono segnalazioni per i filtri specificati` | `Prisma.sql is not a function`, stessa riga 109 | La costruzione SQL precede anche il caso della lista vuota; non è un errore del filtro o della risposta DB. |
| `dossier.test.ts` → `restituisce status 200 con Content-Type text/csv e Content-Disposition corretti` | Log `Prisma.sql is not a function` in `dossier.ts:109`, poi `expected 503 to be 200` | La route chiama il servizio a `route.ts:37`; il catch trasforma quell’eccezione in HTTP 503. Riprodotto anche isolando questo test, con stack del log. |
| Suite `ia-pipeline.test.ts` non caricata | `@prisma/client did not initialize yet`, `default.js:43` → `src/lib/db.ts:14` | Import `pipeline.ts:2` → `db.ts` → costruzione del client non generato. La suite si ferma prima delle asserzioni. Riprodotta da sola. |
| Suite `submit-segnalazione-luogo.test.ts` non caricata | Stesso errore, `default.js:43` → `src/lib/db.ts:14` | Import della action upload → `src/lib/domain/uploads.ts:4` → DB; il mock parziale delle segnalazioni non isola questo import. Riprodotta da sola. |

La successiva [run CI 43827655325](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43827655325)
sul commit `5d9419fa4a5696db4c9fae77ee574655d084d5a0` ha completato la
generazione reale e superato la suite completa, senza test pending. I tre file
di test originari e il servizio dossier non sono stati modificati rispetto a
`9c0780e`. I cinque casi quindi passano con il client generato: questo conferma
le cause sopra riprodotte, senza aggiungere stub o saltare asserzioni. Anche
typecheck e build di produzione sono passati su quel medesimo SHA.

| Comando locale sul contenuto aggiornato | Esito osservato |
| --- | --- |
| `npx --no-install prisma generate` | Fallito: HTTP 403 sopra riportato |
| Tre suite cloud offline | 60 test superati |
| `npm run test:unit` | 331 superati, 3 falliti, 2 suite non caricate; nessun test disabilitato nella suite completa |
| `npm run typecheck` | Fallito: mancano tipi/enum del client generato; prima segnalazione `scripts/seed-demo-data.ts:188`, TS7006 |
| `npm run lint` | Superato |
| `npm run build` | Bundling riuscito; fallisce al controllo TypeScript, prima segnalazione TS7006 sopra indicata |

Il nuovo test al **confine del worker** esegue claim, HTTP simulato, decisione,
registrazione e finalizzazione del job. Con due allegati, il primo ambiguo e il
secondo con violazione certa, verifica `RIFIUTATA` e la motivazione italiana
servita dal dettaglio autorizzato all’autore; un altro utente non può leggerla.
Copre anche soli dubbi, errori tecnici, tutti i controlli favorevoli e revisione
obsoleta con decisione umana concorrente: nessuna scrittura di stato o evento
in quest’ultimo caso. Non avvia processi worker, migrazioni o inferenze reali.

## Runner CI Linux

Workflow: [moderazione-cloud-offline.yml](../.github/workflows/moderazione-cloud-offline.yml).
Parte al push su `feat/moderazione-cloud`, usa Ubuntu 24.04 e Node 24 con
`permissions: contents: read`. Non legge segreti applicativi e non dispone di un
database reale: gli URL fittizi puntano a `127.0.0.1:1`. Non avvia web, worker,
migrazioni o test live.

Esegue nell’ordine `npm ci`, `npx --no-install prisma generate`, suite unitaria
completa, typecheck, lint e build. Dopo l’installazione, tutti i controlli sono
comunque tentati anche se un controllo precedente fallisce. La shell Bash
mantiene `pipefail`: `tee` non nasconde gli exit code. Il workflow registra lo SHA,
le versioni, i risultati dei singoli step, i conteggi e i casi falliti nel riepilogo
pubblico della run, e conserva log/JSON come artifact legato allo SHA.

Pagina: [Actions del repository](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/workflows/moderazione-cloud-offline.yml).
**Workflow pubblicato e controlli CI verificati**, separatamente dagli errori
locali riportati sopra. `gh api` risponde `Forbidden`, ma le pagine pubbliche
GitHub hanno consentito di leggere la run del commit corretto e i metadati di
ogni step. Run documentata:
[43827655325](https://github.com/JohnCarloG/la-nostra-citta-webapp/actions/runs/43827655325),
SHA `5d9419fa4a5696db4c9fae77ee574655d084d5a0`, job `133165207201`, stato
finale **Success**.

| Comando nello stesso job Linux | Esito letto nella run |
| --- | --- |
| `npm ci` | Success |
| `npx --no-install prisma generate` e verifica reale di `Prisma.sql`/`PrismaClient`, senza connessione DB | Success |
| `npm run test:unit -- --reporter=json --outputFile=verification/unit.json` | Success |
| `npm run typecheck` | Success |
| `npm run lint` | Success |
| `npm run build` | Success |
| Riepilogo con guardia `numPendingTests === 0` | Success |

Lo stato è stato letto dopo il completamento, non dedotto dal push. I log e il
report completo sono conservati nell’artifact
`offline-verification-5d9419fa4a5696db4c9fae77ee574655d084d5a0`; il download dei
log/artifact richiede accesso GitHub. Non viene riportato un conteggio CI esatto
non leggibile dalla pagina pubblica. I conteggi della tabella locale non sono
conteggi del runner CI. Ogni successivo push, inclusi aggiornamenti documentali,
riesegue tutti i controlli: associare sempre l’esito alla run dello SHA scelto.

**Inferenza cloud reale non eseguita.** Nessuna chiave reale, fatturazione,
trasmissione di testi/foto a Gemini, merge su main o deploy in questo collaudo.
