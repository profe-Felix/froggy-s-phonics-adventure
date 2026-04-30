import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';
import { Lock, Star, Trophy, Users } from 'lucide-react';
import LiteracyPeerLobby from './LiteracyPeerLobby';
import LiteracyBingoLobby from './LiteracyBingoLobby';
import PetAvatar from './avatar/PetAvatar';
import PetCollection from './avatar/PetCollection';
import MysteryBoxReveal from './avatar/MysteryBoxReveal';
import { ALL_PETS } from './avatar/PETS_DATA';
import FruitCollection, { FruitBadge } from './FruitCollection';

const PTS_PER_STICKER = 100;

function SentenceProgressBadge({ totalPts, onClick }) {
  const progress = totalPts % PTS_PER_STICKER;
  const spins = Math.floor(totalPts / PTS_PER_STICKER);
  const pct = (progress / PTS_PER_STICKER) * 100;
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 bg-white/80 rounded-2xl px-4 py-2 shadow border-2 border-rose-200 hover:bg-rose-50 transition min-w-[90px]">
      <span className="text-2xl">🎡</span>
      <div className="w-full h-2.5 rounded-full bg-rose-100 overflow-hidden border border-rose-200">
        <div className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-black text-rose-600">{progress}/{PTS_PER_STICKER} pts</span>
      {spins > 0 && <span className="text-xs text-rose-400 font-bold">{spins} spin{spins > 1 ? 's' : ''} used</span>}
    </button>
  );
}

const MODES = [
  {
    id: 'letter_sounds',
    title: 'Letter Sounds',
    description: 'Match letters to their sounds',
    icon: '🔤',
    color: 'from-blue-400 to-blue-600'
  },
  {
    id: 'letter_tracing',
    title: 'Letter Tracing',
    description: 'Trace letters the right way',
    icon: '✏️',
    color: 'from-violet-400 to-violet-600',
    adminOnly: true
  },
  {
    id: 'sight_words_easy',
    title: 'Sight Words',
    description: 'Catch the word you hear',
    icon: '👀',
    color: 'from-green-400 to-green-600'
  },
  {
    id: 'sight_words_spelling',
    title: 'Spell Sight Words',
    description: 'Build sight words letter by letter',
    icon: '✍️',
    color: 'from-purple-400 to-purple-600'
  },
  {
    id: 'case_matching',
    title: 'Upper & Lowercase',
    description: 'Match uppercase with lowercase',
    icon: '🔄',
    color: 'from-pink-400 to-pink-600'
  },
  {
    id: 'number_hearing',
    title: 'Number Sounds',
    description: 'Catch the number you hear (0–20)',
    icon: '🔢',
    color: 'from-teal-400 to-teal-600'
  },
  {
    id: 'sentences',
    title: 'Sentences',
    description: 'Write then build sentences word by word',
    icon: '📝',
    color: 'from-rose-400 to-pink-600',
    alwaysUnlocked: true
  },
  {
    id: 'spanish_reading',
    title: 'Spanish Reading',
    description: 'Slide & read Spanish words with balloon fluency',
    icon: '📖',
    color: 'from-sky-400 to-blue-600',
    alwaysUnlocked: true
  },
  {
    id: 'spelling',
    title: 'Spelling Words',
    description: 'Spell words from jumbled letters',
    icon: '🔠',
    color: 'from-orange-400 to-orange-600'
  },
  {
    id: 'storybuilder',
    title: 'Story Builder',
    description: 'Create and draw your own stories',
    icon: '📚',
    color: 'from-amber-400 to-orange-600',
    alwaysUnlocked: true
  }
];

