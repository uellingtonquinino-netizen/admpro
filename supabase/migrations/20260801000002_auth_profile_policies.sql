-- Políticas mínimas para autenticação e seleção da obra ativa.
-- Os demais módulos receberão políticas próprias quando forem migrados.
grant usage on schema public to authenticated;
grant select on public.usuarios, public.empresas, public.usuario_obras,
  public.supervisor_obras, public.usuario_permissoes_extras to authenticated;

create policy "usuarios_ler_proprio_perfil"
  on public.usuarios for select to authenticated
  using (auth_user_id = auth.uid());

create policy "empresas_ler_obras_autorizadas"
  on public.empresas for select to authenticated
  using (public.pode_acessar_empresa(id));

create policy "usuario_obras_ler_proprias"
  on public.usuario_obras for select to authenticated
  using (usuario_id = public.current_usuario_id());

create policy "supervisor_obras_ler_proprias"
  on public.supervisor_obras for select to authenticated
  using (usuario_id = public.current_usuario_id());

create policy "permissoes_ler_proprias"
  on public.usuario_permissoes_extras for select to authenticated
  using (usuario_id = public.current_usuario_id());

create or replace function public.atualizar_meu_carimbo(p_carimbo_url text)
returns void
language sql security definer set search_path = public
as $$
  update public.usuarios set carimbo_url = p_carimbo_url
  where auth_user_id = auth.uid();
$$;

revoke all on function public.atualizar_meu_carimbo(text) from public;
grant execute on function public.atualizar_meu_carimbo(text) to authenticated;
