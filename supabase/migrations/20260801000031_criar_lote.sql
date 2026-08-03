create or replace function public.fechar_lote_financeiro(p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare empresa bigint:=(p->>'empresa_id')::bigint; numero_lote bigint; lote bigint; titulo_lote text; ap_id bigint; nf_id bigint;
begin
 if not public.pode_editar_financeiro(empresa) then raise exception 'Sem permissão para esta obra'; end if;
 if jsonb_array_length(coalesce(p->'ap_ids','[]'::jsonb))+jsonb_array_length(coalesce(p->'nf_ids','[]'::jsonb))=0 then raise exception 'Selecione ao menos um item'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p->'ap_ids','[]'::jsonb)) x join public.autorizacoes_pagamento a on a.id=x::bigint where a.empresa_id=empresa and a.aprovado_por is null) or exists(select 1 from jsonb_array_elements_text(coalesce(p->'nf_ids','[]'::jsonb)) x join public.notas_fiscais n on n.id=x::bigint where n.empresa_id=empresa and n.aprovado_por is null) then raise exception 'Existem itens sem aprovação'; end if;
 select coalesce(max(numero),0)+1 into numero_lote from public.lotes_financeiros where empresa_id=empresa for update;
 titulo_lote:='LOTE '||lpad(numero_lote::text,2,'0')||' '||to_char(current_date,'DD/MM/YYYY');
 insert into public.lotes_financeiros(empresa_id,numero,titulo,data_inicio,data_fim,criado_por) values(empresa,numero_lote,titulo_lote,current_date::text,current_date::text,nullif(p->>'criado_por','')) returning id into lote;
 for ap_id in select value::bigint from jsonb_array_elements_text(coalesce(p->'ap_ids','[]'::jsonb)) loop update public.autorizacoes_pagamento set lote_id=lote where id=ap_id and empresa_id=empresa; end loop;
 for nf_id in select value::bigint from jsonb_array_elements_text(coalesce(p->'nf_ids','[]'::jsonb)) loop update public.notas_fiscais set lote_id=lote where id=nf_id and empresa_id=empresa; end loop;
 return jsonb_build_object('id',lote,'titulo',titulo_lote);
end; $$;
revoke all on function public.fechar_lote_financeiro(jsonb) from public;
grant execute on function public.fechar_lote_financeiro(jsonb) to authenticated;
