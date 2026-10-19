async function main() {
  const routes = [
    '/',
    '/segnalazioni',
    '/mappa',
    '/classifica',
    '/register',
    '/login',
  ];

  console.log('--- VERIFICA ROTTE HTTP ---');
  for (const r of routes) {
    try {
      const res = await fetch(`http://localhost:3000${r}`);
      console.log(`Rotta ${r.padEnd(16)} -> Status: ${res.status}`);
      if (res.status !== 200) {
        console.error(`Errore su ${r}: status ${res.status}`);
      }
    } catch (err) {
      console.error(`Impossibile contattare ${r}: ${(err as Error).message}`);
    }
  }

  // Verifica accesso media
  try {
    const resMedia = await fetch('http://localhost:3000/api/media/demo-med-0000-0000-0000-000000000001');
    console.log(`Rotta /api/media/demo-med-1 -> Status: ${resMedia.status}, Content-Type: ${resMedia.headers.get('content-type')}`);
  } catch (err) {
    console.error('Errore test media:', (err as Error).message);
  }
}

main();
