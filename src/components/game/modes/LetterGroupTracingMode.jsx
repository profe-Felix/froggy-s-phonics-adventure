import { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { ArrowLeft, Coins, Check, Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '../../data/numberWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { getLanguage } from '@/lib/language';
import { useCoinAward } from '@/hooks/useCoinAward';
import { LETTER_FORMATION_GROUPS, isLetterSoundIntroduced } from '@/lib/literacy/letterFormationGroups';

// Letter Tracing GROUP practice (game mode / free play). Students trace a
// formation family together — all its letters on one "line", in pedagogical
// order — through three phases, then earn a 30-coin set bonus.
//
//   Phase 1 "guided"   — 6 lines, dot-guide tracing.
//   Phase 2 "practice" — 6 lines, faint model + starting dot (no breadcrumb).
//   Phase 3 "mixed"    — 6 lines, alternating guided / freehand (3 pairs).
//
// Each "line" cycles through every letter in the group once. Completing all
// three phases completes the set. The 30-coin bonus is awarded once per set
// per cycle; a set only pays again after EVERY enabled set has been finished
// once (letter_group_awarded_sets on the student record tracks the cycle).
//
// Lesson steps and tracing locks still use the single-letter LetterTracingMode
// (they pass `targets`); this component is only used for free play.

const LINES_PER_PHASE = 6;
const COIN_REWARD = 30;

const PHASES = [
  { key: 'guided', label: 'Trace', desc: 'Follow the dot guide' },
  { key: 'practice', label: 'Practice', desc: 'Copy the model — no dots' },
  { key: 'alternating', label: 'Mixed', desc: 'Alternate trace & write' },
];

export default function LetterGroupTracingMode({ studentData, onStudentPatch, classConfig, tracingOnly, onBack }) {
  const [enabledGroups, setEnabledGroups] = useState([]);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const [selectedKey, setSelectedKey] = useState(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [line, setLine] = useState(0);
  const [letterIdx, setLetterIdx] = useState(0);
  const [traceKey, setTraceKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

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

  // Load teacher-enabled groups for this class (fall back to default).
  useEffect(() => {
    let cancelled = false;
    const cls = studentData?.class_name;
    const load = async () => {
      try {
        if (cls) {
          const perClass = await base44.entities.TracingSettings.filter({ scope: cls });
          if (cancelled) return;
          if (perClass?.length && Array.isArray(perClass[0].enabled_groups) && perClass[0].enabled_groups.length) {
            setEnabledGroups(perClass[0].enabled_groups);
            return;
          }
        }
        const def = await base44.entities.TracingSettings.filter({ scope: 'default' });
        if (cancelled) return;
        if (def?.length && Array.isArray(def[0].enabled_groups)) {
          setEnabledGroups(def[0].enabled_groups);
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

  // ── GROUP PICKER ──────────────────────────────────────────────────────
  if (!selectedKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4 gap-4">
        {onBack && (
          <button onClick={onBack} className="self-start text-slate-500 hover:text-slate-800 text-sm font-bold flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Modes
          </button>
        )}
        <div className="text-center">
          <div className="text-4xl mb-1">✏️</div>
          <h1 className="text-2xl font-bold text-slate-800">Letter Tracing</h1>
          <p className="text-slate-500 text-sm mt-1">Practice letter families together. Finish a set to earn {COIN_REWARD} coins!</p>
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
                    <Coins className="w-3.5 h-3.5" /> +{COIN_REWARD} coins
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
      setLine(nextLine); setLetterIdx(0);
      setTraceKey((k) => k + 1);
      persistProgress(phaseIdx, nextLine, 0);
      return;
    }
    const nextPhase = phaseIdx + 1;
    if (nextPhase < PHASES.length) {
      setPhaseIdx(nextPhase); setLine(0); setLetterIdx(0);
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
    if (pay) awardCoins(COIN_REWARD);
    let newAwarded;
    if (allDone) newAwarded = [selectedKey]; // cycle reset
    else { const s = new Set(awarded); s.add(selectedKey); newAwarded = [...s]; }
    const prog = { ...(studentData.letter_group_progress || {}) };
    delete prog[selectedKey];
    onStudentPatch?.({ letter_group_awarded_sets: newAwarded, letter_group_progress: prog });
    setCelebrate({ msg: pay ? `Set complete! +${COIN_REWARD} coins!` : 'Set complete!', big: true });
    confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
    setTimeout(() => { setCelebrate(null); setSelectedKey(null); }, 1900);
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
    <div className="h-full bg-slate-50 flex flex-col items-center py-1.5 px-3 gap-1">
      {/* Top bar */}
      <div className="flex items-center justify-between w-full max-w-3xl gap-2 shrink-0">
        <button
          onClick={() => setSelectedKey(null)}
          className="text-slate-500 hover:text-slate-800 text-xs font-bold whitespace-nowrap"
        >
          ← {currentGroup.label}
        </button>
        <div className="flex items-center gap-2">
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

      {/* Letter progress row — the "line" of letters in pedagogical order */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center shrink-0">
        {letters.map((l, i) => {
          const done = i < letterIdx;
          const active = i === letterIdx;
          const silent = tracingOnly || !isLetterSoundIntroduced(l, classConfig);
          return (
            <div
              key={l}
              className={`w-9 h-9 rounded-lg font-bold flex items-center justify-center text-lg border-2 transition ${
                done ? 'bg-green-100 border-green-300 text-green-700'
                : active ? 'bg-indigo-500 border-indigo-500 text-white shadow'
                : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {l}
              {silent && <span className="absolute -mt-5 ml-5 text-[8px]">🔇</span>}
            </div>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-hidden flex items-center justify-center">
        <LetterTracingCanvas
          key={`${traceKey}-${currentLetter}-${phaseIdx}-${line}`}
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
        />
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