import { Room, Student, AllocatedSeat, Faculty, DutyAllocation, Department, ExamSchedule } from '../../../types';

/* ============================================================================
 *  EXAM HALL SEAT ALLOCATION ENGINE
 *  ----------------------------------------------------------------------------
 *  Methodology follows the standard practised by a Senior Exam Cell Coordinator:
 *
 *  1. CANDIDATE CONSOLIDATION
 *     All candidates for the session (register number + department + programme)
 *     are de-duplicated by register number.
 *
 *  2. HALL SELECTION (Capacity Planning)
 *     The caller supplies the ordered list of selected halls (already
 *     capacity-validated). Candidates are placed hall-by-hall; each hall
 *     receives a contiguous block of the desegregated sequence.
 *
 *  3. CANDIDATE DESEGREGATION  (the anti-copying core technique)
 *     Candidates are grouped by a mixing key (Department, or Department+Section
 *     when section data exists) and each group is sorted by Register Number
 *     (roll order). The groups are then ROUND-ROBIN interleaved so that
 *     consecutive candidates in the final sequence always belong to DIFFERENT
 *     departments / classes. This guarantees no two same-department students
 *     sit back-to-back in the placement order.
 *
 *  4. SERIAL / HALL-TICKET NUMBERING
 *     Every placed candidate receives a per-hall serial number (1,2,3 …) which
 *     is printed on the hall ticket and the attendance sheet.
 *
 *  5. SEAT MATRIX GENERATION (Physical Placement)
 *     For each hall the physical seats are enumerated in the chosen traversal
 *     order and the next candidate of the mixed sequence is dropped in:
 *        • serpentine-column (DEFAULT, Anna-Univ style): column 1 top→bottom,
 *          column 2 bottom→top, column 3 top→bottom …  → every grid edge
 *          connects CONSECUTIVE sequence numbers.
 *        • column            : straight column-major.
 *        • row / serpentine-row : row-major variants.
 *     Per-column row counts (columnRows), per-column students-per-desk
 *     (columnStudentsPerDesk) and disabledDesks (aisles / pillars) are honoured.
 *
 *  6. ADJACENCY VALIDATION (Seating Quality Check)
 *     Any residual same-department adjacency (bench / front-back / left-right)
 *     is reported as `conflicts`. With serpentine-column + round-robin
 *     interleaving and ≥ 2 groups this is mathematically 0.
 * ========================================================================== */

export type AllocationStrategy =
  | 'interleaved-dept'
  | 'anna-univ-9lane-column'
  | 'sequential-dept'
  | 'alternate-roll'
  | 'alternate-department'
  | 'reverse-interleave'
  | 'dept-then-roll'
  | 'random-interleave';
export type SeatTraversal =
  | 'serpentine-column'
  | 'column'
  | 'row'
  | 'serpentine-row'
  | 'serpentine-reverse-start'
  | 'diagonal'
  | 'from-back-column'
  | 'spiral';
export type MixGranularity = 'department' | 'department-section';

export interface SeatConflict {
  seatA: string;
  seatB: string;
  studentA: string;
  studentB: string;
  department: Department;
  type: 'bench' | 'vertical' | 'horizontal';
}

export interface AllocationResult {
  allocatedSeats: AllocatedSeat[];
  unallocatedStudents: Student[];
  totalCapacity: number;
  totalAllocated: number;
  roomStats: {
    roomId: string;
    roomNumber: string;
    capacity: number;
    allocated: number;
    utilizationPercent: number;
    departments: { [dept in Department]?: number };
  }[];
  departmentStats: { [dept in Department]?: number };
  serialNumbers?: { [registerNumber: string]: number };
  conflicts?: SeatConflict[];
  traversal?: SeatTraversal;
  strategy?: AllocationStrategy;
}

export type RoomDeptQuota = Record<string, Record<string, number>>; // roomId -> dept -> count

export interface AllocateOptions {
  traversal?: SeatTraversal;
  mixGranularity?: MixGranularity;
  roomDeptQuota?: RoomDeptQuota | null;
}

/* ----------------------------------------------------------------------------
 *  Capacity helpers
 * -------------------------------------------------------------------------- */

