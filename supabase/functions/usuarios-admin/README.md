# usuários-admin

Implanta a criação de usuários sem expor `service_role` ao Electron.

Execute, após instalar e vincular o Supabase CLI:

`supabase functions deploy usuarios-admin`

A função usa `SUPABASE_SERVICE_ROLE_KEY` gerenciada automaticamente pelo ambiente Supabase. Não a copie para `.env`.
