// 將 Editor.js 儲存的 JSON 轉成 HTML（與 article.html 同一套邏輯）
export function editorjsToHtml(raw) {
  if (!raw) return '<p style="color:#94a3b8;">（這篇文章還沒有內容）</p>';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (parsed === null) return String(raw).replace(/\n/g, '<br>');
  if (!Array.isArray(parsed.blocks)) return '<p style="color:#94a3b8;">（這篇文章還沒有內容）</p>';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = (() => {
    // 第一輪：把每個 block 轉成 token（一般內容 or 圖片列組件）
    const tokens = [];
    parsed.blocks.forEach((block) => {
      const d = block.data || {};
      switch (block.type) {
        case 'header': {
          const lvl = [2, 3, 4, 5, 6].includes(d.level) ? d.level : 2;
          tokens.push({ kind: 'html', html: `<h${lvl}>${d.text || ''}</h${lvl}>` });
          break;
        }
        case 'paragraph':
          tokens.push({ kind: 'html', html: `<p>${d.text || ''}</p>` });
          break;
        case 'list': {
          const tag = d.style === 'ordered' ? 'ol' : 'ul';
          const items = (d.items || []).map((it) => {
            const content = (typeof it === 'string') ? it : (it && it.content) || '';
            return `<li>${content}</li>`;
          }).join('');
          tokens.push({ kind: 'html', html: `<${tag}>${items}</${tag}>` });
          break;
        }
        case 'quote':
          tokens.push({ kind: 'html', html: `<blockquote>${d.text || ''}${d.caption ? `<cite>— ${d.caption}</cite>` : ''}</blockquote>` });
          break;
        case 'image': {
          const url = (d.file && d.file.url) || d.url || '';
          if (!url) break;
          const layout = (block.tunes && block.tunes.imageLayout) || {};
          let width = parseInt(layout.width, 10);
          if (isNaN(width)) width = 100;
          width = Math.max(10, Math.min(100, width));
          const wantsRow = layout.float === 'left' && width < 100;
          const classes = ['ej-image'];
          if (d.stretched) classes.push('is-stretched');
          const cap = d.caption ? `<figcaption>${d.caption}</figcaption>` : '';
          const imgTag = `<img src="${esc(url)}" alt="${esc((d.caption || '').replace(/<[^>]+>/g, ''))}" loading="lazy" decoding="async">`;
          if (wantsRow) {
            // ★ 並排圖片：用 flex 比例分配寬度，不會因為百分比加總超過 100% 而跑版
            const style = ` style="flex:${width} ${width} 0%;"`;
            tokens.push({ kind: 'row-item', html: `<figure class="${classes.join(' ')}"${style}>${imgTag}${cap}</figure>` });
          } else {
            if (width !== 100) classes.push('has-pct');
            const style = width !== 100 ? ` style="width:${width}%;"` : '';
            tokens.push({ kind: 'html', html: `<figure class="${classes.join(' ')}"${style}>${imgTag}${cap}</figure>` });
          }
          break;
        }
        case 'delimiter':
          tokens.push({ kind: 'html', html: '<hr>' });
          break;
        case 'table': {
          const rows = (d.content || []).map((row) => {
            const cells = (row || []).map((cell) => `<td>${cell || ''}</td>`).join('');
            return `<tr>${cells}</tr>`;
          });
          const thead = rows.length > 0 && d.withHeadings ? `<thead>${rows.shift()}</thead>` : '';
          tokens.push({ kind: 'html', html: `<table>${thead}<tbody>${rows.join('')}</tbody></table>` });
          break;
        }
        default:
          if (d.text) tokens.push({ kind: 'html', html: `<p>${d.text}</p>` });
      }
    });

    // 第二輪：把連續的 row-item 圖片包進同一個 flex 容器，形成並排列
    const parts = [];
    let buffer = [];
    const flushBuffer = () => {
      if (buffer.length) {
        parts.push(`<div class="ej-image-row">${buffer.join('')}</div>`);
        buffer = [];
      }
    };
    tokens.forEach((t) => {
      if (t.kind === 'row-item') {
        buffer.push(t.html);
      } else {
        flushBuffer();
        parts.push(t.html);
      }
    });
    flushBuffer();

    return parts.filter(Boolean).join('\n');
  })();

  return html || '<p style="color:#94a3b8;">（這篇文章還沒有內容）</p>';
}

// 取純文字（用於摘要 / description）
export function editorjsToPlainText(raw) {
  if (!raw) return '';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (parsed === null) return String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!Array.isArray(parsed.blocks)) return '';
  let text = '';
  parsed.blocks.forEach((b) => {
    const d = b.data || {};
    if (d.text) text += d.text + ' ';
    if (Array.isArray(d.items)) d.items.forEach((it) => { text += ((typeof it === 'string') ? it : (it && it.content) || '') + ' '; });
    if (d.caption) text += d.caption + ' ';
  });
  return text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
