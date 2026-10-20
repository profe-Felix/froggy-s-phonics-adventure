import { bookBodyText, cleanPracticeWords } from '@/lib/literacy/dailyFluency.mjs';

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
      document.querySelectorAll('script,style,nav,header,footer').forEach(node => node.remove());
      text.push(document.body.textContent || '');
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
    return { words, warning: words.length ? '' : `${book.title}: the PDF contains images without readable text; enter the practice words manually.` };
  } finally {
    clearTimeout(timeout);
    if (pdf) await pdf.destroy(); else await task.destroy();
  }
}
