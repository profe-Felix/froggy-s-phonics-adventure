import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialSound, startsWithSound, familyAtPosition, buildListeningRound } from '../src/lib/lettersort/listeningSort.mjs';
import { summarizeListeningAttempts } from '../src/lib/lettersort/listeningScore.mjs';

const picture = word => ({ rawCore: word, url: `https://example.com/${word}.jpg` });
const bank = ['tomate','tren','tigre','taco','taza','dado','gato','gusano','guitarra','gorro','girasol',
  'ratón','rosa','rana','reloj','mesa','pato','zapato','topo','meta','tina','nota','metí','moto','tuna','tela','tarta'].map(picture);
test('alliteration is initial SOUND: tomate and tren match t; pata does not', () => {
  for (const word of ['tomate', 'tren', 'TÉ', 'tigre']) assert.ok(startsWithSound(word, '/t/'), word);
  for (const word of ['pata', 'atar', 'dado']) assert.equal(startsWithSound(word, 't'), false);
});
test('hard/soft g, silent h, Spanish digraphs and accents are auditory rather than first-letter guesses', () => {
  assert.ok(startsWithSound('guitarra', 'g'));
  assert.equal(startsWithSound('girasol', 'g'), false);
  assert.ok(startsWithSound('girasol', 'j'));
  assert.ok(startsWithSound('queso', 'c'));
  assert.ok(startsWithSound('vaca', 'b'));
  assert.ok(startsWithSound('hilo', 'i'));
  assert.equal(initialSound('chico'), 'ch');
  assert.equal(initialSound('llave'), 'y');
  assert.equal(initialSound('nin..o'), 'n');
  assert.equal(startsWithSound('ñu', 'n'), false);
});
test('syllable family beginning and final differ from both initial phoneme and arbitrary substring', () => {
  assert.ok(familyAtPosition('tigre', 't', 'beginning'));
  assert.ok(familyAtPosition('zapato', 't', 'end'));
  assert.ok(familyAtPosition('metí', 't', 'end'));
  assert.equal(familyAtPosition('tren', 't', 'beginning'), false);
  assert.equal(familyAtPosition('patatazo', 't', 'end'), false);
  assert.ok(familyAtPosition('tarta', 't', 'beginning') && familyAtPosition('tarta', 't', 'end'));
});
test('each random alliteration problem has exactly four unique pictures, three yes and one no', () => {
  for (let index = 0; index < 3; index++) for (let n = 0; n < 40; n++) {
    const round = buildListeningRound({ mode: 'alliteration', sounds: ['t','g','r'], roundIndex: index }, [...bank, picture('taco')]);
    assert.equal(round.error, undefined);
    assert.equal(round.cards.length, 4);
    assert.equal(new Set(round.cards.map(c => c.coreRaw)).size, 4);
    assert.equal(round.rows[0].accepts.length, 3);
    assert.equal(round.cards.filter(c => startsWithSound(c.coreRaw, round.target)).length, 3);
    assert.equal(round.problemIndex, index);
    assert.equal(round.totalProblems, 3);
  }
});
test('too-small pools and missing explicit pictures fail explicitly without substitutions', () => {
  assert.ok(buildListeningRound({ mode: 'alliteration', sounds:['t'] }, bank.slice(0, 2)).error);
  assert.ok(buildListeningRound({ mode: 'alliteration', sounds:['t'], words:['taco','missing'] }, bank).error);
  assert.ok(buildListeningRound({ mode: 'alliteration', sounds:['h'] }, bank).error);
});
test('manual matching rows have one and only one sound match plus distractor beside each picture', () => {
  const round = buildListeningRound({ mode:'soundmatch', rows:'tomate~tren,dado;gato~gusano,mesa' }, bank);
  assert.equal(round.error, undefined);
  assert.equal(round.rows.length, 2);
  for (const row of round.rows) {
    assert.equal(row.accepts.length, 1);
    assert.equal(round.cards.filter(c => c.rowId === row.id).length, 2);
  }
  assert.ok(buildListeningRound({mode:'soundmatch', rows:'tomate~tren,taco'}, bank).error);
});
test('automatic sound rows supply a model and two distinct choices', () => {
  const round = buildListeningRound({mode:'soundmatch', sounds:['t','g','r']}, bank);
  assert.equal(round.error, undefined);
  assert.equal(round.rows.length, 3);
  assert.equal(new Set([...round.rows.map(r => r.prompt), ...round.cards.map(c => c.coreRaw)]).size, 9);
});
test('position rows use picture-word headers, preserve a blank first override and accept dual-position cards once', () => {
  const round = buildListeningRound({
    mode:'syllableposition', consonant:'t', headers:['tigre','zapato'], headerimages:['', 'https://example.com/custom.jpg'],
    words:['topo','meta','tina','nota','metí','moto','tuna','tela','tarta'],
  }, bank);
  assert.equal(round.error, undefined);
  assert.ok(round.rows[0].promptImg.endsWith('/tigre.jpg'));
  assert.equal(round.rows[1].promptImg, 'https://example.com/custom.jpg');
  const tarta = round.cards.find(c => c.coreRaw === 'tarta');
  assert.ok(round.rows.every(row => row.accepts.includes(tarta.id)));
  assert.equal(round.cards.length, 9);
});
test('automatic position generation always covers both row categories', () => {
  for (let n = 0; n < 50; n++) {
    const round = buildListeningRound({mode:'syllableposition', consonant:'t', per:2}, bank);
    assert.equal(round.error, undefined);
    assert.ok(round.rows.every(row => row.accepts.length));
  }
});
test('wrong, repeated guesses, corrected answers and problem boundaries produce honest first-try counts', () => {
  const attempt = (word, correct, problemIndex = 0) => ({word, correct, problemIndex});
  assert.deepEqual(summarizeListeningAttempts([
    attempt('taco', false), attempt('taco', false), attempt('taco', true),
    attempt('tren', true), attempt('tren', true, 1),
  ]), {correct:3, wrong:2, mistakes:2, firstTryCorrect:2, total:3});
});
test('integration preserves identity, batches storage, carries attempts through lesson and never requires duplicate ambiguous cards', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('pages/workstations/LetterSort.jsx'), /for \(const key of \['class', 'number'\]\)/);
  assert.match(read('components/lettersort/ListeningSortView.jsx'), /kind === 'syllableposition' \? round.cards.length/);
  assert.match(read('components/lesson/modes/LetterSortStep.jsx'), /onAttempt=\{tracking.onAttempt\}/);
  assert.match(read('hooks/useListeningSortResults.js'), /localStorage.setItem/);
  assert.match(read('hooks/useListeningSortResults.js'), /setTimeout/);
  assert.match(read('components/lettersort/LetterSortActivity.jsx'), /summarizeListeningAttempts\(agg.attempts\)/);
});
