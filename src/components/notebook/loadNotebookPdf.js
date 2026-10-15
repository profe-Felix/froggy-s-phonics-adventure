import { pdfjsLib } from '@/lib/pdfWorkerSetup';
import notebookPdfSource from '@/components/notebook/notebookPdfSource';

const documents = new Map();

export default function loadNotebookPdf(url) {
  if (!documents.has(url)) {
    const load = async () => {
      for (let attempt = 0; ; attempt += 1) {
        let task, abort;
        try {
          const input = await notebookPdfSource(url);
          abort = input.abort;
          task = pdfjsLib.getDocument({ ...input.source, withCredentials: false, disableAutoFetch: true, disableStream: true });
          return await Promise.race([task.promise, input.failure]);
        } catch (error) {
          abort?.();
          await task?.destroy();
          if (attempt >= 2 || (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status))) throw error;
          await new Promise(resolve => setTimeout(resolve, 1500 * 2 ** attempt + Math.random() * 1000));
        }
      }
    };
    documents.set(url, load().catch(error => { documents.delete(url); throw error; }));
  }
  return documents.get(url);
}