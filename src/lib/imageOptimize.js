// Image optimization for Sound Wall cards.
// Resizes to maxEdge on the longest side (without enlarging), optionally
// applies blue→red frame replacement, and converts to WebP at high quality.
// This fixes the #1 bottleneck: ~100MB phone photos displayed at 320px.

const MAX_EDGE = 1200;
const WEBP_QUALITY = 0.85;

// Load an Image from a URL (with CORS) or a File/Blob.
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = (e) => {
      if (typeof source !== 'string') URL.revokeObjectURL(img.src);
      reject(new Error('Image load failed'));
    };
    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
}

// Apply blue→red or orange→red frame replacement on an existing canvas context.
// Extracted from blueToRed.js so both the old and new flows share the same logic.
function replaceFrameOnCanvas(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample the frame color from edge midpoints (3% in from each edge).
  const samplePoints = [
    [Math.floor(w * 0.5), Math.floor(h * 0.03)],
    [Math.floor(w * 0.5), Math.floor(h * 0.97)],
    [Math.floor(w * 0.03), Math.floor(h * 0.5)],
    [Math.floor(w * 0.97), Math.floor(h * 0.5)],
  ];

  let sr = 0, sg = 0, sb = 0, count = 0;
  for (const [sx, sy] of samplePoints) {
    const si = (sy * w + sx) * 4;
    const r = data[si], g = data[si + 1], b = data[si + 2];
    if (r > 240 && g > 240 && b > 240) continue;
    if (r < 30 && g < 30 && b < 30) continue;
    sr += r; sg += g; sb += b; count++;
  }

  if (count === 0) return false; // no frame detected

  const frameR = Math.round(sr / count);
  const frameG = Math.round(sg / count);
  const frameB = Math.round(sb / count);

  // Already red — skip.
  if (frameR > 180 && frameG < 80 && frameB < 80) return false;

  const isBlueFrame = frameB > 120 && frameB > frameR + 40 && frameB > frameG + 20;
  const isOrangeFrame = frameR > 120 && frameR > frameB + 40 && frameG < 200;

  if (!isBlueFrame && !isOrangeFrame) return false;

  if (isBlueFrame) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (b > 150 && b > r + 60 && b > g + 30) {
        data[i] = 220;
        data[i + 1] = 38;
        data[i + 2] = 38;
      }
    }
  } else {
    const borderW = Math.floor(w * 0.08);
    const borderH = Math.floor(h * 0.08);
    const tol = 15;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inBorder = x < borderW || x >= w - borderW || y < borderH || y >= h - borderH;
        if (!inBorder) continue;
        const i = (y * w + x) * 4;
        if (
          Math.abs(data[i] - frameR) <= tol &&
          Math.abs(data[i + 1] - frameG) <= tol &&
          Math.abs(data[i + 2] - frameB) <= tol
        ) {
          data[i] = 220;
          data[i + 1] = 38;
          data[i + 2] = 38;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return true; // frame was replaced
}

// Resize + optionally process frame + convert to WebP blob.
// source: URL string | File | Blob
// options: { maxEdge, quality, replaceFrame }
// Returns: { blob, width, height, frameReplaced }
export async function optimizeImage(source, { maxEdge = MAX_EDGE, quality = WEBP_QUALITY, replaceFrame = true } = {}) {
  const img = await loadImage(source);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const effectiveMax = Math.min(maxEdge, longest); // don't enlarge
  const scale = effectiveMax / longest;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  let frameReplaced = false;
  if (replaceFrame) {
    frameReplaced = replaceFrameOnCanvas(ctx, w, h);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('WebP conversion failed'))),
      'image/webp',
      quality
    );
  });

  return { blob, width: w, height: h, frameReplaced };
}

// Check if a URL's image is already optimized (small enough + right format).
// Uses a HEAD request for content-length/type, and also checks the URL
// extension for .webp (since some servers return inconsistent content types
// on HEAD). Returns: { needsOptimization, contentLength, contentType, sizeKB }
export async function checkImageNeedsOptimization(url, { maxEdge = MAX_EDGE, maxSizeKB = 500 } = {}) {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    const contentType = resp.headers.get('content-type') || '';
    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
    const sizeKB = Math.round(contentLength / 1024);
    const isWebpUrl = url.toLowerCase().includes('.webp');

    // Already optimized if: URL is .webp AND size is under limit.
    // Also skip if HEAD says webp with small size (redundant but safe).
    if (isWebpUrl && sizeKB > 0 && sizeKB <= maxSizeKB) {
      return { needsOptimization: false, contentLength, contentType, sizeKB };
    }
    if (contentType.includes('webp') && sizeKB > 0 && sizeKB <= maxSizeKB) {
      return { needsOptimization: false, contentLength, contentType, sizeKB };
    }

    // Over size limit or wrong format — needs optimization.
    return { needsOptimization: true, contentLength, contentType, sizeKB };
  } catch {
    // HEAD failed — can't determine size, err on side of optimizing.
    return { needsOptimization: true, contentLength: 0, contentType: '', sizeKB: 0, error: true };
  }
}