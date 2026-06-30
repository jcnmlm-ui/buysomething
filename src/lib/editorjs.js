// 將 Editor.js 儲存的 JSON 轉成 HTML（與 article.html 同一套邏輯）
export function editorjsToHtml(raw) {
  if (!raw) return '<p style="color:#94a3b8;">（這篇文章還沒有內容）</p>';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (parsed === null) return String(raw).replace(/\n/g, '<br>');
  if (!Array.isArray(parsed.blocks)) return '<p style="color:#94a3b8;">（這篇文章還沒有內容）</p>';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = parsed.blocks.map((block) => {
    const d = block.data || {};
    switch (block.type) {
      case 'header': {
        const lvl = [2, 3, 4, 5, 6].includes(d.level) ? d.level : 2;
        return `<h${lvl}>${d.text || ''}</h${lvl}>`;
      }
      case 'paragraph':
        return `<p>${d.text || ''}</p>`;
      case 'list': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul';
        const items = (d.items || []).map((it) => {
          const content = (typeof it === 'string') ? it : (it && it.content) || '';
          return `<li>${content}</li>`;
        }).join('');
        return `<${tag}>${items}</${tag}>`;
      }
      case 'quote':
        return `<blockquote>${d.text || ''}${d.caption ? `<cite>— ${d.caption}</cite>` : ''}</blockquote>`;
      case 'image': {
        const url = (d.file && d.file.url) || d.url || '';
        if (!url) return '';
        const cls = d.stretched ? 'ej-image is-stretched' : 'ej-image';
        const cap = d.caption ? `<figcaption>${d.caption}</figcaption>` : '';
        return `<figure class="${cls}"><img src="${esc(url)}" alt="${esc((d.caption || '').replace(/<[^>]+>/g, ''))}" loading="lazy" decoding="async">${cap}</figure>`;
      }
      case 'delimiter':
        return '<hr>';
      case 'table': {
        const rows = (d.content || []).map((row) => {
          const cells = (row || []).map((cell) => `<td>${cell || ''}</td>`).join('');
          return `<tr>${cells}</tr>`;
        });
        const thead = rows.length > 0 && d.withHeadings ? `<thead>${rows.shift()}</thead>` : '';
        return `<table>${thead}<tbody>${rows.join('')}</tbody></table>`;
      }
      default:
        return d.text ? `<p>${d.text}</p>` : '';
    }
  }).join('\n');

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
