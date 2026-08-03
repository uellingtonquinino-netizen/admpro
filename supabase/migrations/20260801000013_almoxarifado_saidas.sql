grant select on public.almoxarifado_saidas to authenticated;
create policy "saidas_ler_obras_autorizadas" on public.almoxarifado_saidas for select to authenticated using (public.pode_acessar_empresa(empresa_id));

create or replace function public.criar_saida_almoxarifado(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare saida_id bigint; saldo numeric;
begin
  if not public.pode_operar_almoxarifado((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  select estoque_atual into saldo from public.produtos where id=(p->>'produto_id')::bigint and empresa_id=(p->>'empresa_id')::bigint for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if saldo < (p->>'quantidade')::numeric then raise exception 'Estoque insuficiente'; end if;
  insert into public.almoxarifado_saidas (empresa_id,data,produto_id,produto_codigo,produto_nome,quantidade,retirado_por_tipo,retirado_por_id,retirado_por_nome,setor,solicitado_por_id,solicitado_por_nome,liberado_por)
  values ((p->>'empresa_id')::bigint,p->>'data',(p->>'produto_id')::bigint,p->>'produto_codigo',p->>'produto_nome',(p->>'quantidade')::numeric,p->>'retirado_por_tipo',nullif(p->>'retirado_por_id','')::bigint,p->>'retirado_por_nome',nullif(p->>'setor',''),nullif(p->>'solicitado_por_id','')::bigint,nullif(p->>'solicitado_por_nome',''),nullif(p->>'liberado_por','')) returning id into saida_id;
  update public.produtos set estoque_atual=estoque_atual-(p->>'quantidade')::numeric where id=(p->>'produto_id')::bigint;
  return saida_id;
end; $$;
revoke all on function public.criar_saida_almoxarifado(jsonb) from public;
grant execute on function public.criar_saida_almoxarifado(jsonb) to authenticated;
