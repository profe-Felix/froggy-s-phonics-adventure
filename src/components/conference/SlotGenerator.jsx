import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { timeToMinutes } from '@/lib/conferenceUtils';
import { X, Plus, Calendar } from 'lucide-react';

export default function SlotGenerator({ conference }) {
  const queryClient = useQueryClient();
  const [dates, setDates] = useState([]); // multiple ISO dates
  const [dateInput, setDateInput] = useState(''); // temp value for the date picker
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('12:00');
  const [minutes, setMinutes] = useState(20);

  const addDate = () => {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput('');
  };

  const removeDate = (d) => setDates(dates.filter((x) => x !== d));

  const formatDateLabel = (iso) => {
    const d = new Date(iso + 'T00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const generate = useMutation({
    mutationFn: async () => {
      const startMin = timeToMinutes(start);
      const endMin = timeToMinutes(end);
      const slots = [];
      for (const date of dates) {
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
      }
      if (!slots.length) throw new Error('No slots fit in that range');
      return base44.entities.ConferenceSlot.bulkCreate(slots);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-slots', conference.id] });
      setDates([]);
    },
  });

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <h3 className="font-bold text-slate-800 mb-1">Add time slots</h3>
      <p className="text-sm text-slate-500 mb-3">
        Pick one or more days, a start and end time, and the minutes per meeting. Slots are generated back-to-back for every selected day. For a lunch break, add a morning block and an afternoon block separately.
      </p>

      {/* Date picker + selected date chips */}
      <div className="mb-3">
        <span className="font-medium text-slate-600 text-sm">Days</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="rounded-lg border border-slate-300 pl-3 pr-9 py-2 outline-none focus:border-indigo-500"
            />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={addDate}
            disabled={!dateInput || dates.includes(dateInput)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-medium text-sm disabled:opacity-50 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" /> Add day
          </button>
          {dates.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium border border-indigo-200"
            >
              {formatDateLabel(d)}
              <button
                onClick={() => removeDate(d)}
                className="rounded-full p-0.5 hover:bg-indigo-200 active:scale-90 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
        disabled={dates.length === 0 || generate.isPending}
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 active:scale-95 transition"
      >
        {generate.isPending
          ? 'Generating…'
          : `Generate Slots${dates.length > 1 ? ` (${dates.length} days)` : ''}`}
      </button>
      {generate.isError && <p className="text-red-500 text-sm mt-2">{generate.error?.message}</p>}
    </div>
  );
}