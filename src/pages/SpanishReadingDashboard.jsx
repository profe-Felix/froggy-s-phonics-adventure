import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CLASSES = ['Felix', 'Valero', 'Campos'];

function formatDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function SessionCard({ session, onReview, onDelete }) {
  const [note, setNote] = useState(session.teacher_note || '');
  const [saving, setSaving] = useState(false);

  const handleSaveNote = async () => {
    setSaving(true);
    await onReview(session.id, note);
    setSaving(false);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-md p-4 border-l-4 ${session.reviewed ? 'border-green-400' : 'border-amber-400'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-black text-gray-800 text-sm">Student #{session.student_number}</p>
          <p className="text-xs text-indigo-600 font-semibold">{session.list_name}</p>
          <p className="text-xs text-gray-400">{formatDate(session.created_date)}</p>
        </div>
        <div className="flex items-center gap-1">
          {session.reviewed && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Reviewed</span>}
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Video player — shows canvas + voice recording */}
      {session.recording_url ? (
        <video src={session.recording_url} controls className="w-full rounded-xl mb-2 bg-black" style={{ maxHeight: 200 }} />
      ) : (
        <div className="text-xs text-gray-400 text-center py-2 mb-2">No recording</div>
      )}

      {/* Note */}
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="Add a note about this student's reading…"
        className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none h-14 focus:outline-none focus:border-indigo-300"
      />
      <div className="flex gap-2 mt-1">
        <button onClick={handleSaveNote} disabled={saving}
          className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 disabled:opacity-50">
          {saving ? 'Saving…' : '✓ Mark Reviewed'}
        </button>
      </div>
    </div>
  );
}

export default function SpanishReadingDashboard() {
  const [selectedClass, setSelectedClass] = useState(null);
  const [filterReviewed, setFilterReviewed] = useState('all');
  const [filterList, setFilterList] = useState('all');
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['spanish-sessions', selectedClass],
    queryFn: () => base44.entities.SpanishReadingSession.filter({ class_name: selectedClass }),
    enabled: !!selectedClass,
    refetchInterval: 10000,
  });

  const handleReview = async (id, note) => {
    await base44.entities.SpanishReadingSession.update(id, { reviewed: true, teacher_note: note });
    queryClient.invalidateQueries({ queryKey: ['spanish-sessions', selectedClass] });
  };

  const handleDelete = async (id) => {
    await base44.entities.SpanishReadingSession.delete(id);
    queryClient.invalidateQueries({ queryKey: ['spanish-sessions', selectedClass] });
  };

  const uniqueLists = [...new Set(sessions.map(s => s.list_name))];

  const filtered = sessions.filter(s => {
    if (filterReviewed === 'reviewed' && !s.reviewed) return false;
    if (filterReviewed === 'unreviewed' && s.reviewed) return false;
    if (filterList !== 'all' && s.list_name !== filterList) return false;
    return true;
  }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const unreviewed = sessions.filter(s => !s.reviewed).length;

  if (!selectedClass) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-5xl">📖</div>
        <h1 className="text-3xl font-bold text-white">Spanish Reading</h1>
        <p className="text-white/70">Teacher Dashboard — Select a class</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {CLASSES.map(cls => (
            <button key={cls} onClick={() => setSelectedClass(cls)}
              className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50 shadow-lg">
              {cls}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-600 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSelectedClass(null)} className="text-white/80 hover:text-white font-bold text-sm">← Classes</button>
        <h1 className="font-black text-lg flex-1">📖 Spanish Reading — {selectedClass}</h1>
        {unreviewed > 0 && (
          <span className="bg-amber-400 text-amber-900 text-xs font-black px-2 py-1 rounded-full">{unreviewed} to review</span>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 py-3 bg-white border-b flex flex-wrap gap-2 items-center">
        <select value={filterReviewed} onChange={e => setFilterReviewed(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="all">All</option>
          <option value="unreviewed">Needs Review</option>
          <option value="reviewed">Reviewed</option>
        </select>
        {uniqueLists.length > 1 && (
          <select value={filterList} onChange={e => setFilterList(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">All Lists</option>
            {uniqueLists.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} sessions</span>
      </div>

      {/* Sessions grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center text-gray-400 py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">🎙</div>
            <p>No recordings yet. Students will appear here after they record themselves reading.</p>
          </div>
        ) : (
          filtered.map(session => (
            <SessionCard key={session.id} session={session}
              onReview={handleReview}
              onDelete={() => handleDelete(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}