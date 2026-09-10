import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { timeToMinutes } from '@/lib/conferenceUtils';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SlotGenerator({ conference }) {
  const queryClient = useQueryClient();
  const [dates, setDates] = useState([]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('12:00');
  const [minutes, setMinutes] = useState(20);
  // Calendar view month (first of month)
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const toggleDate = (iso) => {
    setDates((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort()
    );
  };

  const formatDateLabel = (iso) => {
    const d = new Date(iso + 'T00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Build the 6-row calendar grid for the viewed month
  const grid = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    // leading blanks
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(year, month, d));
    }
    // trailing blanks to fill 6 rows
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
        Click one or more days on the calendar, then set a start/end time and minutes per meeting. Slots are generated back-to-back for every selected day. For a lunch break, add a morning block and an afternoon block separately.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Clickable month calendar */}
        <div className="border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 transition"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-bold text-slate-700 text-sm">{monthLabel}</span>
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 transition"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-xs font-medium text-slate-400 py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = isoDate(d);
              const selected = dates.includes(iso);
              const isToday = iso === isoDate(new Date());
              return (
                <button
                  key={iso}
                  onClick={() => toggleDate(iso)}
                  className={`relative aspect-square rounded-lg text-sm font-medium transition active:scale-90 ${
                    selected
                      ? 'bg-emerald-600 text-white'
                      : 'hover:bg-emerald-50 text-slate-700'
                  }`}
                >
                  {d.getDate()}
                  {isToday && !selected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
          {dates.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{dates.length} day{dates.length > 1 ? 's' : ''} selected</span>
              <button
                onClick={() => setDates([])}
                className="text-xs text-slate-500 hover:text-red-500 font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Time + duration + selected chips */}
        <div className="flex flex-col">
          <div className="grid gap-3 grid-cols-3">
            <label className="text-sm">
              <span className="font-medium text-slate-600">Start</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-indigo-500" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-600">End</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-indigo-500" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-600">Min/slot</span>
              <input type="number" min="5" step="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 20)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-indigo-500" />
            </label>
          </div>

          {/* Selected day chips */}
          <div className="mt-3 flex flex-wrap gap-1.5 min-h-[2rem]">
            {dates.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No days selected yet — click the calendar.</span>
            ) : (
              dates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200"
                >
                  {formatDateLabel(d)}
                  <button onClick={() => toggleDate(d)} className="rounded-full p-0.5 hover:bg-emerald-200 active:scale-90 transition">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
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