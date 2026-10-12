import { StorageProvider } from './types';
import { LocalDiskStorageProvider } from './local-provider';

/**
 * Factory dello StorageProvider dell'applicazione:
 * - 'local': implementato tramite LocalDiskStorageProvider (.private_storage)
 * - 's3': predisposto solo come interfaccia architetturale. Nessun adapter presente.
 *   Le sole variabili d'ambiente NON sono sufficienti per attivarlo e non è consentito
 *   alcun fallback locale silenzioso (VI10).
 */
function createStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase().trim();

  if (provider === 'local') {
    return new LocalDiskStorageProvider();
  }

  if (provider === 's3') {
    throw new Error(
      "Storage provider 's3' non implementato. L'architettura definisce l'interfaccia StorageProvider ma l'adapter AWS S3 non è ancora sviluppato. Le sole variabili d'ambiente non sono sufficienti ad attivarlo e non è consentito alcun fallback locale silenzioso."
    );
  }

  throw new Error(
    `Storage provider '${provider}' non riconosciuto o non implementato. Solo 'local' (LocalDiskStorageProvider) è supportato.`
  );
}

let currentStorageProvider: StorageProvider = createStorageProvider();

export function getStorageProvider(): StorageProvider {
  return currentStorageProvider;
}

export function setStorageProviderForTest(provider: StorageProvider): void {
  currentStorageProvider = provider;
}

