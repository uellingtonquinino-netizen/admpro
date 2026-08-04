-- Exclusão de lançamentos avulsos pela web, com recomposição do saldo da conta.
create or replace function public.excluir_lancamento(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.lancamentos%rowtype;
  ajuste numeric;
begin
  select * into atual
  from public.lancamentos
  where id = p_id
  for update;

  if not found then
    raise exception 'Lançamento não encontrado';
  end if;
  if not public.pode_editar_financeiro(atual.empresa_id) then
    raise exception 'Sem permissão para este lançamento';
  end if;
  if exists (select 1 from public.autorizacoes_pagamento_boletos where lancamento_id = atual.id)
     or exists (select 1 from public.notas_fiscais_boletos where lancamento_id = atual.id) then
    raise exception 'Exclua este lançamento pela AP ou Nota Fiscal de origem';
  end if;

  ajuste := case when atual.tipo = 'receita' then -atual.valor else atual.valor end;
  update public.contas set saldo = saldo + ajuste where id = atual.conta_id;
  delete from public.lancamentos where id = atual.id;
end;
$$;

revoke all on function public.excluir_lancamento(bigint) from public;
grant execute on function public.excluir_lancamento(bigint) to authenticated;
