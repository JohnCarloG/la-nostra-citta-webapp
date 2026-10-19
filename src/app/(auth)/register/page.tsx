import { prisma } from '@/lib/db';
import RegisterForm from './register-form';

export const metadata = {
  title: 'Registrazione Cittadino - La Nostra Città',
  description: 'Crea il tuo profilo civico per partecipare alle segnalazioni, votare le priorità e seguire le decisioni sul territorio.',
};

export default async function RegisterPage() {
  const quartieri = await prisma.quartiere.findMany({
    where: { is_ufficiale: true },
    select: { id: true, nome: true, codice: true, is_ufficiale: true },
    orderBy: { nome: 'asc' },
  });

  return <RegisterForm quartieri={quartieri} />;
}