import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ehStorageUri, caminhoStorage, baixarDocumentoBuffer } from './storage.js'

// PORTADO de src/main/ipc/documentos.ipc.ts (Electron) — mesma lógica
// exata de mesclagem de anexos e desenho de carimbo. A única
// diferença real: anexos chegam aqui como Buffer (já baixados do
// Storage ou enviados junto na requisição), nunca como caminho de
// arquivo local — não existe "disco" persistente numa função
// serverless.

export interface AnexoParaMesclar {
  caminho:        string  // "supabase://documentos-rh/..." ou nome com extensão, se vier em `arquivos`
  vaiAssinatura?: boolean
}

export interface Carimbo {
  aprovadoPor: string
  aprovadoEm:  string
  carimboBase64?: string | null
  posicao?: 'inferior-esquerdo' | 'inferior-direito'
  tamanho?: 'normal' | 'pequeno'
}

function extensaoDe(caminho: string): string {
  const semQuery = caminho.split('?')[0]
  const partes = semQuery.split('.')
  return partes.length > 1 ? `.${partes[partes.length - 1].toLowerCase()}` : ''
}

// Desenha o carimbo (imagem do usuário, ou o texto de reserva) numa
// página específica — idêntico ao desenharCarimboNaPagina do Electron.
export async function desenharCarimboNaPagina(pagina: PDFPage, pdfDoc: PDFDocument, p: Carimbo) {
  const { width: larguraPagina } = pagina.getSize()
  const dataFormatada = new Date(p.aprovadoEm).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const corTexto = rgb(0.110, 0.392, 0.910)
  const pequeno = p.tamanho === 'pequeno'
  const margem = 14

  if (p.carimboBase64) {
    try {
      const base64Puro = p.carimboBase64.includes(',') ? p.carimboBase64.split(',')[1] : p.carimboBase64
      const imgBytes = Buffer.from(base64Puro, 'base64')
      const imagem = await pdfDoc.embedPng(imgBytes)

      const alturaImg = 80
      const larguraImg = (imagem.width / imagem.height) * alturaImg
      const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - larguraImg : margem
      pagina.drawImage(imagem, { x, y: margem, width: larguraImg, height: alturaImg })
      return
    } catch (erro) {
      console.error('Erro ao desenhar o carimbo de imagem — usando o carimbo de texto como reserva:', erro)
    }
  }

  const fonteTexto = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const corBorda = rgb(0.184, 0.498, 0.961)
  const texto = `Aprovado por ${p.aprovadoPor} em ${dataFormatada}`
  const tamanhoFonte = pequeno ? 7 : 9
  const larguraTexto = fonteTexto.widthOfTextAtSize(texto, tamanhoFonte)

  const paddingH = pequeno ? 7 : 10
  const espacoCheck = pequeno ? 12 : 16
  const largura = larguraTexto + paddingH * 2 + espacoCheck
  const altura  = pequeno ? 17 : 22

  const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - largura : margem

  pagina.drawRectangle({
    x, y: margem, width: largura, height: altura,
    color: rgb(1, 1, 1), opacity: 0.78,
    borderColor: corBorda, borderWidth: 1, borderOpacity: 0.9,
  })

  const cx = x + paddingH + (pequeno ? 2 : 3)
  const cy = margem + altura / 2
  const tamanhoCheck = pequeno ? 0.75 : 1
  pagina.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })
  pagina.drawLine({ start: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, end: { x: cx + 9 * tamanhoCheck, y: cy + 5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })

  pagina.drawText(texto, {
    x: x + paddingH + espacoCheck, y: margem + altura / 2 - tamanhoFonte / 2 + 1,
    size: tamanhoFonte, font: fonteTexto, color: corTexto, opacity: 0.95,
  })
}

// Junta uma lista de anexos (PDF ou imagem) nas páginas de um PDF já
// aberto — idêntico ao juntarArquivosEmPdf do Electron, buscando cada
// anexo do Storage do Supabase em vez de disco local.
export async function juntarArquivosEmPdf(
  supabase: SupabaseClient,
  documentoFinal: PDFDocument,
  arquivos: AnexoParaMesclar[],
  carimbos?: Carimbo[]
): Promise<void> {
  for (const item of arquivos) {
    const bytes = ehStorageUri(item.caminho)
      ? await baixarDocumentoBuffer(supabase, item.caminho)
      : null
    if (!bytes) continue  // caminho não reconhecido — ignora silenciosamente, igual ao desktop

    const ext = extensaoDe(ehStorageUri(item.caminho) ? caminhoStorage(item.caminho) : item.caminho)
    const paginaAntesDoAnexo = documentoFinal.getPageCount()

    if (ext === '.pdf') {
      const pdfAnexo = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const paginas  = await documentoFinal.copyPages(pdfAnexo, pdfAnexo.getPageIndices())
      paginas.forEach(pg => documentoFinal.addPage(pg))
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const imagem = ext === '.png' ? await documentoFinal.embedPng(bytes) : await documentoFinal.embedJpg(bytes)
      const pagina = documentoFinal.addPage([imagem.width, imagem.height])
      pagina.drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height })
    }

    if (item.vaiAssinatura && carimbos?.length && documentoFinal.getPageCount() > paginaAntesDoAnexo) {
      const primeiraPaginaDoAnexo = documentoFinal.getPage(paginaAntesDoAnexo)
      for (const carimbo of carimbos) {
        await desenharCarimboNaPagina(primeiraPaginaDoAnexo, documentoFinal, { ...carimbo, tamanho: 'pequeno' })
      }
    }
  }
}
