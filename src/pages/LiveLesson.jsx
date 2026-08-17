import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Unlock, ChevronLeft, ChevronRight, X, Radio, Users } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import TeacherModelPanel from '@/components/live/TeacherModelPanel';
import TryDashboard from '@/components/live/TryDashboard';

const CLASSES = ['Valero', 'Felix', 'Gutierrez', 'Schwarz', 'Campos', 'Mendez', 'Aguirre', 'Jimenez'];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function LiveLesson() {
  const [session, setSession] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [className, setClassName] = useState('');
  const [targetMode, setTargetMode] = useState('class');
  const [pickedStudents, setPickedStudents] = useState([]);
  const [starting, setStarting] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons-all-live'],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  const { data: classStudents = [] } = useQuery({
    queryKey: ['class-students-live', className],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!className,
  });

  // Real-time subscription to the active session (roster + phase sync)
  useEffect(() => {
    if (!session?.id) return;
    const unsub = base44.entities.LiveLessonSession.subscribe((event) => {
      if (event.data?.id === session.id) {
        setSession(event.data);
        if (event.type === 'delete' || !event.data?.active) {
          setSession(null);
        }
      }
    });
    return unsub;
  }, [session?.id]);

  const { send, clear: clearBroadcast } = useLiveBroadcast(session?.id);

  const startSession = async () => {
    if (!selectedLessonId || !className) return;
    setStarting(true);
    let code = genCode();
    // avoid rare collisions
    const existing = await base44.entities.LiveLessonSession.filter({ code, active: true });
    if (existing?.length) code = genCode();
    const target = targetMode === 'group' ? pickedStudents : [];
    const created = await base44.entities.LiveLessonSession.create({
      code,
      lesson_id: selectedLessonId,
      lesson_title: selectedLesson?.title || '',
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
      target_students: target,
      current_step: 0,
      phase: 'watch',
      active: true,
      started_at: new Date().toISOString(),
      joined_students: [],
    });
    setSession(created);
    setStarting(false);
  };

  const updateSession = async (patch) => {
    if (!session?.id) return;
    setSession(prev => prev ? { ...prev, ...patch } : prev);
    try { await base44.entities.LiveLessonSession.update(session.id, patch); } catch {}
  };

  const advance = (dir) => {
    const steps = selectedLesson?.steps || [];
    if (!steps.length) return;
    const next = Math.max(0, Math.min(steps.length - 1, (session.current_step || 0) + dir));
    clearBroadcast();
    updateSession({ current_step: next, phase: 'watch' });
  };

  const goToStep = (i) => {
    clearBroadcast();
    updateSession({ current_step: i, phase: 'watch' });
  };

  const setPhase = (p) => {
    if (p === 'try') clearBroadcast();
    updateSession({ phase: p });
  };

  const endSession = async () => {
    await updateSession({ active: false });
    setSession(null);
    setSelectedLessonId('');
    setClassName('');
    setPickedStudents([]);
    setTargetMode('class');
    setShowQR(false);
  };

  const toggleStudent = (s) => {
    const key = `${s.class_name}:${s.student_number}`;
    setPickedStudents(prev => {
      const exists = prev.some(p => `${p.class_name}:${p.student_number}` === key);
      return exists
        ? prev.filter(p => `${p.class_name}:${p.student_number}` !== key)
        : [...prev, { class_name: s.class_name, student_number: s.student_number }];
    });
  };

  // ---------- SETUP SCREEN ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/Lessons" className="text-rose-600 hover:underline font-bold text-sm"><ArrowLeft className="w-4 h-4 inline mr-1" />Lessons</Link>
            <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2"><Radio className="w-7 h-7 text-rose-500" /> Live Lesson</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">1. Pick a lesson</label>
              <select
                value={selectedLessonId}
                onChange={e => setSelectedLessonId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium"
              >
                <option value="">Select a lesson…</option>
                {lessons.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title} ({(l.steps || []).length} steps)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">2. Pick a class</label>
              <div className="grid grid-cols-4 gap-2">
                {CLASSES.map(c => (
                  <button
                    key={c}
                    onClick={() => setClassName(c)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
                      className === c ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">3. Who joins?</label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setTargetMode('class')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'class' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Whole class
                </button>
                <button
                  onClick={() => setTargetMode('group')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'group' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Small group
                </button>
              </div>

              {targetMode === 'group' && className && (
                <div className="border-2 border-gray-100 rounded-xl p-3 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-6 gap-2">
                    {classStudents.map(s => {
                      const picked = pickedStudents.some(p => p.class_name === s.class_name && p.student_number === s.student_number);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleStudent(s)}
                          className={`h-11 rounded-lg font-bold text-sm border-2 transition ${
                            picked ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                          }`}
                        >
                          {s.student_number}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{pickedStudents.length} student(s) selected</p>
                </div>
              )}
            </div>

            <Button
              onClick={startSession}
              disabled={!selectedLessonId || !className || starting}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black text-lg py-3"
            >
              <Radio className="w-5 h-5 mr-2" />
              {starting ? 'Starting…' : 'Start Live Lesson'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- LIVE CONTROL SCREEN ----------
  const steps = selectedLesson?.steps || [];
  const currentStep = steps[session.current_step || 0];
  const phase = session.phase || 'watch';
  const joinUrl = `${window.location.origin}/?live=${session.code}&class=${encodeURIComponent(session.class_name)}`;
  const isLocked = phase === 'watch';

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-2 text-rose-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />LIVE
          </span>
          <h1 className="text-base font-bold truncate">{session.lesson_title || 'Live Lesson'}</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">· {session.class_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowQR(v => !v)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            <Users className="w-4 h-4" /> Join
          </button>
          <button
            onClick={() => setPhase(isLocked ? 'try' : 'watch')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
              isLocked ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                       : 'bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/30'
            }`}
            title={isLocked ? 'Students locked — tap to release' : 'Students released — tap to lock'}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            {isLocked ? 'Locked' : 'Released'}
          </button>
          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" /> End
          </button>
        </div>
      </div>

      {/* Main modeling area — fills the screen */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-900">
        {phase === 'watch' ? (
          <TeacherModelPanel step={currentStep} send={send} />
        ) : (
          <TryDashboard session={session} />
        )}
      </div>

      {/* Bottom step toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/70 border-t border-slate-800 shrink-0">
        <button
          onClick={() => advance(-1)}
          disabled={(session.current_step || 0) === 0}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto justify-center">
          {steps.map((s, i) => {
            const active = i === (session.current_step || 0);
            return (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition ${
                  active ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title={s.title}
              >
                <span className="text-base leading-none">{s.emoji || '▶'}</span>
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => advance(1)}
          disabled={(session.current_step || 0) >= steps.length - 1}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* QR + join code popover — shown on demand */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <div className="text-gray-800 font-bold text-sm flex items-center gap-1.5"><Users className="w-4 h-4" /> Students join</div>
            <div className="bg-white p-1 rounded-xl">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 font-bold">OR enter code</div>
              <div className="text-3xl font-black text-gray-800 tracking-widest">{session.code}</div>
            </div>
            <div className="text-xs text-gray-400 text-center">
              {targetMode === 'group'
                ? `Small group: ${session.target_students?.length || 0} students`
                : `Whole class: ${session.class_name}`}
            </div>
            <button onClick={() => setShowQR(false)} className="mt-1 px-4 h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}