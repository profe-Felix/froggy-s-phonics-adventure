import React, { useEffect, useMemo, useRef } from 'react';
import { Check, Lock } from 'lucide-react';
import { adventureGeometry, levelState } from '@/lib/adventure/model.mjs';
import './adventure-map.css';

const EXTRA = 120; // room below last milestone

function Scenery({ height }) {
  const items = [];
  for (let y = 200; y < height; y += 260) {
    const left = (y / 260) % 2 < 1;
    const x = left ? 40 + (y % 50) : 560 + (y % 40);
    if ((y / 260) % 3 < 1) {
      items.push(<g key={y} transform={`translate(${x} ${y})`} opacity=".55"><rect x="-4" y="0" width="8" height="26" fill="#8a6d3b" /><circle r="22" cy="-6" fill="#7cc576" /><circle r="14" cx="-14" cy="6" fill="#93d18a" /></g>);
    } else if ((y / 260) % 3 < 2) {
      items.push(<g key={y} transform={`translate(${x} ${y})`} opacity=".6"><circle r="5" fill="#f28fb0" /><circle r="5" cx="14" cy="8" fill="#ffd25e" /><circle r="5" cx="-10" cy="12" fill="#9bc7f5" /></g>);
    } else {
      items.push(<ellipse key={y} cx={x} cy={y} rx="38" ry="14" fill="#c4e3b0" opacity=".7" />);
    }
  }
  return <g>{items}</g>;
}

export default function LearningAdventureMap({ map, progress, onOpen, disabled, scrollKey, headerOffset = 140 }) {
  const geo = useMemo(() => adventureGeometry(200), []);
  const height = geo.height + EXTRA;
  const pct = x => `${(x / 640) * 100}%`;
  const current = progress?.currentLevel;
  const lastScrolled = useRef(null);
  useEffect(() => {
    if (!map || scrollKey == null || lastScrolled.current === scrollKey) return;
    const target = current || 200;
    const btn = document.querySelector(`[data-testid="map-level-${target}"]`);
    if (!btn) return;
    const first = lastScrolled.current === null;
    lastScrolled.current = scrollKey;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      const r = btn.getBoundingClientRect();
      const top = window.scrollY + r.top - headerOffset - (window.innerHeight - headerOffset) / 2 + r.height / 2;
      window.scrollTo({ top: Math.max(0, top), behavior: first || reduce ? 'auto' : 'smooth' });
    });
  }, [map, scrollKey, current, headerOffset]);

  const doneLen = progress?.completedCount || 0;
  return (
    <div className="adv-map-wrap" style={{ height }}>
      <div className="adv-map" style={{ height }}>
        <svg width="100%" height={height} viewBox={`0 0 640 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <Scenery height={height} />
          <path d={geo.path} fill="none" stroke="#b9a676" strokeWidth="30" vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity=".35" />
          <path d={geo.path} fill="none" stroke="#f3e6c0" strokeWidth="22" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          <path d={geo.path} fill="none" stroke="#fff" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeDasharray="2 14" strokeLinecap="round" opacity=".9" />
        </svg>
        {geo.milestones.map(m => (
          <div key={m.section} id={`adv-section-${m.section}`} className="adv-mile" style={{ left: pct(m.x), top: m.y }} data-testid={`milestone-${m.section}`}>
            {map.sections?.[m.section - 1] || `Section ${m.section}`}
            <small>{doneLen >= m.section * 20 ? 'Section complete' : `Stops ${(m.section - 1) * 20 + 1}–${m.section * 20}`}</small>
          </div>
        ))}
        {geo.points.map(p => {
          const lvl = map.levels[p.number - 1];
          const state = levelState(p.number, progress);
          const label = `Level ${p.number}${lvl?.title ? `: ${lvl.title}` : ''}, ${state === 'current' ? 'current stop' : state}`;
          return (
            <button key={p.number} type="button" className={`adv-stop ${state}`} style={{ left: pct(p.x), top: p.y }}
              aria-label={label} disabled={state === 'locked' || disabled} aria-current={state === 'current' ? 'step' : undefined}
              data-testid={`map-level-${p.number}`} data-state={state} onClick={() => onOpen(p.number)}>
              {state === 'current' && <span className="adv-ring" />}
              {p.number}
              {state === 'completed' && <span className="adv-badge"><Check size={16} strokeWidth={3.5} /></span>}
              {state === 'locked' && <span className="adv-badge"><Lock size={13} /></span>}
              {state === 'current' && <span className="adv-here">Estás aquí</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
