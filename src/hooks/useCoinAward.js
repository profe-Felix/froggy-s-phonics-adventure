import { useRef, useEffect, useCallback } from 'react';

// Awards coins to the current student mid-game without double-counting.
//
// Keeps a local balance ref synced with studentData.coins so several awards
// in quick succession (before React re-renders) each add to the real total
// instead of racing on stale state. Falls back to a direct Base44 write when
// no onStudentPatch callback is supplied.
export function useCoinAward(studentData, onStudentPatch) {
  const balanceRef = useRef(Number(studentData?.coins || 0));
  // Tracks in-flight award writes. While > 0, the sync effect is skipped so
  // a stale server response from a concurrent progress update (which returns
  // the full student record with old coins) can't reset balanceRef and
  // cause the next award to start from the wrong base.
  const pendingAwardsRef = useRef(0);

  useEffect(() => {
    if (pendingAwardsRef.current > 0) return;
    balanceRef.current = Number(studentData?.coins || 0);
  }, [studentData?.coins]);

  return useCallback(
    async (amount) => {
      if (!amount || amount <= 0) return;
      pendingAwardsRef.current++;
      const newBalance = balanceRef.current + amount;
      // Optimistic: update the ref immediately so a second award before the
      // state refresh still adds to the real total.
      balanceRef.current = newBalance;

      const patch = { coins: newBalance };

      if (onStudentPatch) {
        try {
          await onStudentPatch(patch);
        } catch (err) {
          // Roll back on failure so the next attempt uses the real balance.
          balanceRef.current = Number(studentData?.coins || 0);
          console.error('Could not award coins:', err);
        } finally {
          pendingAwardsRef.current = Math.max(0, pendingAwardsRef.current - 1);
        }
        return;
      }

      // No parent patch callback — write directly.
      if (!studentData?.id) return;
      try {
        const { base44 } = await import('@/api/base44Client');
        await base44.entities.Student.update(studentData.id, patch);
      } catch (err) {
        balanceRef.current = Number(studentData?.coins || 0);
        console.error('Could not award coins:', err);
      } finally {
        pendingAwardsRef.current = Math.max(0, pendingAwardsRef.current - 1);
      }
    },
    [onStudentPatch, studentData?.id, studentData?.coins]
  );
}