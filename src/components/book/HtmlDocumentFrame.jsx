import { useRef } from 'react';
import useHtmlPageLayout from '@/components/book/useHtmlPageLayout';

export default function HtmlDocumentFrame({ sourceDocument, pageNumber, highlightWords, alignSelf }) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const layout = useHtmlPageLayout(containerRef, iframeRef, sourceDocument, highlightWords);
  const justify = alignSelf === 'flex-start' ? 'justify-start' : alignSelf === 'flex-end' ? 'justify-end' : 'justify-center';
  return (
    <div ref={containerRef} className={`relative flex h-full w-full items-center overflow-hidden bg-background ${justify}`} data-html-page-state={layout.loaded ? 'ready' : 'loading'}>
      <div className="relative shrink-0 overflow-hidden" style={{ width: layout.width, height: layout.height }}>
        <iframe
          ref={iframeRef}
          title={`Book page ${pageNumber}`}
          srcDoc={sourceDocument.html}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={layout.handleLoad}
          tabIndex={-1}
          className="absolute left-0 top-0 origin-top-left border-0 pointer-events-none"
          style={{ width: sourceDocument.width, height: sourceDocument.height, transform: `scale(${layout.scale})` }}
        />
        {layout.highlights.map((rect, index) => (
          <mark key={index} aria-hidden="true" className="pointer-events-none absolute opacity-40 mix-blend-multiply" style={{ left: rect.x * layout.width, top: rect.y * layout.height, width: rect.w * layout.width, height: rect.h * layout.height }} />
        ))}
      </div>
      {!layout.loaded && <p role="status" className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">Opening saved page…</p>}
    </div>
  );
}