import { verifyEmailAction } from '@/actions/auth';
import { redirect } from 'next/navigation';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { token: string }
}) {
  const token = searchParams.token;
  
  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-xl font-bold text-red-600">Token Mancante</h1>
        <p>Il link di verifica non è valido.</p>
      </div>
    );
  }

  const res = await verifyEmailAction(token);

  if (res.success) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">Account Verificato!</h1>
        <p className="mb-4">Ora puoi effettuare il login.</p>
        <a href="/login" className="text-blue-600 hover:underline">Vai al Login</a>
      </div>
    );
  } else {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-xl font-bold text-red-600 mb-4">Errore di Verifica</h1>
        <p>{res.error}</p>
      </div>
    );
  }
}
