import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import CarpetCell from '@/components/seating/CarpetCell';
import { Loader2, ArrowLeft, Shuffle, Tag, Users, Plus, RefreshCw, Settings, Check, Download, Trash2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import StudentBankCard from '@/components/seating/StudentBankCard';
import { getHomeroomForClass } from '@/lib/classRotation';
import { parseName } from '@/lib/nameNormalize';

const ROW_SIZES = [5, 5, 6, 5, 5];
const GRID_SIZE = ROW_SIZES.reduce((a, b) => a + b, 0);
const GROUPS = ['A', 'B', 'C'];

export default function Carpet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [seats, setSeats] = useState(null);
  const [selectedClass, setSelectedClass] = useState(() => searchParams.get('class') || '');
  const [group, setGroup] = useState(() => {
    const requestedGroup = (searchParams.get('group') || 'A').toUpperCase();
    return GROUPS.includes(requestedGroup) ? requestedGroup : 'A';
  });
  const [viewMode, setViewMode] = useState('teaching');
  const [mode, setMode] = useState('swap');
  const [selectedCell, setSelectedCell] = useState(null);
  const [currentPartner, setCurrentPartner] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedBankStudent, setSelectedBankStudent] = useState(null);
  const [partnerIcons, setPartnerIcons] = useState([]);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sheetLinks, setSheetLinks] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedClass) next.set('class', selectedClass);
    else next.delete('class');
    next.set('group', group);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [selectedClass, group, searchParams, setSearchParams]);

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
    base44.entities.PartnerIcon.list('-created_date', 200).then(setPartnerIcons).catch(() => {});
    base44.entities.SheetLink.list('-created_date', 200).then(setSheetLinks).catch(() => {});
  }, []);

  const homeroom = getHomeroomForClass(selectedClass, group);

  const homeroomSheetLink = useMemo(
    () => sheetLinks.find(
      (l) => (l.teacher_name || '').toLowerCase() === homeroom.toLowerCase()
    ),
    [sheetLinks, homeroom]
  );

  const handleImportRoster = async () => {
    if (!homeroomSheetLink) return;
    setImporting(true);
    try {
      await base44.functions.invoke('importGoogleSheet', { sheetUrl: homeroomSheetLink.sheet_url, school_year: ACTIVE_SCHOOL_YEAR });
      const list = await base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000);
      setStudents(list);
    } catch {
      /* ignore */
    }
    setImporting(false);
  };

  const classes = useMemo(
    () =>
      students
        ? [...new Set(students.map((s) => s.class_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
        : [],
    [students]
  );

  const loadSeats = useCallback(async () => {
    if (!selectedClass || !group || !students) return;
    setSeats(null);
    setSelectedCell(null);
    const homeroom = getHomeroomForClass(selectedClass, group);
    const allSeats = await base44.entities.CarpetSeat.filter({ class_name: selectedClass, group });
    allSeats.sort((a, b) => a.position - b.position);

    if (allSeats.length < GRID_SIZE) {
      const existingPositions = new Set(allSeats.map((s) => s.position));
      const classStudents = students.filter(
        (s) => (s.class_name || '').toLowerCase() === homeroom.toLowerCase()
      );
      const newSeats = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        if (!existingPositions.has(i)) {
          newSeats.push({
            class_name: selectedClass,
            group,
            position: i,
            student_id: allSeats.length === 0 && i < classStudents.length ? classStudents[i].id : null,
            partner_label: null,
          });
        }
      }
      if (newSeats.length > 0) {
        await base44.entities.CarpetSeat.bulkCreate(newSeats);
      }
      const refreshed = await base44.entities.CarpetSeat.filter({ class_name: selectedClass, group });
      refreshed.sort((a, b) => a.position - b.position);
      setSeats(refreshed);
    } else {
      setSeats(allSeats);
    }
  }, [selectedClass, group, students]);

  useEffect(() => {
    loadSeats();
  }, [loadSeats]);

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  const sharedFirstNames = useMemo(() => {
    if (!seats) return new Set();
    const counts = {};
    seats.forEach((seat) => {
      if (!seat.student_id) return;
      const student = studentMap[seat.student_id];
      if (!student) return;
      const { first } = parseName(student.name);
      const key = (first || '').toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k));
  }, [seats, studentMap]);

  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingIcon(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const created = await base44.entities.PartnerIcon.create({
        image_url: file_url,
        label: file.name.replace(/\.[^.]+$/, ''),
      });
      setPartnerIcons((prev) => [...prev, created]);
      setCurrentPartner(file_url);
    } catch {
      /* ignore */
    }
    setUploadingIcon(false);
    e.target.value = '';
  };

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'teaching' ? 'setup' : 'teaching';
      setSelectedCell(null);
      setSelectedBankStudent(null);
      if (next === 'teaching') setMode('swap');
      return next;
    });
  };

  const handleCellClick = async (position) => {
    const seat = seats.find((s) => s.position === position);
    if (!seat) return;

    if (viewMode === 'teaching' || mode === 'swap') {
      if (viewMode === 'setup' && selectedBankStudent) {
        const newStudentId = selectedBankStudent;
        setSeats((prev) =>
          prev ? prev.map((s) => (s.position === position ? { ...s, student_id: newStudentId } : s)) : prev
        );
        setSelectedBankStudent(null);
        setSaving(true);
        try {
          await base44.entities.CarpetSeat.update(seat.id, { student_id: newStudentId });
        } catch {
          loadSeats();
        }
        setSaving(false);
        return;
      }
      if (selectedCell === null) {
        if (seat.student_id) setSelectedCell(position);
      } else if (selectedCell === position) {
        setSelectedCell(null);
      } else {
        const seatA = seats.find((s) => s.position === selectedCell);
        if (!seatA) return;
        const studentA = seatA.student_id;
        const studentB = seat.student_id;
        setSeats((prev) =>
          prev.map((s) => {
            if (s.position === selectedCell) return { ...s, student_id: studentB };
            if (s.position === position) return { ...s, student_id: studentA };
            return s;
          })
        );
        setSelectedCell(null);
        setSaving(true);
        try {
          await Promise.all([
            base44.entities.CarpetSeat.update(seatA.id, { student_id: studentB }),
            base44.entities.CarpetSeat.update(seat.id, { student_id: studentA }),
          ]);
        } catch {
          loadSeats();
        }
        setSaving(false);
      }
    } else {
      // Partners mode (setup only)
      if (!currentPartner) {
        if (!seat.partner_label) return;
        setSeats((prev) =>
          prev.map((s) => (s.position === position ? { ...s, partner_label: null } : s))
        );
        setSaving(true);
        try {
          await base44.entities.CarpetSeat.update(seat.id, { partner_label: null });
        } catch {
          loadSeats();
        }
        setSaving(false);
        return;
      }
      const newLabel = seat.partner_label === currentPartner ? null : currentPartner;
      setSeats((prev) =>
        prev.map((s) => (s.position === position ? { ...s, partner_label: newLabel } : s))
      );
      setSaving(true);
      try {
        await base44.entities.CarpetSeat.update(seat.id, { partner_label: newLabel });
      } catch {
        loadSeats();
      }
      setSaving(false);
    }
  };

  const seatedCount = seats ? seats.filter((s) => s.student_id).length : 0;

  const assignedIds = useMemo(
    () => new Set((seats || []).filter((s) => s.student_id).map((s) => s.student_id)),
    [seats]
  );
  const bankStudents = useMemo(
    () =>
      students && selectedClass
        ? students.filter(
            (s) =>
              (s.class_name || '').toLowerCase() === homeroom.toLowerCase() &&
              !assignedIds.has(s.id)
          )
        : [],
    [students, selectedClass, group, assignedIds, homeroom]
  );

  const handleReset = async () => {
    if (!window.confirm('Reset all seats? Students will return to the bank.')) return;
    setSaving(true);
    setSelectedBankStudent(null);
    setSelectedCell(null);
    setSeats((prev) => (prev ? prev.map((s) => ({ ...s, student_id: null })) : prev));
    try {
      const updates = (seats || []).map((s) => ({ id: s.id, student_id: null }));
      if (updates.length) await base44.entities.CarpetSeat.bulkUpdate(updates);
    } catch {
      loadSeats();
    }
    setSaving(false);
  };

  const handleDeleteStudent = async (studentId) => {
    const student = studentMap[studentId];
    if (!student) return;
    if (!window.confirm(`Delete ${student.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const seat = (seats || []).find((s) => s.student_id === studentId);
      if (seat) {
        await base44.entities.CarpetSeat.update(seat.id, { student_id: null });
        setSeats((prev) => (prev ? prev.map((s) => (s.id === seat.id ? { ...s, student_id: null } : s)) : prev));
      }
      await base44.entities.Student.delete(studentId);
      setStudents((prev) => (prev ? prev.filter((s) => s.id !== studentId) : prev));
      setSelectedBankStudent(null);
      setSelectedCell(null);
    } catch {
      loadSeats();
      const list = await base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000);
      setStudents(list);
    }
    setSaving(false);
  };

  const handleAutoFill = async () => {
    if (!seats || !students) return;
    const emptySeats = seats.filter((s) => !s.student_id);
    if (emptySeats.length === 0) return;
    const assignedIds = new Set(seats.filter((s) => s.student_id).map((s) => s.student_id));
    const available = students.filter(
      (s) =>
        (s.class_name || '').toLowerCase() === homeroom.toLowerCase() &&
        !assignedIds.has(s.id)
    );
    if (available.length === 0) return;
    const updates = [];
    const newSeats = [...seats];
    for (let i = 0; i < emptySeats.length && i < available.length; i++) {
      updates.push({ id: emptySeats[i].id, student_id: available[i].id });
      const idx = newSeats.findIndex((s) => s.id === emptySeats[i].id);
      if (idx >= 0) newSeats[idx] = { ...newSeats[idx], student_id: available[i].id };
    }
    setSeats(newSeats);
    setSaving(true);
    try {
      await base44.entities.CarpetSeat.bulkUpdate(updates);
    } catch {
      loadSeats();
    }
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

  const renderRow = (rowIdx) => {
    const start = ROW_SIZES.slice(0, rowIdx).reduce((a, b) => a + b, 0);
    const rowSeats = seats.slice(start, start + ROW_SIZES[rowIdx]);
    return (
      <div key={rowIdx} className="flex gap-2">
        {rowSeats.map((seat) => {
          const student = seat.student_id ? studentMap[seat.student_id] : null;
          const { first } = student ? parseName(student.name) : { first: '' };
          return (
            <CarpetCell
              key={seat.id}
              seat={seat}
              student={student}
              isSelected={selectedCell === seat.position}
              onClick={() => handleCellClick(seat.position)}
              showFullName={sharedFirstNames.has((first || '').toLowerCase())}
            />
          );
        })}
      </div>
    );
  };

  const isSetup = viewMode === 'setup';
  const selectedCellStudent = selectedCell !== null && seats
    ? studentMap[seats.find((s) => s.position === selectedCell)?.student_id]
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className={cn('mx-auto px-4 sm:px-6 py-4', isSetup ? 'max-w-5xl' : 'max-w-3xl')}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon">
                <Link to="/StudentRoster">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold">Carpet Seating</h1>
                <p className="text-xs text-muted-foreground">
                  {seats
                    ? `${seatedCount} seated · ${homeroom} homeroom`
                    : selectedClass
                      ? 'Loading…'
                      : 'Select a class to begin'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {selectedClass && isSetup && homeroomSheetLink && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleImportRoster}
                  disabled={importing}
                >
                  {importing
                    ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    : <Download className="w-4 h-4 mr-1.5" />}
                  Import {homeroom}
                </Button>
              )}
              {selectedClass && isSetup && (
                <Button size="sm" variant="outline" onClick={handleAutoFill} disabled={saving}>
                  <Users className="w-4 h-4 mr-1.5" /> Auto-fill
                </Button>
              )}
              {selectedClass && isSetup && (
                <Button size="sm" variant="outline" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Reset
                </Button>
              )}
              {selectedClass && !isSetup && (
                <Button size="sm" variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-1.5" /> Print
                </Button>
              )}
              {selectedClass && (
                <Button
                  size="sm"
                  variant={isSetup ? 'default' : 'outline'}
                  onClick={toggleViewMode}
                >
                  {isSetup
                    ? <Check className="w-4 h-4 mr-1.5" />
                    : <Settings className="w-4 h-4 mr-1.5" />}
                  {isSetup ? 'Done' : 'Setup'}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button asChild size="sm" variant="ghost" className="rounded-none">
                <Link to={`/Desk?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Desk</Link>
              </Button>
              <Button asChild size="sm" variant="default" className="rounded-none">
                <Link to={`/Carpet?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Carpet</Link>
              </Button>
            </div>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Class</span>
              {GROUPS.map((g) => {
                const h = getHomeroomForClass(selectedClass, g);
                const isCurrent = group === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors text-left',
                      isCurrent
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-accent'
                    )}
                  >
                    <div className="leading-tight">{g}</div>
                    <div className={cn('text-[10px] leading-tight', isCurrent ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {h}
                    </div>
                  </button>
                );
              })}
            </div>
            {isSetup && (
              <div className="flex items-center border rounded-md overflow-hidden ml-auto">
                <Button
                  size="sm"
                  variant={mode === 'swap' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('swap');
                    setSelectedCell(null);
                  }}
                >
                  <Shuffle className="w-4 h-4 mr-1.5" /> Swap
                </Button>
                <Button
                  size="sm"
                  variant={mode === 'partners' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('partners');
                    setSelectedCell(null);
                  }}
                >
                  <Tag className="w-4 h-4 mr-1.5" /> Partners
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 sm:px-6 py-8', isSetup ? 'max-w-5xl' : 'max-w-3xl')}>
        {!selectedClass ? (
          <div className="text-center py-20">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Select a class to load the carpet.</p>
          </div>
        ) : seats === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !isSetup ? (
          <div className="flex flex-col gap-2">
            {ROW_SIZES.map((_, rowIdx) => renderRow(rowIdx))}
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="w-48 shrink-0">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Bank ({bankStudents.length})
              </p>
              {selectedBankStudent && (
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-primary">Tap a spot to seat.</p>
                  <button
                    onClick={() => handleDeleteStudent(selectedBankStudent)}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
                {bankStudents.map((s) => (
                  <StudentBankCard
                    key={s.id}
                    student={s}
                    isSelected={selectedBankStudent === s.id}
                    onClick={() => setSelectedBankStudent(selectedBankStudent === s.id ? null : s.id)}
                  />
                ))}
                {bankStudents.length === 0 && (
                  <p className="text-xs text-muted-foreground">All students seated.</p>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {mode === 'swap' && selectedCell !== null && (
                <div className="mb-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Tap another student to swap — or tap the highlighted one to cancel.
                  </p>
                  {selectedCellStudent && (
                    <button
                      onClick={() => handleDeleteStudent(selectedCellStudent.id)}
                      className="mt-1.5 text-sm text-destructive hover:text-destructive/80 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" /> Delete {selectedCellStudent.name}
                    </button>
                  )}
                </div>
              )}
              {mode === 'partners' && (
                <>
                  <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                    <span className="text-xs text-muted-foreground shrink-0">Partner icons:</span>
                    {partnerIcons.map((icon) => (
                      <button
                        key={icon.id}
                        onClick={() => setCurrentPartner(icon.image_url)}
                        className={cn(
                          'shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 transition-all',
                          currentPartner === icon.image_url
                            ? 'border-primary ring-2 ring-primary ring-offset-1'
                            : 'border-slate-300 hover:border-slate-400'
                        )}
                      >
                        <img
                          src={icon.image_url}
                          alt={icon.label || 'partner'}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors"
                    >
                      {uploadingIcon ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      ) : (
                        <Plus className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleIconUpload}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3 text-center">
                    {currentPartner
                      ? 'Tap cells to assign the selected icon. Tap again to remove.'
                      : 'Select an icon above (or upload one), then tap cells to assign.'}
                  </p>
                </>
              )}
              <div className="flex flex-col gap-2">
                {ROW_SIZES.map((_, rowIdx) => renderRow(rowIdx))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}