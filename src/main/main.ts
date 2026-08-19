import { app, BrowserWindow, shell, Menu } from 'electron'
import { join }                       from 'path'
import dotenv                         from 'dotenv'

// RESTAURADO: isso também tinha se perdido junto com o autoUpdater
// na correção do F12 — é o motivo real dos dados "sumindo" no
// programa instalado (mas aparecendo certinho no `npm run dev`).
// `import 'dotenv/config'` sozinho procura o .env relativo à pasta
// de onde o .exe foi aberto, que no Windows não é confiável. Em
// produção, o .env precisa estar dentro de resourcesPath (empacotado
// via extraResources no electron-builder.yml) e ser carregado de lá
// explicitamente — senão DATABASE_PROVIDER/SUPABASE_URL ficam vazios
// e o app cai pro SQLite local (vazio/desatualizado) sem avisar nada.
dotenv.config({ path: app.isPackaged ? join(process.resourcesPath, '.env') : undefined })

import { registerAllIpc }             from './ipc'
import { initDatabase }               from './database/connection'
import { autoUpdater }                from 'electron-updater'

// NOVO: remove a barra de menu nativa (File, Edit, View, Window, Help)
// — não é usada neste app e só ocupava espaço na tela.
Menu.setApplicationMenu(null)

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    // CORRIGIDO: 'hiddenInset' é uma opção específica do macOS — no
    // Windows ela deixa a janela sem barra de título e sem nenhuma
    // área definida pra arrastar (o app não tem uma barra personalizada
    // ativa pra suprir isso), o que pode ter causado a tela preta.
    // Volta pra barra de título padrão do Windows.
    backgroundColor: '#0f1117',
    webPreferences: {
      preload:          join(__dirname, '../dist-preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  // Dev vs produção
  // CORRIGIDO: o preload compila para dist-preload/ (ver tsconfig.preload.json),
  // não para preload/ — e a detecção de modo dev usava uma variável de ambiente
  // que nunca era definida em nenhum script do package.json. `app.isPackaged`
  // é a forma padrão e confiável do Electron para essa checagem.
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }

  // Abrir links externos no browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  initDatabase()
  registerAllIpc()
  createWindow()

  // RESTAURADO: código de autoatualização que sumiu do main.ts (não
  // tinha sido enviado pro GitHub, se perdeu numa correção anterior
  // que só mexeu no F12 sem querer sobrescrever isso). Confere
  // assim que o app abre; se achar uma versão nova, baixa sozinho e
  // avisa quando terminar, perguntando se quer reiniciar já pra
  // instalar (ou só na próxima vez que fechar o programa).
  // Repositório do GitHub é PÚBLICO — o autoUpdater não precisa de
  // nenhum token pra checar/baixar atualização (chegou a ser testado
  // como privado, mas voltou atrás por causa de limitações do
  // electron-updater com esse cenário — ver electron-builder.yml).
  //
  // ALTERADO: atualização 100% automática e silenciosa agora — sem
  // nenhuma pergunta ao usuário. Baixa sozinho em segundo plano e
  // instala sozinho na próxima vez que o programa for fechado
  // normalmente (mesmo comportamento do Chrome/Slack) — ninguém
  // precisa clicar em nada nem "concordar" com a atualização. Os
  // avisos de diagnóstico (checando/achou/não achou) que existiam
  // antes eram temporários só pra confirmar que estava funcionando —
  // removidos agora que já foi confirmado.
  if (app.isPackaged) {
    autoUpdater.checkForUpdates()

    autoUpdater.on('error', (erro) => {
      console.error('Erro ao verificar atualização:', erro.message)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Segurança: bloqueia navegação externa
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost')) {
      event.preventDefault()
    }
  })
})
