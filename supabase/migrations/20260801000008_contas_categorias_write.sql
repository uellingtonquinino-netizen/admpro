-- Escrita financeira é feita por RPCs atômicas, nunca diretamente pelo cliente.
create or replace function public.criar_conta(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare novo_id bigint;
begin
  if not public.pode_editar_financeiro((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  insert into public.contas (empresa_id, nome, tipo, saldo, banco, agencia, numero, ativo)
  values ((p->>'empresa_id')::bigint, p->>'nome', p->>'tipo', coalesce((p->>'saldo')::numeric, 0), nullif(p->>'banco',''), nullif(p->>'agencia',''), nullif(p->>'numero',''), coalesce((p->>'ativo')::bigint, 1))
  returning id into novo_id;
  return novo_id;
end; $$;

create or replace function public.atualizar_conta(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare empresa bigint;
begin
  select empresa_id into empresa from public.contas where id = (p->>'id')::bigint for update;
  if not found or not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão para esta conta'; end if;
  update public.contas set nome=p->>'nome', tipo=p->>'tipo', saldo=coalesce((p->>'saldo')::numeric, 0), banco=nullif(p->>'banco',''), agencia=nullif(p->>'agencia',''), numero=nullif(p->>'numero',''), ativo=coalesce((p->>'ativo')::bigint, 1)
  where id=(p->>'id')::bigint;
end; $$;

create or replace function public.excluir_conta(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare empresa bigint;
begin
  select empresa_id into empresa from public.contas where id=p_id for update;
  if not found or not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão para esta conta'; end if;
  update public.lancamentos set conta_id=null where conta_id=p_id;
  delete from public.contas where id=p_id;
end; $$;

create or replace function public.criar_categoria(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare novo_id bigint;
begin
  if not public.pode_editar_financeiro((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  insert into public.categorias (empresa_id, nome, tipo, cor) values ((p->>'empresa_id')::bigint, p->>'nome', p->>'tipo', p->>'cor') returning id into novo_id;
  return novo_id;
end; $$;

create or replace function public.atualizar_categoria(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare empresa bigint;
begin
  select empresa_id into empresa from public.categorias where id=(p->>'id')::bigint for update;
  if not found or not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão para esta categoria'; end if;
  update public.categorias set nome=p->>'nome', tipo=p->>'tipo', cor=p->>'cor' where id=(p->>'id')::bigint;
end; $$;

create or replace function public.excluir_categoria(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare empresa bigint;
begin
  select empresa_id into empresa from public.categorias where id=p_id for update;
  if not found or not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão para esta categoria'; end if;
  update public.lancamentos set categoria_id=null where categoria_id=p_id;
  delete from public.categorias where id=p_id;
end; $$;

revoke all on function public.criar_conta(jsonb), public.atualizar_conta(jsonb), public.excluir_conta(bigint), public.criar_categoria(jsonb), public.atualizar_categoria(jsonb), public.excluir_categoria(bigint) from public;
grant execute on function public.criar_conta(jsonb), public.atualizar_conta(jsonb), public.excluir_conta(bigint), public.criar_categoria(jsonb), public.atualizar_categoria(jsonb), public.excluir_categoria(bigint) to authenticated;
