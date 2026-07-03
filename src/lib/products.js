import { supabase } from './supabase.js';

// 建置環境若無法連線 Supabase（例如離線測試），用這份備援資料讓 build 不中斷。
// 實際部署（CI 有網路）時會自動換成資料庫真實商品。
const SAMPLE = [{
  product_key: 'SAMPLE001',
  name: '範例商品：波波鴿存摺造型聚寶袋',
  price: 60,
  img_url: '',
  thumb_url: '',
  kh_intro: '這是建置備援用的範例商品，實際建置（有網路）時會自動換成 Supabase 的真實資料。',
  kh_added_at: '2026-05-31T00:00:00Z',
}];

export async function getKhLimitedProducts() {
  try {
    const query = supabase
      .from('products_master')
      .select('product_key, name, price, img_url, thumb_url, description, kh_intro, kh_added_at, kh_article_id, kh_sort_order')
      .eq('is_kh_limited', true)
      .order('kh_sort_order', { ascending: true, nullsFirst: false })
      .order('kh_added_at', { ascending: false, nullsFirst: false });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('連線逾時')), 8000));
    const { data, error } = await Promise.race([query, timeout]);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('\n[kh-limited] 無法從 Supabase 取得資料（' + e.message + '），改用備援示意資料建置。部署時請確認 CI 可連線 Supabase。\n');
    return SAMPLE;
  }
}
