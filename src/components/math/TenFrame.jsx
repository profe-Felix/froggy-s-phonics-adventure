function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function TenFrame({ value, size = 'md', seed = 42 }) {
  if (!value && value !== 0) return null;

  const cellSize = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  const dotSize = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-3 h-3' : 'w-5 h-5';
  const gap = size === 'lg' ? 'gap-1.5' : 'gap-1';

  const fullFrames = Math.floor(value / 10);
  const remainder = value % 10;
  const frames = [];

  // Full frames — always left-to-right filled
  for (let f = 0; f < fullFrames; f++) {
    frames.push(Array(10).fill(true));
  }

  // Partial frame — randomize dot positions, seeded by value so it's stable
  if (remainder > 0) {
    const positions = Array.from({ length: 10 }, (_, i) => i);
    const shuffled = seededShuffle(positions, seed);
    const dotPositions = new Set(shuffled.slice(0, remainder));
    frames.push(Array.from({ length: 10 }, (_, i) => dotPositions.has(i)));
  }

  if (frames.length === 0) frames.push(Array(10).fill(false));

  return (
    <div className="flex flex-col items-center gap-3">
      {frames.map((dots, fi) => (
        <div key={fi} className={`grid grid-cols-5 ${gap} border-2 border-gray-800 p-1.5 bg-white rounded`}>
          {dots.map((filled, i) => (
            <div key={i} className={`${cellSize} border border-gray-400 flex items-center justify-center bg-white`}>
              {filled && <div className={`${dotSize} rounded-full bg-gray-900`} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}