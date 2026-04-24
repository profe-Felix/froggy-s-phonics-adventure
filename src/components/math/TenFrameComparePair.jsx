import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SimpleWritingCanvas from './SimpleWritingCanvas';

// ── seeded RNG ──────────────────────────────────────────────────
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const a = [...arr]; let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function randomNum() { return Math.floor(Math.random() * 21); }
function randomSeed() { return Math.floor(Math.random() * 999999); }

// ── Ten Frame display ───────────────────────────────────────────
function Frame10({ value, seed }) {
  const positions = Array.from({ length: 10 }, (_, i) => i);
  const shuffled = seededShuffle(positions, seed);
  const filled = new Set(shuffled.slice(0, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, border: '3px solid #1f2937', borderRadius: 10, padding: 5, background: '#fff' }}>
      {positions.map(i => (
        <div key={i} style={{ width: 30, height: 30, border: '2px solid #9ca3af', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>
          {filled.has(i) && <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#111827' }} />}
        </div>
      ))}
    </div>
  );
}

function DoubleTenFrame({ value, seedBase }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <Frame10 value={Math.min(value, 10)} seed={seedBase + 11} />
      <Frame10 value={Math.max(0, value - 10)} seed={seedBase + 29} />
    </div>
  );
}

// ── Digit pad ───────────────────────────────────────────────────
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function DigitPad({ value, onChange, color = '#4f46e5' }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{
        width: 48, height: 48, borderRadius: 12, border: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 900, color,
      }}>
        {value ?? '?'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
        {DIGITS.map(d => (
          <button key={d} onClick={() => { const next = (value ?? 0) * 10 + d; if (next <= 99) onChange(next); }}
            disabled={(value ?? '').toString().length >= 2}
            style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#334155', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}>
            {d}
          </button>
        ))}
      </div>
      <button onClick={() => onChange(value !== null && value >= 10 ? Math.floor(value / 10) : null)}
        style={{ width: '100%', padding: '4px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
        ⌫
      </button>
    </div>
  );
}

// ── Writing + digit panel (persists throughout) ─────────────────
function WriteAndDigitPanel({ label, color, value, onChange, drawnUrl, onDrawDone }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textAlign: 'center' }}>{label}</div>
      {drawnUrl ? (
        <img src={drawnUrl} alt="written" style={{ height: 72, objectFit: 'contain', borderRadius: 8, border: `2px solid ${color}20`, background: '#f8fbff' }} />
      ) : (
        <SimpleWritingCanvas onDone={(strokes, url) => onDrawDone(url)} />
      )}
      <DigitPad value={value} onChange={onChange} color={color} />
    </div>
  );
}

// ── Comparison sentence ─────────────────────────────────────────
const LABEL_MAP = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };

