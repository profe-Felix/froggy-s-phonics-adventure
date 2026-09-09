import { useState } from 'react';

export default function ConferenceForm({ defaultTeacher, onCreate, loading }) {
  const [title, setTitle] = useState('');
  const [teacher_name, setTeacher] = useState(defaultTeacher || '');
  const [class_name, setClassName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim() || !teacher_name.trim()) return;
    onCreate({ title: title.trim(), teacher_name: teacher_name.trim(), class_name: class_name.trim() });
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-6">
      <h2 className="font-bold text-slate-800 mb-4">New Conference</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-slate-600">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October Conferences" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-600">Teacher</span>
          <input value={teacher_name} onChange={(e) => setTeacher(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-600">Class (optional)</span>
          <input value={class_name} onChange={(e) => setClassName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </label>
      </div>
      <button type="submit" disabled={loading} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 active:scale-95 transition">
        {loading ? 'Creating…' : 'Create Conference'}
      </button>
    </form>
  );
}