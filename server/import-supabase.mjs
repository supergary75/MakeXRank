import pg from 'pg';

const { Pool } = pg;
const oldUrl = (process.env.VITE_SUPABASE_URL || process.env.OLD_SUPABASE_URL || '').replace(/\/$/, '');
const oldKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.OLD_SUPABASE_ANON_KEY || '';
const username = (process.env.SUPABASE_USERNAME || '').trim().toLowerCase();
const password = process.env.SUPABASE_PASSWORD || '';
if (!oldUrl || !oldKey || !process.env.DATABASE_URL) {
  throw new Error('Old Supabase URL/key and DATABASE_URL are required');
}

let accessToken = oldKey;
if (username && password) {
  const response = await fetch(`${oldUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: oldKey, Authorization: `Bearer ${oldKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@makexrank.app`, password }),
  });
  if (!response.ok) throw new Error(`Supabase login failed: ${response.status} ${await response.text()}`);
  accessToken = (await response.json()).access_token;
  console.log('Old Supabase login: OK');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const definitions = {
  competitions: ['id','event_type','name','created_at','updated_at','last_update','source_text','teams_data'],
  practice_sync: ['id','events','deleted_event_ids','updated_at'],
  training_sync: ['id','events','schedules','updated_at'],
  team_tag_sync: ['id','tags','options','updated_at'],
  logistics_sync: ['id','events','deleted_event_ids','updated_at'],
  inspire_sync: ['id','payload','updated_at'],
};

const jsonColumns = new Set([
  'teams_data', 'events', 'deleted_event_ids', 'schedules', 'tags', 'options', 'payload',
]);

function normalizeJsonValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

for (const [table, allowed] of Object.entries(definitions)) {
  const response = await fetch(`${oldUrl}/rest/v1/${table}?select=*`, {
    headers: { apikey: oldKey, Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) { console.log(`${table}: not present, skipped`); continue; }
  if (!response.ok) { console.log(`${table}: unavailable (${response.status}), skipped`); continue; }
  const rows = await response.json();
  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => allowed.includes(key));
    if (!keys.length) continue;
    const values = keys.map((key) => jsonColumns.has(key) ? normalizeJsonValue(row[key]) : row[key]);
    const updates = keys.filter((key) => key !== 'id').map((key) => `${key}=excluded.${key}`);
    await pool.query(
      `insert into ${table} (${keys.join(',')}) values (${keys.map((_, index) => `$${index + 1}`).join(',')}) on conflict (id) do update set ${updates.join(',')}`,
      values,
    );
  }
  console.log(`${table}: ${rows.length} row(s) imported`);
}

await pool.end();
console.log('SUPABASE_DATA_IMPORT_READY');
