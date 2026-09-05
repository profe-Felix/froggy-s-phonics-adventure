import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, Shuffle, Save, Users, Trash2, Printer } from 'lucide-react';
import DeskItem, { DESK_W, DESK_H } from '@/components/seating/DeskItem';
import CarpetCell from '@/components/seating/CarpetCell';

const GRID = 8;
const SNAP = 12;
const CANVAS_W = 900;
const CANVAS_H = 560;
const CARPET_ROWS = [5, 5, 6, 5, 5];
const CARPET_TOTAL = CARPET_ROWS.reduce((a, b) => a + b, 0);

function uid() { return Math.random().toString(36).slice(2, 9); }

function snap(v) { return Math.round(v / GRID) * GRID; }

export default function SeatingChart() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialClass = urlParams.get('class') || '';

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [students, setStudents] = useState([]);
  const [layout, setLayout] = useState(null);
  const [mode, setMode] = useState('desk'); // 'desk' | 'carpet'
  const [desks, setDesks] = useState([]);
  const [carpet, setCarpet] = useState([]); // [{index, student_id}]
  const [selectedDeskId, setSelectedDeskId] = useState(null);
  const [selectedCarpetIdx, setSelectedCarpetIdx] = useState(null);
  const [pickedStudentId, setPickedStudentId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  // Load classes
  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then((all) => {
      const unique = [...new Set(all.map((s) => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (!selectedClass && unique.length) setSelectedClass(unique[0]);
    });
  }, []);

  // Load students + layout for the selected class
  useEffect(() => {
    if (!selectedClass) return;
    base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }).then((all) => {
      setStudents(all);
    });
    base44.entities.SeatingLayout.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }).then((recs) => {
      const rec = recs[0];
      setLayout(rec || null);
      try { setDesks(rec?.desk_data ? JSON.parse(rec.desk_data) : []); } catch { setDesks([]); }
      try { setCarpet(rec?.carpet_data ? JSON.parse(rec.carpet_data) : []); } catch { setCarpet([]); }
      setDirty(false);
    });
    setSelectedDeskId(null);
    setSelectedCarpetIdx(null);
    setPickedStudentId(null);
  }, [selectedClass]);

  const studentMap = useMemo(() => {
    const m = {};
    students.forEach((s) => { m[s.id] = s; });
    return m;
  }, [students]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    desks.forEach((d) => { if (d.student_id) s.add(d.student_id); });
    carpet.forEach((c) => { if (c.student_id) s.add(c.student_id); });
    return s;
  }, [desks, carpet]);

  const unassigned = students.filter((s) => !assignedIds.has(s.id));

  // --- Desk interactions ---
  const addDesk = () => {
    const id = uid();
    setDesks((prev) => [...prev, { id, x: snap(CANVAS_W / 2), y: snap(CANVAS_H / 2), rotation: 0, student_id: null }]);
    setDirty(true);
  };

  const handleDeskPointerDown = (e, deskId) => {
    e.stopPropagation();
    setSelectedDeskId(deskId);
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const desk = desks.find((d) => d.id === deskId);
    dragRef.current = {
      id: deskId,
      offsetX: (e.clientX - rect.left) * scaleX - desk.x,
      offsetY: (e.clientY - rect.top) * scaleY - desk.y,
      scaleX,
      scaleY,
    };
  };

  const handleCanvasPointerMove = (e) => {
    if (!dragRef.current) return;
    const { id, offsetX, offsetY, scaleX, scaleY } = dragRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snap(Math.max(DESK_W / 2, Math.min(CANVAS_W - DESK_W / 2, (e.clientX - rect.left) * scaleX - offsetX)));
    const y = snap(Math.max(DESK_H / 2, Math.min(CANVAS_H - DESK_H / 2, (e.clientY - rect.top) * scaleY - offsetY)));
    setDesks((prev) => prev.map((d) => (d.id === id ? { ...d, x, y } : d)));
  };

  const handleCanvasPointerUp = () => {
    if (dragRef.current) { dragRef.current = null; setDirty(true); }
  };

  const rotateDesk = (id) => {
    setDesks((prev) => prev.map((d) => (d.id === id ? { ...d, rotation: (d.rotation + 90) % 360 } : d)));
    setDirty(true);
  };

  const deleteDesk = (id) => {
    setDesks((prev) => prev.filter((d) => d.id !== id));
    if (selectedDeskId === id) setSelectedDeskId(null);
    setDirty(true);
  };

  // --- Assignment (shared) ---
  const handlePickStudent = (studentId) => {
    // If a desk or carpet seat is selected, assign directly.
    if (mode === 'desk' && selectedDeskId) {
      setDesks((prev) => prev.map((d) => (d.id === selectedDeskId ? { ...d, student_id: studentId } : d)));
      setSelectedDeskId(null);
      setDirty(true);
      return;
    }
    if (mode === 'carpet' && selectedCarpetIdx != null) {
      setCarpet((prev) => prev.map((c) => (c.index === selectedCarpetIdx ? { ...c, student_id: studentId } : c)));
      setSelectedCarpetIdx(null);
      setDirty(true);
      return;
    }
    // Otherwise pick up the student to place on the next tap.
    setPickedStudentId((prev) => (prev === studentId ? null : studentId));
  };

  const handleDeskClick = (deskId) => {
    const desk = desks.find((d) => d.id === deskId);
    if (pickedStudentId) {
      setDesks((prev) => prev.map((d) => (d.id === deskId ? { ...d, student_id: pickedStudentId } : d)));
      setPickedStudentId(null);
      setDirty(true);
      return;
    }
    // If desk has a student and nothing picked, pick up that student (reassign)
    if (desk?.student_id) {
      setPickedStudentId(desk.student_id);
      setDesks((prev) => prev.map((d) => (d.id === deskId ? { ...d, student_id: null } : d)));
      setDirty(true);
      return;
    }
    setSelectedDeskId(deskId);
  };

  const handleCarpetClick = (idx) => {
    const seat = carpet.find((c) => c.index === idx);
    if (pickedStudentId) {
      setCarpet((prev) => {
        const next = prev.filter((c) => c.index !== idx);
        next.push({ index: idx, student_id: pickedStudentId });
        return next;
      });
      setPickedStudentId(null);
      setDirty(true);
      return;
    }
    if (seat?.student_id) {
      setPickedStudentId(seat.student_id);
      setCarpet((prev) => prev.filter((c) => c.index !== idx));
      setDirty(true);
      return;
    }
    setSelectedCarpetIdx(idx);
  };

  const shuffleCarpet = () => {
    const pool = [...students].sort(() => Math.random() - 0.5).slice(0, CARPET_TOTAL);
    const next = pool.map((s, i) => ({ index: i, student_id: s.id }));
    setCarpet(next);
    setDirty(true);
  };

  const clearAll = () => {
    if (mode === 'desk') setDesks((prev) => prev.map((d) => ({ ...d, student_id: null })));
    else setCarpet([]);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        class_name: selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        desk_data: JSON.stringify(desks),
        carpet_data: JSON.stringify(carpet),
      };
      if (layout?.id) {
        await base44.entities.SeatingLayout.update(layout.id, data);
      } else {
        const rec = await base44.entities.SeatingLayout.create(data);
        setLayout(rec);
      }
      setDirty(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const safeClass = String(selectedClass || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const win = window.open('', '_blank');
    const body = mode === 'desk' ? renderDeskPrint() : renderCarpetPrint();
    win.document.write(`<!DOCTYPE html><html><head><title>Seating - Class ${safeClass}</title>
      <style>
        @page { size: letter landscape; margin: 0.4in; }
        body { font-family: 'Teachers', sans-serif; color: #1e293b; }
        h1 { text-align: center; font-size: 18pt; margin-bottom: 0.2in; }
        .grid { display: grid; gap: 0.15in; }
        .cell { border: 2px solid #475569; border-radius: 8px; overflow: hidden; }
        .cell img { width: 100%; height: 100%; object-fit: cover; }
        .cell .name { text-align: center; font-weight: 700; padding: 4px; font-size: 10pt; }
      </style></head><body><h1>Class ${safeClass} — ${mode === 'desk' ? 'Desk Layout' : 'Carpet Seating'}</h1>${body}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const renderDeskPrint = () => {
    const cols = 4;
    return `<div class="grid" style="grid-template-columns: repeat(${cols}, 1fr);">${desks
      .filter((d) => d.student_id)
      .map((d) => {
        const s = studentMap[d.student_id];
        if (!s) return '';
        const img = s.photo_url ? `<img src="${s.photo_url}" />` : '';
        return `<div class="cell">${img}<div class="name">${s.name || `#${s.student_number}`}</div></div>`;
      })
      .join('')}</div>`;
  };

  const renderCarpetPrint = () => {
    const cols = CARPET_ROWS[0];
    return `<div class="grid" style="grid-template-columns: repeat(${cols}, 1fr);">${carpet
      .map((c) => {
        const s = studentMap[c.student_id];
        if (!s) return '<div class="cell"></div>';
        const img = s.photo_url ? `<img src="${s.photo_url}" />` : '';
        return `<div class="cell">${img}<div class="name">${s.name || `#${s.student_number}`}</div></div>`;
      })
      .join('')}</div>`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/StudentRoster" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🪑 Seating Chart</h1>
              <p className="text-sm text-gray-500">Drag desks or arrange carpet seats, then save and print.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white border rounded-lg overflow-hidden">
              <button onClick={() => setMode('desk')} className={`px-3 py-2 text-sm font-medium ${mode === 'desk' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}>Desk</button>
              <button onClick={() => setMode('carpet')} className={`px-3 py-2 text-sm font-medium ${mode === 'carpet' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}>Carpet</button>
            </div>
            {mode === 'desk' && (
              <button onClick={addDesk} className="flex items-center gap-1.5 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                <Plus className="w-4 h-4" /> Add desk
              </button>
            )}
            {mode === 'carpet' && (
              <button onClick={shuffleCarpet} className="flex items-center gap-1.5 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                <Shuffle className="w-4 h-4" /> Shuffle
              </button>
            )}
            <button onClick={clearAll} className="flex items-center gap-1.5 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={handleSave} disabled={!dirty || saving} className="flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {classes.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition ${selectedClass === cls ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-indigo-50'}`}
            >
              Class {cls}
            </button>
          ))}
        </div>

        {pickedStudentId && (
          <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 mb-3 text-sm text-amber-800 font-medium">
            ✋ Picked up <strong>{studentMap[pickedStudentId]?.name || `#${studentMap[pickedStudentId]?.student_number}`}</strong> — tap a {mode === 'desk' ? 'desk' : 'seat'} to place, or tap the student again to cancel.
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Canvas */}
          <div className="flex-1 min-w-0">
            {mode === 'desk' ? (
              <div
                ref={canvasRef}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onClick={() => { setSelectedDeskId(null); setPickedStudentId(null); }}
                className="relative bg-white border-2 border-slate-200 rounded-xl overflow-hidden mx-auto"
                style={{ width: '100%', maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W}/${CANVAS_H}`, backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: `${GRID * 2}px ${GRID * 2}px`, touchAction: 'none' }}
              >
                {desks.map((desk) => (
                  <div key={desk.id} onPointerDown={(e) => handleDeskPointerDown(e, desk.id)} onClick={(e) => { e.stopPropagation(); handleDeskClick(desk.id); }}>
                    <DeskItem
                      desk={desk}
                      student={desk.student_id ? studentMap[desk.student_id] : null}
                      isSelected={selectedDeskId === desk.id}
                      interactive
                      onPointerDown={(e) => handleDeskPointerDown(e, desk.id)}
                      onRotate={() => rotateDesk(desk.id)}
                      onDelete={() => deleteDesk(desk.id)}
                    />
                  </div>
                ))}
                {desks.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
                    Click "Add desk" to start arranging.
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mx-auto" style={{ maxWidth: 600 }}>
                <div className="space-y-2">
                  {CARPET_ROWS.map((rowSize, rowIdx) => (
                    <div key={rowIdx} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rowSize}, 1fr)` }}>
                      {Array.from({ length: rowSize }, (_, colIdx) => {
                        const idx = CARPET_ROWS.slice(0, rowIdx).reduce((a, b) => a + b, 0) + colIdx;
                        const seat = carpet.find((c) => c.index === idx);
                        return (
                          <CarpetCell
                            key={idx}
                            seat={seat}
                            student={seat?.student_id ? studentMap[seat.student_id] : null}
                            isSelected={selectedCarpetIdx === idx}
                            onClick={() => handleCarpetClick(idx)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Student bank */}
          <div className="lg:w-56 shrink-0">
            <div className="bg-white border rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                <Users className="w-4 h-4" /> Students ({unassigned.length} unassigned)
              </div>
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {unassigned.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Everyone is seated!</p>
                ) : (
                  unassigned.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handlePickStudent(s.id)}
                      className={`w-full flex items-center gap-2 p-1.5 rounded-lg border transition text-left ${pickedStudentId === s.id ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-transparent hover:bg-slate-50'}`}
                    >
                      {s.photo_url ? (
                        <img src={s.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">{s.student_number}</div>
                      )}
                      <span className="text-xs font-medium text-gray-700 truncate">{s.name || `#${s.student_number}`}</span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                Tap a student, then tap a {mode === 'desk' ? 'desk' : 'seat'} to seat them.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}