// Replaces blue-dominant pixels (the baked-in blue card frame) with red
// (#dc2626) using a canvas pixel scan. Returns a cached data URL so each
// image is only processed once.
//
// This is a precise color replacement — no border-width guessing, no
// overlay alignment issues, no letterboxing gaps. The blue frame becomes
// red at the pixel level, preserving all original rounded corners.

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

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Detect blue-dominant pixels (the blue card frame, ~#2ea2f7).
      // Blue must be bright and significantly higher than red and green.
      if (b > 150 && b > r + 60 && b > g + 30) {
        data[i] = 220;     // R
        data[i + 1] = 38;  // G
        data[i + 2] = 38;  // B
        // Alpha unchanged — preserves anti-aliased edges
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    cache.set(imageUrl, dataUrl);
    return dataUrl;
  } catch {
    // Canvas tainted (CORS) or image failed to load — return original
    cache.set(imageUrl, imageUrl);
    return imageUrl;
  }
}