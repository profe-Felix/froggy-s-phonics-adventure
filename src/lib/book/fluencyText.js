import { bookBodyText, cleanPracticeWords } from '@/lib/literacy/dailyFluency.mjs';
import { base44 } from '@/api/base44Client';

async function readScannedBook(book) {
  if (!book.pdf_url) return { words: [], warning: `${book.title}: no readable book text yet; add text or enter words manually.` };
  const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
    file_url: book.pdf_url,
    json_schema: { type: 'object', properties: { words: { type: 'array', items: { type: 'string' },
      description: 'Transcribe only Spanish words printed in the story pages. Exclude cover, author names, publisher, copyright and credits. Do not invent, translate or add words.' } }, required: ['words'] },
  });
  if (result.status && result.status !== 'success') throw new Error('Book text extraction failed.');
  const words = cleanPracticeWords(result.output?.words || result.words || []);
  return { words, warning: words.length ? `${book.title}: OCR vocabulary is available; review it for transcription errors.`
    : `${book.title}: no readable text was found; enter practice words manually.` };
}

// Read text already stored by the book importer first. Image-only pages with
// no OCR must not silently become invented vocabulary.
export async function readFluencyBook(book) {
  const authored = bookBodyText(book);
  if (authored.trim()) return { words: cleanPracticeWords(authored), warning: '' };
  const htmlPages = (book.pages || []).filter((p, i) => Number(p.page_number ?? i + 1) > 1 && p.html_url);
  if (htmlPages.length) {
    const text = [];
    for (const page of htmlPages) {
      const response = await fetch(page.html_url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('The book text page could not load.');
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      document.querySelectorAll('script,style,nav,header,footer,title,svg,noscript').forEach(node => node.remove());
      const container = document.querySelector('[data-print-page], [id^="page"][id$="-div"]');
      // Image exports sometimes contain only the file title in the body.
      // Do not turn that title into purported reading vocabulary.
      const content = container || document.body;
      const value = content.textContent || '';
      if (value.trim() && value.trim() !== document.title.trim() &&
        !/^(?:[\wÁ-úñ ]+[-_]\d+)\s*$/.test(value.trim())) text.push(value);
    }
    const words = cleanPracticeWords(text.join('\n'));
    if (words.length) return { words, warning: '' };
  }
  if (!book.pdf_url) return { words: [], warning: `${book.title}: no readable book text yet; add words manually or import text.` };
  const { pdfjsLib } = await import('@/lib/pdfWorkerSetup');
  const task = pdfjsLib.getDocument({ url: book.pdf_url });
  const timeout = setTimeout(() => { void task.destroy(); }, 45000);
  let pdf;
  try {
    pdf = await task.promise;
    const pages = [];
    for (let number = 2; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || '').join(' ');
      if (!/(?:copyright|derechos reservados|isbn|ilustrado por|escrito por)/i.test(text)) pages.push(text);
      page.cleanup();
    }
    const words = cleanPracticeWords(pages.join('\n'));
    return words.length ? { words, warning: '' } : await readScannedBook(book);
  } finally {
    clearTimeout(timeout);
    if (pdf) await pdf.destroy(); else await task.destroy();
  }
}
