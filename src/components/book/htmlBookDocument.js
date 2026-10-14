import { normalizeSpanish } from '@/lib/literacy/lessonProgression';

// Keep the saved page's CSS, embedded fonts, background images and text together.
// The output is rendered only inside a script-disabled, sandboxed frame.
export function prepareHtmlBookDocument(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script, noscript, iframe, frame, frameset, object, embed, base, link, meta[http-equiv]').forEach(el => el.remove());
  for (const el of doc.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      if (/^on/i.test(name) || ['srcdoc', 'srcset', 'action', 'formaction'].includes(name) ||
          (['href', 'xlink:href'].includes(name) && !value.startsWith('#')) ||
          (name === 'src' && !/^data:/i.test(value))) el.removeAttribute(name);
    }
  }
  const viewport = doc.querySelector('meta[name="viewport"]')?.content || '';
  const css = [...doc.querySelectorAll('style')].map(el => el.textContent).join('\n');
  const bodyCss = doc.body.getAttribute('style') || (css.match(/body\s*\{([^}]+)\}/i)?.[1] || '');
  const width = Number(viewport.match(/\bwidth\s*=\s*(\d+)/i)?.[1] || bodyCss.match(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1]) || 1024;
  const height = Number(viewport.match(/\bheight\s*=\s*(\d+)/i)?.[1] || bodyCss.match(/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1]) || 1536;
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline' data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.prepend(policy);
  const style = doc.createElement('style');
  style.textContent = `html{margin:0!important;padding:0!important;width:${width}px!important;height:${height}px!important;overflow:hidden!important}body{margin:0!important}*{user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important}`;
  doc.head.append(style);
  return { html: `${doc.doctype ? '<!doctype html>' : ''}${doc.documentElement.outerHTML}`, width, height };
}

// Measure the actual laid-out text rather than using positions relative to an
// unrelated extracted image. Ranges preserve the source's typography/layout.
export function getHtmlWordHighlights(doc, width, height, knownWords) {
  if (!doc?.body || !knownWords?.size) return [];
  const highlights = [];
  const walker = doc.createTreeWalker(doc.body, doc.defaultView.NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('style, script, noscript, .text-hidden, [hidden]')) continue;
    for (const match of node.textContent.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)) {
      if (!knownWords.has(normalizeSpanish(match[0]))) continue;
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > width + 1 || rect.bottom > height + 1) continue;
        highlights.push({ x: rect.left / width, y: rect.top / height, w: rect.width / width, h: rect.height / height });
      }
    }
  }
  return highlights;
}