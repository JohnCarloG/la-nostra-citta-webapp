# Valutazione Tecnica Congiunta: Classificazione Civica (RF08) e Coerenza Visiva (RF10)

Il presente documento formalizza la progettazione concreta e il confronto architetturale per i requisiti:
- **RF08**: Classificazione automatica multi-label del testo delle segnalazioni all'interno della tassonomia chiusa delle categorie comunali (es. *Manutenzione Stradale*, *Verde Pubblico*, *Illuminazione*, *Gestione Rifiuti*, ecc.).
- **RF10**: Verifica automatica della coerenza semantica e visiva tra il testo descrittivo della segnalazione e i media allegati (immagini/video).

---

## 1. Dati Verificati nel Codice vs Ipotesi / Stime Preliminari

A tutela della trasparenza progettuale, si distinguono categoricamente i vincoli già implementati e verificati nel codice sorgente dalle stime teoriche non ancora collaudate:

### Dati Verificati nell'Architettura Applicativa (Implementati e Testati)
- **Tassonomia chiusa e isolata**: la pipeline invia esclusivamente le categorie attive estratte dal database (`allowed_categories: { id, codice, nome }[]`).
- **Validazione stringente e sanitizzazione**: la funzione `validateClassificationOutput` scarta identificativi estranei al catalogo chiuso, rimuove duplicati e valida le confidenze senza crash.
- **Validazione contratto coerenza**: la funzione `validateCoherenceOutput` accetta unicamente verdetti ammessi (`CONSISTENT`, `UNCERTAIN`, `INCONSISTENT`, `UNSUPPORTED`), convalida motivazioni non vuote e un punteggio compreso nell'intervallo [0, 1].
- **Separazione dei dati**: i suggerimenti IA risiedono nella tabella `SuggerimentoCategoria` e non alterano le categorie confermate `SegnalazioneCategoria`.
- **Preservazione delle decisioni del comitato (Human Override)**: se il comitato ha già deliberato (`stato_moderazione !== 'PENDENTE'`), la pipeline restituisce `SKIPPED_HUMAN_OVERRIDE` senza alterare lo stato della segnalazione o le decisioni umane.
- **Protezione da risultati obsoleti**: se la revisione della segnalazione avanza durante l'elaborazione concorrente, tutti i moduli (`MODERAZIONE`, `CLASSIFICAZIONE`, `EXIF`, `COERENZA`) vengono registrati in `AnalisiIa` con `stato_esecuzione: 'OBSOLETE'`.
- **Policy di non blocco per la classificazione**: in caso di timeout, assenza di suggerimenti (`0_SUGGERIMENTI`) o indisponibilità del solo classificatore, la pubblicazione della segnalazione non viene bloccata.
- **Gestione discrepanza visiva (Nessuna equiparazione a frode)**: un verdetto `INCONSISTENT` o `UNCERTAIN` non equivale a frode o rifiuto della segnalazione, ma attiva la policy conservativa che indirizza la segnalazione al comitato (`IN_REVISIONE`).
- **Nessuna pubblicazione automatica su risultati simulati**: in modalità reale (`AI_ADAPTER_MODE="real"`), se i moduli di moderazione o coerenza visiva sono simulati (`isSimulated = true`), la segnalazione viene instradata a `IN_REVISIONE`.

### Stime e Ipotesi Preliminari (Non Verificate su Dati Reali)
- **Latenze**: i tempi effettivi di inferenza (sia su cloud sia su CPU locale) non sono misurati e dipendono dalla connessione di rete, dal carico dei server o dalla presenza di acceleratori hardware dedicati.
- **Accuratezza**: non è stato condotto un benchmark su un dataset validato di segnalazioni civiche storiche milanesi. Qualsiasi giudizio di accuratezza "eccellente" o "superiore" è privo di evidenza empirica e resta da verificare in fase di collaudo con campioni reali.
- **Requisiti hardware locali**: l'occupazione di memoria e l'impatto sulla CPU dipendono strettamente dalla quantizzazione (es. FP16 vs INT4) e dall'architettura del modello scelto.

---

## 2. Verifica di ProviderClassificationAdapter: Contratto Interno Predisposto

L'adattatore `ProviderClassificationAdapter` (`src/lib/ia/real-adapters.ts`) è contrassegnato con `isSimulated = false` e solleva `MissingProviderCredentialError` in assenza di configurazione.

