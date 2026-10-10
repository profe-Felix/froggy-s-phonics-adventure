import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { DEFAULT_FONT_RATIO, DEFAULT_SHIFT_RATIO } from '@/lib/handwritingLayout';

const DEFAULT_DOTS_SCALE = 1;
const DEFAULT_DOTS_SHIFT = 0;

// Shared letter-size + shift alignment, stored relative to the line gap so
// the letters stay locked to the lines at any row count / page size.
// Includes a separate scale + shift for the dots-only (waypoint) font.
export function useHandwritingCalibration() {
  const [rec, setRec] = useState(null);
  const [fontRatio, setFontRatio] = useState(DEFAULT_FONT_RATIO);
  const [shiftRatio, setShiftRatio] = useState(DEFAULT_SHIFT_RATIO);
  const [dotsScale, setDotsScale] = useState(DEFAULT_DOTS_SCALE);
  const [dotsShiftRatio, setDotsShiftRatio] = useState(DEFAULT_DOTS_SHIFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.HandwritingCalibration.filter({ key: 'default' }, { limit: 1 }).then((page) => {
      const r = page.items[0];
      if (!r) return;
      setRec(r);
      setFontRatio(r.font_ratio ?? DEFAULT_FONT_RATIO);
      setShiftRatio(r.shift_ratio ?? DEFAULT_SHIFT_RATIO);
      setDotsScale(r.dots_scale ?? DEFAULT_DOTS_SCALE);
      setDotsShiftRatio(r.dots_shift_ratio ?? DEFAULT_DOTS_SHIFT);
    });
  }, []);

  const savedFont = rec?.font_ratio ?? DEFAULT_FONT_RATIO;
  const savedShift = rec?.shift_ratio ?? DEFAULT_SHIFT_RATIO;
  const savedDotsScale = rec?.dots_scale ?? DEFAULT_DOTS_SCALE;
  const savedDotsShift = rec?.dots_shift_ratio ?? DEFAULT_DOTS_SHIFT;
  const dirty = fontRatio !== savedFont || shiftRatio !== savedShift || dotsScale !== savedDotsScale || dotsShiftRatio !== savedDotsShift;

  const save = async () => {
    setSaving(true);
    const data = { key: 'default', font_ratio: fontRatio, shift_ratio: shiftRatio, dots_scale: dotsScale, dots_shift_ratio: dotsShiftRatio };
    const r = rec
      ? await base44.entities.HandwritingCalibration.update(rec.id, data)
      : await base44.entities.HandwritingCalibration.create(data);
    setRec({ ...data, id: rec?.id ?? r.id });
    setSaving(false);
  };

  const revert = () => {
    setFontRatio(savedFont); setShiftRatio(savedShift);
    setDotsScale(savedDotsScale); setDotsShiftRatio(savedDotsShift);
  };

  return { fontRatio, shiftRatio, setFontRatio, setShiftRatio, dotsScale, setDotsScale, dotsShiftRatio, setDotsShiftRatio, save, revert, saving, dirty };
}