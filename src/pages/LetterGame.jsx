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
import { Button } from "@/components/ui/button";
import { ArrowLeft } from 'lucide-react';

export default function LetterGame() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [currentMode, setCurrentMode] = useState(null);
  const queryClient = useQueryClient();

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => base44.entities.Student.list(),
    enabled: selectedStudent !== null
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
    }
  });

  useEffect(() => {
    if (selectedStudent && students) {
      const existing = students.find(s => s.student_number === selectedStudent);
      if (existing) {
        setStudentData(existing);
      } else {
        createStudentMutation.mutate({
          student_number: selectedStudent,
          mode_progress: {
            letter_sounds: {
              mastered_items: [],
              learning_items: ['a', 'b', 'c'],
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
          current_mode: 'letter_sounds'
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
  };

  const handleModeSelect = (mode) => {
    setCurrentMode(mode);
  };

  const handleBackToModes = () => {
    setCurrentMode(null);
  };

  const handleLogout = () => {
    setSelectedStudent(null);
    setStudentData(null);
    setCurrentMode(null);
  };

  if (!selectedStudent) {
    return <StudentLogin onSelectStudent={setSelectedStudent} />;
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
      />
    );
  }

  return (
    <div className="relative">
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
        />
      )}
      {currentMode === 'spelling' && (
        <SpellingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}
      {currentMode === 'case_matching' && (
        <CaseMatchingMode
          studentData={studentData}
          onUpdateProgress={handleUpdateProgress}
        />
      )}

      <Button
        onClick={handleBackToModes}
        className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Modes
      </Button>
    </div>
  );
}