import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import CarpetCell from '@/components/seating/CarpetCell';
import StudentBankCard from '@/components/seating/StudentBankCard';
import { getHomeroomForClass } from '@/lib/classRotation';
import { Loader2, ArrowLeft, Shuffle, Users, RefreshCw, Trash2, Printer, Tag } from 'lucide-react';

const ROW_SIZES = [5, 5, 6, 5, 5];
const GRID_SIZE = ROW_SIZES.reduce((a, b) => a + b, 0);
const GROUPS = ['A', 'B', 'C'];

export default function Carpet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [seats, setSeats] = useState(null);
  const [selectedClass, setSelectedClass] = useState(() => searchParams.get('class') || '');
  const [group, setGroup] = useState(() => {
    const g = (searchParams.get('group') || 'A').toUpperCase();
    return GROUPS.includes(g) ? g : 'A';
  });
  const [viewMode, setViewMode] = useState('teaching');
  const [mode, setMode] = useState('swap');
  const [selectedCell, setSelectedCell] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedBankStudent, setSelectedBankStudent] = useState(null);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedClass) next.set('class', selectedClass);
    else next.delete('class');
    next.set('group', group);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [selectedClass, group, searchParams, setSearchParams]);

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
  }, []);

  const classes = useMemo(
    () => students ? [...new Set(students.map((s) => s.class_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [],
    [students]
  );

  const homeroom = getHomeroomForClass(selectedClass, group);

  const loadSeats = useCallback(async () => {
    if (!selectedClass || !group || !students) return;
    setSeats(null);
    setSelectedCell(null);
    const allSeats = await base44.entities.CarpetSeat.filter({ class_name: selectedClass, group });
    allSeats.sort((a, b) => a.position - b.position);

    if (allSeats.length < GRID_SIZE) {
      const existingPositions = new Set(allSeats.map((s) => s.position));
      const classStudents = students.filter((s) => (s.class_name || '').toLowerCase() === homeroom.toLowerCase());
      const newSeats = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        if (!existingPositions.has(i)) {
          newSeats.push({
            class_name: selectedClass, group, position: i,
            student_id: allSeats.length === 0 && i < classStudents.length ? classStudents[i].id : null,
            partner_label: null,
          });
        }
      }
      if (newSeats.length > 0) await base44.entities.CarpetSeat.bulkCreate(newSeats);
      const refreshed = await base44.entities.CarpetSeat.filter({ class_name: selectedClass, group });
      refreshed.sort((a, b) => a.position - b.position);
      setSeats(refreshed);
    } else {
      setSeats(allSeats);
    }
  }, [selectedClass, group, students, homeroom]);

  useEffect(() => { loadSeats(); }, [loadSeats]);

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  const assignedIds = useMemo(
    () => new Set((seats || []).filter((s) => s.student_id).map((s) => s.student_id)),
    [seats]
  );

  const bankStudents = useMemo(
    () => students && selectedClass
      ? students.filter((s) => (s.class_name || '').toLowerCase() === homeroom.toLowerCase() && !assignedIds.has(s.id))
      : [],
    [students, selectedClass, group, assignedIds, homeroom]
  );

  const handleCellClick = async (seat) => {
    if (mode === 'swap') {
      if (selectedCell === null) {
        if (seat.student_id) setSelectedCell(seat.position);
      } else if (selectedCell === seat.position) {
        setSelectedCell(null);
      } else {
        const source = (seats || []).find((s) => s.position === selectedCell);
        const sourceStudent = source?.student_id || null;
        const targetStudent = seat.student_id || null;
        const updated = (seats || []).map((s) => {
          if (s.position === selectedCell) return { ...s, student_id: targetStudent };
          if (s.position === seat.position) return { ...s, student_id: sourceStudent };
          return s;
        });
        setSeats(updated);
        setSelectedCell(null);
        setSaving(true);
        try {
          await base44.entities.CarpetSeat.update(source.id, { student_id: targetStudent });
          if (targetStudent) await base44.entities.CarpetSeat.update(seat.id, { student_id: sourceStudent });
          else await base44.entities.CarpetSeat.update(seat.id, { student_id: sourceStudent });
        } catch { loadSeats(); }
        setSaving(false);
      }
    } else if (mode === 'assign') {
      if (selectedBankStudent) {
        const updated = (seats || []).map((s) => s.position === seat.position ? { ...s, student_id: selectedBankStudent } : s);
        setSeats(updated);
        setSelectedBankStudent(null);
        setSaving(true);
        try { await base44.entities.CarpetSeat.update(seat.id, { student_id: selectedBankStudent }); } catch { loadSeats(); }
        setSaving(false);
      } else if (seat.student_id) {
        const updated = (seats || []).map((s) => s.position === seat.position ? { ...s, student_id: null } : s);
        setSeats(updated);
        setSaving(true);
        try { await base44.entities.CarpetSeat.update(seat.id, { student_id: null }); } catch { loadSeats(); }
        setSaving(false);
      }
    }
  };

  const handleShuffle = async () => {
    if (!seats) return;
    const pool = [...students.filter((s) => (s.class_name || '').toLowerCase() === homeroom.toLowerCase())];
    pool.sort(() => Math.random() - 0.5);
    const updates = seats.map((s, i) => ({ id: s.id, student_id: i < pool.length ? pool[i].id : null }));
    setSeats(seats.map((s, i) => ({ ...s, student_id: i < pool.length ? pool[i].id : null })));
    setSaving(true);
    try { await base44.entities.CarpetSeat.bulkUpdate(updates); } catch { loadSeats(); }
    setSaving(false);
  };

  const handleClear = async () => {
    if (!seats) return;
    setSeats(seats.map((s) => ({ ...s, student_id: null })));
    setSaving(true);
    try {
      const updates = seats.map((s) => ({ id: s.id, student_id: null }));
      await base44.entities.CarpetSeat.bulkUpdate(updates);
    } catch { loadSeats(); }
    setSaving(false);
  };

  const handlePrint = () => {
    const safe = String(selectedClass || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cols = ROW_SIZES[0];
    const cards = (seats || []).map((c) => {
      const s = c.student_id ? studentMap[c.student_id] : null;
      if (!s) return '<div class="cell"></div>';
      const img = s.photo_url ? `<img src="${s.photo_url}" />` : '';
      return `<div class="cell">${img}<div class="name">${s.name || `#${s.student_number}`}</div></div>`;
    }).join('');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Carpet - Class ${safe} (Group ${group})</title>
      <style>@page{size:letter;margin:0.4in;}body{font-family:'Teachers',sans-serif;color:#1e293b;}
      h1{text-align:center;font-size:18pt;margin-bottom:0.2in;}
      .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:0.15in;}
      .cell{border:2px solid #475569;border-radius:8px;overflow:hidden;text-align:center;}
      .cell img{width:100%;height:1.4in;object-fit:cover;}
      .cell .name{font-weight:700;padding:4px;font-size:10pt;}</style></head>
      <body><h1>Class ${safe} — Group ${group} Carpet</h1><div class="grid">${cards}</div></body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  if (!students) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon"><Link to="/StudentRoster"><ArrowLeft className="w-4 h-4" /></Link></Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Carpet Seating</h1>
              <p className="text-xs text-muted-foreground">{selectedClass ? `Class ${selectedClass} · Group ${group}` : 'Select a class'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Select class…</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex bg-white border rounded-md overflow-hidden">
              {GROUPS.map((g) => (
                <button key={g} onClick={() => setGroup(g)} className={`px-3 py-2 text-sm font-medium ${group === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{g}</button>
              ))}
            </div>
            <div className="flex bg-white border rounded-md overflow-hidden">
              <button onClick={() => setMode('swap')} className={`px-3 py-2 text-sm font-medium ${mode === 'swap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Swap</button>
              <button onClick={() => setMode('assign')} className={`px-3 py-2 text-sm font-medium ${mode === 'assign' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Assign</button>
            </div>
            <Button size="sm" variant="outline" onClick={handleShuffle}><Shuffle className="w-4 h-4 mr-1" /> Shuffle</Button>
            <Button size="sm" variant="outline" onClick={handleClear}><Trash2 className="w-4 h-4 mr-1" /> Clear</Button>
            <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 flex gap-4">
        {selectedClass && (
          <div className="w-56 shrink-0">
            <div className="bg-white border rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                <Users className="w-4 h-4" /> Students ({bankStudents.length})
              </div>
              {mode === 'assign' && (
                <p className="text-xs text-muted-foreground mb-2">Tap a student, then tap a seat.</p>
              )}
              <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
                {bankStudents.map((s) => (
                  <StudentBankCard key={s.id} student={s} isSelected={selectedBankStudent === s.id}
                    onClick={() => setSelectedBankStudent(selectedBankStudent === s.id ? null : s.id)} />
                ))}
                {bankStudents.length === 0 && <p className="text-xs text-muted-foreground">All students seated.</p>}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1">
          {seats && (
            <div className="bg-white border rounded-lg p-4">
              <div className="space-y-2">
                {ROW_SIZES.map((rowSize, rowIdx) => (
                  <div key={rowIdx} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rowSize}, 1fr)` }}>
                    {Array.from({ length: rowSize }, (_, colIdx) => {
                      const idx = ROW_SIZES.slice(0, rowIdx).reduce((a, b) => a + b, 0) + colIdx;
                      const seat = seats.find((s) => s.position === idx);
                      return (
                        <CarpetCell key={idx} seat={seat} student={seat?.student_id ? studentMap[seat.student_id] : null}
                          isSelected={selectedCell === idx} onClick={() => seat && handleCellClick(seat)} showFullName />
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {mode === 'swap'
                  ? 'Tap a seated spot, then tap another to swap.'
                  : selectedBankStudent
                    ? 'Tap a seat to place the selected student.'
                    : 'Tap a seated spot to unseat.'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}