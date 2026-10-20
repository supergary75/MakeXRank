// Root-owned operational helper. Uses built-in Node + native psql only.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

if(process.getuid?.()!==0)throw Error('Run the installed root-owned helper as root');
const apply=process.argv[2]==='--apply';
if(process.argv[2]&&!apply)throw Error('Use no argument for read-only inspection or --apply after a verified private backup');
const pid=execFileSync('systemctl',['show','makexrank-api','-p','MainPID','--value'],{encoding:'utf8'}).trim();
if(!/^[1-9][0-9]*$/.test(pid))throw Error('MakeXRank API must be running');
const config=Object.fromEntries((await fs.readFile(`/proc/${pid}/environ`,'utf8')).split('\0').filter(Boolean).map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)];}));
const database=new URL(config.DATABASE_URL);
const env={...process.env,PGHOST:database.hostname,PGPORT:database.port||'5432',PGDATABASE:decodeURIComponent(database.pathname.slice(1)),PGUSER:decodeURIComponent(database.username),PGPASSWORD:decodeURIComponent(database.password)};
const query=sql=>execFileSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const summary=()=>JSON.parse(query(`select coalesce(json_agg(json_build_object('id',auth_user_id,'username',username,'displayName',display_name,'role',role,'active',is_active,'mustChangePassword',must_change_password) order by username),'[]'::json)::text from user_profiles where username in ('supergary','gary75','vincentc','brooky','jasonz','lisaw','kclub-vincent','kclub-brook','kclub-jason','kclub-lisa','kclub-amber')`));
if(!apply){console.log(JSON.stringify({mode:'READ_ONLY',accounts:summary()},null,2));process.exit(0);}
const backupHelper='/usr/local/lib/makexrank/backup.mjs';
const backupInfo=await fs.lstat(backupHelper);
if(!backupInfo.isFile()||backupInfo.isSymbolicLink()||backupInfo.uid!==0||(backupInfo.mode&0o022))throw Error('A trusted root-owned backup helper is required');
execFileSync(process.execPath,[backupHelper,'release'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const backup=(await fs.readFile('/home/ubuntu/makexrank-backups/latest-release','utf8')).trim();
if(!/^\/home\/ubuntu\/makexrank-backups\/release\/[A-Za-z0-9_-]+$/.test(backup))throw Error('Unexpected private backup path');
execFileSync(process.execPath,[backupHelper,'restore-check',backup],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const ownerState=()=>query("select coalesce(json_agg(row_to_json(p) order by username),'[]'::json)::text from user_profiles p where username in ('supergary','gary75')");
const ownerBefore=ownerState();

// Keep a private recoverable credential file before the transaction. It remains
// marked unconfirmed if interrupted; never print passwords into terminal logs.
const directory='/var/lib/makexrank-private';
await fs.mkdir(directory,{recursive:true,mode:0o700});
const info=await fs.lstat(directory);
if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o077))throw Error('Private credential directory must be root-owned with mode 700');
const username='kclub-amber',initialPassword=crypto.randomBytes(24).toString('base64url');
const salt=crypto.randomBytes(16).toString('hex');
const passwordHash=`${salt}:${crypto.scryptSync(initialPassword,salt,64).toString('hex')}`;
const filename=path.join(directory,`staff-onboarding-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
const report={status:'UNCONFIRMED_DO_NOT_DISTRIBUTE',username,initialPassword,notes:'Existing four staff accounts keep their previous password for first verification only. Amber receives this independent initial password only if creation is confirmed.'};
await fs.writeFile(filename,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
const sql=await fs.readFile(new URL('./onboard-staff.sql',import.meta.url),'utf8');
try {
  const result=execFileSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','--single-transaction'],{
    env:{...env,PGOPTIONS:`-c makexrank.amber_hash=${passwordHash}`},
    input:sql+`\nselect case when password_hash=current_setting('makexrank.amber_hash') then 'AMBER_INITIAL_ISSUED' else 'ALREADY_ONBOARDED_NO_PASSWORD_RESET' end from user_profiles where username='kclub-amber';\n`,
    encoding:'utf8',stdio:['pipe','pipe','pipe'],
  });
  if(result.includes('AMBER_INITIAL_ISSUED'))report.status='ISSUED_PRIVATE_HANDOFF_TO_AMBER';
  else {report.status='ALREADY_ONBOARDED_UNUSED_VALUE_DO_NOT_DISTRIBUTE';delete report.initialPassword;}
  await fs.writeFile(filename,JSON.stringify(report,null,2),{mode:0o600});
  if(ownerBefore!==ownerState())throw Error('Owner identity changed; manual review required');
  console.log(JSON.stringify({status:'ONBOARDING_CONFIRMED',accounts:summary(),privateCredentialFile:filename,ownerAccountsUnchanged:true,verifiedBackup:backup},null,2));
} catch {
  // No SQL query, environment value or password hash is echoed on failure.
  throw Error(`Onboarding failed or outcome is uncertain. Keep the private file ${filename}; inspect identities before retrying. No password was printed.`);
}
