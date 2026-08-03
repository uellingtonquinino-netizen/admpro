create or replace function public.excluir_ap(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare a public.autorizacoes_pagamento%rowtype; l record;
begin
 select * into a from public.autorizacoes_pagamento where id=p_id for update;
 if not found then raise exception 'AP não encontrada'; end if;
 if not public.pode_editar_financeiro(a.empresa_id) then raise exception 'Sem permissão'; end if;
 for l in select lancamento_id from public.autorizacoes_pagamento_boletos where ap_id=p_id loop
  if l.lancamento_id is not null then delete from public.lancamentos where id=l.lancamento_id; end if;
 end loop;
 delete from public.autorizacoes_pagamento where id=p_id;
end; $$;
revoke all on function public.excluir_ap(bigint) from public;
grant execute on function public.excluir_ap(bigint) to authenticated;
