const { existsSync, rmSync } = require('fs')
const { join }               = require('path')

// Uso: apenas em desenvolvimento (node scripts/reset-db.js)
// NOTA: nome do arquivo corrigido para 'otimizzai.db', igual ao usado em
// src/main/database/connection.ts (o script original apagava um arquivo
// 'database.sqlite' que o app nunca cria). O import de `electron` também
// foi removido — este script roda via `node`, não via Electron, então
// `require('electron')` não retorna a API do app aqui.
const dbPath = join(
  process.env.APPDATA
    || (process.platform === 'darwin'
          ? process.env.HOME + '/Library/Application Support'
          : process.env.HOME + '/.config'),
  'otimizzai',
  'otimizzai.db'
)

if (existsSync(dbPath)) {
  rmSync(dbPath)
  console.log(`✅  Banco removido: ${dbPath}`)
} else {
  console.log(`⚠️  Banco não encontrado: ${dbPath}`)
}
