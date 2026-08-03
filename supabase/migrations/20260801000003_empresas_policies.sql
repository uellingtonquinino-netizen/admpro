-- Empresas: leitura para obras autorizadas; administração exclusivamente master.
grant select, insert, update, delete on public.empresas to authenticated;

create or replace function public.eh_master()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where auth_user_id = auth.uid() and ativo = 1 and perfil = 'master'
  );
$$;

revoke all on function public.eh_master() from public;
grant execute on function public.eh_master() to authenticated;

create policy "empresas_master_criar"
  on public.empresas for insert to authenticated
  with check (public.eh_master());

create policy "empresas_master_atualizar"
  on public.empresas for update to authenticated
  using (public.eh_master()) with check (public.eh_master());

create policy "empresas_master_excluir"
  on public.empresas for delete to authenticated
  using (public.eh_master());
