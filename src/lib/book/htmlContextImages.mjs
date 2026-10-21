// SingleFile/EPUB exports often keep page artwork on a figure's CSS background,
// not in an <img>. Preserve the artwork's actual layout for OCR coordinates.
export function htmlContextImageSurfaces(doc) {
  const surfaces = [];
  for (const element of [doc.body, ...doc.body.querySelectorAll('*')]) {
    if (element.closest('.text-hidden,[hidden]')) continue;
    const style = doc.defaultView.getComputedStyle(element);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) continue;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const backgrounds = [...String(style.backgroundImage || '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g)].reverse();
    for (const match of backgrounds) {
      const url = (match[1] || match[2] || match[3] || '').trim();
      if (/^(?:data:image\/|blob:)/i.test(url)) surfaces.push({
        url, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        size: style.backgroundSize || 'auto', position: style.backgroundPosition || '0% 0%',
      });
    }
    if (element.tagName === 'IMG' && /^(?:data:image\/|blob:)/i.test(element.currentSrc || element.src || '')) {
      surfaces.push({
        url: element.currentSrc || element.src,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        fit: style.objectFit || 'fill', position: style.objectPosition || '50% 50%',
      });
    }
  }
  return surfaces;
}

const dimension = (value, extent) => value?.endsWith('%') ? parseFloat(value) / 100 * extent : parseFloat(value);
function position(value, available) {
  if (value === 'center') return available / 2;
  if (value === 'right' || value === 'bottom') return available;
  if (value === 'left' || value === 'top') return 0;
  return value?.endsWith('%') ? parseFloat(value) / 100 * available : parseFloat(value) || 0;
}

export function htmlContextImagePlacement(surface, naturalWidth, naturalHeight) {
  const { rect } = surface;
  const fit = surface.fit || surface.size;
  let width, height;
  if (fit === 'fill') { width = rect.width; height = rect.height; }
  else if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') {
    let scale = (fit === 'cover' ? Math.max : Math.min)(rect.width / naturalWidth, rect.height / naturalHeight);
    if (fit === 'scale-down') scale = Math.min(1, scale);
    width = naturalWidth * scale; height = naturalHeight * scale;
  } else {
    const [w = 'auto', h = 'auto'] = String(surface.size || 'auto').split(/\s+/);
    width = dimension(w, rect.width); height = dimension(h, rect.height);
    if (!Number.isFinite(width) && !Number.isFinite(height)) { width = naturalWidth; height = naturalHeight; }
    else if (!Number.isFinite(width)) width = height * naturalWidth / naturalHeight;
    else if (!Number.isFinite(height)) height = width * naturalHeight / naturalWidth;
  }
  const [px = '0%', py = '50%'] = String(surface.position || '0% 0%').split(/\s+/);
  return { x: rect.x + position(px, rect.width - width), y: rect.y + position(py, rect.height - height), width, height };
}
