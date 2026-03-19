import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';
import { Lock, Star, Trophy } from 'lucide-react';
import AvatarDisplay from './avatar/AvatarDisplay';
import AvatarWardrobe from './avatar/AvatarWardrobe';
import { getDefaultCosmetics } from './avatar/AVATAR_ITEMS';

const MODES = [
  {
    id: 'letter_sounds',
    title: 'Letter Sounds',
    description: 'Match letters to their sounds',
    icon: '🔤',
    color: 'from-blue-400 to-blue-600'
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
    id: 'spelling',
    title: 'Spelling Words',
    description: 'Spell words from jumbled letters',
    icon: '🔠',
    color: 'from-orange-400 to-orange-600'
  },
  {
    id: 'case_matching',
    title: 'Upper & Lowercase',
    description: 'Match uppercase with lowercase',
    icon: '🔄',
    color: 'from-pink-400 to-pink-600'
  }
];

export default function ModeSelection({ studentData, onSelectMode, onLogout, onSaveCosmetics }) {
  const modeProgress = studentData?.mode_progress || {};
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const cosmetics = studentData?.cosmetics || getDefaultCosmetics();

  const getModeStats = (modeId) => {
    const progress = modeProgress[modeId];
    if (!progress) return { unlocked: modeId === 'letter_sounds', mastered: 0, total: 0 };
    
    const mastered = progress.mastered_items?.length || 0;
    const learning = progress.learning_items?.length || 0;
    const unlocked = progress.unlocked !== false;
    
    return { unlocked, mastered, learning, total: mastered + learning };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 p-8">
      {wardrobeOpen && (
        <AvatarWardrobe
          studentData={studentData}
          cosmetics={cosmetics}
          onSave={(c) => { onSaveCosmetics(c); setWardrobeOpen(false); }}
          onClose={() => setWardrobeOpen(false)}
        />
      )}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-6 mb-4">
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-8xl">🐸</motion.div>
            <div className="flex flex-col items-center gap-2">
              <AvatarDisplay cosmetics={cosmetics} size="md" />
              <button
                onClick={() => setWardrobeOpen(true)}
                className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-full transition"
              >
                ✨ Dress Up
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-green-700 mb-2">Choose Your Game Mode</h1>
          <p className="text-xl text-gray-600">Student #{studentData?.student_number}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {MODES.map((mode) => {
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
                  
                  <Button
                    onClick={() => stats.unlocked && onSelectMode(mode.id)}
                    disabled={!stats.unlocked}
                    className={`w-full ${stats.unlocked ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300'} text-white py-6 text-lg`}
                  >
                    {stats.unlocked ? 'Play' : 'Locked'}
                  </Button>
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