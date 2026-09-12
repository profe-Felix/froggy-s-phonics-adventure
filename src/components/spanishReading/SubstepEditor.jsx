import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

const SUBSTEP_TYPES = [
  { value: 'parent_notes', label: '📋 Parent Notes', desc: 'What to say + play sounds' },
  { value: 'video', label: '🎥 Video Model', desc: 'Show how to use the slider' },
  { value: 'practice', label: '✏️ Student Practice', desc: 'Slide to read' },
];

function SubstepCard({ substep, index, total, onChange, onRemove, onMove }) {
  const update = (patch) => onChange({ ...substep, ...patch });

  const typeLabel = SUBSTEP_TYPES.find((t) => t.value === substep.type)?.label || substep.type;

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-xs shrink-0">
          {index + 1}
        </span>
        <span className="font-bold text-gray-700 text-xs flex-1 truncate">{typeLabel}</span>
        <button onClick={() => onMove(-1)} disabled={index === 0} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRemove} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-red-100 flex items-center justify-center">
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-gray-500 font-bold">Type
          <select value={substep.type} onChange={(e) => update({ type: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5 bg-white">
            {SUBSTEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-gray-500 font-bold">Title (speech bubble)
          <input value={substep.title || ''} onChange={(e) => update({ title: e.target.value })}
            placeholder="Listen carefully!"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5" />
        </label>
      </div>

      <label className="text-[10px] text-gray-500 font-bold">Word
        <input value={substep.word || ''} onChange={(e) => update({ word: e.target.value })}
          placeholder="am"
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5" />
      </label>

      {substep.type === 'parent_notes' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-gray-500 font-bold">"What to say" prompts</span>
          {(substep.prompts || []).map((p, pi) => (
            <div key={pi} className="flex gap-1.5 items-start">
              <input
                value={p.question || ''}
                onChange={(e) => {
                  const prompts = [...(substep.prompts || [])];
                  prompts[pi] = { ...p, question: e.target.value };
                  update({ prompts });
                }}
                placeholder="What is the first sound?"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1"
              />
              <input
                value={p.answer || ''}
                onChange={(e) => {
                  const prompts = [...(substep.prompts || [])];
                  prompts[pi] = { ...p, answer: e.target.value };
                  update({ prompts });
                }}
                placeholder="aaa"
                className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1"
              />
              <input
                value={p.audioLetter || ''}
                onChange={(e) => {
                  const prompts = [...(substep.prompts || [])];
                  prompts[pi] = { ...p, audioLetter: e.target.value };
                  update({ prompts });
                }}
                placeholder="a"
                className="w-12 text-xs border border-gray-200 rounded-lg px-2 py-1"
                title="Letter to play sound for"
              />
              <button
                onClick={() => {
                  const prompts = (substep.prompts || []).filter((_, x) => x !== pi);
                  update({ prompts });
                }}
                className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-red-100 flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-3 h-3 text-red-500" />
              </button>
            </div>
          ))}
          <button
            onClick={() => update({ prompts: [...(substep.prompts || []), { question: '', answer: '', audioLetter: '' }] })}
            className="text-[10px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5 w-fit"
          >
            <Plus className="w-3 h-3" /> Add prompt
          </button>
        </div>
      )}

      {substep.type === 'video' && (
        <label className="text-[10px] text-gray-500 font-bold">Video URL
          <input value={substep.videoUrl || ''} onChange={(e) => update({ videoUrl: e.target.value })}
            placeholder="https://..."
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5" />
        </label>
      )}

      {substep.type === 'practice' && (
        <label className="text-[10px] text-gray-500 font-bold">Audio ID (for sound playback)
          <input value={substep.itemId || ''} onChange={(e) => update({ itemId: e.target.value })}
            placeholder="am"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5" />
        </label>
      )}

      <label className="text-[10px] text-gray-500 font-bold">Hint (shown in Tips)
        <input value={substep.hint || ''} onChange={(e) => update({ hint: e.target.value })}
          placeholder="Make sure your child doesn't pause between sounds"
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5" />
      </label>
    </div>
  );
}

export default function SubstepEditor({ substeps = [], onChange }) {
  const [show, setShow] = useState(false);

  const update = (index, patch) => {
    const next = [...substeps];
    next[index] = patch;
    onChange(next);
  };

  const add = (type) => {
    const base = { type, title: '', word: '', hint: '' };
    if (type === 'parent_notes') base.prompts = [{ question: '', answer: '', audioLetter: '' }];
    if (type === 'video') base.videoUrl = '';
    if (type === 'practice') base.itemId = '';
    onChange([...substeps, base]);
  };

  const remove = (index) => {
    onChange(substeps.filter((_, i) => i !== index));
  };

  const move = (index, dir) => {
    const next = [...substeps];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2 flex flex-col gap-2">
      <button
        onClick={() => setShow((s) => !s)}
        className="text-xs font-bold text-indigo-700 flex items-center justify-between w-full"
      >
        <span>👨‍👩‍👧 Parent-Led Substeps ({substeps.length})</span>
        <span className="text-indigo-400">{show ? '▼' : '▶'}</span>
      </button>

      {show && (
        <>
          {substeps.length > 0 ? (
            <div className="flex flex-col gap-2">
              {substeps.map((s, i) => (
                <SubstepCard
                  key={i}
                  substep={s}
                  index={i}
                  total={substeps.length}
                  onChange={(patch) => update(i, patch)}
                  onRemove={() => remove(i)}
                  onMove={(dir) => move(i, dir)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-500 text-center py-2">
              No substeps yet. Add steps below to create a parent-led lesson flow.
            </p>
          )}

          <div className="flex gap-1.5 flex-wrap">
            {SUBSTEP_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => add(t.value)}
                className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {t.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            When substeps are added, this step uses the parent-led flow instead of the normal reading list.
          </p>
        </>
      )}
    </div>
  );
}