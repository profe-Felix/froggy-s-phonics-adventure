import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StudentLogin from '../components/game/StudentLogin';
import ModeSelection from '../components/game/ModeSelection';
import LetterSoundsMode from '../components/game/modes/LetterSoundsMode';
import SightWordsEasyMode from '../components/game/modes/SightWordsEasyMode';
import SightWordsSpellingMode from '../components/game/modes/SightWordsSpellingMode';
import SpellingMode from '../components/game/modes/SpellingMode';
import CaseMatchingMode from '../components/game/modes/CaseMatchingMode';
import LetterTracingMode from '../components/game/modes/LetterTracingMode';
import NumberHearingMode from '../components/game/modes/NumberHearingMode';
import PhonicsMode from '../components/game/modes/PhonicsMode';
import SpanishReadingGame from '../components/game/spanishReading/SpanishReadingGame';
import SentencesMode from '../components/game/modes/SentencesMode';
import MissingLetterMode from '../components/game/modes/MissingLetterMode';
import SyllableCountMode from '../components/game/modes/SyllableCountMode';
import StoryBuilder from '../pages/StoryBuilder';
import BookReading from '../pages/BookReading';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { ALL_PETS } from '../components/game/avatar/PETS_DATA';
import { getNewFruits, FRUIT_LIST } from '../components/game/FruitCollection';
import LessonMap from '../components/lesson/LessonMap';
import LessonModeRouter from '../components/lesson/LessonModeRouter';
import GameHome from '../components/lesson/GameHome';
import LiveLessonStudent from '@/components/live/LiveLessonStudent';
import { useClassColors } from '@/hooks/useClassColors';

