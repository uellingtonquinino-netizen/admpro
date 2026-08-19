import { createClient } from '@supabase/supabase-js'

// NOVO: cliente Supabase pro navegador — usa a chave ANON (pública),
// nunca a service_role. É o mesmo princípio já usado no app mobile
// (src/web/api-web.ts), só que aqui serve o build "completo"
// (aparência do desktop).
const url     = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true, // necessário pro link de recuperação de senha funcionar
  },
})
