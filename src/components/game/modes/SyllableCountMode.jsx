import { useState, useEffect, useRef, useCallback } from 'react';
import { listAllImagesJpg } from '@/lib/lettersort/storage';
import { syllabifyByLang, stripDiacritics, normalizeMarkers } from '@/lib/lettersort/phonics';
import { AUDIO_BASE, toAudioName } from '@/lib/audio';
import { getLanguage } from '@/lib/language';
import { base44 } from '@/api/base44Client';
import { useCoinAward } from '@/hooks/useCoinAward';
import { Volume2, RotateCcw, Trophy } from 'lucide-react';

const IMG_BUCKET = 'lettersort-images';

// Counting Syllables: show a picture + word, the student claps (taps 👏) once
// per syllable they hear, then checks their answer. Uses the shared syllabify
// engine so the correct count matches the phonics rules used everywhere else.
export default function SyllableCountMode({ studentData, onUpdateProgress, onStudentPatch }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [claps, setClaps] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef(null);
  const lang = getLanguage(studentData);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Load words from the Letter Sort image bucket.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const images = await listAllImagesJpg({ bucket: IMG_BUCKET });
        const seen = new Set();
        const words = [];
        for (const img of images.sort(() => Math.random() - 0.5)) {
          if (!img.core || seen.has(img.core)) continue;
          seen.add(img.core);
          words.push({ word: img.core, url: img.url });
          if (words.length >= 40) break;
        }
        if (!cancelled) { setItems(words); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const item = items[idx];

  const correctCount = useCallback(() => {
    if (!item) return 0;
    return syllabifyByLang(item.word, lang).length;
  }, [item, lang]);

  const playWord = useCallback(() => {
    if (!item) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try {
      const a = new Audio(`${AUDIO_BASE}/${lang}/words/${toAudioName(item.word)}.mp3`);
      audioRef.current = a;
      a.play().catch(() => {});
    } catch {}
  }, [item, lang]);

  useEffect(() => {
    if (item) { setClaps(0); setShowResult(false); setIsCorrect(false); playWord(); }
  }, [idx, item, playWord]);

  const handleClap = () => {
    if (showResult) return;
    setClaps(c => c + 1);
  };

  const handleCheck = async () => {
    if (!item || showResult) return;
    const correct = claps === correctCount();
    setIsCorrect(correct);
    setShowResult(true);
    const newCompleted = completed + 1;
    setCompleted(newCompleted);
    if (!correct) setMistakes(m => m + 1);
    awardCoins(2, 'syllable_count');
    onUpdateProgress?.('syllable_count', {
      total_attempts: newCompleted,
      total_correct: correct ? newCompleted - mistakes : newCompleted - mistakes - 1,
      mastered_items: [],
      learning_items: [],
    });
  };

  const handleNext = () => {
    if (idx + 1 >= items.length) {
      setIdx(0); // loop
    } else {
      setIdx(idx + 1);
    }
  };

  const restart = () => {
    setIdx(0); setClaps(0); setShowResult(false); setIsCorrect(false);
    setCompleted(0); setMistakes(0);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-5xl">👏</div>
        <p className="text-gray-500 font-bold">No word images found.</p>
      </div>
    );
  }

  const syllables = item ? syllabifyByLang(item.word, lang) : [];
  const allDone = showResult && idx + 1 >= items.length;

  return (
    <div className="relative h-full flex flex-col bg-gradient-to-b from-amber-50 to-orange-100 select-none">
      {/* progress */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-black text-orange-500 bg-white/70 rounded-full px-3 py-1">
          Word {idx + 1} of {items.length}
        </span>
        <span className="text-xs font-bold text-gray-400">✅ {completed}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-4">
        {item && (
          <>
            <div className="bg-white rounded-3xl shadow-md border-2 border-orange-100 p-4 flex items-center justify-center min-h-44 min-w-44">
              <img src={item.url} alt={item.word} className="max-h-44 max-w-full rounded-2xl object-contain" />
            </div>

            <button
              onClick={playWord}
              className="bg-white/80 hover:bg-white text-orange-600 font-bold text-sm px-4 py-1.5 rounded-full shadow inline-flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" /> Hear it
            </button>

            {!showResult ? (
              <>
                <p className="text-lg font-black text-gray-700 text-center">
                  How many syllables? 👏
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleClap}
                    className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl flex flex-col items-center justify-center text-white active:scale-95 transition-transform"
                  >
                    <span className="text-5xl">👏</span>
                    <span className="text-3xl font-black mt-1">{claps}</span>
                  </button>
                  <div className="flex flex-col gap-2">
                    {claps > 0 && (
                      <button
                        onClick={() => setClaps(c => Math.max(0, c - 1))}
                        className="text-sm bg-white/80 text-gray-600 font-bold px-3 py-1.5 rounded-full shadow hover:bg-white"
                      >
                        ← Undo clap
                      </button>
                    )}
                    <button
                      onClick={handleCheck}
                      disabled={claps === 0}
                      className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-black px-5 py-2 rounded-full shadow"
                    >
                      Check ✓
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className={`rounded-2xl px-6 py-3 font-black text-lg ${
                  isCorrect ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {isCorrect ? '🎉 Correct!' : `Almost! It has ${correctCount()} syllables`}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                  {syllables.map((syl, i) => (
                    <span key={i} className="px-3 py-1.5 bg-white rounded-xl border-2 border-orange-200 font-black text-xl text-orange-700">
                      {syl}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-gray-500 font-bold">
                  You clapped {claps} time{claps !== 1 ? 's' : ''} • Correct: {correctCount()}
                </div>
                <button
                  onClick={handleNext}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-full"
                >
                  {allDone ? 'Play again →' : 'Next →'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {allDone && (
        <div className="absolute inset-0 z-[100] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-4 mx-4">
            <Trophy className="w-14 h-14 text-amber-400" />
            <h2 className="text-2xl font-black text-gray-800">Great clapping! 👏</h2>
            <p className="text-gray-500 font-bold">You counted {completed} words.</p>
            <button onClick={restart} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-full inline-flex items-center gap-2">
              <RotateCcw className="w-5 h-5" /> Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}