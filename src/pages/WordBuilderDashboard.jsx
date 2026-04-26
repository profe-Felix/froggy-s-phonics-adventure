import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CLASSES = ['F', 'V', 'C'];

// ─── Replay viewer ────────────────────────────────────────────────────────────
function ReplayViewer({ attempt, onClose }) {
  const events = (() => { try { return JSON.parse(attempt.events_data || '[]'); } catch { return []; } })();
  const problems = (() => { try { return JSON.parse(attempt.problems_data || '[]'); } catch { return []; } })();
  const [step, setStep] = useState(events.length); // start at final state
  const [playing, setPlaying] = useState(false);
  const playRef = React.useRef(null);

  // Reconstruct tile state at a given event step
  const stateAtStep = (targetStep) => {
    // Start from empty rows
    const rows = Array.from({ length: attempt.num_problems || problems.length }, () => []);
    for (let i = 0; i < Math.min(targetStep, events.length); i++) {
      const ev = events[i];
      const pi = ev.problemIdx ?? 0;
      if (!rows[pi]) rows[pi] = [];
      if (ev.type === 'place') {
        const ins = ev.insertIdx >= 0 ? Math.min(ev.insertIdx, rows[pi].length) : rows[pi].length;
        rows[pi].splice(ins, 0, { type: 'text', value: ev.tileValue });
      } else if (ev.type === 'remove') {
        if (ev.tileIdx !== undefined) rows[pi].splice(ev.tileIdx, 1);
        else rows[pi].pop();
      } else if (ev.type === 'reorder') {
        const from = ev.from ?? 0;
        const to = ev.to ?? 0;
        if (from >= 0 && from < rows[pi].length) {
          const [moved] = rows[pi].splice(from, 1);
          const ins = Math.max(0, Math.min(to, rows[pi].length));
          rows[pi].splice(ins, 0, moved);
        }
      }
    }
    return rows;
  };

  const currentRows = stateAtStep(step);

  React.useEffect(() => {
    if (!playing) return;
    if (step >= events.length) { setPlaying(false); return; }
    const nextEvent = events[step];
    const delay = step === 0 ? 600 : Math.min(Math.max((nextEvent.t - (events[step-1]?.t || 0)) * 0.5, 200), 1200);
    playRef.current = setTimeout(() => setStep(s => s + 1), delay);
    return () => clearTimeout(playRef.current);
  }, [playing, step, events]);

  const togglePlay = () => {
    if (step >= events.length) { setStep(0); setPlaying(true); }
    else setPlaying(p => !p);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 p-4 border-b">
          <h2 className="font-black text-gray-800 flex-1">
            Replay — Estudiante #{attempt.student_number} · Clase {attempt.class_name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 font-bold text-xl">✕</button>
        </div>

        {/* Replay canvas */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {currentRows.map((tiles, pi) => (
            <div key={pi} className="mb-3">
              <div className="flex items-center gap-1 flex-wrap bg-white border-2 border-gray-200 rounded-xl px-3 py-2 min-h-[52px]">
                <span className="text-gray-400 text-xs font-bold mr-1">{pi+1}.</span>
                {tiles.map((t, ti) => (
                  <span key={ti} style={{ fontFamily: 'Andika, system-ui, sans-serif', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {t.value}
                  </span>
                ))}
                {tiles.length === 0 && <span className="text-gray-300 text-sm">—</span>}
              </div>
              {problems[pi] && (
                <div className="text-xs text-gray-400 mt-0.5 ml-2">
                  Esperado: <span className="font-bold text-gray-600">{problems[pi].expected || '—'}</span>
                  {' · '}
                  <span className={problems[pi].isCorrect ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {problems[pi].isCorrect ? '✓ Correcto' : '✗ Incorrecto'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="p-4 border-t flex flex-col gap-2">
          <input type="range" min={0} max={events.length} value={step}
            onChange={e => { setPlaying(false); setStep(parseInt(e.target.value)); }}
            className="w-full accent-indigo-600" />
          <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
            <span>Evento {step} / {events.length}</span>
            {step < events.length && <span>{(events[step]?.t / 1000).toFixed(1)}s</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPlaying(false); setStep(0); }}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">⏮ Inicio</button>
            <button onClick={togglePlay}
              className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700">
              {playing ? '⏸ Pausar' : step >= events.length ? '↩ Repetir' : '▶ Reproducir'}
            </button>
            <button onClick={() => { setPlaying(false); setStep(events.length); }}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">⏭ Final</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Student card ─────────────────────────────────────────────────────────────
function StudentCard({ studentNum, attempts, onReplay }) {
  const latest = attempts[0];
  const problems = (() => { try { return JSON.parse(latest?.problems_data || '[]'); } catch { return []; } })();
  const allCorrect = latest?.all_correct;

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm p-3 flex flex-col gap-2 ${allCorrect ? 'border-green-400' : latest ? 'border-orange-300' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <span className="font-black text-gray-800 text-lg">#{studentNum}</span>
        {latest && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allCorrect ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {allCorrect ? '✓ Correcto' : '✗ Revisión'}
          </span>
        )}
        {!latest && <span className="text-xs text-gray-300 font-bold">Sin envío</span>}
      </div>

      {/* Final answer preview */}
      {problems.length > 0 && (
        <div className="flex flex-col gap-1">
          {problems.map((p, i) => (
            <div key={i} className="text-xs flex gap-1 items-center">
              <span className={`w-3 h-3 rounded-full shrink-0 ${p.isCorrect ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="font-mono text-gray-700 truncate">{p.answer || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {latest && (
        <button onClick={() => onReplay(latest)}
          className="text-xs bg-indigo-50 text-indigo-700 font-bold rounded-lg px-2 py-1 hover:bg-indigo-100 transition-colors">
          ▶ Ver replay ({attempts.length} envío{attempts.length !== 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function WordBuilderDashboard() {
  const [selectedClass, setSelectedClass] = useState('F');
  const [selectedPreset, setSelectedPreset] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [replayAttempt, setReplayAttempt] = useState(null);

  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ['wb-attempts', selectedClass],
    queryFn: () => base44.entities.WordBuilderAttempt.filter({ class_name: selectedClass }, '-submitted_at', 200),
    refetchInterval: 15000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['wb-sessions', selectedClass],
    queryFn: () => base44.entities.WordBuilderSession.filter({ class_name: selectedClass }),
    refetchInterval: 15000,
  });

  // Get unique presets
  const presets = ['all', ...new Set(attempts.map(a => a.preset_id).filter(Boolean))];

  const filtered = selectedPreset === 'all' ? attempts : attempts.filter(a => a.preset_id === selectedPreset);

  // Group by student
  const byStudent = {};
  filtered.forEach(a => {
    if (!byStudent[a.student_number]) byStudent[a.student_number] = [];
    byStudent[a.student_number].push(a);
  });

  // Active sessions (not yet submitted)
  const activeSessions = sessions.filter(s => !s.submitted);

  const studentFilter = selectedStudent !== null
    ? Object.fromEntries(Object.entries(byStudent).filter(([k]) => parseInt(k) === selectedStudent))
    : byStudent;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold text-sm">← Dashboard</Link>
          <h1 className="text-xl font-black text-gray-800">🧩 Word Builder — Resultados</h1>
          <div className="flex-1" />
          <div className="flex gap-2 flex-wrap">
            {CLASSES.map(c => (
              <button key={c} onClick={() => setSelectedClass(c)}
                className={`px-4 py-1.5 rounded-full font-bold text-sm transition-all ${selectedClass===c ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-indigo-50'}`}>
                Clase {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center bg-white rounded-2xl p-3 border border-gray-200 shadow-sm">
          <span className="text-sm font-bold text-gray-500">Lección:</span>
          {presets.map(p => (
            <button key={p} onClick={() => setSelectedPreset(p)}
              className={`px-3 py-1 rounded-full text-sm font-bold transition-all ${selectedPreset===p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'}`}>
              {p === 'all' ? 'Todas' : p}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-sm font-bold text-gray-500">Filtrar estudiante:</span>
          <select value={selectedStudent ?? ''} onChange={e => setSelectedStudent(e.target.value ? parseInt(e.target.value) : null)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
            <option value="">Todos</option>
            {Array.from({length:30},(_,i)=>i+1).map(n => (
              <option key={n} value={n}>#{n}</option>
            ))}
          </select>
        </div>

        {/* Active sessions summary */}
        {activeSessions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
            <p className="text-sm font-bold text-blue-700 mb-2">🟢 Trabajando ahora ({activeSessions.length} estudiantes)</p>
            <div className="flex flex-wrap gap-2">
              {activeSessions.map(s => (
                <span key={s.id} className="bg-blue-100 text-blue-800 font-bold text-xs px-2 py-1 rounded-full">
                  #{s.student_number}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-indigo-600">{Object.keys(byStudent).length}</p>
            <p className="text-xs text-gray-500 font-bold mt-1">Estudiantes con envíos</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-green-600">{Object.values(byStudent).filter(a=>a[0]?.all_correct).length}</p>
            <p className="text-xs text-gray-500 font-bold mt-1">Todo correcto</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-gray-700">{filtered.length}</p>
            <p className="text-xs text-gray-500 font-bold mt-1">Total envíos</p>
          </div>
        </div>

        {/* Student grid */}
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({length:30},(_,i)=>i+1)
              .filter(n => selectedStudent === null || n === selectedStudent)
              .map(n => (
                <StudentCard
                  key={n}
                  studentNum={n}
                  attempts={studentFilter[n] || []}
                  onReplay={setReplayAttempt}
                />
              ))}
          </div>
        )}
      </main>

      {replayAttempt && (
        <ReplayViewer attempt={replayAttempt} onClose={() => setReplayAttempt(null)} />
      )}
    </div>
  );
}