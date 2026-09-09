import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { QRCodeSVG } from 'qrcode.react';
import SlotGenerator from '@/components/conference/SlotGenerator';
import SlotList from '@/components/conference/SlotList';

export default function ConferenceDetail({ conference, onBack }) {
  const queryClient = useQueryClient();
  const { data: slots = [] } = useQuery({
    queryKey: ['conference-slots', conference.id],
    queryFn: async () => base44.entities.ConferenceSlot.filter({ conference_id: conference.id }, '-created_date', 500),
  });

  const toggleActive = useMutation({
    mutationFn: (active) => base44.entities.Conference.update(conference.id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conferences'] }),
  });

  const signUpUrl = `${window.location.origin}/ConferenceSignUp?c=${conference.code}`;
  const openCount = slots.filter((s) => s.status === 'open').length;
  const bookedCount = slots.length - openCount;

  const copyLink = () => navigator.clipboard?.writeText(signUpUrl);

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-4xl mx-auto">
      <button onClick={onBack} className="text-indigo-600 font-bold text-sm">← Back</button>
      <div className="flex items-start justify-between flex-wrap gap-3 mt-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">{conference.title}</h1>
          <p className="text-slate-500">{conference.teacher_name}{conference.class_name ? ` · ${conference.class_name}` : ''}</p>
          <p className="text-sm text-slate-400 mt-1">{bookedCount} booked · {openCount} open · {slots.length} total</p>
        </div>
        <button
          onClick={() => toggleActive.mutate(!conference.active)}
          className={`px-4 py-2 rounded-xl font-bold text-sm active:scale-95 transition ${conference.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
        >
          {conference.active ? '● Active' : '○ Inactive'}
        </button>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mt-5 flex flex-col sm:flex-row items-center gap-5">
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <QRCodeSVG value={signUpUrl} size={160} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800">Parent Sign-Up Link</h3>
          <p className="text-sm text-slate-500 mb-2">Share this QR or link with parents. They pick a time — booked slots disappear instantly for everyone else.</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 text-slate-700 truncate">{signUpUrl}</code>
            <button onClick={copyLink} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold active:scale-95">Copy</button>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <SlotGenerator conference={conference} />
      </div>

      <div className="mt-6">
        <h3 className="font-bold text-slate-800 mb-3">All Slots</h3>
        <SlotList slots={slots} conferenceId={conference.id} />
      </div>
    </div>
  );
}