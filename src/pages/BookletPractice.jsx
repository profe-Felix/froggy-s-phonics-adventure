import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import BookletPracticeSheet from '@/components/print/BookletPracticeSheet';
import { printWithPage } from '@/lib/printWithPage';
import { useTracingGuideSettings } from '@/hooks/useTracingGuideSettings';
import TracingGuideTuner from '@/components/tracing/TracingGuideTuner';

export default function BookletPractice() {
  const [pageCount, setPageCount] = useState(4);
  const [fontSize, setFontSize] = useState(1.35);
  const [lineSize, setLineSize] = useState(0.67);
  const [offset, setOffset] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [zoom, setZoom] = useState(1);

  // Scale the 11in landscape page down to fit the viewport
  useEffect(() => {
    const updateZoom = () => {
      const available = window.innerWidth - 48;
      const pageWidthPx = 11 * 96;
      setZoom(Math.min(1, available / pageWidthPx));
    };
    updateZoom();
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, []);

  const guideHook = useTracingGuideSettings();
  const gs = guideHook.settings;

  const effFont = fontSize * scale;
  const effLine = lineSize * scale;
  const effOffset = offset * scale;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/Dashboard"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Handwriting Paper Booklet</h1>
              <p className="text-xs text-muted-foreground">Blank template — adjust scale for your students</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Pages
              <input
                type="number"
                min={1}
                max={50}
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
              />
            </label>
            <Button onClick={() => printWithPage('size: letter landscape; margin: 0.25in')}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-4 flex-wrap border-t">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Line size
            <input type="range" min={0.2} max={1.0} step={0.01} value={lineSize} onChange={(e) => setLineSize(parseFloat(e.target.value))} className="w-28" />
            <span className="w-12 tabular-nums">{lineSize.toFixed(2)}in</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Font size
            <input type="range" min={0.6} max={2.0} step={0.01} value={fontSize} onChange={(e) => setFontSize(parseFloat(e.target.value))} className="w-28" />
            <span className="w-12 tabular-nums">{fontSize.toFixed(2)}in</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Position
            <input type="range" min={-0.3} max={0.3} step={0.01} value={offset} onChange={(e) => setOffset(parseFloat(e.target.value))} className="w-28" />
            <span className="w-12 tabular-nums">{offset > 0 ? '+' : ''}{offset.toFixed(2)}in</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Scale
            <input type="range" min={0.3} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="w-28" />
            <span className="w-12 tabular-nums">{Math.round(scale * 100)}%</span>
          </label>
          <Button size="sm" variant="ghost" onClick={() => { setFontSize(1.35); setLineSize(0.67); setOffset(0); setScale(0.5); }}>Reset</Button>
        </div>
        <TracingGuideTuner {...guideHook} />
      </header>

      <main className="py-8 print:block print:py-0">
        <div>
          {pages.map((pageNum, i) => (
            <div
              key={i}
              className="booklet-zoom-container"
              style={{ '--bk-zoom': zoom, ...(i < pages.length - 1 ? { breakAfter: 'page', pageBreakAfter: 'always' } : {}) }}
            >
              <div className="booklet-scale-wrap" style={{ '--bk-zoom': zoom }}>
                <BookletPracticeSheet
                  fontSize={effFont}
                  lineSize={effLine}
                  offset={effOffset}
                  pageNumber={pageNum}
                  emojiHeightFactor={gs.emojiHeightFactor}
                  emojiFeetFactor={gs.emojiFeetFactor}
                  emojiSpacingRatio={gs.emojiSpacingRatio}
                  emojiXRatio={gs.emojiXRatio}
                  fenceGapRatio={gs.fenceGapRatio}
                  fenceWidthRatio={gs.fenceWidthRatio}
                  fenceOffsetRatio={gs.fenceOffsetRatio}
                />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}