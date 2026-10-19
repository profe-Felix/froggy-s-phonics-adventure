import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../src/lib/external-notebook/${name}.jsx`, import.meta.url), 'utf8');
const css = name => source(name).match(/const CSS = `([\s\S]*?)`;/)[1];
const rule = (text, selector) => text.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}'))[1];

test('compact sidebar removes wasted width without shrinking touch targets', () => {
  const text = css('NotebookToolbar');
  assert.match(text, /width:52px;\s+box-sizing:border-box/);
  const button = rule(text, '.nbt-b');
  assert.match(button, /width:44px/);
  assert.match(button, /height:44px/);
  assert.match(button, /padding:0/);
  assert.match(rule(text, '.nbt-bar'), /padding:4px/);
  assert.match(rule(text, '.nbt-sw'), /width:44px/);
});

test('page control has compact height and retains full navigation hit targets', () => {
  const text = css('NotebookStudentView');
  assert.match(rule(text, '.nbs-nav'), /height:44px/);
  assert.match(rule(text, '.nbs-nav .nbs-btn'), /min-width:44px/);
  assert.match(rule(text, '.nbs-nav .nbs-btn'), /min-height:44px/);
  assert.doesNotMatch(rule(text, '.nbs-page'), /min-width:132px/);
});

test('bottom status only reserves room for a real message', () => {
  const text = source('NotebookStudentView');
  assert.doesNotMatch(text, /\\u00a0/);
  assert.match(text, /\{\(\(mismatch && requested != null\) \|\|\s*\(requested == null && controls\)\) && \(/);
  assert.match(text, /data-testid="text-requested-page"/);
  assert.match(text, /still showing page/);
});
