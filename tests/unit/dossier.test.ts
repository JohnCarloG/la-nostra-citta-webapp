import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  sanitizeCsvFormula,
  escapeCsvField,
  generateDossierCsv,
  DossierItem,
  getDossierSegnalazioni
} from '../../src/lib/domain/dossier';
import { GET as dossierCsvHandler } from '../../src/app/api/dossier/csv/route';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    segnalazioneCategoria: {
      findMany: vi.fn()
    }
  }
}));

describe('Unit Tests: Dossier Esportabile e Versione Stampabile (Fase 6 - RF13, T18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Protezione da Formula Injection (CSV Injection / DDE)', () => {
    it('neutralizza operatori matematici e di comando all inizio della stringa (=, +, -, @)', () => {
      expect(sanitizeCsvFormula('=1+2')).toBe("'=1+2");
      expect(sanitizeCsvFormula('+cmd|"/C calc"!A0')).toBe("'+cmd|\"/C calc\"!A0");
      expect(sanitizeCsvFormula('-5+10')).toBe("'-5+10");
      expect(sanitizeCsvFormula('@SUM(1,2)')).toBe("'@SUM(1,2)");
    });

    it('neutralizza operatori preceduti da spazi bianchi o ritorni a capo', () => {
      expect(sanitizeCsvFormula('  =1+2')).toBe("'  =1+2");
      expect(sanitizeCsvFormula('   +441234')).toBe("'   +441234");
      expect(sanitizeCsvFormula('\t@malicious')).toBe("'\t@malicious");
      expect(sanitizeCsvFormula('\r-danger')).toBe("'\r-danger");
      expect(sanitizeCsvFormula('\n=SUM(A1:A10)')).toBe("'\n=SUM(A1:A10)");
    });

    it('neutralizza caratteri di controllo non stampabili che precedono formule', () => {
      expect(sanitizeCsvFormula('\u0000=cmd')).toBe("'\u0000=cmd");
      expect(sanitizeCsvFormula('\u001f@execute')).toBe("'\u001f@execute");
    });

    it('non altera il testo normale che non inizia con simboli di formula', () => {
      expect(sanitizeCsvFormula('Piazza del Duomo, 1')).toBe('Piazza del Duomo, 1');
      expect(sanitizeCsvFormula('Buca profonda nell asfalto')).toBe('Buca profonda nell asfalto');
      expect(sanitizeCsvFormula('Segnalazione #1234')).toBe('Segnalazione #1234');
      expect(sanitizeCsvFormula('Testo con formula interna a+b=c')).toBe('Testo con formula interna a+b=c');
      expect(sanitizeCsvFormula('')).toBe('');
    });
  });

  describe('2. Quoting RFC 4180 e Formattazione CSV', () => {
    it('racchiude tra virgolette i campi contenenti virgole, apici o ritorni a capo', () => {
      expect(escapeCsvField('Milano, Centro Storico')).toBe('"Milano, Centro Storico"');
      expect(escapeCsvField('Descrizione con "virgolette"')).toBe('"Descrizione con ""virgolette"""');
      expect(escapeCsvField('Riga 1\nRiga 2')).toBe('"Riga 1\nRiga 2"');
    });

    it('combina neutralizzazione formula injection e quoting RFC 4180 senza conflitti', () => {
      // Caso: cella malevola con formula E virgola
      const cell = '=cmd|"/C calc"!A0, test';
      const escaped = escapeCsvField(cell);
      // Deve avere il prefisso ' per la formula e i doppi apici RFC 4180 con raddoppio delle virgolette interne
      expect(escaped.startsWith('"\'=cmd|""/C calc""!A0, test"')).toBe(true);
    });

    it('genera CSV con Byte Order Mark UTF-8 (\\uFEFF) per Excel e terminatori CRLF', () => {
      const items: DossierItem[] = [
        {
          id: 'seg-1-uuid',
          descrizione: 'Marciapiede dissestato con buca',
          stato_avanzamento: 'RICEVUTA',
          categorie: ['Strade', 'Manutenzione'],
          latitudine: 45.4642,
          longitudine: 9.1900,
          sostegni_validi: 15,
          creata_il: new Date('2026-10-15T10:30:00Z')
        }
      ];

      const csv = generateDossierCsv(items);

      // Byte Order Mark presente al primo byte
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      // Intestazione corretta
      expect(csv).toContain('Posizione,ID Segnalazione,Descrizione,Stato Avanzamento,Categorie,Latitudine,Longitudine,Sostegni Validi,Data Inserimento UTC');
      // Terminatori CRLF
      expect(csv).toContain('\r\n');
      // Dati correttamente formattati
      expect(csv).toContain('seg-1-uuid');
      expect(csv).toContain('"Strade; Manutenzione"');
      expect(csv).toContain('45.464200');
      expect(csv).toContain('9.190000');
      expect(csv).toContain('15');
    });
  });

  describe('3. Tutela Privacy e Assenza di Campi Riservati (T18)', () => {
    it('non include mai email, codici fiscali, password, token o percorsi storage privati nel CSV', () => {
      const items: DossierItem[] = [
        {
          id: 'seg-private-check',
          descrizione: 'Illuminazione pubblica non funzionante in via Dante',
          stato_avanzamento: 'PRESA_IN_CARICO',
          categorie: ['Illuminazione'],
          latitudine: 45.4665,
          longitudine: 9.1861,
          sostegni_validi: 42,
          creata_il: new Date('2026-10-10T08:00:00Z')
        }
      ];

      const csv = generateDossierCsv(items);

      // Verifiche tassative di sicurezza e privacy (T18)
      expect(csv.toLowerCase()).not.toContain('@lanostracitta.it');
      expect(csv.toLowerCase()).not.toContain('@example.com');
      expect(csv.toLowerCase()).not.toContain('email');
      expect(csv.toLowerCase()).not.toContain('codice_fiscale');
      expect(csv.toLowerCase()).not.toContain('password_hash');
      expect(csv.toLowerCase()).not.toContain('token');
      expect(csv.toLowerCase()).not.toContain('storage_key');
      expect(csv.toLowerCase()).not.toContain('.private_storage');
    });
  });

  describe('4. Servizio di Estrazione Condiviso e Regole di Dominio', () => {
    it('applica le regole di visibilità pubblica (APPROVATA e NON RITIRATA) e spareggio coerente con la classifica', async () => {
      const mockRows = [
        {
          id: 'seg-top-1',
          descrizione: 'Priorità numero uno con molti voti',
          latitudine: 45.4700,
          longitudine: 9.1800,
          stato_avanzamento: 'PRESA_IN_CARICO',
          creata_il: new Date('2026-10-01T12:00:00Z'),
          sostegni_validi: 80
        },
        {
          id: 'seg-top-2',
          descrizione: 'Seconda priorità per sostegni',
          latitudine: 45.4800,
          longitudine: 9.2000,
          stato_avanzamento: 'RICEVUTA',
          creata_il: new Date('2026-10-02T12:00:00Z'),
          sostegni_validi: 55
        }
      ];

      (prisma.$queryRaw as unknown as Mock).mockResolvedValue(mockRows);
      (prisma.segnalazioneCategoria.findMany as unknown as Mock).mockResolvedValue([
        { segnalazione_id: 'seg-top-1', categoria: { nome: 'Verde Pubblico' } }
      ]);

      const items = await getDossierSegnalazioni({ ordinamento: 'piu_sostenute' });

      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('seg-top-1');
      expect(items[0].sostegni_validi).toBe(80);
      expect(items[0].categorie).toEqual(['Verde Pubblico']);
      expect(items[1].sostegni_validi).toBe(55);
      expect(items[1].categorie).toEqual([]);

      // Verifica che la query SQL sia stata eseguita
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('restituisce lista vuota senza errori se non ci sono segnalazioni per i filtri specificati', async () => {
      (prisma.$queryRaw as unknown as Mock).mockResolvedValue([]);

      const items = await getDossierSegnalazioni({ categoriaId: 'cat-senza-segnalazioni' });
      expect(items).toEqual([]);
    });
  });

  describe('5. Route Handler Download CSV (/api/dossier/csv)', () => {
    it('restituisce status 200 con Content-Type text/csv e Content-Disposition corretti', async () => {
      (prisma.$queryRaw as unknown as Mock).mockResolvedValue([
        {
          id: 'seg-csv-1',
          descrizione: 'Segnalazione per export CSV',
          latitudine: 45.4642,
          longitudine: 9.1900,
          stato_avanzamento: 'INVIATA_AI_CANDIDATI',
          creata_il: new Date('2026-10-20T14:00:00Z'),
          sostegni_validi: 30
        }
      ]);
      (prisma.segnalazioneCategoria.findMany as unknown as Mock).mockResolvedValue([]);

      const req = new NextRequest('http://localhost:3000/api/dossier/csv');
      const res = await dossierCsvHandler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="dossier-priorita-milano-');
      expect(res.headers.get('Cache-Control')).toContain('no-store');

      const text = await res.text();
      expect(text).toContain('seg-csv-1');
      expect(text).toContain('INVIATA_AI_CANDIDATI');
    });

    it('in caso di errore del database restituisce HTTP 503 e non genera mai un CSV vuoto apparentemente riuscito (Requisito 4)', async () => {
      // Simula crash di rete o indisponibilità database
      (prisma.$queryRaw as unknown as Mock).mockRejectedValue(new Error('Connection to MySQL failed: ECONNREFUSED'));

      const req = new NextRequest('http://localhost:3000/api/dossier/csv');
      const res = await dossierCsvHandler(req);

      // Deve restituire status 503 Service Unavailable, NON 200 con un CSV fasullo!
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain('database');
    });
  });
});
