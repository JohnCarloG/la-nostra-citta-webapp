import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Genera un token random sicuro e restituisce sia la versione in chiaro
 * (da inviare per email o salvare nel cookie) sia l'hash (da salvare a DB).
 */
export function generateSecureToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Hasha una password con bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Verifica una password
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Calcola l'hash SHA-256 di un token in chiaro per cercare nel DB
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
