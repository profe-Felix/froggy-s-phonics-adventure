import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import LetterRecognitionCanvas from '@/components/tracing/LetterRecognitionCanvas';
import StepDoneBar from './StepDoneBar';

// Embedded student step for "Guess My Letter". Loads saved letter templates
// and lets the student draw — the canvas guesses which letter it is.
export default function LetterRecognitionStep({ onComplete, targets }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled) return;
        const t = [];
        for (const rec of records || []) {
          try {
            const strokes = JSON.parse(rec.strokes_data);
            if (Array.isArray(strokes) && strokes.length && rec.letter && rec.letter.length === 1) {
              t.push({ letter: rec.letter, strokes });
            }
          } catch { /* ignore malformed */ }
        }
        t.sort((a, b) => a.letter.localeCompare(b.letter, undefined, { sensitivity: 'base' }));
        const filtered = (targets && targets.length > 0)
          ? t.filter(x => targets.includes(x.letter.toLowerCase()))
          : t;
        setTemplates(filtered);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col bg-slate-50">
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-bold text-lg text-slate-800 mb-1">🎯 Guess My Letter</h2>
          <p className="text-sm text-slate-500 mb-3">Draw a letter and I'll guess which one it is!</p>
          <LetterRecognitionCanvas templates={templates} />
        </div>
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}