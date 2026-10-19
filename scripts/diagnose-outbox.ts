import path from 'path';
import { prisma } from '../src/lib/db';

async function diagnose() {
  console.log('=== 1. PROCESSO E CONFIGURAZIONE RUNTIME ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('CWD:', process.cwd());
  console.log('APP_URL:', process.env.APP_URL || '(non definita)');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || '(non definita)');
  console.log('SMTP_HOST:', process.env.SMTP_HOST ? 'Presente' : '(non definita)');
  console.log('SMTP_PORT:', process.env.SMTP_PORT || '(non definita)');
  console.log('SMTP_SECURE:', process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE : '(non definita)');
  console.log('SMTP_USER:', process.env.SMTP_USER ? 'Presente (configurato)' : '(non definita)');
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'Presente (segreto protetto)' : '(non definita)');

  console.log('\n=== 2. JOBS OUTBOX EMAIL ATTUALI (defaultdb) ===');
  const jobs = await prisma.outbox.findMany({
    where: { tipo_evento: 'INVIO_EMAIL' },
    orderBy: { creata_il: 'desc' },
    take: 10
  });

  console.log(`Trovati ${jobs.length} jobs INVIO_EMAIL (mostrati gli ultimi 10):`);
  for (const j of jobs) {
    let toSanitized = 'unknown';
    let tipo = 'unknown';
    try {
      const p = JSON.parse(j.payload_json);
      tipo = p.tipo;
      const parts = (p.to || '').split('@');
      toSanitized = parts.length === 2 ? `${parts[0].slice(0, 3)}***@${parts[1]}` : p.to;
    } catch {}

    console.log(`- ID: ${j.id}`);
    console.log(`  Tipo: ${tipo} | Destinatario: ${toSanitized}`);
    console.log(`  Tentativi: ${j.tentativi}`);
    console.log(`  Elaborata il: ${j.elaborata_il ? j.elaborata_il.toISOString() : 'NULL (in attesa)'}`);
    console.log(`  Prossimo tentativo: ${j.prossimo_tentativo_il ? j.prossimo_tentativo_il.toISOString() : 'NULL'}`);
    console.log(`  Creata il: ${j.creata_il.toISOString()}`);
  }
}

diagnose()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
