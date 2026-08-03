-- Executar após a migração de esquema gerada pelo script.
alter table public.usuarios
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

create or replace function public.current_usuario_id()
returns bigint
language sql stable security definer set search_path = public
as $$ select id from public.usuarios where auth_user_id = auth.uid() limit 1; $$;

create or replace function public.pode_acessar_empresa(p_empresa_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.ativo = 1 and (
      u.perfil in ('master', 'central') or u.empresa_id = p_empresa_id
      or exists (select 1 from public.usuario_obras uo where uo.usuario_id = u.id and uo.empresa_id = p_empresa_id)
      or exists (select 1 from public.supervisor_obras so where so.usuario_id = u.id and so.empresa_id = p_empresa_id)
    )
  );
$$;

revoke all on function public.current_usuario_id() from public;
revoke all on function public.pode_acessar_empresa(bigint) from public;
grant execute on function public.current_usuario_id() to authenticated;
grant execute on function public.pode_acessar_empresa(bigint) to authenticated;

-- Sem políticas permissivas: tabelas ficam inacessíveis até que cada módulo
-- tenha políticas RLS específicas, impedindo exposição acidental entre obras.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'migrations' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