### Contratto HTTP Effettivamente Trasmesso e Atteso
L'adattatore esegue una chiamata HTTP con le seguenti caratteristiche:
- **Metodo**: `POST`
- **Intestazioni HTTP**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <AI_CLASSIFICATION_API_KEY>
  User-Agent: LaNostraCitta-ClassificationWorker/1.0
  ```
- **Payload inviato (Body JSON)**:
  ```json
  {
    "text": "Lastre di marciapiede dissestate e buche pericolose in viale Monza",
    "allowed_categories": [
      { "id": "cat-strade", "codice": "STRADE", "nome": "Manutenzione Stradale" },
      { "id": "cat-verde", "codice": "VERDE", "nome": "Verde Pubblico" }
    ]
  }
  ```
- **Risposta attesa dal server remoto (HTTP 200, Body JSON)**:
  ```json
  {
    "model_version": "string (non vuota)",
    "suggestions": [
      {
        "category_id": "cat-strade",
        "optional_confidence": 0.94
      }
    ]
  }
  ```

> [!WARNING]
> **Natura del Contratto**: Questo payload costituisce un **contratto interno / adattatore predisposto** per un microservizio applicativo o proxy intermedio.
> **NON corrisponde** alle API ufficiali standard di OpenAI (`/v1/chat/completions`), Google Gemini (`:generateContent`) o Anthropic (`/v1/messages`).
> Configurare l'endpoint di OpenAI o Gemini in `AI_CLASSIFICATION_ENDPOINT` provocherà il fallimento immediato delle chiamate (HTTP 400 Bad Request o errore di schema). L'integrazione con provider commerciali richiede un adattatore specifico o un middleware di traduzione.

---

## 3. Valutazione Congiunta RF08 (Testo) e RF10 (Coerenza Visiva)

Poiché RF10 richiede l'analisi congiunta di testo e immagine/video, si confrontano due soluzioni concrete basate sulla documentazione ufficiale aggiornata: una **esterna (Cloud API multimodale)** e una **locale (VLM open-weights on-premise)**.

### Opzione Esterna Concreta: Google Gemini API (es. `gemini-1.5-flash`)
*(Riferimento comparativo secondario: OpenAI `gpt-4o-mini`)*

1. **Modello e Versione**:
   - `gemini-1.5-flash-latest` (o `gemini-1.5-flash-002` con versioning fissato).
2. **Supporto Italiano e Immagini**:
   - Modello nativamente multimodale: elabora testo in lingua italiana e immagini (JPEG, PNG, WebP) in una singola richiesta.
   - Supporto nativo a **Structured Outputs** (`responseSchema`) per forzare sia l'output a tassonomia chiusa (RF08) sia il verdetto di coerenza formattato (RF10).
3. **Licenza e Condizioni d'Uso**:
   - Termini commerciali Google Cloud Platform / Gemini API.
   - **Privacy Paid Tier**: la documentazione ufficiale certifica che sui piani a pagamento Google **non utilizza** i dati (prompt, testi, immagini e risposte) per addestrare i propri modelli. Si applica il Data Processing Addendum (DPA) conforme al GDPR. *(Attenzione: il Free Tier consente invece l'analisi umana e il training).*
4. **Requisiti e Configurazione**:
   - Requisiti applicativi minimi: nessun sovraccarico di memoria o CPU sul container Node.js.
   - Configurazione: variabile d'ambiente con chiave API (`GEMINI_API_KEY`) e connessione in uscita HTTPS su porta 443.
5. **Costi Documentati (Tariffe Ufficiali Pay-As-You-Go)**:
   - Input testuale: **$0.075 per 1 milione di token** (per contesti < 128K token).
   - Output testuale: **$0.30 per 1 milione di token**.
   - Input immagini: conteggiate a token visivi fissi (circa 258 token per immagine standard, ovvero ~$0.00002 per singola immagine).
6. **Gestione dei Contenuti Inviati**:
   - Dati trasmessi cifrati (TLS 1.3) ai data center del provider.
   - Conservazione transitoria esclusivamente per motivi di sicurezza e abuse logging (fino a 55 giorni), senza indicizzazione permanente.
7. **Limiti e Prove Ancora Necessarie**:
   - Dipendenza da connettività Internet esterna e SLA del fornitore.
   - Necessità di sviluppare l'adattatore HTTP con il payload ufficiale Gemini (`contents: [{ parts: [...] }]`, `generationConfig.responseSchema`).
   - Prove necessarie: test di robustezza del prompt su immagini civiche con illuminazione scarsa, inquadrature angolari o soggetti parzialmente occultati; verifica tempi di risposta con immagini ad alta risoluzione.

---

### Opzione Locale Concreta: Qwen2.5-VL-3B-Instruct (Vision-Language Open-Weights)
*(In alternativa: architettura disaccoppiata con `multilingual-e5-small` per il testo + SLM vision per i media)*

1. **Modello e Versione**:
   - `Qwen2.5-VL-3B-Instruct` (quantizzazione 4-bit via runtime Ollama / llama.cpp / vLLM).
2. **Supporto Italiano e Immagini**:
   - Modello Vision-Language con supporto multilingua (italiano compreso), capacità OCR e allineamento semantico spaziale tra testo e dettagli visivi dell'immagine.
3. **Licenza e Condizioni d'Uso**:
   - **Apache 2.0**: licenza open source pienamente permissiva, utilizzabile liberamente in ambito commerciale e per pubbliche amministrazioni senza costi di licenza o royalty.
4. **Requisiti e Configurazione**:
   - **Con GPU (Raccomandato)**: richiede almeno 6–8 GB di VRAM (o scheda consumer tipo RTX 3060/4060 o istanza cloud con GPU dedicata). Latenza di inferenza stimata nell'ordine di 1–3 secondi per immagine.
   - **Senza GPU (Solo CPU)**: richiede 8 GB di RAM di sistema dedicata al runtime di inferenza. Su sola CPU la latenza per inferenza visiva è elevata (stimabile tra 8 e 25 secondi per immagine a seconda del processore), con saturazione dei core di calcolo durante l'inferenza.
   - Configurazione: container o servizio locale dedicato (es. Ollama esposto su `http://localhost:11434/api/generate` o wrapper FastAPI locale).
