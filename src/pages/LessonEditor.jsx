import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useAuth } from '@/lib/AuthContext';
import { MODE_OPTIONS, MODE_BY_VALUE, COLOR_KEYS, colorOf } from '@/lib/lessonColors';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Star, Save, Download, Upload, Copy, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPresetList } from '@/lib/presets';
import StudentPicker from '@/components/lesson/StudentPicker';
import VideoPicker from '@/components/lesson/VideoPicker';
import ImagePicker from '@/components/lesson/ImagePicker';
import { ACTIVITY_MODES } from '@/lib/activities/engine';
import { HUNT_TYPES } from '@/lib/activities/hunt';
import { useActivityPresets } from '@/hooks/useActivityPresets';

const CLASSES = ['', 'Felix', 'Valero', 'Campos'];

function blankStep(mode = 'letter_sounds') {
  const m = MODE_BY_VALUE[mode];
  return {
    mode,
    title: m?.label || 'New Step',
    emoji: m?.emoji || '',
    color: 'sky',
    completion: { type: m?.defaultCompletion || 'view', target: m?.defaultTarget || 1 },
    config: {},
  };
}

function blankLesson() {
  return {
    title: '',
    lesson_number: 1,
    class_name: '',
    school_year: ACTIVE_SCHOOL_YEAR,
    subtitle: '',
    steps: [blankStep('letter_sounds')],
    active: true,
    assignment_type: 'class',
  };
}

