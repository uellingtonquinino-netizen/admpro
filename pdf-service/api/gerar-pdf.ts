import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { juntarArquivosEmPdf, type AnexoParaMesclar, type Carimbo } from '../lib/pdfLogic.js'
import { subirDocumentoBuffer } from '../lib/storage.js'

// URL pública do "pacote" do Chromium — hospedado pelo próprio autor
// da biblioteca no GitHub. Se um dia a versão do puppeteer-core mudar
// e parar de bater com essa versão do Chromium, é só trocar essa URL
// (e a versão do @sparticuz/chromium-min no package.json) — não
// precisa mexer em mais nada.
const CHROMIUM_PACK_URL = process.env.CHROMIUM_PACK_URL
  ?? 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'

interface CorpoRequisicao {
  html:         string
  landscape?:   boolean
  nomeArquivo:  string
  pastaId:      string   // ex: "AP_123" — vira parte do caminho no Storage
  empresa_id:   number
  anexos?:      AnexoParaMesclar[]
  carimbos?:    Carimbo[]
}

function permitirCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  permitirCors(res)
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) { res.status(401).json({ error: 'Sessão do Supabase não encontrada.' }); return }

    // Cliente autenticado COMO O USUÁRIO que fez a requisição — não
    // usa service_role. As mesmas políticas de acesso (RLS) do banco
    // continuam valendo aqui, igual já valem no desktop.
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const p = req.body as CorpoRequisicao
    if (!p?.html || !p?.pastaId || !p?.empresa_id) {
      res.status(400).json({ error: 'Parâmetros obrigatórios faltando (html, pastaId, empresa_id).' })
      return
    }

    // ── 1. Abre o Chrome (sem tela) e renderiza o HTML ──────
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: chromium.headless,
    })

    let bufferDocumento: Buffer
    try {
      const page = await browser.newPage()
      await page.setContent(p.html, { waitUntil: 'networkidle0' })
      // Mesmo princípio do aguardarImagens() do Electron — garante
      // que toda imagem embutida (o carimbo, por exemplo) já
      // terminou de decodificar E de ser desenhada antes de capturar
      // o PDF, evitando o mesmo bug intermitente que já resolvemos
      // no desktop (carimbo sumindo sem erro nenhum).
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.images).map(img =>
          img.decode ? img.decode().catch(() => {}) : Promise.resolve()
        ))
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
      })
      const pdfBytes = await page.pdf({ printBackground: true, landscape: p.landscape ?? false, format: 'A4' })
      bufferDocumento = Buffer.from(pdfBytes)
    } finally {
      await browser.close()
    }

    // ── 2. Junta com os anexos, e carimba os marcados "Vai Assinatura" ──
    const documentoFinal = await PDFDocument.create()
    const pdfDocumento = await PDFDocument.load(bufferDocumento)
    const paginasDoc = await documentoFinal.copyPages(pdfDocumento, pdfDocumento.getPageIndices())
    paginasDoc.forEach(pg => documentoFinal.addPage(pg))

    if (p.anexos?.length) {
      await juntarArquivosEmPdf(supabase, documentoFinal, p.anexos, p.carimbos)
    }

    const bytesFinais = await documentoFinal.save()

    // ── 3. Sobe pro Storage ─────────────────────────────────
    const nomeSanitizado = p.nomeArquivo.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'documento'
    const remoto = `${p.empresa_id}/${p.pastaId}/${Date.now()}-${nomeSanitizado}.pdf`
    const caminhoFinal = await subirDocumentoBuffer(supabase, remoto, bytesFinais)

    res.status(200).json({ ok: true, path: caminhoFinal })
  } catch (erro) {
    console.error('Erro ao gerar PDF:', erro)
    res.status(500).json({ error: erro instanceof Error ? erro.message : 'Erro desconhecido ao gerar o PDF.' })
  }
}