5. **Costi Documentati**:
   - **€ 0,00** di costo per token o per richiesta.
   - I costi sono interamente legati all'hardware (acquisto o canone orario del server hosting con eventuale acceleratore GPU).
6. **Gestione dei Contenuti Inviati (Sovranità dei Dati)**:
   - **100% on-premise**: nessun dato, testo di segnalazione o fotografia dei cittadini lascia il perimetro dell'infrastruttura comunale o del server locale.
   - Massima conformità GDPR nativa, senza necessità di stipulare accordi di trattamento dati all'estero (DPA transfrontalieri).
7. **Limiti e Prove Ancora Necessarie**:
   - Elevato consumo computazionale in assenza di acceleratore GPU.
   - Necessità di collaudare le prestazioni su CPU reale del server comunale prima di consentire l'elaborazione sincrona.
   - Prove necessarie: misurazione del throughput massimo sotto carico (segnalazioni multiple contemporanee) e verifica della capacità di estrarre le categorie milanesi senza generare allucinazioni su modelli di taglia 3B.

---

## 4. Parti Indipendenti di RF10 Implementate nel Codice

In conformità ai principi di disaccoppiamento architetturale, tutti i componenti indipendenti di RF10 sono stati implementati e collaudati con test isolati:

1. **Contratto di Input/Output**: Interfaccia contrattuale `ICoherenceAdapter` con input strutturato (`CoherenceInput`: testo, mediaId, mediaType, mimeType, buffer) e verdetto tipizzato (`CoherenceOutput`: `verdict`, `reasons`, `optional_score`, `model_version`).
2. **Accesso Autorizzato ai Media Privati**: Il buffer dell'immagine viene estratto tramite il provider autorizzato `getStorageProvider()`. Errori di I/O o assenza del file nello storage privato vengono intercettati e registrati senza crash.
3. **Validazione Stringente dell'Output**: `validateCoherenceOutput` garantisce la presenza di verdetti ammessi, ragioni non vuote e punteggio numerico normalizzato in [0, 1].
4. **Gestione Media Non Supportati e Timeout**: I formati video o non grafici restituiscono `UNSUPPORTED` con motivazione esplicita; timeout e fallimenti di rete vengono catturati, registrati in `AnalisiIa` come `FAILED` e instradano la segnalazione a `IN_REVISIONE`.
5. **Protezione da Risultati Obsoleti**: Se la revisione della segnalazione viene incrementata concorrentemente, i record `COERENZA` ed `EXIF` vengono salvati con stato `OBSOLETE` senza alterare lo stato della segnalazione.
6. **Preservazione Decisioni del Comitato**: L'override umano ha priorità assoluta; se il comitato ha già deliberato, la pipeline restituisce `SKIPPED_HUMAN_OVERRIDE` preservando lo stato decisionale.
7. **Nessuna Pubblicazione Automatica su Risultati Simulati**: La pipeline impedisce la pubblicazione automatica in `APPROVATA` quando l'analisi di coerenza visiva è eseguita da adattatori simulati.
8. **Nessuna Equiparazione a Frode**: Le discrepanze visive o le incertezze di rilevazione vengono trattate come necessità di revisione umana del comitato (`IN_REVISIONE`), senza imputare frodi al cittadino né impostare automaticamente `RIFIUTATA`.

---

## 5. Decisione Strategica Definitiva: Adozione di Ollama Locale (qwen3-vl)

A valle della valutazione tecnica congiunta, è stata assunta la scelta definitiva per i requisiti **RF08** e **RF10**:
- **Soluzione adottata**: **Ollama locale** (`AI_ADAPTER_MODE="ollama"`), eseguito su `http://127.0.0.1:11434/api/chat`.
- **Modello predefinito**: `qwen3-vl:4b-instruct`.
- **Modello leggero autorizzato**: `qwen3-vl:2b-instruct` (selezionabile via `OLLAMA_MODEL="qwen3-vl:2b-instruct"`).
- **Politica di confidenzialità e isolamento**:
  - Nessuna chiave API remota o credenziale cloud richiesta.
  - Nessun dato, testo o immagine privata lascia la macchina o la rete locale.
  - RF08 trasmette solo il testo civico e l'array di ID del catalogo ammesse; RF10 trasmette solo il buffer base64 dell'immagine privata senza ID o percorsi fisici di storage.
  - RF07 (moderazione testuale) rimane affidata al comitato civico (`verdict: 'REVIEW'`).
  - Nessun fallback silenzioso verso provider cloud o adapter mock: eventuali errori o timeout di Ollama indirizzano fail-closed la segnalazione a `IN_REVISIONE`.
- **Script diagnostico offline**: `scripts/check-ollama.ts` per verificare la presenza e reattività del servizio Ollama locale senza toccare il database.
