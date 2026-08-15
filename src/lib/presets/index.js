// Central registry of in-app preset groups, one per lesson activity that
// supports presets. The Lesson Planner uses these to render per-step preset
// pickers; the runtime step components look presets up here by id.
import fluencyPresets from './fluencyPresets';
import letterSortPresets from './letterSortPresets';
import powerfulWordPresets from './powerfulWordPresetsLocal';
import wordBuilderPresets from './wordBuilderPresets';
import { PRESETS as ACTIVITY_PRESETS } from '@/lib/activities/presets';

function list(obj, labelFn) {
  return Object.keys(obj).map((id) => ({ id, label: labelFn(obj[id], id) }));
}

export const PRESET_GROUPS = {
  word_builder: list(wordBuilderPresets, (p, id) => p.label || id),
  letter_sort: list(letterSortPresets, (_p, id) => id),
  powerful_word: list(powerfulWordPresets, (_p, id) => id),
  fluency: list(fluencyPresets, (p, id) => p.title || id),
  activities: list(ACTIVITY_PRESETS, (p, id) => p.label || id),
};

export function getPresetList(mode) {
  return PRESET_GROUPS[mode] || [];
}

export function getWordBuilderPreset(id) {
  const p = wordBuilderPresets[id];
  return p ? { ...p, _id: id } : null;
}

export function getPowerfulWordPreset(id) {
  return powerfulWordPresets[id] || null;
}

export function getLetterSortPreset(id) {
  return letterSortPresets[id] || null;
}

export function getFluencyPreset(id) {
  return fluencyPresets[id] || null;
}