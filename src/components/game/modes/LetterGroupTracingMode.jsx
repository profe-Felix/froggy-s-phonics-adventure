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
import { inchesToCssPx } from '@/lib/physicalSize';
import { useViewportScale } from '@/hooks/useViewportScale';
import GroupTracingSizeChoice from '@/components/tracing/GroupTracingSizeChoice';

// Letter Tracing GROUP practice (game mode / free play). Students trace a
// formation family one letter at a time — each letter gets its own row of
// COPIES_PER_LETTER copies so the same letter is practiced back-to-back
// before moving to the next — through three phases, then earn a coin bonus.
//
//   Phase 1 "guided"   — one row per letter, dot-guide tracing.
//   Phase 2 "practice" — one row per letter, faint model + starting dot.
//   Phase 3 "mixed"    — one row per letter, alternating guided / freehand.
//
// SIZE CHOICE:
//   "medium" — five copies on a scrolling line, at the Medium tracing tier.
//   "big"    — one letter at a time, at the next larger (Big) tracing tier.
// Existing set rewards and cycle rules are unchanged.
const COPIES_PER_LETTER = 5;
const REWARD = { medium: 30, big: 10 };
const MEDIUM_HEIGHT_IN = 2.5;
const BIG_HEIGHT_IN = 3.3;
const SINGLE_CANVAS_ASPECT = (300 + 260) / 375;

const PHASES = [
  { key: 'guided', label: 'Trace', desc: 'Follow the dot guide' },
  { key: 'practice', label: 'Practice', desc: 'Copy the model — no dots' },
  { key: 'alternating', label: 'Mixed', desc: 'Alternate trace & write' },
];

