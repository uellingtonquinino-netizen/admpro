grant select on public.notas_fiscais, public.notas_fiscais_boletos, public.notas_fiscais_anexos to authenticated;
create policy "notas_fiscais_ler_obras_autorizadas" on public.notas_fiscais for select to authenticated using (public.pode_acessar_empresa(empresa_id));
create policy "boletos_nf_ler_obras_autorizadas" on public.notas_fiscais_boletos for select to authenticated using (exists (select 1 from public.notas_fiscais n where n.id=nota_id and public.pode_acessar_empresa(n.empresa_id)));
create policy "anexos_nf_ler_obras_autorizadas" on public.notas_fiscais_anexos for select to authenticated using (exists (select 1 from public.notas_fiscais n where n.id=nota_id and public.pode_acessar_empresa(n.empresa_id)));
