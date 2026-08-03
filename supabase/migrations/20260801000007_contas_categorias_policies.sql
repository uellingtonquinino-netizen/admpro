-- Leitura de contas e categorias nas obras autorizadas.
grant select on public.contas, public.categorias to authenticated;
-- As políticas de leitura já foram criadas na migration 00004.
