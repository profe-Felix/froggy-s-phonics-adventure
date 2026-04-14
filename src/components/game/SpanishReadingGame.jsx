import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

// ── Reading lists ──────────────────────────────────────────────────────────────
const READING_LISTS = {
  'Sílabas - A': { type: 'word', items: ['ma','pa','ba','da','fa','la','na','sa','ta','va','ca','ga'] },
  'Sílabas - E': { type: 'word', items: ['me','pe','be','de','fe','le','ne','se','te','ve','ce','ge'] },
  'Sílabas - I': { type: 'word', items: ['mi','pi','bi','di','fi','li','ni','si','ti','vi','ci','gi'] },
  'Sílabas - O': { type: 'word', items: ['mo','po','bo','do','fo','lo','no','so','to','vo','co','go'] },
  'Sílabas - U': { type: 'word', items: ['mu','pu','bu','du','fu','lu','nu','su','tu','vu','cu','gu'] },
  'Palabras - Set 1': { type: 'word', items: ['mamá','papá','mesa','sopa','luna','mano','palo','boca','nido','loma'] },
  'Palabras - Set 2': { type: 'word', items: ['sapo','pata','dama','tela','fina','nube','puma','solo','suma','nota'] },
  'Palabras - Set 3': { type: 'word', items: ['lobo','lodo','mimo','moto','mono','mudo','nene','nube','oso','paso'] },
  'Oraciones 1': { type: 'sentence', items: ['El sapo sube solo.','La luna es bonita.','Mamá toma sopa.','El pato nada bien.','Mi papá me ama.'] },
  'Oraciones 2': { type: 'sentence', items: ['El mono come una banana.','La niña camina sola.','El niño pisa el lodo.','La mesa es de madera.','Papá bebe café solo.'] },
};

const POINTS_WORD = 2;
const POINTS_SENTENCE = 10;

// ── Phase machine ─────────────────────────────────────────────────────────────
// Phase flow per item:
//   'hidden'  → text hidden, big Record button
//   'recording' → text revealed, recording in progress → big Submit button
//   'listening' → recording stopped, audio playback enabled, self-grade required
//   'graded'   → student submitted self-grade → next item or done

