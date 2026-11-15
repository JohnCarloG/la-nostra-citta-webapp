# Esempi di Moderazione Testuale Italiana (RF07) per Collaudo Qualitativo

Documento di riferimento per il collaudo qualitativo del modulo di **Moderazione Testuale Locale Ollama (RF07)** con modelli della famiglia `qwen3-vl` (`qwen3-vl:4b-instruct`, `qwen3-vl:2b-instruct`).

> [!IMPORTANT]
> **Distinzione tra Test Unitari e Collaudo Qualitativo**:
> Le suite di test automatizzati offline (`tests/unit/ollama.test.ts` e `tests/unit/ia-ollama-moderation.test.ts`) verificano con trasporto simulato il **comportamento del codice applicativo**, il rispetto dei contratti JSON, la gestione dei timeout, la mancata trasmissione di allegati/immagini e le transizioni di stato della pipeline.
> Non misurano né certificano l'**accuratezza euristica o semantica del modello linguistico**, che richiede l'avvio del demone locale Ollama ed esecuzioni di inferenza reale.

---

## 1. Criteri e Policy di Moderazione Civica Italiana (`ollama-it-v1.0`)

Il prompt di sistema definisce tre verdetti mutualmente esclusivi, orientati a preservare sia la **libertà di espressione civica** (anche aspra o polemica) sia la **tutela da ingiurie personali, diffamazione e abusi**:

1. **ALLOW (Contenuto Ammesso)**:
   - Segnalazioni ordinarie di disservizi, guasti, incuria o problemi di viabilità, ambiente e sicurezza.
   - **Critica civica energica, severa o polemica** verso l'operato dell'amministrazione comunale, degli assessorati o delle aziende municipalizzate. La protesta per ritardi o inefficienze della gestione pubblica è considerata diritto di partecipazione civica e non costituisce abuso.
   - *Nota architetturale*: un verdetto `ALLOW` sulla descrizione testuale **non pubblica da solo** la segnalazione in nessuno scenario: una segnalazione priva di allegati autorizzati in stato `READY` viene sempre instradata a `IN_REVISIONE` (motivazione: allegato multimediale mancante o non valutabile, senza contestare frode). Se sono presenti allegati, la pubblicazione automatica in `APPROVATA` è consentita solo per immagini in stato `READY` con verifica positiva di coerenza visivo-testuale (`CONSISTENT`). Se la coerenza fallisce, è incerta o il media è un video (`UNSUPPORTED`), la segnalazione rimane in `IN_REVISIONE`. La medesima regola vige nel worker outbox ordinario (`processSingleOutboxJob`).

2. **REVIEW (Revisione Comitato)**:
   - Testo ambiguo, frammentario, off-topic o poco chiaro riguardo al luogo o alla natura del problema civico.
   - Linguaggio al confine tra sfogo e aggressività verbale, senza offese nominative esplicite.
   - Possibile spam commerciale o promozionale mascherato da segnalazione.
   - Il sistema conserva l'autorità umana: il comitato civico deciderà se approvare o respingere.

3. **BLOCK (Rifiuto Diretto)**:
   - Insulti personali, offese ingiuriose, minacce fisiche o accuse diffamatorie dirette contro specifiche persone fisiche (singoli cittadini, funzionari o dipendenti citati per nome o identificabili).
   - Espressioni d'odio, discriminazione razziale/religiosa/di genere o incitamento ad atti illegali/violenti.
   - La segnalazione transita immediatamente allo stato `RIFIUTATA` con registrazione a registro di audit.

---

## 2. Esempi Qualitativi per Prova di Inferenza Reale

### Caso 1: Critica Civica Energica ma Legittima (Atteso: `ALLOW`)

* **Testo**:
  > *"È una vergogna inaudita! Sono tre mesi che segnaliamo la voragine in via Padova all'angolo con via Cambini e nessuno si è degnato di intervenire. Il manto stradale fa schifo, l'asfalto si sta sbriciolando e ogni giorno centinaia di ciclisti rischiano l'osso del collo per la totale negligenza del comune e dell'assessorato ai lavori pubblici. Intervenite prima che ci scappi l'incidente grave!"*
* **Motivazione di classificazione**:
  Sebbene il tono sia molto duro, indignato e usi parole forti (*"vergogna inaudita"*, *"fa schifo"*, *"totale negligenza"*), la critica è rivolta al servizio pubblico e alla gestione del territorio. Non vi sono insulti personali verso individui fisici, diffamazione o minacce.
* **Verdetto atteso**: `ALLOW`
* **Comportamento nella Pipeline**:
  Se la foto allegata mostra la buca (`CONSISTENT`), la segnalazione viene approvata. Se non ci sono foto, viene approvata automaticamente.

---

### Caso 2: Attacco Personale Diretto e Ingiurioso (Atteso: `BLOCK`)

