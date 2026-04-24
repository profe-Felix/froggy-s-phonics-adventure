import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { base44 } from '@/api/base44Client';
import SimpleWritingCanvas from './SimpleWritingCanvas';
import { motion } from 'framer-motion';

const DEFAULT_CLASS = 'A'

function compareStudentToTeacher(student, teacher) {
  if (student > teacher) return 'greater'
  if (student < teacher) return 'less'
  return 'equal'
}

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededInt(seedStr, min, max) {
  const rng = mulberry32(hashString(seedStr))
  return Math.floor(rng() * (max - min + 1)) + min
}

function seededPick(seedStr, arr) {
  const rng = mulberry32(hashString(seedStr))
  return arr[Math.floor(rng() * arr.length)]
}

function seededShuffle(arr, seed) {
  const a = [...arr]
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function normalizeLesson(className, row) {
  if (!row) {
    return {
      className,
      status: 'waiting',
      teacherNumber: null,
      teacherDisplay: 'tenframe',
      roundNumber: 0,
      roundSeed: 0,
      updatedAt: Date.now(),
    }
  }

  return {
    className,
    status: row.status === 'active' ? 'active' : 'waiting',
    teacherNumber:
      typeof row.teacher_number === 'number' &&
      row.teacher_number >= 0 &&
      row.teacher_number <= 20
        ? row.teacher_number
        : null,
    teacherDisplay: row.teacher_display === 'numeral' ? 'numeral' : 'tenframe',
    roundNumber: Number.isFinite(row.round_number) ? row.round_number : 0,
    roundSeed: Number.isFinite(row.round_seed) ? row.round_seed : 0,
    updatedAt: Number.isFinite(row.updated_at) ? row.updated_at : Date.now(),
  }
}

async function fetchLesson(className) {
  const rows = await base44.entities.RollCompareLesson.filter({
    class_name: className,
  })
  const row = Array.isArray(rows) ? rows[0] : null
  return normalizeLesson(className, row)
}

function computeStudentValue(teacher, roundSeed, roundNumber, studentKey) {
  const mode = seededPick(
    `${studentKey}-${teacher}-${roundSeed}-${roundNumber}-mode`,
    ['far', 'close', 'equal']
  )

  if (mode === 'equal') return teacher

  if (mode === 'far') {
    for (let tries = 0; tries < 25; tries++) {
      const candidate = seededInt(
        `${studentKey}-${teacher}-${roundSeed}-${roundNumber}-far-${tries}`,
        0,
        20
      )
      if (Math.abs(candidate - teacher) >= 4) return candidate
    }
    return teacher <= 10 ? Math.min(20, teacher + 5) : Math.max(0, teacher - 5)
  }

  const diff = seededPick(
    `${studentKey}-${teacher}-${roundSeed}-${roundNumber}-diff`,
    [1, 2, 3]
  )
  const direction = seededPick(
    `${studentKey}-${teacher}-${roundSeed}-${roundNumber}-dir`,
    ['up', 'down']
  )

  let candidate =
    direction === 'up'
      ? Math.min(20, teacher + diff)
      : Math.max(0, teacher - diff)

  if (candidate === teacher) {
    candidate = teacher < 20 ? teacher + 1 : teacher - 1
  }

  return candidate
}

function Frame10({ value, seed }) {
  const positions = Array.from({ length: 10 }, (_, i) => i)
  const shuffled = seededShuffle(positions, seed)
  const filledPositions = new Set(shuffled.slice(0, value))

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 8,
        border: '3px solid #1f2937',
        borderRadius: 12,
        padding: 8,
        background: '#ffffff',
      }}
    >
      {positions.map((i) => {
        const filled = filledPositions.has(i)
        return (
          <div
            key={i}
            style={{
              width: 42,
              height: 42,
              border: '2px solid #9ca3af',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              boxSizing: 'border-box',
            }}
          >
            {filled ? (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '999px',
                  background: '#111827',
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function DoubleTenFrame({ value, title, seedBase }) {
  const top = Math.min(value, 10)
  const bottom = Math.max(0, value - 10)

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.9)',
        borderRadius: 28,
        padding: 20,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        minWidth: 300,
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          color: '#166534',
          textAlign: 'center',
        }}
      >
        {title}
      </div>

      <Frame10 value={top} seed={seedBase + 11} />
      <Frame10 value={bottom} seed={seedBase + 29} />
    </div>
  )
}

function NumeralCard({ value, title }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.9)',
        borderRadius: 28,
        padding: 24,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        minWidth: 300,
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          color: '#166534',
          textAlign: 'center',
        }}
      >
        {title}
      </div>

      <div
        style={{
          minWidth: 180,
          minHeight: 180,
          borderRadius: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          border: '5px solid #334155',
          fontSize: 96,
          fontWeight: 900,
          color: '#1d4ed8',
          lineHeight: 1,
          padding: 16,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function RepresentationCard({ value, title, display, seedBase }) {
  if (display === 'numeral') {
    return <NumeralCard value={value} title={title} />
  }

  return <DoubleTenFrame value={value} title={title} seedBase={seedBase} />
}

const DIGITS_ROW = [1,2,3,4,5,6,7,8,9,null,0,'del'];

// Canvas + digit pad for entering My Number
function NumberEntry({ onConfirm }) {
  const [step, setStep] = useState('write'); // write | type
  const [drawnUrl, setDrawnUrl] = useState(null);
  const [typed, setTyped] = useState('');

  const handleCanvasDone = (_, url) => { setDrawnUrl(url); setStep('type'); setTyped(''); };
  const handleDigit = (d) => { if (typed.length < 2) setTyped(t => t + String(d)); };
  const handleUndo = () => setTyped(t => t.slice(0, -1));
  const handleSubmit = () => { if (typed) onConfirm(parseInt(typed)); };

  return (
    <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 16, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>
        {step === 'write' ? 'Write My Number' : 'Type the number you wrote'}
      </div>
      {step === 'write' && <SimpleWritingCanvas onDone={handleCanvasDone} />}
      {step === 'type' && (
        <>
          {drawnUrl && <img src={drawnUrl} alt="written" style={{ width: 120, height: 80, objectFit: 'contain', borderRadius: 10, border: '2px solid #c7d2fe', background: '#f8fbff' }} />}
          <div style={{ width: 64, height: 64, borderRadius: 16, border: typed ? '3px solid #6366f1' : '3px dashed #a5b4fc', background: typed ? '#eef2ff' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#4f46e5' }}>
            {typed || '?'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, width: '100%' }}>
            {DIGITS_ROW.map((d, i) => (
              <button key={i} onClick={() => { if (d === 'del') handleUndo(); else if (d !== null) handleDigit(d); }}
                disabled={d === null || (d !== 'del' && typed.length >= 2)}
                style={{ height: 38, borderRadius: 8, border: d === null ? 'none' : '1px solid #e2e8f0', background: d === 'del' ? '#fee2e2' : d === null ? 'transparent' : '#f1f5f9', color: d === 'del' ? '#dc2626' : '#334155', fontWeight: 700, fontSize: 14, cursor: d === null ? 'default' : 'pointer', opacity: d !== null && d !== 'del' && typed.length >= 2 ? 0.4 : 1 }}>
                {d === 'del' ? '⌫' : d === null ? '' : d}
              </button>
            ))}
          </div>
          <button onClick={handleSubmit} disabled={!typed}
            style={{ width: '100%', padding: '10px 0', background: typed ? '#4f46e5' : '#a5b4fc', color: 'white', border: 0, borderRadius: 12, fontWeight: 900, fontSize: 16, cursor: typed ? 'pointer' : 'default' }}>
            ✓ That's My Number
          </button>
        </>
      )}
    </div>
  );
}

// Drop zone for sentence
function DropZone({ filled, selected, onPlace, dropRef, isCorrect, submitted }) {
  let border = '3px dashed #cbd5e1', bg = '#f8fafc', color = '#94a3b8';
  if (filled && submitted) { border = `3px solid ${isCorrect ? '#22c55e' : '#ef4444'}`; bg = isCorrect ? '#dcfce7' : '#fee2e2'; color = isCorrect ? '#15803d' : '#b91c1c'; }
  else if (filled) { border = '3px solid #6366f1'; bg = '#eef2ff'; color = '#4338ca'; }
  else if (selected) { border = '3px solid #818cf8'; bg = '#eef2ff'; color = '#6366f1'; }
  return (
    <div ref={dropRef} onClick={() => { if (!filled && selected) onPlace(selected); }}
      style={{ minWidth: 130, height: 40, borderRadius: 12, border, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, cursor: (!filled && selected) ? 'pointer' : 'default', transition: 'all 0.15s', padding: '0 8px', textAlign: 'center' }}>
      {filled || (selected ? 'tap to place' : '—')}
    </div>
  );
}

function DragWord({ label, value, dropped, selected, onSelect, onDrop, dropRef }) {
  const handlePointerDown = (e) => {
    if (dropped) return;
    e.preventDefault();
    onSelect(value);
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:8px 14px;background:#4f46e5;color:white;font-weight:900;border-radius:12px;font-size:13px;white-space:nowrap;';
    clone.textContent = label; document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 18) + 'px'; };
    move(e.clientX, e.clientY);
    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 6 || Math.abs(cy - startY) > 6) moved = true;
      move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (!moved) { new Audio(`/audio/${value}.mp3`).play().catch(() => {}); }
      else if (dropRef?.current) {
        const rect = dropRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onDrop(value);
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };
  let style = { background: dropped ? '#e2e8f0' : selected ? '#eef2ff' : '#ffffff', color: dropped ? '#9ca3af' : selected ? '#4338ca' : '#374151', border: `2px solid ${dropped ? '#e2e8f0' : selected ? '#6366f1' : '#e2e8f0'}`, opacity: dropped ? 0.5 : 1, cursor: dropped ? 'not-allowed' : 'grab' };
  return (
    <div onPointerDown={handlePointerDown} style={{ ...style, padding: '8px 14px', borderRadius: 12, fontWeight: 700, fontSize: 14, userSelect: 'none', touchAction: 'none', transition: 'all 0.1s' }}>
      {label}
    </div>
  );
}

function playSequence(srcs) {
  Promise.all(srcs.map(src => fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b))))
    .then(urls => {
      let i = 0;
      const next = () => { if (i >= urls.length) return; const url = urls[i++]; const a = new Audio(url); a.onended = () => { URL.revokeObjectURL(url); next(); }; a.play().catch(next); };
      next();
    }).catch(() => {});
}