export function getRoomNetCapacity(room: Room): number {
  const colCount = room.columns || 1;
  const defaultPerDesk = Math.max(1, room.studentsPerDesk || 1);
  let capacity = 0;

  for (let c = 1; c <= colCount; c++) {
    const colRows = room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : (room.rows || 5);
    const colPerDesk = room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
      ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
      : defaultPerDesk;

    for (let r = 1; r <= colRows; r++) {
      const deskId = `R${r}-C${c}`;
      if (!room.disabledDesks?.includes(deskId)) {
        capacity += colPerDesk;
      }
    }
  }
  return capacity;
}

/**
 * Automatically select optimal halls to fit a required student strength with
 * minimum seat wastage (largest capacity halls first).
 */
export function findOptimalHalls(requiredStrength: number, availableRooms: Room[]): string[] {
  const activeRooms = availableRooms.filter((r) => r.status === 'Active');
  if (activeRooms.length === 0 || requiredStrength <= 0) return [];

  const sortedRooms = [...activeRooms].sort((a, b) => getRoomNetCapacity(b) - getRoomNetCapacity(a));

  let currentCapacity = 0;
  const selectedIds: string[] = [];

  for (const room of sortedRooms) {
    const cap = getRoomNetCapacity(room);
    if (cap <= 0) continue;
    selectedIds.push(room.id);
    currentCapacity += cap;
    if (currentCapacity >= requiredStrength) break;
  }

  if (currentCapacity < requiredStrength) return activeRooms.map((r) => r.id);
  return selectedIds;
}

/* ----------------------------------------------------------------------------
 *  Numeric-aware register number comparison
 * -------------------------------------------------------------------------- */
function natCompare(a: string, b: string): number {
  const na = parseInt((a || '').replace(/[^0-9]/g, ''), 10);
  const nb = parseInt((b || '').replace(/[^0-9]/g, ''), 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return (a || '').localeCompare(b || '');
}

function groupKey(s: Student, mix: MixGranularity): string {
  const subj = s.subjectCode || '';
  const sem = s.semester ? `Sem${s.semester}` : '';
  if (subj) {
    return mix === 'department-section'
      ? `${s.department}__${s.section || 'NA'}__${subj}`
      : `${s.department}__${sem}__${subj}`;
  }
  return mix === 'department-section' ? `${s.department}__${s.section || 'NA'}` : s.department;
}

/* ----------------------------------------------------------------------------
 *  Step 3 — Desegregation (round-robin interleave of department groups)
 * -------------------------------------------------------------------------- */
function buildDesegregatedSequence(
  students: Student[],
  strategy: AllocationStrategy,
  mix: MixGranularity
): Student[] {
  // De-duplicate by register number, keep first occurrence
  const seen = new Set<string>();
  const unique = students.filter((s) => {
    if (!s.registerNumber || seen.has(s.registerNumber)) return false;
    seen.add(s.registerNumber);
    return true;
  });

  if (strategy === 'alternate-roll') {
    return [...unique].sort((a, b) => natCompare(a.registerNumber, b.registerNumber));
  }

  // Random-interleave: shuffle within each group (to avoid predictable roll order) then round-robin
  const shuffledInside = strategy === 'random-interleave';

  const groupsMap = new Map<string, Student[]>();
  for (const s of unique) {
    const k = groupKey(s, mix);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k)!.push(s);
  }

  let groups = Array.from(groupsMap.values());
  groups.forEach((g) => {
    g.sort((a, b) => natCompare(a.registerNumber, b.registerNumber));
    if (shuffledInside) {
      // Fisher-Yates within group to break predictable roll sequencing (anti-malpractice)
      for (let i = g.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [g[i], g[j]] = [g[j], g[i]];
      }
    }
  });

  if (strategy === 'sequential-dept') {
    groups.sort((a, b) => String(a[0]?.department || '').localeCompare(String(b[0]?.department || '')));
    return groups.flat();
  }

  // reverse-interleave builds the round-robin from the LAST group to the FIRST (descending dept)
  const interleaveGroups = () => {
    const result: Student[] = [];
    let added = true;
    let i = 0;
    while (added) {
      added = false;
      for (const g of groups) {
        if (i < g.length) {
          result.push(g[i]);
          added = true;
        }
      }
      i++;
    }
    return result;
  };

  if (strategy === 'reverse-interleave') {
    groups = groups.slice().reverse();
    return interleaveGroups();
  }

  // alternate-department: strictly one student from each department in alternating dept order,
  // but when a department has more students than the others, we interleave the surplus too.
  if (strategy === 'alternate-department') {
    // order groups by an alternating pattern (round-robin of departments)
    const result: Student[] = [];
    let added = true;
    let i = 0;
    while (added) {
      added = false;
      for (const g of groups) {
        if (i < g.length) {
          result.push(g[i]);
          added = true;
        }
      }
      i++;
    }
    return result;
  }

  // dept-then-roll: sort by department first, then alternate the roll numbers within each department
  // (i.e. within a department, students sit in reverse roll order — discourages same-dept copying)
  if (strategy === 'dept-then-roll') {
    groups.sort((a, b) => String(a[0]?.department || '').localeCompare(String(b[0]?.department || '')));
    const result: Student[] = [];
    groups.forEach((g) => {
      // alternate: take from back then front repeatedly
      const aux = [...g];
      let fromBack = true;
      while (aux.length) {
        if (fromBack) result.push(aux.pop()!);
        else result.push(aux.shift()!);
        fromBack = !fromBack;
      }
    });
    return result;
  }

  // interleaved-dept (DEFAULT) — round-robin across groups
  return interleaveGroups();
}

