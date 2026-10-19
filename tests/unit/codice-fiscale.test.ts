import { describe, it, expect } from 'vitest';
import {
  validaCodiceFiscale,
  calcolaCarattereDiControllo,
  decodificaOmocodia,
  normalizzaCodiceFiscale
} from '../../src/lib/domain/codice-fiscale';

describe('Validazione e Normalizzazione Codice Fiscale', () => {
  it('normalizza correttamente rimuovendo spazi e convertendo in maiuscolo', () => {
    expect(normalizzaCodiceFiscale('  rssmra85m01h501z  ')).toBe('RSSMRA85M01H501Z');
  });

  it('calcola correttamente il carattere di controllo (CIN)', () => {
    // RSSMRA85M01H501 -> Q
    expect(calcolaCarattereDiControllo('RSSMRA85M01H501')).toBe('Q');
    // FOOBAR90A01F205 -> CIN
    const cin = calcolaCarattereDiControllo('FOOBAR90A01F205');
    expect(typeof cin).toBe('string');
    expect(cin.length).toBe(1);
  });

  it('valida con successo un codice fiscale standard corretto', () => {
    const res = validaCodiceFiscale('RSSMRA85M01H501Q');
    expect(res.valido).toBe(true);
    expect(res.cfNormalizzato).toBe('RSSMRA85M01H501Q');
    expect(res.motivoErrore).toBeUndefined();
  });

  it('valida con successo un codice fiscale femminile corretto', () => {
    // BNCFNC80A41F205X (Bianchi Francesca, nata il 01/01/1980 a Milano F205 -> 41 per femmina)
    const cin = calcolaCarattereDiControllo('BNCFNC80A41F205');
    const cf = `BNCFNC80A41F205${cin}`;
    const res = validaCodiceFiscale(cf);
    expect(res.valido).toBe(true);
  });

  it('valida con successo codici fiscali con omocodia', () => {
    // Prendiamo RSSMRA85M01H501Z: posizioni numeriche 6,7, 9,10, 12,13,14
    // pos 14 è '1' -> in omocodia '1' può diventare 'M'
    // Se modifichiamo una cifra in omocodia, dobbiamo ricalcolare il CIN corrispondente
    // 'RSSMRA85M01H50M' -> calcolo CIN
    const cinOmocodia = calcolaCarattereDiControllo('RSSMRA85M01H50M');
    const cfOmocodia = `RSSMRA85M01H50M${cinOmocodia}`;

    const res = validaCodiceFiscale(cfOmocodia);
    expect(res.valido).toBe(true);
    expect(decodificaOmocodia(cfOmocodia).slice(11, 15)).toBe('H501');
  });

  it('rifiuta codici con carattere di controllo errato', () => {
    // Sostituisci l'ultimo carattere corretto 'Z' con 'A'
    const res = validaCodiceFiscale('RSSMRA85M01H501A');
    expect(res.valido).toBe(false);
    expect(res.motivoErrore).toContain('Carattere di controllo');
  });

  it('rifiuta lunghezze diverse da 16 caratteri', () => {
    expect(validaCodiceFiscale('RSSMRA85M01H501').valido).toBe(false);
    expect(validaCodiceFiscale('RSSMRA85M01H501ZZ').valido).toBe(false);
  });

  it('rifiuta codici con caratteri speciali non ammessi', () => {
    const res = validaCodiceFiscale('RSSMRA85M01H501!');
    expect(res.valido).toBe(false);
    expect(res.motivoErrore).toContain('caratteri non ammessi');
  });

  it('rifiuta codici con mese di nascita inesistente', () => {
    // Mese 'Z' non è tra i mesi ammessi
    const primi15 = 'RSSMRA85Z01H501';
    const cin = calcolaCarattereDiControllo(primi15);
    const res = validaCodiceFiscale(primi15 + cin);
    expect(res.valido).toBe(false);
    expect(res.motivoErrore).toContain('Mese di nascita');
  });

  it('rifiuta codici con giorno di nascita fuori intervallo (es. 00 o 35)', () => {
    const primi15 = 'RSSMRA85M35H501'; // 35 non è 1-31 né 41-71
    const cin = calcolaCarattereDiControllo(primi15);
    const res = validaCodiceFiscale(primi15 + cin);
    expect(res.valido).toBe(false);
    expect(res.motivoErrore).toContain('Giorno di nascita');
  });
});
