import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

// ── Reading lists ──
const LISTS = [
  {
    id: 'silabas_a',
    label: 'Sílabas — A',
    items: ['ma','pa','la','sa','ba','ca','da','fa','ga','ha','ja','ka','na','ra','ta','va','ya','za'],
  },
  {
    id: 'silabas_e',
    label: 'Sílabas — E',
    items: ['me','pe','le','se','be','ce','de','fe','ge','je','ne','re','te','ve','ye'],
  },
  {
    id: 'silabas_i',
    label: 'Sílabas — I',
    items: ['mi','pi','li','si','bi','ci','di','fi','gi','ji','ni','ri','ti','vi'],
  },
  {
    id: 'silabas_o',
    label: 'Sílabas — O',
    items: ['mo','po','lo','so','bo','co','do','fo','go','jo','no','ro','to','vo'],
  },
  {
    id: 'silabas_u',
    label: 'Sílabas — U',
    items: ['mu','pu','lu','su','bu','cu','du','fu','gu','ju','nu','ru','tu','vu'],
  },
  {
    id: 'palabras_1',
    label: 'Palabras — Set 1',
    items: ['mamá','papá','luna','mano','pato','lago','boca','casa','dame','foca','gato','hola','mono','nota','pana','rana','sopa','toma'],
  },
  {
    id: 'palabras_2',
    label: 'Palabras — Set 2',
    items: ['cama','dama','fama','lama','rama','tama','cana','bala','cala','fala','mala','pala','sala','tala','vaca','roca','bota','ruta'],
  },
];

// ── Simple slider display ──
function SyllableSlider({ items, current, onNext, onPrev }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="flex items-center gap-4 w-full justify-center">
        <button onClick={onPrev} disabled={current === 0}
          className="w-12 h-12 rounded-full bg-white shadow-md text-2xl font-bold text-indigo-600 disabled:opacity-30 flex items-center justify-center">
          ‹
        </button>
        <motion.div key={current}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-48 h-48 bg-white rounded-3xl shadow-xl flex items-center justify-center"
          style={{ fontFamily: "'Edu NSW ACT Foundation', cursive" }}>
          <span className="text-7xl font-bold text-indigo-700 select-none">{items[current]}</span>
        </motion.div>
        <button onClick={onNext} disabled={current === items.length - 1}
          className="w-12 h-12 rounded-full bg-white shadow-md text-2xl font-bold text-indigo-600 disabled:opacity-30 flex items-center justify-center">
          ›
        </button>
      </div>
      <div className="flex gap-1">
        {items.map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-indigo-500 w-4' : 'bg-indigo-200'}`} />
        ))}
      </div>
      <p className="text-sm text-indigo-400 font-semibold">{current + 1} / {items.length}</p>
    </div>
  );
}

// ── Recording status indicator ──
function RecordingDot({ recording }) {
  if (!recording) return null;
  return (
    <div className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      REC
    </div>
  );
}

export default function SpanishReadingGame({ onBack, studentNumber, className: classNameProp }) {
  const [selectedList, setSelectedList] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(200);
    mediaRecorderRef.current = mr;
    startTimeRef.current = Date.now();
    setRecording(true);
  };

  const stopRecording = () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') { resolve(null); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob);
      };
      mr.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      setRecording(false);
    });
  };

  const handleToggleRecord = async () => {
    if (recording) {
      setSaving(true);
      const blob = await stopRecording();
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (blob && studentNumber && classNameProp && selectedList) {
        const file = new File([blob], 'reading.webm', { type: 'audio/webm' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.SpanishReadingSession.create({
          student_number: studentNumber,
          class_name: classNameProp,
          list_name: selectedList.label,
          recording_url: file_url,
          duration_seconds: duration,
          reviewed: false,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
      setSaving(false);
    } else {
      setSaved(false);
      await startRecording();
    }
  };

  // ── List selection screen ──
  if (!selectedList) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
        <div className="flex items-center px-4 py-3 gap-3">
          <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-sm">← Back</button>
          <h1 className="text-lg font-black text-white flex-1 text-center">📖 Spanish Reading</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <p className="text-white/80 text-sm text-center mb-4">Choose a list to practice:</p>
          <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
            {LISTS.map(list => (
              <motion.button key={list.id}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => { setSelectedList(list); setCurrentIndex(0); }}
                className="bg-white rounded-2xl px-5 py-4 text-left shadow-lg">
                <p className="font-black text-indigo-700 text-lg">{list.label}</p>
                <p className="text-indigo-400 text-sm">{list.items.slice(0, 6).join(' · ')}…</p>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Reading practice screen ──
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
      {/* Header */}
      <div className="flex items-center px-4 py-3 gap-3">
        <button onClick={() => { setSelectedList(null); if (recording) stopRecording(); }}
          className="text-white/80 hover:text-white font-bold text-sm">← Lists</button>
        <h2 className="text-base font-black text-white flex-1 text-center">{selectedList.label}</h2>
        <RecordingDot recording={recording} />
      </div>

      {/* Slider */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <SyllableSlider
          items={selectedList.items}
          current={currentIndex}
          onNext={() => setCurrentIndex(i => Math.min(i + 1, selectedList.items.length - 1))}
          onPrev={() => setCurrentIndex(i => Math.max(i - 1, 0))}
        />

        {/* Record button */}
        <div className="flex flex-col items-center gap-2">
          <button onClick={handleToggleRecord} disabled={saving}
            className={`px-8 py-3 rounded-2xl font-black text-base shadow-xl transition-all active:scale-95 ${
              recording ? 'bg-red-500 text-white' : 'bg-white text-indigo-700'
            } ${saving ? 'opacity-60' : ''}`}>
            {saving ? '⏳ Saving…' : recording ? '⏹ Stop & Save Recording' : '🎙 Start Recording'}
          </button>
          {saved && <p className="text-green-300 text-sm font-bold">✅ Recording saved!</p>}
          {!recording && <p className="text-white/50 text-xs">Tap to record yourself reading aloud</p>}
        </div>
      </div>
    </div>
  );
}