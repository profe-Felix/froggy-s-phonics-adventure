import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import confetti from 'canvas-confetti';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Coins, Check, Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '../../data/numberWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { getLanguage } from '@/lib/language';
import { useCoinAward } from '@/hooks/useCoinAward';
import { LETTER_FORMATION_GROUPS, isLetterSoundIntroduced } from '@/lib/literacy/letterFormationGroups';

// Letter Tracing GROUP practice (game mode / free play). Students trace a
// formation family together — all its letters on one ruled line, in
// pedagogical order — through three phases, then earn a coin set bonus.
//
//   Phase 1 "guided"   — 6 lines, dot-guide tracing.
//   Phase 2 "practice" — 6 lines, faint model + starting dot (no breadcrumb).
//   Phase 3 "mixed"    — 6 lines, alternating guided / freehand (3 pairs).
//
// SIZE CHOICE:
//   "paper" — letters at paper-writing size, ALL on one ruled line so
//             students see the whole family and practice at real size.
//             Worth 30 coins (the default).
//   "big"   — one large letter at a time (fills the screen). Easier for
//             beginners; worth 10 coins. Students weigh the trade-off.
//
// The bonus is awarded once per set per cycle; a set only pays again after
// EVERY enabled set has been finished once (letter_group_awarded_sets on the
// student record tracks the cycle). Pinch-zoom is disabled so students can't
// scale the page to cheat the size.

const LINES_PER_PHASE = 6;
const REWARD = { paper: 30, big: 10 };

// LetterTracingCanvas viewBox constants (kept in sync with the canvas).
const CANVAS_W = 300;
const COPY_GAP = 24;
const GUIDE_W = 260;
// Cap the per-letter width at the "Paper" size tier so the line never grows
// beyond real handwriting size on wide screens.
const PAPER_COPY_WIDTH = 220;

const PHASES = [
  { key: 'guided', label: 'Trace', desc: 'Follow the dot guide' },
  { key: 'practice', label: 'Practice', desc: 'Copy the model — no dots' },
  { key: 'alternating', label: 'Mixed', desc: 'Alternate trace & write' },
];

