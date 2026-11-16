import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** One Render service/disk for both processes until a shared private storage adapter exists. */
export function supervise(children, completed, graceMs = 10_000) {
  const active = new Set(children);
  let stopping = false;
  let exitCode = 0;
  let timer;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of active) child.kill('SIGTERM');
    timer = setTimeout(() => { for (const child of active) child.kill('SIGKILL'); }, graceMs);
  };
  for (const child of children) {
    child.once('error', () => stop(1));
    child.once('close', code => {
      active.delete(child);
      if (!stopping) stop(code || 1); // A worker exiting successfully is still unexpected here.
      if (!active.size) { clearTimeout(timer); completed(exitCode); }
    });
  }
  return stop;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.AI_ADAPTER_MODE !== 'cloud' || !process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL?.trim()) {
    console.error('Configurare AI_ADAPTER_MODE=cloud, GEMINI_MODEL (obbligatorio, nessun default) e GEMINI_API_KEY lato server prima dell’avvio.');
    process.exitCode = 1;
  } else {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const options = { cwd: root, stdio: 'inherit', env: process.env };
    const children = [
      spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '0.0.0.0'], options),
      spawn(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/moderation-worker.ts')], options)
    ];
    const stop = supervise(children, code => {
      process.off('SIGTERM', terminate);
      process.off('SIGINT', terminate);
      process.exitCode = code;
    });
    const terminate = () => stop(0);
    process.on('SIGTERM', terminate);
    process.on('SIGINT', terminate);
  }
}
