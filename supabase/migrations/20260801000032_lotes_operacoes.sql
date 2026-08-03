create or replace function public.excluir_lote_financeiro(p_lote_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare e bigint;
begin
 select empresa_id into e from public.lotes_financeiros where id=p_lote_id for update;
 if not found then raise exception 'Lote não encontrado'; end if;
 if not public.pode_editar_financeiro(e) then raise exception 'Sem permissão'; end if;
 update public.autorizacoes_pagamento set lote_id=null where lote_id=p_lote_id;
 update public.notas_fiscais set lote_id=null where lote_id=p_lote_id;
 delete from public.lotes_financeiros where id=p_lote_id;
end; $$;

create or replace function public.tirar_item_lote(p_tipo text,p_item_id bigint) returns boolean language plpgsql security definer set search_path=public as $$
declare l bigint; e bigint; restante bigint;
begin
 if p_tipo='ap' then select lote_id,empresa_id into l,e from public.autorizacoes_pagamento where id=p_item_id for update; else select lote_id,empresa_id into l,e from public.notas_fiscais where id=p_item_id for update; end if;
 if l is null then return false; end if; if not public.pode_editar_financeiro(e) then raise exception 'Sem permissão'; end if;
 if p_tipo='ap' then update public.autorizacoes_pagamento set lote_id=null where id=p_item_id; else update public.notas_fiscais set lote_id=null where id=p_item_id; end if;
 select (select count(*) from public.autorizacoes_pagamento where lote_id=l)+(select count(*) from public.notas_fiscais where lote_id=l) into restante;
 if restante=0 then delete from public.lotes_financeiros where id=l; return true; end if; return false;
end; $$;
revoke all on function public.excluir_lote_financeiro(bigint) from public;
revoke all on function public.tirar_item_lote(text,bigint) from public;
grant execute on function public.excluir_lote_financeiro(bigint) to authenticated;
grant execute on function public.tirar_item_lote(text,bigint) to authenticated;
