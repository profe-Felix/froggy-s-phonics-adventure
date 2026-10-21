import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fluencyFitLayout, fluencyFitFont, fluencyContextLabel } from '../src/lib/literacy/fluencyFit.mjs';
const source = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the unchanged logical 5-row chart fits phones, landscape phones and tablets', () => {
  for (const [width, height] of [[312, 420], [382, 580], [720, 210], [1010, 570], [1340, 780]]) {
    for (const cols of [6, 8]) {
      const layout = fluencyFitLayout({ width, height, rows: 5, cols });
      assert.ok(layout.rowHeight * 5 + 32 + layout.gap * 5 <= height + 0.001);
      assert.ok(layout.cellWidth * cols + layout.playWidth + layout.gap * cols <= width + 0.001);
      for (const [text, em] of [['I', 0.5], ['la', 1.2], ['Desanimado', 6.2]]) {
        const font = fluencyFitFont(layout, text, em);
        assert.ok(font * em <= layout.cellWidth - 8 + 0.001);
        assert.ok(font <= 32);
        assert.ok(font < layout.rowHeight);
      }
    }
  }
});
test('curriculum context fits next to the lesson title without internal content labels', () => {
  assert.equal(fluencyContextLabel('M1.L1 · sight_words_all'), 'M1.L1');
  assert.equal(fluencyContextLabel('M3.L7–L8 · syllables'), 'M3.L7–L8');
  assert.equal(fluencyContextLabel('Letter review'), 'Letter review');
});
test('record and Done share one footer; busy and failed recordings still block completion', async () => {
  const step = await source('components/lesson/modes/FluencyPracticeStep.jsx');
  assert.match(step, /<StepDoneBar inline onDone=\{onComplete\} disabled=\{\['recording', 'saving', 'starting', 'failed'\]\.includes\(phase\)\}/);
  assert.match(step, /<FluencyGrid preset=\{preset\} fit/);
  assert.doesNotMatch(step, /overflow-auto/);
  assert.match(step, /createPortal/);
  assert.match(step, /fluency_row_data: JSON\.stringify\(recording\)/);
  assert.match(step, /Your audio is still here/);
});
test('fit measures the real font, resizes without changing cells, and is enabled in live tables', async () => {
  const grid = await source('components/workstations/FluencyGrid.jsx');
  assert.match(grid, /ResizeObserver/);
  assert.match(grid, /document\.fonts\?\.ready/);
  assert.match(grid, /context\.measureText\(text\)/);
  assert.match(grid, /repeat\(\$\{preset\.cols\}, minmax\(0, 1fr\)\)/);
  assert.match(grid, /aspectRatio: fit \? undefined/);
  const live = await source('components/live/FluencyLessonTable.jsx');
  assert.equal((live.match(/<FluencyGrid fit/g) || []).length, 2);
});
test('the teacher list link opens the existing vocabulary editor without a new login', async () => {
  const library = await source('components/lesson/BookVocabularyLibrary.jsx');
  assert.match(library, /id="book-vocabulary-bank"/);
  assert.match(library, /panel\.current\.open = true/);
  assert.match(library, /Edit lists/);
  assert.match(library, /<VocabularyReviewPanel/);
});
