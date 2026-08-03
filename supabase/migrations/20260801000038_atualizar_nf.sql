create or replace function public.atualizar_nota_fiscal(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare n public.notas_fiscais%rowtype; b jsonb; bid bigint; lid bigint;
begin
 select * into n from public.notas_fiscais where id=(p->>'id')::bigint for update;
 if not found then raise exception 'Nota Fiscal não encontrada'; end if; if not public.pode_editar_financeiro(n.empresa_id) then raise exception 'Sem permissão'; end if;
 if jsonb_array_length(coalesce(p->'boletos','[]'::jsonb))=0 then raise exception 'Inclua ao menos um boleto'; end if;
 update public.notas_fiscais set numero_pedido=nullif(p->>'numero_pedido',''),data=p->>'data',numero_nf=nullif(p->>'numero_nf',''),data_emissao_nf=nullif(p->>'data_emissao_nf',''),fornecedor_id=nullif(p->>'fornecedor_id','')::bigint,fornecedor_nome=p->>'fornecedor_nome' where id=n.id;
 for lid in select lancamento_id from public.notas_fiscais_boletos where nota_id=n.id loop if lid is not null then delete from public.lancamentos where id=lid; end if; end loop;
 delete from public.notas_fiscais_boletos where nota_id=n.id;
 for b in select * from jsonb_array_elements(p->'boletos') loop
  insert into public.notas_fiscais_boletos(nota_id,valor,vencimento) values(n.id,(b->>'valor')::numeric,b->>'vencimento') returning id into bid;
  insert into public.lancamentos(descricao,tipo,valor,data,data_venc,status,fornecedor_id,empresa_id) values(trim('NF '||coalesce(p->>'numero_nf','')||' - '||(p->>'fornecedor_nome')),'despesa',(b->>'valor')::numeric,p->>'data',b->>'vencimento','pendente',nullif(p->>'fornecedor_id','')::bigint,n.empresa_id) returning id into lid;
  update public.notas_fiscais_boletos set lancamento_id=lid where id=bid;
 end loop;
end; $$;
revoke all on function public.atualizar_nota_fiscal(jsonb) from public;
grant execute on function public.atualizar_nota_fiscal(jsonb) to authenticated;
