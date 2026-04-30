import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import StoryStudentThumbnail from './StoryStudentThumbnail';
import StoryReplayModal from './StoryReplayModal';

const CLASS_NAMES = ['Campos', 'Felix', 'Valero'];

export default function TeacherStoryDashboard({ onBack }) {
  const [className, setClassName] = useState('Felix');
  const [reviewing, setReviewing] = useState(null); // {story, pageIdx}

  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['teacher-stories', className],
    queryFn: () => base44.entities.StoryAssignment.filter({ class_name: className }),
    refetchInterval: 15000,
  });

  // Sort by student number
  const sorted = [...stories].sort((a, b) => (a.student_number || 0) - (b.student_number || 0));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d1a' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: '#7c3aed', background: '#1a1a2e' }}>
        <button onClick={onBack} className="text-violet-300 hover:text-white font-bold">← Back</button>
        <h1 className="text-lg font-black text-white flex-1">📖 Stories — Teacher View</h1>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="px-3 py-1.5 rounded-xl font-bold text-white border border-violet-500"
          style={{ background: '#1a1a2e' }}>
          {CLASS_NAMES.map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && sorted.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📖</div>
            <p className="text-violet-300 font-bold">No stories yet for Class {className}</p>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {sorted.map(story => (
            <motion.div key={story.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-3" style={{ background: '#1a1a2e', border: '1px solid #7c3aed' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg"
                  style={{ background: '#7c3aed' }}>
                  {story.student_number}
                </div>
                <div>
                  <p className="text-white font-black">{story.title}</p>
                  <p className="text-violet-400 text-xs">{(story.pages || []).length} page{(story.pages || []).length !== 1 ? 's' : ''} · {story.status}</p>
                </div>
              </div>

              {/* Page thumbnails row */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(story.pages || []).map((pg, pi) => (
                  <StoryStudentThumbnail
                    key={pg.id || pi}
                    story={story}
                    pageIdx={pi}
                    onClick={() => setReviewing({ story, pageIdx: pi })}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {reviewing && (
        <StoryReplayModal
          story={reviewing.story}
          initialPageIdx={reviewing.pageIdx}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}