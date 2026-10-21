import { useMemo, useState } from 'react';
import useVocabularyReview from '@/hooks/useVocabularyReview';

const PAGE_SIZE = 40;
const STATUS_STYLE = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  approved: 'bg-teal-50 text-teal-800 border-teal-200',
  excluded: 'bg-rose-50 text-rose-800 border-rose-200',
};
const kinder = { fontFamily: "var(--font-kinder, 'Andika'), 'Andika', sans-serif" };

function msg(e) {
  return e?.message || String(e || 'Something went wrong. Try again.');
}

function Count({ label, s }) {
  if (!s) return null;
  return <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2" data-testid={`summary-${label.toLowerCase()}`}>
    <div className="text-xs font-bold uppercase tracking-wide text-indigo-700">{label} · {s.total}</div>
    <div className="mt-1 flex gap-3 text-xs">
      <span className="text-slate-600">{s.pending} pending</span>
      <span className="text-teal-700">{s.approved} approved</span>
      <span className="text-rose-700">{s.excluded} excluded</span>
    </div>
  </div>;
}

function EditRow({ item, onCancel, onSave, saving }) {
  const [text, setText] = useState(item.text);
  const [split, setSplit] = useState((item.syllables || []).join('-'));
  const [err, setErr] = useState('');
  const isWord = item.kind === 'word';
  const submit = async () => {
    setErr('');
    const replacement = text.trim();
    if (!replacement || /\s/.test(replacement)) { setErr('Enter one Spanish word or syllable, without spaces.'); return; }
    const opts = { status: item.status === 'pending' ? 'approved' : item.status, replacement };
    if (isWord) {
      const parts = split.split('-').map(p => p.trim()).filter(Boolean);
      if (parts.join('') !== replacement) { setErr(`Syllables must join back to "${replacement}". Separate with hyphens, e.g. ca-sa.`); return; }
      opts.syllables = parts;
    }
    try { await onSave(item, opts); } catch (e) { setErr(msg(e)); }
  };
  return <div className="mt-2 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
    <label className="block text-xs font-bold text-indigo-800">Corrected {isWord ? 'spelling' : 'syllable'}
      <input value={text} onChange={e => setText(e.target.value)} style={kinder} data-testid={`input-correct-${item.key}`}
        className="mt-1 w-full rounded-lg border border-indigo-200 bg-white p-2 text-base font-normal" />
    </label>
    {isWord && <label className="block text-xs font-bold text-indigo-800">Syllable split (hyphens)
      <input value={split} onChange={e => setSplit(e.target.value)} style={kinder} data-testid={`input-split-${item.key}`}
        className="mt-1 w-full rounded-lg border border-indigo-200 bg-white p-2 text-base font-normal" />
    </label>}
    {err && <p role="alert" className="text-xs text-red-700">{err} Your draft is kept.</p>}
    <div className="flex gap-2">
      <button disabled={saving} onClick={submit} data-testid={`button-save-${item.key}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save correction</button>
      <button onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
    </div>
  </div>;
}

export default function VocabularyReviewPanel() {
  const r = useVocabularyReview();
  const [kind, setKind] = useState('word');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [confirm, setConfirm] = useState(null); // {type:'exclude', items} | {type:'strict'}

  const list = kind === 'word' ? r.words : r.syllables;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list || []).filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!needle) return true;
      return [i.text, i.original, ...(i.syllables || []), ...(i.sourceBooks || []).map(b => b.title)]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [list, q, statusFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const pageItems = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const selectedItems = filtered.filter(i => selected.has(i.key));

  const resetView = fn => v => { fn(v); setPage(0); setSelected(new Set()); setEditing(null); };
  const toggle = key => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const one = async (item, opts) => {
    setActionError(''); setBusyKey(item.key);
    try { await r.save(item, opts); } catch (e) { setActionError(`Could not update "${item.text}": ${msg(e)}`); }
    finally { setBusyKey(null); }
  };
  const many = async (items, status) => {
    setActionError('');
    const batch = items.slice(0, 100);
    try {
      const done = await r.saveMany(batch, status);
      setSelected(new Set());
      if (items.length > 100) setActionError(`Updated ${done} items. Bulk actions handle 100 at a time; run again for the rest.`);
    } catch (e) { setActionError(`Bulk update stopped: ${msg(e)} Nothing was silently skipped; check the list and retry.`); }
  };
  const bulk = (items, status) => {
    if (!items.length) return;
    if (status === 'excluded') setConfirm({ type: 'exclude', items }); else many(items, status);
  };
  const toggleStrict = async () => {
    if (!r.approvedOnly) { setConfirm({ type: 'strict' }); return; }
    try { setActionError(''); await r.setApprovedOnly(false); } catch (e) { setActionError(`Could not change policy: ${msg(e)}`); }
  };
  const confirmGo = async () => {
    const c = confirm; setConfirm(null);
    if (c.type === 'exclude') await many(c.items, 'excluded');
    else { try { setActionError(''); await r.setApprovedOnly(true); } catch (e) { setActionError(`Could not change policy: ${msg(e)}`); } }
  };

  if (r.loading) return <div className="space-y-2" data-testid="status-review-loading">
    {[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-indigo-50" />)}
  </div>;
  if (r.error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
    <p className="font-bold">Vocabulary review could not load.</p><p className="text-xs">{msg(r.error)}</p>
    <button onClick={() => r.refresh()} data-testid="button-review-retry" className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white">Retry</button>
  </div>;

  return <section className="space-y-3 rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-3" data-testid="panel-vocabulary-review">
    {r.refreshError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      The bank could not refresh. Your edit draft is kept.
      <button className="ml-2 underline" onClick={r.refresh}>Retry refresh</button>
    </div>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-bold text-indigo-900">Review vocabulary</h3>
        <p className="max-w-prose text-xs text-slate-600">Approving a word also approves the syllables it produces, unless you excluded a syllable on its own. Corrections replace the scanned text everywhere practice lists use it.</p>
      </div>
      <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-1 text-teal-900" style={kinder} title="Font sample: capital I, lowercase i, single-story a">
        <span className="text-xl">I i a</span><span className="ml-2 text-[10px] uppercase tracking-wide">sample</span>
      </div>
    </div>

    <div className="grid gap-2 sm:grid-cols-2"><Count label="Words" s={r.summary?.words} /><Count label="Syllables" s={r.summary?.syllables} /></div>

    <div className={`rounded-xl border p-3 ${r.approvedOnly ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs">
          <p className="font-bold text-slate-800">Approved-only practice: {r.approvedOnly ? 'On' : 'Off'}</p>
          <p className="text-slate-600">When on, automatic practice lists use only approved items. Manual daily lists and recordings already in progress are not affected.</p>
        </div>
        <button onClick={toggleStrict} data-testid="button-toggle-strict" className={`rounded-lg px-3 py-1.5 text-xs font-bold ${r.approvedOnly ? 'border border-teal-300 bg-white text-teal-800' : 'bg-teal-600 text-white'}`}>
          {r.approvedOnly ? 'Turn off' : 'Turn on'}</button>
      </div>
    </div>

    {confirm && <div role="alertdialog" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="dialog-confirm">
      {confirm.type === 'exclude'
        ? <p>Exclude {Math.min(confirm.items.length, 100)} {kind === 'word' ? 'words' : 'syllables'} from automatic practice? You can restore them later.</p>
        : <p>Turn on approved-only practice? Automatic lists will skip everything still pending, so days whose words are unreviewed may show empty practice lists until you approve them.</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={confirmGo} data-testid="button-confirm" className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white">{confirm.type === 'exclude' ? 'Exclude' : 'Turn on'}</button>
        <button onClick={() => setConfirm(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold">Cancel</button>
      </div>
    </div>}

    {actionError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800" data-testid="text-review-error">{actionError}</p>}
    {r.saving && <p className="text-xs font-bold text-indigo-700" data-testid="status-saving">
      Saving{r.progress ? ` ${r.progress.completed} of ${r.progress.total}` : ''}…</p>}

    <div className="flex flex-wrap gap-2">
      <div className="inline-flex rounded-lg border border-indigo-200 bg-white p-0.5 text-xs font-bold">
        {['word', 'syllable'].map(k => <button key={k} onClick={() => resetView(setKind)(k)} data-testid={`tab-${k}`}
          className={`rounded-md px-3 py-1 ${kind === k ? 'bg-indigo-600 text-white' : 'text-indigo-700'}`}>{k === 'word' ? 'Words' : 'Syllables'}</button>)}
      </div>
      <select value={statusFilter} onChange={e => resetView(setStatusFilter)(e.target.value)} data-testid="select-status"
        className="rounded-lg border border-indigo-200 bg-white px-2 text-xs">
        <option value="pending">Pending</option><option value="approved">Approved</option><option value="excluded">Excluded</option><option value="all">All</option>
      </select>
      <input value={q} onChange={e => resetView(setQ)(e.target.value)} placeholder="Search text, syllable or book" data-testid="input-review-search"
        className="min-w-[10rem] flex-1 rounded-lg border border-indigo-200 bg-white p-2 text-xs" />
    </div>

    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-600">{selectedItems.length} selected</span>
      <button disabled={r.saving || !selectedItems.length} onClick={() => bulk(selectedItems, 'approved')} data-testid="button-approve-selected" className="rounded-lg bg-teal-600 px-2.5 py-1 font-bold text-white disabled:opacity-40">Approve selected</button>
      <button disabled={r.saving || !selectedItems.length} onClick={() => bulk(selectedItems, 'excluded')} data-testid="button-exclude-selected" className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-bold text-rose-700 disabled:opacity-40">Exclude selected</button>
      <span className="text-slate-300">|</span>
      <button disabled={r.saving || !pageItems.length} onClick={() => bulk(pageItems, 'approved')} data-testid="button-approve-page" className="rounded-lg border border-teal-300 bg-white px-2.5 py-1 font-bold text-teal-700 disabled:opacity-40">Approve this page</button>
      <button disabled={r.saving || !pageItems.length} onClick={() => bulk(pageItems, 'excluded')} data-testid="button-exclude-page" className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 font-bold text-rose-700 disabled:opacity-40">Exclude this page</button>
    </div>

    {!pageItems.length ? <div className="rounded-xl border border-dashed border-indigo-200 p-6 text-center text-xs text-slate-600" data-testid="status-review-empty">
      {(list || []).length ? 'Nothing matches these filters. Try another status or search.' : 'No scanned vocabulary yet. Rescan books above to build the bank.'}
    </div> : <ul className="divide-y divide-indigo-50 rounded-xl border border-indigo-100 bg-white">
      <li className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-500">
        <input type="checkbox" checked={pageItems.every(i => selected.has(i.key))} data-testid="checkbox-select-page"
          onChange={e => setSelected(s => { const n = new Set(s); pageItems.forEach(i => e.target.checked ? n.add(i.key) : n.delete(i.key)); return n; })} />
        Select page
      </li>
      {pageItems.map(item => <li key={item.key} className="px-3 py-2" data-testid={`row-vocab-${item.key}`}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} aria-label={`Select ${item.text}`} />
          <span className="text-lg text-slate-900" style={kinder}>{item.text}</span>
          {item.kind === 'word' && item.syllables?.length > 0 && <span className="text-sm text-indigo-600" style={kinder}>{item.syllables.join(' · ')}</span>}
          {item.corrected && <span className="text-[11px] text-slate-500">was <s style={kinder}>{item.original}</s></span>}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[item.status]}`}>{item.status}{item.inherited ? ' via word' : ''}</span>
          <div className="ml-auto flex gap-1 text-[11px] font-bold">
            {item.status !== 'approved' && <button disabled={busyKey === item.key} onClick={() => one(item, { status: 'approved' })} data-testid={`button-approve-${item.key}`} className="rounded-md bg-teal-600 px-2 py-1 text-white disabled:opacity-50">Approve</button>}
            {item.status !== 'excluded' && <button disabled={busyKey === item.key} onClick={() => one(item, { status: 'excluded' })} data-testid={`button-exclude-${item.key}`} className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 disabled:opacity-50">Exclude</button>}
            {(item.status !== 'pending' || item.corrected) && <button disabled={busyKey === item.key} onClick={() => one(item, { status: 'pending' })} title="Back to pending with original scanned text" data-testid={`button-restore-${item.key}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 disabled:opacity-50">Restore</button>}
            <button onClick={() => setEditing(editing === item.key ? null : item.key)} data-testid={`button-edit-${item.key}`} className="rounded-md border border-indigo-200 px-2 py-1 text-indigo-700">Correct</button>
          </div>
        </div>
        {!!item.sourceBooks?.length && <p className="mt-1 truncate text-[11px] text-slate-500" title={item.sourceBooks.map(b => b.title).join(', ')}>
          From {item.sourceBooks.slice(0, 3).map(b => `${b.title}${b.subject ? ` (${b.subject})` : ''}`).join(', ')}{item.sourceBooks.length > 3 ? ` and ${item.sourceBooks.length - 3} more` : ''}</p>}
        {editing === item.key && <EditRow item={item} saving={r.saving} onCancel={() => setEditing(null)}
          onSave={async (it, opts) => { await r.save(it, opts); setEditing(null); }} />}
      </li>)}
    </ul>}

    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{filtered.length} shown · page {cur + 1} of {pages}</span>
      <div className="flex gap-1">
        <button disabled={cur === 0} onClick={() => { setPage(cur - 1); setEditing(null); }} data-testid="button-prev-page" className="rounded-lg border border-indigo-200 bg-white px-3 py-1 font-bold text-indigo-700 disabled:opacity-40">Previous</button>
        <button disabled={cur >= pages - 1} onClick={() => { setPage(cur + 1); setEditing(null); }} data-testid="button-next-page" className="rounded-lg border border-indigo-200 bg-white px-3 py-1 font-bold text-indigo-700 disabled:opacity-40">Next</button>
      </div>
    </div>
  </section>;
}
