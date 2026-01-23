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
  isCorrect,
  mode = 'catch',
  collectedLetters = []
}) {
  const [tongueActive, setTongueActive] = useState(false);
  const [targetFly, setTargetFly] = useState(null);
  const [flyPosition, setFlyPosition] = useState({ x: 0, y: 0 });
  const [capturedLetter, setCapturedLetter] = useState(null);
  const [animationPhase, setAnimationPhase] = useState('idle'); // idle, extend, retract, swallow, spit
  const frogRef = useRef(null);
  const dingSound = useRef(null);

  useEffect(() => {
    dingSound.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
  }, []);

  const handleFlyClick = (letter, index, event) => {
    if (animationPhase !== 'idle') return;
    
    if (mode === 'spelling' || mode === 'case_matching') {
      onAnswer(letter, index);
      return;
    }
    
    const rect = event.currentTarget.getBoundingClientRect();
    const frogRect = frogRef.current?.getBoundingClientRect();
    
    if (frogRect) {
      setFlyPosition({
        x: rect.left + rect.width / 2 - (frogRect.left + frogRect.width / 2),
        y: rect.top + rect.height / 2 - (frogRect.top + frogRect.height / 2)
      });
    }
    
    setTargetFly(index);
    setCapturedLetter(letter);
    setAnimationPhase('extend');
    
    setTimeout(() => {
      setAnimationPhase('retract');
    }, 300);
    
    setTimeout(() => {
      setAnimationPhase('process');
      onAnswer(letter);
    }, 900);
  };

  // Handle swallow or spit after answer is processed
  useEffect(() => {
    if (animationPhase === 'process' && showFeedback) {
      if (isCorrect) {
        setAnimationPhase('swallow');
        dingSound.current?.play().catch(e => console.log('Ding sound failed'));
        setTimeout(() => {
          setAnimationPhase('idle');
          setTargetFly(null);
          setCapturedLetter(null);
        }, 800);
      } else {
        setAnimationPhase('spit');
        setTimeout(() => {
          setAnimationPhase('idle');
          setTargetFly(null);
          setCapturedLetter(null);
        }, 800);
      }
    }
  }, [showFeedback, isCorrect, animationPhase]);

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
          const isHidden = targetFly === index && (animationPhase === 'extend' || animationPhase === 'retract' || animationPhase === 'process');

          return (
            <motion.button
              key={`${letter}-${index}`}
              initial={{ scale: 0, rotate: 0 }}
              animate={{ 
                scale: isHidden ? 0 : 1,
                opacity: isHidden ? 0 : 1,
                x: [0, 20, -20, 15, -15, 0],
                y: [0, -15, 10, -10, 15, 0],
                rotate: [0, 5, -5, 3, -3, 0]
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                scale: { duration: 0.2 },
                opacity: { duration: 0.2 },
                x: { duration: 3, repeat: Infinity },
                y: { duration: 2.5, repeat: Infinity },
                rotate: { duration: 2, repeat: Infinity }
              }}
              onClick={(e) => handleFlyClick(letter, index, e)}
              className="absolute"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="relative">
                {/* Fly body */}
                <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-600 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-900">
                  <span className={`${letter.length > 2 ? 'text-xl' : 'text-3xl'} font-bold text-white`}>{letter}</span>
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
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2" ref={frogRef}>
        <motion.div
          animate={{ 
            y: animationPhase === 'swallow' ? [0, -10, 0] : [0, -5, 0],
            scale: animationPhase === 'swallow' ? [1, 1.1, 1] : 1
          }}
          transition={{ duration: animationPhase === 'swallow' ? 0.4 : 2, repeat: animationPhase === 'swallow' ? 0 : Infinity }}
          className="relative"
        >
          {/* Lily pad */}
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-56 h-20 rounded-full"
            style={{
              background: 'radial-gradient(ellipse at center, #15803d 0%, #166534 40%, #14532d 100%)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          />
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-48 h-16 rounded-full bg-green-700/40" />
          
          {/* Frog body */}
          <div className="relative">
            {/* Main body - more realistic shape */}
            <div className="relative w-40 h-36">
              {/* Body */}
              <div className="absolute bottom-0 w-40 h-28 bg-gradient-to-b from-green-500 via-green-600 to-green-700 rounded-t-full shadow-2xl" 
                style={{ 
                  borderRadius: '50% 50% 45% 45%',
                  boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.3)'
                }}
              >
                {/* Belly */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-24 h-16 bg-gradient-to-b from-yellow-200 to-yellow-300 rounded-full opacity-80" />
              </div>

              {/* Eyes */}
              <div className="absolute top-0 left-6 w-14 h-16 bg-gradient-to-b from-green-400 to-green-500 rounded-full shadow-lg">
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-yellow-100 rounded-full border-4 border-green-600 flex items-center justify-center shadow-inner">
                  <div className="w-5 h-6 bg-black rounded-full" />
                  <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
              
              <div className="absolute top-0 right-6 w-14 h-16 bg-gradient-to-b from-green-400 to-green-500 rounded-full shadow-lg">
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-yellow-100 rounded-full border-4 border-green-600 flex items-center justify-center shadow-inner">
                  <div className="w-5 h-6 bg-black rounded-full" />
                  <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
              
              {/* Mouth */}
              <motion.div 
                className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-20 h-3 bg-gradient-to-b from-red-500 to-red-600 rounded-full shadow-inner"
                animate={{
                  scaleY: animationPhase === 'swallow' ? [1, 0.3, 1] : (animationPhase === 'spit' ? [1, 1.5, 1] : 1)
                }}
                transition={{ duration: 0.3 }}
              />

              {/* Front legs */}
              <div className="absolute bottom-4 left-2 w-8 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg transform -rotate-12" />
              <div className="absolute bottom-4 right-2 w-8 h-12 bg-gradient-to-bl from-green-500 to-green-600 rounded-lg transform rotate-12" />
            </div>

            {/* Tongue with letter */}
            {(animationPhase === 'extend' || animationPhase === 'retract') && (
              <motion.div
                className="absolute bottom-20 left-1/2 transform -translate-x-1/2 origin-bottom"
                style={{
                  width: '6px',
                  transformOrigin: 'bottom center',
                }}
                initial={{ height: 0 }}
                animate={{
                  height: animationPhase === 'extend' ? Math.sqrt(flyPosition.x ** 2 + flyPosition.y ** 2) : 0,
                  rotate: `${Math.atan2(flyPosition.x, -flyPosition.y) * (180 / Math.PI)}deg`
                }}
                transition={{ duration: animationPhase === 'extend' ? 0.3 : 0.6, ease: 'easeInOut' }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-pink-500 to-pink-400 rounded-full shadow-lg" />
                
                {/* Letter on tongue tip */}
                {capturedLetter && animationPhase === 'retract' && (
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-800 to-gray-600 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-900">
                      <span className="text-2xl font-bold text-white">{capturedLetter}</span>
                    </div>
                  </div>
                )}
                
                {/* Sticky tongue tip */}
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-pink-300 rounded-full" />
              </motion.div>
            )}

            {/* Spit animation */}
            {animationPhase === 'spit' && capturedLetter && (
              <motion.div
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: 50, y: -100, opacity: 0, rotate: 360 }}
                transition={{ duration: 0.8 }}
                className="absolute bottom-20 left-1/2"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-gray-800 to-gray-600 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-900">
                  <span className="text-2xl font-bold text-white">{capturedLetter}</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {showFeedback && animationPhase === 'swallow' && isCorrect && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          >
            <div className="text-9xl animate-bounce">🎉</div>
          </motion.div>
        )}
        {showFeedback && animationPhase === 'spit' && !isCorrect && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          >
            <div className="text-9xl animate-pulse">❌</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}