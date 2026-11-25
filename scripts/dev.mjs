import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viteEntry = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

const backendTarget =
  process.env.FASTAPI_PROXY_TARGET || 'http://127.0.0.1:8000';

console.log('[EnergyX 2.0] Starting frontend on http://localhost:3000');
console.log(`[EnergyX 2.0] API requests will be proxied to ${backendTarget}`);
console.log('[EnergyX 2.0] Start the FastAPI backend separately (see WINDOWS_LOCAL_RUN.md).');

const viteProc = spawn(
  process.execPath,
  [viteEntry, '--port=3000', '--host=0.0.0.0'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      FASTAPI_PROXY_TARGET: backendTarget,
    },
  }
);

viteProc.on('error', (err) => {
  console.error('[EnergyX 2.0] Failed to start Vite:', err.message);
  process.exitCode = 1;
});

viteProc.on('exit', (code) => {
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!viteProc.killed) viteProc.kill(signal);
  });
}
