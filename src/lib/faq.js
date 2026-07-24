import { supabase } from './supabase.js';

// 建置環境若無法連線 Supabase（例如離線測試），用這份備援資料讓 build 不中斷。
// 實際部署（CI 有網路）時會自動換成資料庫真實 FAQ 內容。
const SAMPLE = [
  {
    id: 1,
    section: '關於郵風商品櫥窗',
    question: '這是建置備援用的範例問題，實際建置（有網路）時會自動換成 Supabase 的真實 FAQ 內容。',
    sort_order: 0,
    is_published: true,
    answer: JSON.stringify({
      blocks: [
        { type: 'paragraph', data: { text: '這是建置備援用的範例答案。' } }
      ]
    })
  }
];

export async function getFaqItems() {
  try {
    const query = supabase
      .from('faq_items')
      .select('id, section, question, answer, sort_order, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('連線逾時')), 8000));
    const { data, error } = await Promise.race([query, timeout]);
    if (error) throw error;
    return data || [];
  } catch (e) {
    // ★ CI 建置失敗即中止，避免部署出資料不完整的版本被 Google 爬到
    if (process.env.CI) throw new Error('[faq] CI 建置無法連線 Supabase：' + e.message);
    console.warn('\n[faq] 無法從 Supabase 取得資料（' + e.message + '），改用備援示意資料建置（僅限本機開發）。\n');
    return SAMPLE;
  }
}
