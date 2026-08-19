import { useEffect, useState } from 'react'

// NOVO: acesso web pensado só pra celular — essa tela cuida da
// segunda trava (a primeira é o perfil, ver MobileShell). Larguras
// abaixo disso passam; tablet grande/PC ficam de fora, mesmo que
// mudem de orientação depois de já estar logado (reage ao resize).
const LARGURA_MAXIMA_MOBILE = 820

export function useTelaEhMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(() => window.innerWidth <= LARGURA_MAXIMA_MOBILE)

  useEffect(() => {
    function verificar() {
      setEhMobile(window.innerWidth <= LARGURA_MAXIMA_MOBILE)
    }
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  return ehMobile
}
