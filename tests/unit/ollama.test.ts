import { describe, it, expect, vi } from 'vitest';
import { ollamaAdapters } from '../../src/lib/ia/ollama';

const model = 'qwen3-vl:2b-instruct';
const input = { text: 'Buche sul marciapiede', allowed_categories: [{id:'v', codice:'V', nome:'Viabilità'}] };
const photo = { text: input.text, media_id:'private-id', media_type:'IMMAGINE' as const, private_image_or_frames:Buffer.from('synthetic') };
function fake(result: unknown, modelResp = model) {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json({model: modelResp,done:true,message:{content:JSON.stringify(result)}}));
}
describe('Ollama locale', () => {
  it('classifica senza allegati, chiavi o ID privati e deduplica', async () => {
    const http = fake({ids:['v','v']});
    expect((await ollamaAdapters(model,http).classification.classify(input)).suggestions).toEqual([{category_id:'v'}]);
    const [url, init] = http.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(init?.body)).messages[1].images).toBeUndefined();
  });
  it('rifiuta categorie estranee', async () => {
    await expect(ollamaAdapters(model,fake({ids:['x']})).classification.classify(input)).rejects.toThrow();
  });
  it('invia byte e non percorsi; conserva il verdetto incerto', async () => {
    const http = fake({verdict:'UNCERTAIN',reason:'Dettaglio non visibile'});
    expect((await ollamaAdapters(model,http).coherence.check(photo)).verdict).toBe('UNCERTAIN');
    expect(JSON.parse(String(http.mock.calls[0][1]?.body)).messages[1].images).toEqual([photo.private_image_or_frames.toString('base64')]);
    expect(String(http.mock.calls[0][1]?.body)).not.toContain(photo.media_id);
  });
  it('video e immagini mancanti non avviano richieste', async () => {
    const http = fake({});
    const a = ollamaAdapters(model,http).coherence;
    expect((await a.check({...photo,media_type:'VIDEO'})).verdict).toBe('UNSUPPORTED');
    await expect(a.check({...photo,private_image_or_frames:'private/path'})).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });
  it('non sostituisce il modello assente né accetta verdetti inventati',async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:404}));
    await expect(ollamaAdapters(model,http).classification.classify(input)).rejects.toThrow('404');
    expect(http).toHaveBeenCalledTimes(1);
    await expect(ollamaAdapters(model,fake({verdict:'FRODE',reason:'x'})).coherence.check(photo)).rejects.toThrow();
    expect(()=>ollamaAdapters('qwen-cloud')).toThrow();
  });
  it('gestisce risposte HTTP 400 includendo il messaggio error sanitizzato di Ollama', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'format schema invalid: json schema error' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(ollamaAdapters(model, http).coherence.check(photo)).rejects.toThrow(
      'Ollama HTTP 400: format schema invalid: json schema error'
    );
  });
  it('usa qwen3-vl:4b-instruct come predefinito e supporta selezione qwen3-vl:2b-instruct', async () => {
    const orig = process.env.OLLAMA_MODEL;
    try {
      delete process.env.OLLAMA_MODEL;
      const http1 = fake({ ids: ['v'] }, 'qwen3-vl:4b-instruct');
      await ollamaAdapters(undefined, http1).classification.classify(input);
      expect(JSON.parse(String(http1.mock.calls[0][1]?.body)).model).toBe('qwen3-vl:4b-instruct');

      process.env.OLLAMA_MODEL = 'qwen3-vl:2b-instruct';
      const http2 = fake({ ids: ['v'] }, 'qwen3-vl:2b-instruct');
      await ollamaAdapters(undefined, http2).classification.classify(input);
      expect(JSON.parse(String(http2.mock.calls[0][1]?.body)).model).toBe('qwen3-vl:2b-instruct');
    } finally {
      process.env.OLLAMA_MODEL = orig;
    }
  });
});