const LABEL_MAP_TF = { greater: 'is greater than', less: 'is less than', equal: 'is equal to' };
const AUDIO_MAP_TF = { greater: 'is_greater_than', less: 'is_less_than', equal: 'is_equal_to' };

// Complete the sentence UI for ten frame compare
function TenFrameSentence({ myNumber, otherNumber, otherLabel, correct, onCorrect, onWrong }) {
  const [placed, setPlaced] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [result, setResult] = useState(null);
  const dropRef = useRef(null);

  const handlePlace = (val) => {
    if (placed) return;
    setPlaced(LABEL_MAP_TF[val]);
    const isCorrect = val === correct;
    setResult(isCorrect ? 'correct' : 'wrong');
    playSequence([`/numbers-audio/${myNumber}.mp3`, `/audio/${AUDIO_MAP_TF[correct]}.mp3`, `/numbers-audio/${otherNumber}.mp3`]);
    if (isCorrect) onCorrect(); else onWrong();
  };

  const submitted = !!placed;

  return (
    <div style={{ background: '#ffffff', borderRadius: 20, padding: 16, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Complete the Sentence</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: 10, fontWeight: 900, fontSize: 22 }}>{myNumber}</span>
        <DropZone filled={placed} selected={selectedWord ? LABEL_MAP_TF[selectedWord] : null}
          onPlace={() => handlePlace(selectedWord)} dropRef={dropRef}
          isCorrect={result === 'correct'} submitted={submitted} />
        <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: 10, fontWeight: 900, fontSize: 22 }}>{otherNumber}</span>
      </div>
      {!submitted && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
          {['greater', 'less', 'equal'].map(v => (
            <DragWord key={v} label={LABEL_MAP_TF[v]} value={v} dropped={false} selected={selectedWord === v}
              onSelect={setSelectedWord} onDrop={(val) => { handlePlace(val); setSelectedWord(null); }} dropRef={dropRef} />
          ))}
        </div>
      )}
      {submitted && result === 'wrong' && (
        <div style={{ background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12, padding: '8px 12px', textAlign: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
            ✓ {myNumber} {LABEL_MAP_TF[correct]} {otherNumber}
          </span>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 8 }}>🔊 tap to hear • drag or tap to place</div>
    </div>
  );
}

