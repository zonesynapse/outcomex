/**
 * Internal Mark Calculation Engine
 *
 * categoryConfig: { "Internal Assessment": { consider_for_internal, best_count, max_mark, weightage, exam_weightage }, ... }
 *   - If exam_weightage (per-exam %) is set for any exam in the category → WEIGHTED mode:
 *     all exams are taken, each weighted by its exam_weightage, best_count ignored.
 *   - If exam_weightage is empty → BEST-OF-N mode:
 *     pick best N exams by raw %, average them, then apply category weightage.
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

      const isWeightedMode = catCfg.exam_weightage &&
        Object.values(catCfg.exam_weightage).some(v => v != null && v !== '' && Number(v) > 0);

      if (isWeightedMode) {
        // WEIGHTED mode: all exams, each weighted by exam_weightage %
        let weightedSum = 0;
        let weightTotal = 0;
        const examDetails = [];

        examIds.forEach(id => {
          const raw = parseFloat(marks[id]);
          if (isNaN(raw)) return;
          const mm = examMaxMarks[id] || catCfg.max_mark || 100;
          const pct = (raw / mm) * 100;
          const ew = parseFloat(catCfg.exam_weightage[id]) || 0;
          weightedSum += pct * (ew / 100);
          weightTotal += ew;
          examDetails.push({
            examId: id, mark: raw, maxMark: mm,
            pct: Math.round(pct * 100) / 100,
            examWeightage: ew,
          });
        });

        const avgPct = weightTotal > 0 ? weightedSum : 0;
        const contribution = (avgPct * catCfg.weightage) / 100;

        breakdown.push({
          category: catName,
          weightage: catCfg.weightage,
          bestCount: null,
          maxMark: catCfg.max_mark,
          mode: 'weighted',
          weightedAvgPct: Math.round(avgPct * 100) / 100,
          exams: examDetails,
          contribution: Math.round(contribution * 100) / 100,
        });

        total += contribution;
      } else {
        // BEST-OF-N mode: sort by raw %, pick best N
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
          mode: 'best_of_n',
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
