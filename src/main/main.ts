import 'dotenv/config'
import { app, BrowserWindow, shell, Menu } from 'electron'
import { join }                       from 'path'
import { registerAllIpc }             from './ipc'
import { initDatabase }               from './database/connection'

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