function StepEditor({ step, index, total, onChange, onRemove, onMove }) {
  const { presets: ACTIVITY_PRESETS } = useActivityPresets();
  const update = (patch) => onChange({ ...step, ...patch });
  const updateCompletion = (patch) => onChange({ ...step, completion: { ...step.completion, ...patch } });

  const onModeChange = (mode) => {
    const m = MODE_BY_VALUE[mode];
    update({
      mode,
      title: step.title === MODE_BY_VALUE[step.mode]?.label ? m.label : step.title,
      emoji: step.emoji || m.emoji,
      completion: { type: m.defaultCompletion, target: m.defaultTarget },
    });
  };

  const c = colorOf(step.color);

  return (
    <div className={`rounded-2xl border-2 ${c.bg} border-white shadow-sm p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center font-black text-gray-700 text-sm">{index + 1}</span>
        <span className="text-xl">{step.emoji || MODE_BY_VALUE[step.mode]?.emoji}</span>
        <span className="font-bold text-gray-800 text-sm flex-1 truncate">{step.title}</span>
        <div className="flex gap-1">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white disabled:opacity-40 flex items-center justify-center"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white disabled:opacity-40 flex items-center justify-center"><ChevronDown className="w-4 h-4" /></button>
          <button onClick={onRemove} className="w-7 h-7 rounded-lg bg-white/80 hover:bg-red-100 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-500" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600 font-bold">Activity
          <select value={step.mode} onChange={e => onModeChange(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
            {MODE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 font-bold">Card label
          <input value={step.title} onChange={e => update({ title: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
      </div>

      {getPresetList(step.mode).length > 0 && (
        <label className="text-xs text-gray-600 font-bold">Preset
          <select value={step.config?.preset || ''} onChange={e => update({ config: { ...step.config, preset: e.target.value } })}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
            <option value="">— default —</option>
            {getPresetList(step.mode).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}

      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-gray-600 font-bold col-span-1">Emoji
          <input value={step.emoji} onChange={e => update({ emoji: e.target.value })} maxLength={4}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
        <label className="text-xs text-gray-600 font-bold col-span-1">Card color
          <select value={step.color} onChange={e => update({ color: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
            {COLOR_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 font-bold col-span-1">Completion
          <select value={step.completion.type} onChange={e => updateCompletion({ type: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
            <option value="view">View / play once</option>
            <option value="mastery">Mastery (N items)</option>
          </select>
        </label>
      </div>

      {step.completion.type === 'mastery' && (
        <label className="text-xs text-gray-600 font-bold">Items to master
          <input type="number" min={1} value={step.completion.target}
            onChange={e => updateCompletion({ target: parseInt(e.target.value) || 1 })}
            className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
      )}

      <label className="text-xs text-gray-600 font-bold">Availability
        <select value={step.live_scope || 'both'} onChange={e => update({ live_scope: e.target.value })}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
          <option value="both">Both (independent + live lesson)</option>
          <option value="live_only">Live lesson only</option>
        </select>
      </label>

      {step.mode === 'video' && (
        <label className="text-xs text-gray-600 font-bold">Video
          <VideoPicker value={step.config?.videoUrl || ''} onChange={(url) => update({ config: { ...step.config, videoUrl: url } })} />
        </label>
      )}

      {step.mode === 'soundwall' && (
        <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Sound wall cards</span>
            <button
              onClick={() => update({ config: { ...step.config, cards: [...(step.config?.cards || []), { label: '', imageUrl: '', sound: '' }] } })}
              className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Add card
            </button>
          </div>
          {(step.config?.cards || []).map((c, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-gray-200 p-2 bg-white/70">
              <div className="flex items-center gap-2">
                <input
                  value={c.label}
                  onChange={(e) => {
                    const cards = [...(step.config.cards)];
                    cards[i] = { ...c, label: e.target.value };
                    update({ config: { ...step.config, cards } });
                  }}
                  placeholder="Label e.g. /m/"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1"
                />
                <input
                  value={c.sound}
                  onChange={(e) => {
                    const cards = [...(step.config.cards)];
                    cards[i] = { ...c, sound: e.target.value };
                    update({ config: { ...step.config, cards } });
                  }}
                  placeholder="Letter (m)"
                  className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1"
                />
                <button
                  onClick={() => update({ config: { ...step.config, cards: step.config.cards.filter((_, j) => j !== i) } })}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <ImagePicker
                value={c.imageUrl}
                onChange={(url) => {
                  const cards = [...(step.config.cards)];
                  cards[i] = { ...c, imageUrl: url };
                  update({ config: { ...step.config, cards } });
                }}
              />
            </div>
          ))}
          {(!step.config?.cards || step.config.cards.length === 0) && (
            <p className="text-xs text-gray-400">No cards yet. Add one above.</p>
          )}
        </div>
      )}

      {step.mode === 'google_slides' && (
        <label className="text-xs text-gray-600 font-bold">Google Slides embed URL
          <input
            value={step.config?.slidesUrl || ''}
            onChange={(e) => update({ config: { ...step.config, slidesUrl: e.target.value } })}
            placeholder="https://docs.google.com/presentation/d/.../embed"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5"
          />
          <a
            href="https://docs.google.com"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-indigo-500 hover:underline"
          >
            In Google Slides: File → Share → Publish to web → Embed, then copy the embed link.
          </a>
        </label>
      )}

      {step.mode === 'activities' && (
        <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-2">
          <label className="text-xs text-gray-600 font-bold">Activity type
            <select value={step.config?.activityMode || 'counting_words'}
              onChange={e => update({ config: { ...step.config, activityMode: e.target.value, itemsText: '', preset: '' } })}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
              {ACTIVITY_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>

          <div>
            <label className="text-xs text-gray-600 font-bold">Preset (optional — fills examples)
              <select value={step.config?.preset || ''}
                onChange={e => {
                  const pid = e.target.value;
                  if (!pid) { update({ config: { ...step.config, preset: '' } }); return; }
                  const p = ACTIVITY_PRESETS[pid];
                  const lines = (p.items || []).map(it => {
                    if (typeof it === 'string') return it;
                    if (p.mode === 'rhyme_identification') return `${it.word1}, ${it.word2}, ${it.answer ? 'sí' : 'no'}`;
                    return it.text || '';
                  });
                  update({ config: { ...step.config, preset: pid, activityMode: p.mode, itemsText: lines.join('\n'), huntType: p.huntType || step.config?.huntType || '', huntTarget: p.target != null ? String(p.target) : step.config?.huntTarget || '' } });
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
                <option value="">— none —</option>
                {Object.keys(ACTIVITY_PRESETS).filter(id => ACTIVITY_PRESETS[id].mode === (step.config?.activityMode || 'counting_words')).map(id => <option key={id} value={id}>{ACTIVITY_PRESETS[id].label || id}</option>)}
              </select>
            </label>
            <Link to="/ActivityPresets" className="text-[10px] text-indigo-500 hover:underline font-bold inline-flex items-center gap-0.5 mt-1">
              <Settings className="w-3 h-3" /> Manage presets
            </Link>
          </div>

          {step.config?.activityMode === 'text_hunt' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600 font-bold">Hunt type
                <select value={step.config?.huntType || 'phoneme'}
                  onChange={e => update({ config: { ...step.config, huntType: e.target.value } })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
                  {HUNT_TYPES.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              </label>
              {HUNT_TYPES.find(h => h.key === (step.config?.huntType || 'phoneme'))?.needsTarget && (
                <label className="text-xs text-gray-600 font-bold">Target
                  <input value={step.config?.huntTarget || ''}
                    onChange={e => update({ config: { ...step.config, huntTarget: e.target.value } })}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                </label>
              )}
            </div>
          )}

          <label className="text-xs text-gray-600 font-bold">Examples (one per line{step.config?.activityMode === 'rhyme_identification' ? ' · word1, word2, sí/no' : ''})
            <textarea value={step.config?.itemsText || ''}
              onChange={e => update({ config: { ...step.config, itemsText: e.target.value, preset: '' } })}
              rows={4}
              placeholder={step.config?.activityMode === 'counting_words' ? 'El gato come\nYo soy grande' : step.config?.activityMode === 'rhyme_identification' ? 'gracioso, hermoso, sí\nnota, noche, no' : 'gato\nsol\nflor'}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 font-mono" />
          </label>
        </div>
      )}

      {(() => {
        const LETTER_MODES = ['letter_sounds', 'case_matching', 'letter_tracing', 'letter_recognition'];
        const WORD_MODES = ['sight_words_easy', 'sight_words_spelling', 'spelling', 'word_builder', 'powerful_word', 'syllable_blender', 'syllable_train'];
        const cat = LETTER_MODES.includes(step.mode) ? 'letters' : WORD_MODES.includes(step.mode) ? 'words' : null;
        if (!cat) return null;
        return (
          <label className="text-xs text-gray-600 font-bold">{cat === 'letters' ? 'Target letters' : 'Target words'}
            <input value={(step.config?.targets || []).join(', ')}
              onChange={e => update({ config: { ...step.config, targets: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
              placeholder={cat === 'letters' ? 'e.g. m, a, s  (blank = all)' : 'e.g. el, la, un  (blank = auto)'}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
          </label>
        );
      })()}
    </div>
  );
}

export default function LessonEditor() {
  const { user } = useAuth();
  const canManage = user && (user.role === 'admin' || user.role === 'teacher');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // lesson object being edited (new or existing)
  const [filterMode, setFilterMode] = useState('');

  const { data: lessons = [] } = useQuery({
    queryKey: ['all-lessons'],
    queryFn: () => base44.entities.Lesson.list(),
  });
  const sorted = [...lessons].sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0));
  const fileInputRef = useRef(null);

  // Export all lessons to a JSON file the teacher can edit locally and re-import.
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lessons.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import a lessons JSON array — upserts by id (updates existing, creates new).
  const importJson = async (file) => {
    try {
      const arr = JSON.parse(await file.text());
      if (!Array.isArray(arr)) { alert('JSON must be an array of lessons.'); return; }
      for (const l of arr) {
        const { id, created_date, updated_date, created_by_id, ...payload } = l;
        if (id) {
          try { await base44.entities.Lesson.update(id, payload); }
          catch { await base44.entities.Lesson.create(payload); }
        } else {
          await base44.entities.Lesson.create(payload);
        }
      }
      qc.invalidateQueries({ queryKey: ['all-lessons'] });
      qc.invalidateQueries({ queryKey: ['lessons'] });
      alert(`Imported ${arr.length} lesson(s).`);
    } catch (e) {
      alert('Import failed: ' + (e?.message || 'invalid JSON'));
    }
  };

  const save = async () => {
    if (!editing.title?.trim()) return alert('Please give the lesson a title.');
    const payload = {
      title: editing.title.trim(),
      lesson_number: editing.lesson_number || 1,
      class_name: editing.class_name || '',
      school_year: editing.school_year || ACTIVE_SCHOOL_YEAR,
      subtitle: editing.subtitle || '',
      steps: (editing.steps || []).map(({ __new, ...s }) => s),
      active: editing.active !== false,
      assignment_type: editing.assignment_type || 'class',
      assigned_students: editing.assignment_type === 'side_quest' ? (editing.assigned_students || []) : [],
    };
    if (editing.id) {
      await base44.entities.Lesson.update(editing.id, payload);
    } else {
      await base44.entities.Lesson.create(payload);
    }
    qc.invalidateQueries({ queryKey: ['all-lessons'] });
    qc.invalidateQueries({ queryKey: ['lessons'] });
    setEditing(null);
  };

  const remove = async (id) => {
    if (!confirm('Delete this lesson?')) return;
    await base44.entities.Lesson.delete(id);
    qc.invalidateQueries({ queryKey: ['all-lessons'] });
    qc.invalidateQueries({ queryKey: ['lessons'] });
  };

  // Clone a lesson with a new number so it appears as the next puck on the path.
  const duplicate = async (l) => {
    const { id, created_date, updated_date, created_by_id, ...payload } = l;
    const maxNum = Math.max(0, ...lessons.map((x) => x.lesson_number || 0));
    await base44.entities.Lesson.create({
      ...payload,
      title: (l.title || 'Lesson') + ' (copy)',
      lesson_number: maxNum + 1,
      steps: (l.steps || []).map((s) => ({ ...s })),
    });
    qc.invalidateQueries({ queryKey: ['all-lessons'] });
    qc.invalidateQueries({ queryKey: ['lessons'] });
  };

  if (!canManage) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Teachers only.</div>;
  }

  if (editing) {
    const steps = editing.steps || [];
    const setSteps = (next) => setEditing({ ...editing, steps: next });
    const moveStep = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= steps.length) return;
      const next = [...steps];
      [next[i], next[j]] = [next[j], next[i]];
      setSteps(next);
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-2xl mx-auto p-4">
          <button onClick={() => setEditing(null)} className="text-indigo-600 hover:underline font-bold text-sm mb-3 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> All lessons
          </button>
          <h1 className="text-2xl font-black text-gray-800 mb-4">{editing.id ? 'Edit Lesson' : 'New Lesson'}</h1>

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600 font-bold">Title
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Letter M"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
              </label>
              <label className="text-xs text-gray-600 font-bold">Lesson number
                <input type="number" min={1} value={editing.lesson_number}
                  onChange={e => setEditing({ ...editing, lesson_number: parseInt(e.target.value) || 1 })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
              </label>
            </div>
            <label className="text-xs text-gray-600 font-bold">Subtitle (shown to students)
              <input value={editing.subtitle} onChange={e => setEditing({ ...editing, subtitle: e.target.value })}
                placeholder="e.g. Learn the letter M and practice saying words and sounds!"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600 font-bold">Class
                <select value={editing.class_name} onChange={e => setEditing({ ...editing, class_name: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
                  {CLASSES.map(c => <option key={c} value={c}>{c || 'All classes'}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-600 font-bold flex items-center gap-2 mt-4">
                <input type="checkbox" checked={editing.active !== false}
                  onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                Active (visible to students)
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 mb-4">
            <label className="text-xs text-gray-600 font-bold flex items-center gap-2">
              <input type="checkbox" checked={editing.assignment_type === 'side_quest'}
                onChange={e => setEditing({ ...editing, assignment_type: e.target.checked ? 'side_quest' : 'class' })} />
              Side quest (assign to specific students instead of whole class)
            </label>
            {editing.assignment_type === 'side_quest' && (
              <div>
                <p className="text-xs font-bold text-gray-600 mb-1">Assigned students</p>
                <StudentPicker
                  selected={editing.assigned_students || []}
                  onChange={(as) => setEditing({ ...editing, assigned_students: as })}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <h2 className="font-black text-gray-700">Steps ({steps.length})</h2>
            <button onClick={() => setSteps([...steps, blankStep('letter_sounds')])}
              className="text-sm font-bold text-indigo-600 inline-flex items-center gap-1 hover:underline">
              <Plus className="w-4 h-4" /> Add step
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-6">
            {steps.map((s, i) => (
              <StepEditor key={i} step={s} index={i} total={steps.length}
                onChange={(next) => setSteps(steps.map((x, j) => j === i ? next : x))}
                onRemove={() => setSteps(steps.filter((_, j) => j !== i))}
                onMove={(dir) => moveStep(i, dir)}
              />
            ))}
            {steps.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No steps yet — add one above.</p>}
          </div>

          <button onClick={save}
            className="w-full py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center justify-center gap-2">
            <Save className="w-5 h-5" /> Save Lesson
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-800">📚 Lesson Planner</h1>
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-bold text-gray-700">
              <option value="">All activities</option>
              {MODE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportJson}
              className="px-3 py-2 bg-white text-gray-700 font-bold rounded-xl border hover:bg-gray-50 inline-flex items-center gap-1">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white text-gray-700 font-bold rounded-xl border hover:bg-gray-50 inline-flex items-center gap-1">
              <Upload className="w-4 h-4" /> Import
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
            <button onClick={() => setEditing(blankLesson())}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow hover:bg-indigo-700 inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> New Lesson
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            No lessons yet. Create your first lesson!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sorted.filter(l => !filterMode || (l.steps || []).some(s => s.mode === filterMode)).map(l => {
              const done = (l.steps || []).length;
              return (
                <div key={l.id} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-indigo-500">Lesson {l.lesson_number}</p>
                      <h3 className="text-lg font-black text-gray-800">{l.title}</h3>
                      <p className="text-xs text-gray-500">{l.subtitle}</p>
                    </div>
                    {!l.active && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">hidden</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{done} steps</span>
                    <span>•</span>
                    <span>{l.class_name || 'All classes'}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setEditing({ ...l, steps: (l.steps || []).map(s => ({ ...s })) })}
                      className="flex-1 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200">Edit</button>
                    <button onClick={() => duplicate(l)}
                      className="px-3 py-2 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100" title="Duplicate"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => remove(l.id)}
                      className="px-3 py-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}