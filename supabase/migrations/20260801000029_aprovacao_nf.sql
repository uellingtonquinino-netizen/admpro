create or replace function public.aprovar_nota_fiscal(p_id bigint)
returns text language plpgsql security definer set search_path=public as $$
declare n public.notas_fiscais%rowtype; u public.usuarios%rowtype; agora text:=now()::text; d text;
begin
 select * into n from public.notas_fiscais where id=p_id for update; if not found then raise exception 'Nota Fiscal não encontrada'; end if;
 select * into u from public.usuarios where auth_user_id=auth.uid() and ativo=1; if not found then raise exception 'Usuário sem perfil ativo'; end if;
 if u.perfil='central' then update public.notas_fiscais set aprovado_central_por=u.nome,aprovado_central_em=agora where id=p_id; foreach d in array array['admin','gestor','supervisor'] loop insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values(n.empresa_id,'nf_aprovada',d,'Nota Fiscal aprovada pelo Escritório',u.nome||' autorizou a NF '||coalesce(n.numero_nf,'—')||' de '||n.fornecedor_nome,n.lote_id); end loop;
 elsif u.perfil='supervisor' and n.lote_id is not null and exists(select 1 from public.supervisor_obras so where so.usuario_id=u.id and so.empresa_id=n.empresa_id) then update public.notas_fiscais set aprovado_supervisor_por=u.nome,aprovado_supervisor_em=agora,aprovado_supervisor_por_usuario_id=u.id where id=p_id; foreach d in array array['admin','gestor'] loop insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values(n.empresa_id,'nf_aprovada',d,'Nota Fiscal autorizada',u.nome||' autorizou a NF '||coalesce(n.numero_nf,'—')||' de '||n.fornecedor_nome,n.lote_id); end loop;
 elsif u.perfil in ('admin','gestor','master') and public.pode_acessar_empresa(n.empresa_id) then update public.notas_fiscais set aprovado_por=u.nome,aprovado_em=agora,aprovado_por_usuario_id=u.id where id=p_id; insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id) values(n.empresa_id,'nf_aprovada','admin','Nota Fiscal autorizada',u.nome||' autorizou a NF '||coalesce(n.numero_nf,'—')||' de '||n.fornecedor_nome,n.lote_id);
 else raise exception 'Sem permissão para aprovar esta Nota Fiscal'; end if; return agora;
end; $$;
revoke all on function public.aprovar_nota_fiscal(bigint) from public;
grant execute on function public.aprovar_nota_fiscal(bigint) to authenticated;
