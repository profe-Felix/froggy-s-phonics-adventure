import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { minutesToTime, formatLongDate } from '@/lib/conferenceUtils';
import { Trash2, RotateCcw } from 'lucide-react';

export default function SlotList({ slots, conferenceId }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conference-slots', conferenceId] });

  const cancelBooking = useMutation({
    mutationFn: (id) => base44.entities.ConferenceSlot.update(id, { status: 'open', parent_name: '', student_name: '', parent_phone: '', booked_at: '' }),
    onSuccess: invalidate,
  });
  const deleteSlot = useMutation({
    mutationFn: (id) => base44.entities.ConferenceSlot.delete(id),
    onSuccess: invalidate,
  });

  const byDate = {};
  slots.forEach((s) => { (byDate[s.date] ||= []).push(s); });
  const dates = Object.keys(byDate).sort();
  dates.forEach((d) => byDate[d].sort((a, b) => a.start_minutes - b.start_minutes));

  if (!slots.length) {
    return <p className="text-slate-400 text-sm py-6 text-center">No slots yet. Generate some above.</p>;
  }

  return (
    <div className="space-y-5">
      {dates.map((d) => (
        <div key={d}>
          <h4 className="font-bold text-slate-700 mb-2">{formatLongDate(d)}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {byDate[d].map((s) => (
              <div key={s.id} className={`rounded-xl p-3 border flex items-center justify-between ${s.status === 'booked' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                <div>
                  <p className="font-bold text-slate-800">{minutesToTime(s.start_minutes)}</p>
                  {s.status === 'booked' ? (
                    <p className="text-sm text-rose-700">
                      {s.parent_name} <span className="text-rose-300">·</span> {s.student_name}
                      {s.parent_phone ? ` · ${s.parent_phone}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-emerald-600">Open</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {s.status === 'booked' && (
                    <button onClick={() => cancelBooking.mutate(s.id)} title="Cancel booking (reopen slot)" className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-amber-600 active:scale-90">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => deleteSlot.mutate(s.id)} title="Delete slot" className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 active:scale-90">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}