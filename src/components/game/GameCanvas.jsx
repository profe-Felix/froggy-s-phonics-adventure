import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Volume2, Star, Trophy } from 'lucide-react';

export default function GameCanvas({ 
  currentLetter, 
  options, 
  onAnswer, 
  score, 
  streak,
  onPlaySound,
  showFeedback,
  isCorrect 
}) {
  const [tongueActive, setTongueActive] = useState(false);
  const [targetFly, setTargetFly] = useState(null);

  const handleFlyClick = (letter, index) => {
    setTargetFly(index);
    setTongueActive(true);
    
    setTimeout(() => {
      onAnswer(letter);
      setTongueActive(false);
      setTargetFly(null);
    }, 600);
  };

  return (
    <div className="relative w-full h-screen bg-gradient-to-b from-sky-400 via-sky-300 to-green-300 overflow-hidden">
      {/* Clouds */}
      <div className="absolute top-10 left-10 text-6xl opacity-70 animate-pulse">☁️</div>
      <div className="absolute top-20 right-20 text-8xl opacity-60 animate-pulse">☁️</div>
      <div className="absolute top-32 left-1/3 text-5xl opacity-50 animate-pulse">☁️</div>

      {/* Score Display */}
      <div className="absolute top-4 left-4 bg-white/90 rounded-2xl px-6 py-3 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <span className="text-2xl font-bold text-gray-800">{score}</span>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(streak, 5) }).map((_, i) => (
                <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sound Button */}
      <Button
        onClick={onPlaySound}
        className="absolute top-4 right-4 h-16 w-16 rounded-full bg-blue-500 hover:bg-blue-600 shadow-lg"
      >
        <Volume2 className="w-8 h-8" />
      </Button>

      {/* Flies */}
      <AnimatePresence>
        {options.map((letter, index) => {
          const positions = [
            { top: '15%', left: '20%' },
            { top: '25%', left: '60%' },
            { top: '35%', left: '80%' },
            { top: '45%', left: '30%' }
          ];
          const pos = positions[index] || { top: '20%', left: '50%' };

          return (
            <motion.button
              key={`${letter}-${index}`}
              initial={{ scale: 0, rotate: 0 }}
              animate={{ 
                scale: targetFly === index ? 0 : 1,
                x: [0, 20, -20, 15, -15, 0],
                y: [0, -15, 10, -10, 15, 0],
                rotate: [0, 5, -5, 3, -3, 0]
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                scale: { duration: 0.3 },
                x: { duration: 3, repeat: Infinity },
                y: { duration: 2.5, repeat: Infinity },
                rotate: { duration: 2, repeat: Infinity }
              }}
              onClick={() => handleFlyClick(letter, index)}
              className="absolute"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="relative">
                {/* Fly body */}
                <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-600 rounded-full shadow-lg flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">{letter}</span>
                </div>
                {/* Wings */}
                <div className="absolute -top-2 -left-4 w-12 h-8 bg-blue-200/70 rounded-full blur-sm animate-pulse" />
                <div className="absolute -top-2 -right-4 w-12 h-8 bg-blue-200/70 rounded-full blur-sm animate-pulse" />
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* Frog */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="relative"
        >
          {/* Lily pad */}
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-48 h-16 bg-green-600 rounded-full opacity-70" />
          
          {/* Frog body */}
          <div className="relative">
            <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-xl">
              {/* Eyes */}
              <div className="absolute -top-4 left-8 w-12 h-12 bg-yellow-300 rounded-full border-4 border-green-600 flex items-center justify-center">
                <div className="w-6 h-6 bg-black rounded-full" />
              </div>
              <div className="absolute -top-4 right-8 w-12 h-12 bg-yellow-300 rounded-full border-4 border-green-600 flex items-center justify-center">
                <div className="w-6 h-6 bg-black rounded-full" />
              </div>
              
              {/* Mouth */}
              <div className="absolute bottom-8 w-16 h-8 bg-red-400 rounded-full" />
            </div>

            {/* Tongue */}
            {tongueActive && targetFly !== null && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 400 }}
                transition={{ duration: 0.3 }}
                className="absolute bottom-16 left-1/2 transform -translate-x-1/2 w-4 bg-pink-400 rounded-full origin-bottom"
                style={{
                  transformOrigin: 'bottom center',
                  rotate: `${(targetFly - 1.5) * 20}deg`
                }}
              />
            )}
          </div>
        </motion.div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          >
            <div className={`text-9xl ${isCorrect ? 'animate-bounce' : 'animate-pulse'}`}>
              {isCorrect ? '🎉' : '❌'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}