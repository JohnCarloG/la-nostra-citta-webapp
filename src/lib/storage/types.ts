export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string;
  sha256?: string;
  lastModified?: Date;
}

export interface StorageProvider {
  /**
   * Salva un buffer o stream su storage privato con chiave univoca
   */
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;

  /**
   * Legge un oggetto privato dallo storage
   */
  getObject(key: string): Promise<Buffer>;

  /**
   * Verifica l'esistenza di un oggetto privato
   */
  hasObject(key: string): Promise<boolean>;

  /**
   * Elimina un oggetto privato (per cleanup orfani / rollback)
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Recupera metadati dell'oggetto
   */
  getMetadata(key: string): Promise<StorageObjectMetadata>;
}
