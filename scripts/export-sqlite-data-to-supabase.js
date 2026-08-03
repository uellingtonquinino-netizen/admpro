/*
 * Converte um backup SQLite do Otimizzai em INSERTs PostgreSQL para o Supabase.
 * Uso via npm: npm run supabase:export-data -- "C:\\caminho\\backup.db"
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const sourcePath = process.argv[2]
if (!sourcePath) throw new Error('Informe o caminho do backup .db após --.')
if (!fs.existsSync(sourcePath)) throw new Error(`Backup não encontrado: ${sourcePath}`)

function identifier(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function value(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('O backup contém um número inválido.')
    return String(value)
  }
  if (Buffer.isBuffer(value)) return `decode('${value.toString('base64')}', 'base64')`
  return `'${String(value).replace(/'/g, "''")}'`
}

function references(sql) {
  return [...sql.matchAll(/REFERENCES\s+["`[]?([\w]+)/gi)].map(match => match[1])
}

function sortTables(tables) {
  const pending = new Map(tables.map(table => [table.name, table]))
  const ordered = []
  while (pending.size) {
    const next = [...pending.values()].find(table => references(table.sql).every(ref => !pending.has(ref)))
    const table = next || pending.values().next().value
    ordered.push(table)
    pending.delete(table.name)
  }
  return ordered
}

const db = new Database(sourcePath, { readonly: true, fileMustExist: true })
try {
  const tables = db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'migrations'
    ORDER BY rowid
  `).all()
  if (!tables.some(table => table.name === 'empresas') || !tables.some(table => table.name === 'usuarios')) {
    throw new Error('O arquivo não parece ser um backup completo do Otimizzai.')
  }

  const statements = [
    '-- Gerado localmente. Contém dados confidenciais: não versionar nem compartilhar.',
    'begin;',
  ]

  for (const table of sortTables(tables)) {
    const columns = db.prepare(`PRAGMA table_info(${identifier(table.name)})`).all().map(column => column.name)
    const rows = db.prepare(`SELECT * FROM ${identifier(table.name)}`).all()
    if (!rows.length) continue

    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = rows.slice(offset, offset + 250)
      const tuples = batch.map(row => `(${columns.map(column => value(row[column])).join(', ')})`)
      statements.push(
        `insert into public.${identifier(table.name)} (${columns.map(identifier).join(', ')}) values\n${tuples.join(',\n')}\non conflict do nothing;`
      )
    }

    if (columns.includes('id')) {
      const tableLiteral = `public.${table.name}`.replace(/'/g, "''")
      statements.push(
        `select setval(pg_get_serial_sequence('${tableLiteral}', 'id'), coalesce((select max(id) from public.${identifier(table.name)}), 1), (select count(*) > 0 from public.${identifier(table.name)}));`
      )
    }
  }
  statements.push('commit;', '')

  const outputDir = path.join(__dirname, '..', 'supabase', 'imports')
  fs.mkdirSync(outputDir, { recursive: true })
  const output = path.join(outputDir, 'dados-iniciais.sql')
  fs.writeFileSync(output, statements.join('\n\n'), 'utf8')
  console.log(`Importação criada em ${output}`)
} finally {
  db.close()
}
