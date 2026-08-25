import { useMouseSensor, useKeyboardSensor } from '@hello-pangea/dnd';
import { useFastTouchSensor } from '@/lib/lettersort/fastTouchSensor';

// Shared drag sensors for letter sort activities.
//
// The default @hello-pangea/dnd touch sensor requires a 120ms long press and
// cancels the drag on ANY finger movement during that window, which makes
// dragging feel sluggish and unresponsive on iPad and Promethean touch screens.
//
// We disable the default sensors and provide our own:
//   - useMouseSensor (built-in) — unchanged mouse behavior
//   - useFastTouchSensor (custom) — 50ms delay + 10px movement tolerance
//   - useKeyboardSensor (built-in) — unchanged keyboard accessibility
//
// DragDropContext must also set enableDefaultSensors={false} so the built-in
// touch sensor doesn't compete with our custom one.
export function useSortSensors() {
  return [useMouseSensor, useFastTouchSensor, useKeyboardSensor];
}