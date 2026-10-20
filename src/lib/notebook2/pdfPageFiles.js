import { PDFDocument } from "pdf-lib";

export async function loadPdfSource(bytes, expectedCount) {
  const source = await PDFDocument.load(bytes);
  if (source.getPageCount() !== expectedCount) throw new Error("The PDF page count changed. The source assignment was not modified.");
  return source;
}
export async function makePdfPage(source, number) {
  if (!Number.isInteger(number) || number < 1 || number > source.getPageCount()) throw new Error("Choose a valid page to split.");
  const part = await PDFDocument.create();
  const [page] = await part.copyPages(source, [number - 1]);
  part.addPage(page);
  const bytes = await part.save();
  const crop = page.getCropBox(), rotated = Math.abs(page.getRotation().angle % 180) === 90;
  return { bytes, width: rotated ? crop.height : crop.width, height: rotated ? crop.width : crop.height };
}
