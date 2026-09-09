import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { generateCode } from '@/lib/conferenceUtils';
import ConferenceList from '@/components/conference/ConferenceList';
import ConferenceForm from '@/components/conference/ConferenceForm';
import ConferenceDetail from '@/components/conference/ConferenceDetail';

export default function ConferenceDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: conferences = [], isLoading } = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => base44.entities.Conference.list('-created_date', 100),
  });

  const createConference = useMutation({
    mutationFn: async ({ title, teacher_name, class_name }) => {
      const code = generateCode();
      return base44.entities.Conference.create({ title, teacher_name, class_name, code, active: true });
    },
    onSuccess: (conf) => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      setShowForm(false);
      setSelectedId(conf.id);
    },
  });

  const selected = conferences.find((c) => c.id === selectedId);

  if (selected) return <ConferenceDetail conference={selected} onBack={() => setSelectedId(null)} />;

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-4xl mx-auto">
      <a href="/Dashboard" className="text-indigo-600 font-bold text-sm">← Dashboard</a>
      <div className="flex items-center justify-between mt-3 mb-6">
        <h1 className="text-3xl font-bold text-slate-800">Parent Conferences</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow active:scale-95 transition"
        >
          {showForm ? 'Cancel' : '+ New Conference'}
        </button>
      </div>

      {showForm && (
        <ConferenceForm
          defaultTeacher={user?.full_name || ''}
          onCreate={(vals) => createConference.mutate(vals)}
          loading={createConference.isPending}
        />
      )}

      {isLoading ? (
        <div className="text-center text-slate-500 py-12">Loading…</div>
      ) : (
        <ConferenceList conferences={conferences} onSelect={(c) => setSelectedId(c.id)} />
      )}
    </div>
  );
}