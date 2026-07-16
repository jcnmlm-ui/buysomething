import { supabase } from './supabase.js';

// 建置環境若無法連線 Supabase（例如離線測試），用這份備援資料讓 build 不中斷。
// 實際部署（CI 有網路）時會自動換成資料庫真實文章。
const SAMPLE = [{
  id: 1,
  title: '範例文章：如何使用郵風櫥窗？',
  is_published: true,
  publish_at: null,
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
  cover_url: '',
  content: JSON.stringify({
    blocks: [
      { type: 'header', data: { text: '如何使用郵風櫥窗？', level: 2 } },
      { type: 'paragraph', data: { text: '這是建置備援用的<b>範例內容</b>。實際建置（有網路）時會自動換成 Supabase 的真實文章。' } },
      { type: 'list', data: { style: 'ordered', items: ['先選擇所在地區', '輸入商品名稱搜尋', '找到離你最近的郵局'] } }
    ]
  })
}];

function isLive(a) {
  return a.is_published && (!a.publish_at || new Date(a.publish_at) <= new Date());
}

export async function getPublishedArticles() {
  try {
    const query = supabase.from('articles').select('*').eq('is_published', true).order('created_at', { ascending: false });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('連線逾時')), 8000));
    const { data, error } = await Promise.race([query, timeout]);
    if (error) throw error;
    return (data || []).filter(isLive);
  } catch (e) {
    // ★ CI（GitHub Actions）連不上 Supabase 時直接讓建置失敗，
    //   保留上一版正常的網站，避免部署出「所有文章都變 404」的版本被 Google 爬到。
    if (process.env.CI) throw new Error('[articles] CI 建置無法連線 Supabase：' + e.message);
    console.warn('\n[articles] 無法從 Supabase 取得資料（' + e.message + '），改用備援示意資料建置（僅限本機開發）。\n');
    return SAMPLE.filter(isLive);
  }
}
