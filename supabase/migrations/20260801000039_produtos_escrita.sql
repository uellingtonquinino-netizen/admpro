grant insert, update, delete on public.produtos to authenticated;
create policy "produtos_criar_almoxarifado" on public.produtos for insert to authenticated with check (public.pode_operar_almoxarifado(empresa_id));
create policy "produtos_atualizar_almoxarifado" on public.produtos for update to authenticated using (public.pode_operar_almoxarifado(empresa_id)) with check (public.pode_operar_almoxarifado(empresa_id));
create policy "produtos_excluir_almoxarifado" on public.produtos for delete to authenticated using (public.pode_operar_almoxarifado(empresa_id));
