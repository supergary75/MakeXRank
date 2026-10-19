#!/usr/bin/env node
// Install a ROOT-OWNED copy in /usr/local/lib/makexrank; only Node built-ins are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='/home/ubuntu/makexrank-backups',mode=process.argv[2]||'daily';
if(process.getuid?.()!==0)throw new Error('Run as root');
const run=(command,args,extra={})=>execFileSync(command,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...extra});
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
let env;
try{
  const pid=run('systemctl',['show','makexrank-api','-p','MainPID','--value']).trim();
  if(!/^\d+$/.test(pid)||pid==='0')throw new Error('API must be running for verified destination selection');
  env=Object.fromEntries((await fs.readFile(`/proc/${pid}/environ`,'utf8')).split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  const url=new URL(env.DATABASE_URL);
  const pgEnv={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
  if(url.searchParams.has('sslmode'))pgEnv.PGSSLMODE=url.searchParams.get('sslmode');
  const query=sql=>JSON.parse(run('psql',['-X','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env:pgEnv}).trim());
  const countsSQL=`select json_build_object('accounts',(select count(*) from user_profiles),'competitions',(select count(*) from competitions),'classes',(select count(*) from academic_rosters),'students',(select coalesce(sum(jsonb_array_length(members)),0) from academic_rosters),'attendance',(select count(*) from academic_attendance))`;
  const profilesSQL=`select coalesce(json_agg(json_build_object('id',auth_user_id,'username',username,'hash',password_hash,'role',role,'active',is_active,'events',allowed_event_types,'competitions',allowed_competition_ids) order by auth_user_id),'[]'::json) from user_profiles`;
  if(mode==='verify-current'){
    const dir=path.resolve(process.argv[3]||'');if(!dir.startsWith(root+'/'))throw new Error('Unsafe verification path');
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'backup.json'),'utf8'));
    if(manifest.accountsFingerprint!==sha(JSON.stringify(query(profilesSQL)))||manifest.issuerFingerprint!==sha(env.JWT_SECRET))throw new Error('Account or issuer configuration changed');
    console.log('ACCOUNT_CONFIGURATION_UNCHANGED',JSON.stringify(query(countsSQL)));
  }else if(mode==='restore-check'){
    const dir=path.resolve(process.argv[3]||'');
    if(!dir.startsWith(root+'/')||!(await fs.stat(path.join(dir,'database.dump'))).isFile())throw new Error('Use an existing private MakeXRank backup');
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'backup.json'),'utf8'));
    const data=await fs.readFile(path.join(dir,'database.dump'));
    if(sha(data)!==manifest.sha256)throw new Error('Dump digest mismatch');
    const dbName=`makexrank_restore_${Date.now()}`;
    if(!/^makexrank_restore_\d+$/.test(dbName)||dbName===pgEnv.PGDATABASE)throw new Error('Unsafe restore database');
    run('runuser',['-u','postgres','--','createdb','--template=template0',dbName]);
    let passed=false;
    try{
      run('runuser',['-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-c',`revoke connect on database ${dbName} from public`]);
      run('runuser',['-u','postgres','--','pg_restore','--no-owner','--no-acl','--exit-on-error','--dbname',dbName],{input:data,maxBuffer:16*1024*1024});
      const restored=JSON.parse(run('runuser',['-u','postgres','--','psql','-X','-t','-A','--dbname',dbName,'-c',countsSQL]).trim());
      if(JSON.stringify(restored)!==JSON.stringify(manifest.counts))throw new Error('Restored counts do not match backup');
      await fs.writeFile(path.join(dir,'restore-check.json'),JSON.stringify({verifiedAt:new Date().toISOString(),counts:restored}),{mode:0o600,flag:'wx'});
      passed=true;console.log('RESTORE_VERIFIED',JSON.stringify(restored));
    }finally{
      // Only the scratch DB created above is removed; its verified source dump is retained.
      if(passed)run('runuser',['-u','postgres','--','dropdb',dbName]);
    }
  }else{
    if(!['daily','release'].includes(mode))throw new Error('Unknown backup mode');
    const dir=path.join(root,mode,stamp);await fs.mkdir(dir,{recursive:true,mode:0o700});
    await fs.chmod(root,0o700);await fs.chmod(path.dirname(dir),0o700);
    const counts=query(countsSQL),dump=path.join(dir,'database.dump');
    run('pg_dump',['--format=custom','--no-owner','--no-acl','--file',dump],{env:pgEnv});await fs.chmod(dump,0o600);
    if(!run('pg_restore',['--list',dump]).includes('TABLE DATA'))throw new Error('Invalid backup');
    const profiles=query(profilesSQL);
    const manifest={createdAt:new Date().toISOString(),mode,counts,sha256:sha(await fs.readFile(dump)),accountsFingerprint:sha(JSON.stringify(profiles)),issuerFingerprint:sha(env.JWT_SECRET)};
    if(mode==='release'){
      run('tar',['--exclude=node_modules','--exclude=node_modules.*','--exclude=.git','-czf',path.join(dir,'api.tgz'),'-C','/opt','makexrank']);
      run('tar',['-czf',path.join(dir,'frontend.tgz'),'-C','/var/www/html','MakeXRank']);
      run('tar',['--dereference','-czf',path.join(dir,'configuration.tgz'),'-C','/','etc/makexrank.env','etc/nginx/sites-enabled','etc/systemd/system/makexrank-api.service']);
      for(const name of ['api.tgz','frontend.tgz','configuration.tgz'])await fs.chmod(path.join(dir,name),0o600);
    }
    await fs.writeFile(path.join(dir,'backup.json'),JSON.stringify(manifest),{mode:0o600,flag:'wx'});
    await fs.writeFile(path.join(root,'latest-'+mode),dir,{mode:0o600});
    console.log('BACKUP_VERIFIED',dir,JSON.stringify(counts));
  }
}catch(error){console.error('BACKUP_FAILED',error.code||error.name);process.exitCode=1;}
