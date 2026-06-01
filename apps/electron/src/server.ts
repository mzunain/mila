import { utilityProcess, type UtilityProcess } from 'electron';
import { createServer } from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { WEB_BUNDLE_DIR, ENTRY_PATH } from './config';

let serverProcess: UtilityProcess | null = null;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      if (typeof address === 'object' && address) {
        const { port } = address;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not obtain free port'));
      }
    });
  });
}

function waitForUrl(url: string, timeoutMs = 30_000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok || res.status === 404) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) {
        return reject(new Error(`Timed out waiting for ${url}`));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export async function startEmbeddedServer(env: Record<string, string>): Promise<string> {
  const serverEntry = path.join(WEB_BUNDLE_DIR, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Embedded Next.js bundle not found at ${serverEntry}. Did you run \"pnpm prebundle\"?`,
    );
  }

  const port = await findFreePort();
  const hostname = '127.0.0.1';

  serverProcess = utilityProcess.fork(serverEntry, [], {
    cwd: WEB_BUNDLE_DIR,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      HOSTNAME: hostname,
    },
    serviceName: 'Mila Embedded Web Server',
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[next!] ${chunk}`);
  });
  serverProcess.on('exit', (code) => {
    console.error(`[next] embedded server exited code=${code}`);
    serverProcess = null;
  });

  const origin = `http://${hostname}:${port}`;
  await waitForUrl(origin);
  return `${origin}${ENTRY_PATH}`;
}

export function stopEmbeddedServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}
