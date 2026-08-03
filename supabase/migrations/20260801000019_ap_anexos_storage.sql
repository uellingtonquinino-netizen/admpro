grant insert on public.autorizacoes_pagamento_anexos to authenticated;
create policy "anexos_ap_ler_obra" on public.autorizacoes_pagamento_anexos for select to authenticated using (exists(select 1 from public.autorizacoes_pagamento a where a.id=ap_id and public.pode_acessar_empresa(a.empresa_id)));
create policy "anexos_ap_gravar_financeiro" on public.autorizacoes_pagamento_anexos for insert to authenticated with check (exists(select 1 from public.autorizacoes_pagamento a where a.id=ap_id and public.pode_editar_financeiro(a.empresa_id)));
