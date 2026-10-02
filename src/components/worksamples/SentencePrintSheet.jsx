import React from 'react';
import { CARD_MAP, assembleSentence } from '@/components/data/sentenceCards';
import StaticStrokes from './StaticStrokes';

const PRINT_WIDTH = 680;
const WRITE_HEIGHT = 140; // 2 practice lines

// Simple lined background for the sentence writing area (sky/fence/grass/dirt).
function SimpleLines({ width, height, lineCount = 2 }) {
  const lh = height / lineCount;
  const rows = [];
  for (let i = 0; i < lineCount; i++) {
    const yTop = i * lh;
    rows.push(
      <line key={`sky${i}`} x1={0} y1={yTop + lh * 0.10} x2={width} y2={yTop + lh * 0.10} stroke="#4a90e2" strokeWidth={2} opacity={0.8} />,
      <line key={`fence${i}`} x1={0} y1={yTop + lh * 0.367} x2={width} y2={yTop + lh * 0.367} stroke="#000" strokeWidth={1.5} strokeDasharray="10 6" opacity={0.7} />,
      <line key={`grass${i}`} x1={0} y1={yTop + lh * 0.633} x2={width} y2={yTop + lh * 0.633} stroke="#16a34a" strokeWidth={2} opacity={0.8} />,
      <line key={`dirt${i}`} x1={0} y1={yTop + lh * 0.90} x2={width} y2={yTop + lh * 0.90} stroke="#8d6e63" strokeWidth={2} opacity={0.85} />,
    );
  }
  return (
    <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <rect x={0} y={0} width={width} height={height} fill="white" />
      {rows}
    </svg>
  );
}

// One student's Creando Oraciones worksheet: card thumbnails, sentence text,
// handwriting on lines, self-check marks, and optional drawing.
export default function SentencePrintSheet({ student, session }) {
  const rows = Array.isArray(session?.rows) ? session.rows : [];
  const dateStr = session?.page_date
    ? new Date(session.page_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="ws-print-sheet" style={{ width: PRINT_WIDTH, margin: '0 auto', padding: '0.2in 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
          {student.name || `Estudiante #${student.student_number}`}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          Creando oraciones · {dateStr}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Nombre:</span>
        <div style={{ flex: 1, borderBottom: '2px solid #334155' }} />
      </div>

      {rows.map((row, i) => {
        const whoCard = CARD_MAP[row.who_card];
        const whatCard = CARD_MAP[row.what_card];
        const whereCard = CARD_MAP[row.where_card];
        const sentence = (row.who_card && row.what_card)
          ? assembleSentence(whoCard, whatCard, whereCard, row.mode)
          : '';
        const checks = row.self_checks || {};
        const hasWriting = row.writing_strokes && Object.keys(row.writing_strokes).length > 0;

        return (
          <div key={i} style={{ marginBottom: 10, breakInside: 'avoid' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontWeight: 800, fontSize: 12, color: '#475569' }}>{i + 1}.</span>
              {whoCard && <img src={whoCard.color} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6 }} />}
              {whatCard && <img src={whatCard.color} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6 }} />}
              {row.mode === '3part' && whereCard && <img src={whereCard.color} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6 }} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginLeft: 4 }}>{sentence}</span>
            </div>

            <div style={{ position: 'relative', width: PRINT_WIDTH, height: WRITE_HEIGHT, border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <SimpleLines width={PRINT_WIDTH} height={WRITE_HEIGHT} lineCount={2} />
              {hasWriting && <StaticStrokes strokes={row.writing_strokes} width={PRINT_WIDTH} height={WRITE_HEIGHT} />}
            </div>

            <div style={{ display: 'flex', gap: 10, fontSize: 10, marginTop: 3, color: '#64748b' }}>
              {[
                ['capital', 'Mayúscula'],
                ['spaces', 'Espacios'],
                ['period', 'Punto'],
                ['legible', 'Legible'],
              ].map(([key, label]) => (
                <span key={key} style={{ fontWeight: 600 }}>
                  {checks[key] ? '☑' : '☐'} {label}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {session?.drawing_strokes && Object.keys(session.drawing_strokes).length > 0 && (
        <div style={{ marginTop: 8, breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#334155' }}>Dibujo:</p>
          <div style={{ position: 'relative', width: PRINT_WIDTH, height: 250, border: '2px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            <StaticStrokes strokes={session.drawing_strokes} width={PRINT_WIDTH} height={250} />
          </div>
        </div>
      )}
    </div>
  );
}