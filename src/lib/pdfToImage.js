// Convert the first page of a PDF file to a PNG blob using pdfjs-dist.
// Used by the Sound Wall manager so teachers can upload PDF phoneme/grapheme
// cards and get a clean image URL for display.
import { pdfjsLib } from '@/lib/pdfWorkerSetup';

export async function pdfFirstPageToPng(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at 2x for crisp display on retina screens.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Convert canvas to PNG blob.
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  return blob;
}

export function isPdfFile(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}