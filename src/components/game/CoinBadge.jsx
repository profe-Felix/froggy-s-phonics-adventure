import { Coins } from 'lucide-react';

// Coin balance badge for the map top bar. Tapping opens the character wheel.
export default function CoinBadge({ coins, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400 text-amber-950 text-sm font-black shadow hover:bg-amber-300 active:scale-95 transition"
    >
      <Coins className="w-4 h-4" />
      <span className="tabular-nums">{coins || 0}</span>
    </button>
  );
}