import { useState, useEffect } from 'react';
import { Save, Check, Link2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useClassNames } from '@/hooks/useClassNames';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = LOWER.map((c) => c.toUpperCase());

// Matches the entity default — shown until a saved record overrides it.
const DEFAULT_ENABLED = ['o', 'O', 'i', 'I', 'a', 'A', 'u', 'U', 'e', 'E'];

// Read selected classes from URL params: ?class=Schwarz (single) or
// ?classes=Felix,Valero,Gutierrez (multi). Lets the teacher bookmark/share a
// direct link to edit a specific class's progression without navigating.
function readUrlClasses() {
  const params = new URLSearchParams(window.location.search);
  const multi = params.get('classes');
  if (multi) return multi.split(',').map((s) => s.trim()).filter(Boolean);
  const single = params.get('class');
  if (single) return [single];
  return ['']; // '' = All classes (default)
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

// Teacher menu: toggle which letters are enabled for Letter Tracing free play,
// per class. Select one class to edit its own progression, or select several
// classes (e.g. the three Spanish classes) to change them all together.
// "All classes (default)" edits the global fallback every class uses unless it
// has its own override.
export default function TracingLetterToggle() {
  const { classList } = useClassNames();
  const [selectedClasses, setSelectedClasses] = useState(() => readUrlClasses());
  const [enabled, setEnabled] = useState(() => new Set(DEFAULT_ENABLED));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  // The scope key for a setting: '' = default, otherwise the class name.
  const isDefault = selectedClasses.length === 1 && selectedClasses[0] === '';

  // Load the enabled letters for the first selected class (or default).
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    const scopeKey = isDefault ? 'default' : selectedClasses[0];
    base44.entities.TracingSettings.filter({ scope: scopeKey })
      .then((records) => {
        if (cancelled) return;
        if (records && records.length && Array.isArray(records[0].enabled_letters)) {
          setEnabled(new Set(records[0].enabled_letters));
        } else if (!isDefault) {
          // No per-class override yet — fall back to the global default so the
          // teacher sees what's currently in effect before overriding.
          return base44.entities.TracingSettings.filter({ scope: 'default' })
            .then((def) => {
              if (cancelled) return;
              if (def && def.length && Array.isArray(def[0].enabled_letters)) {
                setEnabled(new Set(def[0].enabled_letters));
              } else {
                setEnabled(new Set(DEFAULT_ENABLED));
              }
              setLoaded(true);
            });
        } else {
          setEnabled(new Set(DEFAULT_ENABLED));
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
        // "All classes" is exclusive — selecting it clears the rest.
        next = [''];
      } else {
        const without = prev.filter((c) => c !== '');
        if (without.includes(cls)) {
          next = without.filter((c) => c !== cls);
        } else {
          next = [...without, cls];
        }
        if (next.length === 0) next = [''];
      }
      writeUrlClasses(next);
      return next;
    });
  };

  const toggle = (c) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const letters = Array.from(enabled);
      const targets = isDefault ? ['default'] : selectedClasses;
      for (const scopeKey of targets) {
        const existing = await base44.entities.TracingSettings.filter({ scope: scopeKey });
        if (existing.length) {
          await base44.entities.TracingSettings.update(existing[0].id, {
            enabled_letters: letters,
            class_name: scopeKey === 'default' ? '' : scopeKey,
          });
        } else {
          await base44.entities.TracingSettings.create({
            scope: scopeKey,
            class_name: scopeKey === 'default' ? '' : scopeKey,
            enabled_letters: letters,
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

  const renderGrid = (chars) => (
    <div className="grid grid-cols-9 sm:grid-cols-13 gap-1.5">
      {chars.map((c) => {
        const on = enabled.has(c);
        return (
          <button
            key={c}
            onClick={() => toggle(c)}
            className={`h-10 rounded-lg font-bold text-lg transition active:scale-95 border ${
              on
                ? 'bg-emerald-500 text-white border-emerald-600 shadow'
                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );

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
            Pick a class (or several) and toggle letters ON as they're learned. Each class can have its own progression.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={shareLink}
            title="Copy a direct link to edit this class's letters"
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

      <div className="space-y-3">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase mb-1.5">Lowercase</div>
          {renderGrid(LOWER)}
        </div>
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase mb-1.5">Uppercase</div>
          {renderGrid(UPPER)}
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {enabled.size} letters enabled · {loaded ? 'loaded' : 'loading…'}
      </div>
    </div>
  );
}