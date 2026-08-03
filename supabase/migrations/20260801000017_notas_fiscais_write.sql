grant insert on public.notas_fiscais_anexos to authenticated;
create policy "anexos_nf_gravar_financeiro" on public.notas_fiscais_anexos for insert to authenticated with check (exists (select 1 from public.notas_fiscais n where n.id=nota_id and public.pode_editar_financeiro(n.empresa_id)));

create or replace function public.criar_nota_fiscal(p jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare nota_id bigint; boleto_id bigint; boleto jsonb; novo_lancamento_id bigint;
begin
  if not public.pode_editar_financeiro((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
  if jsonb_array_length(coalesce(p->'boletos','[]'::jsonb))=0 then raise exception 'Inclua ao menos um boleto'; end if;
  insert into public.notas_fiscais (empresa_id,numero_pedido,data,numero_nf,data_emissao_nf,fornecedor_id,fornecedor_nome) values ((p->>'empresa_id')::bigint,nullif(p->>'numero_pedido',''),p->>'data',nullif(p->>'numero_nf',''),nullif(p->>'data_emissao_nf',''),nullif(p->>'fornecedor_id','')::bigint,p->>'fornecedor_nome') returning id into nota_id;
  for boleto in select * from jsonb_array_elements(p->'boletos') loop
    insert into public.notas_fiscais_boletos (nota_id,valor,vencimento) values (nota_id,(boleto->>'valor')::numeric,boleto->>'vencimento') returning id into boleto_id;
    insert into public.lancamentos (descricao,tipo,valor,data,data_venc,status,fornecedor_id,empresa_id) values (trim('NF '||coalesce(p->>'numero_nf','')||' - '||(p->>'fornecedor_nome')),'despesa',(boleto->>'valor')::numeric,p->>'data',boleto->>'vencimento','pendente',nullif(p->>'fornecedor_id','')::bigint,(p->>'empresa_id')::bigint) returning id into novo_lancamento_id;
    update public.notas_fiscais_boletos set lancamento_id=novo_lancamento_id where id=boleto_id;
  end loop;
  return nota_id;
end; $$;
revoke all on function public.criar_nota_fiscal(jsonb) from public;
grant execute on function public.criar_nota_fiscal(jsonb) to authenticated;
