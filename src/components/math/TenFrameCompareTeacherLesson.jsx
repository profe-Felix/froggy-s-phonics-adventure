import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import base44 from '../../api/base44Client'

const DEFAULT_CLASS = 'A'

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
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
  const rows = await base44.entities.TenFrameCompareLesson.filter({
    class_name: className,
  })
  const row = Array.isArray(rows) ? rows[0] : null
  return normalizeLesson(className, row)
}

async function saveLesson(className, lesson) {
  const rows = await base44.entities.TenFrameCompareLesson.filter({
    class_name: className,
  })

  const existing = Array.isArray(rows) ? rows[0] : null

  const payload = {
    class_name: className,
    status: lesson.status,
    teacher_number: lesson.teacherNumber,
    teacher_display: lesson.teacherDisplay,
    round_number: lesson.roundNumber,
    round_seed: lesson.roundSeed,
    updated_at: lesson.updatedAt,
  }

  if (existing?.id) {
    await base44.entities.TenFrameCompareLesson.update(existing.id, payload)
  } else {
    await base44.entities.TenFrameCompareLesson.create(payload)
  }
}

function makeNextLesson(className, previous) {
  return {
    className,
    status: 'active',
    teacherNumber: randInt(0, 20),
    teacherDisplay: pickOne(['tenframe', 'numeral']),
    roundNumber: (previous?.roundNumber || 0) + 1,
    roundSeed: randInt(1, 1000000000),
    updatedAt: Date.now(),
  }
}

export default function TenFrameCompareTeacherLesson({ className = DEFAULT_CLASS, onBack }) {
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
    refetch,
    isLoading,
  } = useQuery({
    queryKey: ['ten-frame-compare-lesson', className],
    queryFn: () => fetchLesson(className),
    refetchInterval: 2000,
  })

  async function startNewRound() {
    const current = await fetchLesson(className)
    const next = makeNextLesson(className, current)
    await saveLesson(className, next)
    await refetch()
  }

  async function endLesson() {
    const current = await fetchLesson(className)
    const next = {
      ...current,
      status: 'waiting',
      updatedAt: Date.now(),
    }
    await saveLesson(className, next)
    await refetch()
  }

  const teacherLink =
    `https://profe-felix.github.io/student-work/#/ws/ten-frame-compare` +
    `?role=teacher&class=${encodeURIComponent(className)}`

  const studentLink =
    `https://profe-felix.github.io/student-work/#/ws/ten-frame-compare` +
    `?role=student&class=${encodeURIComponent(className)}`

  const seedBase = useMemo(() => {
    return hashString(
      `teacher-${lesson.teacherNumber ?? 0}-${lesson.roundNumber}-${lesson.roundSeed}`
    )
  }, [lesson.teacherNumber, lesson.roundNumber, lesson.roundSeed])

    if (isLoading) {
      return (
        <div style={{ padding: 24, textAlign: 'center', fontWeight: 800 }}>
          Loading…
        </div>
      )
    }
  
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #ede9fe 0%, #dbeafe 50%, #dcfce7 100%)',
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
  
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <button
            onClick={startNewRound}
            style={{
              border: 0,
              borderRadius: 16,
              padding: '14px 22px',
              fontWeight: 900,
              fontSize: 18,
              background: '#16a34a',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Start New Round
          </button>

          <button
            onClick={endLesson}
            style={{
              border: 0,
              borderRadius: 16,
              padding: '14px 22px',
              fontWeight: 900,
              fontSize: 18,
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            End Lesson
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(studentLink)}
            style={{
              border: 0,
              borderRadius: 16,
              padding: '14px 22px',
              fontWeight: 900,
              fontSize: 18,
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Copy Student Link
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(teacherLink)}
            style={{
              border: 0,
              borderRadius: 16,
              padding: '14px 22px',
              fontWeight: 900,
              fontSize: 18,
              background: '#7c3aed',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Copy Teacher Link
          </button>
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 38,
            fontWeight: 900,
            color: '#166534',
            marginBottom: 8,
          }}
        >
          Ten Frame Compare — Teacher
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 20,
            color: '#374151',
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          Class {className}
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 20,
            color: '#374151',
            marginBottom: 18,
            fontWeight: 700,
          }}
        >
          Project your number. Students compare theirs to yours.
        </div>

        {lesson.status === 'active' && lesson.teacherNumber !== null ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RepresentationCard
              value={lesson.teacherNumber}
              title="Teacher Number"
              display={lesson.teacherDisplay}
              seedBase={seedBase}
            />
          </div>
        ) : (
          <div
            style={{
              margin: '0 auto',
              maxWidth: 700,
              background: '#ffffff',
              borderRadius: 22,
              padding: 24,
              boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
              textAlign: 'center',
              fontSize: 28,
              fontWeight: 900,
              color: '#374151',
            }}
          >
            Waiting to start…
          </div>
        )}
      </div>
    </div>
  )
}
