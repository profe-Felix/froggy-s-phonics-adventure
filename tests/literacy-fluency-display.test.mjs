import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mixedFluencyCase, onlyO, fluencyArrow } from '../src/lib/literacy/fluencyDisplay.mjs';

test('mixed case is deterministic, includes uppercase/lowercase letters and initial-cap words', () => {
  assert.deepEqual(['T', 't', 'Á', 'á', 'TOMATE', 'tomate', 'NIÑO', 'niño'].map(mixedFluencyCase),
    ['t', 'T', 'á', 'Á', 'tomate', 'Tomate', 'niño', 'Niño']);
  const source = Array.from({ length: 30 }, () => 'las');
  const teacher = source.map(mixedFluencyCase), student = source.map(mixedFluencyCase);
  assert.deepEqual(teacher, student);
  assert.equal(teacher.filter(word => word === 'Las').length, 15);
});

test('only-o guard is case insensitive and never rejects a real multi-letter set', () => {
  assert.equal(onlyO(['o', 'O', 'o']), true);
  assert.equal(onlyO(['o', 'a']), false);
  assert.equal(onlyO(['oso']), false);
  assert.equal(onlyO([]), false);
});

test('keyboard arrows advance and clamp without hijacking editing or modifier keys', () => {
  assert.equal(fluencyArrow({ key: 'ArrowRight' }, 4, 30), 5);
  assert.equal(fluencyArrow({ key: 'ArrowLeft' }, 4, 30), 3);
  assert.equal(fluencyArrow({ key: 'ArrowLeft' }, 0, 30), 0);
  assert.equal(fluencyArrow({ key: 'ArrowRight' }, 29, 30), 29);
  assert.equal(fluencyArrow({ key: 'ArrowRight' }, 0, 0), null);
  assert.equal(fluencyArrow({ key: 'ArrowRight', ctrlKey: true }, 4, 30), null);
  assert.equal(fluencyArrow({ key: 'ArrowRight', target: { isContentEditable: true } }, 4, 30), null);
  assert.equal(fluencyArrow({ key: 'ArrowRight', target: { closest: () => ({}) } }, 4, 30), null);
});

test('all fluency grids share keyboard/case logic while student mirrors remain read-only', async () => {
  const grid = await readFile(new URL('../src/components/workstations/FluencyGrid.jsx', import.meta.url), 'utf8');
  assert.match(grid, /map\(mixedFluencyCase\)/);
  assert.match(grid, /if \(!interactive\) return/);
  assert.match(grid, /window.addEventListener\('keydown', onKey\)/);
  const builder = await readFile(new URL('../src/components/workstations/CurriculumFluencyBuilder.jsx', import.meta.url), 'utf8');
  assert.match(builder, /!onlyO\(preset.content\)/);
});
