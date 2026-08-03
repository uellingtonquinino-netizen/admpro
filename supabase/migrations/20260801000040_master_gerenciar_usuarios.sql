grant update on public.usuarios to authenticated;
grant insert, delete on public.usuario_permissoes_extras, public.usuario_obras, public.supervisor_obras to authenticated;

create policy "usuarios_master_atualizar_todos" on public.usuarios for update to authenticated using (public.eh_master()) with check (public.eh_master());
create policy "permissoes_master_gerenciar" on public.usuario_permissoes_extras for all to authenticated using (public.eh_master()) with check (public.eh_master());
create policy "usuario_obras_master_gerenciar" on public.usuario_obras for all to authenticated using (public.eh_master()) with check (public.eh_master());
create policy "supervisor_obras_master_gerenciar" on public.supervisor_obras for all to authenticated using (public.eh_master()) with check (public.eh_master());
