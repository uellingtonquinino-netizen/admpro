grant select on public.colaboradores to authenticated;

create policy "colaboradores_ler_obras_autorizadas"
  on public.colaboradores for select to authenticated
  using (public.pode_acessar_empresa(empresa_id));
