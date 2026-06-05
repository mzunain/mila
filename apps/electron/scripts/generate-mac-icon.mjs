import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
const sourceSvg = join(assetsDir, 'icon.svg');
const png = join(assetsDir, 'icon.png');
const icns = join(assetsDir, 'icon.icns');
const iconset = join(assetsDir, 'icon.iconset');

if (process.platform !== 'darwin') {
  process.exit(0);
}

if (!existsSync(sourceSvg)) {
  throw new Error(`Missing icon source: ${sourceSvg}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

run('sips', ['-s', 'format', 'png', '-Z', '1024', sourceSvg, '--out', png]);

rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [filename, size] of sizes) {
  run('sips', ['-z', String(size), String(size), png, '--out', join(iconset, filename)]);
}

run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
rmSync(iconset, { recursive: true, force: true });
