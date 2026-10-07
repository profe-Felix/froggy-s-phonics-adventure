import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { minutesToTime, formatLongDate } from '@/lib/conferenceUtils';
import { Trash2, RotateCcw, Check, Clock, X } from 'lucide-react';

const MEETING_STATUSES = [
  { key: 'scheduled', label: 'Scheduled', icon: Clock, color: 'amber', bg: 'bg-amber-100 border-amber-300 text-amber-700', dot: 'bg-amber-400' },
  { key: 'completed', label: 'Completed', icon: Check, color: 'emerald', bg: 'bg-emerald-100 border-emerald-300 text-emerald-700', dot: 'bg-emerald-500' },
  { key: 'missed', label: 'Missed', icon: X, color: 'rose', bg: 'bg-rose-100 border-rose-300 text-rose-700', dot: 'bg-rose-500' },
];

const statusByKey = (key) => MEETING_STATUSES.find((s) => s.key === key) || MEETING_STATUSES[0];
const nextStatus = (key) => {
  const i = MEETING_STATUSES.findIndex((s) => s.key === key);
  return MEETING_STATUSES[(i + 1) % MEETING_STATUSES.length].key;
};

export default function SlotList({ slots, conferenceId }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conference-slots', conferenceId] });

  const cancelBooking = useMutation({
    mutationFn: (id) => base44.functions.invoke('manageConferenceSlot', { slot_id: id, action: 'cancel' }),
    onSuccess: invalidate,
  });
  const deleteSlot = useMutation({
    mutationFn: (id) => base44.functions.invoke('manageConferenceSlot', { slot_id: id, action: 'delete' }),
    onSuccess: invalidate,
  });
  const setMeetingStatus = useMutation({
    mutationFn: ({ id, meeting_status }) => base44.functions.invoke('manageConferenceSlot', { slot_id: id, action: 'set_meeting_status', meeting_status }),
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
            {byDate[d].map((s) => {
              const ms = statusByKey(s.meeting_status || 'scheduled');
              const StatusIcon = ms.icon;
              return (
                <div key={s.id} className={`rounded-xl p-3 border flex items-center justify-between ${s.status === 'booked' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{minutesToTime(s.start_minutes)}</p>
                    {s.status === 'booked' ? (
                      <p className="text-sm text-rose-700 truncate">
                        {s.parent_name} <span className="text-rose-300">·</span> {s.student_name}
                        {s.parent_phone ? ` · ${s.parent_phone}` : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-emerald-600">Open</p>
                    )}
                  </div>
                  <div className="flex gap-1 items-center shrink-0">
                    {s.status === 'booked' && (
                      <button
                        onClick={() => setMeetingStatus.mutate({ id: s.id, meeting_status: nextStatus(s.meeting_status || 'scheduled') })}
                        title={`Meeting status: ${ms.label} (click to change)`}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold active:scale-90 transition ${ms.bg}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{ms.label}</span>
                      </button>
                    )}
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
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}