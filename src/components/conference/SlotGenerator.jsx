import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { timeToMinutes } from '@/lib/conferenceUtils';

export default function SlotGenerator({ conference }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('12:00');
  const [minutes, setMinutes] = useState(20);

  const generate = useMutation({
    mutationFn: async () => {
      const startMin = timeToMinutes(start);
      const endMin = timeToMinutes(end);
      const slots = [];
      for (let m = startMin; m + minutes <= endMin; m += minutes) {
        slots.push({
          conference_id: conference.id,
          conference_code: conference.code,
          teacher_name: conference.teacher_name,
          date,
          start_minutes: m,
          duration_min: minutes,
          status: 'open',
        });
      }
      if (!slots.length) throw new Error('No slots fit in that range');
      return base44.entities.ConferenceSlot.bulkCreate(slots);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-slots', conference.id] });
      setDate('');
    },
  });

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <h3 className="font-bold text-slate-800 mb-1">Add time slots</h3>
      <p className="text-sm text-slate-500 mb-3">Pick a day, a start and end time, and the minutes per meeting. Slots are generated back-to-back. For a lunch break, add a morning block and an afternoon block separately.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium text-slate-600">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-600">Start</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-600">End</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-600">Min/slot</span>
          <input type="number" min="5" step="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 20)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        </label>
      </div>
      <button
        onClick={() => generate.mutate()}
        disabled={!date || generate.isPending}
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 active:scale-95 transition"
      >
        {generate.isPending ? 'Generating…' : 'Generate Slots'}
      </button>
      {generate.isError && <p className="text-red-500 text-sm mt-2">{generate.error?.message}</p>}
    </div>
  );
}