/**
 * Rate Limiter in-memory a finestra mobile scorrevole per proteggere
 * gli endpoint sensibili (login, registrazione, richiesta reset password).
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class MemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Verifica se la chiave indicata ha superato il limite.
   * Se non ha superato il limite, registra la richiesta e restituisce true.
   * Se ha superato il limite, restituisce false.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

    // Rimuovi timestamp scaduti
    record.timestamps = record.timestamps.filter(t => t > cutoff);

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + this.windowMs - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, retryAfterSeconds)
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - record.timestamps.length
    };
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  clearAll(): void {
    this.store.clear();
  }
}

// Istanze condivise preconfigurate per ambito
export const authRateLimiter = new MemoryRateLimiter(5, 60 * 1000); // 5 tentativi al minuto per IP/chiave
export const resetPasswordRateLimiter = new MemoryRateLimiter(3, 5 * 60 * 1000); // 3 tentativi in 5 minuti
