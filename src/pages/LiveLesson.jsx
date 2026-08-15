import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Lock, Unlock, ChevronLeft, ChevronRight, X, Radio, Users } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import TeacherModelPanel from '@/components/live/TeacherModelPanel';

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

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-rose-400 font-black text-xl">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
              LIVE
            </span>
            <h1 className="text-xl font-bold">{session.lesson_title || 'Live Lesson'}</h1>
          </div>
          <Button onClick={endSession} className="bg-red-500 hover:bg-red-600 text-white font-bold">
            <X className="w-4 h-4 mr-1" /> End Session
          </Button>
        </div>

        {phase === 'watch' && (
          <div className="bg-slate-800 rounded-2xl p-4 mb-5">
            <div className="text-xs text-gray-400 font-bold mb-2 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> MODELING — student iPads mirror this screen
            </div>
            <div className="h-[55vh] min-h-[360px] overflow-auto">
              <TeacherModelPanel step={currentStep} send={send} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* QR + join code */}
          <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
            <div className="text-gray-800 font-bold text-sm flex items-center gap-1"><Users className="w-4 h-4" /> Students join</div>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={joinUrl} size={160} />
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
          </div>

          {/* Current step + controls */}
          <div className="md:col-span-2 bg-slate-800 rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <div className="text-xs text-gray-400 font-bold mb-1">
                Step {(session.current_step || 0) + 1} of {steps.length}
              </div>
              {currentStep ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{currentStep.emoji || '▶'}</span>
                  <div>
                    <div className="font-black text-lg">{currentStep.title}</div>
                    <div className="text-xs text-gray-400">{currentStep.mode}</div>
                  </div>
                </div>
              ) : <div className="text-gray-400">No step</div>}
            </div>

            {/* Phase toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setPhase('watch')}
                className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition ${
                  phase === 'watch' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-700 text-gray-300 border-slate-600'
                }`}
              >
                <Lock className="w-4 h-4" /> Watch (locked)
              </button>
              <button
                onClick={() => setPhase('try')}
                className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition ${
                  phase === 'try' ? 'bg-green-500 text-white border-green-500' : 'bg-slate-700 text-gray-300 border-slate-600'
                }`}
              >
                <Unlock className="w-4 h-4" /> Try (released)
              </button>
            </div>

            {/* Step navigation */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => advance(-1)}
                disabled={(session.current_step || 0) === 0}
                className="bg-slate-700 hover:bg-slate-600 text-white"
              >
                <ChevronLeft className="w-5 h-5" /> Prev
              </Button>
              <div className="flex-1 flex flex-wrap gap-1 justify-center">
                {steps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => goToStep(i)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                      i === (session.current_step || 0) ? 'bg-rose-500 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button
                onClick={() => advance(1)}
                disabled={(session.current_step || 0) >= steps.length - 1}
                className="bg-slate-700 hover:bg-slate-600 text-white"
              >
                Next <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Phase hint */}
            <div className={`rounded-xl p-3 text-sm font-bold flex items-center gap-2 ${
              phase === 'watch' ? 'bg-amber-900/40 text-amber-200' : 'bg-green-900/40 text-green-200'
            }`}>
              {phase === 'watch'
                ? <><Eye className="w-4 h-4" /> Students are watching — their screens are locked.</>
                : <><Unlock className="w-4 h-4" /> Students can try the activity on their iPads now.</>}
            </div>
          </div>
        </div>

        {/* Step list preview */}
        <div className="mt-5 bg-slate-800 rounded-2xl p-4">
          <div className="text-xs text-gray-400 font-bold mb-2">LESSON STEPS</div>
          <div className="flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                i === (session.current_step || 0) ? 'bg-rose-500/20 text-white' : 'text-gray-400'
              }`}>
                <span className="w-6 text-center font-bold">{i + 1}</span>
                <span>{s.emoji || '▶'}</span>
                <span className="flex-1">{s.title}</span>
                <span className="text-xs text-gray-500">{s.mode}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}