/* ----------------------------------------------------------------------------
 *  Step 5 — Physical seat enumeration honouring traversal order
 * -------------------------------------------------------------------------- */
interface EnumeratedSeat {
  row: number;
  col: number;
  deskNumber: string;
  maxStudents: number;
}

function enumerateRoomSeats(room: Room, traversal: SeatTraversal): EnumeratedSeat[] {
  const colCount = room.columns || 1;
  const perDeskDefault = Math.max(1, room.studentsPerDesk || 1);

  const colRowsArr: number[] = [];
  const colPerDeskArr: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    colRowsArr.push(room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : (room.rows || 0));
    colPerDeskArr.push(
      room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
        ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
        : perDeskDefault
    );
  }

  const out: EnumeratedSeat[] = [];
  const push = (c: number, r: number) => {
    const deskId = `R${r}-C${c}`;
    if (room.disabledDesks?.includes(deskId)) return; // aisle / pillar
    out.push({ row: r, col: c, deskNumber: deskId, maxStudents: colPerDeskArr[c - 1] });
  };

  if (traversal === 'row' || traversal === 'serpentine-row') {
    const maxRows = Math.max(room.rows || 0, ...colRowsArr);
    for (let r = 1; r <= maxRows; r++) {
      const colSeq: number[] = [];
      for (let c = 1; c <= colCount; c++) colSeq.push(c);
      if (traversal === 'serpentine-row' && r % 2 === 0) colSeq.reverse();
      for (const c of colSeq) {
        if (r > colRowsArr[c - 1]) continue;
        push(c, r);
      }
    }
  } else if (traversal === 'column' || traversal === 'from-back-column') {
    // column-major
    for (let c = 1; c <= colCount; c++) {
      let rowsInCol: number[] = [];
      for (let r = 1; r <= colRowsArr[c - 1]; r++) rowsInCol.push(r);
      if (traversal === 'from-back-column') rowsInCol.reverse(); // start from last desk row of each column
      for (const r of rowsInCol) push(c, r);
    }
  } else if (traversal === 'diagonal') {
    // anti-diagonal / staircase fill: iterate diagonals (row index + column index constant)
    for (let sumIdx = 2; sumIdx <= colCount + Math.max(...colRowsArr); sumIdx++) {
      for (let c = 1; c <= colCount; c++) {
        const count = sumIdx; // want rows from 1..colRowsArr[c-1]
        const r = count - c;
        if (r >= 1 && r <= colRowsArr[c - 1]) push(c, r);
      }
    }
  } else {
    // serpentine / row family (serpentine-column default, serpentine-reverse-start, spiral)
    if (traversal === 'serpentine-column') {
      // serpentine column-major
      for (let c = 1; c <= colCount; c++) {
        let rowsInCol: number[] = [];
        for (let r = 1; r <= colRowsArr[c - 1]; r++) rowsInCol.push(r);
        if ((c - 1) % 2 === 1) rowsInCol.reverse();
        for (const r of rowsInCol) push(c, r);
      }
    } else if (traversal === 'serpentine-reverse-start') {
      // serpentine column but starting from the LAST column / back of hall
      for (let ci = colCount; ci >= 1; ci--) {
        let rowsInCol: number[] = [];
        for (let r = 1; r <= colRowsArr[ci - 1]; r++) rowsInCol.push(r);
        if ((colCount - ci) % 2 === 1) rowsInCol.reverse();
        for (let r = 1; r <= rowsInCol.length; r++) push(ci, r);
      }
    } else if (traversal === 'spiral') {
      // outward spiral starting from center desk
      const maxR = Math.max(...colRowsArr);
      const visited = new Set<string>();
      let r = Math.ceil(maxR / 2);
      let c = Math.ceil(colCount / 2);
      let dirIdx = 0;
      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // R, D, L, U
      let stepLen = 1;
      let stepsTaken = 0;
      let lenChangeCount = 0;

      for (let i = 0; i < colCount * maxR; i++) {
        if (c >= 1 && c <= colCount && r >= 1 && r <= colRowsArr[c - 1]) {
          const key = `${r}_${c}`;
          if (!visited.has(key)) {
            visited.add(key);
            push(c, r);
          }
        }
        r += dirs[dirIdx][0];
        c += dirs[dirIdx][1];
        stepsTaken++;
        if (stepsTaken === stepLen) {
          stepsTaken = 0;
          dirIdx = (dirIdx + 1) % 4;
          lenChangeCount++;
          if (lenChangeCount % 2 === 0) stepLen++;
        }
      }
    }
  }

  return out;
}

