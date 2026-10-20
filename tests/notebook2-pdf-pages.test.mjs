import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { loadPdfSource, makePdfPage } from "../src/lib/notebook2/pdfPageFiles.js";

test("V3 produces independent PDF pages, preserves crop/rotation, leaves the source intact", async () => {
  const original = await PDFDocument.create();
  original.addPage([612, 792]).drawText("First worksheet");
  const second = original.addPage([500, 700]);
  second.setCropBox(20, 30, 400, 600); second.setRotation(degrees(90)); second.drawText("Second worksheet");
  const bytes = await original.save(), source = await loadPdfSource(bytes, 2);
  const first = await makePdfPage(source, 1), last = await makePdfPage(source, 2);
  assert.equal((await PDFDocument.load(first.bytes)).getPageCount(), 1);
  const result = await PDFDocument.load(last.bytes);
  assert.equal(result.getPageCount(), 1);
  assert.equal(result.getPage(0).getRotation().angle, 90);
  assert.deepEqual({ width: last.width, height: last.height }, { width: 600, height: 400 });
  assert.equal(source.getPageCount(), 2);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  await assert.rejects(() => loadPdfSource(bytes, 4), /page count changed/);
  await assert.rejects(() => makePdfPage(source, 0), /valid page/);
});
