create or replace function public.atualizar_lancamento(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare anterior public.lancamentos%rowtype; ajuste_anterior numeric; ajuste_novo numeric;
begin
  select * into anterior from public.lancamentos where id = (p->>'id')::bigint for update;
  if not found or not public.pode_editar_financeiro(anterior.empresa_id) then raise exception 'Sem permissão para este lançamento'; end if;
  ajuste_anterior := case when anterior.tipo = 'receita' then -anterior.valor else anterior.valor end;
  update public.contas set saldo = saldo + ajuste_anterior where id = anterior.conta_id;
  update public.lancamentos set descricao=p->>'descricao', valor=(p->>'valor')::numeric, tipo=p->>'tipo', status=p->>'status', data=p->>'data', data_venc=nullif(p->>'data_venc',''), categoria_id=(p->>'categoria_id')::bigint, conta_id=(p->>'conta_id')::bigint, observacao=nullif(p->>'observacao','') where id=anterior.id;
  ajuste_novo := case when p->>'tipo' = 'receita' then (p->>'valor')::numeric else -(p->>'valor')::numeric end;
  update public.contas set saldo = saldo + ajuste_novo where id = (p->>'conta_id')::bigint;
end; $$;

create or replace function public.excluir_lancamento(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare anterior public.lancamentos%rowtype; ajuste numeric;
begin
  select * into anterior from public.lancamentos where id = p_id for update;
  if not found or not public.pode_editar_financeiro(anterior.empresa_id) then raise exception 'Sem permissão para este lançamento'; end if;
  ajuste := case when anterior.tipo = 'receita' then -anterior.valor else anterior.valor end;
  update public.contas set saldo = saldo + ajuste where id = anterior.conta_id;
  delete from public.lancamentos where id = p_id;
end; $$;

revoke all on function public.atualizar_lancamento(jsonb), public.excluir_lancamento(bigint) from public;
grant execute on function public.atualizar_lancamento(jsonb), public.excluir_lancamento(bigint) to authenticated;
