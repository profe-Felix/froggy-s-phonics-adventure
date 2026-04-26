import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea, { countCorrectLetters } from '../SpellingBuildArea';
import SpellingWriteStep from '../SpellingWriteStep';
import { base44 } from '@/api/base44Client';

// Words organized by module — from list.json "Palabras" section
export const SPELLING_WORDS_BY_MODULE = {
  1: ['mamá', 'me', 'mi', 'mimo', 'mima', 'momia', 'miau', 'Mia', 'Emi', 'Momo', 'Memo', 'Ami', 'Ema'],
  2: ['moneda', 'suma', 'nene', 'nena', 'paloma', 'pala', 'palo', 'suelo', 'malo', 'mala', 'sana', 'sano',
      'sonó', 'soné', 'pone', 'pon', 'pepino', 'pela', 'pelo', 'peló', 'piso', 'peso', 'puso', 'puse',
      'sal', 'Lupe', 'Pepe', 'masa', 'mesa', 'esa', 'eso', 'el', 'le', 'sol', 'sale', 'los', 'las', 'la',
      'lo', 'limón', 'lima', 'lomo', 'oso', 'sapo', 'saco', 'osa', 'esposa', 'solo', 'sopa', 'sola',
      'sala', 'salió', 'pasea', 'paseo', 'pasa', 'papá', 'puma', 'espuma', 'limpia', 'limpió', 'limpio', 'salimos'],
  3: ['late', 'modo', 'moda', 'tinta', 'tema', 'teme', 'temo', 'miedo', 'moto', 'meto', 'fila', 'filo',
      'dedo', 'toda', 'dama', 'meta', 'mete', 'duda', 'dado', 'dame', 'salada', 'ensalada', 'piensa',
      'salta', 'dale', 'tele', 'tela', 'nota', 'foto', 'sofá', 'falso', 'falta', 'fino', 'dio', 'adios',
      'está', 'soda', 'sola', 'tamales', 'osito', 'osita', 'pinta', 'nada', 'alto', 'faltó'],
  4: ['perro', 'carro', 'compone', 'rama', 'coco', 'boca', 'boleto', 'quiso', 'baile', 'baila', 'camino',
      'rosa', 'rosado', 'comida', 'quita', 'bata', 'bate', 'queso', 'quema', 'casa', 'caldo', 'cama',
      'rica', 'rico', 'pico', 'pica', 'foca', 'foco', 'bota', 'bote', 'bolsa', 'risa', 'Rita', 'rana',
      'reina', 'bola', 'barco', 'banana', 'cabe', 'cabo', 'rato', 'ratito', 'poquito', 'poco', 'poca',
      'roca', 'ratón', 'ropa', 'ruido'],
  5: ['vivo', 'vive', 'villano', 'mira', 'sillón', 'llavero', 'vivimos', 'volante', 'robot', 'robo',
      'caramelo', 'robó', 'sello', 'comparte', 'estira', 'escala', 'escalo', 'ella', 'ellos', 'cara',
      'caro', 'faro', 'cura', 'curo', 'curó', 'coro', 'loro', 'quiero', 'vaca', 'vaso', 'vela', 'vena',
      'vuela', 'vuelo', 'vale', 'valle', 'tornillo', 'calle', 'anillo', 'pollo', 'lava', 'lavo', 'lavé',
      'llama', 'llamó', 'lluvia', 'silla', 'llave', 'llanta', 'lleno', 'llena', 'bella', 'bello', 'llevé'],
  6: ['naranja', 'jirafa', 'guitarra', 'fuego', 'guapo', 'jarra', 'zapato', 'belleza', 'danza', 'bellota',
      'zapatos', 'gato', 'goma', 'gana', 'gano', 'ganó', 'gané', 'lago', 'mago', 'hago', 'pago', 'pagué',
      'zona', 'amigo', 'amiga', 'miga', 'migas', 'liga', 'fogata', 'jugo', 'jefe', 'juego', 'juega',
      'jamón', 'yema', 'yate', 'yoyó', 'joya', 'joyas', 'hijo', 'hija', 'hilo', 'hoja', 'hola', 'haya'],
  7: ['mucho', 'escucho', 'cuchara', 'soñe', 'soñó', 'techo', 'añadir', 'daño', 'niñez', 'niñera', 'moño',
      'muchacha', 'chamarra', 'chaqueta', 'genial', 'chiste', 'chistoso', 'gigante', 'girasol', 'años',
      'caña', 'araña', 'mañana', 'sueño', 'ficha', 'fecha', 'paño', 'leña', 'niña', 'niño', 'piña',
      'chivo', 'chisme', 'macho', 'mochila', 'muchacho', 'China', 'coche', 'gente', 'gema', 'gemelo',
      'gemelos', 'gel', 'gira', 'chile', 'chica', 'chico', 'pequeño', 'pingüino', 'vergüenza', 'leche',
      'choco', 'choque', 'chocolate'],
  8: ['kilo', 'kiwi', 'taxi', 'karate', 'koala', 'éxito', 'examen', 'tóxico', 'kimono', 'texto'],
  9: ['crear', 'cruzar', 'refresco', 'refrescante', 'chicle', 'iglesia', 'fresco', 'frasco', 'fracaso',
      'fracasa', 'fracasé', 'chancla', 'planta', 'plantar', 'clase', 'blando', 'ablandar', 'peligro',
      'peligroso', 'regla', 'arregla', 'flama', 'flamas', 'fruta', 'fresa', 'frase', 'frío', 'freno',
      'frente', 'frijol', 'creo', 'crayón', 'cruce', 'drama', 'claro', 'clara', 'clima', 'cloro', 'clavo',
      'teclado', 'crema', 'cruz', 'bloque', 'blusa', 'brinca', 'plato', 'plata', 'prado', 'primo', 'prima',
      'globo', 'grande', 'agrega', 'pluma', 'aprieta', 'blanco', 'dragón', 'taladro', 'padre', 'madre',
      'premio', 'primero', 'princesa', 'principe', 'flecha', 'flaco', 'flota', 'flojo', 'floja', 'aflojo', 'afloja'],
};

