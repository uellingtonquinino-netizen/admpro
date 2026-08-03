grant select, insert, update, delete on public.fornecedores to authenticated;
create policy "fornecedores_ler_obras_autorizadas" on public.fornecedores for select to authenticated using (public.pode_acessar_empresa(empresa_id));
create policy "fornecedores_criar_financeiro" on public.fornecedores for insert to authenticated with check (public.pode_editar_financeiro(empresa_id));
create policy "fornecedores_atualizar_financeiro" on public.fornecedores for update to authenticated using (public.pode_editar_financeiro(empresa_id)) with check (public.pode_editar_financeiro(empresa_id));
create policy "fornecedores_excluir_financeiro" on public.fornecedores for delete to authenticated using (public.pode_editar_financeiro(empresa_id));
