import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Invalid commit');
const files=[];
async function collect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const name=path.posix.join(dir,item.name);if(item.isDirectory())await collect(name);else files.push(name);}}
await collect('dist');await collect('server');await collect('shared');files.push('package.json','package-lock.json');
const hashes={};for(const file of files.sort())hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const dir=path.join('release',commit);await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'release.json'),JSON.stringify({commit,mode:'tencent',createdAt:new Date().toISOString(),hashes},null,2));
const archive=path.join('release',`makexrank-${commit.slice(0,12)}.tar.gz`);
execFileSync('tar',['-czf',archive,'dist','server','shared','package.json','package-lock.json','-C',dir,'release.json']);
console.log(archive,crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex'));
