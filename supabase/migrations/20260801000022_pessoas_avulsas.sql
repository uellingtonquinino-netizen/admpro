grant select, insert on public.pessoas_avulsas to authenticated;
create policy "pessoas_avulsas_ler_obras_autorizadas" on public.pessoas_avulsas for select to authenticated using (public.pode_acessar_empresa(empresa_id));
create policy "pessoas_avulsas_criar_almoxarifado" on public.pessoas_avulsas for insert to authenticated with check (public.pode_operar_almoxarifado(empresa_id));
