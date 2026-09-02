import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getCharacters } from '@/lib/characters';
import { base44 } from '@/api/base44Client';

export const SPIN_COST = 100;
export const DUPLICATE_CHARACTER_COINS = 40;

// These remain exported because PrizeDashboard already imports ALL_PRIZES.
export const ALL_PRIZES = [
  {
    id: 'sticker',
    type: 'sticker',
    label: 'Sticker',
    emoji: '⭐',
    color: '#a5f3fc',
    weight: 50,
    oneTime: false,
  },
  {
    id: 'character',
    type: 'character',
    label: 'Character',
    emoji: '🧑',
    color: '#fde68a',
    weight: 35,
    oneTime: false,
  },
  {
    id: 'lollipop',
    type: 'physical',
    label: 'Lollipop',
    emoji: '🍭',
    color: '#f9a8d4',
    weight: 5,
    oneTime: false,
  },
  {
    id: 'treasure_box',
    type: 'physical',
    label: 'Treasure Box',
    emoji: '🎁',
    color: '#fcd34d',
    weight: 5,
    oneTime: false,
  },
  {
    id: 'cushion',
    type: 'physical',
    label: 'Cushion',
    emoji: '🪑',
    color: '#86efac',
    weight: 5,
    oneTime: false,
  },
];

const ITEM_H = 120;
const VISIBLE = 3;
const WINDOW_H = ITEM_H * VISIBLE;
const RESULT_H = Math.round(ITEM_H * 2.5);
const SPIN_MS = 5000;
const REEL_LEN = 48;

/**
 * Keep these old exports working because other files may import them.
 */
export function buildPrizePool() {
  return ALL_PRIZES;
}

export function pickPrize(redeemedPrizes = [], allowCharacters = true) {
  const available = ALL_PRIZES.filter(
    prize =>
      !(prize.oneTime && redeemedPrizes.includes(prize.id)) &&
      (allowCharacters || prize.id !== 'character')
  );

  const total = available.reduce(
    (sum, prize) => sum + prize.weight,
    0
  );

  let roll = Math.random() * total;

  for (const prize of available) {
    roll -= prize.weight;

    if (roll <= 0) {
      return prize;
    }
  }

  return available[0] || ALL_PRIZES[0];
}

function randomCharacter(characters) {
  if (!characters?.length) return null;

  return characters[
    Math.floor(Math.random() * characters.length)
  ];
}

function makeTile(reward, characters) {
  if (reward?.id === 'character') {
    const char = randomCharacter(characters);

    if (char) {
      return {
        type: 'character',
        char,
      };
    }

    return {
      type: 'reward',
      reward: ALL_PRIZES.find(p => p.id === 'sticker'),
    };
  }

  return {
    type: 'reward',
    reward,
  };
}

