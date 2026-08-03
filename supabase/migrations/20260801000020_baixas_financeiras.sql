create or replace function public.atualizar_baixa_lancamento(p_id bigint,p_status text,p_data text default null)
returns void language plpgsql security definer set search_path=public as $$
declare empresa bigint;
begin select empresa_id into empresa from public.lancamentos where id=p_id for update; if not found or not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão'; end if;
 update public.lancamentos set status=p_status,data_pgto=case when p_status='pago' then coalesce(p_data,to_char(current_date,'YYYY-MM-DD')) else null end where id=p_id;
end; $$;
create or replace function public.pagamento_parcial(p jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare l public.lancamentos%rowtype; restante numeric; novo_id bigint;
begin select * into l from public.lancamentos where id=(p->>'id')::bigint for update; if not found or not public.pode_editar_financeiro(l.empresa_id) then raise exception 'Sem permissão'; end if;
 if (p->>'valor_pago')::numeric<=0 or (p->>'valor_pago')::numeric>=l.valor then raise exception 'Valor parcial inválido'; end if;
 restante:=l.valor-(p->>'valor_pago')::numeric; update public.lancamentos set valor=(p->>'valor_pago')::numeric,status='pago',data_pgto=coalesce(nullif(p->>'data_pgto',''),to_char(current_date,'YYYY-MM-DD')) where id=l.id;
 insert into public.lancamentos(descricao,tipo,valor,data,data_venc,status,fornecedor_id,empresa_id) values(l.descricao||' (restante)',l.tipo,restante,l.data,p->>'novo_vencimento','pendente',l.fornecedor_id,l.empresa_id) returning id into novo_id; return novo_id;
end; $$;
revoke all on function public.atualizar_baixa_lancamento(bigint,text,text),public.pagamento_parcial(jsonb) from public;
grant execute on function public.atualizar_baixa_lancamento(bigint,text,text),public.pagamento_parcial(jsonb) to authenticated;
