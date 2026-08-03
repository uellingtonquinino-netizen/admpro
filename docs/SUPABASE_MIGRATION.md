# Migração para Supabase

## Segurança e arquitetura

O Electron usa somente `SUPABASE_ANON_KEY`. Nunca coloque a chave `service_role`
no aplicativo ou no repositório. O Supabase Auth identifica o usuário e a RLS
decide o que ele pode ler ou alterar. O SQLite continua como padrão até os
handlers IPC serem migrados; não use `DATABASE_PROVIDER=supabase` antes disso.

## Publicar o banco

1. Crie um projeto Supabase e habilite login por e-mail em Authentication.
2. Copie `.env.example` para `.env` e preencha URL e chave anon/publishable.
3. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli), execute
   `supabase login` e `supabase link --project-ref SEU_PROJECT_REF`.
4. Execute `npm run supabase:schema`.
5. Revise a migration gerada em `supabase/migrations/` e execute `supabase db push`.

## Contas e dados existentes

Os hashes bcrypt atuais não podem ser reaproveitados pelo Supabase Auth. Crie
as contas no Auth (ou em Edge Function administrativa), grave o UUID em
`usuarios.auth_user_id` e peça uma nova senha no primeiro acesso. Antes da
virada, exporte um backup SQLite e valide contagens de tabelas no projeto de
teste.

Para levar os dados atuais, primeiro exporte um backup completo pelo menu
**Backup** do aplicativo. Depois execute:

`npm run supabase:export-data -- "C:\\caminho\\do\\backup.db"`

O arquivo `supabase/imports/dados-iniciais.sql` é criado localmente e ignorado
pelo Git. Execute-o no SQL Editor do Supabase em uma única transação. Ele não
cria contas do Supabase Auth; o vínculo das contas é feito na etapa seguinte.

## Ordem de adaptação da aplicação

1. Autenticação, perfil e permissões por obra.
2. Empresas e cadastros básicos.
3. Financeiro, RH e almoxarifado.
4. Relatórios, arquivos no Supabase Storage e backups lógicos.

Cada módulo precisa substituir seus SQLs SQLite por chamadas Supabase e receber
políticas RLS específicas. Nunca use uma política `using (true)` para liberar o
acesso: ela expõe dados de todas as obras.