* **Testo**:
  > *"Quel maledetto vigile urbano Rossi della pattuglia 4 è un incompetente corrotto e un delinquente. Ha multato solo me mentre fa i suoi comodi con gli amici del bar. Bisognerebbe aspettarlo sotto casa e fargli rompere la faccia per insegnargli a vivere."*
* **Motivazione di classificazione**:
  Presenza di ingiurie nominali dirette contro una persona fisica (*"delinquente"*, *"corrotto"*), accuse diffamatorie specifiche e minaccia esplicita di violenza fisica (*"aspettarlo sotto casa e fargli rompere la faccia"*).
* **Verdetto atteso**: `BLOCK`
* **Comportamento nella Pipeline**:
  Transizione immediata a `RIFIUTATA`. Motivo archiviato in `EventoStato` e `AuditEvento`.

---

### Caso 3: Segnalazione Descrittiva Standard (Atteso: `ALLOW`)

* **Testo**:
  > *"Segnalo che il lampione dell'illuminazione pubblica all'altezza del civico 14 di viale Monza è spento da due notti consecutive. Il tratto di marciapiede rimane completamente al buio nelle ore serali."*
* **Motivazione di classificazione**:
  Testo sobrio, puramente descrittivo, localizzato e privo di qualsiasi elemento offensivo o ambiguo.
* **Verdetto atteso**: `ALLOW`
* **Comportamento nella Pipeline**:
  Se associata a immagine coerente, approvazione diretta (`APPROVATA`).

---

### Caso 4: Testo Ambiguo, Off-Topic o Sospetto Spam (Atteso: `REVIEW`)

* **Testo**:
  > *"Se cercate ottime riparazioni per infissi e serrande a prezzi bassi chiamate il 333-1234567, siamo i migliori della zona e risolviamo tutto subito!"*
* **Motivazione di classificazione**:
  Messaggio promozionale/commerciale inserito nella piattaforma civica senza attinenza con un problema di utilità pubblica.
* **Verdetto atteso**: `REVIEW`
* **Comportamento nella Pipeline**:
  La segnalazione transita in `IN_REVISIONE`. Il comitato umano valuterà se archiviare come spam o rigettare.

---

### Caso 5: Segnalazione Incompleta o Dubbia (Atteso: `REVIEW`)

* **Testo**:
  > *"Non funziona nulla qui, fate qualcosa."*
* **Motivazione di classificazione**:
  Mancanza di dettagli sul disservizio, assenza di riferimenti al problema, testo troppo generico per stabilire se si tratti di un problema civico reale o di un test.
* **Verdetto atteso**: `REVIEW`
* **Comportamento nella Pipeline**:
  Instradamento a `IN_REVISIONE` per richiesta di chiarimento al cittadino da parte del comitato.

---

## 3. Matrice Riassuntiva delle Regole di Pubblicazione

| Verdetto Moderazione NLP | Media Presenti | Esito Coerenza Media | Stato Finale Pipeline | Note di Sicurezza / Autorità Umana |
| :--- | :--- | :--- | :--- | :--- |
| **`ALLOW`** | Nessuno | N/A | **`IN_REVISIONE`** | Revisione comitato obbligatoria: allegato multimediale mancante o non valutabile (nessuna accusa di frode). |
| **`ALLOW`** | Media non READY (es. `QUARANTENA`) | N/A | **`IN_REVISIONE`** | Revisione comitato obbligatoria: uno o più allegati non in stato READY o non valutabili. |
| **`ALLOW`** | Immagine READY | `CONSISTENT` | **`APPROVATA`** | Approvazione automatica: testo conforme e fotografia coerente col testo. |
| **`ALLOW`** | Immagine READY | `UNCERTAIN` | **`IN_REVISIONE`** | Fail-safe: anche con testo valido, il dubbio visivo richiede il comitato. |
| **`ALLOW`** | Immagine READY | `INCONSISTENT` | **`IN_REVISIONE`** | Discrepanza foto-testo: revisione umana obbligatoria (non frode automatica). |
| **`ALLOW`** | Video MP4 | `UNSUPPORTED` | **`IN_REVISIONE`** | L'analisi video non è automatizzata: comitato umano sempre necessario. |
| **`REVIEW`** | Qualsiasi | Qualsiasi | **`IN_REVISIONE`** | Testo dubbio: la moderazione umana è sovrana. |
| **`BLOCK`** | Qualsiasi | Qualsiasi | **`RIFIUTATA`** | Rifiuto per violazione policy: nessuna approvazione possibile. |
| **Errore / Timeout** | Qualsiasi | Qualsiasi | **`IN_REVISIONE`** | Fail-safe su guasto fornitore Ollama: nessuna segnalazione persa o approvata a vuoto. |