export const SPELLING_WORDS = Object.values(SPELLING_WORDS_BY_MODULE).flat();

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

function toAudioName(word) {
  return word.toLowerCase()
    .replace(/á/g, 'a...').replace(/é/g, 'e...').replace(/í/g, 'i...')
    .replace(/ó/g, 'o...').replace(/ú/g, 'u...');
}

const DISTRACTOR_LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñ'.split('');

// For words with b or d, always include the opposite as a distractor
function buildOptions(word) {
  const wordLetters = word.split('');
  const letterCounts = {};
  wordLetters.forEach(l => { letterCounts[l] = (letterCounts[l] || 0) + 1; });
  const neededLetters = [];
  Object.entries(letterCounts).forEach(([letter, count]) => {
    for (let i = 0; i < count; i++) neededLetters.push(letter);
  });

  // Force b/d opposite distractors
  const forcedDistractors = [];
  if (wordLetters.includes('b') && !wordLetters.includes('d')) forcedDistractors.push('d');
  if (wordLetters.includes('d') && !wordLetters.includes('b')) forcedDistractors.push('b');

  const otherDistractors = DISTRACTOR_LETTERS
    .filter(l => !wordLetters.includes(l) && !forcedDistractors.includes(l))
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(2, 5 - wordLetters.length - forcedDistractors.length));

  return [...neededLetters, ...forcedDistractors, ...otherDistractors]
    .sort(() => Math.random() - 0.5)
    .map((letter, idx) => ({ letter, id: idx }));
}

// Compute mastery % per module
function getModuleProgress(modeData) {
  const mastered = new Set(modeData.mastered_items || []);
  return Object.entries(SPELLING_WORDS_BY_MODULE).map(([mod, words]) => {
    const total = words.length;
    const masteredCount = words.filter(w => mastered.has(w)).length;
    return { module: parseInt(mod), total, mastered: masteredCount, pct: total > 0 ? masteredCount / total : 0 };
  });
}

