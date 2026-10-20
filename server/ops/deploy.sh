#!/usr/bin/env bash
set -euo pipefail
release=${1:?Pass the extracted release directory}
app=/opt/makexrank
web=/var/www/html/MakeXRank
site=/etc/nginx/sites-enabled/9597-parts
test "$(id -u)" = 0
[[ "$release" =~ ^/home/ubuntu/makexrank-release-[a-f0-9]{12}$ ]]
test "$(realpath "$app")" = /opt/makexrank
test "$(realpath "$web")" = /var/www/html/MakeXRank
test "$(realpath "$release")" = "$release"
node --input-type=module - "$release" <<'VERIFY'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const root=process.argv[2],m=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));
if(m.mode!=='tencent'||!m.commit.startsWith(path.basename(root).slice(-12)))throw Error('Release identity mismatch');
for(const [file,hash] of Object.entries(m.hashes)){
 if(!/^(dist|server|shared)\//.test(file)&&!['package.json','package-lock.json'].includes(file))throw Error('Unexpected file');
 const full=path.resolve(root,file);if(!full.startsWith(root+'/'))throw Error('Unsafe path');
 if(crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex')!==hash)throw Error('Release digest mismatch: '+file);
}
console.log('RELEASE_CONTENT_VERIFIED',m.commit);
VERIFY
install -d -o root -g root -m 0755 /usr/local/lib/makexrank
install -o root -g root -m 0755 "$release/server/ops/backup.mjs" /usr/local/lib/makexrank/backup.mjs
install -o root -g root -m 0755 "$release/server/ops/onboard-staff.mjs" /usr/local/lib/makexrank/onboard-staff.mjs
install -o root -g root -m 0600 "$release/server/ops/onboard-staff.sql" /usr/local/lib/makexrank/onboard-staff.sql
node /usr/local/lib/makexrank/backup.mjs release
backup=$(cat /home/ubuntu/makexrank-backups/latest-release)
[[ "$backup" == /home/ubuntu/makexrank-backups/release/* ]]
node /usr/local/lib/makexrank/backup.mjs restore-check "$backup"
cp -L "$site" "$backup/nginx-site.conf"
chmod 600 "$backup/nginx-site.conf"
sudo -u ubuntu npm --prefix "$release" ci --omit=dev --ignore-scripts --no-audit --no-fund
for module in app api auth rest academic curriculum interviews; do node --check "$release/server/$module.mjs"; done
previous="$app/node_modules.pre-$(basename "$release")"
test ! -e "$previous"
changed=0
rollback(){
  status=$?;trap - ERR
  if ((changed)); then
    systemctl stop makexrank-api || true
    tar -xzf "$backup/api.tgz" -C /opt
    if test -d "$previous"; then mv "$app/node_modules" "$release/node_modules.failed";mv "$previous" "$app/node_modules";fi
    tar -xzf "$backup/frontend.tgz" -C /var/www/html
    cp "$backup/nginx-site.conf" "$site"
    nginx -t && systemctl reload nginx
    systemctl start makexrank-api
    printf '%s\n' 'RELEASE_FAILED_PREVIOUS_CODE_RESTORED_DATABASE_RETAINED'
  fi
  exit "$status"
}
trap rollback ERR
systemctl stop makexrank-api
changed=1
mv "$app/node_modules" "$previous"
mv "$release/node_modules" "$app/node_modules"
cp -a "$release/server/." "$app/server/"
cp -a "$release/shared/." "$app/shared/"
cp "$release/package.json" "$release/package-lock.json" "$release/release.json" "$app/"
node --input-type=module - "$site" "$release/server/nginx-makexrank.conf" <<'PROXY'
import fs from 'node:fs/promises';
const [site,snippet]=process.argv.slice(2),old=await fs.readFile(site,'utf8');
const pattern=/location\s+\^~\s+\/MakeXRank\/api\/\s*\{[^{}]*\}/g;
if([...old.matchAll(pattern)].length!==1)throw Error('Expected one known MakeXRank API location; no other site is changed');
await fs.writeFile(site,old.replace(pattern,await fs.readFile(snippet,'utf8')));
PROXY
nginx -t
systemctl start makexrank-api
ready=0
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then ready=1;break;fi
  sleep 1
done
test "$ready" = 1
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/academic/snapshot)" = 401
node /usr/local/lib/makexrank/backup.mjs verify-current "$backup"
cp -a "$release/dist/." "$web/"
cp "$release/release.json" "$web/release.json"
# Archives extracted under a private umask may have 700/600 directories/files.
# Only the already-public static web tree gets nginx read/traverse access;
# private database backups, environment files and API sources stay untouched.
chmod -R a+rX "$web"
systemctl reload nginx
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://81.70.62.5/MakeXRank/)" = 200
install -o root -g root -m 0644 "$release/server/ops/makexrank-backup.service" /etc/systemd/system/makexrank-backup.service
install -o root -g root -m 0644 "$release/server/ops/makexrank-backup.timer" /etc/systemd/system/makexrank-backup.timer
systemctl daemon-reload
systemctl enable --now makexrank-backup.timer
systemctl start makexrank-backup.service
cmp "$release/dist/index.html" "$web/index.html"
systemctl is-active --quiet makexrank-api
trap - ERR
printf '%s\n' 'TENCENT_RELEASE_VERIFIED_ACCOUNTS_AND_DATA_PRESERVED'
