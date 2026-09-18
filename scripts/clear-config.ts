import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'WorkPulse', 'workpulse.db')
const db = new Database(dbPath)

// 清空 model_config
db.prepare("DELETE FROM settings WHERE key = 'model_config'").run()

// 清空相关 token（llm_token_ 前缀）
const tokenRows = db.prepare("SELECT key FROM settings WHERE key LIKE 'llm_token_%'").all() as { key: string }[]
for (const row of tokenRows) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(row.key)
}

console.log('已清空 model_config 和', tokenRows.length, '个 token 记录')
db.close()
