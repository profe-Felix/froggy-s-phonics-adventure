import { useEffect, useState } from "react";
import { nativeImage } from "./assets";

const rendered = new Map();
const pending = new Map();
async function renderPdfPage(item) {
  if (rendered.has(item.url)) {
    const image = rendered.get(item.url); rendered.delete(item.url); rendered.set(item.url, image); return image;
  }
  if (pending.has(item.url)) return pending.get(item.url);
  const work = (async () => {
    const { pdfjsLib } = await import("@/lib/pdfWorkerSetup");
    const task = pdfjsLib.getDocument({ url: item.url });
    let pdf;
    const canvas = document.createElement("canvas");
    try {
      pdf = await task.promise;
      if (pdf.numPages !== 1) throw new Error("V3 requires an individual PDF page. Ask your teacher to prepare this page again.");
      const page = await pdf.getPage(1), natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / natural.width) });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("This browser could not render the PDF page.");
      const image = { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
      rendered.set(item.url, image);
      while (rendered.size > 6) {
        const [old, value] = rendered.entries().next().value;
        rendered.delete(old); URL.revokeObjectURL(value.url);
      }
      return image;
    } finally { canvas.width = 0; canvas.height = 0; if (pdf) await pdf.destroy(); else await task.destroy(); }
  })();
  pending.set(item.url, work);
  try { return await work; } finally { pending.delete(item.url); }
}

export function usePageBackground(asset, page, variant = 2) {
  const item = nativeImage(asset, page);
  const [result, setResult] = useState({ key: "", image: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const key = item ? `${variant}:${item.kind || "image"}:${item.url}:${attempt}` : "";
  const retry = () => setAttempt(n => n + 1);
  useEffect(() => {
    if (!item || item.kind !== "pdf") return undefined;
    let alive = true;
    renderPdfPage(item).then(image => { if (alive) setResult({ key, image, error: "" }); },
      error => { if (alive) setResult({ key, image: null, error: error.message }); });
    return () => { alive = false; };
  }, [key]); // URLs are immutable Base44 assets.
  if (!item) return { image: null, loading: false, error: "", retry };
  if (item.kind !== "pdf") return { image: item, loading: false, error: "", retry };
  return result.key === key ? { image: result.image, loading: false, error: result.error, retry }
    : { image: null, loading: true, error: "", retry };
}
