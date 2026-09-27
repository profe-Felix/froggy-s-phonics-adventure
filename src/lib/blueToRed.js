// Replaces the baked-in card frame color (blue or orange) with red (#dc2626)
// using a canvas pixel scan. Returns a cached data URL so each image is
// only processed once.
//
// Why blue worked but orange didn't: blue never appears in skin tones, so
// loose "any blue pixel" detection had zero false positives. Orange/red-orange
// overlaps with lip and cheek tones — loose detection catches skin.
//
// Strategy: sample the frame color first, then apply ONLY the matching
// detection. Blue frames use loose blue detection (safe — no false positives).
// Orange frames use tight tolerance (±15) restricted to the outer border strip
// (8%), so only the frame is touched, not interior photo content.
//
// Already-red frames (pre-processed images) are detected and skipped — no
// unnecessary reprocessing.

const cache = new Map();

export async function replaceBlueWithRed(imageUrl) {
  if (!imageUrl) return imageUrl;
  if (cache.has(imageUrl)) return cache.get(imageUrl);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

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

    if (count === 0) {
      cache.set(imageUrl, imageUrl);
      return imageUrl;
    }

    const frameR = Math.round(sr / count);
    const frameG = Math.round(sg / count);
    const frameB = Math.round(sb / count);

    // Already processed — red frame. Skip to avoid unnecessary work.
    const isRedFrame = frameR > 180 && frameG < 80 && frameB < 80;
    if (isRedFrame) {
      cache.set(imageUrl, imageUrl);
      return imageUrl;
    }

    const isBlueFrame = frameB > 120 && frameB > frameR + 40 && frameB > frameG + 20;
    const isOrangeFrame = frameR > 120 && frameR > frameB + 40 && frameG < 200;

    if (!isBlueFrame && !isOrangeFrame) {
      cache.set(imageUrl, imageUrl);
      return imageUrl;
    }

    if (isBlueFrame) {
      // BLUE FRAME: loose blue detection across the entire image.
      // Safe — blue never appears in skin/lip tones, so zero false positives.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (b > 150 && b > r + 60 && b > g + 30) {
          data[i] = 220;
          data[i + 1] = 38;
          data[i + 2] = 38;
        }
      }
    } else {
      // ORANGE FRAME: tight tolerance (±15) restricted to the outer border
      // strip (8%). The tight tolerance avoids matching lip/cheek tones;
      // the border restriction ensures interior photo content is never
      // touched even if a pixel happens to match.
      const borderW = Math.floor(w * 0.08);
      const borderH = Math.floor(h * 0.08);
      const tol = 15;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const inBorder =
            x < borderW || x >= w - borderW ||
            y < borderH || y >= h - borderH;
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
    const dataUrl = canvas.toDataURL('image/png');
    cache.set(imageUrl, dataUrl);
    return dataUrl;
  } catch {
    cache.set(imageUrl, imageUrl);
    return imageUrl;
  }
}

// Converts a canvas data URL to a Blob for file upload.
export function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}