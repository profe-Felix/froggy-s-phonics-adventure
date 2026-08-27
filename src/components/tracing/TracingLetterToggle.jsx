import { useState, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = LOWER.map((c) => c.toUpperCase());

// Matches the entity default — shown until a saved record overrides it.
const DEFAULT_ENABLED = ['o', 'O', 'i', 'I', 'a', 'A', 'u', 'U', 'e', 'E'];

// Teacher menu: toggle which letters are enabled for Letter Tracing free play.
// Only enabled letters appear in the student's Letter Tracing game; lesson
// steps pass their own targets and are not affected by this setting.
export default function TracingLetterToggle() {
  const [enabled, setEnabled] = useState(
    () => new Set(DEFAULT_ENABLED)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    base44.entities.TracingSettings.filter({ scope: 'default' })
      .then((records) => {
        if (cancelled) return;

        if (records && records.length && Array.isArray(records[0].enabled_letters)) {
          setEnabled(new Set(records[0].enabled_letters));
        }

        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (c) => {
    setEnabled((prev) => {
      const next = new Set(prev);

      if (next.has(c)) {
        next.delete(c);
      } else {
        next.add(c);
      }

      return next;
    });
  };

  const save = async () => {
    setSaving(true);

    try {
      const letters = Array.from(enabled);

      const existing = await base44.entities.TracingSettings.filter({
        scope: 'default',
      });

      if (existing.length) {
        await base44.entities.TracingSettings.update(existing[0].id, {
          enabled_letters: letters,
        });
      } else {
        await base44.entities.TracingSettings.create({
          scope: 'default',
          enabled_letters: letters,
        });
      }

      setSaved(true);

      setTimeout(() => setSaved(false), 1800);
    } catch {
      /* ignore — teacher can retry */
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Letter Tracing Progression
          </h2>

          <p className="text-xs text-slate-500 mt-0.5">
            Toggle letters ON as they're learned. Only enabled letters show up
            in the student's Letter Tracing game.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}

          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase mb-1.5">
            Lowercase
          </div>

          {renderGrid(LOWER)}
        </div>

        <div>
          <div className="text-xs font-bold text-slate-400 uppercase mb-1.5">
            Uppercase
          </div>

          {renderGrid(UPPER)}
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {enabled.size} letters enabled ·{' '}
        {loaded ? 'loaded' : 'loading…'}
      </div>
    </div>
  );
}