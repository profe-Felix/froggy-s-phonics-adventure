import React from 'react';
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, Check, X } from 'lucide-react';

export default function SpellingBuildArea({ 
  builtWord, 
  targetWord, 
  onUndo, 
  onSubmit, 
  onClear,
  showResult,
  isCorrect 
}) {
  return (
    <div className="absolute bottom-8 left-8 bg-white/95 rounded-3xl shadow-2xl p-6 min-w-[400px] max-w-[500px] z-10">
      <div className="text-center mb-4">
        <p className="text-gray-600 text-sm mb-2">Build the word:</p>
        <div className="flex justify-center gap-2 min-h-[80px] items-center flex-wrap">
          <AnimatePresence>
            {builtWord.map((letter, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
                className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg flex items-center justify-center"
              >
                <span className="text-3xl font-bold text-white">{letter}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {builtWord.length === 0 && (
            <div className="text-gray-400 text-xl">Click letters above...</div>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <Button
          onClick={onUndo}
          disabled={builtWord.length === 0}
          variant="outline"
          className="px-6 py-6 text-lg"
        >
          <Undo2 className="w-5 h-5 mr-2" />
          Undo
        </Button>
        <Button
          onClick={onClear}
          disabled={builtWord.length === 0}
          variant="outline"
          className="px-6 py-6 text-lg"
        >
          <X className="w-5 h-5 mr-2" />
          Clear
        </Button>
        <Button
          onClick={onSubmit}
          disabled={builtWord.length === 0}
          className="px-6 py-6 text-lg bg-blue-500 hover:bg-blue-600"
        >
          <Check className="w-5 h-5 mr-2" />
          Submit
        </Button>
      </div>

      {showResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-4 text-center text-xl font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}
        >
          {isCorrect ? '✅ Correct!' : `❌ Try Again! (${targetWord})`}
        </motion.div>
      )}
    </div>
  );
}