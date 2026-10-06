# Decisioni, ambiguità e consegna
## Registro decisioni iniziale
ADR-001 Stack: da fissare dopo ricognizione, nessuno imposto dalla traccia.
ADR-002 Identità: email verificata come minimo operativo; non equivale a identità civile. CF/DOB/indirizzo completo esclusi dal default.
ADR-003 Dati: ID tecnici, entità MEDIA e relazioni associative per categorie/sostegni; autore esplicito, audit aggiuntivo.
ADR-004 Pubblicazione: moderazione separata dall'avanzamento; fail-closed per errori/dubbi, revisione umana possibile.
ADR-005 File: almeno uno, fino a cinque; temporanei fuori dal nucleo; originali privati, derivati pubblici privi EXIF.
ADR-006 Geografia: intervento con coordinate confermate, quartiere utente opzionale. EXIF assente ammesso, fallback manuale.
ADR-007 Sostegno: uno per coppia, revocabile, no autosostegno; utenti sospesi esclusi dal conteggio; ordinamento deterministico.
ADR-008 IA: adattatori versionati, risultati per revisione e input, coda persistente, nessun potere esecutivo del provider.
ADR-009 Supervisione: non implica riscrittura identità o contenuto altrui; moderazione, avanzamento, categorie e sospensione motivata.
ADR-010 Scope: verifica scolastica requisiti+ER/logico; progetto completo include IA, API/UI, test e operatività. Export scelto per concretizzare l'obiettivo del dossier.

## Questioni da confermare prima della produzione
Definizione di “profilo verificato” desiderata dal comitato; verifica email è default di progetto. Confini territoriali e catalogo quartieri ufficialmente adottati. Limiti upload e gestione video rispetto a risorse reali. Provider IA, trattamento dati, costi e soglie valutate. Gestione richieste di cancellazione, retention audit/originali e licenze media/mappe. Destinatari e modalità operative del dossier. Numero utenti attesi, ambiente hosting, responsabilità moderazione e tempi di intervento. Queste incertezze non bloccano un prototipo completo con dati sintetici e configurazioni esplicite, ma impediscono di dichiarare pronto un servizio pubblico reale senza verifica.

## Definition of Done
Documentazione: requisiti tracciati, schema ER come immagine leggibile e logico coerente, architettura IA, README operativo, ADR e report finale.
Dominio: invio documentato, identità verificata, ruoli, sostegni unici, classifica, mappa, moderazione, categorie, ciclo di vita e audit funzionanti.
IA: integrazioni reali dimostrate o incompletezza dichiarata; nessun mock spacciato per modello; fallback, obsoletezza e retry coperti.
Dati: migrazioni riproducibili, vincoli, fixture sintetiche, transazioni e concorrenza testate, originali protetti.
Qualità: matrice T01–T18 con evidenze, build riuscita, zero difetti bloccanti su autorizzazioni/visibilità/integrità, limiti restanti dichiarati.
Operatività: configurazione senza segreti committati, avvio documentato, backup/ripristino e worker verificati; deploy subordinato alla richiesta esplicita.
Questo pacchetto è una specifica e un piano verificabile, non un'applicazione già implementata o collaudata.
