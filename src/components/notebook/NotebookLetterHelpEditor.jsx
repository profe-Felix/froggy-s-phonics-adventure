import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, PenLine } from 'lucide-react';
import { normalizeLetterHelp, parseHelpLetters } from '@/lib/notebookLetterHelp.mjs';
import LetterHelpReplay, { useLetterHelpWaypoints } from './LetterHelpReplay';

const newId = () => `lh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = n => Math.round(Math.min(.98, Math.max(.02, n)) * 1000) / 1000;
const card = { background: '#1a1a2e', border: '1px solid #4338ca' };
const field = 'px-3 py-2 rounded-xl border border-indigo-500 text-white text-sm';

// Renders ONLY the selected page of the PDF via the existing pdfWorkerSetup.
let docCache = { url: null, promise: null };
function PagePreview({ url, page, rules, selectedId, onPlace }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let off = false, task = null;
    setStatus('loading');
    (async () => {
      try {
        const { pdfjsLib } = await import('@/lib/pdfWorkerSetup');
        if (docCache.url !== url) docCache = { url, promise: pdfjsLib.getDocument(url).promise };
        const pdf = await docCache.promise;
        const p = await pdf.getPage(page);
        if (off) return;
        const vp = p.getViewport({ scale: Math.min(2, 900 / p.getViewport({ scale: 1 }).width) });
        const c = canvasRef.current; c.width = vp.width; c.height = vp.height;
        task = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
        await task.promise;
        if (!off) setStatus('ok');
      } catch (e) { if (!off && e?.name !== 'RenderingCancelledException') { docCache = { url: null, promise: null }; setStatus('error'); } }
    })();
    return () => { off = true; task?.cancel?.(); };
  }, [url, page]);
  const click = e => {
    if (status !== 'ok' || !selectedId) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPlace(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
  };
  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ background: 'hsl(44 60% 96%)', minHeight: status === 'ok' ? undefined : 200 }}>
      <canvas ref={canvasRef} onClick={click} data-testid="canvas-letter-help-page" aria-label={`Page ${page} preview. Click to place the help icon.`}
        className={`block w-full h-auto ${selectedId ? 'cursor-crosshair' : ''}`} style={{ opacity: status === 'ok' ? 1 : 0 }} />
      {status === 'loading' && <div className="absolute inset-0 animate-pulse" style={{ background: 'hsl(230 30% 85%)' }} role="status" aria-label="Loading page" />}
      {status === 'error' && <p role="alert" className="absolute inset-0 flex items-center justify-center text-sm font-bold p-4 text-center" style={{ color: 'hsl(0 60% 38%)' }}>Page {page} could not load, so the icon cannot be placed. Try another page.</p>}
      {status === 'ok' && rules.filter(r => page >= r.pageStart && page <= r.pageEnd).map(r => (
        <span key={r.id} aria-hidden="true" className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center pointer-events-none"
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, background: r.id === selectedId ? 'hsl(14 85% 55%)' : 'hsl(230 30% 55%)', opacity: r.enabled ? 1 : .45, color: 'white', border: '3px solid white' }}>
          <PenLine className="w-4 h-4" />
        </span>
      ))}
    </div>
  );
}

export default function NotebookLetterHelpEditor({ assignment, onSave }) {
  const pageCount = Math.max(1, Number(assignment?.pdf_page_count || assignment?.page_count || 1));
  const loaded = useMemo(() => {
    try { return { rules: normalizeLetterHelp(assignment?.letter_help, Math.max(pageCount, 2000)), error: null }; }
    catch (e) { return { rules: null, error: e.message }; }
  }, [assignment?.id]); // eslint-disable-line
  const [rules, setRules] = useState(loaded.rules || []);
  const [selectedId, setSelectedId] = useState(loaded.rules?.[0]?.id || null);
  const [lettersText, setLettersText] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [state, setState] = useState({ saving: false, error: '', saved: false, dirty: false });
  const { waypoints, truncated: wpTruncated, failed: wpFailed } = useLetterHelpWaypoints(!!selectedId);
  const [previewLetter, setPreviewLetter] = useState('');
  const [previewSpeed, setPreviewSpeed] = useState(.5);

  useEffect(() => { setRules(loaded.rules || []); setSelectedId(loaded.rules?.[0]?.id || null); setState({ saving: false, error: '', saved: false, dirty: false }); }, [loaded]);
  const sel = rules.find(r => r.id === selectedId);
  useEffect(() => {
    if (!sel) return;
    setLettersText(sel.letters.join(', '));
    setPreviewPage(p => (p >= sel.pageStart && p <= sel.pageEnd ? p : sel.pageStart));
    setPreviewLetter(l => (sel.letters.includes(l) ? l : sel.letters[0] || ''));
    setPreviewSpeed(sel.speed);
  }, [selectedId]); // eslint-disable-line

  if (loaded.error) {
    return <div role="alert" className="rounded-2xl p-4 text-sm" style={{ ...card, borderColor: '#b91c1c' }} data-testid="status-letter-help-malformed">
      <p className="font-bold text-red-300">Saved Letter Help could not be read: {loaded.error}</p>
      <p className="text-indigo-300 mt-1">Nothing was changed. Editing is disabled so the saved rules are not overwritten. Contact support to repair this notebook.</p>
    </div>;
  }

  const patch = (upd) => { setRules(rs => rs.map(r => (r.id === selectedId ? { ...r, ...upd } : r))); setState(s => ({ ...s, dirty: true, saved: false, error: '' })); };
  const add = () => {
    const r = { id: newId(), pageStart: previewPage, pageEnd: previewPage, letters: ['a'], x: .9, y: .08, speed: .5, enabled: true };
    setRules(rs => [...rs, r]); setSelectedId(r.id); setLettersText('a'); setPreviewLetter('a'); setPreviewSpeed(.5);
    setState(s => ({ ...s, dirty: true, saved: false }));
  };
  const remove = (id) => {
    if (!confirm('Delete this Letter Help icon? It is removed for every class after you save.')) return;
    setRules(rs => rs.filter(r => r.id !== id));
    if (id === selectedId) setSelectedId(null);
    setState(s => ({ ...s, dirty: true, saved: false }));
  };
  const commitLetters = (v) => {
    try { const letters = parseHelpLetters(v); patch({ letters }); setPreviewLetter(l => (letters.includes(l) ? l : letters[0])); }
    catch (e) { setState(s => ({ ...s, error: e.message })); }
  };
  const save = async () => {
    let clean;
    try {
      const current = rules.map(rule => rule.id === selectedId ? { ...rule, letters: parseHelpLetters(lettersText) } : rule);
      clean = normalizeLetterHelp(current, pageCount);
    } catch (e) { setState(s => ({ ...s, error: e.message })); return; }
    setState(s => ({ ...s, saving: true, error: '' }));
    try { await onSave(clean); setRules(clean); setState({ saving: false, error: '', saved: true, dirty: false }); }
    catch (e) { setState(s => ({ ...s, saving: false, error: `Not saved: ${e?.message || 'please retry.'} Your edits are still here.` })); }
  };

  const numIn = (label, value, onChange, testid) => (
    <label className="flex items-center gap-2 text-indigo-300 text-sm">{label}
      <input type="number" min={1} max={pageCount} value={value} data-testid={testid}
        onChange={e => onChange(Math.max(1, Math.min(pageCount, parseInt(e.target.value) || 1)))} className={`${field} w-20 text-center font-bold`} style={{ background: '#0f0f1a' }} />
    </label>
  );

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={card} data-testid="panel-letter-help-editor">
      <fieldset disabled={state.saving} className="contents" style={{ pointerEvents: state.saving ? 'none' : undefined }}>
      <div>
        <p className="text-indigo-200 font-bold text-sm">Letter Help — show how to write letters</p>
        <p className="text-indigo-400 text-xs">This notebook is in the shared library, so these icons appear for every class. Students see changes the next time they open the notebook.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {rules.map(r => (
          <div key={r.id} className="flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${r.id === selectedId ? '#f97316' : '#4338ca'}`, opacity: r.enabled ? 1 : .55 }}>
            <button type="button" onClick={() => setSelectedId(r.id)} data-testid={`button-select-rule-${r.id}`} className="px-3 py-1.5 text-xs font-bold text-white">
              p.{r.pageStart}{r.pageEnd !== r.pageStart ? `–${r.pageEnd}` : ''}: {r.letters.join(' ')}
            </button>
            <button type="button" onClick={() => remove(r.id)} aria-label="Delete rule" data-testid={`button-delete-rule-${r.id}`} className="px-2 py-1.5 text-red-400 hover:bg-red-900">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={add} disabled={rules.length >= 100} data-testid="button-add-letter-help"
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1 disabled:opacity-40" style={{ background: '#4338ca' }}>
          <Plus className="w-3.5 h-3.5" /> Add help icon
        </button>
      </div>

      {!rules.length && <p className="text-indigo-400 text-sm text-center py-4">No Letter Help yet. Add an icon, then click the page to place it.</p>}

      {sel && (
        <div className="grid md:grid-cols-[1fr_260px] gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" disabled={previewPage <= 1} onClick={() => setPreviewPage(p => p - 1)} className="w-9 h-9 rounded-xl text-white font-black disabled:opacity-30" style={{ background: '#4338ca' }} aria-label="Previous page">‹</button>
              <span className="text-indigo-200 text-sm font-bold" data-testid="text-preview-page">Page {previewPage} of {pageCount}</span>
              <button type="button" disabled={previewPage >= pageCount} onClick={() => setPreviewPage(p => p + 1)} className="w-9 h-9 rounded-xl text-white font-black disabled:opacity-30" style={{ background: '#4338ca' }} aria-label="Next page">›</button>
              {(previewPage < sel.pageStart || previewPage > sel.pageEnd) && <span className="text-xs text-amber-300">This rule is not on this page.</span>}
            </div>
            {assignment?.pdf_url
              ? <PagePreview url={assignment.pdf_url} page={previewPage} rules={rules} selectedId={selectedId}
                  onPlace={(x, y) => { if (previewPage < sel.pageStart || previewPage > sel.pageEnd) patch({ x, y, pageStart: Math.min(sel.pageStart, previewPage), pageEnd: Math.max(sel.pageEnd, previewPage) }); else patch({ x, y }); }} />
              : <p role="alert" className="text-sm text-red-300">This assignment has no PDF, so icons cannot be placed.</p>}
            <p className="text-indigo-400 text-xs">Click the page to place the selected icon. Position: {Math.round(sel.x * 100)}% across, {Math.round(sel.y * 100)}% down.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              {numIn('From page', sel.pageStart, v => patch({ pageStart: v, pageEnd: Math.max(v, sel.pageEnd) }), 'input-rule-page-start')}
              {numIn('to', sel.pageEnd, v => patch({ pageEnd: Math.max(v, sel.pageStart) }), 'input-rule-page-end')}
            </div>
            <label className="text-indigo-300 text-sm flex flex-col gap-1">Target letters
              <input value={lettersText} onChange={e => {
                setLettersText(e.target.value);
                setState(s => ({ ...s, dirty: true, saved: false }));
              }} onBlur={e => commitLetters(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitLetters(e.currentTarget.value); }} placeholder="d, t, p" data-testid="input-rule-letters"
                className={field} style={{ background: '#0f0f1a' }} />
            </label>
            <label className="flex items-center gap-2 text-indigo-200 text-sm font-bold">
              <input type="checkbox" checked={sel.enabled} onChange={e => patch({ enabled: e.target.checked })} data-testid="checkbox-rule-enabled" className="w-4 h-4 accent-orange-500" />
              Visible to students
            </label>
            <p className="text-indigo-300 text-xs font-bold uppercase mt-1">Student replay preview</p>
            <div className="flex flex-wrap gap-1">
              {sel.letters.map(l => (
                <button key={l} type="button" onClick={() => setPreviewLetter(l)} data-testid={`button-preview-letter-${l}`}
                  className="px-2.5 py-1 rounded-lg text-sm font-black" style={l === previewLetter ? { background: '#f97316', color: 'white' } : { background: '#0f0f1a', color: '#c7d2fe', border: '1px solid #4338ca' }}>{l}</button>
              ))}
            </div>
            <div className="rounded-xl p-2" style={{ background: 'hsl(40 55% 96%)' }}>
              {previewLetter && <LetterHelpReplay compact text={previewLetter} waypoints={waypoints} speed={previewSpeed}
                onSpeedChange={v => { setPreviewSpeed(v); patch({ speed: v }); }} />}
            </div>
            {wpTruncated && <p role="status" className="text-amber-300 text-xs">500 or more saved letter models exist; only the newest 500 are included in this preview.</p>}
            {wpFailed && <p role="status" className="text-amber-300 text-xs">Teacher letter models could not load; preview shows built-in strokes only.</p>}
            <p className="text-indigo-400 text-xs">The selected speed becomes the student default.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={state.saving || !state.dirty} data-testid="button-save-letter-help"
          className="px-4 py-2 rounded-xl font-bold text-sm text-white flex items-center gap-2 disabled:opacity-40" style={{ background: '#ea580c' }}>
          <Save className="w-4 h-4" /> {state.saving ? 'Saving...' : 'Save Letter Help'}
        </button>
        <span role="status" className="text-xs" data-testid="status-letter-help-save">
          {state.error ? <span className="text-red-300 font-bold">{state.error}</span>
            : state.saved ? <span className="text-green-300">Saved for all classes. Visible on next notebook opening.</span>
            : state.dirty ? <span className="text-amber-300">Unsaved changes.</span> : null}
        </span>
      </div>
      </fieldset>
    </div>
  );
}