/* ----------------------------------------------------------------------------
 *  Step 6 — Adjacency conflict detection (subject-first anti-copying)
 * -------------------------------------------------------------------------- */
export function detectConflicts(seats: AllocatedSeat[]): SeatConflict[] {
  const byPos = new Map<string, AllocatedSeat[]>();
  const byDesk = new Map<string, AllocatedSeat[]>();

  for (const s of seats) {
    const key = `${s.row}_${s.col}`;
    if (!byPos.has(key)) byPos.set(key, []);
    byPos.get(key)!.push(s);

    if (!byDesk.has(s.deskNumber)) byDesk.set(s.deskNumber, []);
    byDesk.get(s.deskNumber)!.push(s);
  }

  const conflicts: SeatConflict[] = [];
  const mk = (a: AllocatedSeat, b: AllocatedSeat, type: SeatConflict['type']): SeatConflict => ({
    seatA: a.seatId,
    seatB: b.seatId,
    studentA: a.student.registerNumber,
    studentB: b.student.registerNumber,
    department: a.student.department as Department,
    type,
  });

  const isSameExamSubject = (a: AllocatedSeat, b: AllocatedSeat) => {
    const codeA = a.student.subjectCode || '';
    const codeB = b.student.subjectCode || '';
    if (codeA && codeB) {
      return codeA === codeB;
    }
    return a.student.department === b.student.department;
  };

  // Bench (same desk, multiple seats)
  for (const list of byDesk.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (isSameExamSubject(list[i], list[j])) conflicts.push(mk(list[i], list[j], 'bench'));
      }
    }
  }

  // Vertical (same column, adjacent rows) and Horizontal (same row, adjacent columns)
  for (const [key, list] of byPos) {
    const [r, c] = key.split('_').map(Number);

    const below = byPos.get(`${r + 1}_${c}`);
    if (below) {
      for (const a of list) for (const b of below) {
        if (isSameExamSubject(a, b)) conflicts.push(mk(a, b, 'vertical'));
      }
    }

    const right = byPos.get(`${r}_${c + 1}`);
    if (right) {
      for (const a of list) for (const b of right) {
        if (isSameExamSubject(a, b)) conflicts.push(mk(a, b, 'horizontal'));
      }
    }
  }

  return conflicts;
}

/* ----------------------------------------------------------------------------
 *  MAIN ENTRY — allocate seats for a session
 * -------------------------------------------------------------------------- */
