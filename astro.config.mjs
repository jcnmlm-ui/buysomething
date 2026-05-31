import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ─────────────────────────────────────────────────────────────
//  ★ 部署設定（只改這裡）
//  - 自訂網域（例如 kspost08.tw，網址在根目錄）：site 改成你的網域、base 維持 '/'
//  - GitHub Pages 專案頁（網址含 /khpostgoods/）：base 改成 '/khpostgoods/'
// ─────────────────────────────────────────────────────────────
export default defineConfig({
  site: 'https://kspost08.tw',
  base: '/',
  integrations: [
    sitemap({
      // 把不是 Astro 產生的靜態頁（首頁商品櫥窗）也加進 sitemap
      customPages: ['https://kspost08.tw/'],
    }),
  ],
});
