import React from 'react';
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';

export default function StudentLogin({ onSelectStudent }) {
  const numbers = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl p-8 max-w-4xl w-full"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-8xl mb-4"
          >
            🐸
          </motion.div>
          <h1 className="text-4xl font-bold text-green-700 mb-2">
            Froggy's Letter Sounds
          </h1>
          <p className="text-xl text-gray-600">Choose your student number!</p>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-3">
          {numbers.map((num) => (
            <Button
              key={num}
              onClick={() => onSelectStudent(num)}
              className="h-16 text-2xl font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg hover:scale-110 transition-transform"
            >
              {num}
            </Button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}