import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StudentLogin from '../components/game/StudentLogin';
import GameCanvas from '../components/game/GameCanvas';
import { Button } from "@/components/ui/button";
import { LogOut, RotateCcw } from 'lucide-react';

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export default function LetterGame() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [currentLetter, setCurrentLetter] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const audioRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch or create student data
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  });

  // Initialize student
  useEffect(() => {
    if (selectedStudent && students) {
      const existing = students.find(s => s.student_number === selectedStudent);
      if (existing) {
        setStudentData(existing);
      } else {
        // Create new student
        createStudentMutation.mutate({
          student_number: selectedStudent,
          mastered_letters: [],
          learning_letters: ['a', 'b', 'c'],
          letter_attempts: {},
          total_games_played: 0,
          total_correct: 0
        });
      }
    }
  }, [selectedStudent, students]);

  // Generate new round
  const generateRound = () => {
    if (!studentData) return;

    const mastered = studentData.mastered_letters || [];
    const learning = studentData.learning_letters || [];
    const allKnown = [...mastered, ...learning];
    
    // If student has no letters yet, start with first 3
    const knownLetters = allKnown.length > 0 ? allKnown : ['a', 'b', 'c'];
    
    // 70% from known, 30% new letters
    const useKnown = Math.random() < 0.7 || knownLetters.length < 4;
    let targetLetter;
    
    if (useKnown) {
      targetLetter = knownLetters[Math.floor(Math.random() * knownLetters.length)];
    } else {
      const unknown = ALL_LETTERS.filter(l => !knownLetters.includes(l));
      targetLetter = unknown[Math.floor(Math.random() * unknown.length)] || knownLetters[0];
    }

    // Generate 3 wrong options
    const wrongOptions = ALL_LETTERS
      .filter(l => l !== targetLetter)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const allOptions = [targetLetter, ...wrongOptions].sort(() => Math.random() - 0.5);
    
    setCurrentLetter(targetLetter);
    setOptions(allOptions);
    playSound(targetLetter);
  };

  const playSound = (letter) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(`/letter-audio/${letter}.mp3`);
    audioRef.current.play().catch(err => console.log('Audio play failed:', err));
  };

  const handleAnswer = async (selectedLetter) => {
    const correct = selectedLetter === currentLetter;
    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
      
      // Update student progress
      const attempts = studentData.letter_attempts || {};
      const letterStats = attempts[currentLetter] || { correct: 0, total: 0 };
      letterStats.correct += 1;
      letterStats.total += 1;
      attempts[currentLetter] = letterStats;

      // Move to mastered if 80% success rate and at least 5 attempts
      const successRate = letterStats.correct / letterStats.total;
      let updatedMastered = [...(studentData.mastered_letters || [])];
      let updatedLearning = [...(studentData.learning_letters || [])];

      if (successRate >= 0.8 && letterStats.total >= 5 && !updatedMastered.includes(currentLetter)) {
        updatedMastered.push(currentLetter);
        updatedLearning = updatedLearning.filter(l => l !== currentLetter);
        
        // Add a new letter to learning
        const allKnown = [...updatedMastered, ...updatedLearning];
        const nextLetter = ALL_LETTERS.find(l => !allKnown.includes(l));
        if (nextLetter && updatedLearning.length < 5) {
          updatedLearning.push(nextLetter);
        }
      }

      await updateStudentMutation.mutateAsync({
        id: studentData.id,
        data: {
          letter_attempts: attempts,
          mastered_letters: updatedMastered,
          learning_letters: updatedLearning,
          total_correct: (studentData.total_correct || 0) + 1,
          total_games_played: (studentData.total_games_played || 0) + 1
        }
      });

      // Update local state
      setStudentData(prev => ({
        ...prev,
        letter_attempts: attempts,
        mastered_letters: updatedMastered,
        learning_letters: updatedLearning,
        total_correct: (prev.total_correct || 0) + 1,
        total_games_played: (prev.total_games_played || 0) + 1
      }));
    } else {
      setStreak(0);
      
      // Track incorrect attempt
      const attempts = studentData.letter_attempts || {};
      const letterStats = attempts[currentLetter] || { correct: 0, total: 0 };
      letterStats.total += 1;
      attempts[currentLetter] = letterStats;

      await updateStudentMutation.mutateAsync({
        id: studentData.id,
        data: {
          letter_attempts: attempts,
          total_games_played: (studentData.total_games_played || 0) + 1
        }
      });

      setStudentData(prev => ({
        ...prev,
        letter_attempts: attempts,
        total_games_played: (prev.total_games_played || 0) + 1
      }));
    }

    setTimeout(() => {
      setShowFeedback(false);
      generateRound();
    }, 1500);
  };

  // Start first round
  useEffect(() => {
    if (studentData && !currentLetter) {
      generateRound();
    }
  }, [studentData]);

  if (!selectedStudent) {
    return <StudentLogin onSelectStudent={setSelectedStudent} />;
  }

  if (!studentData || !currentLetter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 to-green-200 flex items-center justify-center">
        <div className="text-6xl animate-bounce">🐸</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GameCanvas
        currentLetter={currentLetter}
        options={options}
        onAnswer={handleAnswer}
        score={score}
        streak={streak}
        onPlaySound={() => playSound(currentLetter)}
        showFeedback={showFeedback}
        isCorrect={isCorrect}
      />

      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <Button
          onClick={() => {
            setSelectedStudent(null);
            setStudentData(null);
            setScore(0);
            setStreak(0);
          }}
          className="bg-white/90 hover:bg-white text-gray-800 shadow-lg"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Exit
        </Button>
      </div>

      {/* Progress Info */}
      <div className="absolute bottom-4 left-4 bg-white/90 rounded-2xl px-4 py-3 shadow-lg">
        <div className="text-sm text-gray-600">
          <div className="font-bold text-gray-800 mb-1">Student #{selectedStudent}</div>
          <div>Mastered: {studentData.mastered_letters?.length || 0} letters</div>
          <div>Learning: {studentData.learning_letters?.length || 0} letters</div>
        </div>
      </div>
    </div>
  );
}