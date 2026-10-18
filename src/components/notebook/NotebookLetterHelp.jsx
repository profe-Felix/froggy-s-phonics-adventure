import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PenLine, X } from 'lucide-react';
import { letterHelpForPage } from '@/lib/notebookLetterHelp.mjs';
import LetterHelpReplay, { mergeTeacherWaypoints, displayLetter } from './LetterHelpReplay';

const EMPTY = Object.freeze({});
const stop = e => e.stopPropagation();

function HelpDialog({ rule, onClose, returnFocus, waypoints }) {
  const [letter, setLetter] = useState(rule.letters[0]);
  const [upper, setUpper] = useState(false);
  const [speed, setSpeed] = useState(rule.speed ?? .5);
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const ret = returnFocus;
    boxRef.current?.querySelector('button')?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); return; }
      e.stopPropagation();
      if (e.key !== 'Tab' || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll('button,input,[tabindex="0"]')].filter(el => !el.disabled);
      if (!f.length) { e.preventDefault(); return; }
      if (!boxRef.current.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); return; }
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); ret?.focus?.(); };
  }, []); // eslint-disable-line

  const text = displayLetter(letter, upper);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'hsl(18 40% 15% / .55)' }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="overlay-letter-help">
      <div ref={boxRef} role="dialog" onKeyDown={stop} onKeyUp={stop} aria-modal="true" aria-labelledby="letter-help-title"
        className="w-full sm:max-w-lg max-h-[100dvh] overflow-auto rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 flex flex-col gap-3"
        style={{ background: 'hsl(40 55% 96%)', color: 'hsl(18 50% 22%)', boxShadow: '0 30px 60px -20px hsl(18 50% 15% / .5)' }}>
        <div className="flex items-center gap-2">
          <h2 id="letter-help-title" className="font-black text-xl flex-1">Así se escribe <span style={{ fontFamily: "'Andika', sans-serif" }}>{text}</span></h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" data-testid="button-letter-help-close"
            className="w-11 h-11 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-4" style={{ background: 'hsl(42 60% 88%)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {rule.letters.length > 1 && (
          <div role="radiogroup" aria-label="Letra" className="flex flex-wrap gap-2">
            {rule.letters.map(l => (
              <button key={l} type="button" role="radio" aria-checked={l === letter} onClick={() => setLetter(l)} data-testid={`button-letter-${l}`}
                className="min-w-12 h-12 px-3 rounded-2xl font-black text-2xl focus-visible:outline focus-visible:outline-4"
                style={{ fontFamily: "'Andika', sans-serif", ...(l === letter ? { background: 'hsl(14 85% 55%)', color: 'hsl(40 55% 97%)' } : { background: 'hsl(42 60% 90%)' }) }}>
                {displayLetter(l, upper)}
              </button>
            ))}
          </div>
        )}
        <div role="radiogroup" aria-label="Minúscula o mayúscula" className="flex gap-2">
          {[[false, 'minúscula'], [true, 'MAYÚSCULA']].map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={upper === v} onClick={() => setUpper(v)} data-testid={`button-case-${v ? 'upper' : 'lower'}`}
              className="flex-1 h-11 rounded-full font-bold text-sm focus-visible:outline focus-visible:outline-4"
              style={upper === v ? { background: 'hsl(172 70% 28%)', color: 'hsl(40 55% 97%)' } : { background: 'hsl(42 60% 90%)' }}>{label}</button>
          ))}
        </div>
        <LetterHelpReplay text={text} waypoints={waypoints} speed={speed} onSpeedChange={setSpeed} />
      </div>
    </div>, document.body);
}

export default function NotebookLetterHelp({ rules, page, workbookId, finishGesture, teacherWaypoints = EMPTY }) {
  const pageRules = useMemo(() => { try { return letterHelpForPage(rules, page); } catch { return []; } }, [rules, page]);
  const waypoints = useMemo(() => mergeTeacherWaypoints(teacherWaypoints), [teacherWaypoints]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scope = `${workbookId}|${page}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const returnRef = useRef(null);

  useEffect(() => { setOpen(null); setError(''); setBusy(false); }, [scope]);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t); }, [error]);

  const openRule = async (rule, el) => {
    if (busy) return;
    const started = scopeRef.current;
    setBusy(true); setError('');
    let ok = false;
    try { ok = finishGesture ? (await finishGesture()) === true : true; } catch { ok = false; }
    if (scopeRef.current !== started) return;
    setBusy(false);
    if (!ok) { setError('Tu trabajo todavía se está guardando. Espera un momento y vuelve a tocar la ayuda.'); return; }
    returnRef.current = el;
    setOpen(rule);
  };

  if (!pageRules.length) return null;
  return (
    <>
      {pageRules.map(rule => (
        <button key={rule.id} type="button" data-testid={`button-letter-help-${rule.id}`}
          aria-label={`Ayuda para escribir: ${rule.letters.join(', ')}`} aria-busy={busy}
          onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onTouchStart={stop} onMouseDown={stop}
          onClick={e => { stop(e); openRule(rule, e.currentTarget); }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2"
          style={{ left: `clamp(26px, ${rule.x * 100}%, calc(100% - 26px))`, top: `clamp(26px, ${rule.y * 100}%, calc(100% - 26px))`, zIndex: 5, pointerEvents: 'auto', touchAction: 'manipulation',
            background: 'hsl(14 85% 55%)', color: 'hsl(40 55% 97%)', border: '3px solid hsl(40 55% 97%)', boxShadow: '0 6px 14px -4px hsl(14 60% 25% / .6)' }}>
          <PenLine className="w-6 h-6" aria-hidden="true" />
        </button>
      ))}
      {error && <div role="alert" data-testid="status-letter-help-error" onPointerDown={stop}
        className="absolute left-3 right-3 top-3 rounded-xl px-3 py-2 text-sm font-bold" style={{ zIndex: 6, background: 'hsl(0 70% 96%)', color: 'hsl(0 60% 34%)', border: '1px solid hsl(0 55% 80%)' }}>
        {error}</div>}
      {open && <HelpDialog key={open.id} rule={open} returnFocus={returnRef.current} waypoints={waypoints} onClose={() => setOpen(null)} />}
    </>
  );
}
