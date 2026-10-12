import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider, StorageObjectMetadata } from './types';

/**
 * Storage locale privato su filesystem:
 * - Le chiavi sono isolate in una cartella storage privata non pubblica
 * - Nessun file è servito direttamente dal web server senza autorizzazione
 * - Calcola digest sha256 e verifica dimensioni reali
 */
export class LocalDiskStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.resolve(process.cwd(), '.private_storage');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveKeyPath(key: string): string {
    // Normalizza e sanifica per prevenire path traversal
    const safeKey = path.basename(key);
    return path.join(this.baseDir, safeKey);
  }

  async putObject(key: string, data: Buffer, contentType: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await fs.promises.writeFile(filePath, data);
    
    // Salva metadati correlati in file di controllo
    const metaPath = `${filePath}.meta.json`;
    const meta: StorageObjectMetadata = {
      contentLength: data.length,
      contentType,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      lastModified: new Date()
    };
    await fs.promises.writeFile(metaPath, JSON.stringify(meta), 'utf8');
  }

  async getObject(key: string): Promise<Buffer> {
    const filePath = this.resolveKeyPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Oggetto non trovato nello storage: ${key}`);
    }
    return await fs.promises.readFile(filePath);
  }

  async hasObject(key: string): Promise<boolean> {
    const filePath = this.resolveKeyPath(key);
    return fs.existsSync(filePath);
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    const metaPath = `${filePath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      await fs.promises.unlink(metaPath).catch(() => {});
    }
  }

  async getMetadata(key: string): Promise<StorageObjectMetadata> {
    const filePath = this.resolveKeyPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Oggetto non trovato nello storage: ${key}`);
    }

    const metaPath = `${filePath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const raw = await fs.promises.readFile(metaPath, 'utf8');
        return JSON.parse(raw);
      } catch {}
    }

    const stat = await fs.promises.stat(filePath);
    return {
      contentLength: stat.size,
      contentType: 'application/octet-stream',
      lastModified: stat.mtime
    };
  }

  getBaseDir(): string {
    return this.baseDir;
  }
}
