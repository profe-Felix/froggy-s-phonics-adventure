import React, { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import SlideToReadCanvas from '../SlideToReadCanvas';
import { uploadBlendingDemo } from '@/lib/blendingDemoUpload';
import { SUBSTEP_COLORS as C } from './substepTheme';

export default function PracticeSubstep({ substep, onRecordingComplete, teacherMode = false, lessonId, stepIndex }) {
  const { word, itemId, hint, itemType = 'word' } = substep;
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error

  const handleSaveModel = async (blob) => {
    if (!blob || !lessonId || stepIndex == null) return;
    setSaveState('saving');
    try {
      await uploadBlendingDemo(blob, word, lessonId, stepIndex);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (e) {
      console.error('Demo upload failed:', e);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Teacher save feedback banner */}
      {teacherMode && saveState !== 'idle' && (
        <div className="shrink-0 px-4 py-1.5 text-center text-sm font-bold"
          style={{
            background: saveState === 'saving' ? '#dbeafe' : saveState === 'saved' ? '#dcfce7' : '#fee2e2',
            color: saveState === 'saving' ? '#1e40af' : saveState === 'saved' ? '#166534' : '#991b1b',
          }}>
          {saveState === 'saving' && <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving model…</span>}
          {saveState === 'saved' && <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Model saved! Students will see this video.</span>}
          {saveState === 'error' && 'Upload failed — try again.'}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <SlideToReadCanvas
          text={word}
          itemId={itemId}
          itemType={itemType}
          theme="mint"
          onRecordingComplete={onRecordingComplete}
          onBack={() => {}}
          teacherMode={teacherMode}
          onSaveModel={handleSaveModel}
        />
      </div>
      {hint && (
        <p
          className="text-sm text-center py-2 px-4 shrink-0"
          style={{ color: C.muted, background: C.bg }}
        >
          <span className="font-bold">Pista:</span> {hint}
        </p>
      )}
    </div>
  );
}