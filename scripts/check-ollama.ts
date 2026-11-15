// Smoke test senza DB: quadrato rosso PNG sintetico, generato localmente.
import { ollamaAdapters } from '../src/lib/ia/ollama';
async function main() {
  const a = ollamaAdapters();
  const out = await a.classification.classify({ text: 'Lampione spento lungo il marciapiede.', allowed_categories:[
    {id:'luce',codice:'LUCE',nome:'Illuminazione pubblica'}, {id:'verde',codice:'VERDE',nome:'Parchi e giardini'}
  ]}, { timeoutMs: 180000 });
  console.log('RF08 risposta:', out);
  const vision = await a.coherence.check({text:'Un quadrato rosso uniforme.',media_type:'IMMAGINE',media_id:'sintetico',
    private_image_or_frames:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC','base64')}, { timeoutMs: 600000 });
  console.log('RF10 risposta:', vision);
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Errore Ollama'); process.exitCode=1; });
