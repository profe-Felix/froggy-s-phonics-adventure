import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { ArrowLeft } from 'lucide-react';

export default function StudentLogin({ onSelectStudent }) {
  const numbers = Array.from({ length: 30 }, (_, i) => i + 1);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    base44.entities.Student.list('-updated_date', 200).then(students => {
      const unique = [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      setLoadingClasses(false);
    });
  }, []);

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
          {!selectedClass ? (
            <p className="text-xl text-gray-600">Choose your class!</p>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setSelectedClass(null)} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <p className="text-xl text-gray-600">Class <strong>{selectedClass}</strong> — pick your number!</p>
            </div>
          )}
        </div>

        {!selectedClass ? (
          loadingClasses ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-green-200 border-t-green-500 rounded-full animate-spin"></div>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-lg">No classes set up yet.</p>
              <p className="text-sm mt-1">Ask your teacher to set up classes in the dashboard first.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {classes.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="w-28 h-28 text-4xl font-bold bg-green-500 hover:bg-green-600 text-white rounded-2xl shadow-lg hover:scale-110 transition-transform"
                >
                  {cls}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-3">
            {numbers.map((num) => (
              <Button
                key={num}
                onClick={() => onSelectStudent({ number: num, class_name: selectedClass })}
                className="h-16 text-xl font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg hover:scale-110 transition-transform"
              >
                {num}
              </Button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}