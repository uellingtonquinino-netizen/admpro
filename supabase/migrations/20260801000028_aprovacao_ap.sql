create or replace function public.aprovar_ap(p_id bigint)
returns text language plpgsql security definer set search_path=public as $$
declare ap public.autorizacoes_pagamento%rowtype; u public.usuarios%rowtype; agora text:=now()::text; destinatario text;
begin
  select * into ap from public.autorizacoes_pagamento where id=p_id for update;
  if not found then raise exception 'AP não encontrada'; end if;
  select * into u from public.usuarios where auth_user_id=auth.uid() and ativo=1;
  if not found then raise exception 'Usuário sem perfil ativo'; end if;
  if u.perfil='central' then
    update public.autorizacoes_pagamento set aprovado_central_por=u.nome, aprovado_central_em=agora where id=p_id;
    foreach destinatario in array array['admin','gestor','supervisor'] loop
      insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values (ap.empresa_id,'ap_aprovada',destinatario,'AP aprovada pelo Escritório',u.nome || ' autorizou a AP de ' || ap.beneficiario_nome,ap.lote_id);
    end loop;
  elsif u.perfil='supervisor' and ap.lote_id is not null and exists(select 1 from public.supervisor_obras so where so.usuario_id=u.id and so.empresa_id=ap.empresa_id) then
    update public.autorizacoes_pagamento set aprovado_supervisor_por=u.nome, aprovado_supervisor_em=agora, aprovado_supervisor_por_usuario_id=u.id where id=p_id;
    foreach destinatario in array array['admin','gestor'] loop
      insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values (ap.empresa_id,'ap_aprovada',destinatario,'AP autorizada',u.nome || ' autorizou a AP de ' || ap.beneficiario_nome,ap.lote_id);
    end loop;
  elsif u.perfil in ('admin','gestor','master') and public.pode_acessar_empresa(ap.empresa_id) then
    update public.autorizacoes_pagamento set aprovado_por=u.nome, aprovado_em=agora, aprovado_por_usuario_id=u.id where id=p_id;
    insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values (ap.empresa_id,'ap_aprovada','admin','AP autorizada',u.nome || ' autorizou a AP de ' || ap.beneficiario_nome,ap.lote_id);
  else raise exception 'Sem permissão para aprovar esta AP'; end if;
  return agora;
end; $$;
revoke all on function public.aprovar_ap(bigint) from public;
grant execute on function public.aprovar_ap(bigint) to authenticated;
