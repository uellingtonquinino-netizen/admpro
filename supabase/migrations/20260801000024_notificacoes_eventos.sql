grant select, update on public.notificacoes_eventos to authenticated;

create policy "notificacoes_ler_destinatario" on public.notificacoes_eventos
for select to authenticated using (
  public.pode_acessar_empresa(empresa_id)
  and exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.ativo=1 and (u.perfil=destinatario_perfil or u.perfil='master'))
);

create policy "notificacoes_marcar_lidas_destinatario" on public.notificacoes_eventos
for update to authenticated using (
  public.pode_acessar_empresa(empresa_id)
  and exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.ativo=1 and (u.perfil=destinatario_perfil or u.perfil='master'))
) with check (
  public.pode_acessar_empresa(empresa_id)
  and exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.ativo=1 and (u.perfil=destinatario_perfil or u.perfil='master'))
);
