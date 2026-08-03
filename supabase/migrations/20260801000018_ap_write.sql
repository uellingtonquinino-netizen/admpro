grant select on public.autorizacoes_pagamento, public.autorizacoes_pagamento_boletos, public.autorizacoes_pagamento_anexos to authenticated;
create policy "aps_ler_obras_autorizadas" on public.autorizacoes_pagamento for select to authenticated using (public.pode_acessar_empresa(empresa_id));
create policy "boletos_ap_ler_obras_autorizadas" on public.autorizacoes_pagamento_boletos for select to authenticated using (exists(select 1 from public.autorizacoes_pagamento a where a.id=ap_id and public.pode_acessar_empresa(a.empresa_id)));

create or replace function public.criar_ap(p jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare ap_id bigint; boleto_id bigint; novo_lancamento_id bigint; boleto jsonb; total numeric:=0; hoje text:=to_char(current_date,'YYYY-MM-DD');
begin
 if not public.pode_editar_financeiro((p->>'empresa_id')::bigint) then raise exception 'Sem permissão para esta obra'; end if;
 if jsonb_array_length(coalesce(p->'boletos','[]'::jsonb))=0 then raise exception 'Inclua ao menos um boleto'; end if;
 select sum((x->>'valor')::numeric) into total from jsonb_array_elements(p->'boletos') x;
 insert into public.autorizacoes_pagamento (empresa_id,beneficiario_tipo,beneficiario_id,beneficiario_nome,descricao,valor,observacoes,vencimento,solicitante,autorizado_por) values ((p->>'empresa_id')::bigint,p->>'beneficiario_tipo',(p->>'beneficiario_id')::bigint,p->>'beneficiario_nome',nullif(p->>'descricao',''),total,nullif(p->>'observacoes',''),(p->'boletos'->0->>'vencimento'),nullif(p->>'solicitante',''),nullif(p->>'autorizado_por','')) returning id into ap_id;
 for boleto in select * from jsonb_array_elements(p->'boletos') loop
  insert into public.autorizacoes_pagamento_boletos(ap_id,valor,vencimento) values(ap_id,(boleto->>'valor')::numeric,boleto->>'vencimento') returning id into boleto_id;
  insert into public.lancamentos(descricao,tipo,valor,data,data_venc,status,empresa_id) values('AP - '||(p->>'beneficiario_nome')||case when coalesce(p->>'descricao','')='' then '' else ': '||(p->>'descricao') end,'despesa',(boleto->>'valor')::numeric,hoje,boleto->>'vencimento','pendente',(p->>'empresa_id')::bigint) returning id into novo_lancamento_id;
  update public.autorizacoes_pagamento_boletos set lancamento_id=novo_lancamento_id where id=boleto_id;
 end loop; return ap_id;
end; $$;
revoke all on function public.criar_ap(jsonb) from public;
grant execute on function public.criar_ap(jsonb) to authenticated;
