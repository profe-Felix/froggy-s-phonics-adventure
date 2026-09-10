import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { minutesToTime, formatLongDate } from '@/lib/conferenceUtils';
import BookingConfirmation from '@/components/conference/BookingConfirmation';

export default function ConferenceSignUp() {
  const code = useMemo(() => new URLSearchParams(window.location.search).get('c'), []);
  const [selectedSlot, setSelectedSlot] = useState(null);
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

  if (!code) return <Shell>Missing conference code.</Shell>;
  if (conference === null) return <Shell>This conference is closed or the link is invalid.</Shell>;
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
      <h1 className="text-2xl font-bold text-slate-800">{conference?.title || 'Loading…'}</h1>
      <p className="text-slate-500 mb-5">{conference?.teacher_name ? `With ${conference.teacher_name}` : ''}</p>

      {booking?.status === 'taken' && <p className="bg-amber-50 text-amber-700 rounded-lg p-3 mb-4 text-sm">Sorry, that time was just taken. Please pick another.</p>}
      {booking?.status === 'error' && <p className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">Something went wrong: {booking.message}</p>}

      {!selectedSlot ? (
        <div className="space-y-5">
          {Object.keys(byDate).length === 0 ? (
            <p className="text-slate-400 text-center py-10">All time slots are taken. Please check back later.</p>
          ) : (
            Object.keys(byDate).map((d) => (
              <div key={d}>
                <h3 className="font-bold text-slate-700 mb-2">{formatLongDate(d)}</h3>
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
              <p className="text-sm text-slate-500">Selected time</p>
              <p className="font-bold text-slate-800">{formatLongDate(selectedSlot.date)} · {minutesToTime(selectedSlot.start_minutes)}</p>
            </div>
            <button type="button" onClick={() => setSelectedSlot(null)} className="text-sm text-indigo-600 font-bold">Change</button>
          </div>
          <label className="block text-sm mb-3">
            <span className="font-medium text-slate-600">Parent name</span>
            <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" required />
          </label>
          <label className="block text-sm mb-3">
            <span className="font-medium text-slate-600">Student name</span>
            <input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" required />
          </label>
          <label className="block text-sm mb-4">
            <span className="font-medium text-slate-600">Phone (optional)</span>
            <input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
          </label>
          <button type="submit" disabled={booking?.status === 'loading'} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 active:scale-95 transition">
            {booking?.status === 'loading' ? 'Booking…' : 'Confirm'}
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