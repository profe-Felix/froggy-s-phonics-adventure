import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('book and fluency lesson steps share a compact exit/status row', async () => {
  const stepper = await source('components/lesson/LessonStepper.jsx');
  assert.match(stepper, /\['book_reading', 'fluency'\]\.includes\(step\?\.mode\)/);
  assert.match(stepper, /compactHeader \? 'h-10 px-2 gap-2' : 'px-4 py-3'/);
  assert.match(stepper, /ref=\{setBookGoalContainer\}/);
  assert.match(stepper, /goalContainer=\{compactHeader \? bookGoalContainer : null\}/);
  assert.match(stepper, /disabled=\{leaving\} onClick=\{\(\) => \{ void leaveActivity\(\); \}\}/);
});

test('book completion and recording goals remain visible outside the clipped reader', async () => {
  const router = await source('components/lesson/LessonModeRouter.jsx');
  assert.match(router, /createPortal\(goalBadge, goalContainer\)/);
  assert.match(router, /goalContainer = null/);
  assert.match(router, /title=\{goalText\}/);
  assert.match(router, /requiresBookRecordings\s*\? bookRecordingGoalText/);
  assert.match(router, /absolute top-4 right-4/);
});

test('auto DF readers use the native book header without repeating the book title', async () => {
  const auto = await source('components/lesson/modes/AutoDfReadingStep.jsx');
  assert.doesNotMatch(auto, /current\.title/);
  assert.match(auto, /headerExtra=\{bookControls\}/);
  assert.match(auto, /books\.length > 1/);
  assert.match(auto, /Siguiente libro/);
  assert.match(auto, /Terminé/);
  assert.match(auto, /onRecordingSaved=\{onRecordingSaved\}/);
  const reader = await source('components/book/StudentBookReader.jsx');
  assert.match(reader, /\{headerExtra\}/);
  assert.match(reader, /\{book\.title\}/);
});
