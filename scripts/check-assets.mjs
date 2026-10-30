import { readFileSync, existsSync, statSync } from 'node:fs';
import { appConfig } from '../app.config.js';
try {
  const manifest = JSON.parse(readFileSync('public/vm/assets.json', 'utf8'));
  for (const [name, meta] of Object.entries(manifest.assets))
    if (!existsSync('public/vm/' + name) || statSync('public/vm/' + name).size !== meta.bytes)
      throw new Error();
  for (const ext of ['mjs', 'wasm'])
    if (!existsSync(`public/ai/${appConfig.inferenceRuntime}/ort-wasm-simd-threaded.${ext}`))
      throw new Error();
  const sources = JSON.parse(readFileSync('public/sources/manifest.json', 'utf8'));
  for (const [name, meta] of Object.entries(sources.files))
    if (
      !existsSync('public/sources/' + name) ||
      statSync('public/sources/' + name).size !== meta.bytes
    )
      throw new Error();
  console.log('Boot assets, versioned inference runtime and corresponding sources are present.');
} catch {
  console.error(
    'Build assets are incomplete. Run npm run assets, then python3 scripts/build-alpine/sources.py.',
  );
  process.exit(1);
}
