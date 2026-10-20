import { base44 } from "@/api/base44Client";
import { sourceKey } from "./model.mjs";

export async function findNativeAsset(assignment) {
  const rows = await base44.entities.NativeNotebook2Asset.filter({ source_key: sourceKey(assignment) }, "-updated_at", 50);
  if (!Array.isArray(rows)) throw new Error("The Base44 image library returned an unexpected response.");
  return rows.filter(r => r.source_url === assignment.pdf_url || sourceKey(assignment).startsWith("sha256:"))
    .sort((a, b) => Object.keys(b.pages || {}).length - Object.keys(a.pages || {}).length)[0] || null;
}
export function nativeImage(asset, page) {
  const item = asset?.pages?.[String(page)];
  return item?.url && item.width > 0 && item.height > 0 ? item : null;
}
export async function prepareNativeImages(assignment, progress, signal) {
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
    for (let number = 1; number <= pdf.numPages; number++) {
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
            pages: { ...pages }, status: number === pdf.numPages ? "ready" : "preparing", updated_at: Date.now(),
          });
        } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
      }
      progress({ ...asset, pages: { ...pages } }, number, pdf.numPages);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (asset.status !== "ready") asset = await base44.entities.NativeNotebook2Asset.update(asset.id, { status: "ready", updated_at: Date.now() });
    return asset;
  } finally { if (pdf) await pdf.destroy(); else await task.destroy(); }
}
