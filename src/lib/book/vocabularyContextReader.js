import { prepareHtmlBookDocument } from '@/components/book/htmlBookDocument';
import { findVocabularyOccurrences, vocabularyContextParts, contextRectangles, createContextCursor } from './vocabularyContext.mjs';
import { htmlContextImageSurfaces, htmlContextImagePlacement } from './htmlContextImages.mjs';

const abortError = () => new DOMException('Preview closed', 'AbortError');
const timed = (promise, milliseconds, message) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
};

function pdfCharacters(content, viewport) {
  const context = document.createElement('canvas').getContext('2d');
  const chars = [];
  const space = () => { if (chars.length && chars.at(-1).ch !== ' ') chars.push({ ch: ' ' }); };
  for (const item of content.items) {
    const text = item.str || '';
    if (!text) { if (item.hasEOL) space(); continue; }
    const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const width = item.width * viewport.scale;
    const h = Math.abs(item.transform[3]) * viewport.scale || item.height * viewport.scale || 14;
    const prev = chars.at(-1);
    if (prev?.w && (Math.abs(prev.y + prev.h / 1.15 * 0.85 - baseline) > h * 0.5 ||
        x - (prev.x + prev.w) > h * 0.15)) space();
    const loaded = [...document.fonts].some(font => font.family.replace(/["']/g, '') === item.fontName && font.status === 'loaded');
    context.font = `100px ${loaded ? `"${item.fontName}"` : content.styles?.[item.fontName]?.fontFamily || 'sans-serif'}`;
    const total = context.measureText(text).width || 1;
    let previous = 0;
    for (let i = 0; i < text.length; i++) {
      const next = context.measureText(text.slice(0, i + 1)).width;
      chars.push({ ch: text[i], x: x + previous / total * width, y: baseline - h * 0.85,
        w: (next - previous) / total * width, h: h * 1.15 });
      previous = next;
    }
    if (item.hasEOL) space();
  }
  return chars;
}

async function loadImage(url, signal) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  return timed(new Promise((resolve, reject) => {
    const abort = () => { image.src = ''; reject(abortError()); };
    signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abort);
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(Error('The original page image could not load.')); };
    image.src = url;
    if (signal.aborted) abort();
  }), 30000, 'The page image took too long to load. Try again.');
}

