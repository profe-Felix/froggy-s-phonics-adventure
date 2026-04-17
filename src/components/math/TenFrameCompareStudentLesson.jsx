import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { base44 } from '@/api/base44Client';

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
    // force reset immediately when round changes
    setSelected(null)
    setRevealed(false)

    // safety: ensure unlock even if React batches updates
    const t = setTimeout(() => {
      setSelected(null)
      setRevealed(false)
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

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            textAlign: 'center',
            fontSize: 40,
            fontWeight: 900,
            color: '#166534',
            marginBottom: 8,
          }}
        >
          Compare My Number
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 24,
            color: '#374151',
            marginBottom: 10,
            fontWeight: 700,
          }}
        >
          Student {chosenStudent}
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 24,
            color: '#374151',
            marginBottom: 18,
            fontWeight: 700,
          }}
        >
          My number is greater than, less than, or equal to the teacher&apos;s number.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <BigChoiceButton
            label="Greater"
            symbol=">"
            selected={selected === 'greater'}
            disabled={answerLocked}
            onClick={() => {
              if (answerLocked) return
              setSelected('greater')
              setRevealed(true)
            }}
          />
          <BigChoiceButton
            label="Less"
            symbol="<"
            selected={selected === 'less'}
            disabled={answerLocked}
            onClick={() => {
              if (answerLocked) return
              setSelected('less')
              setRevealed(true)
            }}
          />
          <BigChoiceButton
            label="Equal"
            symbol="="
            selected={selected === 'equal'}
            disabled={answerLocked}
            onClick={() => {
              if (answerLocked) return
              setSelected('equal')
              setRevealed(true)
            }}
          />
        </div>

        {revealed && selected && (
          <div
            style={{
              maxWidth: 760,
              margin: '0 auto',
              background: '#ffffff',
              borderRadius: 24,
              padding: 20,
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                color: selected === correct ? '#16a34a' : '#dc2626',
                marginBottom: 10,
              }}
            >
              {selected === correct ? 'Correct!' : 'Not this round'}
            </div>

            <div
              style={{
                fontSize: 22,
                color: '#374151',
                fontWeight: 700,
              }}
            >
              Wait for the teacher to start a new round.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