export default function LetterGroupTracingMode({ studentData, onStudentPatch, classConfig, tracingOnly, onBack }) {
  const [enabledGroups, setEnabledGroups] = useState([]);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const [selectedKey, setSelectedKey] = useState(null);
  const [sizeMode, setSizeMode] = useState('paper'); // 'paper' | 'big'
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [line, setLine] = useState(0);
  const [letterIdx, setLetterIdx] = useState(0);
  const [traceKey, setTraceKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  // Per-letterIdx saved strokes for the CURRENT line, so completed letters
  // keep showing the student's actual ink (not a green guide outline).
  const [lineStrokes, setLineStrokes] = useState([]);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Measure the canvas wrapper so the paper-size line fits all letters on one
  // screen (no horizontal scroll) while staying at real handwriting size.
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setWrapW(r.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedKey, sizeMode]);

  // Load authored waypoints (overrides built-in defaults).
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list().then((records) => {
      if (cancelled || !Array.isArray(records) || !records.length) return;
      setWaypoints((prev) => {
        const merged = { ...prev };
        for (const r of records) {
          if (!r.letter || !r.strokes_data) continue;
          try {
            const strokes = JSON.parse(r.strokes_data);
            if (Array.isArray(strokes) && strokes.length) {
              merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
            }
          } catch {}
        }
        return merged;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load the enabled formation groups from TracingSettings. The teacher
  // toggles whole groups on/off from the Progression page (enabled_groups).
  // If enabled_groups is empty (not yet set), fall back to deriving from
  // enabled_letters — a group shows if ALL its letters are individually enabled.
  useEffect(() => {
    let cancelled = false;
    const cls = studentData?.class_name;
    const derive = (letters) =>
      LETTER_FORMATION_GROUPS
        .filter((g) => g.letters.every((l) => (letters || []).includes(l)))
        .map((g) => g.key);
    const applySettings = (rec) => {
      if (rec && Array.isArray(rec.enabled_groups) && rec.enabled_groups.length > 0) {
        setEnabledGroups(rec.enabled_groups);
        return true;
      }
      if (rec && Array.isArray(rec.enabled_letters)) {
        setEnabledGroups(derive(rec.enabled_letters));
        return true;
      }
      return false;
    };
    const load = async () => {
      try {
        if (cls) {
          const perClass = await base44.entities.TracingSettings.filter({ scope: cls });
          if (cancelled) return;
          if (perClass?.length && applySettings(perClass[0])) return;
        }
        const def = await base44.entities.TracingSettings.filter({ scope: 'default' });
        if (cancelled) return;
        if (def?.length) {
          applySettings(def[0]);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [studentData?.class_name]);

  const awardedSet = useMemo(
    () => new Set(studentData?.letter_group_awarded_sets || []),
    [studentData?.letter_group_awarded_sets]
  );

  // Only groups that are enabled AND have at least one authored letter.
  const groups = useMemo(
    () => LETTER_FORMATION_GROUPS.filter(
      (g) => enabledGroups.includes(g.key) && g.letters.some((l) => waypoints[l])
    ),
    [enabledGroups, waypoints]
  );

  const persistProgress = (pIdx, ln, li) => {
    if (!studentData?.id || !selectedKey) return;
    const prog = { ...(studentData.letter_group_progress || {}) };
    prog[selectedKey] = { phase: pIdx, line: ln, letterIdx: li };
    onStudentPatch?.({ letter_group_progress: prog });
  };

  const selectGroup = (g) => {
    setSelectedKey(g.key);
    const saved = studentData?.letter_group_progress?.[g.key];
    if (saved && typeof saved === 'object' && (saved.phase || saved.line || saved.letterIdx)) {
      setPhaseIdx(Math.min(PHASES.length - 1, saved.phase || 0));
      setLine(Math.max(0, Math.min(LINES_PER_PHASE - 1, saved.line || 0)));
      setLetterIdx(Math.max(0, saved.letterIdx || 0));
    } else {
      setPhaseIdx(0); setLine(0); setLetterIdx(0);
    }
    setTraceKey((k) => k + 1);
  };

  const currentGroup = groups.find((g) => g.key === selectedKey);
  const lang = getLanguage(studentData);
  const coinReward = REWARD[sizeMode];

  // ── GROUP PICKER ──────────────────────────────────────────────────────
  if (!selectedKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4 gap-4 select-none">
        {onBack && (
          <button onClick={onBack} className="self-start text-slate-500 hover:text-slate-800 text-sm font-bold flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Modes
          </button>
        )}
        <div className="text-center">
          <div className="text-4xl mb-1">✏️</div>
          <h1 className="text-2xl font-bold text-slate-800">Letter Tracing</h1>
          <p className="text-slate-500 text-sm mt-1">Practice letter families together. Finish a set to earn {coinReward} coins!</p>
        </div>

        {/* Size choice — students weigh paper-size (more coins) vs big (easier, fewer coins) */}
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-1.5">
          <button
            onClick={() => setSizeMode('paper')}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
              sizeMode === 'paper' ? 'bg-indigo-500 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="text-base">📏</span> Paper size
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${sizeMode === 'paper' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>+{REWARD.paper}</span>
          </button>
          <button
            onClick={() => setSizeMode('big')}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
              sizeMode === 'big' ? 'bg-indigo-500 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="text-base">🔍</span> Big
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${sizeMode === 'big' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>+{REWARD.big}</span>
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-md">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-slate-500 text-sm">
              No letter groups are enabled yet. Ask your teacher to turn on a group from the Letter Tracing Progression page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
            {groups.map((g) => {
              const awarded = awardedSet.has(g.key);
              const prog = studentData?.letter_group_progress?.[g.key];
              const resume = !awarded && prog && (prog.phase || prog.line || prog.letterIdx);
              return (
                <button
                  key={g.key}
                  onClick={() => selectGroup(g)}
                  className={`relative bg-white rounded-2xl border-2 shadow-sm p-4 text-left transition active:scale-[0.98] hover:shadow-md ${
                    awarded ? 'border-emerald-300' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-bold text-slate-800">{g.label}</h2>
                    {awarded ? (
                      <span className="flex items-center gap-1 text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <Check className="w-3 h-3" /> Done
                      </span>
                    ) : resume ? (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Resume</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {g.letters.map((l) => (
                      <span key={l} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-lg">
                        {l}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                    <Coins className="w-3.5 h-3.5" /> +{coinReward} coins
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── PRACTICE ──────────────────────────────────────────────────────────
  const phase = PHASES[phaseIdx];
  const letters = currentGroup.letters.filter((l) => waypoints[l]);
  const currentLetter = letters[letterIdx];
  const letterData = waypoints[currentLetter];

  // Alternating phase: even lines guided, odd lines freehand.
  const isGuidedLine = phase.key === 'guided' || (phase.key === 'alternating' && line % 2 === 0);
  const showGuide = isGuidedLine;
  const freehandMode = !isGuidedLine;
  const dotOnly = !isGuidedLine; // freehand lines show a faint model + starting dot
  const letterSilent = tracingOnly || !isLetterSoundIntroduced(currentLetter, classConfig);

  const totalLines = LINES_PER_PHASE * PHASES.length;
  const doneLines = phaseIdx * LINES_PER_PHASE + line;
  const sectionProgress = Math.round((doneLines / totalLines) * 100);

  // Paper-size line: one canvas row with every letter as a copy, the active
  // one traceable. Fit all copies into the wrapper width (no scroll) while
  // capping at real handwriting size.
  const copies = letters.map((l) => ({ letter: l, strokes: waypoints[l]?.strokes || [] }));
  const denom = letters.length + ((COPY_GAP * (letters.length - 1) + GUIDE_W) / CANVAS_W);
  const fitCopyWidth = wrapW > 0 ? Math.min(PAPER_COPY_WIDTH, wrapW / denom) : PAPER_COPY_WIDTH;

  const handleComplete = () => {
    const nextLetterIdx = letterIdx + 1;
    if (nextLetterIdx < letters.length) {
      setLetterIdx(nextLetterIdx);
      setTraceKey((k) => k + 1);
      persistProgress(phaseIdx, line, nextLetterIdx);
      return;
    }
    const nextLine = line + 1;
    if (nextLine < LINES_PER_PHASE) {
      setLine(nextLine); setLetterIdx(0); setLineStrokes([]);
      setTraceKey((k) => k + 1);
      persistProgress(phaseIdx, nextLine, 0);
      return;
    }
    const nextPhase = phaseIdx + 1;
    if (nextPhase < PHASES.length) {
      setPhaseIdx(nextPhase); setLine(0); setLetterIdx(0); setLineStrokes([]);
      setTraceKey((k) => k + 1);
      persistProgress(nextPhase, 0, 0);
      setCelebrate({ msg: `${phase.label} done!` });
      setTimeout(() => setCelebrate(null), 1100);
      return;
    }
    // All phases done → set complete.
    completeGroup();
  };

  const completeGroup = () => {
    const awarded = new Set(studentData?.letter_group_awarded_sets || []);
    const allDone = awarded.size >= groups.length;
    const already = awarded.has(selectedKey);
    const pay = !already || allDone;
    if (pay) awardCoins(coinReward);
    let newAwarded;
    if (allDone) newAwarded = [selectedKey]; // cycle reset
    else { const s = new Set(awarded); s.add(selectedKey); newAwarded = [...s]; }
    const prog = { ...(studentData.letter_group_progress || {}) };
    delete prog[selectedKey];
    onStudentPatch?.({ letter_group_awarded_sets: newAwarded, letter_group_progress: prog });
    setCelebrate({ msg: pay ? `Set complete! +${coinReward} coins!` : 'Set complete!', big: true });
    confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
    setTimeout(() => { setCelebrate(null); setSelectedKey(null); setLineStrokes([]); }, 1900);
  };

  // Called by the canvas each time a letter reaches success (green OR amber).
  // Keeps the student's real ink on the line and saves every attempt for the
  // teacher dashboard.
  const handleAttempt = ({ strokes, accuracy, isAmber }) => {
    if (!strokes || !strokes.length) return;
    setLineStrokes(prev => {
      const next = [...prev];
      next[letterIdx] = strokes;
      return next;
    });
    if (!studentData?.student_number || !studentData?.class_name || !currentLetter) return;
    // Normalize strokes to 0-1 per letter (subtract this copy's offset).
    const copyOffset = letterIdx * (300 + 24) + 260;
    const normalized = strokes.map(stroke =>
      stroke.map(p => ({ x: (p.x - copyOffset) / 300, y: p.y / 375 }))
    );
    base44.entities.TracingSample.create({
      student_number: studentData.student_number,
      class_name: studentData.class_name,
      school_year: studentData.school_year || '',
      letter: currentLetter,
      phase: phase.key,
      mode: isGuidedLine ? 'dot_only' : 'freehand',
      strokes_data: JSON.stringify(normalized),
      size_label: sizeMode === 'paper' ? 'Paper' : 'Big',
      source: 'group',
      group_key: selectedKey,
      accuracy: accuracy || 0,
      guided: isGuidedLine,
      size_mode: sizeMode,
    }).catch(() => {});
  };

  if (!letterData?.strokes?.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">✏️</div>
        <p className="text-slate-500">No tracing path for {currentLetter}.</p>
        <button onClick={() => setSelectedKey(null)} className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-bold">← Back</button>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col items-center py-1.5 px-3 gap-1 select-none" style={{ touchAction: 'pan-y' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between w-full max-w-3xl gap-2 shrink-0">
        <button
          onClick={() => setSelectedKey(null)}
          className="text-slate-500 hover:text-slate-800 text-xs font-bold whitespace-nowrap"
        >
          ← {currentGroup.label}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{sizeMode === 'paper' ? '📏 Paper' : '🔍 Big'}</span>
          <div className="text-[11px] text-slate-400 font-bold leading-none">{phase.label} · line {line + 1}/{LINES_PER_PHASE}</div>
          <div className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${isGuidedLine ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>
            {isGuidedLine ? '● Trace' : '✍️ Write'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-20 h-2.5 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${sectionProgress}%` }} />
          </div>
          <span className="text-[11px] font-black text-violet-600 whitespace-nowrap">{sectionProgress}%</span>
        </div>
      </div>

      {/* Letter progress row — quick visual of the family order + sound status.
          In paper mode the canvas line itself shows all letters; this row stays
          as a compact progress/silent indicator. */}
      <div className="flex items-center gap-1.5 flex-nowrap justify-center shrink-0 overflow-x-auto max-w-full">
        {letters.map((l, i) => {
          const done = i < letterIdx;
          const active = i === letterIdx;
          const silent = tracingOnly || !isLetterSoundIntroduced(l, classConfig);
          return (
            <div
              key={l}
              className={`relative w-8 h-8 rounded-lg font-bold flex items-center justify-center text-base border-2 transition shrink-0 ${
                done ? 'bg-green-100 border-green-300 text-green-700'
                : active ? 'bg-indigo-500 border-indigo-500 text-white shadow'
                : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {l}
              {silent && <span className="absolute -top-1.5 -right-1.5 text-[8px]">🔇</span>}
            </div>
          );
        })}
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center">
        {sizeMode === 'paper' ? (
          <LetterTracingCanvas
            key={`${traceKey}-${currentLetter}-${phaseIdx}-${line}-paper`}
            letter={currentLetter}
            lang={lang}
            strokes={letterData.strokes}
            copies={copies}
            activeCopy={letterIdx}
            renderWidth={fitCopyWidth}
            showGuide={showGuide}
            freehandMode={freehandMode}
            dotOnly={dotOnly}
            silent={letterSilent}
            onComplete={handleComplete}
            onAccuracy={() => {}}
            onReset={() => {}}
            onAttempt={handleAttempt}
            pastCopyStrokes={lineStrokes}
            redoOnAmber
            wobbleRadius={60}
            offTravelBudget={150}
          />
        ) : (
          <LetterTracingCanvas
            key={`${traceKey}-${currentLetter}-${phaseIdx}-${line}-big`}
            letter={currentLetter}
            lang={lang}
            strokes={letterData.strokes}
            renderWidth={600}
            practiceCopies={1}
            activeCopy={0}
            showGuide={showGuide}
            freehandMode={freehandMode}
            dotOnly={dotOnly}
            silent={letterSilent}
            fillHeight
            onComplete={handleComplete}
            onAccuracy={() => {}}
            onReset={() => {}}
            onAttempt={handleAttempt}
            redoOnAmber
            wobbleRadius={60}
            offTravelBudget={150}
          />
        )}
      </div>

      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2 bg-white">
            {celebrate.big ? <Sparkles className="w-10 h-10 text-amber-400" /> : <div className="text-4xl">✏️</div>}
            <div className="text-2xl font-black text-slate-800">{celebrate.msg}</div>
          </div>
        </div>
      )}
    </div>
  );
}