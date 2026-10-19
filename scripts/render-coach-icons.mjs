// Mechanical rasterization of the code-native SVG, not a generated illustration.
// Pass an installed sharp package directory as argv[2], or install sharp locally.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const sharp=createRequire(import.meta.url)(process.argv[2] || 'sharp');
const source=await readFile(new URL('../public/pwa-coach.svg',import.meta.url));
for(const size of [180,192,512]) {
  await sharp(source).resize(size,size).png().toFile(fileURLToPath(new URL(`../public/pwa-coach-${size}.png`,import.meta.url)));
  console.log(`Rendered pwa-coach-${size}.png`);
}
