-- Registros de colaboradores ficam privados por obra; arquivos serão armazenados no bucket privado documentos-rh.
grant select, insert, update, delete on public.colaboradores to authenticated;
create policy "colaboradores_criar_rh" on public.colaboradores for insert to authenticated with check (public.pode_editar_financeiro(empresa_id));
create policy "colaboradores_atualizar_rh" on public.colaboradores for update to authenticated using (public.pode_editar_financeiro(empresa_id)) with check (public.pode_editar_financeiro(empresa_id));
create policy "colaboradores_excluir_rh" on public.colaboradores for delete to authenticated using (public.pode_editar_financeiro(empresa_id));

insert into storage.buckets (id, name, public) values ('documentos-rh', 'documentos-rh', false) on conflict (id) do nothing;
