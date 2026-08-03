-- Financeiro: leitura por obra e gravação atômica via funções PostgreSQL.
grant select on public.lancamentos, public.contas, public.categorias to authenticated;

create policy "lancamentos_ler_obras_autorizadas" on public.lancamentos for select to authenticated
  using (public.pode_acessar_empresa(empresa_id));
create policy "contas_ler_obras_autorizadas" on public.contas for select to authenticated
  using (public.pode_acessar_empresa(empresa_id));
create policy "categorias_ler_obras_autorizadas" on public.categorias for select to authenticated
  using (public.pode_acessar_empresa(empresa_id));

create or replace function public.pode_editar_financeiro(p_empresa_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.ativo = 1
      and u.perfil in ('admin', 'master')
      and public.pode_acessar_empresa(p_empresa_id)
  );
$$;

create or replace function public.criar_lancamento(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare novo_id bigint; ajuste numeric;
begin
  if not public.pode_editar_financeiro((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  insert into public.lancamentos (empresa_id, descricao, valor, tipo, status, data, data_venc, categoria_id, conta_id, observacao)
  values ((p->>'empresa_id')::bigint, p->>'descricao', (p->>'valor')::numeric, p->>'tipo', p->>'status', p->>'data', nullif(p->>'data_venc',''), (p->>'categoria_id')::bigint, (p->>'conta_id')::bigint, nullif(p->>'observacao','')) returning id into novo_id;
  ajuste := case when p->>'tipo' = 'receita' then (p->>'valor')::numeric else -(p->>'valor')::numeric end;
  update public.contas set saldo = saldo + ajuste where id = (p->>'conta_id')::bigint;
  return novo_id;
end; $$;

revoke all on function public.criar_lancamento(jsonb) from public;
grant execute on function public.criar_lancamento(jsonb) to authenticated;
