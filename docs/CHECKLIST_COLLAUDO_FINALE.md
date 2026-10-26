# Checklist di Collaudo Finale Operatore (Accettazione di Sistema)

> **Nota Operativa**: Questa checklist raccoglie l'insieme completo delle verifiche funzionali, di sicurezza, territoriali e di accessibilità del sistema **La Nostra Città, Il Nostro Futuro**.  
> Le prove sono predisposte per l'esecuzione manuale da parte dell'operatore o del committente durante la fase di collaudo finale. Nessuna casella è precompilata come superata.

---

## 1. Prerequisiti di Sistema per il Collaudo
- [ ] Applicazione avviata e raggiungibile (es. `http://localhost:3000` o URL di staging)
- [ ] Database MySQL 8.4 raggiungibile con migrazioni applicate (`20261006000000_init_mysql`)
- [ ] Dati dimostrativi inizializzati (`npm run seed:demo` o `scripts/seed-demo-data.ts`)
- [ ] Cartella di storage locale `.private_storage/` creata e scrivibile dal processo applicativo
- [ ] Casella di posta o Outbox ispezionabile per la ricezione dei token email

---

## 2. Matrice delle Prove di Collaudo

| ID | Ambito | Azione Operatore | Risultato Atteso | Esito (OK / KO) | Note ed Evidenza |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **CL-01** | **Registrazione e Codice Fiscale** | Accedere a `/register`. Inserire Nome, Cognome, Email valida, Password e Codice Fiscale formattato (16 caratteri con algoritmo ministeriale valido). | L'account viene creato in stato `NON_VERIFICATO`. Viene accodato un evento `INVIO_EMAIL` con token monouso. Il form non consente la scelta del ruolo (default: `CITTADINO`). | [ ] | |
| **CL-02** | **Blocco Accesso Pre-Verifica** | Tentare il login su `/login` con le credenziali appena registrate prima di verificare l'email. | Accesso negato con messaggio chiaro: "Account non verificato. Verifica la tua email prima di accedere". | [ ] | |
| **CL-03** | **Verifica Email Monouso** | Cliccare sul link `/verify?token=<token>` ricevuto o inserire il token monouso. | Transizione atomica dell'account a `verificato_il` valorizzato. Un secondo clic sullo stesso link o token già usato mostra "Token non valido o già utilizzato". | [ ] | |
| **CL-04** | **Login e Sessione Sicura** | Effettuare login su `/login` con le credenziali verificate. | Accesso riuscito, cookie di sessione HTTP-only `la_nostra_citta_session` impostato, reindirizzamento alla dashboard cittadino. | [ ] | |
| **CL-05** | **Reset Password e Revoca Sessioni** | Da `/reset-password`, richiedere il reset email. Cliccare sul link di conferma, inserire la nuova password. | La password viene aggiornata con hash bcrypt. Tutte le sessioni attive dell'utente su altri dispositivi o browser vengono revocate immediatamente. Il vecchio login fallisce. | [ ] | |
| **CL-06** | **Nuova Segnalazione: Descrizione e Upload** | Accedere a `/segnalazioni/nuova`. Inserire descrizione (tra 20 e 5000 caratteri). Caricare un'immagine valida (JPEG, PNG o WebP) o un breve video MP4. | File caricato nello storage privato con nome opaco/GUID. Mostrata anteprima temporanea. Tentativo di caricare file mascherato o eseguibile (.exe/.php rinominato) viene respinto dal controllo dei magic bytes. | [ ] | |
| **CL-07** | **Scelta Luogo: Ricerca Nominatim Milano** | Nella scheda del luogo, digitare una via di Milano (es. "Via Dante") e premere Invio o il pulsante "Cerca". | Nessuna chiamata durante la digitazione. Ricerca inviata a `/api/geo/search`; dropdown mostra indirizzi pertinenti a Milano. La selezione colloca il segnaposto unico sulla mappa. | [ ] | |
| **CL-08** | **Scelta Luogo: Mappa e Trascina Segnaposto** | Cliccare su un punto della mappa Leaflet o trascinare il segnaposto esistente. | Le coordinate latitudine e longitudine si aggiornano in tempo reale. Rimane sempre un solo segnaposto visibile. L'origine della posizione viene impostata a `MANUALE`. | [ ] | |
| **CL-09** | **Scelta Luogo: GPS e Suggerimento EXIF** | Cliccare su "Usa la mia posizione" (se browser consente GPS), oppure caricare una foto JPEG contenente tag EXIF GPS. | GPS: aggiorna il punto senza sovrascrivere se l'utente nega i permessi (mostra alert accessibile). EXIF: appare banner di suggerimento non invasivo con opzioni "Usa posizione foto" o "Ignora". | [ ] | |
| **CL-10** | **Scelta Luogo: Alternativa Testuale** | Passare al tab "Alternativa testuale". Inserire manualmente latitudine (45.4642), longitudine (9.1900) e indirizzo descrittivo. | Piena compilazione e validazione senza richiedere l'uso della mappa. Scheda di riepilogo finale mostra le coordinate e richiede la casella di conferma esplicita prima dell'invio. | [ ] | |
| **CL-11** | **Invio Atomico Segnalazione** | Spuntare la conferma della posizione e cliccare su "Invia Segnalazione". | Invio atomico riuscito: stato iniziale `RICEVUTA`, stato moderazione `PENDENTE`. Gli upload temporanei passano a `CONSUMATO`. Se l'invio fallisce, nessun file orfano rimane esposto. | [ ] | |
| **CL-12** | **Visibilità Pubblica (VI06)** | Da finestra anonima/non autenticata, aprire `/segnalazioni` e `/classifica`. | La segnalazione appena inviata (`PENDENTE`) NON è visibile al pubblico né nella mappa né in classifica. Solo l'autore da `/segnalazioni/[id]` o il comitato da `/comitato` possono vederla. | [ ] | |
| **CL-13** | **Moderazione Comitato (RF11)** | Accedere con utente avente ruolo `COMITATO` a `/comitato`. Aprire la coda revisioni. | La segnalazione compare nella lista. Il comitato può approvare con motivazione, rifiutare o correggere le categorie confermate. L'approvazione la rende pubblica. | [ ] | |
| **CL-14** | **Sostegno Civico Idempotente (RF06, VI03)** | Accedere con un cittadino diverso dall'autore. Aprire `/segnalazioni/[id]` e cliccare su "Sostieni". | Il contatore dei sostegni sale di 1. Ricaricare la pagina e cliccare ripetutamente: non genera duplicati (idempotenza). Cliccare su "Rimuovi sostegno": il contatore scende a 0. | [ ] | |
| **CL-15** | **Divieto di Autosostegno** | Accedere con l'utente autore della segnalazione e aprire il proprio dettaglio. | Il pulsante di sostegno è disabilitato/nascosto. Tentativo di chiamata API diretta restituisce errore 403 / violazione vincolo: vietato sostenere le proprie segnalazioni. | [ ] | |
| **CL-16** | **Classifica e Spareggio (RF06, T13)** | Aprire `/classifica`. Confrontare due segnalazioni con lo stesso numero di sostegni validi. | Lo spareggio posiziona per prima la segnalazione più anziana (`creata_il ASC`), poi per `id ASC`. Segnalazioni con 0 voti sono incluse in graduatoria; segnalazioni ritirate o in revisione sono escluse. | [ ] | |
| **CL-17** | **Mappa Pubblica e Pannello Accessibile (RF09, T16)** | Accedere a `/mappa`. Esaminare la mappa con i punti geolocalizzati e aprire la vista tabellare alternativa. | Ogni punto approvato è rappresentato. Il pannello alternativo elenca tutte le segnalazioni con coordinate, quartiere e link al dettaglio, navigabile da tastiera con Tab/Invio. | [ ] | |
| **CL-18** | **Dossier CSV e Formula Injection (RF13, T18)** | Dalla classifica o da `/dossier`, cliccare su "Scarica Dossier (CSV)". Aprire il file con un foglio di calcolo (Excel / Calc). | Il file scaricato contiene UTF-8 BOM (accenti visualizzati correttamente). Nessuna email, CF o token presente. Celle con caratteri `=, +, -, @` o spazi iniziali sono neutralizzate con `'`. | [ ] | |
| **CL-19** | **Dossier Versione Stampabile** | Accedere a `/dossier`. Premere `Ctrl+P` o cliccare su "Stampa Dossier". Esaminare l'anteprima di stampa. | Controlli interattivi (pulsanti, navbar, filtri, footer) nascosti. Tabella formattata con intestazione ripetuta su ogni pagina (`thead`) e righe che non si spezzano a metà (`break-inside: avoid`). | [ ] | |
| **CL-20** | **Protezione Accesso Media Privati (VI10)** | Recuperare l'URL `/api/media/[id]` di un allegato associato a una segnalazione ritirata o in revisione. Tentare il download da browser non autenticato. | Accesso negato (HTTP 404/403). Nessun percorso fisico del disco (`.private_storage/`) trapela negli header o nel corpo della risposta. | [ ] | |
| **CL-21** | **Resilienza Errore Database** | Simulare temporaneamente indisponibilità DB e caricare `/dossier` o richiedere `/api/dossier/csv`. | L'API risponde con HTTP 503 e non genera un CSV vuoto ingannevole. La pagina mostra un banner accessibile "Servizio momentaneamente non disponibile" con tasto "Riprova". | [ ] | |
| **CL-22** | **Navigazione Tastiera e Mobile** | Ridurre la finestra a 375px (viewport mobile standard) e navigare l'intera app usando esclusivamente il tasto `Tab`, le frecce e `Invio`. | Tutti gli elementi interattivi hanno focus visibile ad alto contrasto. Nessun testo o controllo vitale viene tagliato orizzontalmente. Nessuna trappola del focus. | [ ] | |

---

## 3. Verbale di Conclusione Collaudo
- **Data e Ora Collaudo**: `____ / ____ / ________` ore `____:____`
- **Ambiente di Esecuzione**: OS: `____________________` Browser: `____________________`
- **Operatore Responsabile**: `________________________________________`
- **Esito Complessivo**: `[ ] ACCETTATO SENZA RISERVE` &nbsp;&nbsp; `[ ] ACCETTATO CON RISERVE` &nbsp;&nbsp; `[ ] NON ACCETTATO`
- **Firma Operatore**: `________________________________________`
