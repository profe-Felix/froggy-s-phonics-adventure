import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import SlideToReadCanvas from './SlideToReadCanvas';
import RecordingsProgressBar from './RecordingsProgressBar';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

const SECTIONS = [
  { key: 'Sílabas', label: 'Sílabas', icon: '🔤', type: 'word' },
  { key: 'Palabras 💙', label: 'Palabras HF', icon: '💙', type: 'word' },
  { key: 'Palabras', label: 'Palabras', icon: '📖', type: 'word' },
  { key: 'Oraciones', label: 'Oraciones', icon: '📝', type: 'sentence' },
];

const getItemText = (item) => typeof item === 'string' ? item : item?.text || '';
const getItemId = (item) => typeof item === 'object' ? item?.id : undefined;

function playRecording(url) {
  const v = document.createElement('video');
  v.src = url;
  v.style.display = 'none';
  document.body.appendChild(v);
  v.play().catch(() => {});
  v.onended = () => v.remove();
}

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
    <div className="flex flex-col items-center gap-4 sm:gap-5 px-3 sm:px-4 py-4 sm:py-6 w-full max-w-md mx-auto">
      <p className="text-white font-black text-base sm:text-lg text-center">🎧 Escucha tu lectura</p>

      {videoUrl && (
        <video src={videoUrl} controls className="w-full rounded-xl sm:rounded-2xl shadow-2xl" style={{ maxHeight: 220 }} />
      )}

      <div className="w-full rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center" style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
        <p className="text-white/60 text-xs font-bold mb-1">Leíste:</p>
        <p className="text-white font-black text-sm sm:text-lg">{itemText}</p>
      </div>

      {!saving ? (
        <div className="flex gap-2 sm:gap-3 w-full">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('correct')}
            className="flex-1 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-white text-sm sm:text-lg shadow-lg flex flex-col items-center gap-0.5 sm:gap-1"
            style={{ background: '#16a34a' }}>
            <span className="text-2xl sm:text-3xl">👍</span>
            <span className="text-xs sm:text-base">¡Lo leí bien!</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleGrade('incorrect')}
            className="flex-1 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-white text-sm sm:text-lg shadow-lg flex flex-col items-center gap-0.5 sm:gap-1"
            style={{ background: '#dc2626' }}>
            <span className="text-2xl sm:text-3xl">👎</span>
            <span className="text-xs sm:text-base">Necesito practicar</span>
          </motion.button>
        </div>
      ) : (
        <div className="text-indigo-300 font-bold text-sm animate-pulse">Saving…</div>
      )}

      <button onClick={onBack} className="text-indigo-400 hover:text-white font-bold text-xs sm:text-sm">
        ← Re-record
      </button>
    </div>
  );
}

