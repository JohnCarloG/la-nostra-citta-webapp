# Matrice dei Gap (GAP_MATRIX)

| Requisito | Evidenza file | Stato | Intervento | Test |
|-----------|---------------|-------|------------|------|
| RF01 | Nessuno | Mancante | Implementare registrazione, auth e profilo | T01 |
| RF02 | Nessuno | Mancante | Implementare verifica email e token | T01, T02 |
| RF03 | Nessuno | Mancante | Implementare ruoli server-side (COMITATO) | T02 |
| RF04 | Nessuno | Mancante | Implementare upload file e validazione form | T03, T04 |
| RF05 | `schema.prisma`, `segnalazioni.ts` | Impl. (Non Verificato) | Implementare stati (RICEVUTA, etc) e storico | T06 (Bloccato DB) |
| RF06 | `schema.prisma`, `segnalazioni.ts` | Impl. (Non Verificato) | Implementare sostegno e classifica | T05, T13 (Bloccato DB) |
| RF07 | Nessuno | Mancante | Implementare moderazione NLP all'invio | T07 |
| RF08 | Nessuno | Mancante | Implementare classificazione automatica e catalogo | T08 |
| RF09 | Nessuno | Mancante | Implementare estrazione EXIF e mappa interattiva | T04 |
| RF10 | Nessuno | Mancante | Implementare verifica coerenza media/descrizione | T09 |
| RF11 | Nessuno | Mancante | Implementare coda supervisione per COMITATO | T06 |
| RF12 | `schema.prisma` | Impl. (Non Verificato) | Implementare audit log server-side | T11 (Bloccato DB) |
| RF13 | Nessuno | Mancante | Implementare export CSV | T18 |
| RF14 | Nessuno | Mancante | Implementare recupero psw, logout, sospensione | T01, T02 |
| VI01 | `schema.prisma` | Impl. (Non Verificato) | Creare schema DB con FK adeguate | T05 (Bloccato DB) |
| VI02 | `schema.prisma` | Impl. (Non Verificato) | Vincoli UNIQUE su DB, psw hash obbligatorio | T01 |
| VI03 | `schema.prisma`, `segnalazioni.ts` | Impl. (Non Verificato) | PK composta su sostegni, check ruolo attivo | T05 (Bloccato DB) |
| VI04 | `segnalazioni.ts` | Impl. (Non Verificato) | Validazione presenza media per segnalazione (Servizio)| T03 (Bloccato DB) |
| VI05 | Nessuno | Mancante | Check validità coordinate geografiche | T04 |
| VI06 | Nessuno | Mancante | Implementare filtri visibilità API/UI | T12 |
| VI07 | `segnalazioni.ts` | Impl. (Non Verificato) | Transazioni DB per cambi stato e concorrenza | T06 (Bloccato DB) |
| VI08 | `schema.prisma` | Impl. (Non Verificato) | Controllo hash/revisione risultati IA | T10 |
| VI09 | `schema.prisma` | Impl. (Non Verificato) | Impedire cascata su delete (Restrict) | T11 |
| VI10 | Nessuno | Mancante | Sicurezza storage pubblico/privato e no EXIF | T12 |
| VI11 | `schema.prisma` | Impl. (Non Verificato) | Timestamp UTC gestiti da DB/Server | T11 |
| VI12 | `schema.prisma` | Impl. (Non Verificato) | Codici univoci per categorie e gestione IA | T08 |
