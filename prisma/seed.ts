import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Database (Idempotente)...');

  const hashedPassword = await bcrypt.hash('PasswordSicura123!', 10);

  // Upsert Quartiere
  const qCentro = await prisma.quartiere.upsert({
    where: { nome: 'Centro Storico' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      nome: 'Centro Storico'
    }
  });

  // Upsert Categoria
  const cDecoro = await prisma.categoria.upsert({
    where: { codice: 'DECORO_URBANO' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      codice: 'DECORO_URBANO',
      nome: 'Decoro Urbano',
      attiva: true
    }
  });

  // Cittadino Verificato
  const cittadino1 = await prisma.utente.upsert({
    where: { email_normalizzata: 'mario.rossi@example.com' },
    update: { password_hash: hashedPassword },
    create: {
      id: '10000000-0000-0000-0000-000000000001',
      nome: 'Mario',
      cognome: 'Rossi',
      email_normalizzata: 'mario.rossi@example.com',
      password_hash: hashedPassword,
      ruolo: 'CITTADINO',
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
      quartiere_id: qCentro.id
    }
  });

  // Cittadino Sospeso
  await prisma.utente.upsert({
    where: { email_normalizzata: 'sospeso@example.com' },
    update: { password_hash: hashedPassword },
    create: {
      id: '10000000-0000-0000-0000-000000000002',
      nome: 'Luigi',
      cognome: 'Verdi',
      email_normalizzata: 'sospeso@example.com',
      password_hash: hashedPassword,
      ruolo: 'CITTADINO',
      stato_account: 'SOSPESO',
      verificato_il: new Date(),
      sospeso_il: new Date()
    }
  });

  console.log('Seed Completato. Account: mario.rossi@example.com / PasswordSicura123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