function pickWord(modeData, lastWord, moduleWords) {
  const attempts = modeData.item_attempts || {};
  const mastered = new Set(modeData.mastered_items || []);
  const learning = (modeData.learning_items || []).filter(w => moduleWords.includes(w));

  const notMastered = moduleWords.filter(w => !mastered.has(w));
  const pool = [...new Set([...learning, ...notMastered.slice(0, 30)])];
  const candidates = pool.length > 1 ? pool.filter(w => w !== lastWord) : pool;
  if (!candidates.length) return pool[0] || moduleWords[0];

  const weights = candidates.map(w => {
    const s = attempts[w] || { correct: 0, total: 0 };
    return Math.max(1, 8 - s.correct * 2);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export default function SpellingMode({ studentData, onUpdateProgress }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [phase, setPhase] = useState('write');
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [writtenStrokes, setWrittenStrokes] = useState(null);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});
  const submittingRef = useRef(false);
  const lastWordRef = useRef(null);

  const modeData = studentData?.mode_progress?.spelling || {
    mastered_items: [], learning_items: SPELLING_WORDS_BY_MODULE[1].slice(0, 3),
    item_attempts: {}, total_correct: 0, total_attempts: 0
  };

  const moduleProgress = getModuleProgress(modeData);

  const playSound = (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    if (!preloadedAudio.current[word]) {
      const audio = new Audio();
      const audioName = toAudioName(word);
      const candidates = [
        `${SUPABASE_AUDIO_BASE}/${audioName}.mp3`,
        `${SUPABASE_AUDIO_BASE}/${audioName}.wav`,
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= candidates.length) return;
        audio.src = candidates[i++];
        audio.load();
        audio.play().catch(tryNext);
      };
      audio.onerror = tryNext;
      preloadedAudio.current[word] = audio;
      audioRef.current = audio;
      tryNext();
      return;
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const startRound = (mod = selectedModule) => {
    const moduleWords = SPELLING_WORDS_BY_MODULE[mod] || SPELLING_WORDS_BY_MODULE[1];
    const word = pickWord(modeData, lastWordRef.current, moduleWords);
    lastWordRef.current = word;
    setCurrentWord(word);
    setOptions(buildOptions(word));
    setBuiltWord([]);
    setUsedIndices([]);
    setShowResult(false);
    setPointsEarned(0);
    setPhase('write');
    setWrittenStrokes(null);
    submittingRef.current = false;
    playSound(word);
  };

  useEffect(() => { startRound(); }, []);

  const handleModuleSelect = (mod) => {
    setSelectedModule(mod);
    startRound(mod);
  };

  const handleWriteDone = async (strokes, imageUrl) => {
    setWrittenStrokes(strokes);
    setPhase('build');
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'spelling',
        word: currentWord,
        strokes_data: JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleLetterClick = (letterObj) => {
    if (showResult || usedIndices.includes(letterObj.id)) return;
    setBuiltWord(prev => [...prev, letterObj.letter]);
    setUsedIndices(prev => [...prev, letterObj.id]);
  };

  const handleUndo = () => { if (showResult) return; setBuiltWord(p => p.slice(0, -1)); setUsedIndices(p => p.slice(0, -1)); };
  const handleClear = () => { if (showResult) return; setBuiltWord([]); setUsedIndices([]); };

  const handleSubmit = async () => {
    if (submittingRef.current || showResult) return;
    submittingRef.current = true;
    const userWord = builtWord.join('');
    const correct = userWord === currentWord;
    const pts = countCorrectLetters(builtWord, currentWord);
    setIsCorrect(correct);
    setShowResult(true);
    setPointsEarned(pts);
    if (correct) { setScore(s => s + pts); setStreak(s => s + 1); } else { setScore(s => s + pts); setStreak(0); }

    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) wordStats.correct += 1;
    attempts[currentWord] = wordStats;
    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];
    if (correct && wordStats.correct >= 4 && wordStats.correct / wordStats.total >= 0.75 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      const moduleWords = SPELLING_WORDS_BY_MODULE[selectedModule] || [];
      if (updatedLearning.length < 15) {
        const allKnown = new Set([...updatedMastered, ...updatedLearning]);
        const next = moduleWords.find(w => !allKnown.has(w));
        if (next) updatedLearning.push(next);
      }
    }
    if (updatedLearning.length < 8) {
      const moduleWords = SPELLING_WORDS_BY_MODULE[selectedModule] || [];
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      moduleWords.filter(w => !allKnown.has(w)).slice(0, 8 - updatedLearning.length).forEach(w => updatedLearning.push(w));
    }
    await onUpdateProgress('spelling', {
      mastered_items: updatedMastered, learning_items: updatedLearning, item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1, unlocked: true
    });
  };

  if (!currentWord) return null;

  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center p-4 gap-4">
        {/* Module selector with progress bars */}
        <div className="w-full max-w-lg bg-white/90 rounded-2xl shadow p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-center">Módulo</p>
          <div className="grid grid-cols-3 gap-2 mb-1 sm:grid-cols-5">
            {moduleProgress.map(({ module, pct, mastered, total }) => (
              <button key={module} onClick={() => handleModuleSelect(module)}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 border-2 transition-all ${selectedModule === module ? 'border-indigo-500 bg-indigo-50' : pct >= 0.8 ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <span className={`text-sm font-black ${selectedModule === module ? 'text-indigo-700' : 'text-gray-700'}`}>M{module}</span>
                <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 0.8 ? 'bg-green-500' : 'bg-indigo-400'}`} style={{ width: `${pct * 100}%` }} />
                </div>
                <span className="text-xs text-gray-400">{mastered}/{total}</span>
                {pct >= 0.8 && <span className="text-xs">⭐</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full max-w-lg bg-white/90 rounded-3xl shadow-2xl p-6">
          <SpellingWriteStep
            word={currentWord}
            onDone={handleWriteDone}
            onPlaySound={() => playSound(currentWord)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Module selector strip */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex gap-2 overflow-x-auto">
        {moduleProgress.map(({ module, pct }) => (
          <button key={module} onClick={() => handleModuleSelect(module)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${selectedModule === module ? 'bg-indigo-600 text-white' : pct >= 0.8 ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}>
            M{module} {pct >= 0.8 ? '⭐' : <span className="text-xs opacity-60">{Math.round(pct * 100)}%</span>}
          </button>
        ))}
      </div>
      <GameCanvas
        currentLetter={currentWord}
        options={options}
        onAnswer={handleLetterClick}
        score={score}
        streak={streak}
        onPlaySound={() => playSound(currentWord)}
        showFeedback={false}
        isCorrect={false}
        mode="spelling"
        usedIndices={usedIndices}
      />
      <SpellingBuildArea
        builtWord={builtWord}
        targetWord={currentWord}
        onUndo={handleUndo}
        onSubmit={handleSubmit}
        onClear={handleClear}
        showResult={showResult}
        isCorrect={isCorrect}
        onNext={showResult ? startRound : undefined}
        pointsEarned={pointsEarned}
      />
    </>
  );
}