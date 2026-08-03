import Database from 'better-sqlite3'
import path     from 'path'
import { app }  from 'electron'
import { runMigrations } from './migrations'

let db: Database.Database
let dbPathAtual: string

// NOVO: modo demonstração — se a variável de ambiente ADMPRO_DB_PATH
// estiver definida, usa ESSE caminho de banco em vez do padrão local
// de cada PC (permite apontar 3 computadores pro mesmo arquivo, numa
// pasta de rede, só pra uma apresentação). Sem essa variável definida
// — o caso de sempre, no dia a dia — o comportamento é EXATAMENTE o
// mesmo de antes: cada PC com seu próprio banco local em WAL.
//
// WAL não é confiável em caminho de rede (trava/corrompe com mais
// facilidade), então quando o caminho vem de ADMPRO_DB_PATH o modo
// de journal muda pra DELETE (mais lento, mas mais tolerante a
// arquivo compartilhado). busy_timeout sempre ligado — se dois
// computadores tentarem gravar no mesmo instante, um espera até 5s
// em vez de já dar erro na tela.
export function initDatabase(): void {
  const caminhoRede = process.env.ADMPRO_DB_PATH
  const dbPath = caminhoRede || path.join(app.getPath('userData'), 'otimizzai.db')
  dbPathAtual = dbPath
  db = new Database(dbPath)

  db.pragma(`journal_mode = ${caminhoRede ? 'DELETE' : 'WAL'}`)
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)
  if (caminhoRede) {
    console.log(`[DB] MODO DEMONSTRAÇÃO — conectado em caminho de rede: ${dbPath}`)
  } else {
    console.log(`[DB] Conectado em: ${dbPath}`)
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Banco não inicializado. Chame initDatabase() primeiro.')
  return db
}

// NOVO: usados pelo backup/restauração — precisam saber ONDE está o
// arquivo de verdade (pra restaurar em cima dele) e conseguir fechar
// a conexão antes de trocar o arquivo por baixo.
export function getDbPath(): string {
  return dbPathAtual
}

export function closeDatabase(): void {
  if (db) db.close()
}