// Lazy, occurrence-by-occurrence search. Opening a common syllable must not
// download/OCR the entire library. Nothing here writes to book/review/student data.
export function createVocabularyContextReader(item, catalog, onProgress) {
  const controller = new AbortController(), { signal } = controller;
  const byId = new Map(catalog.map(book => [book.id, book]));
  const sources = [...new Set((item.sourceBooks || []).map(book => book.id))];
  const urls = new Set(), frames = new Set();
  let pdf = null, pdfTask = null, worker = null, closed = false;
  const check = () => { if (closed || signal.aborted) throw abortError(); };
  const progress = label => { if (!closed) onProgress?.(label); };
  const imageURL = async canvas => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    check();
    if (!blob) throw Error('The original page preview could not be prepared.');
    const url = URL.createObjectURL(blob); urls.add(url); return url;
  };
  const ocr = async canvas => {
    progress('Locating printed text in this image. The first image may take longer to prepare…');
    if (!worker) {
      const pending = (async () => {
      // Only the OCR engine/language model are downloaded. Page pixels stay
      // in this browser; no paid AI call or external page upload is made.
      const module = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
      check();
      const engine = await module.default.createWorker('spa', 1, { logger: value => {
        progress(`Image text: ${value.status}${Number.isFinite(value.progress) ? ` ${Math.round(value.progress * 100)}%` : ''}`);
      } });
      if (closed) { await engine.terminate(); throw abortError(); }
      return engine;
      })();
      worker = pending;
      pending.catch(() => { if (worker === pending) worker = null; });
    }
    let result;
    try {
      const engine = await timed(worker, 90000, 'The image text reader could not load. Check the connection and retry.');
      check();
      result = await timed(engine.recognize(canvas, {}, { blocks: true }), 90000, 'Image text recognition took too long. Retry this page.');
    } catch (error) {
      worker?.then(engine => engine.terminate()).catch(() => {});
      worker = null;
      throw error;
    }
    check();
    const chars = [];
    for (const block of result.data.blocks || []) for (const paragraph of block.paragraphs || [])
      for (const line of paragraph.lines || []) for (const word of line.words || []) {
        const symbols = word.symbols?.length ? word.symbols : [{ text: word.text, bbox: word.bbox }];
        for (const symbol of symbols) {
          const { x0, y0, x1, y1 } = symbol.bbox;
          for (let i = 0; i < symbol.text.length; i++) chars.push({ ch: symbol.text[i],
            x: x0 + (x1 - x0) * i / symbol.text.length, y: y0,
            w: (x1 - x0) / symbol.text.length, h: y1 - y0 });
        }
        chars.push({ ch: ' ' });
      }
    return chars;
  };
  const htmlPage = async page => {
    const response = await timed(fetch(page.html_url, { signal }), 20000, 'The saved page took too long to download.');
    if (!response.ok) throw Error('The saved HTML page could not load.');
    const source = prepareHtmlBookDocument(await response.text());
    check();
    const frame = document.createElement('iframe');
    frames.add(frame);
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${source.width}px;height:${source.height}px;border:0;pointer-events:none`;
    frame.title = 'Measuring book context';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    try {
      await timed(new Promise((resolve, reject) => {
        frame.onload = resolve;
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
        frame.srcdoc = source.html;
        document.body.append(frame);
      }), 20000, 'The book page took too long to open.');
      const doc = frame.contentDocument;
      await timed(doc.fonts.ready, 15000, 'The page fonts could not load.');
      check();
      const chars = [], walker = doc.createTreeWalker(doc.body, doc.defaultView.NodeFilter.SHOW_TEXT);
      let node, block = null;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('style,script,noscript,.text-hidden,[hidden]')) continue;
        const current = node.parentElement.closest('p,div,li,h1,h2,h3,h4,h5,h6');
        if (block && current !== block) chars.push({ ch: '\n' });
        block = current;
        for (let i = 0; i < node.textContent.length; i++) {
          const range = doc.createRange();
          range.setStart(node, i); range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          chars.push({ ch: node.textContent[i], x: rect.x, y: rect.y, w: rect.width, h: rect.height });
        }
      }
      const nativePage = { chars, width: source.width, height: source.height, html: source.html };
      if (/\p{L}/u.test(chars.map(char => char.ch).join(''))) return nativePage;
      // Accessibility transcripts are offscreen, not printable text positions.
      // They can rule out an image-only page, but cannot provide highlight boxes.
      const transcript = [...doc.querySelectorAll('.text-hidden')].map(node => node.textContent).join('\n');
      if (transcript.trim() && !findVocabularyOccurrences(transcript, item).length) return nativePage;
      const surfaces = htmlContextImageSurfaces(doc);
      if (!surfaces.length) {
        if (page.image_url) return await imagePage(page.image_url);
        // Blank separators/front matter are valid pages, not failed occurrences.
        // Keep looking in the following pages rather than stopping the book.
        return nativePage;
      }
      const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      try {
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.scale(scale, scale);
        for (const surface of surfaces) {
          const image = await loadImage(surface.url, signal); check();
          const placement = htmlContextImagePlacement(surface, image.naturalWidth, image.naturalHeight);
          context.save();
          context.beginPath(); context.rect(surface.rect.x, surface.rect.y, surface.rect.width, surface.rect.height); context.clip();
          context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
          context.restore();
        }
        const located = await ocr(canvas);
        return { ...nativePage, chars: located.map(char => char.w ? {
          ...char, x: char.x / scale, y: char.y / scale, w: char.w / scale, h: char.h / scale,
        } : char), notice: 'Image text was located with OCR. Check it against the printed page.' };
      } finally { canvas.width = 0; canvas.height = 0; }
    } finally { frame.remove(); frames.delete(frame); }
  };
  const imagePage = async url => {
    const image = await loadImage(url, signal); check();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const chars = await ocr(canvas);
    return { chars, width: canvas.width, height: canvas.height, canvas, notice: 'Image text was located with OCR. Check it against the printed page.' };
  };
  const readPage = async (book, number) => {
    if (book.book_type === 'html' || book.pages?.some(page => page.html_url)) {
      const page = book.pages[number - 1];
      return page.html_url ? htmlPage(page) : imagePage(page.image_url);
    }
    if (book.book_type === 'images') return imagePage(book.pages[number - 1].image_url);
    const page = await pdf.getPage(number);
    try {
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1500 / Math.max(original.width, original.height)) });
      const content = await page.getTextContent();
      let chars = pdfCharacters(content, viewport);
      const text = chars.map(char => char.ch).join('');
      const imageOnly = !/\p{L}/u.test(text);
      if (!imageOnly && !findVocabularyOccurrences(text, item).length) return { chars, width: viewport.width, height: viewport.height };
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const render = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      const cancel = () => render.cancel();
      signal.addEventListener('abort', cancel, { once: true });
      try { await render.promise; } finally { signal.removeEventListener('abort', cancel); }
      check();
      chars = imageOnly ? await ocr(canvas) : pdfCharacters(content, viewport);
      return { chars, width: viewport.width, height: viewport.height, canvas,
        notice: imageOnly ? 'Image text was located with OCR. Check it against the printed page.' : '' };
    } finally { page.cleanup(); }
  };
  const cursor = createContextCursor({
    sources,
    async getPageCount(id) {
      check();
      const book = byId.get(id);
      if (!book) throw Error('A source book is no longer available. Close and refresh the bank before retrying.');
      const html = book.book_type === 'html' || book.pages?.some(page => page.html_url);
      if (!html && book.book_type !== 'images' && !pdf) {
        if (!book.pdf_url) throw Error(`${book.title} has no readable source PDF.`);
        progress(`Opening ${book.title}…`);
        const { pdfjsLib } = await import('@/lib/pdfWorkerSetup');
        check();
        pdfTask = pdfjsLib.getDocument({ url: book.pdf_url });
        try { pdf = await timed(pdfTask.promise, 45000, 'The source PDF took too long to open.'); }
        catch (error) { void pdfTask.destroy(); pdfTask = null; throw error; }
      }
      return html || book.book_type === 'images' ? (book.pages || []).length : pdf.numPages;
    },
    async readMatches(id, pageNumber) {
      const book = byId.get(id);
      progress(`Searching ${book.title} · page ${pageNumber}`);
      let page;
      try { page = await readPage(book, pageNumber); }
      catch (error) { if (error.name === 'AbortError') throw error; throw Error(`${book.title}, page ${pageNumber}: ${error.message}`); }
      check();
      const text = page.chars.map(char => char.ch).join('');
      const hits = findVocabularyOccurrences(text, item).map(hit => ({
        ...hit, rects: contextRectangles(page.chars, hit, page.width, page.height),
      })).filter(hit => hit.rects.length);
      const image = hits.length && page.canvas ? await imageURL(page.canvas) : undefined;
      const matches = hits.map(hit => ({
        bookId: book.id, bookTitle: book.title, pageNumber,
        matchedWord: hit.matchedWord, contextParts: vocabularyContextParts(text, hit),
        width: page.width, height: page.height, html: page.html, image,
        notice: page.notice, rects: hit.rects,
      }));
      if (page.canvas) { page.canvas.width = 0; page.canvas.height = 0; }
      return matches;
    },
    async onBookComplete() { await pdf?.destroy(); pdf = null; pdfTask = null; },
  });
  return {
    next: () => cursor.next(),
    dispose() {
      closed = true; cursor.dispose(); controller.abort();
      frames.forEach(frame => frame.remove());
      urls.forEach(url => URL.revokeObjectURL(url));
      worker?.then(engine => engine.terminate()).catch(() => {});
      if (pdfTask) void pdfTask.destroy();
    },
  };
}
