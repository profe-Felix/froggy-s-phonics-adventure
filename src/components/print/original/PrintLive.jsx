import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import IdCard from '@/components/IdCard';
import StudentBadge from '@/components/StudentBadge';
import TableTag from '@/components/TableTag';
import MailboxLabel from '@/components/MailboxLabel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Printer, ArrowLeft, ZoomIn, ZoomOut, Loader2, AlertCircle } from 'lucide-react';

const FORMATS = {
  id: { label: 'ID Card', width: '2.3in', cols: 3, Component: IdCard },
  clever: { label: 'Clever Badge', width: '1.5in', cols: 5, Component: StudentBadge },
  tabletag: { label: 'Table Tag', width: '3.2in', cols: 2, Component: TableTag },
  mailbox: { label: 'Mailbox Label', width: '0.9in', cols: 8, Component: MailboxLabel },
};

export default function PrintLive() {
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1.4);
  const [printOnly, setPrintOnly] = useState(true);
  const [format, setFormat] = useState('id');
  const [searchParams] = useSearchParams();
  const sheet = searchParams.get('sheet') || searchParams.get('sheeturl');
  const homeroom = searchParams.get('homeroom');
  const teacher = searchParams.get('teacher');

  const load = useCallback(async () => {
    if (!sheet && !teacher) {
      setError('No sheet link or teacher in the URL.');
      setStudents([]);
      return;
    }
    setError('');
    setStudents(null);
    try {
      const res = await base44.functions.invoke('loadSheetForPrint', { sheetUrl: sheet, homeroom, teacher });
      setStudents(res.data.students || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not load the sheet.');
      setStudents([]);
    }
  }, [sheet, homeroom, teacher]);

  useEffect(() => {
    load();
  }, [load]);

  let visible = students ?? [];
  if (printOnly) visible = visible.filter((s) => s.print_flag);

  const fmt = FORMATS[format];
  const filterLabel = [teacher, homeroom].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Print Sheet</h1>
              <p className="text-xs text-muted-foreground">
                {students === null
                  ? 'Loading…'
                  : `${visible.length} of ${students.length} · ${fmt.label}${filterLabel ? ` · ${filterLabel}` : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Switch checked={printOnly} onCheckedChange={setPrintOnly} />
              Only marked
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(FORMATS).map(([key, f]) => (
                <option key={key} value={key}>{f.label}</option>
              ))}
            </select>
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(2)))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            <Button onClick={() => window.print()} disabled={!visible.length}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        </div>
      </header>

      <main className="py-8 flex justify-center">
        {students === null ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : error ? (
          <div className="text-center text-muted-foreground py-20 max-w-sm">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-destructive" />
            <p className="text-sm">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 max-w-sm">
            No students to print.
            {printOnly && ' Try turning off “Only marked”.'}
          </div>
        ) : (
          <div className="sheet-wrap" style={{ '--zoom': zoom }}>
            <div className="sheet">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${fmt.cols}, ${fmt.width})`,
                  gap: 0,
                  justifyContent: 'center',
                }}
              >
                {visible.map((s, i) => {
                  const Card = fmt.Component;
                  return <Card key={i} student={s} />;
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}