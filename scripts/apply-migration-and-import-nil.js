const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && datasourceUrl.includes('sslcert=ca.pem')) {
  const absCa = path.resolve(process.cwd(), 'ca.pem');
  datasourceUrl = datasourceUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
}

const prisma = new PrismaClient({
  datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined
});

async function main() {
  console.log('1. Applicazione colonne migration se assenti...');
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`Quartiere\` ADD COLUMN \`codice\` VARCHAR(50) NULL;`);
    console.log('Colonna `codice` aggiunta.');
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log('Colonna `codice` già presente.');
    } else {
      console.error('Info codice:', err.message);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`Quartiere\` ADD COLUMN \`is_ufficiale\` BOOLEAN NOT NULL DEFAULT TRUE;`);
    console.log('Colonna `is_ufficiale` aggiunta.');
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log('Colonna `is_ufficiale` già presente.');
    } else {
      console.error('Info is_ufficiale:', err.message);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX \`Quartiere_codice_key\` ON \`Quartiere\`(\`codice\`);`);
    console.log('Indice univoco `Quartiere_codice_key` creato.');
  } catch (err) {
    if (err.message.includes('Duplicate key name') || err.message.includes('already exists')) {
      console.log('Indice `Quartiere_codice_key` già presente.');
    } else {
      console.error('Info indice:', err.message);
    }
  }

  console.log('\n2. Marcatura dei quartieri preesistenti come non ufficiali (legacy)...');
  const legacyUpdated = await prisma.$executeRawUnsafe(
    `UPDATE \`Quartiere\` SET \`is_ufficiale\` = FALSE WHERE \`codice\` IS NULL;`
  );
  console.log(`Record legacy aggiornati: ${legacyUpdated}`);

  console.log('\n3. Lettura dataset ufficiale NIL vigenti PGT 2030...');
  const csvPath = path.resolve('docs/nil_milano_pgt2030.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const dataLines = lines.slice(1);
  console.log(`Righe trovate nel CSV: ${dataLines.length}`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const line of dataLines) {
    const parts = line.split(';');
    const idNum = parseInt(parts[0].trim(), 10);
    const codice = `NIL-${String(idNum).padStart(2, '0')}`;
    const nome = parts[1].trim();

    // Verifichiamo se esiste già per codice o nome
    const existing = await prisma.quartiere.findFirst({
      where: {
        OR: [
          { codice },
          { nome }
        ]
      }
    });

    if (existing) {
      await prisma.quartiere.update({
        where: { id: existing.id },
        data: {
          codice,
          nome,
          is_ufficiale: true
        }
      });
      updatedCount++;
    } else {
      await prisma.quartiere.create({
        data: {
          id: crypto.randomUUID(),
          codice,
          nome,
          is_ufficiale: true
        }
      });
      insertedCount++;
    }
  }

  console.log(`Importazione completata: ${insertedCount} nuovi inseriti, ${updatedCount} aggiornati.`);

  const total = await prisma.quartiere.count();
  const ufficiali = await prisma.quartiere.count({ where: { is_ufficiale: true } });
  const legacy = await prisma.quartiere.count({ where: { is_ufficiale: false } });
  console.log(`Riepilogo tabella Quartiere: ${total} totali (${ufficiali} ufficiali NIL, ${legacy} legacy conservati).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
