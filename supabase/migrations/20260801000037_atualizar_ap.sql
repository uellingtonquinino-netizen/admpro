create or replace function public.atualizar_ap(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare a public.autorizacoes_pagamento%rowtype; b jsonb; boleto bigint; lanc bigint; total numeric:=0;
begin
 select * into a from public.autorizacoes_pagamento where id=(p->>'id')::bigint for update;
 if not found then raise exception 'AP não encontrada'; end if; if not public.pode_editar_financeiro(a.empresa_id) then raise exception 'Sem permissão'; end if;
 if jsonb_array_length(coalesce(p->'boletos','[]'::jsonb))=0 then raise exception 'Inclua ao menos um boleto'; end if;
 select sum((x->>'valor')::numeric) into total from jsonb_array_elements(p->'boletos') x;
 update public.autorizacoes_pagamento set beneficiario_nome=p->>'beneficiario_nome',descricao=nullif(p->>'descricao',''),valor=total,observacoes=nullif(p->>'observacoes',''),vencimento=(p->'boletos'->0->>'vencimento'),solicitante=nullif(p->>'solicitante',''),autorizado_por=nullif(p->>'autorizado_por','') where id=a.id;
 for lanc in select lancamento_id from public.autorizacoes_pagamento_boletos where ap_id=a.id loop if lanc is not null then delete from public.lancamentos where id=lanc; end if; end loop;
 delete from public.autorizacoes_pagamento_boletos where ap_id=a.id;
 for b in select * from jsonb_array_elements(p->'boletos') loop
  insert into public.autorizacoes_pagamento_boletos(ap_id,valor,vencimento) values(a.id,(b->>'valor')::numeric,b->>'vencimento') returning id into boleto;
  insert into public.lancamentos(descricao,tipo,valor,data,data_venc,status,empresa_id) values('AP - '||(p->>'beneficiario_nome')||case when nullif(p->>'descricao','') is null then '' else ': '||(p->>'descricao') end,'despesa',(b->>'valor')::numeric,current_date::text,b->>'vencimento','pendente',a.empresa_id) returning id into lanc;
  update public.autorizacoes_pagamento_boletos set lancamento_id=lanc where id=boleto;
 end loop;
end; $$;
revoke all on function public.atualizar_ap(jsonb) from public;
grant execute on function public.atualizar_ap(jsonb) to authenticated;
