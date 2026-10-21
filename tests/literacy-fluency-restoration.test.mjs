import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFluencyCells } from '../src/lib/literacy/fluencyDisplay.mjs';
import { generatePathwayDays, hasIntroducedConsonant } from '../src/lib/literacy/pathwayCurriculum.mjs';
import { recordingFile } from '../src/lib/literacy/recordingFile.mjs';

test('the familiar full chart shuffles reproducibly and mixes case', () => {
  const p = { rows: 5, cols: 8, content: ['a', 'e', 'i', 'o', 'u', 'm', 's', 'l'] };
  const a = buildFluencyCells(p, 12345);
  assert.equal(a.length, 40);
  assert.deepEqual(a, buildFluencyCells(p, 12345));
  assert.notDeepEqual(a, buildFluencyCells(p, 12346));
  assert.ok(a.some(v => v === v.toUpperCase()));
  assert.ok(a.some(v => v === v.toLowerCase()));
  assert.deepEqual(buildFluencyCells({ ...p, content: ['o'] }, 5), []);
  const hfw = buildFluencyCells({ rows: 5, cols: 6, content: ['el', 'la'] }, 12345);
  assert.equal(hfw.length, 30);
  assert.ok(hfw.includes('El') && hfw.includes('la'));
  assert.ok(hfw.some((v, i) => i && v.toLowerCase() === hfw[i - 1].toLowerCase()));
});
test('no book syllable practice exists until consonants are introduced; book words use Spanish Reading', () => {
  let before = 0, after = 0;
  for (let n = 1; n <= 36; n++) for (const day of generatePathwayDays(n)) {
    const consonants = hasIntroducedConsonant({ moduleNumber: day.module_number, lessonNumber: day.curriculum_lesson_number });
    const vocab = day.steps.filter(s => s.config.bookVocabulary);
    if (!consonants) { before++; assert.equal(vocab.length, 0); }
    else {
      after++;
      assert.equal(vocab.find(s => s.config.bookVocabulary === 'words').mode, 'spanish_reading');
      assert.equal(vocab.find(s => s.config.bookVocabulary === 'syllables').mode, 'fluency');
    }
  }
  assert.ok(before && after);
});
test('recording upload uses a named File with the correct audio extension', () => {
  for (const [mime, extension] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg', 'ogg']]) {
    const file = recordingFile(new Blob(['recorded audio'], { type: mime }), 'row');
    assert.equal(file.name, `row.${extension}`);
    assert.ok(file.size);
    assert.equal(file.type, mime.split(';')[0]);
  }
  assert.throws(() => recordingFile(new Blob([])), /empty/);
});
test('independent fluency shares the chart; failed recordings retain audio and offer retry', async () => {
  const source = await readFile(new URL('../src/components/lesson/modes/FluencyPracticeStep.jsx', import.meta.url), 'utf8');
  assert.match(source, /<FluencyGrid preset=\{preset\}/);
  assert.match(source, /recordingFile\(blob/);
  assert.match(source, /setPhase\('failed'\)/);
  assert.match(source, /Retry saving recording/);
  assert.ok(source.indexOf('await persist(rec)') < source.indexOf('setRecordings(newRecs)'));
  assert.match(source, /SpanishReadingSession\.create\(payload\)/);
  assert.doesNotMatch(source, /FluencyPracticeSession\.(create|update)/);
  assert.doesNotMatch(source, /row\.map\(\(w/);
});
test('book rescans do not replace the word list of an ongoing recording round', async () => {
  const source = await readFile(new URL('../src/components/lesson/modes/BookVocabularyReadingStep.jsx', import.meta.url), 'utf8');
  assert.match(source, /round\?\.key !== roundKey/);
  assert.match(source, /inlineItemsText=\{items\.join\('\\n'\)\}/);
  assert.doesNotMatch(source, /inlineItemsText=\{preset\.content/);
});