function useAudioRecorder() {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);

  const start = async () => {
    chunksRef.current = [];
    setAudioBlob(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      setAudioBlob(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
  };

  const stop = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  return { recording, audioBlob, start, stop };
}

// ── Single item view ──────────────────────────────────────────────────────────
function ItemReader({ item, itemType, listName, studentNumber, className, onDone, totalItems, currentIndex }) {
  const [phase, setPhase] = useState('hidden'); // hidden | recording | listening | saving | graded
  const [selfGrade, setSelfGrade] = useState(null);
  const [saving, setSaving] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const { recording, audioBlob, start, stop } = useAudioRecorder();
  const isSentence = itemType === 'sentence';

  const handleRecord = async () => {
    await start();
    setPhase('recording');
  };

  const handleSubmit = () => {
    stop();
    setPhase('listening');
  };

  // When blob arrives after stop, create object URL for playback
  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
    }
  }, [audioBlob]);

  const handleGrade = async (grade) => {
    setSelfGrade(grade);
    setSaving(true);

    // Upload audio
    let recordingUrl = null;
    if (audioBlob) {
      const file = new File([audioBlob], 'reading.webm', { type: audioBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      recordingUrl = file_url;
    }

    const today = new Date().toISOString().slice(0, 10);
    await base44.entities.SpanishReadingSession.create({
      student_number: studentNumber,
      class_name: className,
      list_name: listName,
      item_text: item,
      item_type: itemType,
      recording_url: recordingUrl,
      student_self_grade: grade,
      teacher_grade: 'pending',
      points_awarded: 0, // Teacher confirms later
      reviewed: false,
      attempt_date: today,
    });

    setSaving(false);
    setPhase('graded');
  };

  const points = isSentence ? POINTS_SENTENCE : POINTS_WORD;

  return (
    <div className="flex flex-col items-center gap-5 px-4 py-6 w-full max-w-sm mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${((currentIndex) / totalItems) * 100}%` }} />
        </div>
        <span className="text-white/70 text-xs font-bold">{currentIndex}/{totalItems}</span>
      </div>

      {/* Main card */}
      <div className="w-full rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
        {/* Text area */}
        <div className="flex items-center justify-center px-6 py-8 min-h-[120px]" style={{ background: '#0f0f1a' }}>
          <AnimatePresence mode="wait">
            {phase === 'hidden' ? (
              <motion.div key="hidden" initial={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2">
                <div className="w-32 h-10 rounded-xl" style={{ background: '#2d2d4a' }} />
                <p className="text-white/40 text-xs font-bold">Tap Record to reveal</p>
              </motion.div>
            ) : (
              <motion.p key="text" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="font-black text-center text-white leading-tight"
                style={{ fontSize: isSentence ? 22 : 40 }}>
                {item}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="px-5 py-5 flex flex-col items-center gap-4">
          {/* Phase: hidden */}
          {phase === 'hidden' && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleRecord}
              className="w-full py-5 rounded-2xl font-black text-white text-xl shadow-lg flex items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg, #dc2626, #9333ea)' }}>
              🎙 Record
            </motion.button>
          )}

          {/* Phase: recording */}
          {phase === 'recording' && (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 font-bold text-sm">Recording…</span>
              </div>
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleSubmit}
                className="w-full py-5 rounded-2xl font-black text-white text-xl shadow-lg"
                style={{ background: 'linear-gradient(135deg, #16a34a, #059669)' }}>
                ✅ Submit Recording
              </motion.button>
            </div>
          )}

          {/* Phase: listening */}
          {phase === 'listening' && (
            <div className="w-full flex flex-col items-center gap-4">
              <p className="text-indigo-300 font-bold text-sm text-center">🎧 Listen to your recording, then grade yourself:</p>
              {audioUrl && (
                <audio ref={audioRef} src={audioUrl} controls className="w-full" />
              )}
              {!saving && (
                <div className="flex gap-3 w-full">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('correct')}
                    className="flex-1 py-4 rounded-2xl font-black text-white text-lg shadow-lg flex flex-col items-center gap-1"
                    style={{ background: '#16a34a' }}>
                    <span>✓</span>
                    <span className="text-sm">I read it right</span>
                    <span className="text-xs opacity-80">+{points} pts</span>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('incorrect')}
                    className="flex-1 py-4 rounded-2xl font-black text-white text-lg shadow-lg flex flex-col items-center gap-1"
                    style={{ background: '#dc2626' }}>
                    <span>✗</span>
                    <span className="text-sm">I made a mistake</span>
                    <span className="text-xs opacity-80">0 pts</span>
                  </motion.button>
                </div>
              )}
              {saving && (
                <div className="text-indigo-300 font-bold text-sm animate-pulse">Saving…</div>
              )}
            </div>
          )}

          {/* Phase: graded */}
          {phase === 'graded' && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className={`w-full py-3 rounded-2xl text-center font-black text-lg ${selfGrade === 'correct' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                {selfGrade === 'correct' ? `✓ Nice work! +${points} pts (pending teacher review)` : '✗ Keep practicing!'}
              </div>
              <motion.button whileTap={{ scale: 0.95 }} onClick={onDone}
                className="w-full py-4 rounded-2xl font-black text-white text-lg shadow-lg"
                style={{ background: '#4338ca' }}>
                Next →
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List selector ──────────────────────────────────────────────────────────────
function ListSelector({ onSelect }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6 w-full max-w-sm mx-auto">
      <p className="text-white font-black text-lg">📖 Choose a List</p>
      <div className="w-full flex flex-col gap-2">
        {Object.entries(READING_LISTS).map(([name, { type }]) => (
          <motion.button key={name} whileTap={{ scale: 0.97 }} onClick={() => onSelect(name)}
            className="w-full py-4 rounded-2xl font-bold text-left px-5 flex items-center justify-between"
            style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
            <span className="text-white">{name}</span>
            <span className="text-indigo-400 text-xs uppercase">{type === 'sentence' ? '📝 Sentences' : '🔤 Words'}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── Done screen ──────────────────────────────────────────────────────────────
function DoneScreen({ listName, onBack, onRestart }) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-12">
      <div className="text-6xl">🎉</div>
      <p className="text-white font-black text-2xl text-center">List Complete!</p>
      <p className="text-indigo-300 text-sm text-center">Your teacher will review your recordings and confirm your points.</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onRestart}
          className="w-full py-4 rounded-2xl font-black text-white text-lg"
          style={{ background: '#4338ca' }}>
          📖 Try Another List
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onBack}
          className="w-full py-4 rounded-2xl font-black text-white text-lg"
          style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
          ← Back to Menu
        </motion.button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SpanishReadingGame({ onBack, studentNumber, className: classNameProp }) {
  const [selectedList, setSelectedList] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [done, setDone] = useState(false);

  const listData = selectedList ? READING_LISTS[selectedList] : null;
  const items = listData?.items || [];
  const itemType = listData?.type || 'word';

  const handleItemDone = () => {
    if (currentIndex + 1 >= items.length) {
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handleSelectList = (name) => {
    setSelectedList(name);
    setCurrentIndex(0);
    setDone(false);
  };

  const handleRestart = () => {
    setSelectedList(null);
    setCurrentIndex(0);
    setDone(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
        <span className="text-white font-black text-sm flex-1 text-center">
          📖 {selectedList || 'Spanish Reading'}
        </span>
        {selectedList && !done && (
          <span className="text-indigo-400 text-xs font-bold">{currentIndex + 1}/{items.length}</span>
        )}
      </div>

      {/* Content */}
      {!selectedList && <ListSelector onSelect={handleSelectList} />}

      {selectedList && !done && (
        <ItemReader
          key={`${selectedList}-${currentIndex}`}
          item={items[currentIndex]}
          itemType={itemType}
          listName={selectedList}
          studentNumber={studentNumber}
          className={classNameProp}
          onDone={handleItemDone}
          totalItems={items.length}
          currentIndex={currentIndex}
        />
      )}

      {done && (
        <DoneScreen
          listName={selectedList}
          onBack={onBack}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}