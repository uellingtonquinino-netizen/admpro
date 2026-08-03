# Publicação da versão web

O portal web é gerado por `npm run build:web` na pasta `dist-web`.

## Variáveis de ambiente da hospedagem

No provedor, crie apenas estas variáveis de ambiente:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use os mesmos valores públicos já configurados localmente. Nunca cadastre
`SUPABASE_SERVICE_ROLE_KEY` nem qualquer token pessoal na hospedagem.

## Vercel

1. Importe este repositório como projeto Vite.
2. A Vercel usará `vercel.json`, gerando `dist-web` com `npm run build:web`.
3. Cadastre as duas variáveis acima para Production, Preview e Development.
4. Depois do primeiro deploy, copie a URL pública criada.

## Supabase

Em Authentication > URL Configuration, inclua a URL publicada em
`Site URL` e em `Redirect URLs`. Isso é necessário para recuperação de senha
e futuras confirmações por e-mail.
