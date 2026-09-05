import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import DeskItem, { DESK_W, DESK_H } from '@/components/seating/DeskItem';
import DeskLandmarkItem from '@/components/seating/DeskLandmarkItem';
import StudentBankCard from '@/components/seating/StudentBankCard';
import { getHomeroomForClass } from '@/lib/classRotation';
import { Loader2, ArrowLeft, Plus, RefreshCw, Users, Pencil, Copy, ClipboardPaste, Check, Trash2, Printer, LayoutGrid } from 'lucide-react';

const GROUPS = ['A', 'B', 'C'];
const GRID_SIZE = 8;
const SNAP_THRESHOLD = 12;
const CANVAS_W = 900;
const CANVAS_H = 600;

function getHalfDims(rotation) {
  return rotation % 180 === 0
    ? { hw: DESK_W / 2, hh: DESK_H / 2 }
    : { hw: DESK_H / 2, hh: DESK_W / 2 };
}

function snapPosition(desk, allDesks) {
  let { x, y } = desk;
  x = Math.round(x / GRID_SIZE) * GRID_SIZE;
  y = Math.round(y / GRID_SIZE) * GRID_SIZE;

  const { hw, hh } = getHalfDims(desk.rotation);

  for (const other of allDesks) {
    if (other.id === desk.id) continue;
    const { hw: ohw, hh: ohh } = getHalfDims(other.rotation);
    const oL = other.x - ohw, oR = other.x + ohw;
    const oT = other.y - ohh, oB = other.y + ohh;
    const dL = x - hw, dR = x + hw;
    const dT = y - hh, dB = y + hh;
    const vOverlap = dB > oT && dT < oB;
    const hOverlap = dR > oL && dL < oR;

    if (vOverlap) {
      if (Math.abs(dL - oR) < SNAP_THRESHOLD) x = oR + hw;
      if (Math.abs(dR - oL) < SNAP_THRESHOLD) x = oL - hw;
    }
    if (hOverlap) {
      if (Math.abs(dT - oB) < SNAP_THRESHOLD) y = oB + hh;
      if (Math.abs(dB - oT) < SNAP_THRESHOLD) y = oT - hh;
    }
    if (Math.abs(x - other.x) < SNAP_THRESHOLD) x = other.x;
    if (Math.abs(y - other.y) < SNAP_THRESHOLD) y = other.y;
  }

  return { x, y };
}

