create or replace function public.adicionar_itens_lote(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare l public.lotes_financeiros%rowtype; id_item bigint;
begin
 select * into l from public.lotes_financeiros where id=(p->>'lote_id')::bigint for update;
 if not found then raise exception 'Lote não encontrado'; end if;
 if l.enviado_em is not null then raise exception 'Esse lote já foi enviado ao Supervisor'; end if;
 if not public.pode_editar_financeiro(l.empresa_id) then raise exception 'Sem permissão'; end if;
 for id_item in select value::bigint from jsonb_array_elements_text(coalesce(p->'ap_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.autorizacoes_pagamento where id=id_item and empresa_id=l.empresa_id and aprovado_por is not null) then raise exception 'AP sem aprovação'; end if;
  update public.autorizacoes_pagamento set lote_id=l.id where id=id_item;
 end loop;
 for id_item in select value::bigint from jsonb_array_elements_text(coalesce(p->'nf_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.notas_fiscais where id=id_item and empresa_id=l.empresa_id and aprovado_por is not null) then raise exception 'Nota Fiscal sem aprovação'; end if;
  update public.notas_fiscais set lote_id=l.id where id=id_item;
 end loop;
end; $$;
revoke all on function public.adicionar_itens_lote(jsonb) from public;
grant execute on function public.adicionar_itens_lote(jsonb) to authenticated;
