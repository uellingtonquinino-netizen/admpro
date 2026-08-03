import { ReactNode }     from 'react'
import { useAuthStore }  from '@store/auth.store'
import { Navigate }      from 'react-router-dom'

type Perfil = 'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'

interface Props {
  perfis:   Perfil[]
  chave?:   string   // chave de permissão extra que também libera o acesso
  children: ReactNode
  redirect?: string
}

/**
 * Bloqueia renderização se o perfil do usuário logado não estiver na
 * lista de perfis permitidos — A MENOS que ele tenha essa página
 * liberada como permissão extra (Opção A: perfis + exceções pontuais
 * concedidas pelo ADM por usuário).
 *
 * ALTERADO: uma página negada explicitamente pro usuário (Acessos
 * extras, desmarcada mesmo fazendo parte do perfil por padrão) tem
 * PRIORIDADE sobre o perfil — é assim que dá pra tirar de alguém uma
 * página que o perfil dele normalmente traria.
 *
 * O Administrador Master NÃO tem um bypass geral aqui — ele tem
 * autoridade total, mas isso significa acesso ao PAINEL dele (gestão
 * de obras/supervisores/escritório/usuários), não as mesmas telas
 * operacionais do ADM (RH, Financeiro, Almoxarifado). Cada rota que
 * o Master deve acessar precisa listar 'master' explicitamente.
 */
export default function PermissaoGuard({
  perfis,
  chave,
  children,
  redirect = '/',
}: Props) {
  const perfil  = useAuthStore(s => s.usuario?.perfil)
  const extras  = useAuthStore(s => s.usuario?.permissoes_extras ?? [])
  const negadas = useAuthStore(s => s.usuario?.permissoes_negadas ?? [])

  const foiNegado = !!chave && negadas.includes(chave)
  const temAcesso = !foiNegado && ((!!perfil && perfis.includes(perfil)) || (!!chave && extras.includes(chave)))

  if (!temAcesso) {
    return <Navigate to={redirect} replace />
  }

  return <>{children}</>
}