// ── Session overview (reflection screen) ─────────────────────────────────────
function SessionOverview({ sessions, onContinue }) {
  const correctCount = sessions.filter(s => s.teacher_grade === 'correct' || (s.teacher_grade === 'pending' && s.student_self_grade === 'correct')).length;
  const needsWorkCount = sessions.filter(s => s.teacher_grade === 'incorrect' || (s.teacher_grade === 'pending' && s.student_self_grade === 'incorrect')).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2 px-3 sm:px-4 py-3 max-w-2xl mx-auto w-full">
        <p className="text-white font-black text-base sm:text-lg text-center">📊 Today's Session</p>
        <p className="text-indigo-300 text-xs sm:text-sm text-center mb-2">Listen to your recordings and reflect 🎧</p>

        {sessions.length > 0 && (
          <div className="flex gap-2 justify-center mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#163935', color: '#4ade80' }}>
              ✅ {correctCount} correct
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#3a1635', color: '#f87171' }}>
              👎 {needsWorkCount} needs work
            </span>
          </div>
        )}

        {sessions.length === 0 ? (
          <p className="text-indigo-400 text-center text-sm py-8">No recordings yet today. Start reading to build your session!</p>
        ) : (
          sessions.map((s, idx) => {
            const isTeacherCorrect = s.teacher_grade === 'correct';
            const isTeacherIncorrect = s.teacher_grade === 'incorrect';
            const isPending = s.teacher_grade === 'pending';
            const selfCorrect = s.student_self_grade === 'correct';

            return (
              <div key={idx} className="rounded-xl p-3 flex items-center gap-3" style={{
                background: isTeacherCorrect ? '#163935' : isTeacherIncorrect ? '#3a1635' : '#262a3f',
              }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{
                  background: selfCorrect ? '#16a34a' : '#dc2626',
                  color: '#fff',
                }}>
                  {selfCorrect ? '👍' : '👎'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{s.item_text}</p>
                  <p className="text-white/50 text-xs">
                    {isPending ? '⏳ Teacher review pending' :
                     isTeacherCorrect ? '✅ Teacher: Correct' : '❌ Teacher: Keep practicing'}
                  </p>
                </div>
                {s.recording_url && (
                  <button onClick={() => playRecording(s.recording_url)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ background: '#4338ca', color: '#fff' }}
                    title="Play recording">
                    ▶
                  </button>
                )}
              </div>
            );
          })
        )}

        <button onClick={onContinue}
          className="mt-3 py-3 rounded-xl font-black text-white text-sm shadow-lg"
          style={{ background: '#4338ca' }}>
          Continue Reading →
        </button>
      </div>
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
  const [viewMode, setViewMode] = useState('reading'); // 'reading' | 'overview'
  const [phase, setPhase] = useState('reading'); // 'reading' | 'selfgrade'
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [completedTexts, setCompletedTexts] = useState(new Set());
  const [todaySessions, setTodaySessions] = useState([]);
  const [loadingModule, setLoadingModule] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Fetch today's sessions (for overview + completed tracking)
  const fetchCompleted = async () => {
    if (!studentNumber || !className) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const sessions = await base44.entities.SpanishReadingSession.filter({
        student_number: studentNumber,
        class_name: className,
        attempt_date: today,
      });
      setCompletedTexts(new Set(sessions.map(s => s.item_text)));
      setTodaySessions([...sessions].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch {}
  };

  useEffect(() => {
    if (selectedSection) fetchCompleted();
  }, [refreshKey, selectedSection]);

  // Load module with mastery-based sorting: items the teacher marked correct
  // are deprioritized (placed last) so students focus on what they need to learn
  const loadModule = async (sectionKey, moduleNum) => {
    setLoadingModule(true);
    const section = listsData?.[sectionKey] || {};
    const moduleData = section[`M${moduleNum}`]?.new || [];
    const listName = `${sectionKey} M${moduleNum}`;

    // Fetch mastery history — items teacher marked correct appear less frequently
    let mastered = new Set();
    try {
      const allSessions = await base44.entities.SpanishReadingSession.filter({
        student_number: studentNumber,
        class_name: className,
        list_name: listName,
      });
      mastered = new Set(
        allSessions.filter(s => s.teacher_grade === 'correct').map(s => s.item_text)
      );
    } catch {}

    // Non-mastered first (what they need to practice), mastered last (easy points deprioritized)
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const nonMastered = moduleData.filter(it => !mastered.has(getItemText(it)));
    const masteredItems = moduleData.filter(it => mastered.has(getItemText(it)));
    const sorted = [...shuffle(nonMastered), ...shuffle(masteredItems)];

    setItems(sorted);
    setCurrentIdx(0);
    setViewMode('reading');
    setPhase('reading');
    setRecordingBlob(null);
    setLoadingModule(false);
    fetchCompleted();
  };

  const handleSectionSelect = (sectionKey) => {
    setSelectedSection(sectionKey);
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
    const currentItem = items[currentIdx];
    const itemText = getItemText(currentItem);

    let recordingUrl = null;
    if (recordingBlob) {
      const ext = recordingBlob.type?.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([recordingBlob], `spanish_reading_${Date.now()}.${ext}`, { type: recordingBlob.type });
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        recordingUrl = file_url;
      } catch {}
    }

    const today = new Date().toISOString().slice(0, 10);
    const newSession = await base44.entities.SpanishReadingSession.create({
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

    const newCompleted = new Set(completedTexts);
    newCompleted.add(itemText);
    setCompletedTexts(newCompleted);
    setTodaySessions(prev => [newSession, ...prev]);
    setRefreshKey(k => k + 1);
    setRecordingBlob(null);

    // Auto-advance to next unread item
    const nextUnreadIdx = items.findIndex(it => !newCompleted.has(getItemText(it)));
    if (nextUnreadIdx !== -1) {
      setCurrentIdx(nextUnreadIdx);
      setPhase('reading');
    } else {
      // All items done — show session overview for reflection
      setViewMode('overview');
      setPhase('reading');
    }
  };

  // ── Loading ──
  if (!listsData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Section selector ──
  if (!selectedSection) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
          <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold text-xs sm:text-sm shrink-0">← Back</button>
          <span className="text-white font-black text-sm sm:text-base flex-1 text-center">📖 Spanish Reading</span>
          <div className="w-24 sm:w-32 shrink-0">
            <RecordingsProgressBar studentNumber={studentNumber} className={className} refreshKey={refreshKey} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6 w-full max-w-md mx-auto">
          <p className="text-white font-black text-base sm:text-lg">Choose a List</p>
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {SECTIONS.map(sec => {
              const section = listsData[sec.key] || {};
              const moduleCount = Object.keys(section).filter(k => k.startsWith('M')).length;
              return (
                <motion.button key={sec.key} whileTap={{ scale: 0.97 }} onClick={() => handleSectionSelect(sec.key)}
                  className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-left px-3 sm:px-5 flex items-center justify-between"
                  style={{ background: '#1a1a2e', border: '2px solid #4338ca', opacity: moduleCount === 0 ? 0.4 : 1 }}
                  disabled={moduleCount === 0}>
                  <span className="text-white flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">{sec.icon}</span>
                    <span className="text-sm sm:text-base">{sec.label}</span>
                  </span>
                  <span className="text-indigo-400 text-[10px] sm:text-xs uppercase shrink-0 ml-2">{moduleCount} mod</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Module + reading/overview view ──
  const section = listsData[selectedSection] || {};
  const moduleNums = Object.keys(section)
    .map(k => parseInt(k.replace(/\D/g, '')))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  const currentItem = items[currentIdx];
  const itemText = getItemText(currentItem);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '1px solid #4338ca' }}>
        <button onClick={() => { setSelectedSection(null); setSelectedModule(null); setViewMode('reading'); }}
          className="text-indigo-300 hover:text-white font-bold text-xs sm:text-sm shrink-0">← Lists</button>
        <span className="text-white font-black text-xs sm:text-sm flex-1 text-center truncate min-w-0 px-1">
          {sectionConfig?.icon} {selectedSection} · M{selectedModule}
        </span>
        <button onClick={() => setViewMode('overview')}
          className={`text-xs sm:text-sm font-bold shrink-0 px-2 py-1 rounded-lg transition ${viewMode === 'overview' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:text-white'}`}
          title="Session overview">
          📊
        </button>
        <div className="w-20 sm:w-32 shrink-0">
          <RecordingsProgressBar studentNumber={studentNumber} className={className} refreshKey={refreshKey} />
        </div>
      </div>

      {/* Module pills */}
      <div className="flex gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 overflow-x-auto shrink-0" style={{ background: '#1a1a2e' }}>
        {moduleNums.map(m => (
          <button key={m} onClick={() => handleModuleSelect(m)}
            className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all ${
              selectedModule === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-indigo-300 hover:bg-gray-700'
            }`}>
            M{m}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingModule ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'overview' ? (
        <SessionOverview
          sessions={todaySessions}
          onContinue={() => setViewMode('reading')}
        />
      ) : currentItem ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {phase === 'reading' && (
            <SlideToReadCanvas
              key={`${selectedSection}-${selectedModule}-${currentIdx}`}
              text={itemText}
              itemId={getItemId(currentItem)}
              onRecordingComplete={handleRecordingComplete}
              onBack={() => setViewMode('overview')}
            />
          )}
          {phase === 'selfgrade' && (
            <div className="flex-1 overflow-y-auto">
              <SelfGradeScreen
                blob={recordingBlob}
                itemText={itemText}
                onGrade={handleSelfGrade}
                onBack={() => { setPhase('reading'); setRecordingBlob(null); }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-indigo-400">No items in this module.</p>
          <button onClick={() => { setSelectedSection(null); setSelectedModule(null); }}
            className="px-4 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#4338ca' }}>
            ← Back to Lists
          </button>
        </div>
      )}
    </div>
  );
}