function BigChoiceButton({ label, symbol, disabled, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: selected ? '5px solid #2563eb' : '4px solid #cbd5e1',
        background: selected ? '#dbeafe' : '#ffffff',
        color: '#1f2937',
        borderRadius: 28,
        padding: '20px 16px',
        minWidth: 180,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !selected ? 0.65 : 1,
        boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
        fontWeight: 900,
      }}
    >
      <div style={{ fontSize: 54, lineHeight: 1, marginBottom: 10 }}>{symbol}</div>
      <div style={{ fontSize: 26 }}>{label}</div>
    </button>
  )
}

export default function TenFrameCompareStudentLesson({
  className = DEFAULT_CLASS,
  studentNumber = '',
  onBack,
}) {
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  // canvas number entry phase: null | 'entry' | number
  const [myEnteredNumber, setMyEnteredNumber] = useState(null)
  const [sentencePhase, setSentencePhase] = useState(false)

  const chosenStudent = studentNumber ? String(studentNumber) : ''

  const {
    data: lesson = {
      className,
      status: 'waiting',
      teacherNumber: null,
      teacherDisplay: 'tenframe',
      roundNumber: 0,
      roundSeed: 0,
      updatedAt: Date.now(),
    },
  } = useQuery({
    queryKey: ['ten-frame-compare-lesson', className],
    queryFn: () => fetchLesson(className),
    refetchInterval: 2000,
  })

  const roundKey = `${lesson.roundNumber}-${lesson.roundSeed}-${lesson.teacherNumber}-${lesson.status}`

  useEffect(() => {
    setSelected(null)
    setRevealed(false)
    setMyEnteredNumber(null)
    setSentencePhase(false)
    const t = setTimeout(() => {
      setSelected(null)
      setRevealed(false)
      setMyEnteredNumber(null)
      setSentencePhase(false)
    }, 0)
    return () => clearTimeout(t)
  }, [roundKey])

  const teacherNumber =
    typeof lesson.teacherNumber === 'number' ? lesson.teacherNumber : null

  const studentKey = useMemo(() => {
    if (!chosenStudent) return ''
    return `student:${className}:${chosenStudent}`
  }, [className, chosenStudent])

  const studentValue = useMemo(() => {
    if (lesson.status !== 'active') return null
    if (teacherNumber === null) return null
    if (!studentKey) return null

    return computeStudentValue(
      teacherNumber,
      lesson.roundSeed,
      lesson.roundNumber,
      studentKey
    )
  }, [lesson.status, teacherNumber, lesson.roundSeed, lesson.roundNumber, studentKey])

  const studentDisplay = useMemo(() => {
    if (lesson.status !== 'active') return 'tenframe'
    if (!studentKey) return 'tenframe'
    return seededPick(
      `${studentKey}-${lesson.roundSeed}-${lesson.roundNumber}-display`,
      ['tenframe', 'numeral']
    )
  }, [lesson.status, studentKey, lesson.roundSeed, lesson.roundNumber])

  const correct =
    studentValue !== null && teacherNumber !== null
      ? compareStudentToTeacher(studentValue, teacherNumber)
      : null

  if (!chosenStudent) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: 24,
            fontSize: 24,
            fontWeight: 800,
            color: '#374151',
            boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
          }}
        >
          Waiting for student number…
        </div>
      </div>
    )
  }

  if (lesson.status !== 'active') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              marginBottom: 12,
              background: 'none',
              border: 'none',
              fontWeight: 800,
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        )}

        <div
          style={{
            maxWidth: 760,
            margin: '80px auto 0',
            background: '#ffffff',
            borderRadius: 24,
            padding: 24,
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              color: '#166534',
              marginBottom: 12,
            }}
          >
            Waiting for teacher…
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#374151',
            }}
          >
            Class {className}
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#64748b',
              marginTop: 8,
            }}
          >
            Student {chosenStudent}
          </div>
        </div>
      </div>
    )
  }

  if (teacherNumber === null || studentValue === null || correct === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: 24,
            fontSize: 24,
            fontWeight: 800,
            color: '#374151',
            boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
          }}
        >
          Loading round…
        </div>
      </div>
    )
  }

  const answerLocked = revealed && selected !== null

  return (
    <div
      key={roundKey}
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>← Back</button>
        )}
        <span style={{ fontWeight: 900, fontSize: 15, color: '#166534' }}>
          {streak >= 3 ? `🏆` : streak >= 2 ? `🔥${streak}` : ''} ⭐ {score}
        </span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', fontSize: 36, fontWeight: 900, color: '#166534', marginBottom: 6 }}>Compare My Number</div>
        <div style={{ textAlign: 'center', fontSize: 20, color: '#374151', marginBottom: 16, fontWeight: 700 }}>
          Student {chosenStudent}
        </div>

        {/* Ten frames side by side */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <RepresentationCard
            value={studentValue}
            title="My Number"
            display={studentDisplay}
            seedBase={hashString(`student-${studentValue}-${lesson.roundNumber}-${lesson.roundSeed}`)}
          />
          <RepresentationCard
            value={teacherNumber}
            title="Teacher Number"
            display={lesson.teacherDisplay}
            seedBase={hashString(`teacher-${teacherNumber}-${lesson.roundNumber}-${lesson.roundSeed}`)}
          />
        </div>

        {/* Step 1: canvas number entry */}
        {myEnteredNumber === null && !sentencePhase && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <NumberEntry onConfirm={(n) => { setMyEnteredNumber(n); setSentencePhase(true); }} />
          </motion.div>
        )}

        {/* Step 2: complete the sentence */}
        {sentencePhase && !revealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 20 }}>
            <TenFrameSentence
              myNumber={studentValue}
              otherNumber={teacherNumber}
              otherLabel="teacher"
              correct={correct}
              onCorrect={() => { setRevealed(true); setSelected(correct); setScore(s => s + 1); setStreak(s => s + 1); }}
              onWrong={() => { setRevealed(true); setSelected('wrong'); setStreak(0); }}
            />
          </motion.div>
        )}

        {/* Result: wait for teacher */}
        {revealed && (
          <div style={{ maxWidth: 760, margin: '0 auto', background: '#ffffff', borderRadius: 24, padding: 20, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.10)' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: selected === correct ? '#16a34a' : '#dc2626', marginBottom: 10 }}>
              {selected === correct ? `🎉 Correct! +1 ⭐` : '❌ Not this round'}
            </div>
            <div style={{ fontSize: 20, color: '#374151', fontWeight: 700 }}>Wait for the teacher to start a new round.</div>
          </div>
        )}
      </div>
    </div>
  )
}