function ComparePhase({ myNumber, theirNumber, partnerNum, onNext }) {
  const [placed, setPlaced] = useState(null);
  const [result, setResult] = useState(null);
  const correct = myNumber > theirNumber ? 'is_greater_than' : myNumber < theirNumber ? 'is_less_than' : 'is_equal_to';

  const handlePlace = (v) => {
    if (placed) return;
    setPlaced(LABEL_MAP[v]);
    setResult(v === correct ? 'correct' : 'wrong');
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', marginBottom: 8 }}>COMPLETE THE SENTENCE</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
        <span style={{ background: '#dbeafe', padding: '4px 10px', borderRadius: 8 }}>{myNumber}</span>
        <div onClick={() => { if (!placed) {} }}
          style={{
            minWidth: 120, height: 40, borderRadius: 10, border: `3px dashed ${placed ? (result === 'correct' ? '#22c55e' : '#ef4444') : '#94a3b8'}`,
            background: placed ? (result === 'correct' ? '#dcfce7' : '#fee2e2') : '#f8fafc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: placed ? (result === 'correct' ? '#166534' : '#dc2626') : '#94a3b8',
          }}>
          {placed || '___'}
        </div>
        <span style={{ background: '#ffedd5', padding: '4px 10px', borderRadius: 8 }}>{theirNumber}</span>
      </div>

      {!placed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 }}>
          {Object.entries(LABEL_MAP).map(([val, label]) => (
            <button key={val} onClick={() => handlePlace(val)}
              style={{ padding: '8px 14px', borderRadius: 10, background: '#4f46e5', color: 'white', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          style={{ borderRadius: 10, padding: 12, background: result === 'correct' ? '#f0fdf4' : '#fff1f2', border: `2px solid ${result === 'correct' ? '#22c55e' : '#f87171'}`, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>{result === 'correct' ? '🎉' : '✗'}</div>
          <p style={{ fontWeight: 900, fontSize: 15 }}>{result === 'correct' ? 'Correct!' : 'Not quite — try again!'}</p>
          {result === 'correct' && (
            <button onClick={onNext}
              style={{ marginTop: 8, padding: '8px 20px', background: '#4f46e5', color: 'white', fontWeight: 900, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13 }}>
              🔄 New Round
            </button>
          )}
          {result === 'wrong' && (
            <button onClick={() => { setPlaced(null); setResult(null); }}
              style={{ marginTop: 8, padding: '8px 20px', background: '#f59e0b', color: 'white', fontWeight: 900, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13 }}>
              Try Again
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Game view ───────────────────────────────────────────────────
function GameView({ game, studentNumber, onLeave, refetch }) {
  const isP1 = game.player1_number === studentNumber;
  const myNum = isP1 ? game.player1_count : game.player2_count;
  const theirNum = isP1 ? game.player2_count : game.player1_count;
  const mySeedBase = isP1 ? (game.player1_seed || 1) : (game.player2_seed || 2);
  const theirSeedBase = isP1 ? (game.player2_seed || 2) : (game.player1_seed || 1);
  const partnerNum = isP1 ? game.player2_number : game.player1_number;

  const [myWritten, setMyWritten] = useState(null);
  const [theirWritten, setTheirWritten] = useState(null);
  const [myTyped, setMyTyped] = useState(null);
  const [theirTyped, setTheirTyped] = useState(null);
  const roundNum = game.round_number || 1;

  const handleNewRound = async () => {
    await base44.entities.RollComparePairGame.update(game.id, {
      player1_count: randomNum(), player2_count: randomNum(),
      player1_seed: randomSeed(), player2_seed: randomSeed(),
      player1_answer: null, player2_answer: null,
      round_number: roundNum + 1,
    });
    setMyWritten(null); setTheirWritten(null);
    setMyTyped(null); setTheirTyped(null);
    refetch();
  };

  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={onLeave} style={{ background: 'none', border: 'none', fontWeight: 700, color: '#134e4a', cursor: 'pointer' }}>← Leave</button>
        <span style={{ fontWeight: 900, fontSize: 16, color: '#134e4a' }}>🟦 Ten Frame Compare</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>Round {roundNum}</span>
      </div>

      {/* Ten frames side by side */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0d9488' }}>Your Number</span>
          <DoubleTenFrame value={myNum} seedBase={mySeedBase} />
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c' }}>#{partnerNum}'s Number</span>
          <DoubleTenFrame value={theirNum} seedBase={theirSeedBase} />
        </div>
      </div>

      {/* Writing + digit panels — stay visible throughout */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <WriteAndDigitPanel
          label={`Your Number`}
          color="#0d9488"
          value={myTyped}
          onChange={setMyTyped}
          drawnUrl={myWritten}
          onDrawDone={setMyWritten}
        />
        <WriteAndDigitPanel
          label={`#${partnerNum}'s Number`}
          color="#ea580c"
          value={theirTyped}
          onChange={setTheirTyped}
          drawnUrl={theirWritten}
          onDrawDone={setTheirWritten}
        />
      </div>

      {/* Compare — only show once both have typed a number */}
      {myTyped !== null && theirTyped !== null && (
        <ComparePhase
          key={roundNum}
          myNumber={myNum}
          theirNumber={theirNum}
          partnerNum={partnerNum}
          onNext={handleNewRound}
        />
      )}
    </div>
  );
}

// ── Lobby ───────────────────────────────────────────────────────
export default function TenFrameComparePair({ className: cls, studentNumber, onBack }) {
  const [activeGameId, setActiveGameId] = useState(null);

  const { data: allGames = [], refetch } = useQuery({
    queryKey: ['tfcpair', cls],
    queryFn: () => base44.entities.RollComparePairGame.filter({ class_name: cls }),
    refetchInterval: 2000,
  });

  const myGame = allGames.find(g =>
    (g.player1_number === studentNumber || g.player2_number === studentNumber) && g.status !== 'done'
  ) || (activeGameId ? allGames.find(g => g.id === activeGameId) : null);

  const joinableGames = allGames.filter(g =>
    g.status === 'waiting' && g.player1_number !== studentNumber && !g.player2_number
    && !g.player1_roll // distinguish from roll compare games by absence of roll fields
  );

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.RollComparePairGame.create({
      class_name: cls,
      player1_number: studentNumber,
      player1_count: randomNum(), player2_count: randomNum(),
      player1_seed: randomSeed(), player2_seed: randomSeed(),
      status: 'waiting', round_number: 1,
    });
    setActiveGameId(g.id);
    refetch();
  };

  const joinGame = async (g) => {
    await base44.entities.RollComparePairGame.update(g.id, { player2_number: studentNumber, status: 'rolling' });
    setActiveGameId(g.id);
    refetch();
  };

  const startGame = async (g) => {
    await base44.entities.RollComparePairGame.update(g.id, { status: 'rolling' });
    refetch();
  };

  const leaveGame = async (g) => {
    await base44.entities.RollComparePairGame.delete(g.id);
    setActiveGameId(null);
    refetch();
  };

  if (myGame && (myGame.status === 'rolling' || myGame.status === 'comparing')) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #ecfdf5, #ccfbf1)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 12px', overflowY: 'auto' }}>
        <GameView game={myGame} studentNumber={studentNumber} onLeave={() => leaveGame(myGame)} refetch={refetch} />
      </div>
    );
  }

  if (myGame && myGame.status === 'waiting') {
    const players = [myGame.player1_number, myGame.player2_number].filter(Boolean);
    const isHost = myGame.player1_number === studentNumber;
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0d9488, #0f766e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
        <h2 style={{ color: 'white', fontWeight: 900, fontSize: 22, margin: 0 }}>🟦 Waiting Room</h2>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {players.map(p => (
            <div key={p} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: '8px 16px' }}>
              <span style={{ color: 'white', fontWeight: 700 }}>#{p}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {p === myGame.player1_number && <span style={{ color: '#fde047', fontSize: 12, fontWeight: 700 }}>HOST</span>}
                {p === studentNumber && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>(you)</span>}
              </div>
            </div>
          ))}
          {players.length < 2 && <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 13 }}>Waiting for partner…</p>}
        </div>
        {isHost ? (
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => startGame(myGame)}
            disabled={players.length < 2}
            style={{ width: '100%', maxWidth: 320, padding: '16px 0', background: players.length < 2 ? '#94a3b8' : '#22c55e', color: 'white', fontWeight: 900, fontSize: 18, borderRadius: 16, border: 'none', cursor: players.length < 2 ? 'default' : 'pointer' }}>
            {players.length < 2 ? 'Waiting…' : '▶ Start!'}
          </motion.button>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>Waiting for the host to start…</p>
        )}
        <button onClick={() => leaveGame(myGame)} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Leave Room</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0d9488, #0f766e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      <button onClick={onBack} style={{ alignSelf: 'flex-start', color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>← Back</button>
      <div style={{ fontSize: 48 }}>🟦</div>
      <h2 style={{ color: 'white', fontWeight: 900, fontSize: 24, margin: 0 }}>Ten Frame Compare</h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>Class: {cls} · You are #{studentNumber}</p>
      {joinableGames.length > 0 ? (
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'white', fontWeight: 600 }}>Open rooms:</p>
          {joinableGames.map(g => (
            <motion.button key={g.id} whileTap={{ scale: 0.95 }} onClick={() => joinGame(g)}
              style={{ width: '100%', padding: '16px 0', background: 'white', color: '#0f766e', fontWeight: 700, fontSize: 17, borderRadius: 16, border: 'none', cursor: 'pointer' }}>
              #{g.player1_number}'s room
            </motion.button>
          ))}
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 13 }}>— or —</div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={createGame}
            style={{ width: '100%', padding: '12px 0', background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 700, fontSize: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            + Create My Room
          </motion.button>
        </div>
      ) : (
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={createGame}
          style={{ width: '100%', maxWidth: 320, padding: '24px 0', background: 'white', color: '#0f766e', fontWeight: 900, fontSize: 22, borderRadius: 16, border: 'none', cursor: 'pointer' }}>
          + Create a Room
        </motion.button>
      )}
    </div>
  );
}