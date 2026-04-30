import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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
import SpanishReadingIframe from '../components/game/SpanishReadingIframe';
import SentencesMode from '../components/game/modes/SentencesMode';
import StoryBuilder from '../pages/StoryBuilder';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { ALL_PETS } from '../components/game/avatar/PETS_DATA';
import { getNewFruits, FRUIT_LIST } from '../components/game/FruitCollection';

export default function LetterGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlStudentId = urlParams.get('studentId');
  const rawClass = urlParams.get('class') || null;
  // Map all variations to canonical names
  const classMap = { 'felix': 'Felix', 'f': 'Felix', 'valero': 'Valero', 'v': 'Valero', 'campos': 'Campos', 'c': 'Campos' };
  const urlClass = rawClass ? classMap[rawClass.toLowerCase()] || null : null;
  const urlNumber = parseInt(urlParams.get('number'));
  const autoStudent = urlClass && urlNumber ? { number: urlNumber, class_name: urlClass } : null;

  const [selectedStudent, setSelectedStudent] = useState(urlStudentId ? 'loading_by_id' : autoStudent);
  const [directStudentId] = useState(urlStudentId);
  const [studentData, setStudentData] = useState(null);
  const [currentMode, setCurrentMode] = useState(null);
  const queryClient = useQueryClient();

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
      const existing = students.find(
        s => s.student_number === selectedStudent.number && s.class_name === selectedStudent.class_name
      );
      if (existing) {
        if (!existing.unlocked_pets?.length) {
          // Brand new student — give starter pet
          const p = ALL_PETS[Math.floor(Math.random() * ALL_PETS.length)];
          const updates = { unlocked_pets: [p.id], active_pet: p.id, pending_pet_unlocks: existing.pending_pet_unlocks || 0 };
          base44.entities.Student.update(existing.id, updates);
          setStudentData({ ...existing, ...updates });
        } else if (!existing.active_pet) {
          // Has pets but active_pet is missing — restore it from collection
          const updates = { active_pet: existing.unlocked_pets[0] };
          base44.entities.Student.update(existing.id, updates);
          setStudentData({ ...existing, ...updates });
        } else {
          setStudentData(existing);
        }
      } else {
        createStudentMutation.mutate({
          student_number: selectedStudent.number,
          class_name: selectedStudent.class_name,
          mode_progress: {
            letter_sounds: {
              mastered_items: [],
              learning_items: ['o', 'i', 'a'],
              item_attempts: {},
              total_correct: 0,
              total_attempts: 0,
              unlocked: true
            },
            sight_words_easy: {
              mastered_items: [],
              learning_items: ['el', 'la', 'un'],
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
  }, [selectedStudent, students]);

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

  const handleModeSelect = (mode) => {
    setCurrentMode(mode);
  };

  const handleBackToModes = () => {
    setCurrentMode(null);
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

  const handleLogout = () => {
    setSelectedStudent(null);
    setStudentData(null);
    setCurrentMode(null);
    // If class is locked via URL, skip class selection on logout
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

  if (!currentMode) {
    return (
      <ModeSelection
        studentData={studentData}
        onSelectMode={handleModeSelect}
        onLogout={handleLogout}
        onPetUnlock={handlePetUnlock}
        onSelectPet={handleSelectPet}
      />
    );
  }

  return (
    <div className="relative h-screen flex flex-col">
      {currentMode === 'letter_sounds' && (
        <LetterSoundsMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
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
        />
      )}
      {currentMode === 'number_hearing' && (
        <NumberHearingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}
      {currentMode === 'sentences' && (
        <SentencesMode
          studentData={studentData}
          onBack={handleBackToModes}
        />
      )}
      {currentMode === 'spanish_reading' && (
        <SpanishReadingIframe
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

      {currentMode !== 'spelling' && currentMode !== 'sight_words_spelling' && (
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