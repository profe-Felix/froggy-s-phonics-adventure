import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { Link } from 'react-router-dom';
import { Trash2, ArrowLeft } from 'lucide-react';

// Convert a stroke (array of {x,y} normalized 0-1) to an SVG path d-string.
function strokeToPath(stroke) {
  if (!stroke || !stroke.length) return '';
  return stroke.map((p, i) => {
    const x = (p.x ?? 0) * 200;
    const y = (p.y ?? 0) * 200;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

// Render a single letter's strokes as an SVG preview.
function LetterPreview({ strokes, label, color = '#6366f1', size = 200 }) {
  const allPaths = (strokes || []).map((s, i) => (
    <path
      key={i}
      d={strokeToPath(s)}
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 200 200" className="border rounded bg-white">
        {/* Guide lines */}
        <line x1="0" y1="20" x2="200" y2="20" stroke="#85b0f9" strokeWidth="1" />
        <line x1="0" y1="84" x2="200" y2="84" stroke="#000" strokeWidth="0.5" strokeDasharray="4 3" />
        <line x1="0" y1="144" x2="200" y2="144" stroke="#43a047" strokeWidth="1" />
        <line x1="0" y1="184" x2="200" y2="184" stroke="#795548" strokeWidth="0.5" strokeDasharray="4 3" />
        {allPaths}
      </svg>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
    </div>
  );
}

export default function LegacyLetterReview() {
  const [dbRecords, setDbRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    base44.entities.LetterWaypoint.list()
      .then((records) => setDbRecords(records || []))
      .catch((e) => alert('Failed to load: ' + (e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (rec) => {
    if (!confirm(`Delete the DB waypoint for "${rec.letter}"? The built-in version will be used after deletion.`)) return;
    setDeleting(rec.id);
    try {
      await base44.entities.LetterWaypoint.delete(rec.id);
      setDbRecords((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e));
    } finally {
      setDeleting(null);
    }
  };

  // Sort: lowercase letters first, then uppercase, then others
  const sorted = [...dbRecords].sort((a, b) => {
    const aL = a.letter || '';
    const bL = b.letter || '';
    const aLower = aL === aL.toLowerCase() && aL === aL.toUpperCase() ? 1 : aL === aL.toLowerCase() ? 0 : 1;
    const bLower = bL === bL.toLowerCase() && bL === bL.toUpperCase() ? 1 : bL === bL.toLowerCase() ? 0 : 1;
    if (aLower !== bLower) return aLower - bLower;
    return aL.localeCompare(bL);
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="p-2 rounded-lg bg-white border hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-800">Legacy Letter Waypoint Review</h1>
          </div>
          <span className="text-sm text-slate-500">
            {dbRecords.length} DB record{dbRecords.length !== 1 ? 's' : ''} · Built-in: {Object.keys(LETTER_WAYPOINTS).length} letters
          </span>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <strong>How to use:</strong> Each row shows the DB-stored waypoints (left) next to the built-in hand-tuned waypoints (right).
          If the DB version looks wrong (upside down, fragmented, or distorted), delete it — the built-in version will take over.
          Yellow highlight = DB entry exists for this letter (overrides built-in).
        </div>

        {loading && <div className="text-center py-12 text-slate-400">Loading DB waypoints…</div>}

        {!loading && sorted.length === 0 && (
          <div className="text-center py-12 text-slate-400">No DB waypoint records found. All letters use built-in data.</div>
        )}

        <div className="space-y-3">
          {sorted.map((rec) => {
            const builtIn = LETTER_WAYPOINTS[rec.letter];
            let dbStrokes = [];
            try { dbStrokes = JSON.parse(rec.strokes_data || '[]'); } catch { /* malformed */ }
            const dbHint = rec.hint || '';
            const builtInHint = builtIn?.hint || '';
            const hintsDiffer = dbHint && builtInHint && dbHint !== builtInHint;
            const strokeCount = dbStrokes.length;
            const pointCount = dbStrokes.reduce((sum, s) => sum + (s?.length || 0), 0);

            return (
              <div key={rec.id} className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                {/* Letter label */}
                <div className="flex flex-col items-center justify-center w-16 shrink-0">
                  <span className="text-4xl font-bold text-slate-800">{rec.letter}</span>
                  <span className="text-xs text-slate-400 mt-1">{strokeCount} stroke{strokeCount !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-slate-400">{pointCount} pts</span>
                </div>

                {/* DB version */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">DB (legacy)</span>
                    {!builtIn && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">No built-in!</span>}
                  </div>
                  <LetterPreview strokes={dbStrokes} label="From database" color="#f59e0b" />
                </div>

                {/* Built-in version */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Built-in</span>
                    {!builtIn && <span className="text-xs text-slate-400">—</span>}
                  </div>
                  <LetterPreview strokes={builtIn?.strokes} label="Hand-tuned code" color="#6366f1" />
                </div>

                {/* Hints + delete */}
                <div className="w-48 shrink-0 flex flex-col gap-2">
                  <div className="text-xs">
                    <div className="font-semibold text-slate-700">DB hint:</div>
                    <div className={`p-1.5 rounded ${hintsDiffer ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      "{dbHint}"{!dbHint && <span className="text-slate-400">(empty)</span>}
                    </div>
                  </div>
                  {hintsDiffer && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Built-in hint:</div>
                      <div className="p-1.5 rounded bg-indigo-50 border border-indigo-200">"{builtInHint}"</div>
                    </div>
                  )}
                  <button
                    onClick={() => handleDelete(rec)}
                    disabled={deleting === rec.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting === rec.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}