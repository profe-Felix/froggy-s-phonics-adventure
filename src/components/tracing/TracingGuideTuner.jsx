import { useState } from 'react';
import { Save, Check, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * TracingGuideTuner — a compact slider bar for adjusting the emoji/fence
 * guide layout. All values are PROPORTIONAL (ratios), so they scale across
 * different canvas sizes (letter tracing, word tracing, name practice) —
 * the same settings work everywhere.
 *
 * A "Fine" checkbox toggles 10× finer increments for precision adjustment.
 *
 * Props: the `settings`, `update`, `save`, `saving`, `savedFlash` from
 * the useTracingGuideSettings hook.
 */
export default function TracingGuideTuner({ settings, update, save, saving, savedFlash }) {
  const [fine, setFine] = useState(false);
  const step = fine ? 0.001 : 0.01;
  const s = settings;
  const slider = (label, key, min, max, fmt) => (
    <label key={key} className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[key]}
        onChange={(e) => update({ [key]: parseFloat(e.target.value) })}
        className="w-20"
      />
      <span className="w-14 tabular-nums">{fmt(s[key])}</span>
    </label>
  );

  return (
    <div className="flex items-center gap-3 flex-wrap border-t bg-amber-50 px-4 py-1.5 text-xs">
      <span className="flex items-center gap-1 font-bold text-amber-800">
        <Sliders className="w-3.5 h-3.5" /> Guide:
      </span>
      {slider('Height', 'emojiHeightFactor', 0.5, 2.0, (v) => v.toFixed(3))}
      {slider('Feet', 'emojiFeetFactor', 0, 0.5, (v) => v.toFixed(3))}
      {slider('Spacing', 'emojiSpacingRatio', 0.2, 0.8, (v) => v.toFixed(3))}
      {slider('Emoji X', 'emojiXRatio', 0, 0.3, (v) => v.toFixed(3))}
      {slider('Fence Gap', 'fenceGapRatio', 0.1, 0.6, (v) => v.toFixed(3))}
      {slider('Fence Width', 'fenceWidthRatio', 0.2, 0.8, (v) => v.toFixed(3))}
      {slider('Fence Offset', 'fenceOffsetRatio', 0, 0.5, (v) => v.toFixed(3))}
      <label className="flex items-center gap-1 text-amber-700 cursor-pointer select-none font-medium">
        <input type="checkbox" checked={fine} onChange={(e) => setFine(e.target.checked)} className="accent-amber-600 w-3 h-3" />
        Fine {fine ? '(0.001)' : '(0.01)'}
      </label>
      <span className="text-amber-700">Heads → sky/fence, feet on grass. Scales across all canvases.</span>
      <Button
        size="sm"
        onClick={save}
        disabled={saving}
        className={savedFlash ? 'bg-green-500 hover:bg-green-500' : 'bg-amber-600 hover:bg-amber-700'}
      >
        {savedFlash ? <><Check className="w-3.5 h-3.5 mr-1" /> Saved!</> : <><Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Saving…' : 'Save'}</>}
      </Button>
    </div>
  );
}