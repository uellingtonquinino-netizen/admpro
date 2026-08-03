create or replace function public.excluir_nota_fiscal(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare n public.notas_fiscais%rowtype; l record;
begin
 select * into n from public.notas_fiscais where id=p_id for update;
 if not found then raise exception 'Nota Fiscal não encontrada'; end if;
 if not public.pode_editar_financeiro(n.empresa_id) then raise exception 'Sem permissão'; end if;
 for l in select lancamento_id from public.notas_fiscais_boletos where nota_id=p_id loop
  if l.lancamento_id is not null then delete from public.lancamentos where id=l.lancamento_id; end if;
 end loop;
 delete from public.notas_fiscais where id=p_id;
end; $$;
revoke all on function public.excluir_nota_fiscal(bigint) from public;
grant execute on function public.excluir_nota_fiscal(bigint) to authenticated;
