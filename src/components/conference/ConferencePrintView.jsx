import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { minutesToTime, formatLongDate } from '@/lib/conferenceUtils';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Printer, ArrowLeft } from 'lucide-react';

// Strip accents so "Chávez" matches "Chavez" and "Díaz" matches "Diaz".
const stripAccents = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Tokenize a name for fuzzy matching: lowercase, strip accents + punctuation,
// drop single-character tokens (middle initials like "D.") and the word
// "and" (parents sometimes book two kids in one slot). Returns the set of
// real name tokens, e.g. "Isaac D. Chávez Rivas" -> ["isaac","chavez","rivas"].
const nameTokens = (s) =>
  stripAccents((s || '').toLowerCase())
    .replace(/[.,'`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1 && t !== 'and');

// Printable conference confirmations + a "not signed up yet" roster list.
// Booked slots are matched to roster students by name; confirmations are
// grouped by the matched student's teacher (class_name). Unmatched bookings
// fall into an "unidentified" group so the teacher can place them by hand.
export default function ConferencePrintView({ conference, slots, onBack }) {
  // Toggle the print-only body class so window.print() shows just this view.
  useEffect(() => {
    document.body.classList.add('conf-printing');
    return () => document.body.classList.remove('conf-printing');
  }, []);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['conf-print-roster', conference.class_name],
    queryFn: () =>
      conference.class_name
        ? base44.entities.Student.filter(
            { class_name: conference.class_name, school_year: ACTIVE_SCHOOL_YEAR },
            'student_number',
            500
          )
        : base44.entities.Student.filter(
            { school_year: ACTIVE_SCHOOL_YEAR },
            'student_number',
            500
          ),
  });

  const { booked, groups, notSignedByClass, unmatchedCount } = useMemo(() => {
    const booked = slots.filter((s) => s.status === 'booked');

    // Scope the roster to this conference's teachers. teacher_name may be a
    // single teacher or a comma-separated list (e.g. "Felix, Valero,
    // Gutierrez"); class_name, when set, is a single class. Students in
    // other classes are excluded from matching and from the "not signed up"
    // list.
    const teacherSet = conference.class_name
      ? new Set([conference.class_name.trim()])
      : new Set(
          (conference.teacher_name || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        );
    const roster = teacherSet.size
      ? students.filter((st) => teacherSet.has(st.class_name))
      : students;

    const rosterTokens = roster
      .filter((st) => st.name)
      .map((st) => ({ st, tokens: nameTokens(st.name) }))
      .filter((r) => r.tokens.length >= 2);

    // Match a booking to a roster student when one name's tokens are a
    // subset of the other's (handles middle initials / extra tokens), needing
    // at least 2 real tokens. If two roster students match equally well, leave
    // it unmatched rather than guessing.
    const matchStudent = (slot) => {
      const stTokens = nameTokens(slot.student_name);
      if (stTokens.length < 2) return null;
      let best = null;
      let bestScore = 0;
      let tie = false;
      for (const r of rosterTokens) {
        const a = r.tokens;
        const b = stTokens;
        const subset = a.every((t) => b.includes(t)) || b.every((t) => a.includes(t));
        if (!subset) continue;
        const score = Math.min(a.length, b.length);
        if (score > bestScore) { best = r.st; bestScore = score; tie = false; }
        else if (score === bestScore) { tie = true; }
      }
      return tie ? null : best;
    };

    const matchedIds = new Set();
    const groups = {}; // teacher key -> { label, slots: [{slot, student}] }
    for (const slot of booked) {
      const st = matchStudent(slot);
      let key, label;
      if (st) {
        key = st.class_name || '__unmatched__';
        label = st.class_name || 'Sin clase';
        matchedIds.add(st.id);
      } else {
        key = '__unmatched__';
        label = 'No identificado';
      }
      (groups[key] ||= { label, slots: [] }).slots.push({ slot, student: st });
    }

    // "Not signed up" = scoped roster students with no matched booking.
    // Students without a roster name can't be matched by name, so they're
    // listed too (the teacher recognizes them by number).
    const notSigned = roster.filter((st) => !matchedIds.has(st.id));
    const notSignedByClass = {};
    for (const st of notSigned) {
      const c = st.class_name || 'Sin clase';
      (notSignedByClass[c] ||= []).push(st);
    }

    const unmatchedCount = (groups['__unmatched__']?.slots.length) || 0;
    return { booked, groups, notSignedByClass, unmatchedCount };
  }, [slots, students, conference.class_name, conference.teacher_name]);

  const groupKeys = useMemo(
    () =>
      Object.keys(groups)
        .sort((a, b) => (a === '__unmatched__' ? 1 : b === '__unmatched__' ? -1 : a.localeCompare(b))),
    [groups]
  );
  const classKeys = useMemo(
    () => Object.keys(notSignedByClass).sort((a, b) => a.localeCompare(b)),
    [notSignedByClass]
  );

  const bookedCount = booked.length;

  return (
    <div className="fixed inset-0 bg-slate-100 z-50 overflow-auto">
      {/* Toolbar */}
      <div className="conf-no-print sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 shadow-sm z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-bold text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-sm font-bold text-slate-600 hidden sm:block">
          {bookedCount} confirmation{bookedCount === 1 ? '' : 's'}
          {unmatchedCount > 0 && <span className="text-amber-600"> · {unmatchedCount} unmatched</span>}
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm active:scale-95 transition"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      {/* Printable content */}
      <div className="conf-printable px-4 py-6 flex flex-col items-center gap-6">
        {isLoading ? (
          <div className="text-slate-400 py-8">Loading roster…</div>
        ) : bookedCount === 0 ? (
          <div className="text-slate-400 py-8 text-center">
            No booked slots yet — there's nothing to print.
          </div>
        ) : (
          <>
            {groupKeys.map((key) => {
              const g = groups[key];
              return (
                <div key={key} className="w-full flex flex-col items-center gap-3">
                  <div className="conf-group-title w-full max-w-[8.5in]">
                    <h2 className="text-lg font-black text-slate-800 border-b-2 border-indigo-300 pb-1">
                      Maestro: {g.label}
                    </h2>
                  </div>
                  {g.slots.map(({ slot, student }) => {
                    const teacherLabel = student?.class_name || (key === '__unmatched__' ? 'No identificado' : g.label);
                    return (
                      <div key={slot.id} className="conf-card rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-center mb-2">
                          <h3 className="text-2xl font-black text-slate-800">{conference.title}</h3>
                          <p className="text-sm font-bold text-indigo-600 tracking-wide uppercase">Confirmación de Conferencia</p>
                        </div>
                        <p className="text-lg text-slate-700 mb-2">
                          Gracias por programar una cita para nuestra conferencia.
                        </p>
                        <p className="text-lg text-slate-700 mb-2">
                          Recuerde que escogió la fecha{' '}
                          <strong className="text-indigo-700">{formatLongDate(slot.date, 'es')}</strong>{' '}
                          a las <strong className="text-indigo-700">{minutesToTime(slot.start_minutes)}</strong>.
                        </p>
                        <p className="text-base text-slate-600 mb-3">
                          Por favor llegue a tiempo, ya que solo duran {slot.duration_min || 15} minutos y a veces tenemos una tras otra.
                        </p>
                        <div className="border-t border-slate-200 pt-2 text-sm text-slate-700 flex flex-wrap gap-x-5 gap-y-1">
                          <span><strong>Estudiante:</strong> {slot.student_name || '—'}</span>
                          <span><strong>Padre/Madre:</strong> {slot.parent_name || '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Not-signed-up roster list — starts on a fresh page */}
            <div className="conf-newpage w-full flex flex-col items-center">
              <div className="w-full max-w-[8.5in]">
                <h2 className="text-2xl font-black text-slate-800 mb-1">Aún no han programado su cita</h2>
                <p className="text-sm text-slate-500 mb-4">
                  {conference.title} · {conference.teacher_name}{conference.class_name ? ` · ${conference.class_name}` : ''}
                </p>
                {classKeys.length === 0 ? (
                  <p className="text-slate-400">Todos los estudiantes han programado su cita. 🎉</p>
                ) : (
                  classKeys.map((cls) => {
                    const sts = notSignedByClass[cls].slice().sort((a, b) => (a.student_number || 0) - (b.student_number || 0));
                    return (
                      <div key={cls} className="mb-5 break-inside-avoid">
                        <h3 className="font-black text-slate-700 border-b border-slate-300 pb-1 mb-2">
                          Maestro: {cls} <span className="text-slate-400 font-bold">({sts.length})</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700">
                          {sts.map((st) => (
                            <div key={st.id} className="flex gap-2">
                              <span className="text-slate-400 font-bold w-7 shrink-0">{st.student_number}.</span>
                              <span>{st.name || <span className="text-slate-400 italic">(sin nombre)</span>}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}