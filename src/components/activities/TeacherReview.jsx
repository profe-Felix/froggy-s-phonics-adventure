import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import ActivityReplay from '@/components/activities/ActivityReplay';
import ManipulationReplay from '@/components/activities/ManipulationReplay';
import HuntReplay from '@/components/activities/HuntReplay';
import RhymeReplay from '@/components/activities/RhymeReplay';

// Teacher review: lists ActivityResponse records for the current activity mode,
// plays each student's voice recording, shows their Elkonin placement, and lets
// the teacher mark reviewed / add a note.
export default function TeacherReview({ mode }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await base44.entities.ActivityResponse.filter({ activity_mode: mode }, '-submitted_at', 100);
      setRecords(list || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  async function setReviewed(rec, reviewed) {
    try {
      await base44.entities.ActivityResponse.update(rec.id, { reviewed });
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, reviewed } : r)));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function saveNote(rec, teacher_note) {
    try {
      await base44.entities.ActivityResponse.update(rec.id, { teacher_note });
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, teacher_note } : r)));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-bold text-slate-800">Respuestas de estudiantes</h2>
        <button
          onClick={load}
          className="ml-auto px-3 py-1.5 rounded-lg border bg-white text-sm font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>
      {loading && <div className="text-slate-500 text-sm">Cargando…</div>}
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!loading && !err && records.length === 0 && (
        <div className="text-slate-500 text-sm">Aún no hay respuestas para esta actividad.</div>
      )}
      <div className="flex flex-col gap-3">
        {records.map((r) => (
          <ResponseCard key={r.id} rec={r} onReviewed={setReviewed} onNote={saveNote} />
        ))}
      </div>
    </div>
  );
}

function ResponseCard({ rec, onReviewed, onNote }) {
  const ok = rec.is_correct;
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-slate-800">{rec.student_name || 'Estudiante'}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {rec.placed_count} / {rec.correct_count}
        </span>
        <span className="text-xs text-slate-400 ml-auto">
          {rec.submitted_at ? new Date(rec.submitted_at).toLocaleString() : ''}
        </span>
      </div>

      <div className="mt-2 text-lg font-bold text-slate-700">{rec.item_text}</div>

      {rec.activity_mode === 'phoneme_manipulation'
        ? <ManipulationReplay rec={rec} />
        : rec.activity_mode === 'text_hunt'
        ? <HuntReplay rec={rec} />
        : rec.activity_mode === 'rhyme_identification'
        ? <RhymeReplay rec={rec} />
        : <ActivityReplay rec={rec} />}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onReviewed(rec, !rec.reviewed)}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 ${
            rec.reviewed ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {rec.reviewed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          {rec.reviewed ? 'Revisado' : 'Marcar revisado'}
        </button>
        <input
          defaultValue={rec.teacher_note || ''}
          onBlur={(e) => onNote(rec, e.target.value)}
          placeholder="Nota del maestro…"
          className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border bg-white text-sm"
        />
      </div>
    </div>
  );
}