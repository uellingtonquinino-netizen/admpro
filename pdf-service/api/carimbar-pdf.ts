import type { VercelRequest, VercelResponse } from '@vercel/node'
import WebSocket from 'ws'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import { desenharCarimboNaPagina, type Carimbo } from '../lib/pdfLogic.js'
import { ehStorageUri, caminhoStorage, baixarDocumentoBuffer, subirDocumentoBuffer } from '../lib/storage.js'

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket
}

// PORTADO de documentos:carimbarPrimeiraPagina (Electron) — igual
// aquele, só que baixa/sobe do Storage em vez de mexer em arquivo
// local. Não precisa do Puppeteer/Chrome pra isso — é só abrir o PDF
// já pronto e desenhar por cima, bem mais rápido que o endpoint
// principal.
interface CorpoRequisicao {
  caminhoPdf: string  // "supabase://documentos-rh/..."
  carimbo:    Carimbo
}

function origensPermitidas(): string[] {
  return (process.env.ALLOWED_ORIGIN ?? '*').split(',').map(o => o.trim()).filter(Boolean)
}

function permitirCors(req: VercelRequest, res: VercelResponse) {
  const permitidas = origensPermitidas()
  const origemRequisicao = req.headers.origin
  const origemLiberada = permitidas.includes('*')
    ? '*'
    : (origemRequisicao && permitidas.includes(origemRequisicao)) ? origemRequisicao : permitidas[0]
  res.setHeader('Access-Control-Allow-Origin', origemLiberada)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  permitirCors(req, res)
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) { res.status(401).json({ error: 'Sessão do Supabase não encontrada.' }); return }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const p = req.body as CorpoRequisicao
    if (!p?.caminhoPdf || !p?.carimbo) {
      res.status(400).json({ error: 'Parâmetros obrigatórios faltando (caminhoPdf, carimbo).' })
      return
    }
    if (!ehStorageUri(p.caminhoPdf)) {
      res.status(400).json({ error: 'caminhoPdf precisa ser um endereço do Storage (supabase://...).' })
      return
    }

    const bytesOriginais = await baixarDocumentoBuffer(supabase, p.caminhoPdf)
    const pdfDoc = await PDFDocument.load(bytesOriginais)
    const primeiraPagina = pdfDoc.getPage(0)
    await desenharCarimboNaPagina(primeiraPagina, pdfDoc, p.carimbo)
    const bytesFinais = await pdfDoc.save()

    await subirDocumentoBuffer(supabase, caminhoStorage(p.caminhoPdf), bytesFinais)

    res.status(200).json({ ok: true })
  } catch (erro) {
    console.error('Erro ao carimbar PDF:', erro)
    res.status(500).json({ ok: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido ao carimbar o PDF.' })
  }
}
