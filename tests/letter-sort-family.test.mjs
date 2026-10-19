import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandConsonantFamily, containsConsonantFamily, buildFamilyAnyRound } from '../src/lib/lettersort/familyAny.mjs';

const picture = word => ({ rawCore: word, core: word, url: `https://example.test/${word}.jpg`, path: `${word}.jpg` });
const bank = ['taco', 'pata', 'talco', 'atar', 'tren', 'mesa', 'luna', 'sopa'].map(picture);
const config = { consonant: 't', per: 4, words: [] };
const source = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

test('choosing a consonant automatically generates all five combinations', () => {
  assert.deepEqual(expandConsonantFamily('/T/'), ['ta', 'te', 'ti', 'to', 'tu']);
  assert.deepEqual(expandConsonantFamily('m'), ['ma', 'me', 'mi', 'mo', 'mu']);
  assert.deepEqual(expandConsonantFamily('ch'), ['cha', 'che', 'chi', 'cho', 'chu']);
});
test('initial, medial, closed and partial syllables match the requested family', () => {
  for (const word of ['taco', 'pata', 'talco', 'atar', 'tractor', 'tarde', 'tortuga', 'alto']) {
    assert.equal(containsConsonantFamily(word, 't'), true, word);
  }
});
test('an isolated consonant or a blend is not sufficient', () => {
  for (const word of ['tren', 'tres', 'trigo', 'atlas', 'mesa', 'sopa']) {
    assert.equal(containsConsonantFamily(word, 't'), false, word);
  }
});
test('all vowels, accents, marker filenames and capital letters work', () => {
  for (const word of ['taza', 'TÉ', 'tío', 'tomate', 'TÚNEL', 'ti..o']) {
    assert.equal(containsConsonantFamily(word, 't'), true, word);
  }
  assert.equal(containsConsonantFamily('niño', 'ñ'), true);
  assert.equal(containsConsonantFamily('NIN..O', 'ñ'), true);
  assert.equal(containsConsonantFamily('ñata', 'n'), false);
});
test('invalid targets do not silently accept a different family', () => {
  for (const value of ['', 'ta', 't,m', 'tren', '123']) {
    assert.deepEqual(expandConsonantFamily(value), []);
    assert.equal(containsConsonantFamily('taco', value), false);
    assert.ok(buildFamilyAnyRound({ ...config, consonant: value }, bank).error);
  }
});
test('automatic bank generates balanced disjoint yes/no groups with pictures only', () => {
  const round = buildFamilyAnyRound(config, bank);
  assert.equal(round.cards.length, 8);
  assert.equal(round.columns.length, 2);
  assert.equal(round.columns[0].positive, true);
  assert.equal(round.columns[1].positive, false);
  assert.deepEqual(round.columns[0].targetSyllables, ['ta', 'te', 'ti', 'to', 'tu']);
  assert.equal(round.cards.filter(c => round.columns[0].match(c.coreRaw)).length, 4);
  assert.equal(new Set(round.cards.map(c => c.id)).size, 8);
  for (const card of round.cards) {
    assert.ok(card.imgUrl);
    assert.equal(card.word, '');
    assert.notEqual(round.columns[0].match(card.coreRaw), round.columns[1].match(card.coreRaw));
  }
});
test('a small positive pool does not repeat pictures or skew the two groups', () => {
  const round = buildFamilyAnyRound(config, ['taco', 'tren', 'mesa', 'sopa'].map(picture));
  assert.equal(round.cards.length, 2);
  assert.equal(round.cards.filter(c => round.columns[0].match(c.coreRaw)).length, 1);
});
test('explicit teacher words override automatic generation and are deduplicated', () => {
  const round = buildFamilyAnyRound({ ...config, words: ['taco', 'tren', 'taco'] }, bank);
  assert.deepEqual(round.cards.map(c => c.coreRaw).sort(), ['taco', 'tren']);
});
test('missing pictures never silently substitute other words or show word tiles', () => {
  const round = buildFamilyAnyRound({ ...config, words: ['taco', 'missing'] }, bank);
  assert.ok(round.error);
  assert.deepEqual(round.missingWords, ['missing']);
  assert.deepEqual(round.cards, []);
  assert.ok(buildFamilyAnyRound(config, ['taco', 'pata'].map(picture)).error);
  assert.ok(buildFamilyAnyRound(config, []).error);
});
test('each new round gets fresh card identities', () => {
  const a = buildFamilyAnyRound(config, bank);
  const b = buildFamilyAnyRound(config, bank);
  assert.ok(a.cards.every(card => !b.cards.some(other => other.id === card.id)));
});
test('native config forces picture-only behavior regardless of legacy toggles', () => {
  const text = source('lib/lettersort/rounds.js');
  assert.match(text, /imageOnly: family/);
  assert.match(text, /cardtype: family(?: \|\| listening)? \? 'image'/);
  assert.match(text, /tilesOnly: family(?: \|\| listening)? \? false/);
  assert.match(text, /hideWords: family(?: \|\| listening)? \? true/);
  assert.match(text, /splitCards: family(?: \|\| listening)? \? false/);
  assert.match(text, /mode === 'familyany'\) return buildFamilyAnyRound\(config, files\)/);
});
test('standalone mode and lesson preset both expose the same activity', () => {
  assert.match(source('lib/lettersort/presetConfig.js'), /key: 'familyany'.+fields: \['consonant', 'per', 'words'\]/);
  assert.match(source('pages/workstations/LetterSort.jsx'), /_ex_family_t:.+mode: 'familyany'/);
  assert.match(source('lib/presets/letterSortPresets.js'), /"Familia.T.CualquierPosicion".+mode: "familyany"/);
});
