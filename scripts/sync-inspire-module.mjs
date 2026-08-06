import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.resolve(projectRoot, 'modules', 'ins_training_tool', 'src');
const publicDirectory = path.resolve(projectRoot, 'public');
const targetDirectory = path.resolve(publicDirectory, 'inspire');

if (!targetDirectory.startsWith(`${publicDirectory}${path.sep}`) || path.basename(targetDirectory) !== 'inspire') {
  throw new Error(`Refusing to write to unexpected directory: ${targetDirectory}`);
}

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

await access(path.join(sourceDirectory, 'index.html'));
await mkdir(publicDirectory, { recursive: true });
await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

let productionEnv = {};
try {
  productionEnv = parseEnv(await readFile(path.resolve(projectRoot, '.env.production'), 'utf8'));
} catch {
  // Build-provided environment variables remain sufficient.
}

const runtimeConfig = {
  url: process.env.VITE_SUPABASE_URL || productionEnv.VITE_SUPABASE_URL || '',
  anonKey: process.env.VITE_SUPABASE_ANON_KEY || productionEnv.VITE_SUPABASE_ANON_KEY || '',
  table: process.env.VITE_SUPABASE_INSPIRE_SYNC_TABLE || productionEnv.VITE_SUPABASE_INSPIRE_SYNC_TABLE || 'practice_sync',
  dataColumn: process.env.VITE_SUPABASE_INSPIRE_SYNC_COLUMN || productionEnv.VITE_SUPABASE_INSPIRE_SYNC_COLUMN || 'events',
};

await writeFile(
  path.join(targetDirectory, 'js', 'makexrank-config.js'),
  `window.MAKEXRANK_INSPIRE_CONFIG = ${JSON.stringify(runtimeConfig)};\n`,
  'utf8',
);

console.log(`Inspire module synced to ${path.relative(projectRoot, targetDirectory)}`);
