import { useState } from 'react';

export default function PageNavBar({ currentPage, minPage, maxPage, onGo }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const realMax = maxPage === 999 ? '∞' : maxPage;

  const handleClick = () => {
    setInputVal(String(currentPage));
    setEditing(true);
  };

  const commit = () => {
    const v = parseInt(inputVal);
    if (!isNaN(v)) {
      const clamped = Math.min(Math.max(v, minPage), maxPage === 999 ? v : maxPage);
      onGo(clamped);
    }
    setEditing(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="flex items-center justify-center gap-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderTop: '2px solid #4338ca' }}>
      <button disabled={currentPage <= minPage} onClick={() => onGo(currentPage - 1)}
        className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30"
        style={{ background: '#4338ca' }}>‹ Prev</button>

      {editing ? (
        <input
          autoFocus
          type="number"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-20 text-center font-black text-white rounded-xl border-2 border-indigo-400 px-2 py-0.5"
          style={{ background: '#0f0f1a' }}
        />
      ) : (
        <button onClick={handleClick}
          className="text-white font-black text-sm px-3 py-1 rounded-xl hover:bg-indigo-900 transition-all"
          title="Click to jump to a page">
          {currentPage} / {realMax}
        </button>
      )}

      <button disabled={currentPage >= maxPage} onClick={() => onGo(currentPage + 1)}
        className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30"
        style={{ background: '#4338ca' }}>Next ›</button>
    </div>
  );
}