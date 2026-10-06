import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import BookletPracticeSheet from '@/components/print/BookletPracticeSheet';
import { printWithPage } from '@/lib/printWithPage';
import { useTracingGuideSettings } from '@/hooks/useTracingGuideSettings';

export default function BookletPractice() {
  const [students, setStudents] = useState(null);
  const [mode, setMode] = useState('first');
  const [allStudents, setAllStudents] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [pageCount, setPageCount] = useState(4);
  const [fontSize, setFontSize] = useState(1.35);
  const [lineSize, setLineSize] = useState(0.67);
  const [offset, setOffset] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [searchParams] = useSearchParams();
  const classParam = searchParams.get('class') || '';

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

  const load = useCallback(async () => {
    const list = await base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 500);
    setStudents(list);
  }, []);
  useEffect(() => { load(); }, [load]);

  const classes = students
    ? [...new Set(students.map((s) => s.class_name).filter(Boolean))].sort()
    : [];

  let visible = students ?? [];
  if (classParam) visible = visible.filter((s) => s.class_name === classParam);
  if (classFilter) visible = visible.filter((s) => s.class_name === classFilter);
  visible = visible.filter((s) => (s.name || '').trim());

  useEffect(() => {
    if (classParam && !classFilter) setClassFilter(classParam);
  }, [classParam, classFilter]);

  useEffect(() => {
    if (visible.length && !visible.find((s) => s.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [students, classParam, classFilter, selectedId]);

  const selected = visible.find((s) => s.id === selectedId) || visible[0];

  const effFont = fontSize * scale;
  const effLine = lineSize * scale;
  const effOffset = offset * scale;
  const gs = guideHook.settings;

  // Build the list of (student, page) pairs to render
  const booklets = allStudents
    ? visible.flatMap((s) => Array.from({ length: pageCount }, (_, i) => ({ student: s, pageNum: i + 1 })))
    : selected
      ? Array.from({ length: pageCount }, (_, i) => ({ student: selected, pageNum: i + 1 }))
      : [];

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/StudentRoster"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Practice Booklet</h1>
              <p className="text-xs text-muted-foreground">
                {students ? `${visible.length} student${visible.length === 1 ? '' : 's'}` : 'Loading…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {classes.length > 0 && (
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={allStudents} onCheckedChange={(v) => setAllStudents(!!v)} />
              All students
            </label>
            {!allStudents && (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {visible.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <div className="flex border rounded-md overflow-hidden">
              <Button size="sm" variant={mode === 'first' ? 'default' : 'ghost'} onClick={() => setMode('first')}>
                First name
              </Button>
              <Button size="sm" variant={mode === 'firstlast' ? 'default' : 'ghost'} onClick={() => setMode('firstlast')}>
                First &amp; Last
              </Button>
            </div>
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
      </header>

      <main className="py-8 print:block print:py-0">
        {students === null ? (
          <div className="flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">No students.</div>
        ) : booklets.length === 0 ? null : (
          <div>
            {booklets.map((b, i) => (
              <div
                key={i}
                className="booklet-zoom-container"
                style={{ '--bk-zoom': zoom, ...(i < booklets.length - 1 ? { breakAfter: 'page', pageBreakAfter: 'always' } : {}) }}
              >
                <div className="booklet-scale-wrap" style={{ '--bk-zoom': zoom }}>
                  <BookletPracticeSheet
                    student={b.student}
                    mode={mode}
                    fontSize={effFont}
                    lineSize={effLine}
                    offset={effOffset}
                    pageNumber={b.pageNum}
                    totalPages={pageCount}
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
        )}
      </main>
    </div>
  );
}