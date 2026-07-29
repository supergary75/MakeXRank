drop policy if exists "team tag sync public read" on public.team_tag_sync;
create policy "team tag sync public read"
on public.team_tag_sync
for select
to anon, authenticated
using (true);
