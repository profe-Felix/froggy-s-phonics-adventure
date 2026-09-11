/**
 * Injects a temporary @page rule before printing, then cleans up after.
 *
 * CSS named pages (`page: HfwLandscape`) have unreliable browser support,
 * so this JS approach is the most reliable way to control page orientation
 * and margins for a specific print job. The injected <style> is appended
 * last in <head>, so it overrides any @page rules in the stylesheet.
 *
 * @param {string} rule — CSS for inside @page, e.g. 'size: letter landscape; margin: 0.25in'
 */
export function printWithPage(rule) {
  const style = document.createElement('style');
  style.id = 'temp-page-rule';
  style.media = 'print';
  style.textContent = `@page { ${rule} }`;
  document.head.appendChild(style);

  const cleanup = () => {
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });

  // Fallback cleanup in case afterprint doesn't fire (some browsers)
  setTimeout(() => style.remove(), 60000);

  window.print();
}