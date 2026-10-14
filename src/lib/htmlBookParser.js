/**
 * Parses SingleFile-saved HTML pages (.htm, .html, .xhtml) for import as
 * online books.
 *
 * Safety: DOMParser does NOT execute scripts. A sandboxed iframe with
 * allow-same-origin (but NOT allow-scripts) is used only to measure word
 * span positions. Scripts and event handlers are stripped before any
 * rendering. External resources (link[rel=stylesheet], iframe, object,
 * embed) are removed; only self-contained data: URLs remain.
 */

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'br', 'tr', 'blockquote', 'section', 'article',
]);

function stripUnsafeContent(doc) {
  doc.querySelectorAll(
    'script, link[rel="stylesheet"], iframe, object, embed, noscript'
  ).forEach((el) => el.remove());

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
  });
}

function detectPageNumber(doc) {
  const pageEl = doc.querySelector('[data-print-page]');
  if (pageEl) {
    const n = parseInt(pageEl.getAttribute('data-print-page'), 10);
    if (n > 0) return n;
  }

  const idEl = doc.querySelector('[id^="page"][id$="-div"]');
  if (idEl) {
    const m = idEl.id.match(/^page(\d+)-div$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0) return n;
    }
  }

  return null;
}

function findPageContainer(doc) {
  return (
    doc.querySelector('[data-print-page]') ||
    doc.querySelector('[id^="page"][id$="-div"]') ||
    doc.body
  );
}

function findEmbeddedImage(doc) {
  const img = doc.querySelector('img[src^="data:"]');
  return img ? img.getAttribute('src') : null;
}

function extractText(container) {
  let text = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (BLOCK_TAGS.has(tag)) text += '\n';
    for (const child of node.childNodes) walk(child);
    if (BLOCK_TAGS.has(tag) && tag !== 'br') text += '\n';
  };
  walk(container);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Renders sanitized HTML in a sandboxed iframe (no allow-scripts) to measure
 * word span positions. Resolves with normalized word positions (0-1 relative
 * to the page container). Times out after 8s with empty positions.
 */
function extractWordPositions(sanitizedHtml) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:absolute;left:-9999px;top:0;width:1024px;height:1536px;border:0;visibility:hidden;pointer-events:none;';
    iframe.setAttribute('sandbox', 'allow-same-origin');

    const blob = new Blob([sanitizedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      iframe.remove();
      resolve(result);
    };

    const timeout = setTimeout(() => finish({ words: [] }), 8000);

    iframe.onload = () => {
      try {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) {
          finish({ words: [] });
          return;
        }

        const container = findPageContainer(iframeDoc);
        const containerRect = container.getBoundingClientRect();

        if (containerRect.width === 0 || containerRect.height === 0) {
          finish({ words: [] });
          return;
        }

        const wordSpans = iframeDoc.querySelectorAll('[id^="word"]');
        const words = [];
        for (const span of wordSpans) {
          const rect = span.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          words.push({
            text: span.textContent || '',
            x: (rect.left - containerRect.left) / containerRect.width,
            y: (rect.top - containerRect.top) / containerRect.height,
            w: rect.width / containerRect.width,
            h: rect.height / containerRect.height,
          });
        }

        finish({ words });
      } catch {
        finish({ words: [] });
      }
    };

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

/**
 * Parses one SingleFile HTML page. Returns:
 *  - pageNumber: detected page number, or null
 *  - imageSrc: data: URL of the embedded page image, or null
 *  - imageBlob: Blob of the page image for upload, or null
 *  - text: visible text in reading order (paragraphs preserved)
 *  - words: [{text, x, y, w, h}] normalized 0-1, or [] if positions unavailable
 *  - fileName: original file name
 *  - file: original File object (kept for source upload)
 *  - error: string if parsing failed (pageNumber null + no image is not an error;
 *    only thrown for unreadable files)
 */
export async function parseHtmlPage(file) {
  let htmlString;
  try {
    htmlString = await file.text();
  } catch {
    throw new Error(`Could not read "${file.name}"`);
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(htmlString, 'text/html');
  } catch {
    throw new Error(`Could not parse "${file.name}" as HTML`);
  }

  stripUnsafeContent(doc);

  const pageNumber = detectPageNumber(doc);
  const imageSrc = findEmbeddedImage(doc);

  let imageBlob = null;
  if (imageSrc) {
    try {
      imageBlob = dataUrlToBlob(imageSrc);
    } catch {
      /* invalid data URL — imageBlob stays null */
    }
  }

  const container = findPageContainer(doc);
  const text = extractText(container);

  const sanitizedHtml = doc.documentElement.outerHTML;
  const { words } = await extractWordPositions(sanitizedHtml);

  return {
    pageNumber,
    imageSrc,
    imageBlob,
    text,
    words,
    fileName: file.name,
    file,
  };
}