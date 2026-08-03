-- Exclusões transacionais: sempre recompõem o estoque antes de remover o registro.
create or replace function public.excluir_entrada_almoxarifado(p_entrada_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare entrada public.almoxarifado_entradas%rowtype; item record;
begin
  select * into entrada from public.almoxarifado_entradas where id=p_entrada_id for update;
  if not found then raise exception 'Entrada não encontrada'; end if;
  if not public.pode_operar_almoxarifado(entrada.empresa_id) then raise exception 'Sem permissão para esta obra'; end if;
  for item in select produto_id, quantidade from public.almoxarifado_entradas_itens where entrada_id=entrada.id loop
    update public.produtos set estoque_atual=estoque_atual-item.quantidade where id=item.produto_id and empresa_id=entrada.empresa_id;
  end loop;
  delete from public.almoxarifado_entradas where id=entrada.id;
  if entrada.lancamento_id is not null then delete from public.lancamentos where id=entrada.lancamento_id; end if;
end; $$;

create or replace function public.excluir_saida_almoxarifado(p_saida_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare saida public.almoxarifado_saidas%rowtype;
begin
  select * into saida from public.almoxarifado_saidas where id=p_saida_id for update;
  if not found then raise exception 'Saída não encontrada'; end if;
  if not public.pode_operar_almoxarifado(saida.empresa_id) then raise exception 'Sem permissão para esta obra'; end if;
  update public.produtos set estoque_atual=estoque_atual+saida.quantidade where id=saida.produto_id and empresa_id=saida.empresa_id;
  delete from public.almoxarifado_saidas where id=saida.id;
end; $$;

revoke all on function public.excluir_entrada_almoxarifado(bigint) from public;
revoke all on function public.excluir_saida_almoxarifado(bigint) from public;
grant execute on function public.excluir_entrada_almoxarifado(bigint) to authenticated;
grant execute on function public.excluir_saida_almoxarifado(bigint) to authenticated;
