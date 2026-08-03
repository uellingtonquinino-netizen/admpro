create policy "usuarios_master_ler_todos" on public.usuarios for select to authenticated using (public.eh_master());
create policy "usuario_obras_master_ler_todos" on public.usuario_obras for select to authenticated using (public.eh_master());
create policy "supervisor_obras_master_ler_todos" on public.supervisor_obras for select to authenticated using (public.eh_master());
create policy "permissoes_master_ler_todas" on public.usuario_permissoes_extras for select to authenticated using (public.eh_master());
