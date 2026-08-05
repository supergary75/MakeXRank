import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.resolve(projectRoot, 'modules', 'ins_training_tool', 'src');
const publicDirectory = path.resolve(projectRoot, 'public');
const targetDirectory = path.resolve(publicDirectory, 'inspire');

if (!targetDirectory.startsWith(`${publicDirectory}${path.sep}`) || path.basename(targetDirectory) !== 'inspire') {
  throw new Error(`拒绝写入非预期目录：${targetDirectory}`);
}

await access(path.join(sourceDirectory, 'index.html'));
await mkdir(publicDirectory, { recursive: true });
await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

console.log(`Inspire 模块已同步到 ${path.relative(projectRoot, targetDirectory)}`);
