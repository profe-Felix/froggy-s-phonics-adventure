import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { DEFAULT_FONT_RATIO, DEFAULT_SHIFT_RATIO } from '@/lib/handwritingLayout';

// Shared letter-size + shift alignment, stored relative to the line gap so
// the letters stay locked to the lines at any row count / page size.
export function useHandwritingCalibration() {
  const [rec, setRec] = useState(null);
  const [fontRatio, setFontRatio] = useState(DEFAULT_FONT_RATIO);
  const [shiftRatio, setShiftRatio] = useState(DEFAULT_SHIFT_RATIO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.HandwritingCalibration.filter({ key: 'default' }, { limit: 1 }).then((page) => {
      const r = page.items[0];
      if (!r) return;
      setRec(r);
      setFontRatio(r.font_ratio ?? DEFAULT_FONT_RATIO);
      setShiftRatio(r.shift_ratio ?? DEFAULT_SHIFT_RATIO);
    });
  }, []);

  const savedFont = rec?.font_ratio ?? DEFAULT_FONT_RATIO;
  const savedShift = rec?.shift_ratio ?? DEFAULT_SHIFT_RATIO;
  const dirty = fontRatio !== savedFont || shiftRatio !== savedShift;

  const save = async () => {
    setSaving(true);
    const data = { key: 'default', font_ratio: fontRatio, shift_ratio: shiftRatio };
    const r = rec
      ? await base44.entities.HandwritingCalibration.update(rec.id, data)
      : await base44.entities.HandwritingCalibration.create(data);
    setRec({ ...data, id: rec?.id ?? r.id });
    setSaving(false);
  };

  const revert = () => { setFontRatio(savedFont); setShiftRatio(savedShift); };

  return { fontRatio, shiftRatio, setFontRatio, setShiftRatio, save, revert, saving, dirty };
}