export default function PrizeWheel({
  // Existing PrizeWheel props
  redeemedPrizes = [],
  onClaim,
  onClose,

  // New unified-wheel props
  studentData,
  onStudentPatch,
  freeSpin = true,
  source = 'reward',

  // Existing CharacterWheel callbacks.
  // Supporting these means CharacterWheel can remain a safe wrapper.
  onSpend,
  onUnlock,
}) {
  const [characters, setCharacters] = useState([]);
  const [reel, setReel] = useState([]);
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);

  const [coins, setCoins] = useState(
    () => studentData?.coins || 0
  );

  const [unlockedCharacters, setUnlockedCharacters] = useState(
    () => studentData?.unlocked_characters || []
  );

  const [activePrizes, setActivePrizes] = useState(
    () => studentData?.active_prizes || []
  );

  const animRef = useRef(null);
  const startRef = useRef(null);

  /*
   * We can only safely award a character when we know which student
   * owns it OR when the old CharacterWheel onUnlock callback exists.
   *
   * This lets old Sentences/Phonics callers continue working before
   * we update them to pass studentData.
   */
  const characterRewardsEnabled =
    !!studentData || typeof onUnlock === 'function';

  useEffect(() => {
    setCoins(studentData?.coins || 0);
  }, [studentData?.coins]);

  useEffect(() => {
    setUnlockedCharacters(
      studentData?.unlocked_characters || []
    );
  }, [studentData?.unlocked_characters]);

  useEffect(() => {
    setActivePrizes(
      studentData?.active_prizes || []
    );
  }, [studentData?.active_prizes]);

  useEffect(() => {
    let alive = true;

    getCharacters()
      .then(all => {
        if (!alive) return;

        const safe = Array.isArray(all) ? all : [];
        setCharacters(safe);

        const tiles = [];

        for (let i = 0; i < REEL_LEN; i++) {
          const reward = pickPrize(
            redeemedPrizes,
            characterRewardsEnabled
          );

          tiles.push(makeTile(reward, safe));
        }

        setReel(tiles);
      })
      .catch(() => {
        if (!alive) return;

        const sticker = ALL_PRIZES.find(
          p => p.id === 'sticker'
        );

        setReel(
          Array.from(
            { length: REEL_LEN },
            () => ({
              type: 'reward',
              reward: sticker,
            })
          )
        );
      });

    return () => {
      alive = false;
    };
  }, [characterRewardsEnabled]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const canAfford =
    freeSpin || coins >= SPIN_COST;

  /*
   * IMPORTANT:
   *
   * If the parent supplies onStudentPatch, use that.
   * Otherwise update Base44 directly.
   *
   * This avoids making the parent AND this component both persist
   * the same change.
   */
  const persistPatch = async patch => {
    if (onStudentPatch) {
      await onStudentPatch(patch);
      return;
    }

    if (studentData?.id) {
      try {
        await base44.entities.Student.update(
          studentData.id,
          patch
        );
      } catch {}
    }
  };

  const spendSpinCoins = async () => {
    if (typeof onSpend === 'function') {
      onSpend(SPIN_COST);

      setCoins(current =>
        Math.max(0, current - SPIN_COST)
      );

      return;
    }

    const nextCoins = Math.max(
      0,
      coins - SPIN_COST
    );

    setCoins(nextCoins);

    await persistPatch({
      coins: nextCoins,
    });
  };

  const spin = async () => {
    if (
      spinning ||
      winner ||
      !canAfford ||
      !reel.length
    ) {
      return;
    }

    /*
     * Paid spin:
     * deduct coins only when the student actually presses Spin.
     */
    if (!freeSpin) {
      await spendSpinCoins();
    }

    /*
     * Select the winning CATEGORY first using the real weights.
     */
    const winningReward = pickPrize(
      redeemedPrizes,
      characterRewardsEnabled
    );

    const winnerTile = makeTile(
      winningReward,
      characters
    );

    /*
     * Build the visible reel separately.
     * The visual reel does NOT determine probability.
     */
    const tiles = [];

    for (let i = 0; i < REEL_LEN; i++) {
      const reward = pickPrize(
        redeemedPrizes,
        characterRewardsEnabled
      );

      tiles.push(
        makeTile(reward, characters)
      );
    }

    /*
     * Force the predetermined result near the end.
     */
    const winIdx = REEL_LEN - 5;
    tiles[winIdx] = winnerTile;

    setReel(tiles);
    setOffset(0);
    setWinner(null);
    setSpinning(true);

    /*
     * Same CharacterWheel behavior:
     * winner lands in center visible row.
     */
    const target =
      (winIdx - 1) * ITEM_H;

    startRef.current = null;

    const easeOut = t =>
      1 - Math.pow(1 - t, 5);

    const animate = timestamp => {
      if (!startRef.current) {
        startRef.current = timestamp;
      }

      const progress = Math.min(
        (timestamp - startRef.current) / SPIN_MS,
        1
      );

      setOffset(
        target * easeOut(progress)
      );

      if (progress < 1) {
        animRef.current =
          requestAnimationFrame(animate);
      } else {
        setOffset(target);
        setSpinning(false);
        setWinner(winnerTile);
      }
    };

    animRef.current =
      requestAnimationFrame(animate);
  };

  const claimCharacter = async char => {
    const duplicate =
      unlockedCharacters.includes(char.id);

    /*
     * DUPLICATE
     * +40 coins toward another 100-coin spin.
     */
    if (duplicate) {
      const nextCoins =
        coins + DUPLICATE_CHARACTER_COINS;

      setCoins(nextCoins);

      await persistPatch({
        coins: nextCoins,
      });

      return {
        id: char.id,
        type: 'character',
        label: char.name || 'Character',
        character: char,
        duplicate: true,
        coins_awarded:
          DUPLICATE_CHARACTER_COINS,
        coin_balance: nextCoins,
      };
    }

    /*
     * NEW CHARACTER
     *
     * If the old CharacterWheel caller supplied onUnlock,
     * preserve its original unlock behavior.
     */
    if (typeof onUnlock === 'function') {
      onUnlock(char.id);

      setUnlockedCharacters(current =>
        current.includes(char.id)
          ? current
          : [...current, char.id]
      );
    } else {
      const nextUnlocked = [
        ...unlockedCharacters,
        char.id,
      ];

      setUnlockedCharacters(nextUnlocked);

      const patch = {
        unlocked_characters: nextUnlocked,
      };

      /*
       * Keep the first unlocked character usable immediately.
       */
      if (!studentData?.active_character) {
        patch.active_character = char.id;
      }

      await persistPatch(patch);
    }

    return {
      id: char.id,
      type: 'character',
      label: char.name || 'Character',
      character: char,
      duplicate: false,
      coins_awarded: 0,
    };
  };

  const claimNormalReward = async reward => {
    /*
     * Keep compatibility with PrizeDashboard's active_prizes field.
     */
    const nextActivePrizes =
      activePrizes.includes(reward.id)
        ? activePrizes
        : [...activePrizes, reward.id];

    setActivePrizes(nextActivePrizes);

    const patch = {
      active_prizes: nextActivePrizes,
    };

    /*
     * PrizeDashboard already uses cushion_since to order
     * the cushion queue.
     */
    if (reward.id === 'cushion') {
      patch.cushion_since = Date.now();
    }

    await persistPatch(patch);

    return {
      ...reward,
      duplicate: false,
      coins_awarded: 0,
    };
  };

  const claimWinner = async () => {
    if (!winner) return;

    let result;

    if (winner.type === 'character') {
      result = await claimCharacter(
        winner.char
      );
    } else {
      result = await claimNormalReward(
        winner.reward
      );
    }

    /*
     * Record every claim in prize_history so the teacher dashboard
     * can show counts and track give-out status.
     */
    const historyEntry = {
      id: result.id,
      label: result.label,
      emoji:
        winner.type === 'character'
          ? '🧑'
          : winner.reward?.emoji || '🎁',
      type: result.type,
      claimed_at: new Date().toISOString(),
      given: false,
    };

    const nextHistory = [
      ...(studentData?.prize_history || []),
      historyEntry,
    ];

    await persistPatch({
      prize_history: nextHistory,
    });

    /*
     * Preserve old PrizeWheel onClaim behavior.
     */
    onClaim?.(result);

    onClose?.();
  };

  const translateY = -offset;

  const winnerIsDuplicate =
    winner?.type === 'character' &&
    unlockedCharacters.includes(
      winner.char?.id
    );

  const renderTile = tile => {
    if (tile.type === 'character') {
      return (
        <div
          className="flex flex-col items-center justify-center"
          style={{
            height: ITEM_H - 8,
          }}
        >
          <img
            src={tile.char?.url}
            alt=""
            style={{
              width: 90,
              height: 90,
              objectFit: 'cover',
              borderRadius: 12,
              border: '2px solid #fde68a',
            }}
          />

          {tile.char?.name && (
            <span className="text-xs font-bold text-gray-600 mt-0.5 truncate max-w-[180px]">
              {tile.char.name}
            </span>
          )}
        </div>
      );
    }

    const reward = tile.reward;

    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          height: ITEM_H - 8,
        }}
      >
        <span
          style={{
            fontSize: 56,
          }}
        >
          {reward?.emoji}
        </span>

        <span className="text-xs font-black text-gray-700 mt-1">
          {reward?.label}
        </span>
      </div>
    );
  };

  const renderWinner = () => {
    if (winner.type === 'character') {
      return (
        <>
          <img
            src={winner.char?.url}
            alt="character"
            style={{
              width: RESULT_H,
              height: RESULT_H,
            }}
            className="rounded-2xl border-4 border-amber-300 shadow-lg object-cover"
          />

          {winnerIsDuplicate ? (
            <>
              <p className="text-xl font-black text-gray-800 text-center">
                You already have this character!
              </p>

              <div className="bg-amber-100 border-2 border-amber-300 rounded-2xl px-5 py-3 text-center">
                <div className="text-3xl font-black text-amber-700">
                  🪙 +{DUPLICATE_CHARACTER_COINS}
                </div>

                <div className="text-xs font-bold text-amber-600 mt-1">
                  Duplicate Character Bonus
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xl font-black text-gray-800 text-center">
                New character unlocked!
              </p>

              {winner.char?.name && (
                <p className="text-sm font-bold text-amber-600">
                  {winner.char.name}
                </p>
              )}
            </>
          )}
        </>
      );
    }

    const reward = winner.reward;

    return (
      <>
        <div
          style={{
            width: RESULT_H,
            height: RESULT_H,
            background:
              reward?.color || '#fde68a',
          }}
          className="rounded-2xl border-4 border-amber-300 shadow-lg flex items-center justify-center"
        >
          <span
            style={{
              fontSize: 100,
            }}
          >
            {reward?.emoji}
          </span>
        </div>

        <p className="text-xl font-black text-gray-800 text-center">
          {reward?.label}
        </p>

        {reward?.type === 'physical' && (
          <p className="text-sm font-bold text-amber-600 text-center">
            Show your teacher to claim your prize! 🎉
          </p>
        )}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60"
      onClick={e => {
        if (
          e.target === e.currentTarget &&
          !spinning &&
          !winner
        ) {
          onClose?.();
        }
      }}
    >
      <motion.div
        initial={{
          scale: 0.7,
          opacity: 0,
        }}
        animate={{
          scale: 1,
          opacity: 1,
        }}
        className="bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-3 mx-4 w-full max-w-sm relative max-h-[92vh] overflow-y-auto"
      >
        {!winner && (
          <button
            onClick={() => onClose?.()}
            disabled={spinning}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 z-10 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <h2 className="text-2xl font-black text-amber-600">
          🎯 Reward Spin
        </h2>

        <p className="text-sm text-gray-500 font-bold text-center">
          {freeSpin
            ? 'You earned a FREE spin!'
            : `Spend ${SPIN_COST} coins to spin!`}
        </p>

        {/* Coin progress */}
        {studentData && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-amber-800">
                🪙 {coins} coins
              </span>

              <span className="text-xs font-black text-amber-600">
                {Math.min(coins, SPIN_COST)}/{SPIN_COST}
              </span>
            </div>

            <div className="mt-1.5 h-2.5 bg-amber-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    (coins / SPIN_COST) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {winner ? (
          <motion.div
            initial={{
              scale: 0,
              opacity: 0,
            }}
            animate={{
              scale: 1,
              opacity: 1,
            }}
            className="w-full flex flex-col items-center gap-3"
          >
            {renderWinner()}

            <button
              onClick={claimWinner}
              className="w-full py-3 rounded-2xl bg-green-500 text-white font-black text-lg shadow hover:bg-green-600 active:scale-95"
            >
              🎉 Claim Reward!
            </button>
          </motion.div>
        ) : (
          <>
            {/* CharacterWheel-style vertical reel */}
            <div
              className="relative"
              style={{
                width: 240,
              }}
            >
              {/* Winning-row pointer */}
              <div
                className="absolute z-20"
                style={{
                  top: ITEM_H + ITEM_H / 2,
                  right: -6,
                  transform:
                    'translateY(-50%)',
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop:
                      '12px solid transparent',
                    borderBottom:
                      '12px solid transparent',
                    borderRight:
                      '18px solid #ef4444',
                  }}
                />
              </div>

              <div
                style={{
                  height: WINDOW_H,
                  overflow: 'hidden',
                  position: 'relative',
                  borderRadius: 20,
                  border:
                    '4px solid #fcd34d',
                  background:
                    'rgba(252,211,77,0.08)',
                  boxShadow:
                    'inset 0 2px 12px rgba(0,0,0,0.1)',
                }}
              >
                <div
                  style={{
                    transform: `translateY(${translateY}px)`,
                    willChange: 'transform',
                  }}
                >
                  {reel.map((tile, index) => (
                    <div
                      key={index}
                      style={{
                        height: ITEM_H,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {renderTile(tile)}
                    </div>
                  ))}
                </div>

                {/* Center winning row */}
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: ITEM_H,
                    height: ITEM_H,
                    boxShadow:
                      'inset 0 0 0 3px #ef4444',
                    borderRadius: 12,
                  }}
                />
              </div>
            </div>

            <button
              onClick={spin}
              disabled={
                spinning || !canAfford
              }
              className={`w-full py-3 rounded-2xl font-black text-lg shadow-lg transition ${
                spinning
                  ? 'bg-gray-200 text-gray-400'
                  : canAfford
                    ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {spinning
                ? '🌀 Spinning…'
                : freeSpin
                  ? '🎯 FREE SPIN!'
                  : canAfford
                    ? `🎯 SPIN (${SPIN_COST} 🪙)`
                    : `Need ${SPIN_COST} 🪙`}
            </button>

            {!spinning &&
              !freeSpin &&
              coins < SPIN_COST && (
                <p className="text-xs font-bold text-gray-400 text-center">
                  Earn {SPIN_COST - coins} more coins for another spin.
                </p>
              )}

            {!spinning && (
              <button
                onClick={() => onClose?.()}
                className="text-xs text-gray-400 font-bold hover:text-gray-600"
              >
                Skip for now
              </button>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}