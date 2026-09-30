// Bundles the PDF.js worker locally via Vite's ?url import so it's served
// from the app's own domain instead of cdnjs.cloudflare.com — critical for
// school networks where CDN access is slow or blocked.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };