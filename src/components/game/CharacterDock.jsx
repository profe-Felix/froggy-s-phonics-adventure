import { useState } from 'react';
import { X, Lock } from 'lucide-react';

// Always-visible character dock (bottom-left of the map). Shows the student's
// active character. Tapping opens a collection modal where they can switch to
// any unlocked character; locked ones are greyed out.
export default function CharacterDock({ studentData, characters, onSetActive }) {
  const [open, setOpen] = useState(false);
  const activeId = studentData?.active_character;
  const unlocked = studentData?.unlocked_characters || [];
  const active =
    characters.find((c) => c.id === activeId) ||
    (unlocked.length ? characters.find((c) => c.id === unlocked[unlocked.length - 1]) : null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Your character"
        className="fixed bottom-4 left-4 z-30 w-20 h-20 rounded-2xl bg-white/90 border-4 border-white shadow-lg flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 transition"
      >
        {active ? (
          <img src={active.url} alt="character" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">🥚</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl p-5 mx-4 max-w-md w-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-black text-indigo-900">Your Characters</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            {unlocked.length === 0 ? (
              <p className="text-center text-gray-500 font-bold py-8">
                No characters yet — spin the wheel to get one!
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
                {characters.map((c) => {
                  const owned = unlocked.includes(c.id);
                  const isActive = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      disabled={!owned}
                      onClick={() => onSetActive(c.id)}
                      className={`relative rounded-xl overflow-hidden border-4 transition ${isActive ? 'border-amber-400 ring-2 ring-amber-300' : owned ? 'border-white hover:scale-105' : 'border-gray-200 opacity-40'}`}
                    >
                      <img src={c.url} alt={c.id} className="w-full aspect-square object-cover" />
                      {!owned && (
                        <div className="absolute inset-0 bg-gray-500/50 flex items-center justify-center">
                          <Lock className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {active && (
              <p className="text-center text-xs text-gray-400 mt-3">Tap a character to make it your buddy.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}