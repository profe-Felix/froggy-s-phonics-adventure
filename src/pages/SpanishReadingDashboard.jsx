import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CLASSES = ['Felix', 'Valero', 'Campos'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function SessionCard({ session, onGrade, onDelete }) {
  const [note, setNote] = useState(session.teacher_note || '');
  const [saving, setSaving] = useState(false);
  const isSentence = session.item_type === 'sentence';
  const points = isSentence ? 10 : 2;

  const handleConfirm = async (grade) => {
    setSaving(true);
    await onGrade(session.id, grade, note, grade === 'correct' ? points : 0);
    setSaving(false);
  };

  const teacherGrade = session.teacher_grade || 'pending';
  const studentGrade = session.student_self_grade || 'pending';

  let borderColor = '#4338ca';
  if (teacherGrade === 'correct') borderColor = '#16a34a';
  else if (teacherGrade === 'incorrect') borderColor = '#dc2626';
  else if (studentGrade === 'correct') borderColor = '#ca8a04'; // pending review but student said correct

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 flex flex-col gap-3"
      style={{ borderLeft: `4px solid ${borderColor}` }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black text-gray-800 text-sm">Student #{session.student_number}</p>
          <p className="text-xs text-indigo-600 font-semibold">{session.list_name}</p>
          {session.item_text && (
            <p className="text-sm font-bold text-gray-700 mt-0.5">"{session.item_text}"</p>
          )}
          <p className="text-xs text-gray-400">{formatDate(session.created_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none">✕</button>
          {teacherGrade !== 'pending' && (
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${teacherGrade === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {teacherGrade === 'correct' ? `✓ +${session.points_awarded ?? points}pts` : '✗ 0pts'}
            </span>
          )}
        </div>
      </div>

      {/* Student self-grade badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Student said:</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          studentGrade === 'correct' ? 'bg-green-100 text-green-700' :
          studentGrade === 'incorrect' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-500'}`}>
          {studentGrade === 'correct' ? '✓ Correct' : studentGrade === 'incorrect' ? '✗ Incorrect' : '⏳ Pending'}
        </span>
      </div>

      {/* Recording player */}
      {session.recording_url ? (
        <video src={session.recording_url} controls className="w-full rounded-lg" style={{ maxHeight: 160 }} />
      ) : (
        <div className="text-xs text-gray-400 text-center py-1">No recording</div>
      )}

      {/* Note */}
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="Add a note…"
        className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none h-12 focus:outline-none focus:border-indigo-300"
      />

      {/* Teacher grade buttons */}
      {teacherGrade === 'pending' ? (
        <div className="flex gap-2">
          <button onClick={() => handleConfirm('correct')} disabled={saving}
            className="flex-1 py-2 bg-green-500 text-white text-xs font-black rounded-xl hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1">
            ✓ Correct (+{points}pts)
          </button>
          <button onClick={() => handleConfirm('incorrect')} disabled={saving}
            className="flex-1 py-2 bg-red-400 text-white text-xs font-black rounded-xl hover:bg-red-500 disabled:opacity-50 flex items-center justify-center gap-1">
            ✗ Incorrect
          </button>
        </div>
      ) : (
        <button onClick={() => handleConfirm('pending')} disabled={saving}
          className="w-full py-1.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-xl hover:bg-gray-200">
          ↩ Undo Grade
        </button>
      )}
    </div>
  );
}

export default function SpanishReadingDashboard() {
  const [selectedClass, setSelectedClass] = useState(null);
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterList, setFilterList] = useState('all');
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['spanish-sessions', selectedClass],
    queryFn: () => base44.entities.SpanishReadingSession.filter({ class_name: selectedClass }),
    enabled: !!selectedClass,
    refetchInterval: 10000,
  });

  const handleGrade = async (id, teacherGrade, note, points) => {
    await base44.entities.SpanishReadingSession.update(id, {
      teacher_grade: teacherGrade,
      teacher_note: note,
      points_awarded: points,
      reviewed: teacherGrade !== 'pending',
    });
    queryClient.invalidateQueries({ queryKey: ['spanish-sessions', selectedClass] });
  };

  const handleDelete = async (id) => {
    await base44.entities.SpanishReadingSession.delete(id);
    queryClient.invalidateQueries({ queryKey: ['spanish-sessions', selectedClass] });
  };

  const uniqueLists = [...new Set(sessions.map(s => s.list_name).filter(Boolean))];

  const filtered = sessions.filter(s => {
    if (filterGrade === 'pending' && s.teacher_grade !== 'pending') return false;
    if (filterGrade === 'reviewed' && s.teacher_grade === 'pending') return false;
    if (filterList !== 'all' && s.list_name !== filterList) return false;
    return true;
  }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const pendingCount = sessions.filter(s => s.teacher_grade === 'pending' && s.student_self_grade !== 'pending').length;

  // Points summary per student
  const studentPoints = {};
  sessions.forEach(s => {
    if (s.teacher_grade === 'correct' && s.points_awarded > 0) {
      const key = s.student_number;
      studentPoints[key] = (studentPoints[key] || 0) + s.points_awarded;
    }
  });

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
        {pendingCount > 0 && (
          <span className="bg-amber-400 text-amber-900 text-xs font-black px-2 py-1 rounded-full">{pendingCount} to review</span>
        )}
      </div>

      {/* Points leaderboard */}
      {Object.keys(studentPoints).length > 0 && (
        <div className="px-4 py-3 bg-white border-b">
          <p className="text-xs font-black text-gray-500 uppercase mb-2">⭐ Points Leaderboard</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(studentPoints)
              .sort((a, b) => b[1] - a[1])
              .map(([num, pts]) => (
                <span key={num} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                  #{num}: {pts}pts
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-4 py-3 bg-white border-b flex flex-wrap gap-2 items-center">
        <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="all">All</option>
          <option value="pending">Needs Review</option>
          <option value="reviewed">Reviewed</option>
        </select>
        {uniqueLists.length > 1 && (
          <select value={filterList} onChange={e => setFilterList(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">All Lists</option>
            {uniqueLists.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} attempts</span>
      </div>

      {/* Sessions grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center text-gray-400 py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">🎙</div>
            <p>No recordings yet.</p>
          </div>
        ) : (
          filtered.map(session => (
            <SessionCard key={session.id} session={session}
              onGrade={handleGrade}
              onDelete={() => handleDelete(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}