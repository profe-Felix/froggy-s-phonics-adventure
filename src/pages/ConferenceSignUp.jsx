import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { minutesToTime, formatLongDate } from '@/lib/conferenceUtils';
import BookingConfirmation from '@/components/conference/BookingConfirmation';

const TEXT = {
  es: {
    missingCode:
      'Falta el código de la conferencia.',
    closed:
      'Esta conferencia está cerrada o el enlace no es válido.',
    loading: 'Cargando…',
    withTeacher: (name) =>
      name ? `Con ${name}` : '',
    timeTaken:
      'Lo sentimos, alguien acaba de reservar ese horario. Seleccione otro horario.',
    error:
      'Ocurrió un problema',
    allTaken:
      'Todos los horarios están reservados. Vuelva a revisar más tarde.',
    selectedTime:
      'Horario seleccionado',
    change:
      'Cambiar',
    parentName:
      'Nombre del padre, madre o tutor',
    studentName:
      'Nombre del estudiante',
    phone:
      'Teléfono (opcional)',
    booking:
      'Reservando…',
    confirm:
      'Confirmar cita',
  },

  en: {
    missingCode:
      'Missing conference code.',
    closed:
      'This conference is closed or the link is invalid.',
    loading:
      'Loading…',
    withTeacher: (name) =>
      name ? `With ${name}` : '',
    timeTaken:
      'Sorry, that time was just taken. Please pick another.',
    error:
      'Something went wrong',
    allTaken:
      'All time slots are taken. Please check back later.',
    selectedTime:
      'Selected time',
    change:
      'Change',
    parentName:
      'Parent or guardian name',
    studentName:
      'Student name',
    phone:
      'Phone (optional)',
    booking:
      'Booking…',
    confirm:
      'Confirm appointment',
  },
};

export default function ConferenceSignUp() {
  const code = useMemo(
    () =>
      new URLSearchParams(
        window.location.search
      ).get('c'),
    []
  );

  const [language, setLanguage] =
    useState('es');

  const t = TEXT[language];

  const [selectedSlot, setSelectedSlot] =
    useState(null);
  const [form, setForm] = useState({ parent_name: '', student_name: '', parent_phone: '' });
  const [booking, setBooking] = useState(null);

  const { data: conference } = useQuery({
    queryKey: ['conference', code],
    queryFn: async () => {
      const res = await base44.entities.Conference.filter({ code, active: true }, '-created_date', 5);
      return res[0] || null;
    },
    enabled: !!code,
  });

  const { data: slots = [], refetch } = useQuery({
    queryKey: ['conference-slots-public', code],
    queryFn: async () => base44.entities.ConferenceSlot.filter({ conference_code: code, status: 'open' }, '-created_date', 500),
    enabled: !!code,
  });

  // Live: refresh open slots whenever any slot changes so a just-booked
  // time disappears for other parents viewing at the same time.
  useEffect(() => {
    if (!code) return;
    const unsub = base44.entities.ConferenceSlot.subscribe(() => { refetch(); });
    return unsub;
  }, [code, refetch]);

  const sorted = useMemo(() =>
    [...slots].sort((a, b) => a.date === b.date ? a.start_minutes - b.start_minutes : a.date.localeCompare(b.date)),
    [slots]);
  const byDate = useMemo(() => {
    const map = {};
    sorted.forEach((s) => { (map[s.date] ||= []).push(s); });
    return map;
  }, [sorted]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedSlot || !form.parent_name.trim() || !form.student_name.trim()) return;
    setBooking({ status: 'loading' });
    try {
      const res = await base44.functions.invoke('bookConferenceSlot', {
        slot_id: selectedSlot.id,
        parent_name: form.parent_name.trim(),
        student_name: form.student_name.trim(),
        parent_phone: form.parent_phone.trim(),
      });
      const data = res.data || res;
      if (data.success) {
        setBooking({ status: 'success', slot: data.slot, conference });
      } else {
        setBooking({ status: 'taken' });
        setSelectedSlot(null);
        refetch();
      }
    } catch (err) {
      setBooking({ status: 'error', message: err.message });
    }
  };

  if (!code) {
    return (
      <Shell>
        {t.missingCode}
      </Shell>
    );
  }

  if (conference === null) {
    return (
      <Shell>
        {t.closed}
      </Shell>
    );
  }
  if (booking?.status === 'success') {
    return (
      <Shell>
        <BookingConfirmation
          slot={booking.slot}
          conference={booking.conference}
          onRestart={() => { setBooking(null); setForm({ parent_name: '', student_name: '', parent_phone: '' }); refetch(); }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() =>
              setLanguage('es')
            }
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              language === 'es'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Español
          </button>

          <button
            type="button"
            onClick={() =>
              setLanguage('en')
            }
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              language === 'en'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            English
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-800">
        {conference?.title || t.loading}
      </h1>

      <p className="text-slate-500 mb-5">
        {t.withTeacher(
          conference?.teacher_name
        )}
      </p>

      {booking?.status === 'taken' && (
        <p className="bg-amber-50 text-amber-700 rounded-lg p-3 mb-4 text-sm">
          {t.timeTaken}
        </p>
      )}

      {booking?.status === 'error' && (
        <p className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {t.error}: {booking.message}
        </p>
      )}

      {!selectedSlot ? (
        <div className="space-y-5">
          {Object.keys(byDate).length === 0 ? (
            <p className="text-slate-400 text-center py-10">
              {t.allTaken}
            </p>
          ) : (
            Object.keys(byDate).map((d) => (
              <div key={d}>
                <h3 className="font-bold text-slate-700 mb-2">
                  {formatLongDate(d, language)}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {byDate[d].map((s) => (
                    <button key={s.id} onClick={() => setSelectedSlot(s)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 active:scale-95 transition">
                      {minutesToTime(s.start_minutes)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl p-5 shadow border border-slate-200 max-w-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-500">
                {t.selectedTime}
              </p>

              <p className="font-bold text-slate-800">
                {formatLongDate(
                  selectedSlot.date,
                  language
                )}{' '}
                ·{' '}
                {minutesToTime(
                  selectedSlot.start_minutes
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSelectedSlot(null)
              }
              className="text-sm text-indigo-600 font-bold"
            >
              {t.change}
            </button>
          </div>
          <label className="block text-sm mb-3">
            <span className="font-medium text-slate-600">
              {t.parentName}
            </span>
            <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" required />
          </label>
          <label className="block text-sm mb-3">
            <span className="font-medium text-slate-600">
              {t.studentName}
            </span>
            <input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" required />
          </label>
          <label className="block text-sm mb-4">
            <span className="font-medium text-slate-600">
              {t.phone}
            </span>
            <input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
          </label>
          <button type="submit" disabled={booking?.status === 'loading'} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 active:scale-95 transition">
            {booking?.status === 'loading'
              ? t.booking
              : t.confirm}
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-slate-50 flex items-start justify-center p-5">
      <div className="w-full max-w-2xl bg-white/70 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 mt-6">
        {children}
      </div>
    </div>
  );
}