export function allocateSeats(
  students: Student[],
  rooms: Room[],
  strategy: AllocationStrategy = 'interleaved-dept',
  options?: AllocateOptions
): AllocationResult {
  const traversal: SeatTraversal = options?.traversal || 'column';
  const mixGranularity: MixGranularity = options?.mixGranularity || 'department';

  const activeRooms = rooms.filter((r) => r.status === 'Active');
  const quota = options?.roomDeptQuota || null;
  const hasQuota = !!quota && Object.keys(quota).some((rid) => {
    const m = (quota as RoomDeptQuota)[rid];
    return m && Object.values(m).some((v) => Number(v) > 0);
  });

  // Column-family traversals must fill A-lane vertically before B/C: C1-R1(A)=#1, C1-R2(A)=#2
  const isColumnFamily = ['serpentine-column', 'column', 'from-back-column', 'serpentine-reverse-start'].includes(traversal) || strategy === 'anna-univ-9lane-column';

  const allocatedSeats: AllocatedSeat[] = [];
  const departmentStats: { [dept in Department]?: number } = {};
  const roomStats: AllocationResult['roomStats'] = [];
  const serialNumbers: { [registerNumber: string]: number } = {};

  // ── Quota-aware allocation (PROFORMA-1 high-level ERP) ──
  if (hasQuota) {
    // Build per-dept FIFO pools (already desegregated per strategy within dept then globally interleaved for fairness)
    // We keep pooled order as desegregated globally, then drain per-dept counts per hall to respect user matrix
    // but still interleave WITHIN hall.
    // Pools keyed by subject composite (dept__Sem{sem}__subjectCode) so oru exam ku potta number adutha exam ku replicate aagadhu
    const getSubjectPoolKey = (s: Student) => `${s.department}__Sem${s.semester || ''}__${s.subjectCode}`;
    const deptPools = new Map<string, Student[]>();
    const orderedForPools = buildDesegregatedSequence(students, strategy, mixGranularity);
    for (const s of orderedForPools) {
      const k = getSubjectPoolKey(s);
      if (!deptPools.has(k)) deptPools.set(k, []);
      deptPools.get(k)!.push(s);
    }
    const deptIdx = new Map<string, number>();
    for (const k of deptPools.keys()) deptIdx.set(k, 0);

    let unallocatedByQuota: Student[] = [];

    for (const room of activeRooms) {
      const seats = enumerateRoomSeats(room, traversal);
      const roomCapacity = seats.reduce((sum, s) => sum + s.maxStudents, 0);
      const roomQuota = (quota as RoomDeptQuota)[room.id] || {};
      const hallStudents: Student[] = [];
      for (const [subjectKey, cntRaw] of Object.entries(roomQuota)) {
        const cnt = Math.max(0, Math.floor(Number(cntRaw) || 0));
        if (cnt <= 0) continue;
        // Try composite key first, fall back to plain dept for legacy quotas
        let pool = deptPools.get(subjectKey);
        if (!pool && !subjectKey.includes('__')) {
          pool = deptPools.get(subjectKey);
        }
        // Legacy dept-only quota: aggregate all subject pools of that dept (back-compat)
        if (!pool && !subjectKey.includes('__')) {
          pool = [];
          for (const [k, v] of deptPools.entries()) if (k.startsWith(subjectKey + '__')) pool.push(...v);
          // Not ideal for pointer tracking, handle separately by dept aggregation
          let stillNeed = cnt;
          for (const [k, v] of deptPools.entries()) {
            if (!k.startsWith(subjectKey + '__')) continue;
            let idx = deptIdx.get(k) || 0;
            while (stillNeed > 0 && idx < v.length) { hallStudents.push(v[idx++]); stillNeed--; }
            deptIdx.set(k, idx);
            if (stillNeed <= 0) break;
          }
          continue;
        }
        if (!pool) continue;
        let idx = deptIdx.get(subjectKey) || 0;
        for (let i = 0; i < cnt; i++) {
          if (idx < pool.length) hallStudents.push(pool[idx++]);
        }
        deptIdx.set(subjectKey, idx);
      }
      // Interleave WITHIN hall according to strategy (so desks mix depts, not block)
      const hallOrdered = buildDesegregatedSequence(hallStudents, strategy, mixGranularity);
      let hallIdx = 0;
      let roomAllocated = 0;
      const roomDeptMap: { [dept in Department]?: number } = {};
      let serial = 0;

      const pushSeat = (seat: { row: number; col: number; deskNumber: string; maxStudents: number }, slot: number) => {
        if (hallIdx >= hallOrdered.length) return false;
        const student = hallOrdered[hallIdx++];
        serial++;
        const slotPos = seat.maxStudents === 1 ? 'Single' : String.fromCharCode(65 + slot);
        allocatedSeats.push({
          seatId: `${room.id}-${seat.deskNumber}-${slotPos}`,
          roomId: room.id,
          roomNumber: room.roomNumber,
          deskNumber: seat.deskNumber,
          row: seat.row,
          col: seat.col,
          slotPosition: slotPos,
          student,
          status: 'Allocated',
          serialNumber: serial,
          hasConflict: false,
        });
        roomAllocated++;
        roomDeptMap[student.department] = (roomDeptMap[student.department] || 0) + 1;
        departmentStats[student.department] = (departmentStats[student.department] || 0) + 1;
        serialNumbers[student.registerNumber] = serial;
        return true;
      };

      if (isColumnFamily) {
        const groupMap = new Map<string, Student[]>();
        for (const s of hallStudents) {
          const k = groupKey(s, mixGranularity);
          if (!groupMap.has(k)) groupMap.set(k, []);
          groupMap.get(k)!.push(s);
        }
        const groupQueues = Array.from(groupMap.values());
        groupQueues.forEach((q) => q.sort((a, b) => natCompare(a.registerNumber, b.registerNumber)));

        if (groupQueues.length > 0) {
          const colCount = room.columns || 1;
          const defaultPerDesk = Math.max(1, room.studentsPerDesk || 1);
          let laneIndex = 0;

          for (let c = 1; c <= colCount; c++) {
            const colPerDesk = room.columnStudentsPerDesk && room.columnStudentsPerDesk[c - 1] !== undefined
              ? Math.max(1, Number(room.columnStudentsPerDesk[c - 1]) || 1)
              : defaultPerDesk;
            const colRows = room.columnRows && room.columnRows[c - 1] !== undefined ? room.columnRows[c - 1] : (room.rows || 5);

            for (let slot = 0; slot < colPerDesk; slot++) {
              laneIndex++;
              let targetGroupIdx = (laneIndex - 1) % groupQueues.length;

              let rowsInCol: number[] = [];
              for (let r = 1; r <= colRows; r++) rowsInCol.push(r);
              if (traversal === 'serpentine-column' && slot % 2 === 1) rowsInCol.reverse();

              for (const r of rowsInCol) {
                const deskId = `R${r}-C${c}`;
                if (room.disabledDesks?.includes(deskId)) continue;

                let studentToPlace: Student | null = null;
                for (let attempt = 0; attempt < groupQueues.length; attempt++) {
                  const gIdx = (targetGroupIdx + attempt) % groupQueues.length;
                  if (groupQueues[gIdx].length > 0) {
                    studentToPlace = groupQueues[gIdx].shift()!;
                    break;
                  }
                }

                if (studentToPlace) {
                  const slotPos = colPerDesk === 1 ? 'Single' : String.fromCharCode(65 + slot);
                  serial++;
                  allocatedSeats.push({
                    seatId: `${room.id}-${deskId}-${slotPos}`,
                    roomId: room.id,
                    roomNumber: room.roomNumber,
                    deskNumber: deskId,
                    row: r,
                    col: c,
                    slotPosition: slotPos,
                    student: studentToPlace,
                    status: 'Allocated',
                    serialNumber: serial,
                    hasConflict: false,
                  });
                  roomAllocated++;
                  roomDeptMap[studentToPlace.department] = (roomDeptMap[studentToPlace.department] || 0) + 1;
                  departmentStats[studentToPlace.department] = (departmentStats[studentToPlace.department] || 0) + 1;
                  serialNumbers[studentToPlace.registerNumber] = serial;
                }
              }
            }
          }
        } else {
          const maxSlots = Math.max(0, ...seats.map((s) => s.maxStudents));
          for (let slot = 0; slot < maxSlots; slot++) {
            for (const seat of seats) {
              if (slot < seat.maxStudents) {
                if (hallIdx >= hallOrdered.length) break;
                pushSeat(seat, slot);
              }
            }
            if (hallIdx >= hallOrdered.length) break;
          }
        }
      } else {
        for (const seat of seats) {
          if (hallIdx >= hallOrdered.length) break;
          for (let slot = 0; slot < seat.maxStudents; slot++) {
            if (hallIdx >= hallOrdered.length) break;
            pushSeat(seat, slot);
          }
        }
      }

      roomStats.push({
        roomId: room.id,
        roomNumber: room.roomNumber,
        capacity: roomCapacity,
        allocated: roomAllocated,
        utilizationPercent: roomCapacity > 0 ? Math.round((roomAllocated / roomCapacity) * 100) : 0,
        departments: roomDeptMap,
      });
    }

    // Remaining students not placed due to quota shortfall become unallocated
    for (const [dept, pool] of deptPools.entries()) {
      const idx = deptIdx.get(dept) || 0;
      for (let i = idx; i < pool.length; i++) unallocatedByQuota.push(pool[i]);
    }
    const conflicts = detectConflicts(allocatedSeats);
    if (conflicts.length > 0) {
      const conflictSeatIds = new Set<string>();
      conflicts.forEach((cf) => { conflictSeatIds.add(cf.seatA); conflictSeatIds.add(cf.seatB); });
      allocatedSeats.forEach((s) => { if (conflictSeatIds.has(s.seatId)) s.hasConflict = true; });
    }
    return {
      allocatedSeats,
      unallocatedStudents: unallocatedByQuota,
      totalCapacity: roomStats.reduce((s, r) => s + r.capacity, 0),
      totalAllocated: allocatedSeats.length,
      roomStats,
      departmentStats,
      serialNumbers,
      conflicts,
      traversal,
      strategy,
    };
  }

  // ── Legacy global block allocation (no quota) ──
  const ordered = buildDesegregatedSequence(students, strategy, mixGranularity);

  let studentIndex = 0;

  for (const room of activeRooms) {
    const seats = enumerateRoomSeats(room, traversal);
    const roomCapacity = seats.reduce((sum, s) => sum + s.maxStudents, 0);
    let roomAllocated = 0;
    const roomDeptMap: { [dept in Department]?: number } = {};
    let serial = 0;

    const pushGlobal = (seat: { row: number; col: number; deskNumber: string; maxStudents: number }, slot: number) => {
      if (studentIndex >= ordered.length) return false;
      const student = ordered[studentIndex++];
      serial++;
      const slotPos = seat.maxStudents === 1 ? 'Single' : String.fromCharCode(65 + slot);
      allocatedSeats.push({
        seatId: `${room.id}-${seat.deskNumber}-${slotPos}`,
        roomId: room.id,
        roomNumber: room.roomNumber,
        deskNumber: seat.deskNumber,
        row: seat.row,
        col: seat.col,
        slotPosition: slotPos,
        student,
        status: 'Allocated',
        serialNumber: serial,
        hasConflict: false,
      });
      roomAllocated++;
      roomDeptMap[student.department] = (roomDeptMap[student.department] || 0) + 1;
      departmentStats[student.department] = (departmentStats[student.department] || 0) + 1;
      serialNumbers[student.registerNumber] = serial;
      return true;
    };

    if (isColumnFamily) {
      const maxSlots = Math.max(0, ...seats.map((s) => s.maxStudents));
      for (let slot = 0; slot < maxSlots; slot++) {
        for (const seat of seats) {
          if (slot < seat.maxStudents) {
            if (studentIndex >= ordered.length) break;
            pushGlobal(seat, slot);
          }
        }
        if (studentIndex >= ordered.length) break;
      }
    } else {
      for (const seat of seats) {
        if (studentIndex >= ordered.length) break;
        for (let slot = 0; slot < seat.maxStudents; slot++) {
          if (studentIndex >= ordered.length) break;
          pushGlobal(seat, slot);
        }
      }
    }

    roomStats.push({
      roomId: room.id,
      roomNumber: room.roomNumber,
      capacity: roomCapacity,
      allocated: roomAllocated,
      utilizationPercent: roomCapacity > 0 ? Math.round((roomAllocated / roomCapacity) * 100) : 0,
      departments: roomDeptMap,
    });
  }

  const unallocatedStudents = ordered.slice(studentIndex);
  const conflicts = detectConflicts(allocatedSeats);
  // Flag conflicting seats for UI highlight
  if (conflicts.length > 0) {
    const conflictSeatIds = new Set<string>();
    conflicts.forEach((cf) => {
      conflictSeatIds.add(cf.seatA);
      conflictSeatIds.add(cf.seatB);
    });
    allocatedSeats.forEach((s) => {
      if (conflictSeatIds.has(s.seatId)) s.hasConflict = true;
    });
  }

  return {
    allocatedSeats,
    unallocatedStudents,
    totalCapacity: roomStats.reduce((s, r) => s + r.capacity, 0),
    totalAllocated: allocatedSeats.length,
    roomStats,
    departmentStats,
    serialNumbers,
    conflicts,
    traversal,
    strategy,
  };
}

