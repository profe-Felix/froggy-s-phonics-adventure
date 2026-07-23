import { Link } from 'react-router-dom';
import BackButton from '@/components/ui/BackButton';

// Teacher launcher for the standalone literacy / math workstations.
// Each card opens the activity in teacher mode (where you can configure it and
// pull up a student QR). Students reach an activity by scanning the teacher's
// QR — they never need this hub.
const WORKSTATIONS = [
  {
    id: 'powerfulword',
    name: 'Powerful Word',
    desc: 'Bilingual Spanish↔English flashcards. Students tap Show to reveal the translation.',
    emoji: '🃏',
    path: '/PowerfulWord?role=teacher',
    color: '#dc2626',
  },
  {
    id: 'syllabletrain',
    name: 'Syllable Train',
    desc: 'Drag red & blue train cars onto the rail to build patterns and count syllables.',
    emoji: '🚂',
    path: '/SyllableTrain?role=teacher',
    color: '#3b82f6',
  },
  {
    id: 'fluencytable',
    name: 'Fluency Table',
    desc: 'Word grid with a sweeping highlight for guided fluency reading. Shuffle & QR.',
    emoji: '📖',
    path: '/FluencyTable?role=teacher',
    color: '#10b981',
  },
  {
    id: 'syllableblender',
    name: 'Syllable Blender',
    desc: 'Elkonin boxes — tap to hear each syllable, then reveal the picture & word.',
    emoji: '📦',
    path: '/SyllableBlender?role=teacher',
    color: '#2563eb',
  },
  {
    id: 'lettersort',
    name: 'Letter Sort',
    desc: 'Clasificador de letras — ordena por letra inicial, sílaba, conteo, sonidos, acento y más. 16 modos.',
    emoji: '🔤',
    path: '/LetterSort?role=teacher',
    color: '#0891b2',
  },
  {
    id: 'liveworkstations',
    name: 'Live Workstations',
    desc: 'One join code for the whole group. Switch activities & presets live — kids follow along, no re-scanning.',
    emoji: '🔴',
    path: '/LiveWorkstations?role=teacher',
    color: '#dc2626',
  },
];

export default function Workstations() {
  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 z-20" style={{ background: '#1a1a2e', borderColor: '#4338ca' }}>
        <BackButton onClick={() => window.history.back()} />
        <h1 className="text-white font-black text-xl flex-1">Workstations</h1>
      </div>
      <div className="max-w-5xl mx-auto p-6 grid gap-4 sm:grid-cols-2">
        {WORKSTATIONS.map((w) => (
          <Link
            key={w.id}
            to={w.path}
            className="rounded-2xl p-5 flex gap-4 items-center hover:scale-[1.02] transition-transform"
            style={{ background: '#1a1a2e', border: `2px solid ${w.color}` }}
          >
            <span className="text-4xl">{w.emoji}</span>
            <div className="flex-1">
              <p className="text-white font-black text-lg">{w.name}</p>
              <p className="text-indigo-300 text-sm mt-1">{w.desc}</p>
            </div>
            <span className="text-indigo-400 text-2xl">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}