import { pdfjsLib } from '@/lib/pdfWorkerSetup';

export default async function notebookPdfSource(url) {
  const controller = new AbortController();
  // Legacy public-file links redirect on GET but return 404 on HEAD.
  // Use their direct public media path so HEAD and byte ranges both work,
  // without starting a full-workbook download just to resolve a redirect.
  const sourceUrl = url.replace(
    /^https:\/\/base44\.app\/api\/apps\/[^/]+\/files\/mp\/public\//,
    'https://media.base44.com/files/public/'
  );
  let resolvedUrl = sourceUrl;
  let length = 0;
  try {
    const head = await fetch(sourceUrl, { signal: controller.signal, method: 'HEAD' });
    if (head.ok) {
      resolvedUrl = head.url || sourceUrl;
      length = Number(head.headers.get('content-length')) || 0;
    }
  } catch (e) {
    if (controller.signal.aborted) throw e;
  }
  if (!length) {
    // HEAD rejected — fall back to a cancelled GET probe
    const probe = await fetch(sourceUrl, { signal: controller.signal });
    if (!probe.ok) throw Object.assign(new Error('Workbook download interrupted'), { status: probe.status });
    resolvedUrl = probe.url || sourceUrl;
    length = Number(probe.headers.get('content-length'));
    if (!length) return { source: { data: new Uint8Array(await probe.arrayBuffer()) }, failure: new Promise(() => {}), abort: () => controller.abort() };
    await probe.body?.cancel();
  }
  const read = async (begin, end) => {
    const response = await fetch(resolvedUrl, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error('Workbook download interrupted'), { status: response.status });
    return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  const initial = await read(0, Math.min(length, 65536));
  if (initial.status !== 206) return { source: { data: initial.bytes }, failure: new Promise(() => {}), abort: () => controller.abort() };
  let reject;
  const failure = new Promise((_, fail) => { reject = fail; });
  // The file server supports ranges but does not expose Accept-Ranges to
  // browsers. Explicit transport avoids PDF.js falling back to the full book.
  class WorkbookRanges extends pdfjsLib.PDFDataRangeTransport {
    constructor() { super(length, initial.bytes, true); }
    requestDataRange(begin, end) {
      const load = async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const part = await read(begin, end);
            if (part.status !== 206) throw new Error('Workbook range response changed');
            this.onDataRange(begin, part.bytes);
            return;
          } catch (error) {
            if (controller.signal.aborted || attempt >= 2 || (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status))) throw error;
            await new Promise(resolve => setTimeout(resolve, 1500 * 2 ** attempt + Math.random() * 1000));
          }
        }
      };
      void load().catch(reject);
    }
    abort() { controller.abort(); }
  }
  return { source: { range: new WorkbookRanges() }, failure, abort: () => controller.abort() };
}