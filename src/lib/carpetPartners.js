// Carpet partner computation logic.
//
// Row layout: [5, 5, 6, 5, 5] = 26 seats
//   Row 0 (red,   5 seats) — partners with Row 1 (green)
//   Row 1 (green, 5 seats) — partners with Row 0 (red)
//   Row 2 (blue,  6 seats) — WALKWAY (teacher walks here, no partners)
//   Row 3 (pink,  5 seats) — partners with Row 4 (aqua)
//   Row 4 (aqua,  5 seats) — partners with Row 3 (pink)
//
// Natural partners: same index in adjacent row (red pos 0 ↔ green pos 0, etc.)
// When a student's partner is absent/stepped_out, they become "solo".
// Solos are temporarily reassigned: even count → pairs, odd count → one trio.

const ROW_SIZES = [5, 5, 6, 5, 5];
const PARTNER_ROW_PAIRS = [[0, 1], [3, 4]]; // red↔green, pink↔aqua; row 2 (blue) is walkway

export function getRowStart(rowIdx) {
  return ROW_SIZES.slice(0, rowIdx).reduce((a, b) => a + b, 0);
}

/**
 * Compute partner assignments for all present students.
 * @param {Array} seats — CarpetSeat records (sorted by position)
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

    const naturalPairs = []; // { a, b } — both present
    const solos = [];        // student_ids whose partner is out/empty

    for (let i = 0; i < maxSize; i++) {
      const seatA = seats.find((s) => s.position === startA + i);
      const seatB = seats.find((s) => s.position === startB + i);
      const statusA = seatA?.status || 'present';
      const statusB = seatB?.status || 'present';
      const studentA = seatA?.student_id && statusA === 'present' ? studentMap[seatA.student_id] : null;
      const studentB = seatB?.student_id && statusB === 'present' ? studentMap[seatB.student_id] : null;

      if (studentA && studentB) {
        naturalPairs.push({ a: studentA.id, b: studentB.id });
        result[studentA.id] = { partnerIds: [studentB.id], isTemporary: false, isTrio: false };
        result[studentB.id] = { partnerIds: [studentA.id], isTemporary: false, isTrio: false };
      } else if (studentA) {
        solos.push(studentA.id);
      } else if (studentB) {
        solos.push(studentB.id);
      }
    }

    if (solos.length === 0) continue;

    if (solos.length % 2 === 0) {
      // Even: pair up sequentially
      for (let i = 0; i < solos.length; i += 2) {
        result[solos[i]] = { partnerIds: [solos[i + 1]], isTemporary: true, isTrio: false };
        result[solos[i + 1]] = { partnerIds: [solos[i]], isTemporary: true, isTrio: false };
      }
    } else if (solos.length >= 3) {
      // Odd, 3+: first three form a trio, rest pair up
      result[solos[0]] = { partnerIds: [solos[1], solos[2]], isTemporary: true, isTrio: true };
      result[solos[1]] = { partnerIds: [solos[0], solos[2]], isTemporary: true, isTrio: true };
      result[solos[2]] = { partnerIds: [solos[0], solos[1]], isTemporary: true, isTrio: true };
      for (let i = 3; i < solos.length; i += 2) {
        if (i + 1 < solos.length) {
          result[solos[i]] = { partnerIds: [solos[i + 1]], isTemporary: true, isTrio: false };
          result[solos[i + 1]] = { partnerIds: [solos[i]], isTemporary: true, isTrio: false };
        } else {
          result[solos[i]] = { partnerIds: [], isTemporary: false, isTrio: false };
        }
      }
    } else {
      // 1 solo: join the first natural pair to make a trio
      if (naturalPairs.length > 0) {
        const pair = naturalPairs[0];
        result[pair.a] = { partnerIds: [pair.b, solos[0]], isTemporary: false, isTrio: true };
        result[pair.b] = { partnerIds: [pair.a, solos[0]], isTemporary: false, isTrio: true };
        result[solos[0]] = { partnerIds: [pair.a, pair.b], isTemporary: true, isTrio: true };
      } else {
        result[solos[0]] = { partnerIds: [], isTemporary: false, isTrio: false };
      }
    }
  }

  return result;
}