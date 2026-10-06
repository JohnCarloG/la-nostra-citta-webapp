# ADR-002: Autenticazione e Gestione Sessioni

## Contesto
L'applicazione richiede registrazione, login, logout, ripristino password e validazione email. Il modello logico pre-esistente definisce entità molto specifiche per gestire la sicurezza: `Utente` (con `password_hash`, `stato_account`, `ruolo`), `Sessione` (con `token_hash`, `revocata_il`) e `TokenAccount` (per reset password e verifica email).
Inoltre, le regole richiedono che una sospensione dell'account, un cambio di ruolo o un reset della password si riflettano immediatamente sulle sessioni già aperte.

## Opzioni Considerate
1. **NextAuth.js (Auth.js)**: Soluzione standard in Next.js. Tuttavia, implementare l'autenticazione tramite credenziali con NextAuth salvando le sessioni su database non è supportato nativamente senza complessi workaround. Inoltre, NextAuth gestirebbe una sua struttura di tabelle (User, Account, Session) che si sovrapporrebbe o confliggerebbe con le definizioni rigorose di dominio (`Utente`, `Sessione`).
2. **Sessioni Stateful Custom (Scelta)**: Implementazione diretta utilizzando cookie cifrati/firmati (HTTP-only) contenenti un ID sessione (generato crittograficamente in modo sicuro), il cui hash (es. SHA-256) viene conservato nella tabella `Sessione`. L'hashing delle password utilizzerà la libreria consolidata `bcryptjs`.

## Decisione
Abbiamo scelto le **Sessioni Stateful Custom**.
- **Librerie**: `bcryptjs` per password hash, `crypto` (nativo Node.js) per i token random e HMAC. Nessun pacchetto auth monolitico esterno.
- **Flusso**: Al login, viene generato un token random (128 bit entropia minimo), il suo SHA-256 viene salvato in `Sessione`, e il token in chiaro inviato in un cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- **Integrazione Modello**: Nessuna modifica allo schema. `Utente`, `Sessione`, e `TokenAccount` vengono popolati ed interrogati direttamente dalla nostra logica.
- **Revoca Immediata**: Ad ogni operazione protetta o Server Action, il middleware/layout interroga il DB per verificare che la `Sessione` esista e non sia `revocata_il`, unita allo stato di `Utente` (`stato_account == ATTIVO`). Qualsiasi cambio (sospensione, log off remoto, timeout) renderà immediatamente invalida l'operazione.

## Conseguenze
* Pieno controllo del ciclo di vita della sessione, in conformità totale con il database (Fase 1).
* Maggiore verbosità del codice di login/logout e middleware rispetto a una libreria "magica".
* Maggior sicurezza sull'invalidazione esplicita: il reset della password può eseguire un banale `UPDATE Sessione SET revocata_il = NOW() WHERE utente_id = ...`.
