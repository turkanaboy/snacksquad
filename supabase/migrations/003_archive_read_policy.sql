drop policy if exists "snacks readable" on public.snacks;

create policy "snacks readable" on public.snacks
  for select to anon, authenticated using (true);
