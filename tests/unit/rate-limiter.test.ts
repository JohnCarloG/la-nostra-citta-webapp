import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRateLimiter } from '../../src/lib/rate-limiter';

describe('MemoryRateLimiter (Sliding Window)', () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    // 3 richieste ogni 1000ms
    limiter = new MemoryRateLimiter(3, 1000);
  });

  it('Consente richieste entro la soglia consentita', () => {
    const r1 = limiter.check('client-1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('client-1');
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('client-1');
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('Blocca richieste che superano la soglia con retryAfterSeconds calcolato', () => {
    limiter.check('client-1');
    limiter.check('client-1');
    limiter.check('client-1');

    const blocked = limiter.check('client-1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('Traccia chiavi distinte in modo indipendente', () => {
    limiter.check('client-1');
    limiter.check('client-1');
    limiter.check('client-1');

    // client-2 non deve essere influenzato da client-1
    const rClient2 = limiter.check('client-2');
    expect(rClient2.allowed).toBe(true);
    expect(rClient2.remaining).toBe(2);
  });

  it('Ripristina la disponibilità dopo la scadenza della finestra temporale', () => {
    vi.useFakeTimers();
    try {
      limiter.check('client-1');
      limiter.check('client-1');
      limiter.check('client-1');

      const blocked = limiter.check('client-1');
      expect(blocked.allowed).toBe(false);

      // Avanziamo il tempo oltre la finestra (1100ms)
      vi.advanceTimersByTime(1100);

      const rAfter = limiter.check('client-1');
      expect(rAfter.allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Supporta il reset manuale di una chiave specifica', () => {
    limiter.check('client-1');
    limiter.check('client-1');
    limiter.check('client-1');

    limiter.reset('client-1');
    const r = limiter.check('client-1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });
});
