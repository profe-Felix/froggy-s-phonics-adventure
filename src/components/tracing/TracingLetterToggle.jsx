import { useState, useEffect } from 'react';
import { Save, Check, Link2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useClassNames } from '@/hooks/useClassNames';
import { LETTER_FORMATION_GROUPS } from '@/lib/literacy/letterFormationGroups';

// Teacher menu: toggle which letter FORMATION GROUPS are enabled for Letter
// Tracing group practice (the game mode), per class. Select one class to edit
// its own progression, or several classes to change them all together.
// "All classes (default)" edits the global fallback every class uses unless it
// has its own override.
//
// Letters within a group are always practiced together in pedagogical order;
// the teacher only flips whole groups on/off. A letter's sound is on/off
// automatically based on the class's active lesson / grapheme progression, so
// there is no per-letter sound toggle here.

function readUrlClasses() {
  const params = new URLSearchParams(window.location.search);
  const multi = params.get('classes');
  if (multi) return multi.split(',').map((s) => s.trim()).filter(Boolean);
  const single = params.get('class');
  if (single) return [single];
  return [''];
}

function writeUrlClasses(classes) {
  const params = new URLSearchParams(window.location.search);
  if (classes.length === 1 && classes[0] === '') {
    params.delete('class');
    params.delete('classes');
  } else if (classes.length === 1) {
    params.set('class', classes[0]);
    params.delete('classes');
  } else {
    params.set('classes', classes.join(','));
    params.delete('class');
  }
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

export default function TracingLetterToggle() {
  const { classList } = useClassNames();
  const [selectedClasses, setSelectedClasses] = useState(() => readUrlClasses());
  const [enabled, setEnabled] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isDefault = selectedClasses.length === 1 && selectedClasses[0] === '';

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const scopeKey = isDefault ? 'default' : selectedClasses[0];
    base44.entities.TracingSettings.filter({ scope: scopeKey })
      .then((records) => {
        if (cancelled) return;
        if (records && records.length && Array.isArray(records[0].enabled_groups)) {
          setEnabled(new Set(records[0].enabled_groups));
        } else if (!isDefault) {
          return base44.entities.TracingSettings.filter({ scope: 'default' })
            .then((def) => {
              if (cancelled) return;
              setEnabled(new Set((def?.[0]?.enabled_groups) || []));
              setLoaded(true);
            });
        } else {
          setEnabled(new Set());
        }
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [selectedClasses.join(','), isDefault]);

  const toggleClass = (cls) => {
    setSelectedClasses((prev) => {
      let next;
      if (cls === '') {
        next = [''];
      } else {
        const without = prev.filter((c) => c !== '');
        if (without.includes(cls)) next = without.filter((c) => c !== cls);
        else next = [...without, cls];
        if (next.length === 0) next = [''];
      }
      writeUrlClasses(next);
      return next;
    });
  };

  const toggleGroup = (key) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const groups = Array.from(enabled);
      const targets = isDefault ? ['default'] : selectedClasses;
      for (const scopeKey of targets) {
        const existing = await base44.entities.TracingSettings.filter({ scope: scopeKey });
        if (existing.length) {
          await base44.entities.TracingSettings.update(existing[0].id, {
            enabled_groups: groups,
            class_name: scopeKey === 'default' ? '' : scopeKey,
          });
        } else {
          await base44.entities.TracingSettings.create({
            scope: scopeKey,
            class_name: scopeKey === 'default' ? '' : scopeKey,
            enabled_groups: groups,
          });
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      /* ignore — teacher can retry */
    } finally {
      setSaving(false);
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${selectedClasses[0] === '' ? '' : selectedClasses.length === 1 ? `class=${selectedClasses[0]}` : `classes=${selectedClasses.join(',')}`}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const selectionLabel = isDefault
    ? 'All classes (default)'
    : selectedClasses.length === 1
      ? selectedClasses[0]
      : `${selectedClasses.length} classes: ${selectedClasses.join(', ')}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Letter Tracing Progression
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Toggle whole letter-formation groups on/off. Letters in a group are practiced together in order. Sounds follow the lesson progression automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={shareLink}
            title="Copy a direct link to edit this class's groups"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
          >
            {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Class multi-select */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => toggleClass('')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
            isDefault
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          All classes (default)
        </button>
        {classList.map((cls) => {
          const on = selectedClasses.includes(cls);
          return (
            <button
              key={cls}
              onClick={() => toggleClass(cls)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                on
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cls}
            </button>
          );
        })}
      </div>

      <div className="text-xs font-bold text-slate-500 mb-2">
        Editing: <span className="text-indigo-700">{selectionLabel}</span>
        {!isDefault && <span className="text-slate-400 ml-1">— saves to each selected class's own progression</span>}
      </div>

      {/* Formation-group toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LETTER_FORMATION_GROUPS.map((g) => {
          const on = enabled.has(g.key);
          return (
            <button
              key={g.key}
              onClick={() => toggleGroup(g.key)}
              className={`text-left rounded-xl border-2 p-3 transition active:scale-[0.99] ${
                on
                  ? 'bg-emerald-50 border-emerald-400'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`font-bold text-sm ${on ? 'text-emerald-800' : 'text-slate-500'}`}>{g.label}</span>
                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${on ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-400 border-slate-200'}`}>
                  {on ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {g.letters.map((l) => (
                  <span key={l} className={`w-7 h-7 rounded-md font-bold flex items-center justify-center text-base ${on ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white text-slate-400 border border-slate-200'}`}>
                    {l}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-slate-400">
        {enabled.size} group(s) enabled · {loaded ? 'loaded' : 'loading…'}
      </div>
    </div>
  );
}