grant select on public.produtos to authenticated;
create policy "produtos_ler_obras_autorizadas" on public.produtos for select to authenticated
  using (public.pode_acessar_empresa(empresa_id));
