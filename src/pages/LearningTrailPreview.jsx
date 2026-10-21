import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, ExternalLink, Users, X } from 'lucide-react';
import useAdventureMap from '@/hooks/useAdventureMap';
import LearningAdventureMap from '@/components/adventure/LearningAdventureMap';
import '@/components/adventure/adventure-map.css';

function useModal(boxRef, onClose, busy) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const box = boxRef.current;
    const items = () => [...box.querySelectorAll('button,a[href],select,input,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); if (!busyRef.current) closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = items(); if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (prev && prev.isConnected) prev.focus({ preventScroll: true }); };
  }, [boxRef]);
  return () => { if (!busyRef.current) closeRef.current(); };
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CLASSES = ['Felix', 'Valero', 'Gutierrez', 'Campos', 'Aguirre', 'Jimenez', 'Mendez', 'Schwarz'];

function StudentDialog({ onClose, onChoose, onDemo, busy, isDemo }) {
  const [cls, setCls] = useState(CLASSES[0]);
  const [num, setNum] = useState('1');
  const first = useRef(null), box = useRef(null);
  const dismiss = useModal(box, onClose, busy);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="adv-dialog-back" onClick={dismiss}>
      <div ref={box} className="adv-dialog" role="dialog" aria-modal="true" aria-labelledby="adv-stu-t" onClick={e => e.stopPropagation()} data-testid="student-chooser">
        <h2 id="adv-stu-t">Who is exploring?</h2>
        <p style={{ marginTop: 0 }}>Pick the class and student number. No password needed.</p>
        <label className="adv-field">Class
          <select ref={first} value={cls} onChange={e => setCls(e.target.value)} data-testid="select-class">{CLASSES.map(c => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="adv-field">Student number
          <select value={num} onChange={e => setNum(e.target.value)} data-testid="select-number">{Array.from({ length: 30 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>
        </label>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="adv-btn" disabled={busy} onClick={() => { onChoose({ className: cls, number: Number(num) }); onClose(); }} data-testid="button-choose-student">{busy ? 'Finding…' : 'Open my trail'}</button>
          {!isDemo && <button className="adv-btn ghost" disabled={busy} onClick={() => { onDemo(); onClose(); }} data-testid="button-use-demo">Use demo</button>}
          <button className="adv-btn ghost" disabled={busy} onClick={dismiss} data-testid="button-close-chooser">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LevelDialog({ sel, isDemo, busy, error, onClose, onComplete }) {
  const { level, completed } = sel;
  const req = level.requirement || {};
  const ref = useRef(null), box = useRef(null);
  const dismiss = useModal(box, onClose, busy);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="adv-dialog-back" onClick={dismiss}>
      <div ref={box} className="adv-dialog" role="dialog" aria-modal="true" aria-labelledby="adv-lvl-t" onClick={e => e.stopPropagation()} data-testid="level-dialog">
        <p style={{ margin: 0, fontWeight: 700, color: completed ? '#1d7a3f' : '#9a6b00' }}>Level {level.number} · {completed ? 'Completed' : 'Your next stop'}</p>
        <h2 id="adv-lvl-t">{level.title}</h2>
        {level.description && <p>{level.description}</p>}
        {!completed && req.type === 'preview_confirmation' && <p style={{ background: '#fffbea', borderRadius: 12, padding: '.5rem .7rem' }}>This is a test practice stop for the trail preview. Confirm when the practice is finished.</p>}
        {!completed && req.type === 'lesson_completion' && <p style={{ background: '#eef8e6', borderRadius: 12, padding: '.5rem .7rem' }}>{req.label || 'Finish the lesson'}, then check completion. The classroom server verifies it.</p>}
        {isDemo && !completed && <p className="adv-demo" style={{ display: 'inline-block' }}>Demo • not saved</p>}
        {error && <p role="alert" style={{ color: '#a33' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
          {level.destination && <a className="adv-btn gold" href={level.destination} target="_blank" rel="noopener noreferrer" data-testid="link-open-activity"><ExternalLink size={18} /> {completed ? 'Revisit activity' : 'Open activity'}</a>}
          {!completed && <button className="adv-btn" disabled={busy} onClick={onComplete} data-testid="button-complete-level">{busy ? 'Saving…' : req.type === 'lesson_completion' ? 'Check completion' : 'I finished this practice'}</button>}
          <button ref={ref} className="adv-btn ghost" disabled={busy} onClick={dismiss} data-testid="button-close-level">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function LearningTrailPreview() {
  const a = useAdventureMap();
  const { map, student, progress, isDemo, busy, error, selectedLevel } = a;
  const [chooser, setChooser] = useState(false);
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(140);
  useEffect(() => { const el = headerRef.current; if (!el) return; const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight)); ro.observe(el); return () => ro.disconnect(); }, []);

  const settled = map && !busy;
  const scrollKey = settled ? `${student?.id || 'demo'}:${progress.completedCount}` : null;
  const back = student ? `/LetterGame?studentId=${encodeURIComponent(student.id)}` : '/TeacherView';
  const locate = () => {
    const btn = document.querySelector(`[data-testid="map-level-${progress.currentLevel || 200}"]`);
    btn?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    btn?.focus({ preventScroll: true });
  };
  const goSection = s => {
    const el = document.querySelector(`[data-testid="map-level-${(s - 1) * 20 + 1}"]`);
    if (el) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - headerH - 24), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const curSection = progress.currentLevel ? Math.ceil(progress.currentLevel / 20) : 11;

  return (
    <div className="adv-root" data-testid="learning-trail-preview">
      <header className="adv-header" ref={headerRef}>
        <div className="adv-header-row">
          <a className="adv-chip" href={back} data-testid="link-back"><ArrowLeft size={16} /> Back</a>
          <h1 className="adv-title">{map?.title || 'Learning trail'}</h1>
          <span data-testid="text-student" style={{ fontWeight: 700 }}>{student ? `${String(student.displayName || 'Student')} · ${student.className}` : null}</span>
          {isDemo && <span className="adv-demo" data-testid="status-demo">Demo • not saved</span>}
          <span data-testid="text-progress" style={{ fontSize: '.9rem' }}>{progress.completedCount}/200</span>
          <button className="adv-chip gold" onClick={locate} disabled={!map} data-testid="button-locate-current"><Crosshair size={16} /> {progress.currentLevel ? `Stop ${progress.currentLevel}` : 'End'}</button>
          <button className="adv-chip green" onClick={() => setChooser(true)} disabled={busy} data-testid="button-open-chooser"><Users size={16} /> {student ? 'Switch' : 'Choose student'}</button>
        </div>
        <p className="adv-notice">Separate test preview. The current classroom pathway is unchanged.</p>
        {map && <nav className="adv-sections" aria-label="Trail sections">
          {map.sections.map((s, i) => <button key={i} className={`adv-sec ${i + 1 < curSection ? 'done' : i + 1 === curSection ? 'here' : ''}`} onClick={() => goSection(i + 1)} data-testid={`button-section-${i + 1}`}>{i + 1}. {s}</button>)}
        </nav>}
      </header>

      {error && !selectedLevel && <div className="adv-error" role="alert" data-testid="status-error">
        <span style={{ flex: 1 }}>{error}</span>
        <button className="adv-btn" onClick={a.retry} data-testid="button-retry">Try again</button>
      </div>}
      {!map && busy && <div className="adv-skel" aria-label="Loading trail">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>}
      {map && progress.completedCount >= 200 && <div className="adv-done" data-testid="status-all-complete">All 200 stops complete. Every stop stays open to revisit.</div>}
      {map && <LearningAdventureMap map={map} progress={progress} disabled={busy} scrollKey={scrollKey} headerOffset={headerH} onOpen={a.openLevel} />}

      {chooser && <StudentDialog busy={busy} isDemo={isDemo} onClose={() => setChooser(false)} onChoose={a.chooseStudent} onDemo={a.useDemo} />}
      {selectedLevel && <LevelDialog sel={selectedLevel} isDemo={isDemo} busy={busy} error={error} onClose={a.closeLevel} onComplete={a.completeSelected} />}
    </div>
  );
}
