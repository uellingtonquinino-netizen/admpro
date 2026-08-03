const { spawnSync } = require('child_process')
const electron = require('electron')
const path = require('path')

const result = spawnSync(electron, [path.join(__dirname, 'generate-supabase-schema.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})

process.exit(result.status ?? 1)
