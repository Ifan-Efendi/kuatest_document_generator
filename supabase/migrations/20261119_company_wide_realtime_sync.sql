-- Keep every client in the same company synchronized, including company identity updates.
-- FULL replica identity lets filtered Realtime delete events match company_id.
alter table public.documents replica identity full;
alter table public.receipts replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication does not exist';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'company_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.company_settings';
  end if;
end
$$;