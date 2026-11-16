import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supervise } from '../../scripts/start-cloud.mjs';

function child() { return Object.assign(new EventEmitter(), { kill: vi.fn() }); }
afterEach(() => vi.useRealTimers());
describe('Avvio web e worker sullo stesso disco privato', () => {
  it('ferma l’altro processo se web o worker termina, e propaga il fallimento', () => {
    const web = child(), worker = child(), done = vi.fn();
    supervise([web, worker], done);
    worker.emit('close', 1);
    expect(web.kill).toHaveBeenCalledWith('SIGTERM');
    expect(done).not.toHaveBeenCalled();
    web.emit('close', 0);
    expect(done).toHaveBeenCalledWith(1);
  });
  it('terminazione richiesta: inoltra i segnali e attende entrambi i processi', () => {
    const web = child(), worker = child(), done = vi.fn();
    const stop = supervise([web, worker], done);
    stop(0);
    expect(web.kill).toHaveBeenCalledWith('SIGTERM');
    expect(worker.kill).toHaveBeenCalledWith('SIGTERM');
    web.emit('close', 0); worker.emit('close', 0);
    expect(done).toHaveBeenCalledWith(0);
  });
  it('arresta anche un processo bloccato dopo il periodo di grazia', () => {
    vi.useFakeTimers();
    const web = child(), worker = child(), done = vi.fn();
    const stop = supervise([web, worker], done, 100);
    stop(0);
    vi.advanceTimersByTime(100);
    expect(worker.kill).toHaveBeenLastCalledWith('SIGKILL');
    web.emit('close', null); worker.emit('close', null);
    expect(done).toHaveBeenCalledWith(0);
  });
});
