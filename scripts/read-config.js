const Database = require('./node_modules/better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'WorkPulse', 'workpulse.db');
const db = new Database(dbPath, { readonly: true });

const row = db.prepare("SELECT value FROM settings WHERE key = 'model_config'").get();
if (row) {
  const c = JSON.parse(row.value);
  console.log('=== Embedding ===');
  console.log('activeId:', c.activeEmbeddingConfigId);
  (c.embeddingConfigs || []).forEach(function(e) {
    console.log(JSON.stringify({ id: e.id, name: e.name, provider: e.provider, baseURL: e.baseURL, model: e.model, dimension: e.dimension }));
  });
  console.log('\n=== Chat ===');
  console.log('activeId:', c.activeChatConfigId);
  (c.chatConfigs || []).forEach(function(e) {
    console.log(JSON.stringify({ id: e.id, name: e.name, baseURL: e.baseURL, model: e.model }));
  });
} else {
  console.log('not found');
}
db.close();
