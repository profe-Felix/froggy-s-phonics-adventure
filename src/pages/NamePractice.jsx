import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import NamePracticeSheet from '@/components/print/NamePracticeSheet';

export default function NamePractice() {
  const [students, setStudents] = useState(null);
  const [mode, setMode] = useState('first');
  const [allStudents, setAllStudents] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [fontSize, setFontSize] = useState(() => parseFloat(localStorage.getItem('np3.fontSize')) || 1.35);
  const [lineSize, setLineSize] = useState(() => parseFloat(localStorage.getItem('np3.lineSize')) || 0.67);
  const [offset, setOffset] = useState(() => parseFloat(localStorage.getItem('np3.offset')) || 0);
  const [scale, setScale] = useState(() => parseFloat(localStorage.getItem('np3.scale')) || 1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const settingIdRef = useRef(null);

  // Load global settings (shared across all teachers)
  useEffect(() => {
    (async () => {
      try {
        const recs = await base44.entities.NamePracticeSetting.list('-created_date');
        let rec = recs[0];
        if (!rec) {
          rec = await base44.entities.NamePracticeSetting.create({ settings: { fontSize: 1.35, lineSize: 0.67, offset: 0, scale: 1 } });
        }
        settingIdRef.current = rec.id;
        const s = rec.settings;
        if (s) {
          if (typeof s.fontSize === 'number') setFontSize(s.fontSize);
          if (typeof s.lineSize === 'number') setLineSize(s.lineSize);
          if (typeof s.offset === 'number') setOffset(s.offset);
          if (typeof s.scale === 'number') setScale(s.scale);
        }
      } catch { /* keep local defaults */ }
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => { if (settingsLoaded) localStorage.setItem('np3.fontSize', String(fontSize)); }, [fontSize, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) localStorage.setItem('np3.lineSize', String(lineSize)); }, [lineSize, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) localStorage.setItem('np3.offset', String(offset)); }, [offset, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) localStorage.setItem('np3.scale', String(scale)); }, [scale, settingsLoaded]);

  // Debounced save to global settings
  useEffect(() => {
    if (!settingsLoaded || !settingIdRef.current) return;
    const t = setTimeout(() => {
      base44.entities.NamePracticeSetting.update(settingIdRef.current, { settings: { fontSize, lineSize, offset, scale } }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [fontSize, lineSize, offset, scale, settingsLoaded]);

  const [searchParams] = useSearchParams();
  const classParam = searchParams.get('class') || '';

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

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/StudentRoster"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Name Practice</h1>
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
            <div className="flex border rounded-md overflow-hidden">
              <Button size="sm" variant={mode === 'first' ? 'default' : 'ghost'} onClick={() => setMode('first')}>
                First name
              </Button>
              <Button size="sm" variant={mode === 'firstlast' ? 'default' : 'ghost'} onClick={() => setMode('firstlast')}>
                First &amp; Last
              </Button>
            </div>
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
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
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
              <input type="range" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="w-28" />
              <span className="w-12 tabular-nums">{Math.round(scale * 100)}%</span>
            </label>
            <Button size="sm" variant="ghost" onClick={() => { setFontSize(1.35); setLineSize(0.67); setOffset(0); setScale(1); }}>Reset</Button>
          </div>
        </div>
      </header>

      <main className="py-8 flex justify-center print:block print:py-0">
        {students === null ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : visible.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">No students.</div>
        ) : allStudents ? (
          <div>
            {visible.map((s, i) => (
              <div
                key={s.id}
                style={i < visible.length - 1 ? { breakAfter: 'page', pageBreakAfter: 'always' } : undefined}
              >
                <NamePracticeSheet student={s} mode={mode} fontSize={effFont} lineSize={effLine} offset={effOffset} />
              </div>
            ))}
          </div>
        ) : selected ? (
          <NamePracticeSheet student={selected} mode={mode} fontSize={effFont} lineSize={effLine} offset={effOffset} />
        ) : null}
      </main>
    </div>
  );
}