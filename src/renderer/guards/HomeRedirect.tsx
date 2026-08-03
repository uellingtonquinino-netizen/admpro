import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'

// Cada perfil tem uma "home" diferente — evita loop de redirecionamento
// quando um perfil sem acesso a /inicio (ex: almoxarife) cai numa rota
// bloqueada e precisaria ser mandado pra algum lugar que ELE possa ver.
export default function HomeRedirect() {
  const perfil = useAuthStore(s => s.usuario?.perfil)

  if (perfil === 'almoxarife') return <Navigate to="/almoxarifado/painel-inicial" replace />
  if (perfil === 'supervisor') return <Navigate to="/supervisor" replace />
  if (perfil === 'central') return <Navigate to="/central" replace />
  if (perfil === 'master') return <Navigate to="/master" replace />
  if (perfil === 'setor_pessoal') return <Navigate to="/setor-pessoal" replace />
  return <Navigate to="/inicio" replace />
}
