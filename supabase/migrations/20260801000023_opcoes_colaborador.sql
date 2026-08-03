grant select, insert, update on public.opcoes_colaborador to authenticated;
create policy "opcoes_colaborador_ler_obras_autorizadas" on public.opcoes_colaborador for select to authenticated using (public.pode_acessar_empresa(empresa_id));
create policy "opcoes_colaborador_criar_rh" on public.opcoes_colaborador for insert to authenticated with check (public.pode_editar_financeiro(empresa_id));
create policy "opcoes_colaborador_atualizar_rh" on public.opcoes_colaborador for update to authenticated using (public.pode_editar_financeiro(empresa_id)) with check (public.pode_editar_financeiro(empresa_id));
