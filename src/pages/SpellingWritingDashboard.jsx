import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];
const MODE_LABELS = { spelling: 'Spelling Words', sight_words_spelling: 'Sight Words Spelling', sentences: 'Sentences' };

// SpellingWriteStep stores raw pixel coords at 800x360 canvas resolution
// We scale them to fit the display canvas
const SRC_W = 800, SRC_H = 360;

function StrokeReplayCanvas({ strokesData }) {
  const canvasRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef(null);

  const strokes = (() => {
    try { return JSON.parse(strokesData); } catch { return []; }
  })();

  // Scale a point from source canvas coords to display canvas coords
  const scalePoint = (p, dw, dh) => ({
    x: (p.x / SRC_W) * dw,
    y: (p.y / SRC_H) * dh,
  });

  const drawAll = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const dw = c.offsetWidth, dh = c.offsetHeight;
    c.width = dw * dpr; c.height = dh * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dw, dh);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    strokes.forEach(stroke => {
      if (!stroke || stroke.length < 2) return;
      const s0 = scalePoint(stroke[0], dw, dh);
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < stroke.length; i++) {
        const prev = scalePoint(stroke[i - 1], dw, dh);
        const cur = scalePoint(stroke[i], dw, dh);
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
      }
      ctx.stroke();
    });
  };

  useEffect(() => { drawAll(); }, [strokesData]);

  const replay = () => {
    if (playing || !strokes.length) return;
    setPlaying(true);
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    const dw = c.offsetWidth, dh = c.offsetHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';

    const allPts = strokes.flatMap((s, si) => s.map((p, pi) => ({ ...scalePoint(p, dw, dh), si, pi, last: pi === s.length - 1 })));
    let i = 0;
    const step = () => {
      if (i >= allPts.length) { setPlaying(false); drawAll(); return; }
      const pt = allPts[i];
      const scaled = allPts.filter(p => p.si === pt.si);
      if (pt.pi === 0) { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); }
      else {
        const prev = allPts[i - 1];
        if (prev.si === pt.si) {
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
          ctx.stroke();
          if (!pt.last) { ctx.beginPath(); ctx.moveTo((prev.x + pt.x) / 2, (prev.y + pt.y) / 2); }
        } else {
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
        }
      }
      i++;
      animRef.current = setTimeout(() => requestAnimationFrame(step), 8);
    };
    requestAnimationFrame(step);
  };

  return (
    <div className="flex flex-col gap-1">
      <canvas ref={canvasRef} className="w-full rounded-lg border border-indigo-200 bg-indigo-50" style={{ height: 80 }} />
      <button onClick={replay} disabled={playing}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
        {playing ? '▶ Playing…' : '▶ Replay'}
      </button>
    </div>
  );
}

export default function SpellingWritingDashboard() {
  const [className, setClassName] = useState('F');
  const [mode, setMode] = useState('spelling');
  const [expandedStudent, setExpandedStudent] = useState(null);

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['spelling-writing-samples', mode],
    queryFn: () => base44.entities.SpellingWritingSample.filter({ mode }),
    refetchInterval: 15000,
  });

  // Filter by class client-side (handles records saved without class_name)
  const filteredSamples = samples.filter(s => (s.class_name || '') === className);

  // Group by student
  const byStudent = {};
  filteredSamples.forEach(s => {
    if (!byStudent[s.student_number]) byStudent[s.student_number] = [];
    byStudent[s.student_number].push(s);
  });
  // Also show samples with no class_name under whichever class is selected (legacy records)
  const noClassSamples = samples.filter(s => !s.class_name);
  noClassSamples.forEach(s => {
    if (!byStudent[s.student_number]) byStudent[s.student_number] = [];
    byStudent[s.student_number].push(s);
  });
  const studentNumbers = Object.keys(byStudent).map(Number).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold">← Dashboard</Link>
          <h1 className="text-2xl font-black text-gray-800">✍️ Spelling Writing Samples</h1>
        </div>

        <div className="flex gap-3 flex-wrap mb-6">
          <div className="flex gap-1">
            {CLASS_NAMES.map(c => (
              <button key={c} onClick={() => setClassName(c)}
                className={`px-4 py-2 rounded-full font-bold text-sm ${className === c ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
                Class {c}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-4 py-2 rounded-full font-bold text-sm ${mode === k ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : studentNumbers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No writing samples yet for this class/mode.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {studentNumbers.map(num => {
              const studentSamples = byStudent[num].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
              const expanded = expandedStudent === num;
              return (
                <div key={num} className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
                    onClick={() => setExpandedStudent(expanded ? null : num)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-black text-lg flex items-center justify-center">{num}</div>
                      <span className="font-bold text-gray-800">Student #{num}</span>
                      <span className="text-sm text-gray-400">{studentSamples.length} sample{studentSamples.length !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="text-gray-400 text-lg">{expanded ? '▲' : '▼'}</span>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {studentSamples.map(sample => (
                        <div key={sample.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-indigo-700 text-lg">{sample.word}</span>
                            <span className="text-xs text-gray-400">
                              {sample.created_date ? new Date(sample.created_date).toLocaleDateString() : ''}
                            </span>
                          </div>
                          {sample.strokes_data ? (
                            <StrokeReplayCanvas strokesData={sample.strokes_data} />
                          ) : sample.image_url ? (
                            <img src={sample.image_url} alt={sample.word} className="w-full rounded-lg border border-indigo-100" style={{ height: 80, objectFit: 'contain' }} />
                          ) : (
                            <div className="h-20 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">No image</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}