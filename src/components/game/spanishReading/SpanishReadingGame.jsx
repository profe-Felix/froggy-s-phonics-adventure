import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import SlideToReadCanvas from './SlideToReadCanvas';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

const SECTIONS = [
  { key: 'Sílabas', label: 'Sílabas', icon: '🔤', type: 'word' },
  { key: 'Palabras 💙', label: 'Palabras HF', icon: '💙', type: 'word' },
  { key: 'Palabras', label: 'Palabras', icon: '📖', type: 'word' },
  { key: 'Oraciones', label: 'Oraciones', icon: '📝', type: 'sentence' },
];

// ── Self-grade screen ────────────────────────────────────────────────────────
function SelfGradeScreen({ blob, itemText, onGrade, onBack }) {
  const videoUrl = blob ? URL.createObjectURL(blob) : null;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [videoUrl]);

  const handleGrade = async (grade) => {
    setSaving(true);
    await onGrade(grade);
    setSaving(false);
  };

  return (
    <div className="flex flex-col items-center gap-5 px-4 py-6 w-full max-w-md mx-auto">
      <p className="text-white font-black text-lg text-center">🎧 Escucha tu lectura</p>

      {videoUrl && (
        <video src={videoUrl} controls className="w-full rounded-2xl shadow-2xl" style={{ maxHeight: 300 }} />
      )}

      <div className="w-full rounded-2xl p-4 text-center" style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
        <p className="text-white/60 text-xs font-bold mb-1">Leíste:</p>
        <p className="text-white font-black text-lg">{itemText}</p>
      </div>

      {!saving ? (
        <div className="flex gap-3 w-full">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('correct')}
            className="flex-1 py-5 rounded-2xl font-black text-white text-lg shadow-lg flex flex-col items-center gap-1"
            style={{ background: '#16a34a' }}>
            <span className="text-3xl">👍</span>
            <span>¡Lo leí bien!</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('incorrect')}
            className="flex-1 py-5 rounded-2xl font-black text-white text-lg shadow-lg flex flex-col items-center gap-1"
            style={{ background: '#dc2626' }}>
            <span className="text-3xl">👎</span>
            <span>Necesito practicar</span>
          </motion.button>
        </div>
      ) : (
        <div className="text-indigo-300 font-bold text-sm animate-pulse">Saving…</div>
      )}

      <button onClick={onBack} className="text-indigo-400 hover:text-white font-bold text-sm">
        ← Back to Lists
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SpanishReadingGame({ studentNumber, className, onBack }) {
  const [listsData, setListsData] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [items, setItems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('reading'); // 'reading' | 'selfgrade'
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load lists from Supabase
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();
        setListsData(data);
      } catch {
        setListsData({});
      }
    };
    load();
  }, []);

  const sectionConfig = SECTIONS.find(s => s.key === selectedSection);
  const itemType = sectionConfig?.type || 'word';

  // Load items when section + module selected
  const loadModule = (sectionKey, moduleNum) => {
    const section = listsData?.[sectionKey] || {};
    const moduleData = section[`M${moduleNum}`]?.new || [];
    const shuffled = [...moduleData].sort(() => Math.random() - 0.5);
    setItems(shuffled);
    setCurrentIdx(0);
    setPhase('reading');
    setRecordingBlob(null);
  };

  const handleSectionSelect = (sectionKey) => {
    setSelectedSection(sectionKey);
    // Auto-select first available module
    const section = listsData?.[sectionKey] || {};
    const moduleNums = Object.keys(section)
      .map(k => parseInt(k.replace(/\D/g, '')))
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);
    if (moduleNums.length > 0) {
      setSelectedModule(moduleNums[0]);
      loadModule(sectionKey, moduleNums[0]);
    }
  };

  const handleModuleSelect = (moduleNum) => {
    setSelectedModule(moduleNum);
    loadModule(selectedSection, moduleNum);
  };

  const handleRecordingComplete = (blob) => {
    setRecordingBlob(blob);
    setPhase('selfgrade');
  };

  const handleSelfGrade = async (grade) => {
    setSaving(true);
    const currentItem = items[currentIdx];
    const itemText = typeof currentItem === 'string' ? currentItem : currentItem?.text || '';

    // Upload recording
    let recordingUrl = null;
    if (recordingBlob) {
      const ext = recordingBlob.type?.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([recordingBlob], `spanish_reading_${Date.now()}.${ext}`, { type: recordingBlob.type });
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        recordingUrl = file_url;
      } catch {
        // Upload failed — save session without recording
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    await base44.entities.SpanishReadingSession.create({
      student_number: studentNumber,
      class_name: className,
      list_name: `${selectedSection} M${selectedModule}`,
      item_text: itemText,
      item_type: itemType,
      recording_url: recordingUrl,
      student_self_grade: grade,
      teacher_grade: 'pending',
      points_awarded: 0,
      reviewed: false,
      attempt_date: today,
    });

    setSaving(false);

    // Move to next item or back to lists
    if (currentIdx + 1 < items.length) {
      setCurrentIdx(i => i + 1);
      setPhase('reading');
      setRecordingBlob(null);
    } else {
      // List complete — go back to section selection
      setSelectedSection(null);
      setSelectedModule(null);
      setItems([]);
      setPhase('reading');
      setRecordingBlob(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!listsData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Section selector ───────────────────────────────────────────────────────
  if (!selectedSection) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
          <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
          <span className="text-white font-black text-sm flex-1 text-center">📖 Spanish Reading</span>
        </div>
        <div className="flex flex-col items-center gap-4 px-4 py-6 w-full max-w-sm mx-auto">
          <p className="text-white font-black text-lg">Choose a List</p>
          <div className="w-full flex flex-col gap-2">
            {SECTIONS.map(sec => {
              const section = listsData[sec.key] || {};
              const moduleCount = Object.keys(section).filter(k => k.startsWith('M')).length;
              return (
                <motion.button key={sec.key} whileTap={{ scale: 0.97 }} onClick={() => handleSectionSelect(sec.key)}
                  className="w-full py-4 rounded-2xl font-bold text-left px-5 flex items-center justify-between"
                  style={{ background: '#1a1a2e', border: '2px solid #4338ca', opacity: moduleCount === 0 ? 0.4 : 1 }}
                  disabled={moduleCount === 0}>
                  <span className="text-white flex items-center gap-2">
                    <span className="text-2xl">{sec.icon}</span>
                    {sec.label}
                  </span>
                  <span className="text-indigo-400 text-xs uppercase">{moduleCount} modules</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Module selector ────────────────────────────────────────────────────────
  const section = listsData[selectedSection] || {};
  const moduleNums = Object.keys(section)
    .map(k => parseInt(k.replace(/\D/g, '')))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  // ── Reading / self-grade phase ─────────────────────────────────────────────
  const currentItem = items[currentIdx];
  const itemText = typeof currentItem === 'string' ? currentItem : currentItem?.text || '';

  if (currentItem) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '1px solid #4338ca' }}>
          <button onClick={() => { setSelectedSection(null); setSelectedModule(null); }}
            className="text-indigo-300 hover:text-white font-bold text-sm">← Lists</button>
          <span className="text-white font-black text-sm flex-1 text-center">
            {sectionConfig?.icon} {selectedSection} · M{selectedModule}
          </span>
          <span className="text-indigo-400 text-xs font-bold">{currentIdx + 1}/{items.length}</span>
        </div>

        {/* Module pills */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto shrink-0" style={{ background: '#1a1a2e' }}>
          {moduleNums.map(m => (
            <button key={m} onClick={() => handleModuleSelect(m)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedModule === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-indigo-300 hover:bg-gray-700'
              }`}>
              M{m}
            </button>
          ))}
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {phase === 'reading' && (
            <SlideToReadCanvas
              key={`${selectedSection}-${selectedModule}-${currentIdx}`}
              text={itemText}
              itemId={typeof currentItem === 'object' ? currentItem?.id : undefined}
              onRecordingComplete={handleRecordingComplete}
              onBack={() => { setSelectedSection(null); setSelectedModule(null); }}
            />
          )}
          {phase === 'selfgrade' && (
            <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
              <SelfGradeScreen
                blob={recordingBlob}
                itemText={itemText}
                onGrade={handleSelfGrade}
                onBack={() => { setSelectedSection(null); setSelectedModule(null); }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // No items fallback
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
      <p className="text-indigo-400">No items in this module.</p>
      <button onClick={() => { setSelectedSection(null); setSelectedModule(null); }}
        className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#4338ca' }}>
        ← Back to Lists
      </button>
    </div>
  );
}