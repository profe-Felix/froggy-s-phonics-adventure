import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const EXPORT_WIDTH = 1200;

function safeParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sanitizeFileName(name) {
  return String(name || 'assessment')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function renderBasePage(page) {
  if (page?.type === 'pdf' && page.url) {
    const pdf = await pdfjsLib.getDocument(page.url).promise;
    const pdfPage = await pdf.getPage(page.pdfPage || 1);
    const viewport1 = pdfPage.getViewport({ scale: 1 });
    const scale = EXPORT_WIDTH / viewport1.width;
    const viewport = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d');
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  if (page?.type === 'image' && page.url) {
    const img = await loadImage(page.url);
    const scale = EXPORT_WIDTH / img.naturalWidth;

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH;
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.round(EXPORT_WIDTH * 1.29);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function applyStrokeStyle(ctx, s, widthScale = 1) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 2.5 * widthScale);
    ctx.globalAlpha = 0.35;
  } else if (s.tool === 'eraser_object') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 6 * widthScale);
    ctx.globalAlpha = 1;
  } else if (s.tool === 'eraser_pixel') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 1.5 * widthScale);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#dc2626';
    ctx.lineWidth = Math.max(1, (s.size || 4) * widthScale);
    ctx.globalAlpha = 1;
  }
}

function getStrokeScale(data, canvas) {
  const strokes = data?.strokes || (Array.isArray(data) ? data : []);
  const samplePt = strokes?.[0]?.pts?.[0];

  const alreadyNormalized =
    data?.normalized === true ||
    (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);

  return {
    sx: alreadyNormalized ? canvas.width : (data?.canvasWidth ? canvas.width / data.canvasWidth : canvas.width),
    sy: alreadyNormalized ? canvas.height : (data?.canvasHeight ? canvas.height / data.canvasHeight : canvas.height),
    widthScale: data?.canvasWidth && data?.canvasHeight
      ? Math.min(canvas.width / data.canvasWidth, canvas.height / data.canvasHeight)
      : 1,
  };
}

function drawStrokes(ctx, data, canvas) {
  if (!data) return;

  const strokes = data.strokes || (Array.isArray(data) ? data : []);
  const { sx, sy, widthScale } = getStrokeScale(data, canvas);

  for (const s of strokes) {
    if (!s?.pts || s.pts.length === 0) continue;

    ctx.save();
    ctx.beginPath();
    applyStrokeStyle(ctx, s, widthScale);

    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i];
      const x = p.x * sx;
      const y = p.y * sy;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

async function drawPastedImages(ctx, canvas, pastedImages) {
  for (const imgData of pastedImages || []) {
    if (!imgData?.url) continue;

    try {
      const img = await loadImage(imgData.url);
      ctx.drawImage(
        img,
        (imgData.x_pct || 0) * canvas.width,
        (imgData.y_pct || 0) * canvas.height,
        (imgData.w_pct || 0.5) * canvas.width,
        (imgData.h_pct || 0.3) * canvas.height
      );
    } catch {
      // Skip image if the browser cannot load it.
    }
  }
}

function addCanvasToPdf(pdf, canvas, isFirstPage) {
  if (!isFirstPage) {
    pdf.addPage([canvas.width, canvas.height], canvas.width > canvas.height ? 'landscape' : 'portrait');
  }

  pdf.setPage(pdf.getNumberOfPages());
  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.92),
    'JPEG',
    0,
    0,
    canvas.width,
    canvas.height
  );
}

function addTitlePage(pdf, title, subtitle, isFirstPage) {
  const w = 1200;
  const h = 800;

  if (!isFirstPage) {
    pdf.addPage([w, h], 'landscape');
  }

  pdf.setPage(pdf.getNumberOfPages());
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, w, h, 'F');

  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(42);
  pdf.text(title, 60, 120);

  pdf.setFontSize(26);
  pdf.text(subtitle, 60, 180);
}

async function renderStudentPage({ template, record, page, pageIndex }) {
  const canvas = await renderBasePage(page);
  const ctx = canvas.getContext('2d');

  const recordRaw = record?.strokes_by_page?.[String(pageIndex)];
  const templateRaw = template?.template_strokes_by_page?.[String(pageIndex)];

  const recordData = safeParse(recordRaw);
  const templateData = safeParse(templateRaw);

  // Match the on-screen behavior:
  // if the student record has page data, use that;
  // otherwise show the template base marks.
  drawStrokes(ctx, recordData || templateData, canvas);

  const pastedRaw = record?.pasted_images_by_page?.[String(pageIndex)];
  const pastedImages = safeParse(pastedRaw, []);
  await drawPastedImages(ctx, canvas, pastedImages);

  return canvas;
}

export async function exportAssessmentStudentPdf({ template, record, studentNumber }) {
  const pages = template?.pages || [];
  const title = sanitizeFileName(template?.title || 'assessment');
  const studentLabel = `Student_${studentNumber || record?.student_number || 'unknown'}`;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [1200, 1600],
    compress: true,
  });

  addTitlePage(pdf, template?.title || 'Assessment', `Student ${studentNumber || record?.student_number || ''}`, true);

  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderStudentPage({ template, record, page: pages[i], pageIndex: i });
    addCanvasToPdf(pdf, canvas, false);
  }

  pdf.save(`${title}_${studentLabel}.pdf`);
}

export async function exportAssessmentClassPdf({ template, records }) {
  const pages = template?.pages || [];
  const title = sanitizeFileName(template?.title || 'assessment');

  const sortedRecords = [...(records || [])].sort((a, b) => {
    const aa = Number(a.student_number || 0);
    const bb = Number(b.student_number || 0);
    return aa - bb;
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [1200, 1600],
    compress: true,
  });

  let firstPage = true;

  for (const record of sortedRecords) {
    addTitlePage(
      pdf,
      template?.title || 'Assessment',
      `Student ${record.student_number || ''}`,
      firstPage
    );
    firstPage = false;

    for (let i = 0; i < pages.length; i++) {
      const canvas = await renderStudentPage({ template, record, page: pages[i], pageIndex: i });
      addCanvasToPdf(pdf, canvas, false);
    }
  }

  pdf.save(`${title}_ALL_STUDENTS.pdf`);
}
