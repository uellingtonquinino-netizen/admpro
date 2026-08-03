create or replace function public.gerar_notificacao_ap_nova()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
  values (new.empresa_id,'ap_nova','gestor','Nova AP para autorizar',new.beneficiario_nome || ' — R$ ' || to_char(new.valor,'FM999G999G999D00'),new.id);
  return new;
end; $$;

create or replace function public.gerar_notificacao_nf_nova()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
  values (new.empresa_id,'nf_nova','gestor','Nova Nota Fiscal para autorizar','NF ' || coalesce(new.numero_nf,'—') || ' — ' || new.fornecedor_nome,new.id);
  return new;
end; $$;

create or replace function public.gerar_notificacao_almoxarifado()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='almoxarifado_entradas' then
    insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
    values (new.empresa_id,'almox_entrada','admin','Entrada de material registrada','Nota ' || coalesce(new.numero_nota,'—') || ' — ' || new.fornecedor_nome,new.id),
           (new.empresa_id,'almox_entrada','gestor','Entrada de material registrada','Nota ' || coalesce(new.numero_nota,'—') || ' — ' || new.fornecedor_nome,new.id);
  else
    insert into public.notificacoes_eventos (empresa_id,tipo,destinatario_perfil,titulo,mensagem,referencia_id)
    values (new.empresa_id,'almox_saida','admin','Saída de material registrada',new.produto_nome || ' (' || new.quantidade || ') — retirado por ' || new.retirado_por_nome,new.id),
           (new.empresa_id,'almox_saida','gestor','Saída de material registrada',new.produto_nome || ' (' || new.quantidade || ') — retirado por ' || new.retirado_por_nome,new.id);
  end if;
  return new;
end; $$;

drop trigger if exists notificacao_ap_nova on public.autorizacoes_pagamento;
create trigger notificacao_ap_nova after insert on public.autorizacoes_pagamento for each row execute function public.gerar_notificacao_ap_nova();
drop trigger if exists notificacao_nf_nova on public.notas_fiscais;
create trigger notificacao_nf_nova after insert on public.notas_fiscais for each row execute function public.gerar_notificacao_nf_nova();
drop trigger if exists notificacao_entrada_almoxarifado on public.almoxarifado_entradas;
create trigger notificacao_entrada_almoxarifado after insert on public.almoxarifado_entradas for each row execute function public.gerar_notificacao_almoxarifado();
drop trigger if exists notificacao_saida_almoxarifado on public.almoxarifado_saidas;
create trigger notificacao_saida_almoxarifado after insert on public.almoxarifado_saidas for each row execute function public.gerar_notificacao_almoxarifado();

revoke all on function public.gerar_notificacao_ap_nova() from public;
revoke all on function public.gerar_notificacao_nf_nova() from public;
revoke all on function public.gerar_notificacao_almoxarifado() from public;
