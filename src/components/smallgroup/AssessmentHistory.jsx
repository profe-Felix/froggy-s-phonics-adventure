import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';
import { X, TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react';
import { DECODING_LEVELS } from '@/lib/decodingSyllables';
import { compareAttempts } from '@/lib/assessmentAttempts.mjs';

const TYPE_LABELS = {
  decoding: 'Decoding',
  upper_names: 'Uppercase Names',
  lower_names: 'Lowercase Names',
  upper_sounds: 'Uppercase Sounds',
  lower_sounds: 'Lowercase Sounds',
  sight_words: 'Sight Words',
};

const LEVEL_LABEL = Object.fromEntries((DECODING_LEVELS || []).map((l) => [l.id, l.label]));

function resolveNotes(attempt) {
  const notes = attempt.notes || {};
  const entries = [];
  if (attempt.type === 'decoding') {
    const levels = attempt.levels || {};
    for (const [key, note] of Object.entries(notes)) {
      const sep = key.indexOf('_');
      const level = sep >= 0 ? key.slice(0, sep) : key;
      const idx = sep >= 0 ? Number(key.slice(sep + 1)) : NaN;
      const item = levels[level]?.item_order?.[idx];
      entries.push({ item: item || key, note });
    }
  } else {
    const order = attempt.item_order || [];
    for (const [idx, note] of Object.entries(notes)) {
      const item = order[Number(idx)];
      entries.push({ item: item || `Item ${Number(idx) + 1}`, note });
    }
  }
  return entries;
}

function fmtDate(d) {
  if (!d) return 'Unknown date';
  const date = new Date(d);
  if (isNaN(date)) return 'Unknown date';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function attemptKey(a, i) {
  return a.id != null ? String(a.id) : `idx-${i}`;
}

function counts(a) {
  const c = a.correct?.length || 0;
  const x = a.incorrect?.length || 0;
  const t = c + x;
  return { c, x, acc: t > 0 ? Math.round((c / t) * 100) : null };
}

function StatusBadge({ attempt }) {
  if (attempt.completed === false) {
    return <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">In progress / ended early</span>;
  }
  return null;
}

function Meta({ attempt }) {
  const bits = [
    attempt.teacher_name && `Teacher: ${attempt.teacher_name}`,
    attempt.color_group && `Group: ${attempt.color_group}`,
    attempt.language && `Lang: ${attempt.language}`,
    attempt.source && `Source: ${attempt.source}`,
  ].filter(Boolean);
  if (!bits.length) return null;
  return <p className="text-[11px] text-slate-400 mt-0.5">{bits.join(' · ')}</p>;
}

function Chips({ list, tone, decoding, testid }) {
  const tones = {
    green: 'bg-green-100 text-green-800',
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    muted: 'bg-white border border-dashed border-slate-300 text-slate-500',
  };
  if (!list?.length) return <span className="text-xs text-slate-400">None</span>;
  return (
    <div className="flex flex-wrap gap-1" data-testid={testid}>
      {list.map((e) => (
        <span key={e.key} className={cn('px-1.5 py-0.5 rounded text-xs font-medium', tones[tone])}>
          {e.item}
          {decoding && e.level && <span className="opacity-60 ml-1 text-[10px]">{LEVEL_LABEL[e.level] || e.level}</span>}
        </span>
      ))}
    </div>
  );
}

function LevelSummary({ attempt }) {
  if (attempt.type !== 'decoding' || !attempt.levels) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {DECODING_LEVELS.map((lvl) => {
        const ld = attempt.levels[lvl.id];
        if (!ld) return null;
        const c = (ld.correct || []).length;
        const i = (ld.incorrect || []).length;
        const t = c + i;
        return (
          <li key={lvl.id} className="flex justify-between text-[11px] text-slate-600">
            <span>{lvl.label}</span>
            <span>
              {t === 0 ? <span className="text-slate-400">Not assessed</span> : (
                <><span className="text-green-700 font-bold">{c}✓</span> <span className="text-red-600 font-bold">{i}✗</span> <span className="text-slate-400">({Math.round((c / t) * 100)}%)</span></>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Comparison({ typeAttempts, keyed }) {
  const n = typeAttempts.length;
  const [beforeId, setBeforeId] = useState(keyed(typeAttempts[n - 1]));
  const [afterId, setAfterId] = useState(keyed(typeAttempts[0]));
  const before = typeAttempts.find((a) => keyed(a) === beforeId) || typeAttempts[n - 1];
  const after = typeAttempts.find((a) => keyed(a) === afterId) || typeAttempts[0];
  const same = before === after;
  const result = useMemo(() => (same ? null : compareAttempts(before, after)), [before, after, same]);
  const isDecoding = before.type === 'decoding';
  const poolsDiffer = result && !result.incompatible && (
    result.shared < counts(before).c + counts(before).x || result.shared < counts(after).c + counts(after).x || result.notTested?.length > 0
  );

  const select = (value, onChange, label, testid) => (
    <label className="flex-1 min-w-[180px] text-xs text-slate-600">
      <span className="font-bold block mb-0.5">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
        className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
        {typeAttempts.slice().reverse().map((a) => (
          <option key={keyed(a)} value={keyed(a)}>
            {fmtDate(a.date)}{a.completed === false ? ' (ended early)' : ''}
          </option>
        ))}
      </select>
    </label>
  );

  const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);

  return (
    <section className="border border-slate-200 rounded-xl p-4 bg-slate-50/60" aria-labelledby="cmp-h">
      <h3 id="cmp-h" className="font-bold text-slate-800 text-sm mb-2">Compare attempts</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {select(keyed(before), setBeforeId, 'Earlier attempt', 'select-before-attempt')}
        {select(keyed(after), setAfterId, 'Later attempt', 'select-after-attempt')}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {[['Earlier', before], ['Later', after]].map(([lbl, a]) => {
          const k = counts(a);
          return (
            <div key={lbl} className="rounded-lg bg-white border border-slate-200 p-2">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase">{lbl}</span>
                <StatusBadge attempt={a} />
              </div>
              <p className="text-xs text-slate-700">{fmtDate(a.date)}</p>
              <p className="text-xs"><span className="text-green-700 font-bold">{k.c}✓</span> <span className="text-red-600 font-bold">{k.x}✗</span> <span className="text-slate-400">({k.acc == null ? '—' : `${k.acc}%`})</span></p>
              <LevelSummary attempt={a} />
            </div>
          );
        })}
      </div>

      {same ? (
        <p className="text-xs text-slate-500">Pick two different attempts to compare.</p>
      ) : result?.incompatible ? (
        <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          These attempts can't be compared (different language: {before.language || '?'} vs {after.language || '?'}).
        </p>
      ) : (
        <div className="space-y-2" data-testid="comparison-results">
          <p className="text-xs text-slate-600">
            Shared items: <b>{result.shared}</b> · Accuracy on shared items: <b>{pct(result.beforeAccuracy)}</b> → <b>{pct(result.afterAccuracy)}</b>
          </p>
          {poolsDiffer && (
            <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md p-2">
              Item pools differ, so only items tested in both attempts are compared{isDecoding ? ' (matched by level + item)' : ''}. Items tested in just one attempt are listed as "Not tested in both" and are not counted as errors.
            </p>
          )}
          {[
            ['Improved (✗ → ✓)', result.improved, 'green', 'improved'],
            ['Regressed (✓ → ✗)', result.regressed, 'amber', 'regressed'],
            ['Still incorrect', result.stillIncorrect, 'red', 'still-incorrect'],
            ['Retained correct', result.retained, 'slate', 'retained'],
            ['Not tested in both', result.notTested, 'muted', 'not-tested'],
          ].map(([label, list, tone, id]) => (
            <div key={id}>
              <p className="text-xs font-bold text-slate-700 mb-0.5">{label} <span className="font-normal text-slate-400">({list?.length || 0})</span></p>
              <Chips list={list} tone={tone} decoding={isDecoding} testid={`list-${id}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AssessmentHistory({ student, history, onClose, loading = false, error = '', onRetry }) {
  const all = useMemo(
    () => [...(history || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [history]
  );
  const indexOf = useMemo(() => new Map(all.map((a, i) => [a, i])), [all]);
  const keyed = (a) => attemptKey(a, indexOf.get(a));

  const types = useMemo(() => {
    const seen = [];
    for (const a of all) if (!seen.includes(a.type)) seen.push(a.type);
    return seen;
  }, [all]);

  const [type, setType] = useState(types[0] || '');
  useEffect(() => {
    if (!types.includes(type)) setType(types[0] || '');
  }, [types, type]);

  const sorted = all.filter((a) => a.type === type);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Consistent errors — within the selected type only
  const errorCounts = {};
  for (const attempt of sorted) {
    for (const item of attempt.incorrect || []) {
      if (!errorCounts[item]) errorCounts[item] = { item, count: 0 };
      errorCounts[item].count++;
    }
  }
  const consistentErrors = Object.values(errorCounts)
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count);

  const { first } = parseName(student?.name);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ah-title"
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {student?.photo_url && <img src={student.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
            <div className="min-w-0">
              <h2 id="ah-title" className="font-bold text-slate-800 truncate">{first || student?.name} — Assessment History</h2>
              <p className="text-xs text-slate-500">
                {loading ? 'Loading…' : `${sorted.length} attempt${sorted.length !== 1 ? 's' : ''}${type ? ` · ${TYPE_LABELS[type] || type}` : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="button-close-history" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {!loading && !error && types.length > 0 && (
          <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-2">
            <label htmlFor="ah-type" className="text-xs font-bold text-slate-600">Assessment</label>
            <select id="ah-type" value={type} onChange={(e) => setType(e.target.value)} data-testid="select-assessment-type"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
              {types.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t] || t} ({all.filter((a) => a.type === t).length})</option>
              ))}
            </select>
          </div>
        )}

        <div className="overflow-y-auto p-5 space-y-4" aria-busy={loading}>
          {loading ? (
            <div className="space-y-3" aria-label="Loading history">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : error ? (
            <div role="alert" className="border border-red-200 bg-red-50 rounded-xl p-4 text-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-sm text-red-700 mb-2">{error}</p>
              {onRetry && (
                <button onClick={onRetry} data-testid="button-retry-history"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white border border-red-300 text-red-700 text-sm font-medium hover:bg-red-100">
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              )}
            </div>
          ) : all.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No past attempts yet.</p>
          ) : (
            <>
              {sorted.length >= 2 ? (
                <Comparison key={type} typeAttempts={sorted} keyed={keyed} />
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  Only one {TYPE_LABELS[type] || type} attempt so far — record another to compare progress.
                </p>
              )}

              {consistentErrors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-amber-800 text-sm">Consistent Errors</h3>
                    <span className="text-xs text-amber-600">({consistentErrors.length})</span>
                  </div>
                  <p className="text-xs text-amber-700 mb-2">Missed 2+ times in {TYPE_LABELS[type] || type} — worth targeted intervention:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {consistentErrors.map((e) => (
                      <span key={e.item} className="px-2 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-800 text-sm font-bold">
                        {e.item} <span className="text-xs font-normal">×{e.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sorted.map((attempt) => {
                const k = counts(attempt);
                const notes = resolveNotes(attempt);
                const id = keyed(attempt);
                return (
                  <div key={id} className="border border-slate-200 rounded-xl p-4" data-testid={`card-attempt-${id}`}>
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-500">{TYPE_LABELS[attempt.type] || attempt.type}</span>
                          <span className="text-xs text-slate-400">{fmtDate(attempt.date)}</span>
                          <StatusBadge attempt={attempt} />
                        </div>
                        <Meta attempt={attempt} />
                      </div>
                      <div className="flex items-center gap-2 text-sm shrink-0">
                        <span className="text-green-600 font-bold">{k.c}✓</span>
                        <span className="text-red-600 font-bold">{k.x}✗</span>
                        <span className="text-slate-400 text-xs">({k.acc == null ? '—' : `${k.acc}%`})</span>
                      </div>
                    </div>
                    {attempt.incorrect?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-500 mb-1">Errors:</p>
                        <div className="flex flex-wrap gap-1">
                          {attempt.incorrect.map((item, j) => {
                            const isConsistent = errorCounts[item]?.count >= 2;
                            return (
                              <span key={j} className={cn(
                                'px-2 py-0.5 rounded text-sm font-medium',
                                isConsistent ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-red-50 text-red-600'
                              )}>
                                {item}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {attempt.incorrect?.length === 0 && attempt.correct?.length > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        {attempt.completed === false ? 'No errors on items tested before it ended.' : 'All correct!'}
                      </p>
                    )}
                    {attempt.type === 'decoding' && attempt.levels && (
                      <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                        <p className="text-xs font-bold text-slate-600">By decoding level:</p>
                        {DECODING_LEVELS.map((lvl) => {
                          const ld = attempt.levels[lvl.id];
                          if (!ld) return null;
                          const c = (ld.correct || []).length;
                          const i = (ld.incorrect || []).length;
                          const total = c + i;
                          const acc = total > 0 ? Math.round((c / total) * 100) : 0;
                          return (
                            <div key={lvl.id} className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700">{lvl.label}</span>
                                <span className="text-xs">
                                  <span className="text-green-600 font-bold">{c}✓</span>{' '}
                                  <span className="text-red-600 font-bold">{i}✗</span>{' '}
                                  <span className="text-slate-400">({acc}%)</span>
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(ld.correct || []).map((w, j) => (
                                  <span key={`c${j}`} className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">{w}</span>
                                ))}
                                {(ld.incorrect || []).map((w, j) => (
                                  <span key={`i${j}`} className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs font-medium">{w}</span>
                                ))}
                                {total === 0 && <span className="text-xs text-slate-400">Not assessed</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {notes.length > 0 && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-xs text-slate-500 mb-1">Notes:</p>
                        <ul className="space-y-1">
                          {notes.map((n, j) => (
                            <li key={j} className="text-xs text-slate-700">
                              <span className="font-bold">{n.item}:</span> {n.note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
