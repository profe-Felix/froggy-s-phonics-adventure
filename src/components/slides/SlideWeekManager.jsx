import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { getCurrentWeek, getWeeksInPeriod, extractPresentationId } from '@/lib/slidesUtils';
import { Plus, Presentation as PresentationIcon, Loader2, Trash2, ExternalLink } from 'lucide-react';

const SUBJECTS = ['Phonics', 'Reading', 'Math', 'Science', 'Social Studies'];

// Weekly slide manager — organizes Google Slides presentations into a
// 4-period (9-week) structure. Auto-detects the current week and lets the
// teacher add presentations per subject, then present them in the viewer.
export default function SlideWeekManager({ className }) {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(1);
  const [week, setWeek] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', subject: 'Phonics', url: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { period: p, week: w } = getCurrentWeek();
    setPeriod(p);
    setWeek(w);
  }, []);

  useEffect(() => { loadPresentations(); }, [className]);

  const loadPresentations = async () => {
    setLoading(true);
    try {
      const { items } = await base44.entities.SlidePresentation.filter(
        { school_year: ACTIVE_SCHOOL_YEAR, class_name: { $in: [className, ''] } },
        { sort: '-created_date', limit: 200 }
      );
      setPresentations(items);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const weekPresentations = presentations.filter(p => p.nine_weeks === period && p.week_number === week);

  const handleAdd = async () => {
    if (!addForm.url || !addForm.title || saving) return;
    setSaving(true);
    try {
      await base44.entities.SlidePresentation.create({
        title: addForm.title,
        subject: addForm.subject,
        presentation_url: addForm.url,
        presentation_id: extractPresentationId(addForm.url),
        class_name: className || '',
        school_year: ACTIVE_SCHOOL_YEAR,
        nine_weeks: period,
        week_number: week,
      });
      setAddForm({ title: '', subject: 'Phonics', url: '' });
      setShowAddForm(false);
      await loadPresentations();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await base44.entities.SlidePresentation.delete(id); loadPresentations(); }
    catch (err) { console.error(err); }
  };

  const present = (p) => { window.location.href = `/GoogleSlidesViewer?id=${p.id}`; };

  return (
    <div className="h-full overflow-y-auto p-4 pb-20" style={{ color: '#fff' }}>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4].map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${period === p ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70 hover:text-white'}`}>
            Period {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {Array.from({ length: getWeeksInPeriod(period) }, (_, i) => i + 1).map(w => (
          <button key={w} onClick={() => setWeek(w)} className={`w-10 h-10 rounded-lg font-bold text-sm transition ${week === w ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/70 hover:text-white'}`}>
            {w}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-white/50 animate-spin" /></div>
      ) : weekPresentations.length === 0 ? (
        <div className="text-center py-12 text-white/50">
          <PresentationIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No presentations for Period {period}, Week {week}</p>
          <button onClick={() => setShowAddForm(true)} className="mt-4 flex items-center gap-2 mx-auto bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> Add Presentation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {weekPresentations.map(p => (
            <div key={p.id} className="bg-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{p.title}</div>
                <div className="text-white/50 text-sm">{p.subject}</div>
                <div className="text-white/40 text-xs mt-1">{p.slide_count || 0} slides {p.slide_data_fetched ? '✓' : '(fetching...)'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => present(p)} className="flex items-center gap-1 bg-indigo-600 text-white font-bold text-sm px-4 py-2 rounded-lg active:scale-95">
                  <ExternalLink className="w-4 h-4" /> Present
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg bg-white/10 text-white/50 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 text-white/70 hover:text-white">
            <Plus className="w-4 h-4" /> Add another
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowAddForm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full text-slate-900" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Add Presentation</h3>
            <p className="text-sm text-slate-500 mb-4">Period {period}, Week {week}</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold">Title</label>
                <input type="text" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Phonics Lesson M2.L1" className="w-full mt-1 px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-bold">Subject</label>
                <select value={addForm.subject} onChange={e => setAddForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border rounded-lg">
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold">Google Slides URL</label>
                <input type="url" value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://docs.google.com/presentation/d/..." className="w-full mt-1 px-3 py-2 border rounded-lg" />
                <p className="text-xs text-slate-500 mt-1">Share the presentation with your connected Google account first.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 border rounded-lg font-bold">Cancel</button>
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}