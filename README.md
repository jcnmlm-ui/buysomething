# 郵風快訊 — Astro 靜態化前台（SEO 階段二）

把部落格從「純前端載入」改成 **Astro 靜態化生成（SSG）**：每篇文章在建置時就產生完整的靜態 HTML（含內容、`<title>`、Open Graph、JSON-LD），所以 **Google 與 LINE／FB 不用執行 JS 就能讀到完整內容**，社群分享也會有正確的標題與縮圖。

> 你現在寫好的文章**完全不用重做**。文章資料一樣存在 Supabase 的 `articles` 表，後台 `admin.html` 也照舊使用——這個專案只是換掉「前台顯示」這一層。

---

## 這個專案做了什麼

| 路徑 | 來源 | 說明 |
|---|---|---|
| `/blog` | Astro 產生 | 文章列表（取代舊的 `blog.html`） |
| `/article/<id>` | Astro 產生 | 單篇文章（取代舊的 `article.html?id=`） |
| `/`（首頁商品櫥窗） | `public/index.html` | 維持你原本的靜態檔（已補上 OG／canonical） |
| `/admin.html` | `public/admin.html` | 後台，維持原樣，已設 `noindex` |
| `/sitemap-index.xml` | 自動產生 | 含首頁與所有文章 |
| `/robots.txt` | `public/robots.txt` | 已擋掉後台 |

**沒有改動**：寫文章的方式（仍用 `admin.html`）、Supabase 資料、首頁商品查詢功能。

---

## 一、需求

- Node.js 18 以上（建議 20 或 22）

## 二、本機開發 / 建置

```bash
npm install        # 第一次先安裝
npm run dev        # 本機預覽 http://localhost:4321
npm run build      # 產生靜態檔到 dist/
npm run preview    # 預覽 build 後的結果
```

> 建置時若看到「改用備援示意資料」的訊息，代表當下沒連到 Supabase（例如離線）。只要建置環境能連網，就會自動換成資料庫的真實文章。

## 三、設定（只改一個檔）

打開 `astro.config.mjs`：

```js
site: 'https://kspost08.tw',   // ← 換成你的正式網域
base: '/',                     // ← 自訂網域用 '/'；GitHub Pages 專案頁（網址含 /khpostgoods/）改成 '/khpostgoods/'
```

同步把 `public/robots.txt` 內的網域、以及 `public/index.html` 的 `canonical`／`og:url` 一併確認成同一個網域。

> ⚠️ 你目前 `index.html` 原本的 canonical 寫的是舊的 `jcnmlm-ui.github.io/khpostgoods/`，但實際站台看起來在 `kspost08.tw`。本專案已統一成 `kspost08.tw`。若你的正式網域其實是 github.io 子路徑，請把上面三處都改回去，並把 `base` 設成 `'/khpostgoods/'`。

## 四、部署到 GitHub Pages（已內建自動化）

1. 把整個專案推上 GitHub repo（main 分支）。
2. repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
3. 之後每次 push 會自動建置部署；`.github/workflows/deploy.yml` 也設了：
   - **每 6 小時自動重建一次** → 讓「新文章」與「排程到期的文章」自動上線。
   - 可在 Actions 頁面手動觸發（workflow_dispatch）。

> 想要「發文後立刻上線」而不是等 6 小時？可在 Supabase 設一個 Database Webhook，於 `articles` 變動時呼叫 GitHub 的 `repository_dispatch` API 觸發重建（進階，需要一組 GitHub Token）。

（若你不是用 GitHub Pages，而是手動上傳到別的主機：本機跑 `npm run build`，把 `dist/` 整個資料夾的內容上傳即可。）

## 五、排程功能提醒

排程上架需要 `articles` 表有 `publish_at` 欄位。若還沒加，到 Supabase SQL Editor 執行一次：

```sql
alter table articles add column if not exists publish_at timestamptz;
```

本前台會自動隱藏「尚未到時間」的排程文章（時間到、且下次重建後就會出現）。

## 六、網址變化（重要）

- 新網址：`/blog`、`/article/<id>`（更乾淨、對 SEO 更好）。
- 舊網址 `blog.html`、`article.html?id=` 會被取代。你可以：
  - 直接停用舊檔；或
  - 保留舊檔做轉址（GitHub Pages 靜態環境無法對 query string 轉址，建議改放一段 JS 轉址，或日後改用 slug 網址 + 301）。

## 七、檔案結構

```
astro.config.mjs            設定（site / base / sitemap）
src/
  lib/
    supabase.js             Supabase 連線（anon key）
    editorjs.js             Editor.js JSON → HTML / 純文字（與舊前台同一套）
    articles.js             建置時抓已發布文章（含離線備援）
  layouts/Base.astro        共用版型 + 星露谷風格 CSS + 所有 SEO meta
  pages/
    blog/index.astro        文章列表
    article/[id].astro      單篇文章（getStaticPaths 為每篇產生頁面）
public/
  index.html                首頁商品櫥窗（原樣 + OG/canonical）
  admin.html                後台（noindex）
  robots.txt
.github/workflows/deploy.yml  自動建置部署
```

## 八、之後可再做（階段三）

- 語意化網址（`/article/<slug>`）+ 從舊 `?id=` 做 301。
- 文章底部「相關文章」、麵包屑（BreadcrumbList）。
- 把首頁商品櫥窗也一起 Astro 化（目前維持原本的即時查詢即可）。

---

## 附註：自訂網域 CNAME

`public/CNAME` 內已預填 `kspost08.tw`，GitHub Pages 用自訂網域時需要它。
- 若你用的是別的自訂網域 → 改成你的網域。
- 若你不用自訂網域、直接用 `xxx.github.io/khpostgoods/` → 請**刪除 `public/CNAME`**，並把 `astro.config.mjs` 的 `base` 改成 `'/khpostgoods/'`、`site` 改成 `'https://你的帳號.github.io'`。

---

## 從現有 repo（jcnmlm-ui/khpostgoods）搬移的對照

`public/` 內已備妥：index.html、admin.html、robots.txt、CNAME，以及 blog.html / article.html（**轉址檔**，讓舊連結自動導到 /blog、/article/<id>，請勿用舊檔覆蓋）。

你還需要把現有 repo 的這些檔案複製進 `public/`：
- `images/`（整個資料夾，商品圖會用到）
- `favicon.png`
- `faq.html`
- `googleba6a2a296edfa433.html`（Google 驗證檔，務必保留在根目錄）
- `index2.html`（若還需要）
- `admin3.html`（你實際在用的後台；請確認它是最新版）

**不要**搬進來：舊的 `sitemap.xml`（Astro 會自動產生 `sitemap-index.xml`）。
`後端程式碼` 這個檔不用放進 public/（不需公開），留在 repo 當紀錄即可。