export default function LetterGroupTracingMode({ studentData, onStudentPatch, classConfig, tracingOnly, onBack }) {
  const viewportScale = useViewportScale();
  const [enabledGroups, setEnabledGroups] = useState([]);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const [selectedKey, setSelectedKey] = useState(null);
  const [sizeMode, setSizeMode] = useState('medium'); // 'medium' | 'big'
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [letterIdx, setLetterIdx] = useState(0); // which letter (row) within the phase
  const [copyIdx, setCopyIdx] = useState(0);      // which copy of that letter (0..4)
  const [traceKey, setTraceKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  // Per-letterIdx saved strokes for the CURRENT line, so completed letters
  // keep showing the student's actual ink (not a green guide outline).
  const [lineStrokes, setLineStrokes] = useState([]);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Keep the guide plus one Big letter visible on narrow screens. Medium
  // scales proportionally, with its remaining copies scrolling inside the row.
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

  const persistProgress = (pIdx, li, ci) => {
    if (!studentData?.id || !selectedKey) return;
    const prog = { ...(studentData.letter_group_progress || {}) };
    prog[selectedKey] = { phase: pIdx, letterIdx: li, copyIdx: ci };
    onStudentPatch?.({ letter_group_progress: prog });
  };

  const selectGroup = (g) => {
    setSelectedKey(g.key);
    const saved = studentData?.letter_group_progress?.[g.key];
    if (saved && typeof saved === 'object' && (saved.phase || saved.letterIdx || saved.copyIdx)) {
      setPhaseIdx(Math.min(PHASES.length - 1, saved.phase || 0));
      setLetterIdx(Math.max(0, saved.letterIdx || 0));
      setCopyIdx(Math.max(0, saved.copyIdx || 0));
    } else {
      setPhaseIdx(0); setLetterIdx(0); setCopyIdx(0);
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

        <GroupTracingSizeChoice value={sizeMode} onChange={setSizeMode} rewards={REWARD} />

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
              const resume = !awarded && prog && (prog.phase || prog.letterIdx || prog.copyIdx);
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

  // Alternating phase: even letter-rows guided, odd rows freehand.
  const isGuidedLine = phase.key === 'guided' || (phase.key === 'alternating' && letterIdx % 2 === 0);
  const showGuide = isGuidedLine;
  const freehandMode = !isGuidedLine;
  const dotOnly = !isGuidedLine; // freehand lines show a faint model + starting dot
  const letterSilent = tracingOnly || !isLetterSoundIntroduced(currentLetter, classConfig);

  // One row per letter per phase; each row = COPIES_PER_LETTER copies of that
  // letter so the same letter is practiced back-to-back before moving on.
  const linesPerPhase = letters.length;
  const totalLines = linesPerPhase * PHASES.length;
  const doneLines = phaseIdx * linesPerPhase + letterIdx;
  const sectionProgress = Math.round((doneLines / totalLines) * 100);

  // Medium row: five copies of the same letter. Scroll rather than shrinking
  // the letters to fit every copy on screen.
  const copies = Array.from({ length: COPIES_PER_LETTER }, () => ({
    letter: currentLetter,
    strokes: letterData?.strokes || [],
  }));
  const availableWidth = wrapW || Math.max(1, window.innerWidth - 24);
  const bigHeight = Math.min(
    inchesToCssPx(BIG_HEIGHT_IN) / viewportScale,
    Math.max(1, availableWidth - 8) / SINGLE_CANVAS_ASPECT
  );
  const mediumHeight = Math.min(
    inchesToCssPx(MEDIUM_HEIGHT_IN) / viewportScale,
    bigHeight * (MEDIUM_HEIGHT_IN / BIG_HEIGHT_IN)
  );

  const handleComplete = () => {
    // Advance through the copies of the current letter first (back-to-back),
    // then move to the next letter (next row), then the next phase.
    const nextCopy = copyIdx + 1;
    if (nextCopy < COPIES_PER_LETTER) {
      setCopyIdx(nextCopy);
      setTraceKey((k) => k + 1);
      persistProgress(phaseIdx, letterIdx, nextCopy);
      return;
    }
    const nextLetter = letterIdx + 1;
    if (nextLetter < letters.length) {
      setLetterIdx(nextLetter); setCopyIdx(0); setLineStrokes([]);
      setTraceKey((k) => k + 1);
      persistProgress(phaseIdx, nextLetter, 0);
      return;
    }
    const nextPhase = phaseIdx + 1;
    if (nextPhase < PHASES.length) {
      setPhaseIdx(nextPhase); setLetterIdx(0); setCopyIdx(0); setLineStrokes([]);
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
      next[copyIdx] = strokes;
      return next;
    });
    if (!studentData?.student_number || !studentData?.class_name || !currentLetter) return;
    // Normalize strokes to 0-1 per letter (subtract this copy's offset).
    const copyOffset = (sizeMode === 'medium' ? copyIdx : 0) * (300 + 24) + 260;
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
      size_label: sizeMode === 'medium' ? 'Medium' : 'Big',
      source: 'group',
      group_key: selectedKey,
      accuracy: accuracy || 0,
      guided: isGuidedLine,
      // Keep the existing row/single storage values compatible with saved samples.
      size_mode: sizeMode === 'medium' ? 'paper' : 'big',
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
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{sizeMode === 'medium' ? 'Medium' : 'Big'}</span>
          <div className="text-[11px] text-slate-400 font-bold leading-none">{phase.label} · {currentLetter} · {copyIdx + 1}/{COPIES_PER_LETTER}</div>
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

      {/* Letter progress row — family order and sound status in both sizes. */}
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
        {sizeMode === 'medium' ? (
          <div className="h-full w-full min-h-0 min-w-0">
          <LetterTracingCanvas
            key={`${traceKey}-${currentLetter}-${phaseIdx}-${letterIdx}-${copyIdx}-medium`}
            letter={currentLetter}
            lang={lang}
            strokes={letterData.strokes}
            copies={copies}
            activeCopy={copyIdx}
            fillHeight
            writingHeight={mediumHeight}
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
          </div>
        ) : (
          <LetterTracingCanvas
            key={`${traceKey}-${currentLetter}-${phaseIdx}-${letterIdx}-${copyIdx}-big`}
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
            writingHeight={bigHeight}
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