export default function ModeSelection({ studentData, onSelectMode, onLogout, onPetUnlock, onSelectPet, onOpenSentences }) {
  const modeProgress = studentData?.mode_progress || {};
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [fruitOpen, setFruitOpen] = useState(false);
  const [peerPlayActive, setPeerPlayActive] = useState(false);
  const [bingoActive, setBingoActive] = useState(false);
  const activePetId = studentData?.active_pet || 'pet_frog';
  const unlockedPets = studentData?.unlocked_pets || ['pet_frog'];
  const pendingUnlocks = studentData?.pending_pet_unlocks || 0;

  const getModeStats = (modeId) => {
    const modeDef = MODES.find(m => m.id === modeId);
    const progress = modeProgress[modeId];
    if (!progress) return { unlocked: modeId === 'letter_sounds' || !!modeDef?.alwaysUnlocked, mastered: 0, total: 0 };
    
    const mastered = progress.mastered_items?.length || 0;
    const learning = progress.learning_items?.length || 0;
    const unlocked = progress.unlocked !== false || !!modeDef?.alwaysUnlocked;
    
    return { unlocked, mastered, learning, total: mastered + learning };
  };

  if (peerPlayActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 p-8">
        <LiteracyPeerLobby
          className={studentData.class_name}
          studentNumber={studentData.student_number}
          onBack={() => setPeerPlayActive(false)}
        />
      </div>
    );
  }

  if (bingoActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-400 via-indigo-300 to-purple-200 p-8">
        <LiteracyBingoLobby
          className={studentData.class_name}
          studentNumber={studentData.student_number}
          onBack={() => setBingoActive(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 p-8">
      {collectionOpen && (
        <PetCollection
          unlockedIds={unlockedPets}
          activePetId={activePetId}
          onSelectPet={(id) => { onSelectPet(id); setCollectionOpen(false); }}
          onClose={() => setCollectionOpen(false)}
        />
      )}
      {fruitOpen && (
        <FruitCollection
          unlockedFruits={studentData?.unlocked_fruits || []}
          spellingTotalPoints={studentData?.spelling_total_points || 0}
          onClose={() => setFruitOpen(false)}
        />
      )}
      {pendingUnlocks > 0 && (
        <MysteryBoxReveal
          studentData={studentData}
          onUnlock={(petId, setActive) => onPetUnlock(petId, setActive)}
          onClose={() => {}}
        />
      )}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="flex flex-col items-center gap-2">
              <PetAvatar petId={activePetId} size="lg" showName />
              <button
                onClick={() => setCollectionOpen(true)}
                className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full transition"
              >
                🐾 My Pets ({unlockedPets.length}/{ALL_PETS.length})
              </button>
            </div>
            <FruitBadge
              unlockedFruits={studentData?.unlocked_fruits || []}
              spellingTotalPoints={studentData?.spelling_total_points || 0}
              onClick={() => setFruitOpen(true)}
            />
            <SentenceProgressBadge
              totalPts={studentData?.sentences_total_points || 0}
              onClick={() => onSelectMode('sentences')}
            />
          </div>
          <h1 className="text-4xl font-bold text-green-700 mb-2">Choose Your Game Mode</h1>
          <p className="text-xl text-gray-600">Student #{studentData?.student_number}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {MODES.filter(mode => !mode.adminOnly).map((mode) => {
            const stats = getModeStats(mode.id);
            
            return (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: stats.unlocked ? 1.05 : 1 }}
                className="relative"
              >
                <div className={`bg-white rounded-3xl shadow-xl p-6 ${!stats.unlocked ? 'opacity-60' : ''}`}>
                  <div className={`w-full h-32 bg-gradient-to-br ${mode.color} rounded-2xl flex items-center justify-center text-6xl mb-4 shadow-lg`}>
                    {stats.unlocked ? mode.icon : <Lock className="w-12 h-12 text-white" />}
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">{mode.title}</h3>
                  <p className="text-gray-600 mb-4">{mode.description}</p>
                  
                  {stats.unlocked && stats.total > 0 && (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span className="text-gray-700">Mastered: {stats.mastered}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Trophy className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-700">Learning: {stats.learning}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Button
                      onClick={() => stats.unlocked && onSelectMode(mode.id)}
                      disabled={!stats.unlocked}
                      className={`w-full ${stats.unlocked ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300'} text-white py-6 text-lg`}
                    >
                      {stats.unlocked ? 'Play' : 'Locked'}
                    </Button>
                    {stats.unlocked && (mode.id === 'spelling' || mode.id === 'sight_words_spelling') && (
                      <Button
                        disabled
                        variant="outline"
                        className="w-full border-2 border-gray-300 text-gray-400 py-5 font-bold cursor-not-allowed opacity-50"
                      >
                        <Users className="w-4 h-4 mr-2" /> Play with Friend
                      </Button>
                    )}
                    {stats.unlocked && (mode.id === 'letter_sounds' || mode.id === 'sight_words_easy') && (
                      <Button
                        onClick={() => setBingoActive(true)}
                        variant="outline"
                        className="w-full border-2 border-indigo-400 text-indigo-600 hover:bg-indigo-50 py-5 font-bold"
                      >
                        🎱 Bingo with Friend
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="text-center">
          <Button onClick={onLogout} variant="outline" className="px-8 py-4 text-lg">
            Switch Student
          </Button>
        </div>
      </div>
    </div>
  );
}