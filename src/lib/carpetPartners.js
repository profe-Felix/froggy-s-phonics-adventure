// Carpet partner computation logic.
//
// Row layout: [5, 5, 6, 5, 5] = 26 seats
//   Row 0 (red,   5 seats) — partners with Row 1 (green)
//   Row 1 (green, 5 seats) — partners with Row 0 (red)
//   Row 2 (blue,  6 seats) — WALKWAY (teacher walks here, no partners)
//   Row 3 (pink,  5 seats) — partners with Row 4 (aqua)
//   Row 4 (aqua,  5 seats) — partners with Row 3 (pink)
//
// Natural partners: same column index in adjacent row (red pos 0 ↔ green pos 0, etc.)
// When a student's partner is absent/stepped_out, they become "solo".
// Solos are reassigned by PROXIMITY: sort by column position, pair adjacent.
// For a single solo, join the CLOSEST natural pair (by column distance) to form a trio.

const ROW_SIZES = [5, 5, 6, 5, 5];
const PARTNER_ROW_PAIRS = [[0, 1], [3, 4]]; // red↔green, pink↔aqua; row 2 (blue) is walkway

export function getRowStart(rowIdx) {
  return ROW_SIZES.slice(0, rowIdx).reduce((a, b) => a + b, 0);
}

/**
 * Compute partner assignments for all present students.
 * Uses column-position proximity for solo reassignment so partners
 * are always the physically closest available students.
 * @param {Array} seats — CarpetSeat records
 * @param {Object} studentMap — { student_id → student }
 * @returns {Object} { student_id → { partnerIds: [], isTemporary: bool, isTrio: bool } }
 */
export function computePartners(seats, studentMap) {
  const result = {};
  if (!seats || !studentMap) return result;

  for (const [rowA, rowB] of PARTNER_ROW_PAIRS) {
    const startA = getRowStart(rowA);
    const startB = getRowStart(rowB);
    const maxSize = Math.max(ROW_SIZES[rowA], ROW_SIZES[rowB]);

    const naturalPairs = []; // { a, b, pos } — both present
    const solos = [];        // { id, pos } — partner is out/empty

    for (let i = 0; i < maxSize; i++) {
      const seatA = seats.find((s) => s.position === startA + i);
      const seatB = seats.find((s) => s.position === startB + i);
      const statusA = seatA?.status || 'present';
      const statusB = seatB?.status || 'present';
      const studentA = seatA?.student_id && statusA === 'present' ? studentMap[seatA.student_id] : null;
      const studentB = seatB?.student_id && statusB === 'present' ? studentMap[seatB.student_id] : null;

      if (studentA && studentB) {
        naturalPairs.push({ a: studentA.id, b: studentB.id, pos: i });
        result[studentA.id] = { partnerIds: [studentB.id], isTemporary: false, isTrio: false };
        result[studentB.id] = { partnerIds: [studentA.id], isTemporary: false, isTrio: false };
      } else if (studentA) {
        solos.push({ id: studentA.id, pos: i });
      } else if (studentB) {
        solos.push({ id: studentB.id, pos: i });
      }
    }

    if (solos.length === 0) continue;

    // Sort solos by column position so we pair the closest ones
    solos.sort((a, b) => a.pos - b.pos);

    if (solos.length % 2 === 0) {
      // Even: pair adjacent solos (closest to closest)
      for (let i = 0; i < solos.length; i += 2) {
        result[solos[i].id] = { partnerIds: [solos[i + 1].id], isTemporary: true, isTrio: false };
        result[solos[i + 1].id] = { partnerIds: [solos[i].id], isTemporary: true, isTrio: false };
      }
    } else if (solos.length >= 3) {
      // Odd, 3+: first three (closest together) form a trio, rest pair up
      result[solos[0].id] = { partnerIds: [solos[1].id, solos[2].id], isTemporary: true, isTrio: true };
      result[solos[1].id] = { partnerIds: [solos[0].id, solos[2].id], isTemporary: true, isTrio: true };
      result[solos[2].id] = { partnerIds: [solos[0].id, solos[1].id], isTemporary: true, isTrio: true };
      for (let i = 3; i < solos.length; i += 2) {
        if (i + 1 < solos.length) {
          result[solos[i].id] = { partnerIds: [solos[i + 1].id], isTemporary: true, isTrio: false };
          result[solos[i + 1].id] = { partnerIds: [solos[i].id], isTemporary: true, isTrio: false };
        } else {
          result[solos[i].id] = { partnerIds: [], isTemporary: false, isTrio: false };
        }
      }
    } else {
      // 1 solo: join the natural pair CLOSEST to the solo's column position
      if (naturalPairs.length > 0) {
        const soloPos = solos[0].pos;
        let closestPair = naturalPairs[0];
        let minDist = Math.abs(closestPair.pos - soloPos);
        for (const np of naturalPairs) {
          const dist = Math.abs(np.pos - soloPos);
          if (dist < minDist) {
            minDist = dist;
            closestPair = np;
          }
        }
        result[closestPair.a] = { partnerIds: [closestPair.b, solos[0].id], isTemporary: false, isTrio: true };
        result[closestPair.b] = { partnerIds: [closestPair.a, solos[0].id], isTemporary: false, isTrio: true };
        result[solos[0].id] = { partnerIds: [closestPair.a, closestPair.b], isTemporary: true, isTrio: true };
      } else {
        result[solos[0].id] = { partnerIds: [], isTemporary: false, isTrio: false };
      }
    }
  }

  return result;
}