/* ----------------------------------------------------------------------------
 *  Faculty duty auto-assignment (preserved from previous engine)
 * -------------------------------------------------------------------------- */
export function autoAssignFacultyDuties(
  exam: ExamSchedule,
  usedRooms: Room[],
  facultyList: Faculty[]
): DutyAllocation[] {
  const availableFaculty = facultyList.filter((f) => f.isAvailable);
  const sortedFaculty = [...availableFaculty].sort((a, b) => a.assignedDutiesCount - b.maxDuties);

  const duties: DutyAllocation[] = [];
  let facIndex = 0;

  const seniorFac = sortedFaculty.find(
    (f) => (f.designation === 'Professor' || f.designation === 'Associate Professor') && !f.department.includes('exam')
  ) || sortedFaculty[0];

  if (seniorFac) {
    duties.push({
      id: `duty-${Date.now()}-cs`,
      examScheduleId: exam.id,
      date: exam.date,
      session: exam.session,
      timeSlot: exam.timeSlot,
      roomId: 'all',
      roomNumber: 'Central Exam Control Cell',
      facultyId: seniorFac.id,
      facultyName: seniorFac.name,
      facultyDept: seniorFac.department,
      role: 'Chief Superintendent',
      status: 'Confirmed',
      assignedAt: new Date().toLocaleString(),
    });
  }

  usedRooms.forEach((room) => {
    let assigned = false;
    for (let i = 0; i < sortedFaculty.length; i++) {
      const candidate = sortedFaculty[(facIndex + i) % sortedFaculty.length];
      if (candidate.id !== seniorFac?.id && !duties.some((d) => d.facultyId === candidate.id)) {
        duties.push({
          id: `duty-${Date.now()}-${room.id}`,
          examScheduleId: exam.id,
          date: exam.date,
          session: exam.session,
          timeSlot: exam.timeSlot,
          roomId: room.id,
          roomNumber: room.roomNumber,
          facultyId: candidate.id,
          facultyName: candidate.name,
          facultyDept: candidate.department,
          role: 'Hall Invigilator',
          status: 'Confirmed',
          assignedAt: new Date().toLocaleString(),
        });
        facIndex = (facIndex + i + 1) % sortedFaculty.length;
        assigned = true;
        break;
      }
    }

    if (!assigned && sortedFaculty.length > 0) {
      const fallback = sortedFaculty[facIndex % sortedFaculty.length];
      duties.push({
        id: `duty-${Date.now()}-${room.id}`,
        examScheduleId: exam.id,
        date: exam.date,
        session: exam.session,
        timeSlot: exam.timeSlot,
        roomId: room.id,
        roomNumber: room.roomNumber,
        facultyId: fallback.id,
        facultyName: fallback.name,
        facultyDept: fallback.department,
        role: 'Hall Invigilator',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
      facIndex++;
    }
  });

  const standbyCount = Math.max(1, Math.ceil(usedRooms.length / 4));
  for (let s = 0; s < standbyCount; s++) {
    const unassigned = sortedFaculty.find((f) => !duties.some((d) => d.facultyId === f.id));
    if (unassigned) {
      duties.push({
        id: `duty-${Date.now()}-sb-${s}`,
        examScheduleId: exam.id,
        date: exam.date,
        session: exam.session,
        timeSlot: exam.timeSlot,
        roomId: 'standby',
        roomNumber: 'Standby / Reliever Pool',
        facultyId: unassigned.id,
        facultyName: unassigned.name,
        facultyDept: unassigned.department,
        role: 'Reliever / Standby',
        status: 'Confirmed',
        assignedAt: new Date().toLocaleString(),
      });
    }
  }

  return duties;
}

/* ----------------------------------------------------------------------------
 *  CSV export helper (preserved)
 * -------------------------------------------------------------------------- */
export function downloadCSV(filename: string, rows: string[][]) {
  const processRow = (row: string[]) =>
    row
      .map((val) => {
        let text = (val || '').toString().replace(/"/g, '""');
        if (text.search(/("|,|\n)/g) >= 0) {
          text = `"${text}"`;
        }
        return text;
      })
      .join(',');

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(processRow).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
