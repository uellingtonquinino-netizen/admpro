grant select on public.lotes_financeiros to authenticated;
create policy "lotes_ler_obras_autorizadas" on public.lotes_financeiros for select to authenticated using (public.pode_acessar_empresa(empresa_id));
