create or replace function public.pode_operar_almoxarifado(p_empresa_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_user_id=auth.uid() and u.ativo=1
      and u.perfil in ('admin','master','almoxarife')
      and public.pode_acessar_empresa(p_empresa_id)
  );
$$;
revoke all on function public.pode_operar_almoxarifado(bigint) from public;
grant execute on function public.pode_operar_almoxarifado(bigint) to authenticated;

create or replace function public.criar_entrada_almoxarifado(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare entrada_id bigint; novo_lancamento_id bigint; item jsonb; subtotal numeric := 0; total numeric;
begin
  if not public.pode_operar_almoxarifado((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then raise exception 'Inclua ao menos um produto'; end if;
  select coalesce(sum((x->>'quantidade')::numeric * (x->>'valor_unitario')::numeric),0) into subtotal from jsonb_array_elements(p->'itens') x;
  total := greatest(subtotal - coalesce((p->>'valor_desconto')::numeric,0), 0);
  insert into public.almoxarifado_entradas (empresa_id,numero_nota,numero_pedido,data,fornecedor_id,fornecedor_nome,valor_desconto,valor_total) values ((p->>'empresa_id')::bigint,nullif(p->>'numero_nota',''),nullif(p->>'numero_pedido',''),p->>'data',nullif(p->>'fornecedor_id','')::bigint,p->>'fornecedor_nome',coalesce((p->>'valor_desconto')::numeric,0),total) returning id into entrada_id;
  for item in select * from jsonb_array_elements(p->'itens') loop
    insert into public.almoxarifado_entradas_itens (entrada_id,produto_id,produto_codigo,produto_nome,quantidade,valor_unitario,valor_total) values (entrada_id,(item->>'produto_id')::bigint,item->>'produto_codigo',item->>'produto_nome',(item->>'quantidade')::numeric,(item->>'valor_unitario')::numeric,(item->>'quantidade')::numeric*(item->>'valor_unitario')::numeric);
    update public.produtos set estoque_atual=estoque_atual+(item->>'quantidade')::numeric, valor_unitario=(item->>'valor_unitario')::numeric where id=(item->>'produto_id')::bigint and empresa_id=(p->>'empresa_id')::bigint;
  end loop;
  insert into public.lancamentos (descricao,tipo,valor,data,data_venc,status,fornecedor_id,empresa_id) values (trim('Entrada Almoxarifado '||coalesce(p->>'numero_nota','')||' - '||(p->>'fornecedor_nome')),'despesa',total,p->>'data',p->>'data','pendente',nullif(p->>'fornecedor_id','')::bigint,(p->>'empresa_id')::bigint) returning id into novo_lancamento_id;
  update public.almoxarifado_entradas set lancamento_id=novo_lancamento_id where id=entrada_id;
  return entrada_id;
end; $$;