export default function Desk() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [desks, setDesks] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [selectedClass, setSelectedClass] = useState(() => searchParams.get('class') || '');
  const [group, setGroup] = useState(() => {
    const requestedGroup = (searchParams.get('group') || 'A').toUpperCase();
    return GROUPS.includes(requestedGroup) ? requestedGroup : 'A';
  });
  const [drawMode, setDrawMode] = useState(false);
  const [selectedBankStudent, setSelectedBankStudent] = useState(null);
  const [selectedDeskIds, setSelectedDeskIds] = useState(new Set());
  const [swapSourceId, setSwapSourceId] = useState(null);
  const [clipboard, setClipboard] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);
  const swapSourceRef = useRef(null);
  const drawingRef = useRef(null);
  const marqueeRef = useRef(null);
  const selectedBankRef = useRef(null);
  const loadRef = useRef(() => {});

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
  }, []);

  const classes = useMemo(
    () =>
      students
        ? [...new Set(students.map((s) => s.class_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
        : [],
    [students]
  );

  const loadAll = useCallback(async () => {
    if (!selectedClass || !group) return;
    setDesks(null);
    setLandmarks(null);
    setSelectedBankStudent(null);
    setSelectedDeskIds(new Set());
    setSwapSourceId(null);
    const [allDesks, allLandmarks] = await Promise.all([
      base44.entities.DeskSeat.filter({ class_name: selectedClass, group }),
      base44.entities.DeskLandmark.filter({ class_name: selectedClass, group }),
    ]);
    setDesks(allDesks);
    setLandmarks(allLandmarks);
  }, [selectedClass, group]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { selectedBankRef.current = selectedBankStudent; }, [selectedBankStudent]);
  useEffect(() => { swapSourceRef.current = swapSourceId; }, [swapSourceId]);
  useEffect(() => { loadRef.current = loadAll; }, [loadAll]);

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  const assignedIds = useMemo(
    () => new Set((desks || []).filter((d) => d.student_id).map((d) => d.student_id)),
    [desks]
  );
  const homeroom = getHomeroomForClass(selectedClass, group);

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

  const toggleDrawMode = () => {
    setDrawMode((prev) => !prev);
    setSelectedBankStudent(null);
    setSelectedDeskIds(new Set());
    setSwapSourceId(null);
  };

  const startDrag = (e, desk) => {
    e.stopPropagation();
    e.preventDefault();

    const isGroupDrag = selectedDeskIds.has(desk.id) && selectedDeskIds.size > 1;
    const groupStart = isGroupDrag
      ? new Map((desks || []).filter((d) => selectedDeskIds.has(d.id)).map((d) => [d.id, { x: d.x, y: d.y }]))
      : new Map([[desk.id, { x: desk.x, y: desk.y }]]);

    const dragState = {
      deskId: desk.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startDeskX: desk.x,
      startDeskY: desk.y,
      moved: false,
      currentPositions: new Map(groupStart),
      isGroupDrag,
    };
    dragRef.current = dragState;

    const handleMove = (ev) => {
      const dx = ev.clientX - dragState.startMouseX;
      const dy = ev.clientY - dragState.startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;

      if (isGroupDrag) {
        const snappedDx = Math.round(dx / GRID_SIZE) * GRID_SIZE;
        const snappedDy = Math.round(dy / GRID_SIZE) * GRID_SIZE;
        setDesks((prev) => {
          if (!prev) return prev;
          const newPositions = new Map();
          const updated = prev.map((x) => {
            const start = groupStart.get(x.id);
            if (!start) return x;
            const newX = Math.max(0, Math.min(CANVAS_W, start.x + snappedDx));
            const newY = Math.max(0, Math.min(CANVAS_H, start.y + snappedDy));
            newPositions.set(x.id, { x: newX, y: newY });
            return { ...x, x: newX, y: newY };
          });
          dragState.currentPositions = newPositions;
          return updated;
        });
      } else {
        setDesks((prev) => {
          if (!prev) return prev;
          const dragged = prev.find((x) => x.id === dragState.deskId);
          if (!dragged) return prev;
          const snapped = snapPosition(
            { ...dragged, x: dragState.startDeskX + dx, y: dragState.startDeskY + dy },
            prev
          );
          dragState.currentPositions = new Map([[dragState.deskId, { x: snapped.x, y: snapped.y }]]);
          return prev.map((x) => (x.id === dragState.deskId ? { ...x, x: snapped.x, y: snapped.y } : x));
        });
      }
    };

    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      dragRef.current = null;

      if (dragState.moved) {
        const updates = [];
        for (const [id, pos] of dragState.currentPositions) {
          updates.push({ id, x: pos.x, y: pos.y });
        }
        if (updates.length > 0) {
          setSaving(true);
          base44.entities.DeskSeat.bulkUpdate(updates)
            .then(() => setSaving(false))
            .catch(() => { loadRef.current(); setSaving(false); });
        }
      } else {
        const bankId = selectedBankRef.current;
        if (bankId) {
          setDesks((prev) => (prev ? prev.map((x) => (x.id === dragState.deskId ? { ...x, student_id: bankId } : x)) : prev));
          setSelectedBankStudent(null);
          setSaving(true);
          base44.entities.DeskSeat.update(dragState.deskId, { student_id: bankId })
            .then(() => setSaving(false))
            .catch(() => { loadRef.current(); setSaving(false); });
        } else {
          const sourceId = swapSourceRef.current;
          const targetDesk = (desks || []).find((d) => d.id === dragState.deskId);
          if (!targetDesk) return;
          if (sourceId === targetDesk.id) {
            setSwapSourceId(null);
          } else if (sourceId) {
            const sourceDesk = (desks || []).find((d) => d.id === sourceId);
            const sourceStudent = sourceDesk?.student_id || null;
            const targetStudent = targetDesk.student_id || null;
            setDesks((prev) => (prev ? prev.map((d) => {
              if (d.id === sourceId) return { ...d, student_id: targetStudent };
              if (d.id === targetDesk.id) return { ...d, student_id: sourceStudent };
              return d;
            }) : prev));
            setSwapSourceId(null);
            setSaving(true);
            Promise.all([
              base44.entities.DeskSeat.update(sourceId, { student_id: targetStudent }),
              base44.entities.DeskSeat.update(targetDesk.id, { student_id: sourceStudent }),
            ])
              .then(() => setSaving(false))
              .catch(() => { loadRef.current(); setSaving(false); });
          } else if (targetDesk.student_id) {
            setSwapSourceId(targetDesk.id);
          }
        }
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const handleDeskPointerDown = (e, desk) => {
    if (drawMode) return;
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      e.preventDefault();
      setSelectedDeskIds((prev) => {
        const next = new Set(prev);
        if (next.has(desk.id)) next.delete(desk.id);
        else next.add(desk.id);
        return next;
      });
    } else {
      startDrag(e, desk);
    }
  };

  const handleRotate = async (desk) => {
    const newRotation = ((desk.rotation || 0) + 90) % 360;
    setDesks((prev) => (prev ? prev.map((d) => (d.id === desk.id ? { ...d, rotation: newRotation } : d)) : prev));
    setSaving(true);
    try { await base44.entities.DeskSeat.update(desk.id, { rotation: newRotation }); } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleDelete = async (desk) => {
    setDesks((prev) => (prev ? prev.filter((d) => d.id !== desk.id) : prev));
    try { await base44.entities.DeskSeat.delete(desk.id); } catch { loadRef.current(); }
  };

  const handleUnseat = async (desk) => {
    setDesks((prev) => (prev ? prev.map((d) => (d.id === desk.id ? { ...d, student_id: null } : d)) : prev));
    setSwapSourceId(null);
    setSaving(true);
    try { await base44.entities.DeskSeat.update(desk.id, { student_id: null }); } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleAddDesk = async () => {
    const offset = ((desks?.length || 0) % 8) * 30;
    const newDesk = {
      class_name: selectedClass,
      group,
      x: 150 + offset,
      y: 150 + offset,
      rotation: 0,
      student_id: null,
    };
    setSaving(true);
    try {
      const created = await base44.entities.DeskSeat.create(newDesk);
      setDesks((prev) => [...(prev || []), created]);
    } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleGenerateGrid = async () => {
    if ((desks || []).length > 0) {
      if (!window.confirm('This adds a 5×4 grid of empty desks on top of the existing layout. Continue?')) return;
    }
    const cols = 5;
    const rows = 4;
    const colGap = DESK_W + 28;
    const rowGap = DESK_H + 28;
    const startX = (CANVAS_W - cols * colGap + 28) / 2;
    const startY = (CANVAS_H - rows * rowGap + 28) / 2;
    const newDesks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newDesks.push({
          class_name: selectedClass,
          group,
          x: Math.round(startX + c * colGap),
          y: Math.round(startY + r * rowGap),
          rotation: 0,
          student_id: null,
        });
      }
    }
    setSaving(true);
    try {
      const created = await base44.entities.DeskSeat.bulkCreate(newDesks);
      setDesks((prev) => [...(prev || []), ...created]);
    } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all desks? Students will return to the bank.')) return;
    setSaving(true);
    setSelectedBankStudent(null);
    setDesks((prev) => (prev ? prev.map((d) => ({ ...d, student_id: null })) : prev));
    try {
      const updates = (desks || []).map((d) => ({ id: d.id, student_id: null }));
      if (updates.length) await base44.entities.DeskSeat.bulkUpdate(updates);
    } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleCopyLayoutToGroups = async () => {
    if (!selectedClass) return;
    if (!window.confirm(`Copy ${selectedClass}'s Group A desk layout to Groups B and C? This replaces any existing desks in B and C.`)) return;
    setSaving(true);
    try {
      const groupADesks = await base44.entities.DeskSeat.filter({ class_name: selectedClass, group: 'A' });
      if (groupADesks.length === 0) { setSaving(false); return; }
      await base44.entities.DeskSeat.deleteMany({ class_name: selectedClass, group: 'B' });
      await base44.entities.DeskSeat.deleteMany({ class_name: selectedClass, group: 'C' });
      const newDesks = [];
      for (const g of ['B', 'C']) {
        for (const d of groupADesks) {
          newDesks.push({ class_name: selectedClass, group: g, x: d.x, y: d.y, rotation: d.rotation || 0, student_id: null });
        }
      }
      if (newDesks.length > 0) await base44.entities.DeskSeat.bulkCreate(newDesks);
      loadRef.current();
    } catch { loadRef.current(); }
    setSaving(false);
  };

  const handleCopy = useCallback(() => {
    const selected = (desks || []).filter((d) => selectedDeskIds.has(d.id));
    if (selected.length === 0) return;
    setClipboard(selected.map((d) => ({ x: d.x, y: d.y, rotation: d.rotation || 0 })));
  }, [desks, selectedDeskIds]);

  const handlePaste = useCallback(async () => {
    if (clipboard.length === 0) return;
    setSaving(true);
    try {
      const newDesks = clipboard.map((d) => ({
        class_name: selectedClass,
        group,
        x: d.x + 24,
        y: d.y + 24,
        rotation: d.rotation,
        student_id: null,
      }));
      const created = await base44.entities.DeskSeat.bulkCreate(newDesks);
      setDesks((prev) => [...(prev || []), ...created]);
      setSelectedDeskIds(new Set(created.map((d) => d.id)));
    } catch { loadRef.current(); }
    setSaving(false);
  }, [clipboard, selectedClass, group]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (drawMode) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'c' && selectedDeskIds.size > 0) { e.preventDefault(); handleCopy(); }
      if (isCtrl && e.key === 'v' && clipboard.length > 0) { e.preventDefault(); handlePaste(); }
      if (isCtrl && e.key === 'a') { e.preventDefault(); setSelectedDeskIds(new Set((desks || []).map((d) => d.id))); }
      if (e.key === 'Escape') { setSelectedDeskIds(new Set()); setSwapSourceId(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, selectedDeskIds, clipboard, desks, handleCopy, handlePaste]);

  const startLandmarkDrag = (e, landmark) => {
    e.stopPropagation();
    e.preventDefault();
    const dragState = {
      landmarkId: landmark.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: landmark.x,
      startY: landmark.y,
      moved: false,
      currentX: landmark.x,
      currentY: landmark.y,
    };

    const handleMove = (ev) => {
      const dx = ev.clientX - dragState.startMouseX;
      const dy = ev.clientY - dragState.startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
      const newX = Math.round((dragState.startX + dx) / GRID_SIZE) * GRID_SIZE;
      const newY = Math.round((dragState.startY + dy) / GRID_SIZE) * GRID_SIZE;
      dragState.currentX = newX;
      dragState.currentY = newY;
      setLandmarks((prev) => (prev ? prev.map((l) => (l.id === landmark.id ? { ...l, x: newX, y: newY } : l)) : prev));
    };

    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      if (dragState.moved) {
        setSaving(true);
        base44.entities.DeskLandmark.update(landmark.id, { x: dragState.currentX, y: dragState.currentY })
          .then(() => setSaving(false))
          .catch(() => { loadRef.current(); setSaving(false); });
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const handleDeleteLandmark = async (landmark) => {
    setLandmarks((prev) => (prev ? prev.filter((l) => l.id !== landmark.id) : prev));
    try { await base44.entities.DeskLandmark.delete(landmark.id); } catch { loadRef.current(); }
  };

  const handleEditLandmark = (landmark) => {
    const newLabel = window.prompt('Landmark label?', landmark.label || '');
    if (newLabel !== null) {
      setLandmarks((prev) => (prev ? prev.map((l) => (l.id === landmark.id ? { ...l, label: newLabel } : l)) : prev));
      base44.entities.DeskLandmark.update(landmark.id, { label: newLabel }).catch(() => loadRef.current());
    }
  };

  const handleCanvasPointerDown = (e) => {
    if (e.pointerType === 'touch') return;
    if (drawMode && e.target === e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      drawingRef.current = { startX, startY, x: startX, y: startY, w: 0, h: 0 };
      setDrawing({ x: startX, y: startY, w: 0, h: 0 });

      const handleMove = (ev) => {
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        const d = {
          x: Math.min(startX, cx),
          y: Math.min(startY, cy),
          w: Math.abs(cx - startX),
          h: Math.abs(cy - startY),
        };
        drawingRef.current = d;
        setDrawing(d);
      };

      const handleUp = async () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        const d = drawingRef.current;
        drawingRef.current = null;
        setDrawing(null);
        if (d && d.w > 20 && d.h > 20) {
          const label = window.prompt('Landmark label (e.g., TV, Bookshelf)?', 'TV');
          if (label) {
            setSaving(true);
            try {
              const created = await base44.entities.DeskLandmark.create({
                class_name: selectedClass,
                group,
                x: d.x + d.w / 2,
                y: d.y + d.h / 2,
                width: d.w,
                height: d.h,
                label,
              });
              setLandmarks((prev) => [...(prev || []), created]);
            } catch { loadRef.current(); }
            setSaving(false);
          }
        }
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    } else if (!drawMode && e.target === e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      marqueeRef.current = { startX, startY, x: startX, y: startY, w: 0, h: 0 };
      setMarquee({ x: startX, y: startY, w: 0, h: 0 });

      const handleMove = (ev) => {
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        const d = {
          x: Math.min(startX, cx),
          y: Math.min(startY, cy),
          w: Math.abs(cx - startX),
          h: Math.abs(cy - startY),
        };
        marqueeRef.current = d;
        setMarquee(d);
        const selected = (desks || []).filter((desk) => {
          const { hw, hh } = getHalfDims(desk.rotation);
          return (
            desk.x + hw > d.x && desk.x - hw < d.x + d.w &&
            desk.y + hh > d.y && desk.y - hh < d.y + d.h
          );
        });
        setSelectedDeskIds(new Set(selected.map((s) => s.id)));
      };

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        const d = marqueeRef.current;
        marqueeRef.current = null;
        setMarquee(null);
        if (d && d.w < 5 && d.h < 5) {
          setSelectedDeskIds(new Set());
        }
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    }
  };

  const handlePrint = () => {
    const safe = String(selectedClass || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const seated = (desks || []).filter((d) => d.student_id).map((d) => studentMap[d.student_id]).filter(Boolean);
    const cols = 4;
    const cards = seated.map((s) => {
      const img = s.photo_url ? `<img src="${s.photo_url}" />` : '';
      return `<div class="cell">${img}<div class="name">${s.name || `#${s.student_number}`}</div></div>`;
    }).join('');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Desk Layout - Class ${safe} (Group ${group})</title>
      <style>@page{size:letter landscape;margin:0.4in;}body{font-family:'Teachers',sans-serif;color:#1e293b;}
      h1{text-align:center;font-size:18pt;margin-bottom:0.2in;}
      .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:0.15in;}
      .cell{border:2px solid #475569;border-radius:8px;overflow:hidden;text-align:center;}
      .cell img{width:100%;height:1.4in;object-fit:cover;}
      .cell .name{font-weight:700;padding:4px;font-size:10pt;}</style></head>
      <body><h1>Class ${safe} — Group ${group} Desk Layout</h1><div class="grid">${cards}</div></body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  const seatedCount = desks ? desks.filter((d) => d.student_id).length : 0;

  const hint = drawMode
    ? 'Drag on the canvas to draw a landmark (TV, bookshelf, etc.) · Double-click a landmark to rename'
    : 'Drag desks to move · Tap a seated desk then another to swap · Ctrl+C/V to copy/paste · Esc to deselect';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon">
                <Link to="/StudentRoster"><ArrowLeft className="w-4 h-4" /></Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold">Desk Seating</h1>
                <p className="text-xs text-muted-foreground">
                  {desks
                    ? `${seatedCount} seated · ${desks.length} desks · ${homeroom} homeroom`
                    : selectedClass
                      ? 'Loading…'
                      : 'Select a class to begin'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {selectedClass && !drawMode && (
                <>
                  <Button size="sm" variant="outline" onClick={handleAddDesk}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add desk
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleGenerateGrid}>
                    <LayoutGrid className="w-4 h-4 mr-1.5" /> Grid
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleReset}>
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Reset
                  </Button>
                  {group === 'A' && (desks || []).length > 0 && (
                    <Button size="sm" variant="outline" onClick={handleCopyLayoutToGroups}>
                      <Copy className="w-4 h-4 mr-1.5" /> Copy A → B & C
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mr-1.5" /> Print
                  </Button>
                </>
              )}
              {selectedClass && (
                <Button
                  size="sm"
                  variant={drawMode ? 'default' : 'outline'}
                  onClick={toggleDrawMode}
                >
                  {drawMode ? <Check className="w-4 h-4 mr-1.5" /> : <Pencil className="w-4 h-4 mr-1.5" />}
                  {drawMode ? 'Done' : 'Draw'}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button asChild size="sm" variant="default" className="rounded-none">
                <Link to={`/Desk?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Desk</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="rounded-none">
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
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Group</span>
              {GROUPS.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={group === g ? 'default' : 'outline'}
                  onClick={() => setGroup(g)}
                  className="w-9"
                >
                  {g}
                </Button>
              ))}
            </div>
            {!drawMode && selectedDeskIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">{selectedDeskIds.size} selected</span>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={handlePaste} disabled={clipboard.length === 0}>
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1" /> Paste
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {!selectedClass ? (
          <div className="text-center py-20">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Select a class to start arranging desks.</p>
          </div>
        ) : desks === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex gap-4">
            {!drawMode && (
              <div className="w-48 shrink-0">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Bank ({bankStudents.length})
                </p>
                {selectedBankStudent && (
                  <p className="text-xs text-primary mb-2">Tap a desk to seat.</p>
                )}
                {swapSourceId && (() => {
                  const sd = (desks || []).find((d) => d.id === swapSourceId);
                  const st = sd?.student_id ? studentMap[sd.student_id] : null;
                  return (
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground">
                        Tap another desk to swap — or tap the highlighted one to cancel.
                      </p>
                      {st && (
                        <button
                          onClick={() => handleUnseat(sd)}
                          className="mt-1.5 text-xs text-destructive hover:text-destructive/80 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Unseat {st.name}
                        </button>
                      )}
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
                  {bankStudents.map((s) => (
                    <StudentBankCard
                      key={s.id}
                      student={s}
                      isSelected={selectedBankStudent === s.id}
                      onClick={() => { setSwapSourceId(null); setSelectedBankStudent(selectedBankStudent === s.id ? null : s.id); }}
                    />
                  ))}
                  {bankStudents.length === 0 && (
                    <p className="text-xs text-muted-foreground">All students seated.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <div
                onPointerDown={handleCanvasPointerDown}
                className="relative bg-white rounded-lg border-2 border-dashed border-slate-200"
                style={{ width: CANVAS_W, height: CANVAS_H, minWidth: CANVAS_W }}
              >
                {desks.length === 0 && (!landmarks || landmarks.length === 0) && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Click "Add desk" to start arranging.
                  </div>
                )}
                {(landmarks || []).map((lm) => (
                  <DeskLandmarkItem
                    key={lm.id}
                    landmark={lm}
                    onPointerDown={!drawMode ? (e) => startLandmarkDrag(e, lm) : undefined}
                    onDelete={() => handleDeleteLandmark(lm)}
                    onEdit={() => handleEditLandmark(lm)}
                  />
                ))}
                {desks.map((desk) => (
                  <DeskItem
                    key={desk.id}
                    desk={desk}
                    student={desk.student_id ? studentMap[desk.student_id] : null}
                    isBankSelected={!!selectedBankStudent}
                    isSelected={selectedDeskIds.has(desk.id)}
                    isSwapSource={swapSourceId === desk.id}
                    interactive={!drawMode}
                    onPointerDown={(e) => handleDeskPointerDown(e, desk)}
                    onRotate={() => handleRotate(desk)}
                    onDelete={() => handleDelete(desk)}
                  />
                ))}
                {drawing && (
                  <div
                    className="absolute border-2 border-dashed border-amber-500 bg-amber-100/40 pointer-events-none rounded-sm"
                    style={{ left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }}
                  />
                )}
                {marquee && (
                  <div
                    className="absolute border-2 border-dashed border-blue-500 bg-blue-100/20 pointer-events-none rounded-sm"
                    style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{hint}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}