export default function LetterGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlStudentId = urlParams.get('studentId');
  const rawClass = urlParams.get('class') || null;
  // Map all variations to canonical names
  const classMap = {
    felix: 'Felix', f: 'Felix', schwarz: 'Schwarz', gutierrez: 'Gutierrez',
    valero: 'Valero', v: 'Valero', mendez: 'Mendez', jimenez: 'Jimenez',
    campos: 'Campos', c: 'Campos', aguirre: 'Aguirre'
  };
  const urlClass = rawClass ? classMap[rawClass.toLowerCase()] || null : null;
  const urlNumber = parseInt(urlParams.get('number'));
  const urlYear = urlParams.get('year') || null;
  const liveCode = urlParams.get('live');
  const autoStudent = urlClass && urlNumber ? { number: urlNumber, class_name: urlClass } : null;

  const [selectedStudent, setSelectedStudent] = useState(urlStudentId ? 'loading_by_id' : autoStudent);
  const [directStudentId] = useState(urlStudentId);
  const [studentData, setStudentData] = useState(null);
  // Always start on the path homescreen (GameHome) when a student logs in.
  // Previously this restored the last mode from localStorage, which sent
  // students straight back into a game instead of the level path.
  const [currentMode, setCurrentMode] = useState(null);
  const [activeLessonStep, setActiveLessonStep] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const queryClient = useQueryClient();
  const { languageFor, configs, tracingOnlyFor } = useClassColors();

  // Active lessons for this student's class (class-specific or all-classes).
  const { data: lessonsForClass = [] } = useQuery({
    queryKey: ['lessons', selectedStudent?.class_name],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
    enabled: !!selectedStudent && selectedStudent !== 'loading_by_id',
  });
  const hasAssignedLesson = lessonsForClass.some(
    l => !l.class_name || l.class_name === selectedStudent?.class_name
  );

  // Detect active live lesson sessions for this student's class.
  //
  // The teacher LiveLesson page refreshes the session's updated_date every
  // 15 seconds. If we have not heard from the teacher for 90 seconds, treat
  // the session as abandoned even if its database "active" flag is still true.
  //
  // This prevents forgotten/closed teacher tabs from leaving the
  // "Your teacher started a Live Lesson!" banner stuck on student devices.
  const { data: activeLiveSessions = [] } = useQuery({
    queryKey: ['live-sessions', selectedStudent?.class_name, liveCode],

    queryFn: async () => {
      const sessions =
        await base44.entities.LiveLessonSession.filter({
          active: true,
        });

      const now = Date.now();
      const STALE_AFTER_MS = 90 * 1000;

      return (sessions || [])
        .filter(session => {
          // Base44 automatically updates updated_date whenever the teacher
          // heartbeat touches this session.
          const lastUpdate =
            session.updated_date ||
            session.started_at;

          if (!lastUpdate) return false;

          const age =
            now - new Date(lastUpdate).getTime();

          return age < STALE_AFTER_MS;
        })
        .sort((a, b) => {
          const ta = new Date(a.updated_date || a.started_at || 0).getTime();
          const tb = new Date(b.updated_date || b.started_at || 0).getTime();
          return tb - ta;
        });
    },

    enabled: !!studentData,

    // Check frequently so stale banners disappear quickly once the
    // 90-second timeout has been reached.
    refetchInterval: 3000,
  });

  // Detect active live DICTATION sessions for this student's class.
  // When the teacher starts a live dictation, redirect the student straight
  // to the DictationStudent page so they join automatically.
  const { data: activeDictationSessions = [] } = useQuery({
    queryKey: ['live-dictation-game', selectedStudent?.class_name],
    queryFn: () =>
      base44.entities.LiveDictationSession.filter({
        class_name: selectedStudent?.class_name,
        school_year: studentData?.school_year || ACTIVE_SCHOOL_YEAR,
        active: true,
      }),
    enabled: !!studentData && !!selectedStudent?.class_name,
    refetchInterval: 3000,
  });

  // Detect active tracing lock for this student's class. When locked, the
  // student is forced into Letter Tracing with only the locked letter and
  // can't navigate to other games until the teacher unlocks.
  const { data: tracingLocks = [] } = useQuery({
    queryKey: ['tracing-lock', selectedStudent?.class_name],
    queryFn: () => base44.entities.TracingLock.filter({
      class_name: selectedStudent?.class_name,
      active: true,
    }),
    enabled: !!studentData && !!selectedStudent?.class_name,
    refetchInterval: 3000,
  });
  const activeTracingLock = tracingLocks[0];

  useEffect(() => {
    if (!activeDictationSessions.length) return;
    if (liveSession) return; // don't interrupt an active live lesson
    const s = activeDictationSessions[0];
    if (!s?.assignment_id) return;
    const url = `/DictationStudent?assignment=${encodeURIComponent(s.assignment_id)}&class=${encodeURIComponent(s.class_name)}&student=${selectedStudent?.number}`;
    window.location.href = url;
  }, [activeDictationSessions, liveSession, selectedStudent]);

  // Force the student into Letter Tracing when a tracing lock is active for
  // their class. The lock takes priority over normal mode selection but not
  // over live lessons or live dictation (those are teacher-driven).
  useEffect(() => {
    if (!activeTracingLock || liveSession || activeDictationSessions.length) return;
    if (currentMode !== 'letter_tracing') {
      setCurrentMode('letter_tracing');
    }
  }, [activeTracingLock, liveSession, activeDictationSessions, currentMode]);

  useEffect(() => {
    if (!activeLiveSessions.length) return;
    // Already in a live session — don't auto-join another.
    if (liveSession) return;
    // QR deep-link: auto-join the matching session immediately.
    if (liveCode) {
      const qrMatch = activeLiveSessions.find(s => s.code === liveCode);
      if (qrMatch) { setLiveSession(qrMatch); return; }
    }
    // Auto-join: bring the student straight into any active session for their
    // class (whole class = empty target_students, or explicitly listed) instead
    // of showing a banner they have to tap.
    const classMatch = activeLiveSessions.find(s => {
      if (s.class_name !== selectedStudent?.class_name) return false;
      if (!s.target_students || s.target_students.length === 0) return true;
      return s.target_students.some(
        t => t.class_name === selectedStudent?.class_name && t.student_number === selectedStudent?.number
      );
    });
    if (classMatch) setLiveSession(classMatch);
  }, [activeLiveSessions, liveCode, selectedStudent, liveSession]);

  // Direct load by student ID (from QR code)
  const { data: directStudent } = useQuery({
    queryKey: ['student-by-id', directStudentId],
    queryFn: () => base44.entities.Student.filter({ id: directStudentId }),
    enabled: !!directStudentId,
    onSuccess: (data) => {
      if (data?.[0]) {
        setStudentData(data[0]);
        setSelectedStudent({ number: data[0].student_number, class_name: data[0].class_name });
      }
    }
  });

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => base44.entities.Student.list(),
    enabled: selectedStudent !== null && selectedStudent !== 'loading_by_id'
  });

  const createStudentMutation = useMutation({
    mutationFn: (data) => base44.entities.Student.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  });

  const updateStudentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Student.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setStudentData(data);
    },
    onError: () => {
      // Student record was deleted, reset so it gets recreated
      setStudentData(null);
      queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  });

  useEffect(() => {
    if (directStudentId && directStudent?.[0] && !studentData) {
      setStudentData(directStudent[0]);
      setSelectedStudent({ number: directStudent[0].student_number, class_name: directStudent[0].class_name });
    }
  }, [directStudent, directStudentId]);

  useEffect(() => {
    if (!selectedStudent || selectedStudent === 'loading_by_id' || !students) return;
    if (directStudentId) return; // already handled above
    if (selectedStudent && students) {
      const effectiveYear = urlYear || ACTIVE_SCHOOL_YEAR;
      const existing = students.find(
        s => s.student_number === selectedStudent.number && s.class_name === selectedStudent.class_name && s.school_year === effectiveYear
      );
      if (existing) {
        // Sync the student's content language to their class's configured
        // language (Mendez/Schwarz = English) so all literacy audio and word
        // pools pull from English on Supabase.
        const classLang = languageFor(selectedStudent.class_name);
        const langPatch = classLang && existing.language !== classLang ? { language: classLang } : {};
        if (Object.keys(langPatch).length) {
          base44.entities.Student.update(existing.id, langPatch);
        }
        if (!existing.unlocked_pets?.length) {
          // Brand new student — give starter pet
          const p = ALL_PETS[Math.floor(Math.random() * ALL_PETS.length)];
          const updates = { unlocked_pets: [p.id], active_pet: p.id, pending_pet_unlocks: existing.pending_pet_unlocks || 0 };
          base44.entities.Student.update(existing.id, updates);
          setStudentData({ ...existing, ...langPatch, ...updates });
        } else if (!existing.active_pet) {
          // Has pets but active_pet is missing — restore it from collection
          const updates = { active_pet: existing.unlocked_pets[0] };
          base44.entities.Student.update(existing.id, updates);
          setStudentData({ ...existing, ...langPatch, ...updates });
        } else {
          setStudentData({ ...existing, ...langPatch });
        }
      } else if (!urlYear || urlYear === ACTIVE_SCHOOL_YEAR) {
        const classLang = languageFor(selectedStudent.class_name) || 'es';
        const isEnglish = classLang === 'en';
        createStudentMutation.mutate({
          student_number: selectedStudent.number,
          class_name: selectedStudent.class_name,
          school_year: ACTIVE_SCHOOL_YEAR,
          language: classLang,
          mode_progress: {
            letter_sounds: {
              mastered_items: [],
              learning_items: isEnglish ? ['s', 'a', 't'] : ['o', 'i', 'a'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            },
            sight_words_easy: {
              mastered_items: [],
              learning_items: ['el'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            },
            sight_words_spelling: {
              mastered_items: [],
              learning_items: ['el', 'la', 'un'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            },
            spelling: {
              mastered_items: [],
              learning_items: ['ala', 'ama', 'amo'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            },
            case_matching: {
              mastered_items: [],
              learning_items: ['a', 'b', 'c'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            }
          },
          current_mode: 'letter_sounds',
          ...(()=>{ const p = ALL_PETS[Math.floor(Math.random()*ALL_PETS.length)]; return { unlocked_pets:[p.id], active_pet:p.id }; })(),
          pending_pet_unlocks: 0
        });
      }
    }
  }, [selectedStudent, students, configs]);

  const handleUpdateProgress = async (mode, progressData) => {
    if (!studentData) return;

    const updatedModeProgress = {
      ...studentData.mode_progress,
      [mode]: progressData
    };

    // Check if we should unlock next mode
    const currentModeData = progressData;
    const masteredCount = currentModeData.mastered_items?.length || 0;
    const successRate = currentModeData.total_attempts > 0 
      ? currentModeData.total_correct / currentModeData.total_attempts 
      : 0;

    // Unlock next mode if 5+ items mastered and 70%+ success rate
    if (masteredCount >= 5 && successRate >= 0.7) {
      const modeOrder = ['letter_sounds', 'sight_words_easy', 'sight_words_spelling', 'spelling', 'case_matching'];
      const currentIndex = modeOrder.indexOf(mode);
      const nextMode = modeOrder[currentIndex + 1];
      
      if (nextMode && updatedModeProgress[nextMode]) {
        updatedModeProgress[nextMode] = {
          ...updatedModeProgress[nextMode],
          unlocked: true,
          mastered_items: updatedModeProgress[nextMode].mastered_items || [],
          learning_items: updatedModeProgress[nextMode].learning_items || 
            (nextMode === 'sight_words_easy' ? ['el', 'la', 'un'] :
             nextMode === 'sight_words_spelling' ? ['el', 'la', 'un'] :
             nextMode === 'spelling' ? ['casa', 'gato', 'perro'] :
             ['a', 'b', 'c']),
          item_attempts: updatedModeProgress[nextMode].item_attempts || {},
          total_correct: updatedModeProgress[nextMode].total_correct || 0,
          total_attempts: updatedModeProgress[nextMode].total_attempts || 0
        };
      }
    }

    await updateStudentMutation.mutateAsync({
      id: studentData.id,
      data: {
        mode_progress: updatedModeProgress,
        current_mode: mode
      }
    });

    // Use fresh merged state as base for all subsequent calculations
    const freshStudent = { ...studentData, mode_progress: updatedModeProgress, current_mode: mode };

    // Check if a new pet milestone was reached
    const withMilestone = checkPetMilestone(freshStudent);
    const petUpdates = withMilestone.pending_pet_unlocks !== (studentData.pending_pet_unlocks || 0)
      ? { pending_pet_unlocks: withMilestone.pending_pet_unlocks }
      : {};

    // Check fruit milestones for spelling modes
    const spellingModes = ['spelling', 'sight_words_spelling'];
    let fruitUpdates = {};
    if (spellingModes.includes(mode)) {
      const addedPts = (updatedModeProgress[mode]?.total_correct || 0) - (studentData.mode_progress?.[mode]?.total_correct || 0);
      if (addedPts > 0) {
        const oldTotal = studentData.spelling_total_points || 0;
        const newTotal = oldTotal + addedPts;
        const currentFruits = studentData.unlocked_fruits || [];
        const newFruits = getNewFruits(oldTotal, newTotal, currentFruits);
        fruitUpdates = newFruits.length > 0
          ? { spelling_total_points: newTotal, unlocked_fruits: [...currentFruits, ...newFruits] }
          : { spelling_total_points: newTotal };
      }
    }

    const combined = { ...petUpdates, ...fruitUpdates };
    if (Object.keys(combined).length > 0) {
      await base44.entities.Student.update(studentData.id, combined);
    }
    // Always update local state with the freshest merged data
    setStudentData({ ...freshStudent, ...combined });
  };

  const handleSetLanguage = async (language) => {
    if (!studentData?.id) return;
    await base44.entities.Student.update(studentData.id, { language });
    setStudentData(prev => prev ? { ...prev, language } : prev);
    queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const handleModeSelect = (mode) => {
    setCurrentMode(mode);
  };

  const handleBackToModes = () => {
    setCurrentMode(null);
  };

  const handleStudentPatch = (patch) => {
    setStudentData(prev => prev ? { ...prev, ...patch } : prev);

    queryClient.setQueryData(['students'], old => {
      if (!Array.isArray(old)) return old;
      return old.map(s => s.id === studentData?.id ? { ...s, ...patch } : s);
    });
  };

  // Persist a patch (coins, characters) to the server with optimistic local state.
  const handlePersistPatch = async (patch) => {
    if (!studentData?.id) return;
    setStudentData(prev => prev ? { ...prev, ...patch } : prev);
    queryClient.setQueryData(['students'], old => Array.isArray(old)
      ? old.map(s => s.id === studentData.id ? { ...s, ...patch } : s) : old);
    try { await base44.entities.Student.update(studentData.id, patch); } catch {}
  };

  // Lesson rewards are now handled per step in LessonModeRouter.
  // Keep this callback because GameHome still expects onLessonComplete,
  // but completing the whole lesson no longer awards an extra 50 coins.
  const handleLessonComplete = async () => {
    return;
  };

  // --- Pet system ---
  // Check for new milestone and grant pending unlock
  const checkPetMilestone = (newStudentData) => {
    const totalMastered = Object.values(newStudentData.mode_progress || {})
      .flatMap(m => m?.mastered_items || []).length;
    // Grant 1 mystery box every 5 mastered items
    const earned = Math.floor(totalMastered / 5);
    const alreadyUnlocked = (newStudentData.unlocked_pets || []).length - 1; // -1 for starter pet
    const pending = newStudentData.pending_pet_unlocks || 0;
    const totalGranted = alreadyUnlocked + pending;
    if (earned > totalGranted) {
      return { ...newStudentData, pending_pet_unlocks: pending + (earned - totalGranted) };
    }
    return newStudentData;
  };

  const handlePetUnlock = async (petId, setActive) => {
    if (!studentData) return;
    const newUnlocked = [...(studentData.unlocked_pets || ['pet_frog']), petId];
    const updates = {
      unlocked_pets: newUnlocked,
      pending_pet_unlocks: Math.max(0, (studentData.pending_pet_unlocks || 1) - 1),
      ...(setActive ? { active_pet: petId } : {})
    };
    await base44.entities.Student.update(studentData.id, updates);
    setStudentData({ ...studentData, ...updates });
  };

  const handleSelectPet = async (petId) => {
    if (!studentData) return;
    await base44.entities.Student.update(studentData.id, { active_pet: petId });
    setStudentData({ ...studentData, active_pet: petId });
  };

  // Persist the logged-in student's class + number into the URL so a refresh
  // auto-logs them back in (the existing autoStudent logic reads ?number).
  // Without this the number is lost on refresh and they land back on the
  // number-login page even though we already know who they are.
  useEffect(() => {
    if (!selectedStudent || selectedStudent === 'loading_by_id') return;
    const params = new URLSearchParams(window.location.search);
    if (selectedStudent.class_name) params.set('class', selectedStudent.class_name);
    if (selectedStudent.number) params.set('number', String(selectedStudent.number));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [selectedStudent]);

  const handleLogout = () => {
    setSelectedStudent(null);
    setStudentData(null);
    setCurrentMode(null);
    // Clear the persisted number so a refresh after logout goes back to the
    // login page instead of straight back in as the previous student.
    const params = new URLSearchParams(window.location.search);
    params.delete('number');
    params.delete('studentId');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  if (!selectedStudent) {
    return <StudentLogin onSelectStudent={setSelectedStudent} preselectedClass={urlClass || null} />;
  }

  if (!studentData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 to-green-200 flex items-center justify-center">
        <div className="text-6xl animate-bounce">🐸</div>
      </div>
    );
  }

  // Live guided lesson — teacher drives the pace; student is locked to the
  // current step until released. Takes over the whole screen.
  if (liveSession) {
    return (
      <LiveLessonStudent
        session={liveSession}
        studentData={studentData}
        selectedStudent={selectedStudent}
        onUpdateProgress={handleUpdateProgress}
        onStudentPatch={handleStudentPatch}
        onExit={() => setLiveSession(null)}
      />
    );
  }

  if (!currentMode && !activeLessonStep) {
    return (
      <>
        <GameHome
          studentData={studentData}
          selectedStudent={selectedStudent}
          onStudentPatch={handlePersistPatch}
          onUpdateProgress={handleUpdateProgress}
          onLessonComplete={handleLessonComplete}
          onStartStep={(step, index, lesson) => {
            setActiveLessonStep(step);
            setActiveLesson(lesson);
            setActiveStepIndex(index);
          }}
          onPlayMode={handleModeSelect}
          onLogout={handleLogout}
        />
      </>
    );
  }

  if (activeLessonStep && activeLesson) {
    return (
      <LessonModeRouter
        step={activeLessonStep}
        stepIndex={activeStepIndex}
        lessonId={activeLesson.id}
        totalSteps={(activeLesson.steps || []).length}
        studentData={studentData}
        selectedStudent={selectedStudent}
        onUpdateProgress={handleUpdateProgress}
        onStudentPatch={handlePersistPatch}
        onBack={() => {
          setActiveLessonStep(null);
          setActiveLesson(null);
          setActiveStepIndex(null);
        }}
      />
    );
  }

  return (
    <div className="relative h-screen flex flex-col">
      {currentMode === 'letter_sounds' && (
        <LetterSoundsMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onStudentPatch={handlePersistPatch}
        />
      )}
      {currentMode === 'sight_words_easy' && (
        <SightWordsEasyMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}
      {currentMode === 'sight_words_spelling' && (
        <SightWordsSpellingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'spelling' && (
        <SpellingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'case_matching' && (
        <CaseMatchingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}
      {currentMode === 'letter_tracing' && (
        <LetterTracingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onStudentPatch={handlePersistPatch}
          silent={tracingOnlyFor(studentData?.class_name)}
          targets={activeTracingLock ? [activeTracingLock.letter] : undefined}
          locked={!!activeTracingLock}
        />
      )}
      {currentMode === 'number_hearing' && (
        <NumberHearingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}
      {currentMode === 'phonics' && (
        <PhonicsMode
          studentData={studentData}
          onBack={handleBackToModes}
          onStudentPatch={handlePersistPatch}
        />
      )}
      {currentMode === 'sentences' && (
        <SentencesMode
          studentData={studentData}
          onBack={handleBackToModes}
          onStudentPatch={handlePersistPatch}
        />
      )}
      {currentMode === 'spanish_reading' && (
        <SpanishReadingGame
          studentNumber={selectedStudent?.number}
          className={selectedStudent?.class_name}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'storybuilder' && (
        <StoryBuilder
          studentNumber={selectedStudent?.number}
          className={selectedStudent?.class_name}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'book_reading' && (
        <BookReading
          prefillClass={selectedStudent?.class_name}
          prefillNumber={selectedStudent?.number}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'missing_letter' && (
        <MissingLetterMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onStudentPatch={handlePersistPatch}
        />
      )}
      {currentMode === 'syllable_count' && (
        <SyllableCountMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
          onStudentPatch={handlePersistPatch}
        />
      )}

      {currentMode !== 'spelling' && currentMode !== 'sight_words_spelling' && currentMode !== 'book_reading' && currentMode !== 'phonics' && currentMode !== 'spanish_reading' && currentMode !== 'sentences' && !activeTracingLock && (
        <Button
          onClick={handleBackToModes}
          className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Modes
        </Button>
      )}
    </div>
  );
}