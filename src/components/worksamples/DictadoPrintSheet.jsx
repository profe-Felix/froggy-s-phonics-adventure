import React from 'react';
import LinedPaper from '@/components/dictation/LinedPaper';
import StaticStrokes from './StaticStrokes';

const PRINT_WIDTH = 680;
const LINE_HEIGHT = 110;

// One student's dictado handwriting on lined paper.
// `session`   = LiveDictationSession (has lines + assignment_title)
// `submission` = DictationSubmission (strokes_data JSON string)
export default function DictadoPrintSheet({ student, session, submission }) {
  const lines = session?.lines || [];
  const lineCount = Math.min(Math.max(lines.length, 1), 6);
  const pageHeight = LINE_HEIGHT * lineCount;

  let parsed = null;
  if (submission?.strokes_data) {
    try { parsed = JSON.parse(submission.strokes_data); } catch { /* ignore */ }
  }

  return (
    <div className="ws-print-sheet" style={{ width: PRINT_WIDTH, margin: '0 auto', padding: '0.2in 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
          {student.name || `Estudiante #${student.student_number}`}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {session?.assignment_title || 'Dictado'} · {student.class_name}
        </span>
      </div>

      <div style={{ position: 'relative', width: PRINT_WIDTH, height: pageHeight, background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <LinedPaper width={PRINT_WIDTH} height={pageHeight} lineCount={lineCount} />
        {Array.from({ length: lineCount }).map((_, i) => {
          const lineData = parsed?.lines?.[i];
          const attempt = lineData?.attempt;
          return (
            <div key={i} style={{ position: 'absolute', top: i * LINE_HEIGHT, left: 0, width: PRINT_WIDTH, height: LINE_HEIGHT }}>
              {lines[i] && (
                <span style={{ position: 'absolute', left: 6, top: 2, fontSize: 9, color: '#cbd5e1', fontWeight: 600, pointerEvents: 'none' }}>
                  {lines[i]}
                </span>
              )}
              {attempt && <StaticStrokes strokes={attempt} width={PRINT_WIDTH} height={LINE_HEIGHT} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}