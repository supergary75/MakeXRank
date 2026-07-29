drop policy if exists "team tag sync public insert" on public.team_tag_sync;
create policy "team tag sync public insert"
on public.team_tag_sync
for insert
to anon, authenticated
with check (true);

drop policy if exists "team tag sync public update" on public.team_tag_sync;
create policy "team tag sync public update"
on public.team_tag_sync
for update
to anon, authenticated
using (true)
with check (true);
