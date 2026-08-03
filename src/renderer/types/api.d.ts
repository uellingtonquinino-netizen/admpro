// CORRIGIDO: o arquivo original (PARTE 33, de uma versão anterior do
// projeto) declarava um shape de `window.api` incompatível com o preload
// final (clientes/fornecedores/getAll/getById em vez de
// empresas/usuarios/dashboard/lancamentos/contas/categorias/relatorios/
// exportacao usados em toda a aplicação real). Reescrito para refletir
// os canais realmente expostos em src/preload/index.ts.
// NOTA: não importado diretamente de src/preload (fora do rootDir do
// tsconfig do renderer) — o shape é redeclarado aqui como `any` por
// parâmetro para não duplicar/desalinhar assinaturas; ajuste os tipos
// conforme necessário.

export {}

declare global {
  interface Window {
    api: {
      supabase: {
        status: () => Promise<{ provider: 'sqlite' | 'supabase'; configured: boolean; connected: boolean; authenticated: boolean; erro?: string }>
      }
      app:         Record<string, (...args: any[]) => Promise<any>>
      empresas:    Record<string, (...args: any[]) => Promise<any>>
      usuarios:    Record<string, (...args: any[]) => Promise<any>>
      dashboard:   Record<string, (...args: any[]) => Promise<any>>
      lancamentos: Record<string, (...args: any[]) => Promise<any>>
      contas:      Record<string, (...args: any[]) => Promise<any>>
      categorias:  Record<string, (...args: any[]) => Promise<any>>
      relatorios:  Record<string, (...args: any[]) => Promise<any>>
      exportacao:  Record<string, (...args: any[]) => Promise<any>>
      colaboradores: Record<string, (...args: any[]) => Promise<any>>
      documentos:    Record<string, (...args: any[]) => Promise<any>>
      fornecedores:  Record<string, (...args: any[]) => Promise<any>>
      ap:            Record<string, (...args: any[]) => Promise<any>>
      recibos:       Record<string, (...args: any[]) => Promise<any>>
      opcoes:        Record<string, (...args: any[]) => Promise<any>>
      templates:     Record<string, (...args: any[]) => Promise<any>>
      importacao:    Record<string, (...args: any[]) => Promise<any>>
      relatoriosRH:  Record<string, (...args: any[]) => Promise<any>>
      notificacoes:  Record<string, (...args: any[]) => Promise<any>>
      notasFiscais:  Record<string, (...args: any[]) => Promise<any>>
      contasAPagar:  Record<string, (...args: any[]) => Promise<any>>
      contasAReceber: Record<string, (...args: any[]) => Promise<any>>
      produtos:      Record<string, (...args: any[]) => Promise<any>>
      almoxarifadoEntradas: Record<string, (...args: any[]) => Promise<any>>
      pessoasAvulsas: Record<string, (...args: any[]) => Promise<any>>
      almoxarifadoSaidas: Record<string, (...args: any[]) => Promise<any>>
      lotes: Record<string, (...args: any[]) => Promise<any>>
      master: Record<string, (...args: any[]) => Promise<any>>
      solicitacoesPessoal: Record<string, (...args: any[]) => Promise<any>>
      backup: Record<string, (...args: any[]) => Promise<any>>
      supervisor: Record<string, (...args: any[]) => Promise<any>>
      auth: Record<string, (...args: any[]) => Promise<any>>
      configuracoesEmail: Record<string, (...args: any[]) => Promise<any>>
    }
  }
}
