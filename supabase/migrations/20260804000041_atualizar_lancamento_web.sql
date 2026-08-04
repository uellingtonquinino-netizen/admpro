-- Edição de lançamentos avulsos pela versão web, com ajuste do saldo da conta.
create or replace function public.atualizar_lancamento(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.lancamentos%rowtype;
  ajuste_anterior numeric;
  ajuste_novo numeric;
begin
  select * into atual
  from public.lancamentos
  where id = (p->>'id')::bigint
  for update;

  if not found then
    raise exception 'Lançamento não encontrado';
  end if;
  if not public.pode_editar_financeiro(atual.empresa_id) then
    raise exception 'Sem permissão para este lançamento';
  end if;
  if exists (select 1 from public.autorizacoes_pagamento_boletos where lancamento_id = atual.id)
     or exists (select 1 from public.notas_fiscais_boletos where lancamento_id = atual.id) then
    raise exception 'Edite este lançamento pela AP ou Nota Fiscal de origem';
  end if;

  ajuste_anterior := case when atual.tipo = 'receita' then atual.valor else -atual.valor end;
  ajuste_novo := case when p->>'tipo' = 'receita' then (p->>'valor')::numeric else -(p->>'valor')::numeric end;

  update public.contas
  set saldo = saldo - ajuste_anterior
  where id = atual.conta_id;

  update public.lancamentos
  set descricao = p->>'descricao',
      valor = (p->>'valor')::numeric,
      tipo = p->>'tipo',
      data = p->>'data',
      data_venc = nullif(p->>'data_venc', ''),
      categoria_id = (p->>'categoria_id')::bigint,
      conta_id = (p->>'conta_id')::bigint
  where id = atual.id;

  update public.contas
  set saldo = saldo + ajuste_novo
  where id = (p->>'conta_id')::bigint;
end;
$$;

revoke all on function public.atualizar_lancamento(jsonb) from public;
grant execute on function public.atualizar_lancamento(jsonb) to authenticated;
