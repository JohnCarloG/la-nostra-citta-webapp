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

Il default configurabile è `gemini-4-hydrogen`, modello indicato dal cookbook
ufficiale consultato al commit `6c416d766328d125774e21f282e59dfdf12049c9`.
Gli esempi ufficiali mostrano input immagine e output strutturati con
`generateContent`; il convertitore dell’SDK ufficiale conferma il campo REST
`responseJsonSchema`.

Fonti ufficiali consultate senza chiamare modelli:

- [Google Gemini cookbook: generateContent](https://github.com/google-gemini/cookbook/blob/6c416d766328d125774e21f282e59dfdf12049c9/quickstarts/Get_started_Generate_Content.ipynb)
- [Google Gemini cookbook: JSON REST](https://github.com/google-gemini/cookbook/blob/6c416d766328d125774e21f282e59dfdf12049c9/quickstarts/rest/JSON_mode_REST.ipynb)
- [Google SDK: convertitori REST](https://github.com/googleapis/js-genai/blob/main/src/converters/_models_converters.ts)
- [Google API: GenerateContent e GenerationConfig](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto)

**Verifica ancora necessaria prima dell’attivazione**: `ai.google.dev` è bloccato
da HTTP 403 in questo ambiente. Non è stata completata la verifica nella guida
del supporto dell’italiano e della disponibilità corrente del modello per
l’account scelto. Ricontrollare [modelli](https://ai.google.dev/gemini-api/docs/models),
[structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
[image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
e [riferimento generateContent](https://ai.google.dev/api/generate-content).
Il modello resta sostituibile tramite `GEMINI_MODEL`; un modello non valido o
non disponibile produce revisione, mai approvazione simulata.

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
lease di cinque minuti, normalmente al massimo sei chiamate sequenziali da
20 secondi. Un limite complessivo di 150 secondi mantiene contabilizzati anche
eventuali manifest precedenti oltre i cinque allegati: alla scadenza ogni
allegato ancora da verificare è marcato non valutato e richiede revisione.
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
   `GEMINI_MODEL=gemini-4-hydrogen` (da riconfermare), `GEMINI_API_KEY` inserita
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

Esito di questa sessione:

| Comando | Risultato |
| --- | --- |
| `npm run lint` | Superato |
| Nuove suite cloud (incluse nella suite completa) | 53 test superati |
| `npm run test:unit` | 324 superati, 3 falliti; 2 ulteriori suite non caricate |
| `npm run typecheck` | Fallito: client Prisma non generato, tipi del dominio mancanti |
| `npm run build` | Bundling riuscito; fallito al controllo TypeScript per gli stessi tipi Prisma mancanti |
| `npx prisma generate` (anche `--no-engine`) | Bloccato: HTTP 403 scaricando i checksum dei motori da `binaries.prisma.sh` |
| Lettura `https://ai.google.dev/gemini-api/docs/models` | HTTP 403 |

I tre test falliti sono in `dossier.test.ts` (`Prisma.sql is not a function`);
le due suite non caricate sono `ia-pipeline.test.ts` e
`submit-segnalazione-luogo.test.ts` (`@prisma/client did not initialize yet`).
Questi errori erano già presenti nel collaudo precedente alla modifica.
Non sono stati trovati motori Prisma utilizzabili nelle directory locali
ispezionate. Non sono state disabilitate verifiche di checksum o TLS.
Dopo aver consentito i domini, eseguire `npx prisma generate` e ripetere
unit test, typecheck e build; completare poi la verifica documentale del modello.
Nessun collaudo cloud reale è stato eseguito.
