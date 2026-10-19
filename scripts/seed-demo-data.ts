import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Carica solo .env (ambiente applicativo dimostrativo)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && datasourceUrl.includes('sslcert=ca.pem')) {
  const absCa = path.resolve(process.cwd(), 'ca.pem');
  datasourceUrl = datasourceUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
}

const prisma = new PrismaClient({
  datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
});

// Catalogo quartieri ufficiali di Milano da garantire a DB
const QUARTIERI_MILANO = [
  { id: 'demo-q-0000-0000-0000-000000000001', nome: 'Centro Storico' },
  { id: 'demo-q-0000-0000-0000-000000000002', nome: 'Brera - Guastalla' },
  { id: 'demo-q-0000-0000-0000-000000000003', nome: 'Navigli - Porta Genova' },
  { id: 'demo-q-0000-0000-0000-000000000004', nome: 'Porta Ticinese - Darsena' },
  { id: 'demo-q-0000-0000-0000-000000000005', nome: 'Porta Romana' },
  { id: 'demo-q-0000-0000-0000-000000000006', nome: 'Città Studi - Lambrate' },
  { id: 'demo-q-0000-0000-0000-000000000007', nome: 'Isola - Porta Nuova' },
  { id: 'demo-q-0000-0000-0000-000000000008', nome: 'NoLo - Loreto' },
  { id: 'demo-q-0000-0000-0000-000000000009', nome: 'San Siro - Fiera' },
  { id: 'demo-q-0000-0000-0000-000000000010', nome: 'Bicocca - Greco' },
  { id: 'demo-q-0000-0000-0000-000000000011', nome: 'Sempione - Tre Torri' },
  { id: 'demo-q-0000-0000-0000-000000000012', nome: 'Bovisa - Dergano' },
];

// Utenti sintetici per supporto e paternità segnalazioni (mai email reali, dominio .local non instradabile)
const UTENTI_SINTETICI = [
  {
    id: 'demo-usr-0000-0000-0000-000000000001',
    nome: 'Giulia',
    cognome: 'Colombo',
    email: 'giulia.colombo.demo@lanostracitta.dimostrativo.local',
    cf: 'CLMGPR88H55F205K',
    quartiereNome: 'Sempione - Tre Torri',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000002',
    nome: 'Marco',
    cognome: 'Ferrari',
    email: 'marco.ferrari.demo@lanostracitta.dimostrativo.local',
    cf: 'FRRMRC90A15F205W',
    quartiereNome: 'NoLo - Loreto',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000003',
    nome: 'Sara',
    cognome: 'Villa',
    email: 'sara.villa.demo@lanostracitta.dimostrativo.local',
    cf: 'VLLSRA92D41F205T',
    quartiereNome: 'Navigli - Porta Genova',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000004',
    nome: 'Alessandro',
    cognome: 'Riva',
    email: 'alessandro.riva.demo@lanostracitta.dimostrativo.local',
    cf: 'RVILSN85M12F205A',
    quartiereNome: 'Porta Ticinese - Darsena',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000005',
    nome: 'Elena',
    cognome: 'Bianchi',
    email: 'elena.bianchi.demo@lanostracitta.dimostrativo.local',
    cf: 'BNCLNE87P52F205D',
    quartiereNome: 'Centro Storico',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000006',
    nome: 'Matteo',
    cognome: 'Brambilla',
    email: 'matteo.brambilla.demo@lanostracitta.dimostrativo.local',
    cf: 'BRBMTT94B20F205S',
    quartiereNome: 'Isola - Porta Nuova',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000007',
    nome: 'Chiara',
    cognome: 'Sala',
    email: 'chiara.sala.demo@lanostracitta.dimostrativo.local',
    cf: 'SLACHR96L48F205H',
    quartiereNome: 'Città Studi - Lambrate',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000008',
    nome: 'Davide',
    cognome: 'Cattaneo',
    email: 'davide.cattaneo.demo@lanostracitta.dimostrativo.local',
    cf: 'CTTDVD89T10F205L',
    quartiereNome: 'Porta Romana',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000009',
    nome: 'Francesca',
    cognome: 'Galli',
    email: 'francesca.galli.demo@lanostracitta.dimostrativo.local',
    cf: 'GLLFNC93M50F205Y',
    quartiereNome: 'Brera - Guastalla',
  },
  {
    id: 'demo-usr-0000-0000-0000-000000000010',
    nome: 'Luca',
    cognome: 'Beretta',
    email: 'luca.beretta.demo@lanostracitta.dimostrativo.local',
    cf: 'BRTLCU91R18F205E',
    quartiereNome: 'San Siro - Fiera',
  },
];

