# Confronto Tecnico: Opzioni di Classificazione Civica IA (RF08)

Il requisito **RF08** richiede la classificazione automatica (multi-label) del testo delle segnalazioni civiche all'interno della tassonomia chiusa delle categorie approvate dal Comune di Milano (es. *Manutenzione Stradale*, *Verde Pubblico*, *Illuminazione*, *Gestione Rifiuti*, *Barriere Architettoniche*, ecc.).

L'architettura applicativa ha già implementato e isolato contrattualmente tutte le parti indipendenti:
- **Tassonomia chiusa**: riceve solo le categorie attive a catalogo (`allowed_categories: { id, codice, nome }[]`).
- **Validazione stringente**: scarto automatico di codici fuori catalogo, rimozione di duplicati e controllo confidenze (`validateClassificationOutput`).
- **Separazione rigida dei dati**: i suggerimenti sono memorizzati in `SuggerimentoCategoria`, distinti dalle categorie confermate `SegnalazioneCategoria`.
- **Preservazione override umano**: se il comitato ha già deciso la segnalazione (`stato_moderazione !== 'PENDENTE'`), l'elaborazione si conclude con `SKIPPED_HUMAN_OVERRIDE` senza alterare decisioni umane o categorie confermate.
- **Resilienza e policy**: se la classificazione va in timeout, fallisce o non restituisce suggerimenti (`0_SUGGERIMENTI`), la pubblicazione della segnalazione **non viene bloccata** (T07).
- **Selezione esplicita mock/reale**: `ProviderClassificationAdapter` (`isSimulated = false`) non esegue alcun fallback silenzioso al mock; se non configurato solleva `MissingProviderCredentialError`.

Di seguito si presenta il confronto oggettivo tra l'adozione di un modello locale e un servizio esterno per la scelta del modello reale.

---

## Tabella di Confronto: Soluzione Locale vs Soluzione Esterna

| Criterio | Soluzione A: Modello Locale (In-Process / Edge) | Soluzione B: Provider Cloud Esterno (API LLM) |
| :--- | :--- | :--- |
| **Tecnologia Tipica** | Modello compatto ONNX/Transformers.js (es. *multilingual-e5-small* + similarità coseno, fastText compatto, oppure SLM quantizzato *Gemma-2B-IT* via ONNX Runtime). | API LLM con Structured Outputs / JSON Schema (es. OpenAI `gpt-4o-mini`, Anthropic Claude 3.5 Haiku, Mistral NeMo). |
| **Requisiti Hardware** | **CPU**: Architettura x64/ARM64 con supporto AVX2.<br>**RAM**: +1.5 - 4 GB dedicati all'inferenza nel runtime Node.js.<br>**Disco**: 300 MB - 2.5 GB per i pesi del modello. | **Minimi**: Nessun requisito hardware aggiuntivo per il server applicativo; consumo di RAM/disco trascurabile. |
| **Configurazione** | - Pacchetto runtime (es. `@xenova/transformers` o `onnxruntime-node`).<br>- Percorso pesi locali scaricati una tantum (`MODEL_WEIGHTS_DIR`).<br>- Zero credenziali esterne o chiavi API. | - Variabili d'ambiente:<br>  `AI_CLASSIFICATION_ENDPOINT="https://..."`<br>  `AI_CLASSIFICATION_API_KEY="sk-..."`<br>- Zero pesi scaricati su disco locale. |
| **Latenza di Inferenza** | 300 ms – 1.8 s su CPU moderna; fino a 3-5 s su CPU condivise o a basso consumo. Zero latenza di rete. | 250 ms – 700 ms (dipendente dalla latenza di rete verso l'endpoint cloud). |
| **Costi Operativi** | **€ 0,00**: Nessun costo per richiesta o token; costi limitati alle sole risorse computazionali del server. | **Costo a consumo**: Pochi millesimi di centesimo per segnalazione (es. ~0,0003 € per chiamata con `gpt-4o-mini`). |
| **Privacy e Dati** | **Totale**: 100% offline; il testo della segnalazione non lascia mai il server locale. | **Trasmissione a terzi**: Il testo della segnalazione viene inviato via HTTPS all'endpoint del provider (richiede verifica DPA/GDPR, sebbene il testo sia destinato alla pubblicazione civica). |
| **Accuratezza su Categorie Civiche** | - *Embeddings + Coseno*: Buona su parole chiave dirette, limitata su segnalazioni implicite o dialettali.<br>- *Classifier fine-tuned*: Eccellente, ma richiede un dataset di addestramento su segnalazioni reali di Milano. | **Molto elevata**: I moderni LLM comprendono il contesto civico, sinonimi, sfumature ed espressioni gergali milanesi ("marciapiede sconnesso", "bici abbandonata", "tombino intasato") mappandoli con precisione sulla tassonomia chiusa. |
| **Limiti e Rischi** | - Aumento dell'impronta di memoria del container/processo.<br>- Rallentamento di altre operazioni se la CPU è saturata dall'inferenza. | - Dipendenza dalla connettività internet e dallo stato di servizio del provider esterno.<br>- Richiede account e credenziali gestite. |

---

## Contratto dei Dati Rispettato da Entrambe le Soluzioni

Indipendentemente dalla soluzione adottata, il contratto `IClassificationAdapter` implementato nel codice impone:

### Payload in Ingresso (`ClassificationInput`):
```json
{
  "text": "Ci sono lastre di marciapiede dissestate e buche pericolose in viale Monza",
  "allowed_categories": [
    { "id": "cat-strade", "codice": "STRADE", "nome": "Manutenzione Stradale" },
    { "id": "cat-verde", "codice": "VERDE", "nome": "Verde Pubblico" },
    { "id": "cat-illuminazione", "codice": "ILLUMINAZIONE", "nome": "Illuminazione Pubblica" }
  ]
}
```

### Formato di Risposta Validato (`ClassificationOutput`):
```json
{
  "model_version": "civic-classifier-v1.0",
  "suggestions": [
    { "category_id": "cat-strade", "optional_confidence": 0.94 }
  ]
}
```

---

## Stato Attuale nel Codice

1. **`ProviderClassificationAdapter`** (`src/lib/ia/real-adapters.ts`):
   - È contrassegnato con `isSimulated = false`.
   - Se `AI_CLASSIFICATION_ENDPOINT` o `AI_CLASSIFICATION_API_KEY` non sono valorizzati, solleva esplicitamente `MissingProviderCredentialError`.
   - **Nessun fallback silenzioso al mock**: l'errore viene intercettato da `eseguiAnalisiSegnalazione`, registrato come `FAILED` in `AnalisiIa` e non blocca la pubblicazione della segnalazione.
2. **`DeterministicMockClassificationAdapter`** (`src/lib/ia/mock-adapters.ts`):
   - Mantenuto esclusivamente per i test automatici di regressione in CI (`isSimulated = true`).
3. **Nessun download pesante né costo attivato**: in assenza di una scelta esplicita e dell'autorizzazione dell'operatore, nessun modello pesante è stato scaricato e nessuna chiamata a pagamento a terzi è stata eseguita.
