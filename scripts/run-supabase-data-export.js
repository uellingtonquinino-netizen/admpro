const { spawnSync } = require('child_process')
const electron = require('electron')
const path = require('path')

const result = spawnSync(electron, [path.join(__dirname, 'export-sqlite-data-to-supabase.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
process.exit(result.status ?? 1)