// Funzione helper per preparare un file nel private storage
async function assicuraFileStoragePrivato(nomeImmaginePubblica: string, storageKey: string): Promise<{ byteSize: number; sha256: string }> {
  const sourcePath = path.resolve(process.cwd(), 'public', 'images', nomeImmaginePubblica);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Immagine sorgente non trovata in public/images/${nomeImmaginePubblica}`);
  }

  const buffer = fs.readFileSync(sourcePath);
  const { getStorageProvider } = await import('../src/lib/storage');
  const storage = getStorageProvider();
  await storage.putObject(storageKey, buffer, 'image/jpeg');

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    byteSize: buffer.length,
    sha256: hash
  };
}

async function main() {
  console.log('================================================================');
  console.log('   POPOLAMENTO NON DISTRUTTIVO AMBIENTE DIMOSTRATIVO CIVICO     ');
  console.log('================================================================');

  // 1. Verifica dell'ambiente di destinazione senza stampare credenziali
  const dbRows = await prisma.$queryRaw<Array<{ current_db: string | null }>>`SELECT DATABASE() as current_db;`;
  const activeDb = dbRows?.[0]?.current_db;
  console.log(`Destinazione verificata: '${activeDb}'.`);

  if (activeDb === 'la_nostra_citta_test') {
    throw new Error('ERRORE: Lo script dimostrativo non deve essere eseguito sul database dei test automatici.');
  }

  // 2. Popolamento / allineamento catalogo quartieri di Milano
  const quartieriMap = new Map<string, string>();
  for (const q of QUARTIERI_MILANO) {
    const existing = await prisma.quartiere.findUnique({ where: { nome: q.nome } });
    if (existing) {
      quartieriMap.set(q.nome, existing.id);
    } else {
      const created = await prisma.quartiere.create({
        data: {
          id: q.id,
          nome: q.nome,
        }
      });
      quartieriMap.set(q.nome, created.id);
    }
  }
  console.log(`[OK] Allineati ${quartieriMap.size} quartieri del Comune di Milano.`);

  // 3. Reperimento categorie di progetto esistenti
  const categorie = await prisma.categoria.findMany({ select: { id: true, codice: true } });
  const catMap = new Map(categorie.map(c => [c.codice, c.id]));
  console.log(`[OK] Rilevate ${catMap.size} categorie attive.`);

  // 4. Creazione utenti sintetici verificati (password non autenticabile dall'esterno, email non instradabili)
  const syntheticPasswordHash = '$2a$10$e8wF4rU91pT0nSynthet1cDem0HashForVerif1edC1t1zensOnlyDoNotUse';
  for (const u of UTENTI_SINTETICI) {
    const qId = quartieriMap.get(u.quartiereNome);
    await prisma.utente.upsert({
      where: { email_normalizzata: u.email },
      update: {
        codice_fiscale: u.cf,
        quartiere_id: qId,
        verificato_il: new Date('2026-09-01T10:00:00Z'),
      },
      create: {
        id: u.id,
        nome: u.nome,
        cognome: u.cognome,
        email_normalizzata: u.email,
        password_hash: syntheticPasswordHash,
        codice_fiscale: u.cf,
        quartiere_id: qId,
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date('2026-09-01T10:00:00Z'),
      }
    });
  }
  console.log(`[OK] Allineati ${UTENTI_SINTETICI.length} profili civici sintetici per supporto.`);

  // 5. Definizione delle 11 segnalazioni dimostrative realistiche
  const SEGNALAZIONI_DEMO = [
    {
      id: 'demo-seg-0000-0000-0000-000000000001',
      autoreIdx: 0,
      descrizione: '[Segnalazione dimostrativa] Manutenzione delle panchine in legno e cura del manto erboso nell\'area verde adiacente al Parco Sempione. Risultano alcune assi degradate che necessitano di carteggiatura e trattamento protettivo per la sicurezza dei frequentatori.',
      lat: 45.4725,
      lon: 9.1765,
      catCodice: 'VERDE_ARREDO',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'PRESA_IN_CARICO' as const,
      immagine: 'preview-parco.jpg',
      voterCount: 8,
      dataCreazione: new Date('2026-09-10T11:20:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000002',
      autoreIdx: 1,
      descrizione: '[Segnalazione dimostrativa] Richiesta di ripristino del cordolo spartitraffico e ripasso della segnaletica orizzontale della corsia ciclabile in Corso Buenos Aires nei pressi di piazza Lima, per impedire la sosta temporanea non autorizzata.',
      lat: 45.4812,
      lon: 9.2110,
      catCodice: 'MOBILITA_SOSTENIBILE',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'INVIATA_AI_CANDIDATI' as const,
      immagine: 'preview-bici.jpg',
      voterCount: 10,
      dataCreazione: new Date('2026-09-12T09:15:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000003',
      autoreIdx: 2,
      descrizione: '[Segnalazione dimostrativa] Presenza di una buca superficiale e dislivello della pavimentazione in corrispondenza dell\'attraversamento pedonale in via Tortona angolo via Savona. Rischio inciampo per residenti e persone anziane.',
      lat: 45.4520,
      lon: 9.1650,
      catCodice: 'STRADE_MARCIAPIEDI',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'PRESA_IN_CARICO' as const,
      immagine: 'preview-strada.jpg',
      voterCount: 6,
      dataCreazione: new Date('2026-09-15T14:30:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000004',
      autoreIdx: 3,
      descrizione: '[Segnalazione dimostrativa] Ripristino dell\'illuminazione pubblica pedonale: due lampioni consecutivi lungo l\'alzaia del Naviglio Grande risultano intermittenti durante le ore notturne, creando una zona d\'ombra prolungata.',
      lat: 45.4510,
      lon: 9.1720,
      catCodice: 'ILLUMINAZIONE',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'preview-luce.jpg',
      voterCount: 4,
      dataCreazione: new Date('2026-09-18T20:10:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000005',
      autoreIdx: 4,
      descrizione: '[Segnalazione dimostrativa] Realizzazione di una rampa di raccordo per abbattimento barriere architettoniche tra via Dante e Largo Cairoli per facilitare il transito a persone con mobilità ridotta e carrozzine.',
      lat: 45.4675,
      lon: 9.1830,
      catCodice: 'ACCESSIBILITA',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'INVIATA_AI_CANDIDATI' as const,
      immagine: 'preview-strada.jpg',
      voterCount: 9,
      dataCreazione: new Date('2026-09-20T10:00:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000006',
      autoreIdx: 5,
      descrizione: '[Segnalazione dimostrativa] Richiesta di integrazione dei contenitori per piccoli rifiuti con posacenere integrato e pulizia potenziata nei weekend nell\'area pedonale di piazza Gae Aulenti.',
      lat: 45.4840,
      lon: 9.1905,
      catCodice: 'RIFIUTI_PULIZIA',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'hero-civic.jpg',
      voterCount: 5,
      dataCreazione: new Date('2026-09-22T16:45:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000007',
      autoreIdx: 6,
      descrizione: '[Segnalazione dimostrativa] Installazione di nuove rastrelliere per biciclette e monopattini nei pressi delle aule studio universitarie in piazza Leonardo da Vinci per ordinare il parcheggio dei mezzi leggeri.',
      lat: 45.4785,
      lon: 9.2270,
      catCodice: 'MOBILITA_SOSTENIBILE',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'preview-bici.jpg',
      voterCount: 7,
      dataCreazione: new Date('2026-09-25T11:00:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000008',
      autoreIdx: 7,
      descrizione: '[Segnalazione dimostrativa] Riparazione del supporto del diffusore luminoso situato nei pressi della Basilica di San Lorenzo Maggiore per garantire sicurezza e visibilità serale nel passaggio pedonale.',
      lat: 45.4580,
      lon: 9.1820,
      catCodice: 'ILLUMINAZIONE',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'PRESA_IN_CARICO' as const,
      immagine: 'preview-luce.jpg',
      voterCount: 3,
      dataCreazione: new Date('2026-09-28T18:30:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000009',
      autoreIdx: 8,
      descrizione: '[Segnalazione dimostrativa] Proposta di riqualificazione verde e piantumazione di essenze arboree nelle aiuole spartitraffico di via Crema angolo viale Isonzo, migliorando il microclima urbano locale.',
      lat: 45.4530,
      lon: 9.2010,
      catCodice: 'VERDE_ARREDO',
      statoMod: 'APPROVATA' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'preview-parco.jpg',
      voterCount: 5,
      dataCreazione: new Date('2026-10-02T09:40:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000010',
      autoreIdx: 0,
      descrizione: '[Segnalazione dimostrativa] Segnalazione di ciottoli disallineati nel pavé storico di via Fiori Chiari che provocano sobbalzi continui per carrelli merci e biciclette.',
      lat: 45.4715,
      lon: 9.1870,
      catCodice: 'DECORO_URBANO',
      statoMod: 'IN_REVISIONE' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'preview-strada.jpg',
      voterCount: 1,
      dataCreazione: new Date('2026-10-05T12:00:00Z'),
    },
    {
      id: 'demo-seg-0000-0000-0000-000000000011',
      autoreIdx: 1,
      descrizione: '[Segnalazione dimostrativa] Verifica della cartellonistica e dell\'illuminazione all\'incrocio tra via Cenisio e via Procaccini per migliorare la visibilità degli attraversamenti serali.',
      lat: 45.4870,
      lon: 9.1725,
      catCodice: 'SICUREZZA_DEGRADO',
      statoMod: 'PENDENTE' as const,
      statoAvanz: 'RICEVUTA' as const,
      immagine: 'preview-luce.jpg',
      voterCount: 0,
      dataCreazione: new Date('2026-10-08T15:20:00Z'),
    },
  ];

  // 6. Inserimento idempotente delle segnalazioni dimostrative
  for (const s of SEGNALAZIONI_DEMO) {
    const autoreId = UTENTI_SINTETICI[s.autoreIdx].id;
    const catId = catMap.get(s.catCodice);
    if (!catId) {
      console.warn(`Categoria non trovata per ${s.catCodice}, salto segnalazione ${s.id}`);
      continue;
    }

    // Storage privato
    const storageKey = `uploads/demo/${s.id}.jpg`;
    const fileMeta = await assicuraFileStoragePrivato(s.immagine, storageKey);
    const mediaId = `demo-med-${s.id.slice(9)}`;

    // Upsert Segnalazione
    await prisma.segnalazione.upsert({
      where: { id: s.id },
      update: {
        autore_id: autoreId,
        descrizione: s.descrizione,
        latitudine: s.lat,
        longitudine: s.lon,
        origine_posizione: 'MANUALE',
        stato_moderazione: s.statoMod,
        stato_avanzamento: s.statoAvanz,
        creata_il: s.dataCreazione,
      },
      create: {
        id: s.id,
        autore_id: autoreId,
        descrizione: s.descrizione,
        latitudine: s.lat,
        longitudine: s.lon,
        origine_posizione: 'MANUALE',
        stato_moderazione: s.statoMod,
        stato_avanzamento: s.statoAvanz,
        revisione: 1,
        creata_il: s.dataCreazione,
      }
    });

    // Associazione Categoria
    await prisma.segnalazioneCategoria.upsert({
      where: {
        segnalazione_id_categoria_id: {
          segnalazione_id: s.id,
          categoria_id: catId,
        }
      },
      update: {},
      create: {
        segnalazione_id: s.id,
        categoria_id: catId,
      }
    });

    // Media valido collegato a storage privato
    await prisma.media.upsert({
      where: { id: mediaId },
      update: {
        storage_key: storageKey,
        mime: 'image/jpeg',
        byte_size: fileMeta.byteSize,
        sha256: fileMeta.sha256,
        stato_file: 'READY',
      },
      create: {
        id: mediaId,
        segnalazione_id: s.id,
        storage_key: storageKey,
        tipo: 'FOTO',
        mime: 'image/jpeg',
        byte_size: fileMeta.byteSize,
        sha256: fileMeta.sha256,
        stato_file: 'READY',
        creato_il: s.dataCreazione,
      }
    });

    // Cronologia EventoStato coerente
    const evtCreazioneId = `demo-evt-crea-${s.id.slice(14)}`;
    await prisma.eventoStato.upsert({
      where: { id: evtCreazioneId },
      update: {},
      create: {
        id: evtCreazioneId,
        segnalazione_id: s.id,
        tipo_attore: 'UTENTE',
        attore_id: autoreId,
        ambito: 'MODERAZIONE',
        da_stato: null,
        a_stato: 'PENDENTE',
        motivazione: 'Segnalazione inserita dal cittadino (ambiente dimostrativo)',
        revisione: 1,
        creato_il: s.dataCreazione,
      }
    });

    if (s.statoMod === 'APPROVATA') {
      const evtModId = `demo-evt-mod-${s.id.slice(14)}`;
      await prisma.eventoStato.upsert({
        where: { id: evtModId },
        update: {},
        create: {
          id: evtModId,
          segnalazione_id: s.id,
          tipo_attore: 'SISTEMA',
          attore_id: null,
          ambito: 'MODERAZIONE',
          da_stato: 'PENDENTE',
          a_stato: 'APPROVATA',
          motivazione: 'Segnalazione approvata e conforme alle linee guida di moderazione civica.',
          revisione: 1,
          creato_il: new Date(s.dataCreazione.getTime() + 3600000),
        }
      });
    }

    if (s.statoAvanz !== 'RICEVUTA') {
      const evtAvId = `demo-evt-av-${s.id.slice(14)}`;
      await prisma.eventoStato.upsert({
        where: { id: evtAvId },
        update: {},
        create: {
          id: evtAvId,
          segnalazione_id: s.id,
          tipo_attore: 'SISTEMA',
          attore_id: null,
          ambito: 'AVANZAMENTO',
          da_stato: 'RICEVUTA',
          a_stato: s.statoAvanz,
          motivazione: `Aggiornamento stato comitato civico: ${s.statoAvanz}`,
          revisione: 1,
          creato_il: new Date(s.dataCreazione.getTime() + 86400000),
        }
      });
    }

    // Audit Evento
    const audId = `demo-aud-${s.id.slice(14)}`;
    await prisma.auditEvento.upsert({
      where: { id: audId },
      update: {},
      create: {
        id: audId,
        segnalazione_id: s.id,
        tipo_attore: 'UTENTE',
        attore_id: autoreId,
        azione: 'CREAZIONE_SEGNALAZIONE_DIMOSTRATIVA',
        dati_json: JSON.stringify({ note: 'Record dimostrativo conforme con media e storage validi' }),
        creato_il: s.dataCreazione,
      }
    });

    // Sostegni relazionali validi
    for (let i = 0; i < s.voterCount; i++) {
      const voterId = UTENTI_SINTETICI[i % UTENTI_SINTETICI.length].id;
      await prisma.sostegno.upsert({
        where: {
          utente_id_segnalazione_id: {
            utente_id: voterId,
            segnalazione_id: s.id,
          }
        },
        update: {},
        create: {
          utente_id: voterId,
          segnalazione_id: s.id,
          creato_il: new Date(s.dataCreazione.getTime() + (i + 1) * 7200000),
        }
      });
    }
  }

  const finalSegCount = await prisma.segnalazione.count();
  const finalSostegniCount = await prisma.sostegno.count();
  console.log(`[SUCCESSO]: Ambiente dimostrativo popolato con successo.`);
  console.log(`Segnalazioni totali nel DB: ${finalSegCount}`);
  console.log(`Sostegni relazionali totali nel DB: ${finalSostegniCount}`);
}

main()
  .catch((err) => {
    console.error('[ERRORE POPOLAMENTO]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
