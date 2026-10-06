# La Nostra Città, Il Nostro Futuro — pacchetto di progetto
Revisione del 6 ottobre 2026. Committente della traccia: comitato Insieme per Milano.

## Come utilizzare il pacchetto
Per la verifica: leggere 01, usare 02 per l'analisi, ricopiare 03_ER_concettuale.png sul foglio orizzontale e usare il nucleo di 04 per lo schema logico. Il documento 09 offre una sintesi pronta per i fogli protocollo. La consegna originale richiede materiali 1 e 2: requisiti e progettazione concettuale/logica. L'architettura IA è richiesta per il progetto complessivo, non tra gli elaborati della verifica di oggi.
Per sviluppare: collocare questi file in docs/progetto/ nel repository, leggere 04–08 e avviare il prompt iniziale di 07. Il piano è indipendente dallo stack; in assenza di repository l'agente deve scegliere e documentare uno stack coerente, senza trattarlo come imposto dalla traccia.
Gli schemi sono immagini reali PNG, con copia PDF nel fascicolo. I Markdown sono la fonte testuale per l'agente; il fascicolo DOCX è modificabile e il PDF è stampabile. Lo ZIP contiene tutti i file del pacchetto, senza duplicare gli allegati originali.

## Fonti e limiti
Fonte autoritativa: test d'ingresso (1).docx, sezioni 1–5. Fonte del lavoro svolto: IMG_0731.jpeg (analisi) e IMG_0730.jpeg (ER/logico). Le cancellature e alcuni collegamenti della foto ER non sono leggibili con certezza: la revisione non attribuisce loro un significato inventato. Non è disponibile codice applicativo né un repository. Non sono state recuperate conversazioni precedenti. Non si certifica pertanto alcuna implementazione esistente.
Etichette: [T] esplicito nella traccia; [D] dedotto per renderla coerente; [S] scelta progettuale proposta; [E] evoluzione IA prevista. Le scelte sono fissate in questo pacchetto per rendere implementabile il progetto, ma non diventano obblighi originali della verifica.

## Gerarchia e gestione divergenze
Traccia originale > requisiti espliciti > decisioni documentate > codice. Se il repository contiene vincoli ulteriori, registrarli in una matrice di conflitti prima di cambiare architettura. Non eliminare funzioni esistenti senza comprenderne lo scopo. Nessun nome di modello, livello di ragionamento o IDE è necessario per la correttezza del dominio: i prompt sono progettati per piccoli incrementi verificabili, adatti all'agente indicato dall'utente.
