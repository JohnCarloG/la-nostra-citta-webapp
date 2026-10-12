import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LocalDiskStorageProvider } from '../../src/lib/storage/local-provider';

describe('LocalDiskStorageProvider (Storage Privato Isolato)', () => {
  const testDir = path.resolve(process.cwd(), '.test_tmp_storage');
  let provider: LocalDiskStorageProvider;

  beforeEach(() => {
    provider = new LocalDiskStorageProvider(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('Salva e legge un file privato calcolando metadati e sha256', async () => {
    const data = Buffer.from('Contenuto di test privato');
    const key = 'test_key_1.bin';

    await provider.putObject(key, data, 'application/octet-stream');
    expect(await provider.hasObject(key)).toBe(true);

    const retrieved = await provider.getObject(key);
    expect(retrieved.equals(data)).toBe(true);

    const meta = await provider.getMetadata(key);
    expect(meta.contentLength).toBe(data.length);
    expect(meta.contentType).toBe('application/octet-stream');
    expect(meta.sha256).toBeDefined();
  });

  it('Elimina un file e i relativi metadati (deleteObject per rollback o cleanup)', async () => {
    const data = Buffer.from('File da eliminare');
    const key = 'test_to_delete.bin';

    await provider.putObject(key, data, 'application/octet-stream');
    expect(await provider.hasObject(key)).toBe(true);

    await provider.deleteObject(key);
    expect(await provider.hasObject(key)).toBe(false);
  });

  it('Lancia eccezione per oggetti inesistenti', async () => {
    await expect(provider.getObject('inesistente.bin')).rejects.toThrow('non trovato nello storage');
  });
});
