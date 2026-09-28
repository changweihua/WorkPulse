const Database = require('./node_modules/better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'WorkPulse', 'workpulse.db');
const db = new Database(dbPath, { readonly: true });

const row = db.prepare("SELECT value FROM settings WHERE key = 'model_config'").get();
if (row) {
  const c = JSON.parse(row.value);
  console.log('=== 向量嵌入 ===');
  console.log('当前 ID：', c.activeEmbeddingConfigId);
  (c.embeddingConfigs || []).forEach(function (e) {
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
  });
  console.log('\n=== 对话 ===');
  console.log('当前 ID：', c.activeChatConfigId);
  (c.chatConfigs || []).forEach(function (e) {
    console.log(JSON.stringify({ id: e.id, name: e.name, baseURL: e.baseURL, model: e.model }));
  });
} else {
  console.log('settings 表中未找到 model_config');
}
db.close();
