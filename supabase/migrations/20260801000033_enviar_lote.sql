create or replace function public.enviar_lotes_supervisor(p_lote_ids bigint[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare l record; resultado jsonb:='[]'::jsonb;
begin
 for l in select * from public.lotes_financeiros where id=any(p_lote_ids) for update loop
  if not public.pode_editar_financeiro(l.empresa_id) then raise exception 'Sem permissão para esta obra'; end if;
  if l.enviado_em is null then
   update public.lotes_financeiros set enviado_em=now()::text where id=l.id;
   insert into public.notificacoes_eventos(empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values(l.empresa_id,'lote_novo','supervisor','Novo lote para autorizar',l.titulo,l.id);
  end if;
  resultado:=resultado || jsonb_build_array(jsonb_build_object('id',l.id,'titulo',l.titulo));
 end loop;
 return resultado;
end; $$;
revoke all on function public.enviar_lotes_supervisor(bigint[]) from public;
grant execute on function public.enviar_lotes_supervisor(bigint[]) to authenticated;
