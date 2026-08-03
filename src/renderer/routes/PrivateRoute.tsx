// RECONSTRUÍDO: referenciado em AppRoutes.tsx mas nunca enviado em
// nenhuma PARTE da conversa original. Também decide o redirecionamento
// para /setup quando ainda não existe nenhuma empresa cadastrada
// (primeiro uso do programa em uma máquina nova).
import { useEffect, useState } from 'react'
import { Navigate, Outlet }     from 'react-router-dom'
import { useAuthStore }         from '@store/auth.store'
import EscolherObra             from '@pages/EscolherObra'

export default function PrivateRoute() {
  const usuario = useAuthStore(s => s.usuario)
  const precisaEscolherObra = useAuthStore(s => s.precisaEscolherObra)
  const logout = useAuthStore(s => s.logout)
  const [checking,   setChecking]   = useState(true)
  const [hasEmpresa, setHasEmpresa] = useState(true)

  useEffect(() => {
    let ativo = true

    async function validarAcesso() {
      const status = await window.api.supabase.status().catch(() => null)
      if (!ativo) return

      // No Supabase, o perfil salvo pelo Zustand nunca basta por si só:
      // ele precisa corresponder a uma sessão Auth ainda ativa no processo principal.
      if (status?.provider === 'supabase') {
        if (!status.authenticated && usuario) logout()
        setHasEmpresa(true)
        setChecking(false)
        return
      }

      if (!usuario) {
        const lista = await window.api.empresas.listar().catch(() => [])
        if (ativo) setHasEmpresa(Array.isArray(lista) && lista.length > 0)
      }
      if (ativo) setChecking(false)
    }

    void validarAcesso()
    return () => { ativo = false }
  }, [usuario, logout])

  if (checking) return null
  if (usuario) {
    // NOVO: ADM/Gestor/Almoxarife com mais de uma obra vinculada
    // escolhe qual vai usar antes de entrar no resto do sistema.
    if (precisaEscolherObra) return <EscolherObra />
    return <Outlet />
  }

  return <Navigate to={hasEmpresa ? '/login' : '/setup'} replace />
}
