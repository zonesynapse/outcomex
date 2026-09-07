import { db } from '../firebase';
import {
  collection, getDocs, writeBatch, doc, getDoc, setDoc, deleteDoc, updateDoc, query, collectionGroup
} from 'firebase/firestore';

const sanitizeKey = (v) => String(v ?? '').trim().replace(/[.#$[\]/ ]/g, '_');
const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

// ---------------------------------------------------------------------------
// Key rebuilding helpers
// ---------------------------------------------------------------------------

/**
 * Replaces the trailing course-code segment of a course-bank style doc id.
 * Courses doc ids: {prog}_{dept}_{reg}_{CODE}
 */
export function replaceCourseKeyCode(key, oldCode, newCode) {
  if (typeof key !== 'string' || !key) return key;
  const parts = key.split('_');
  if (parts.length < 2) return key;
  const last = parts[parts.length - 1];
  if (norm(last) !== norm(oldCode)) return key;
  const newParts = [...parts.slice(0, -1), sanitizeKey(newCode)];
  return newParts.join('_');
}

/**
 * Replaces the code segment of a course_outcomes / course_bank style doc id.
 * These are: {dept}_{reg}_{CODE}_{ay}
 * The code is the 3rd-from-last segment.
 */
export function replaceLookupKeyCode(key, oldCode, newCode) {
  if (typeof key !== 'string' || !key) return key;
  const parts = key.split('_');
  if (parts.length < 3) return key;
  const codeIdx = parts.length - 2;
  if (norm(parts[codeIdx]) !== norm(oldCode)) return key;
  const newParts = [...parts];
  newParts[codeIdx] = sanitizeKey(newCode);
  return newParts.join('_');
}

/**
 * Replaces the code segment of operational doc ids where the code is the LAST
 * segment (course_enrolments, marks, attendance, co_attainment, mapping_summary).
 */
export function replaceSuffixCodeKey(key, oldCode, newCode) {
  if (typeof key !== 'string' || !key) return key;
  const parts = key.split('_');
  if (parts.length < 2) return key;
  const last = parts[parts.length - 1];
  if (norm(last) !== norm(oldCode)) return key;
  const newParts = [...parts.slice(0, -1), sanitizeKey(newCode)];
  return newParts.join('_');
}

function replaceInObjectFields(obj, oldCode, newCode, keys = ['code', 'courseCode', 'subjectCode', 'subject_code']) {
  if (!obj || typeof obj !== 'object') return false;
  let changed = false;
  const oldNorm = norm(oldCode);
  const newNorm = norm(newCode);
  Object.entries(obj).forEach(([k, v]) => {
    if (keys.includes(k) && norm(v) === oldNorm) {
      obj[k] = newCode;
      changed = true;
    } else if (typeof v === 'string') {
      // e.g. subject JSON strings, compositeKey fields
      const normV = norm(v);
      if (normV === oldNorm) {
        obj[k] = v.replace(new RegExp(oldCode, 'gi'), newCode);
        changed = true;
      }
    } else if (Array.isArray(v)) {
      v.forEach(item => {
        if (replaceInObjectFields(item, oldCode, newCode, keys)) changed = true;
      });
    } else if (v && typeof v === 'object') {
      if (replaceInObjectFields(v, oldCode, newCode, keys)) changed = true;
    }
  });
  return changed;
}

// ---------------------------------------------------------------------------
// Scan: count affected documents per collection (dry-run preview)
// ---------------------------------------------------------------------------

export async function scanCourseCodeUsage(oldCode) {
  const report = { collections: [], totalDocs: 0, totalFieldRefs: 0 };
  const oldNorm = norm(oldCode);

  const tryRun = async (label, fn) => {
    try {
      const res = await fn();
      report.collections.push({ label, ...res });
      report.totalDocs += res.docCount;
      report.totalFieldRefs += res.fieldCount;
    } catch (e) {
      report.collections.push({ label, docCount: 0, fieldCount: 0, error: e.message });
    }
  };

  // courses
  await tryRun('courses (Course Bank)', async () => {
    const snap = await getDocs(collection(db, 'courses'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      const matches = norm(data.code) === oldNorm
        || norm(d.id.split('_').pop()) === oldNorm
        || norm(data.name) === oldNorm;
      if (matches) {
        docs.push({ id: d.id, ...data });
        fieldCount += 1;
      }
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  // course_outcomes
  await tryRun('course_outcomes', async () => {
    const snap = await getDocs(collection(db, 'course_outcomes'));
    const docs = [];
    snap.forEach(d => {
      const parts = d.id.split('_');
      const codeSeg = parts[parts.length - 2];
      if (norm(codeSeg) === oldNorm) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // course_bank
  await tryRun('course_bank', async () => {
    const snap = await getDocs(collection(db, 'course_bank'));
    const docs = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const parts = d.id.split('_');
      const codeSeg = parts[parts.length - 2];
      if (norm(codeSeg) === oldNorm || norm(data.code) === oldNorm) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // subject_assignments (fields uid -> [codes])
  await tryRun('subject_assignments (subjects per faculty)', async () => {
    const snap = await getDocs(collection(db, 'subject_assignments'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      let hit = false;
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (Array.isArray(v) && v.some(c => norm(c) === oldNorm)) {
          hit = true;
          fieldCount += 1;
        }
      });
      if (hit) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  // course_enrolments (doc ids ending with _CODE)
  await tryRun('course_enrolments', async () => {
    const snap = await getDocs(collection(db, 'course_enrolments'));
    const docs = [];
    snap.forEach(d => {
      const last = d.id.split('_').pop();
      if (norm(last) === oldNorm) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // marks (doc ids containing the code)
  await tryRun('marks', async () => {
    const snap = await getDocs(collection(db, 'marks'));
    const docs = [];
    snap.forEach(d => {
      if (d.id.split('_').some(p => norm(p) === oldNorm)) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // co_attainment (root doc ids + exams subcollection)
  await tryRun('co_attainment (incl. exams subcollection)', async () => {
    let docs = [];
    let subDocs = [];
    const snap = await getDocs(collection(db, 'co_attainment'));
    snap.forEach(d => {
      if (d.id.split('_').some(p => norm(p) === oldNorm)) docs.push({ id: d.id });
    });
    try {
      const subSnap = await getDocs(query(collectionGroup(db, 'exams')));
      subSnap.forEach(d => {
        if ((d.id || '').split('_').some(p => norm(p) === oldNorm)) subDocs.push({ id: d.ref.path });
      });
    } catch (e) { /* ignore */ }
    return { docCount: docs.length + subDocs.length, fieldCount: docs.length + subDocs.length, docs: [...docs, ...subDocs] };
  });

  // mapping_summary
  await tryRun('mapping_summary (CO-PO)', async () => {
    const snap = await getDocs(collection(db, 'mapping_summary'));
    const docs = [];
    snap.forEach(d => {
      if (d.id.split('_').some(p => norm(p) === oldNorm)) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // attendance
  await tryRun('attendance', async () => {
    const snap = await getDocs(collection(db, 'attendance'));
    const docs = [];
    snap.forEach(d => {
      if (d.id.split('_').some(p => norm(p) === oldNorm)) docs.push({ id: d.id });
    });
    return { docCount: docs.length, fieldCount: docs.length, docs };
  });

  // generated_qps (composite keys + subject_code/subject payloads)
  await tryRun('generated_qps (question papers)', async () => {
    const snap = await getDocs(collection(db, 'generated_qps'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      let hit = norm(d.id) === oldNorm || d.id.split('.')[0].split('_').some(p => norm(p) === oldNorm);
      if (!hit) hit = norm(data.subject_code) === oldNorm || norm(data.subjectCode) === oldNorm || norm(data.subject_name) === oldNorm || norm(data.subject) === oldNorm;
      if (hit) {
        docs.push({ id: d.id });
        fieldCount += 1;
      }
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  // qp_setter_assignments (assignments object keyed by code)
  await tryRun('qp_setter_assignments (IA schedules)', async () => {
    const snap = await getDocs(collection(db, 'qp_setter_assignments'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      let hit = false;
      Object.keys(data.assignments || {}).forEach(code => {
        if (norm(code) === oldNorm) hit = true;
      });
      if (hit) {
        docs.push({ id: d.id });
        fieldCount += 1;
      }
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  // timetable_allocations (subjectAllocation nested object contains "CODE|span" strings)
  await tryRun('timetable_allocations (weekly timetable)', async () => {
    const snap = await getDocs(collection(db, 'timetable_allocations'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      const alloc = data.subjectAllocation || {};
      let hit = false;
      Object.values(alloc).forEach(periods => {
        if (!periods || typeof periods !== 'object') return;
        Object.values(periods).forEach(entries => {
          if (!Array.isArray(entries)) return;
          entries.forEach(e => {
            if (typeof e === 'string') {
              const codePart = e.split('|')[0].trim();
              const normCodePart = norm(codePart);
              const normFirstWord = norm(codePart.split(/[\s\-()]+/)[0]);
              if (normCodePart === oldNorm || normFirstWord === oldNorm || normCodePart.includes(oldNorm)) hit = true;
            }
          });
        });
      });
      if (hit) {
        docs.push({ id: d.id });
        fieldCount += 1;
      }
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  // syllabus_data (subject codes inside semester objects)
  await tryRun('syllabus_data (curriculum)', async () => {
    const snap = await getDocs(collection(db, 'syllabus_data'));
    const docs = [];
    let fieldCount = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      let hit = false;
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        const code = node.code || node.subjectCode || node.courseCode || node.subject_code;
        const name = node.name || node.subjectName || node.courseName;
        if (norm(code) === oldNorm || norm(name) === oldNorm) { hit = true; return; }
        Object.values(node).forEach(walk);
      };
      walk(data);
      if (hit) {
        docs.push({ id: d.id });
        fieldCount += 1;
      }
    });
    return { docCount: docs.length, fieldCount, docs };
  });

  return report;
}

// ---------------------------------------------------------------------------
// Execute: replace oldCode -> newCode everywhere
// ---------------------------------------------------------------------------
// Strategy ("hard replace, but past data stays valid"):
//  1. courses: create new-keyed doc (payload copies + legacy_codes), then delete old.
//  2. course_outcomes: create new-keyed co doc; KEEP the old doc so already-saved
//     CO references in marks/QPs keep resolving.
//  3. course_bank: same as course_outcomes.
//  4. subject_assignments: update in place (uid -> [codes] replace old->new).
//  5. course_enrolments: copy doc to new key, delete old.
//  6. qp_setter_assignments: reassign key in `assignments`, keep old key data too
//     (so past schedules remain intact) but new schedules use new code.
//  7. syllabus_data: update subject code inside semester arrays so QPG dropdown
//     shows the new code and auto-select works.
//  8. timetable_allocations: update "CODE|span" strings inside subjectAllocation.
//  9. attendance: copy doc to new key with new subject code, delete old.
//  10. Notifications: update subject references.
//  Historical records (marks, generated_qps, co_attainment,
//  mapping_summary) are intentionally NOT rewritten - they keep the old code
//  and remain queryable & resolvable via legacy alias lookups.
export async function replaceCourseCode(oldCode, newCode, opts = {}) {
  const { onProgress = () => {}, batchSize = 400 } = opts;
  const total = 11;
  let step = 0;
  const bump = (msg) => onProgress(++step, total, msg);

  const newNorm = norm(newCode);
  if (!oldCode || !newCode) throw new Error('Both old and new codes are required.');
  if (norm(oldCode) === newNorm) throw new Error('Old and new codes are the same.');

  // 1. courses --------------------------------------------------------------
  bump('Updating Course Bank record...');
  {
    const snap = await getDocs(collection(db, 'courses'));
    const targets = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const codeFromField = norm(data.code);
      const codeFromId = norm(d.id.split('_').pop());
      if (codeFromField === norm(oldCode) || codeFromId === norm(oldCode)) {
        targets.push({ oldId: d.id, data });
      }
    });
    for (const t of targets) {
      const newId = replaceCourseKeyCode(t.oldId, oldCode, newCode);
      const legacy = Array.isArray(t.data.legacy_codes) ? t.data.legacy_codes : [];
      if (!legacy.includes(oldCode)) legacy.push(oldCode);
      await setDoc(doc(db, 'courses', newId), {
        ...t.data,
        code: newCode,
        name: t.data.name || t.data.title || '',
        legacy_codes: legacy
      });
      try { await deleteDoc(doc(db, 'courses', t.oldId)); } catch (e) { /* best effort */ }
    }
  }

  // 2. course_outcomes / course_bank ----------------------------------------
  bump('Copying CO configuration to new code (legacy kept)...');
  for (const coll of ['course_outcomes', 'course_bank']) {
    const snap = await getDocs(collection(db, coll));
    const copies = [];
    snap.forEach(d => {
      const parts = d.id.split('_');
      const codeSeg = parts[parts.length - 2];
      if (norm(codeSeg) === norm(oldCode)) copies.push({ id: d.id, data: d.data() });
    });
    for (const c of copies) {
      const newId = coll === 'course_outcomes'
        ? replaceLookupKeyCode(c.id, oldCode, newCode)
        : replaceCourseKeyCode(c.id, oldCode, newCode);
      await setDoc(doc(db, coll, newId), {
        ...(c.data || {}),
        code: newCode,
        legacy_codes: [...(Array.isArray(c.data.legacy_codes) ? c.data.legacy_codes : []), oldCode]
      });
      // keep old doc for backward compatibility
    }
  }

  // 3. subject_assignments ---------------------------------------------------
  bump('Updating subject assignments (faculty subject lists)...');
  {
    const snap = await getDocs(collection(db, 'subject_assignments'));
    let batch = writeBatch(db);
    let ops = 0;
    const commitBatch = async () => {
      if (ops > 0) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    };
    for (const d of snap.docs) {
      const data = d.data() || {};
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (Array.isArray(v)) {
          const next = v.map(c => (norm(c) === norm(oldCode) ? newCode : c));
          if (next.join('|') !== v.join('|')) {
            batch.update(d.ref, { [k]: next });
            ops += 1;
          }
        }
      });
      if (ops >= batchSize) await commitBatch();
    }
    await commitBatch();
  }

  // 4. course_enrolments -----------------------------------------------------
  bump('Migrating course enrolments to new code...');
  {
    const snap = await getDocs(collection(db, 'course_enrolments'));
    const targets = [];
    snap.forEach(d => {
      const last = d.id.split('_').pop();
      if (norm(last) === norm(oldCode)) targets.push({ id: d.id, data: d.data() });
    });
    for (const t of targets) {
      const newId = replaceSuffixCodeKey(t.id, oldCode, newCode);
      await setDoc(doc(db, 'course_enrolments', newId), t.data);
      try { await deleteDoc(doc(db, 'course_enrolments', t.id)); } catch (e) { /* best effort */ }
    }
  }

  // 5. qp_setter_assignments -------------------------------------------------
  bump('Updating IA schedule / QP setter assignments...');
  {
    const snap = await getDocs(collection(db, 'qp_setter_assignments'));
    for (const d of snap.docs) {
      const data = d.data() || {};
      const assignments = data.assignments || {};
      const entries = Object.entries(assignments);
      let changed = false;
      const nextAssignments = {};
      entries.forEach(([code, val]) => {
        if (norm(code) === norm(oldCode)) {
          nextAssignments[newCode] = { ...(val || {}), code: newCode };
          changed = true;
        } else {
          nextAssignments[code] = val;
        }
      });
      if (changed) {
        await updateDoc(d.ref, { assignments: nextAssignments });
      }
    }
  }

  // 6. syllabus_data (subject code inside semester arrays) -------------------
  bump('Updating syllabus_data (subject codes in curriculum)...');
  {
    const snap = await getDocs(collection(db, 'syllabus_data'));
    const batchOps = writeBatch(db);
    let ops = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      if (!data.semesters || typeof data.semesters !== 'object') return;
      let docChanged = false;
      Object.entries(data.semesters).forEach(([semKey, subjects]) => {
        if (!Array.isArray(subjects)) return;
        subjects.forEach(s => {
          if (s && typeof s === 'object' && norm(s.code) === norm(oldCode)) {
            s.code = newCode;
            docChanged = true;
          }
        });
      });
      if (docChanged) {
        batchOps.update(d.ref, { semesters: data.semesters });
        ops += 1;
      }
    });
    if (ops > 0) await batchOps.commit();
  }

  // 7. Notifications ---------------------------------------------------------
  bump('Updating notifications references...');
  {
    try {
      const snap = await getDocs(collection(db, 'notifications'));
      for (const d of snap.docs) {
        const data = d.data() || {};
        let changed = false;
        const next = { ...data };
        ['selectedSubjectCode', 'subjectCode', 'subject'].forEach(k => {
          if (Array.isArray(data[k])) {
            const arr = data[k].map(v => (norm(v) === norm(oldCode) ? newCode : v));
            if (arr.join('|') !== data[k].join('|')) { next[k] = arr; changed = true; }
          } else if (norm(data[k]) === norm(oldCode)) {
            next[k] = newCode; changed = true;
          }
        });
        if (changed) await updateDoc(d.ref, next);
      }
    } catch (e) { /* notifications missing collection is non-fatal */ }
  }

  // 8. timetable_allocations (subjectAllocation nested object) ----------------
  bump('Updating timetable allocations (weekly schedule grid)...');
  {
    const snap = await getDocs(collection(db, 'timetable_allocations'));
    const batchOps = writeBatch(db);
    let ops = 0;
    const oldNorm = norm(oldCode);
    snap.forEach(d => {
      const data = d.data() || {};
      const alloc = data.subjectAllocation || {};
      let docChanged = false;
      Object.entries(alloc).forEach(([day, periods]) => {
        if (!periods || typeof periods !== 'object') return;
        Object.entries(periods).forEach(([pNum, entries]) => {
          if (!Array.isArray(entries)) return;
          let periodChanged = false;
          const next = entries.map(e => {
            if (typeof e !== 'string') return e;
            const pipeIdx = e.indexOf('|');
            const codePart = pipeIdx >= 0 ? e.substring(0, pipeIdx) : e;
            const suffix = pipeIdx >= 0 ? e.substring(pipeIdx) : '';

            const cleanCodePartNorm = norm(codePart);
            const firstWordNorm = norm(codePart.split(/[\s\-()]+/)[0]);

            if (cleanCodePartNorm === oldNorm || firstWordNorm === oldNorm || cleanCodePartNorm.includes(oldNorm)) {
              periodChanged = true;
              const updatedCodePart = codePart.replace(new RegExp(oldCode, 'gi'), newCode);
              return `${updatedCodePart}${suffix}`;
            }
            return e;
          });
          if (periodChanged) {
            periods[pNum] = next;
            docChanged = true;
          }
        });
      });

      if (replaceInObjectFields(data, oldCode, newCode)) {
        docChanged = true;
      }

      if (docChanged) {
        batchOps.update(d.ref, { subjectAllocation: alloc, ...data });
        ops += 1;
      }
    });
    if (ops > 0) await batchOps.commit();
  }

  // 9. attendance (doc IDs contain the subject code) ----------------
  bump('Migrating attendance records to new course code...');
  {
    const snap = await getDocs(collection(db, 'attendance'));
    const targets = [];
    const oldNorm = norm(oldCode);
    snap.forEach(d => {
      const parts = d.id.split('_');
      const hasOldCode = parts.some(p => norm(p) === oldNorm) || norm(d.id).includes(oldNorm);
      if (hasOldCode) {
        targets.push({ id: d.id, data: d.data() });
      }
    });
    for (const t of targets) {
      const parts = t.id.split('_');
      const newParts = parts.map(p => norm(p) === oldNorm ? sanitizeKey(newCode) : p);
      let newId = newParts.join('_');
      if (newId === t.id && norm(t.id).includes(oldNorm)) {
        newId = t.id.replace(new RegExp(oldCode, 'gi'), newCode);
      }

      const newData = { ...t.data };
      if (newData._meta && typeof newData._meta === 'object') {
        newData._meta = { ...newData._meta };
        if (norm(newData._meta.subjectCode) === oldNorm) newData._meta.subjectCode = newCode;
        if (norm(newData._meta.code) === oldNorm) newData._meta.code = newCode;
        if (typeof newData._meta.subject === 'string' && newData._meta.subject.includes(oldCode)) {
          newData._meta.subject = newData._meta.subject.replace(new RegExp(oldCode, 'gi'), newCode);
        }
      }
      if (norm(newData.subjectCode) === oldNorm) newData.subjectCode = newCode;
      if (norm(newData.subject_code) === oldNorm) newData.subject_code = newCode;
      if (norm(newData.code) === oldNorm) newData.code = newCode;
      if (typeof newData.subject === 'string' && newData.subject.includes(oldCode)) {
        newData.subject = newData.subject.replace(new RegExp(oldCode, 'gi'), newCode);
      }

      const legacy = Array.isArray(newData.legacy_codes) ? newData.legacy_codes : [];
      if (!legacy.includes(oldCode)) legacy.push(oldCode);
      newData.legacy_codes = legacy;

      await setDoc(doc(db, 'attendance', newId), newData);
      if (newId !== t.id) {
        try { await deleteDoc(doc(db, 'attendance', t.id)); } catch (e) { /* best effort */ }
      }
    }
  }

  bump('Done.');
  return { ok: true };
}