// NOVO: aplica os carimbos de aprovação (Gestor e Supervisor) num PDF
// de AP recém-gerado. Supervisor no canto inferior direito, como
// sempre; Gestor/ADM agora vai dentro da caixa de "DADOS BANCARIOS:"
// — mesmo lugar de uma assinatura física numa AP impressa (posição
// calculada a partir de uma AP real assinada à mão, mandada pelo
// usuário como referência).
//
// ALTERADO: agora usa a imagem de carimbo que o usuário subiu em
// Configurações (aprovado_por_carimbo_url / aprovado_supervisor_
// carimbo_url, já vêm junto do ap:buscarPorId) — se ele ainda não
// subiu nenhuma, o backend cai pro carimbo de texto de sempre sozinho.
//
// CORRIGIDO: antes, se o carimbo falhasse ao aplicar, isso não
// aparecia em lugar nenhum — o PDF simplesmente ficava sem a
// assinatura, sem nenhum aviso. Agora, qualquer falha aqui gera um
// aviso visível, em vez de falhar calado.
// NOVO: monta a lista de carimbos (Gestor e/ou Supervisor, o que já
// estiver aprovado) no formato que `salvarPdfInterno` espera pra
// carimbar os anexos "Vai Assinatura" — usada em QUALQUER lugar que
// regera o PDF da AP (visualizar, reimprimir, gerar lote), não só na
// hora de clicar em "Autorizar". É essa a peça que faltava: antes, só
// autorizar carimbava o anexo; reimprimir depois (inclusive uma AP
// aprovada pelo celular, que nunca gera PDF nenhum sozinha) perdia o
// carimbo do anexo, mesmo o documento principal continuando certo.
export function montarCarimbosParaAnexos(ap: {
  aprovado_por?: string | null
  aprovado_em?: string | null
  aprovado_por_carimbo_url?: string | null
  aprovado_supervisor_por?: string | null
  aprovado_supervisor_em?: string | null
  aprovado_supervisor_carimbo_url?: string | null
}): { aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null; posicao: 'inferior-esquerdo' | 'inferior-direito' }[] {
  const carimbos: ReturnType<typeof montarCarimbosParaAnexos> = []
  if (ap.aprovado_por && ap.aprovado_em) {
    carimbos.push({
      aprovadoPor: ap.aprovado_por, aprovadoEm: ap.aprovado_em,
      carimboBase64: ap.aprovado_por_carimbo_url ?? null, posicao: 'inferior-esquerdo',
    })
  }
  if (ap.aprovado_supervisor_por && ap.aprovado_supervisor_em) {
    carimbos.push({
      aprovadoPor: ap.aprovado_supervisor_por, aprovadoEm: ap.aprovado_supervisor_em,
      carimboBase64: ap.aprovado_supervisor_carimbo_url ?? null, posicao: 'inferior-direito',
    })
  }
  return carimbos
}

export async function aplicarCarimbosAP(pdfPath: string, ap: {
  aprovado_por?: string | null
  aprovado_em?: string | null
  aprovado_por_carimbo_url?: string | null
  aprovado_supervisor_por?: string | null
  aprovado_supervisor_em?: string | null
  aprovado_supervisor_carimbo_url?: string | null
}): Promise<{ ok: boolean; erros: string[] }> {
  const erros: string[] = []

  if (ap.aprovado_por && ap.aprovado_em) {
    const resultado = await window.api.documentos.carimbarPrimeiraPagina({
      caminhoPdf: pdfPath, aprovadoPor: ap.aprovado_por, aprovadoEm: ap.aprovado_em,
      carimboBase64: ap.aprovado_por_carimbo_url ?? null,
      posicao: 'dados-bancarios-ap', tamanho: 'pequeno',
    })
    if (!resultado.ok) erros.push('Não foi possível aplicar a assinatura do Gestor no documento.')
  }
  if (ap.aprovado_supervisor_por && ap.aprovado_supervisor_em) {
    const resultado = await window.api.documentos.carimbarPrimeiraPagina({
      caminhoPdf: pdfPath, aprovadoPor: ap.aprovado_supervisor_por, aprovadoEm: ap.aprovado_supervisor_em,
      carimboBase64: ap.aprovado_supervisor_carimbo_url ?? null,
      posicao: 'inferior-direito', tamanho: 'pequeno',
    })
    if (!resultado.ok) erros.push('Não foi possível aplicar a assinatura do Supervisor no documento.')
  }

  return { ok: erros.length === 0, erros }
}

// NOVO: pacote completo pós-geração de um PDF de AP — carimba (se já
// houver aprovação) e SEMPRE sobe o resultado final pro Supabase
// Storage antes de devolver o caminho a salvar como `pdf_path`.
//
// CORRIGIDO: era aqui que o carimbo "sumia" ao trocar de perfil
// (Gestor aprova, ADM olha depois) — o pdf_path salvo no banco
// (compartilhado) apontava direto pro arquivo local gerado por
// `salvarPdfInterno` (dentro de app.getPath('userData'), que é
// exclusivo do computador/perfil Windows de quem gerou). Em qualquer
// outra máquina esse caminho não existe. Agora todo lugar que gera um
// PDF de AP passa por aqui: carimba localmente (pdf-lib só sabe abrir
// arquivo em disco) e IMEDIATAMENTE sobe o resultado final pro
// Storage — é a URI supabase:// que vai pro banco, não o caminho
// local. `documentos:abrirArquivo` já sabe baixar de lá antes de
// abrir, então funciona igual em qualquer computador da empresa.
export async function finalizarPdfAP(caminhoLocal: string, empresaId: number, pastaId: string, ap: Parameters<typeof aplicarCarimbosAP>[1]): Promise<{ ok: boolean; caminho?: string; erros: string[] }> {
  const carimbo = await aplicarCarimbosAP(caminhoLocal, ap)
  const upload  = await window.api.documentos.subirPdfStorage({ caminhoLocal, empresaId, pastaId })

  const erros = [...carimbo.erros]
  if (!upload.ok) erros.push('Não foi possível salvar o PDF de forma que outros computadores consigam abri-lo.')

  return { ok: upload.ok, caminho: upload.ok ? upload.caminho : undefined, erros }
}
