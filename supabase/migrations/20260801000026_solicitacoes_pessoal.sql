create or replace function public.eh_setor_pessoal()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.ativo=1 and u.perfil='setor_pessoal');
$$;
revoke all on function public.eh_setor_pessoal() from public;
grant execute on function public.eh_setor_pessoal() to authenticated;

grant select, insert, update on public.solicitacoes_pessoal to authenticated;
grant select, insert on public.solicitacoes_pessoal_anexos to authenticated;
create policy "solicitacoes_ler_obra_ou_pessoal" on public.solicitacoes_pessoal for select to authenticated using (public.pode_acessar_empresa(empresa_id) or public.eh_setor_pessoal());
create policy "solicitacoes_criar_obra" on public.solicitacoes_pessoal for insert to authenticated with check (public.pode_editar_financeiro(empresa_id));
create policy "solicitacoes_atualizar_obra_ou_pessoal" on public.solicitacoes_pessoal for update to authenticated using (public.pode_editar_financeiro(empresa_id) or public.eh_setor_pessoal()) with check (public.pode_editar_financeiro(empresa_id) or public.eh_setor_pessoal());
create policy "solicitacoes_anexos_ler" on public.solicitacoes_pessoal_anexos for select to authenticated using (exists (select 1 from public.solicitacoes_pessoal s where s.id=solicitacao_id and (public.pode_acessar_empresa(s.empresa_id) or public.eh_setor_pessoal())));
create policy "solicitacoes_anexos_gravar" on public.solicitacoes_pessoal_anexos for insert to authenticated with check (exists (select 1 from public.solicitacoes_pessoal s where s.id=solicitacao_id and (public.pode_editar_financeiro(s.empresa_id) or public.eh_setor_pessoal())));

create policy "documentos_rh_setor_pessoal" on storage.objects for all to authenticated using (bucket_id='documentos-rh' and public.eh_setor_pessoal()) with check (bucket_id='documentos-rh' and public.eh_setor_pessoal());

create or replace function public.notificar_solicitacao_pessoal()
returns trigger language plpgsql security definer set search_path=public as $$
declare colaborador_nome text;
begin
  select nome into colaborador_nome from public.colaboradores where id=new.colaborador_id;
  if tg_op='INSERT' then
    insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
    values (new.empresa_id,'solicitacao_pessoal_nova','setor_pessoal',initcap(replace(new.tipo,'_',' ')) || ' — ' || coalesce(colaborador_nome,'colaborador'),new.observacoes,new.id);
  elsif new.status='respondido' and old.status is distinct from 'respondido' then
    insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
    values (new.empresa_id,'solicitacao_pessoal_respondida','admin','Setor Pessoal respondeu — ' || coalesce(colaborador_nome,'colaborador'),'Documentos prontos para baixar',new.id),
           (new.empresa_id,'solicitacao_pessoal_respondida','gestor','Setor Pessoal respondeu — ' || coalesce(colaborador_nome,'colaborador'),'Documentos prontos para baixar',new.id);
  end if;
  return new;
end; $$;
drop trigger if exists notificacao_solicitacao_pessoal on public.solicitacoes_pessoal;
create trigger notificacao_solicitacao_pessoal after insert or update on public.solicitacoes_pessoal for each row execute function public.notificar_solicitacao_pessoal();
revoke all on function public.notificar_solicitacao_pessoal() from public;
