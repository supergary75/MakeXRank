# Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor and run [supabase/schema.sql](/D:/Codex/competitive-ranking-board/supabase/schema.sql).
3. Copy [.env.example](/D:/Codex/competitive-ranking-board/.env.example) to `.env` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - optional `VITE_SUPABASE_COMPETITIONS_TABLE`
4. Restart the Vite dev server or rebuild the app.

After the env vars are present, the app will:
- load competitions from Supabase on startup
- keep a browser local cache as a fallback
- save new or edited competitions to Supabase automatically

Current schema uses public read/write policies for quick shared access.
For production, replace them with authenticated policies.
