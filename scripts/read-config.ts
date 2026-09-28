import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'WorkPulse', 'workpulse.db');
const db = new Database(dbPath, { readonly: true });

const row = db.prepare("SELECT value FROM settings WHERE key = 'model_config'").get() as
  | { value: string }
  | undefined;
if (row) {
  const c = JSON.parse(row.value);
  console.log('=== 向量嵌入 ===');
  console.log('当前 ID：', c.activeEmbeddingConfigId);
  for (const e of c.embeddingConfigs || []) {
    console.log(
      JSON.stringify({
        id: e.id,
        name: e.name,
        provider: e.provider,
        baseURL: e.baseURL,
        model: e.model,
        dimension: e.dimension,
      }),
    );
  }
  console.log('\n=== 对话 ===');
  console.log('当前 ID：', c.activeChatConfigId);
  for (const e of c.chatConfigs || []) {
    console.log(JSON.stringify({ id: e.id, name: e.name, baseURL: e.baseURL, model: e.model }));
  }
} else {
  console.log('settings 表中未找到 model_config');
}
db.close();
