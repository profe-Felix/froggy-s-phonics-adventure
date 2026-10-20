import { base44 } from "@/api/base44Client";
import { sourceKey } from "./model.mjs";

const assetEntity = variant => variant === 3 ? base44.entities.NativeNotebook3Asset : base44.entities.NativeNotebook2Asset;
export async function findNativeAsset(assignment, variant = 2) {
  const rows = await assetEntity(variant).filter({ source_key: sourceKey(assignment) }, "-updated_at", 50);
  if (!Array.isArray(rows)) throw new Error("The Base44 image library returned an unexpected response.");
  return rows.filter(r => r.source_url === assignment.pdf_url || sourceKey(assignment).startsWith("sha256:"))
    .sort((a, b) => Object.keys(b.pages || {}).length - Object.keys(a.pages || {}).length)[0] || null;
}
export function nativeImage(asset, page) {
  const item = asset?.pages?.[String(page)];
  return item?.url && item.width > 0 && item.height > 0 ? item : null;
}
export async function prepareNativeImages(assignment, progress, signal, { onlyPage } = {}) {
  // PDF.js exists only in the teacher preparation bundle. Student pages never render PDFs.
  const { pdfjsLib } = await import("@/lib/pdfWorkerSetup");
  let asset = await findNativeAsset(assignment);
  if (!asset) asset = await base44.entities.NativeNotebook2Asset.create({
    source_key: sourceKey(assignment), source_url: assignment.pdf_url, title: assignment.title,
    page_count: assignment.pdf_page_count, pages: {}, status: "preparing", updated_at: Date.now(),
  });
  const task = pdfjsLib.getDocument({ url: assignment.pdf_url });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages !== assignment.pdf_page_count) throw new Error("The PDF page count changed. The source assignment was not modified.");
    const pages = { ...asset.pages };
    const numbers = onlyPage ? [onlyPage] : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    for (const number of numbers) {
      if (!Number.isInteger(number) || number < 1 || number > pdf.numPages) throw new Error("Choose a valid page to prepare.");
      if (signal?.aborted) throw new Error("Image preparation paused. You can resume without repeating saved pages.");
      if (!nativeImage({ pages }, number)) {
        const page = await pdf.getPage(number), natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / natural.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
          if (!blob) throw new Error("This browser could not prepare the worksheet image.");
          const file = new File([blob], `notebook2-${number}.webp`, { type: blob.type });
          const result = await base44.integrations.Core.UploadFile({ file });
          if (!result.file_url) throw new Error("Base44 did not return an image URL.");
          pages[number] = { url: result.file_url, width: canvas.width, height: canvas.height };
          // One manifest update per prepared page enables safe resume after a closed browser.
          asset = await base44.entities.NativeNotebook2Asset.update(asset.id, {
            pages: { ...pages }, status: Object.keys(pages).length === pdf.numPages ? "ready" : "preparing", updated_at: Date.now(),
          });
        } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
      }
      progress({ ...asset, pages: { ...pages } }, Object.keys(pages).length, pdf.numPages);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (Object.keys(pages).length === pdf.numPages && asset.status !== "ready") asset = await base44.entities.NativeNotebook2Asset.update(asset.id, { status: "ready", updated_at: Date.now() });
    return asset;
  } finally { if (pdf) await pdf.destroy(); else await task.destroy(); }
}

// Split source PDFs without rasterizing. Students download only the requested
// single-page file; the complete original PDF is never their background URL.
export async function prepareNativePdfPages(assignment, progress, signal, { onlyPage } = {}) {
  const { loadPdfSource, makePdfPage } = await import("./pdfPageFiles");
  const response = await fetch(assignment.pdf_url, { signal });
  if (!response.ok) throw new Error("The original PDF could not be downloaded for splitting.");
  const source = await loadPdfSource(await response.arrayBuffer(), assignment.pdf_page_count);
  const total = source.getPageCount();
  if (total !== assignment.pdf_page_count) throw new Error("The PDF page count changed. The source assignment was not modified.");
  const entity = assetEntity(3);
  let asset = await findNativeAsset(assignment, 3);
  if (!asset) asset = await entity.create({ source_key: sourceKey(assignment), source_url: assignment.pdf_url,
    title: assignment.title, page_count: total, pages: {}, status: "preparing", updated_at: Date.now() });
  const pages = { ...asset.pages };
  const numbers = onlyPage ? [onlyPage] : Array.from({ length: total }, (_, i) => i + 1);
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > total) throw new Error("Choose a valid page to split.");
    if (signal?.aborted) throw new Error("PDF preparation paused. Saved pages can be resumed.");
    if (!nativeImage({ pages }, n)) {
      const { bytes, width, height } = await makePdfPage(source, n);
      const result = await base44.integrations.Core.UploadFile({ file: new File([bytes], `notebook3-page-${n}.pdf`, { type: "application/pdf" }) });
      if (!result.file_url) throw new Error("Base44 did not return a PDF page URL.");
      pages[n] = { kind: "pdf", url: result.file_url, width, height, bytes: bytes.length };
      asset = await entity.update(asset.id, { pages: { ...pages },
        status: Object.keys(pages).length === total ? "ready" : "preparing", updated_at: Date.now() });
    }
    progress({ ...asset, pages: { ...pages } }, Object.keys(pages).length, total);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return asset;
}
