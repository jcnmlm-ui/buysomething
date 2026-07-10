// scripts/cleanup-stamp-designs.mjs
//
// 用途:清除 Supabase Storage 裡 stamp-designs bucket 中超過保存期限的設計檔案。
// 執行方式:由 GitHub Actions 排程觸發(見 .github/workflows/cleanup-stamp-designs.yml),
// 也可以在本機用 Node 22+ 手動測試:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/cleanup-stamp-designs.mjs
//
// ⚠️ 這裡用的是 service_role key,權限等同資料庫最高權限,絕對不能寫進前端 HTML,
// 只能放在 GitHub Secrets 裡,由 Actions 在伺服器端使用。

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'stamp-designs';
const PREFIX = 'designs/';
const RETENTION_DAYS = 30; // 後台實際保留天數(比客人端顯示的14天多留一些緩衝)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數,無法執行。');
  process.exit(1);
}

async function main() {
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      prefix: PREFIX,
      limit: 1000,
      sortBy: { column: 'created_at', order: 'asc' }
    })
  });

  if (!listRes.ok) {
    console.error('列出檔案失敗:', listRes.status, await listRes.text());
    process.exit(1);
  }

  const files = await listRes.json();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const toDelete = files
    .filter(f => f.created_at && new Date(f.created_at).getTime() < cutoff)
    .map(f => `${PREFIX}${f.name}`);

  console.log(`目前共 ${files.length} 個設計檔案,其中 ${toDelete.length} 個超過 ${RETENTION_DAYS} 天需要清除。`);

  if (toDelete.length === 0) {
    console.log('沒有需要清理的檔案,結束。');
    return;
  }

  const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ prefixes: toDelete })
  });

  if (!delRes.ok) {
    console.error('刪除失敗:', delRes.status, await delRes.text());
    process.exit(1);
  }

  console.log(`已清除 ${toDelete.length} 個超過 ${RETENTION_DAYS} 天的設計檔案:`);
  toDelete.forEach(p => console.log('  -', p));
}

main().catch(err => {
  console.error('執行過程發生未預期錯誤:', err);
  process.exit(1);
});
