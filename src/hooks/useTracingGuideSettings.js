import { useEffect, useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Default proportional values — same as GuideKeyVisual's built-in ratios.
// These scale across canvas sizes because they're ratios, not absolute pixels.
const DEFAULTS = {
  emojiHeightFactor: 0.96,
  emojiFeetFactor: 0.16,
  emojiSpacingRatio: 0.438,
  emojiXRatio: 0.126,
  fenceGapRatio: 0.340,
  fenceWidthRatio: 0.487,
  fenceOffsetRatio: 0,
};

const LS_KEY = 'tracingGuideSettings';

/**
 * Loads tracing guide settings from the TracingGuideSetting entity (single
 * shared record), cached in localStorage for instant display before the DB
 * fetch resolves. Returns { settings, save, loaded, update }.
 *
 * `update(partial)` merges into the current settings (live slider drag).
 * `save()` persists the current settings to the database.
 */
export function useTracingGuideSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      return { ...DEFAULTS, ...cached };
    } catch {
      return { ...DEFAULTS };
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const settingIdRef = useRef(null);

  // Load from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const recs = await base44.entities.TracingGuideSetting.list('-created_date');
        let rec = recs[0];
        if (!rec) {
          rec = await base44.entities.TracingGuideSetting.create({ settings: DEFAULTS });
        }
        settingIdRef.current = rec.id;
        const s = rec.settings || {};
        const merged = { ...DEFAULTS, ...s };
        setSettings(merged);
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
      } catch {
        // keep cached/local defaults
      }
      setLoaded(true);
    })();
  }, []);

  // Live update (slider drag) — updates state + localStorage, NOT the DB.
  const update = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Persist to DB
  const save = useCallback(async () => {
    if (!settingIdRef.current) return;
    setSaving(true);
    try {
      await base44.entities.TracingGuideSetting.update(settingIdRef.current, { settings });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      // silent
    }
    setSaving(false);
  }, [settings]);

  return { settings, update, save, loaded, saving, savedFlash };
}