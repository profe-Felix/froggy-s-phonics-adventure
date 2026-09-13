import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronUp, ChevronDown, Lightbulb } from 'lucide-react';
import { stopAllAudio } from '@/lib/audio';
import { SUBSTEP_COLORS as C } from './substeps/substepTheme';
import ParentNotesSubstep from './substeps/ParentNotesSubstep';
import VideoModelSubstep from './substeps/VideoModelSubstep';
import AudioModelSubstep from './substeps/AudioModelSubstep';
import PracticeSubstep from './substeps/PracticeSubstep';
import BlendingDemoRecorderView from './substeps/BlendingDemoRecorderView';

export default function ParentLedReadingPlayer({ substeps = [], onComplete, onBack, teacherMode = false, lessonId, stepIndex }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showTips, setShowTips] = useState(false);

  const current = substeps[currentIdx];
  const total = substeps.length;

  const goNext = useCallback(() => {
    stopAllAudio();
    if (currentIdx < total - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onComplete?.();
    }
  }, [currentIdx, total, onComplete]);

  const goPrev = useCallback(() => {
    stopAllAudio();
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  }, [currentIdx]);

  if (!current) {
    return (
      <div
        className="flex items-center justify-center h-full text-lg font-bold"
        style={{ background: C.bg, color: C.muted }}
      >
        No hay pasos configurados.
      </div>
    );
  }

  const bubbleText = current.title || '';

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition"
          style={{ color: C.text }}
        >
          <X className="w-6 h-6" strokeWidth={2.5} />
        </button>

        {/* Speech bubble */}
        {bubbleText && (
          <div className="flex-1 mx-2 flex justify-center">
            <div
              className="rounded-2xl px-4 py-2 shadow-md max-w-xs sm:max-w-sm text-center"
              style={{ background: C.bubbleBg }}
            >
              <p className="text-sm sm:text-base font-bold" style={{ color: C.text }}>
                {bubbleText}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowTips((s) => !s)}
          className="px-3 py-1.5 rounded-full text-sm font-bold border-2 bg-white active:scale-95 transition"
          style={{ borderColor: C.text, color: C.text }}
        >
          Consejos
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Progress dots */}
        <div className="flex flex-col items-center gap-2 py-4 px-2 shrink-0">
          {substeps.map((_, i) => {
            const isCurrent = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: isCurrent ? 14 : 10,
                  height: isCurrent ? 14 : 10,
                  background: isCurrent ? '#fff' : isDone ? C.dotDone : C.dotFuture,
                  border: `2px solid ${isCurrent ? C.text : 'transparent'}`,
                }}
              />
            );
          })}
        </div>

        {/* Substep content */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto py-2 px-2 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full flex flex-col items-center justify-center"
              style={{ minHeight: '100%' }}
            >
              {current.type === 'parent_notes' && <ParentNotesSubstep substep={current} />}
              {current.type === 'video' && (teacherMode ? (
                <BlendingDemoRecorderView
                  word={current.word}
                  lessonId={lessonId}
                  stepIndex={stepIndex}
                  existingUrl={current.videoUrl}
                />
              ) : (
                <VideoModelSubstep substep={current} />
              ))}
              {current.type === 'audio_demo' && <AudioModelSubstep substep={current} />}
              {current.type === 'practice' && (
                <PracticeSubstep
                  substep={current}
                  onRecordingComplete={() => {}}
                  teacherMode={teacherMode}
                  lessonId={lessonId}
                  stepIndex={stepIndex}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation arrows */}
        <div className="flex flex-col items-center justify-center gap-2 px-2 shrink-0">
          <div className="flex flex-col gap-2 bg-white rounded-2xl p-1.5 shadow-md">
            <button
              onClick={goPrev}
              disabled={currentIdx === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
              style={{ color: C.text }}
            >
              <ChevronUp className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <button
              onClick={goNext}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition"
              style={{ color: C.text }}
            >
              <ChevronDown className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Tips overlay */}
      <AnimatePresence>
        {showTips && current.hint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-3 shadow-xl max-w-sm z-50"
            style={{ background: '#ffffff' }}
          >
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: C.text }}>
              <Lightbulb className="w-4 h-4 shrink-0" style={{ color: C.accent }} />
              {current.hint}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}