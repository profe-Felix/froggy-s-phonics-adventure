import { pdfjsLib } from '@/lib/pdfWorkerSetup';

export default async function notebookPdfSource(url) {
  const controller = new AbortController();
  // Some public file routes reject HEAD. Read just the GET headers, then
  // cancel its body before requesting the small ranges PDF.js actually needs.
  const probe = await fetch(url, { signal: controller.signal });
  if (!probe.ok) throw Object.assign(new Error('Workbook download interrupted'), { status: probe.status });
  const length = Number(probe.headers.get('content-length'));
  if (!length) return { source: { data: new Uint8Array(await probe.arrayBuffer()) }, failure: new Promise(() => {}), abort: () => controller.abort() };
  await probe.body?.cancel();
  const read = async (begin, end) => {
    const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal: controller.signal });
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