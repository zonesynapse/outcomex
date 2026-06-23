/**
 * Internal Mark Calculation Engine
 *
 * categoryConfig: { "Internal Assessment": { consider_for_internal, best_count, max_mark, weightage }, ... }
 * examCategory:   { [examId]: "Internal Assessment"|"Activity"|etc }
 * studentMarks:   { [studentId]: { [examId]: mark } }
 * examMaxMarks:   { [examId]: max_mark }  (from CIA config totalMarks)
 */

export function calculateInternalMarks(studentMarks, categoryConfig, examCategory, examMaxMarks, studentNames = {}) {
  const results = [];

  for (const [studentId, marks] of Object.entries(studentMarks)) {
    const breakdown = [];
    let total = 0;

    for (const [catName, catCfg] of Object.entries(categoryConfig)) {
      if (catCfg.consider_for_internal === false) continue;

      const examIds = Object.entries(examCategory)
        .filter(([, cat]) => cat === catName)
        .map(([id]) => id);

      const scored = examIds.map(id => {
        const raw = parseFloat(marks[id]);
        const mm = examMaxMarks[id] || catCfg.max_mark || 100;
        const pct = !isNaN(raw) ? (raw / mm) * 100 : 0;
        return { examId: id, rawMark: isNaN(raw) ? 0 : raw, maxMark: mm, pct };
      }).sort((a, b) => b.pct - a.pct);

      const best = scored.slice(0, catCfg.best_count);
      const avgPct = best.length > 0 ? best.reduce((s, e) => s + e.pct, 0) / best.length : 0;
      const contribution = (avgPct * catCfg.weightage) / 100;

      breakdown.push({
        category: catName,
        weightage: catCfg.weightage,
        bestCount: catCfg.best_count,
        maxMark: catCfg.max_mark,
        exams: best.map(e => ({
          examId: e.examId,
          mark: e.rawMark,
          maxMark: e.maxMark,
          pct: Math.round(e.pct * 100) / 100,
        })),
        avgPct: Math.round(avgPct * 100) / 100,
        contribution: Math.round(contribution * 100) / 100,
      });

      total += contribution;
    }

    results.push({
      studentId,
      name: studentNames[studentId] || studentId,
      breakdown,
      total: Math.round(total * 100) / 100,
    });
  }

  results.sort((a, b) => b.total - a.total);
  return results;
}
