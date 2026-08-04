-- Mantém a cópia assinada no Storage privado e vincula somente o PDF
-- correspondente à AP/NF. A autorização do usuário continua sendo validada
-- no próprio banco antes de qualquer atualização.
-- The permission is narrowly scoped to signed finance PDFs. It lets a
-- supervisor write a signed copy without granting general finance uploads.
create or replace function public.pode_assinar_documento(p_empresa_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = 1
      and (
        (u.perfil in ('admin', 'gestor', 'master', 'central') and public.pode_acessar_empresa(p_empresa_id))
        or (u.perfil = 'supervisor' and exists (
          select 1 from public.supervisor_obras so
          where so.usuario_id = u.id and so.empresa_id = p_empresa_id
        ))
      )
  );
$$;

revoke all on function public.pode_assinar_documento(bigint) from public;
grant execute on function public.pode_assinar_documento(bigint) to authenticated;

drop policy if exists "documentos_rh_assinar_pdf_web" on storage.objects;
create policy "documentos_rh_assinar_pdf_web"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-rh'
  and name like '%/financeiro/assinados/%'
  and public.pode_assinar_documento(split_part(name, '/', 1)::bigint)
);

create or replace function public.registrar_pdf_assinado_web(
  p_tipo text,
  p_id bigint,
  p_caminho text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint;
  v_perfil text;
  v_usuario_id bigint;
begin
  select id, perfil into v_usuario_id, v_perfil
  from public.usuarios
  where auth_user_id = auth.uid() and ativo = 1;

  if v_usuario_id is null or v_perfil not in ('admin', 'gestor', 'master', 'supervisor', 'central') then
    raise exception 'Sem permissão para assinar documentos';
  end if;

  if p_tipo = 'ap' then
    select empresa_id into v_empresa_id from public.autorizacoes_pagamento where id = p_id for update;
  elsif p_tipo = 'nf' then
    select empresa_id into v_empresa_id from public.notas_fiscais where id = p_id for update;
  else
    raise exception 'Tipo de documento inválido';
  end if;

  if v_empresa_id is null or not public.pode_assinar_documento(v_empresa_id) then
    raise exception 'Sem permissão para esta obra';
  end if;

  if p_caminho !~ ('^supabase://documentos-rh/' || v_empresa_id::text || '/financeiro/assinados/') then
    raise exception 'Caminho do PDF assinado inválido para esta obra';
  end if;

  if v_perfil = 'supervisor' and not exists (
    select 1 from public.supervisor_obras where usuario_id = v_usuario_id and empresa_id = v_empresa_id
  ) then
    raise exception 'Supervisor não vinculado a esta obra';
  end if;

  if p_tipo = 'ap' then
    update public.autorizacoes_pagamento set pdf_path = p_caminho where id = p_id;
  else
    update public.notas_fiscais set nota_pdf_path = p_caminho where id = p_id;
  end if;
end;
$$;

revoke all on function public.registrar_pdf_assinado_web(text, bigint, text) from public;
grant execute on function public.registrar_pdf_assinado_web(text, bigint, text) to authenticated;
