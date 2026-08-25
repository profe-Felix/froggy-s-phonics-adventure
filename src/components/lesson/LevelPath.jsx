import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { Lock, Star, Pencil, Save, X, Plus } from 'lucide-react';
import { fetchLessons } from '@/lib/lessonsLoader';
import CoinBadge from '@/components/game/CoinBadge';
import CharacterDock from '@/components/game/CharacterDock';
import PrizeWheel from '@/components/game/PrizeWheel';
import { getCharacters } from '@/lib/characters';

// Level-path homepage. A single background image is shown once (no repeat),
// sized to fill the container exactly. Level pucks are positioned by % over it.
// Default layout is a bottom-up serpentine (level 1 near the bottom, ascending).
// Teachers/admins get an Edit mode: drag pucks to place them, tap empty path to
// add the next level, then Save to persist the layout (syncs to all students).
const BG_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/images/Backgrounds/Level_Path.png';
const TOTAL_LEVELS = 120;

// Default serpentine — bottom-up: level 1 near the bottom, level 120 near the top.
const Y_TOP = 8;
const Y_BOT = 92;
const AMP = 0.24;
const FREQ = 0.85;
function defaultPos(i) {
  const x = 50 + AMP * 100 * Math.sin((i - 1) * FREQ);
  // Bottom-up: level 1 at the bottom, level TOTAL_LEVELS at the top.
  const y = Y_BOT - ((Y_BOT - Y_TOP) * (i - 1)) / (TOTAL_LEVELS - 1);
  return { x, y };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function LevelPath({ studentData, selectedStudent, onOpenLesson, onLogout, onStudentPatch }) {
  const className = selectedStudent?.class_name || '';
  const studentNumber = selectedStudent?.number;
  const qc = useQueryClient();

  // Who's logged in (to gate the teacher Edit mode).
  const { data: me } = useQuery({
    queryKey: ['me'],
    enabled: !!appParams.token,
    queryFn: async () => { try { return await base44.auth.me(); } catch { return null; } },
  });
  const canEdit = me?.role === 'admin' || me?.role === 'teacher';

  // Character collection + coin state for the dock / wheel.
  const [characters, setCharacters] = useState([]);
  const [wheelOpen, setWheelOpen] = useState(false);
  useEffect(() => { getCharacters().then(setCharacters); }, []);
  const coins = Number(studentData?.coins || 0);
  const unlockedChars = studentData?.unlocked_characters || [];
  const [redeemedPrizes, setRedeemedPrizes] = useState(
    () => studentData?.redeemed_prizes || []
  );

  const handleSetActiveChar = (id) =>
    onStudentPatch?.({ active_character: id });

  const handleClaimPrize = (prize) => {
    setWheelOpen(false);

    if (
      prize?.oneTime &&
      !redeemedPrizes.includes(prize.id)
    ) {
      const updated = [
        ...redeemedPrizes,
        prize.id,
      ];

      setRedeemedPrizes(updated);

      onStudentPatch?.({
        redeemed_prizes: updated,
      });
    }
  };

  const handleCloseWheel = () => {
    setWheelOpen(false);
  };

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', className],
    queryFn: fetchLessons,
  });

  const { data: progresses = [] } = useQuery({
    queryKey: ['lesson-progress-all', String(studentNumber), className],
    queryFn: () => base44.entities.LessonProgress.filter({
      student_number: studentNumber,
      class_name: className,
    }),
    enabled: !!studentNumber && !!className,
  });

  // Saved layout for this class (slot -> {x,y}). Empty = use the 120-slot default.
  const { data: layoutRec } = useQuery({
    queryKey: ['level-path-layout', className],
    queryFn: async () => {
      const rows = await base44.entities.LevelPathLayout.filter({ class_name: className });
      return rows[0] || null;
    },
    enabled: !!className,
  });
  const savedPositions = useMemo(() => {
    if (!layoutRec?.positions_data) return {};
    try { return JSON.parse(layoutRec.positions_data) || {}; } catch { return {}; }
  }, [layoutRec]);

  const hasSavedLayout = Object.keys(savedPositions).length > 0;

  const myLessons = useMemo(
    () => lessons
      .filter(l => l.assignment_type !== 'side_quest' && l.assignment_type !== 'guided' && (!l.class_name || l.class_name === className))
      .sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)),
    [lessons, className]
  );
  const byNumber = useMemo(() => {
    const m = new Map();
    for (const l of myLessons) if (l.lesson_number) m.set(l.lesson_number, l);
    return m;
  }, [myLessons]);

  const completedSet = useMemo(() => {
    const s = new Set();
    for (const p of progresses) {
      if (!p.completed) continue;
      const l = myLessons.find(l => l.id === p.lesson_id);
      if (l?.lesson_number) s.add(l.lesson_number);
    }
    return s;
  }, [progresses, myLessons]);

  // Slots shown to students: the placed slots if a layout exists, else all 120.
  const studentSlots = useMemo(
    () => hasSavedLayout
      ? Object.keys(savedPositions).map(Number).filter(n => n >= 1 && n <= TOTAL_LEVELS).sort((a, b) => a - b)
      : Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1),
    [hasSavedLayout, savedPositions]
  );

  // Active = first placed slot not yet completed.
  const activeSlot = useMemo(() => {
    for (const n of studentSlots) if (!completedSet.has(n)) return n;
    return null;
  }, [studentSlots, completedSet]);

  // --- Edit mode state (teacher) ---
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});      // slot(string) -> {x,y}
  const [dragSlot, setDragSlot] = useState(null);
  const [saving, setSaving] = useState(false);

  const enterEdit = () => { setDraft({ ...savedPositions }); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setDraft({}); setDragSlot(null); };

  const saveLayout = async () => {
    setSaving(true);
    try {
      const payload = { class_name: className, positions_data: JSON.stringify(draft) };
      if (layoutRec?.id) {
        await base44.entities.LevelPathLayout.update(layoutRec.id, payload);
      } else {
        await base44.entities.LevelPathLayout.create(payload);
      }
      await qc.invalidateQueries({ queryKey: ['level-path-layout', className] });
      setEditing(false);
      setDraft({});
    } catch (e) {
      alert('Could not save layout: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const nextSlotToAdd = useMemo(() => {
    const used = new Set(Object.keys(draft).map(Number));
    for (let n = 1; n <= TOTAL_LEVELS; n++) if (!used.has(n)) return n;
    return null;
  }, [draft]);

  // --- Background image: measure aspect so the container matches one image, no repeat. ---
  const wrapRef = useRef(null);
  const [aspect, setAspect] = useState(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setAspect(im.naturalHeight && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0);
    im.src = BG_URL;
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ready = aspect > 0 && width > 0;
  const containerH = ready ? Math.round(width * aspect) : 0;

  // --- Drag handling (edit mode) ---
  const dragInfo = useRef(null);
  useEffect(() => {
    if (!editing || dragSlot == null) return;
    const onMove = (e) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clamp(((e.clientX - r.left) / r.width) * 100, 2, 98);
      const y = clamp(((e.clientY - r.top) / r.height) * 100, 2, 98);
      setDraft((d) => ({ ...d, [dragSlot]: { x, y } }));
    };
    const onUp = () => setDragSlot(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [editing, dragSlot]);

  // Auto-follow the active puck. Pucks only render once `ready` is true, so the
  // effect must re-run when ready flips — otherwise the scroll is missed and the
  // page sits at the top. Instant on first load, smooth as the student advances.
  const activeRef = useRef(null);
  const firstScrollRef = useRef(true);
  useEffect(() => {
    if (editing || !ready) return;
    if (!activeRef.current) return;
    activeRef.current.scrollIntoView({ block: 'center', behavior: firstScrollRef.current ? 'auto' : 'smooth' });
    firstScrollRef.current = false;
  }, [activeSlot, editing, ready]);

  const posFor = (n) => (editing ? draft[String(n)] : savedPositions[String(n)]) || defaultPos(n);

  // Click empty path in edit mode → add the next level puck there.
  const onPathClick = (e) => {
    if (!editing || dragSlot != null) return;
    if (e.target !== wrapRef.current) return;
    if (nextSlotToAdd == null) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 2, 98);
    const y = clamp(((e.clientY - r.top) / r.height) * 100, 2, 98);
    setDraft((d) => ({ ...d, [nextSlotToAdd]: { x, y } }));
  };

  const slotsToShow = editing
    ? Object.keys(draft).map(Number).sort((a, b) => a - b)
    : studentSlots;

  return (
    <div className="relative h-screen overflow-y-auto bg-[#a932d5]">
      <div
        ref={wrapRef}
        onClick={onPathClick}
        className="relative w-full"
        style={{
          height: ready ? containerH : '100vh',
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top center',
        }}
      >
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3">
          <button
            onClick={onLogout}
            className="px-4 py-1.5 rounded-full bg-white text-indigo-900 text-sm font-bold shadow"
          >
            Grownups
          </button>
          <div className="flex items-center gap-2">
            {canEdit && !editing && (
              <button
                onClick={enterEdit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white text-indigo-900 text-sm font-bold shadow"
              >
                <Pencil className="w-4 h-4" /> Edit path
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={saveLayout}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-500 text-white text-sm font-bold shadow disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white text-red-600 text-sm font-bold shadow"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              </>
            )}
            <CoinBadge coins={coins} onClick={() => setWheelOpen(true)} />
            <div className="px-4 py-1.5 rounded-full bg-white/90 text-indigo-900 text-sm font-black shadow">
              {studentData?.name || `Student ${studentNumber}`}{className ? ` · ${className}` : ''}
            </div>
          </div>
        </div>

        {/* Edit-mode hint */}
        {editing && (
          <div className="sticky top-14 z-20 mx-auto w-fit px-3 py-1 rounded-full bg-black/60 text-white text-xs font-semibold">
            {nextSlotToAdd ? `Tap the path to add level ${nextSlotToAdd} · drag to move` : 'Drag pucks · all 120 placed'}
          </div>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {ready && slotsToShow.map((n) => {
          const lesson = byNumber.get(n);
          const done = completedSet.has(n);
          const active = n === activeSlot;
          const locked = !lesson || (!done && !active);
          const pos = posFor(n);
          const isDrag = editing && String(dragSlot) === String(n);
          return (
            <button
              key={n}
              ref={!editing && active ? activeRef : null}
              disabled={locked && !editing}
              onClick={(e) => { if (editing) return; if (lesson && !locked) onOpenLesson(lesson); }}
              onPointerDown={(e) => {
                if (!editing) return;
                e.preventDefault();
                setDragSlot(n);
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-full shadow-lg select-none touch-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: 56,
                height: 56,
                background: done ? '#4ade80' : active ? '#ffffff' : editing ? '#c7d2fe' : '#ffffff',
                border: active ? '4px solid #F48FB1' : '3px solid #ffffff',
                opacity: locked && !editing ? 0.85 : 1,
                cursor: editing ? (isDrag ? 'grabbing' : 'grab') : (locked ? 'default' : 'pointer'),
                zIndex: isDrag ? 40 : 10,
              }}
            >
              {locked && !editing ? (
                <>
                  <span className="text-lg font-black text-gray-400">{n}</span>
                  <Lock className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-gray-400/80" />
                </>
              ) : (
                <span className="text-lg font-black" style={{ color: done ? '#ffffff' : '#311B92' }}>
                  {n}
                </span>
              )}
              {done && !editing && (
                <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow" />
              )}
              {active && !editing && (
                <span className="absolute -bottom-5 text-[10px] font-black text-white bg-pink-500 rounded-full px-2 py-0.5 shadow whitespace-nowrap">
                  ▶ HERE
                </span>
              )}
            </button>
          );
        })}

        {/* Add affordance in edit mode */}
        {editing && nextSlotToAdd != null && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 text-white/80 text-xs font-semibold bg-black/40 px-2 py-1 rounded-full">
            <Plus className="w-3.5 h-3.5" /> tap path to add
          </div>
        )}

        {!editing && (
          <>
            <CharacterDock studentData={studentData} characters={characters} onSetActive={handleSetActiveChar} />
            {wheelOpen && (
              <PrizeWheel
                key={`level-path-wheel-${coins}`}
                studentData={studentData}
                onStudentPatch={onStudentPatch}
                redeemedPrizes={redeemedPrizes}
                onClaim={handleClaimPrize}
                onClose={handleCloseWheel}
                freeSpin={false}
                source="level-path"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TOP_FALLBACK_H = 6000;