import { formatProgDisplay, parseSubjectField } from '../lib/utils';

const calculateDuration = (startTime, endTime, timeSlot) => {
  let start = startTime || "";
  let end = endTime || "";

  if ((!start || !end) && timeSlot && String(timeSlot).includes("-")) {
    const parts = String(timeSlot).split("-").map(s => s.trim());
    if (parts.length === 2) {
      start = parts[0];
      end = parts[1];
    }
  }

  const parseMins = (timeStr) => {
    if (!timeStr) return null;
    let s = String(timeStr).trim();
    let isPM = /pm/i.test(s);
    let isAM = /am/i.test(s);
    s = s.replace(/(am|pm)/i, '').trim();
    const parts = s.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    let h = parts[0];
    let m = parts[1];
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const startMins = parseMins(start);
  const endMins = parseMins(end);

  if (startMins !== null && endMins !== null && endMins > startMins) {
    const total = endMins - startMins;
    const hrs = Math.floor(total / 60);
    const mins = total % 60;
    if (hrs > 0 && mins > 0) {
      return `${hrs} Hour${hrs > 1 ? 's' : ''} ${mins} Mins`;
    } else if (hrs > 0 && mins === 0) {
      return `${hrs} Hour${hrs > 1 ? 's' : ''}`;
    } else {
      return `${mins} Mins`;
    }
  }
  return "180 min";
};

const formatExamDateDisplay = (dateVal) => {
  if (!dateVal) return "";
  try {
    let d = null;
    if (typeof dateVal === 'object' && dateVal?.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'string') {
      if (dateVal.includes('-')) {
        const parts = dateVal.split('T')[0].split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
      }
      if (dateVal.includes('/')) {
        const parts = dateVal.split('/');
        if (parts.length === 3) {
          const p0 = parts[0].padStart(2, '0');
          const p1 = parts[1].padStart(2, '0');
          const p2 = parts[2];
          return `${p0}.${p1}.${p2}`;
        }
      }
      d = new Date(dateVal);
    } else if (dateVal instanceof Date) {
      d = dateVal;
    }
    if (d && !isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    }
  } catch (e) {}
  return String(dateVal);
};

export const getQuestionPaperHTML = (
  qp,
  cos = [],
  facultySignatureUrl = '',
  hodSignatureUrl = '',
  ciaConfigs = {},
  poMarks = null,
  coeSignatureUrl = '',
  acSignatureUrl = ''
) => {
  // Compute exam display name (resolve config ID to name)
  let examDisplay = qp.exam_name;
  if (!examDisplay) {
    const configObj = ciaConfigs[qp.qpaper_name]; // Use qp.qpaper_name as config ID
    examDisplay = configObj?.examName || qp.qpaper_name;
  }

  const isAssignment = qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical' || qp.assessment_type === 'Indirect';

  const yearLabel = { "1": "I", "2": "I", "3": "II", "4": "II", "5": "III", "6": "III", "7": "IV", "8": "IV" }[qp.semester] || "";
  const semLabel = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII" }[qp.semester] || qp.semester;
  const yearSemester = `${yearLabel} / ${semLabel}`;
  const parsedSubject = parseSubjectField(qp.subject);
  const subjectCode = parsedSubject.code || qp.subject || '';
  const subjectName = parsedSubject.name || qp.subject_name || '';
  const subjectDisplay = subjectName ? `${subjectCode} - ${subjectName}` : subjectCode;

  // Prepare signature HTMLs (resolving explicitly passed args or internal qp object fields)
  const facultySig = facultySignatureUrl || qp?.faculty_signature_url || qp?.facultySignatureUrl || '';
  const acSig = acSignatureUrl || qp?.ac_signature_url || qp?.academic_coordinator_signature_url || qp?.acSignatureUrl || '';
  const hodSig = hodSignatureUrl || qp?.hod_signature_url || qp?.hodSignatureUrl || '';

  let facultySignatureHtml = facultySig
    ? `<img src="${facultySig}" alt="Subject Faculty Signature" style="height: 48px; max-width: 130px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`
    : `<div style="height: 48px; width: 100%;"></div>`;

  let acSignatureHtml = acSig
    ? `<img src="${acSig}" alt="Academic Coordinator Signature" style="height: 48px; max-width: 130px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`
    : `<div style="height: 48px; width: 100%;"></div>`;

  let hodSignatureHtml = hodSig
    ? `<img src="${hodSig}" alt="HOD Signature" style="height: 48px; max-width: 130px; width: auto; display: block; margin: 0 auto; border-bottom: 1px solid #000;" />`
    : `<div style="height: 48px; width: 100%;"></div>`;

  let html = `
<div class="qp-preview-container" style="font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.4;">
<table cellspacing="0" border="1" style="border-collapse:collapse; font-size:11px; width:100%; border:1.5px solid #000; margin-bottom: 10px;">
  <tbody>
    <tr>
      <td style="height:70px; text-align:center; width:100%;"><img alt="logo" class="logo-img" src="/logo.png" style="height:60px; max-width:100%; width:754px;" /></td>
    </tr>
  </tbody>
</table>
<table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1.5px solid #000;" border="1">
  <tr>
    <td style="padding: 6px;"><strong>${isAssignment ? (qp.assessment_type === 'Project' ? 'Project' : qp.assessment_type === 'Practical' ? 'Practical' : qp.assessment_type === 'Indirect' ? 'Indirect Assessment' : 'Assignment') : 'Internal Assessment Test'}</strong></td>
    <td colspan="3" style="padding: 6px;">${examDisplay}${isAssignment && qp.assignment_kl_domain ? ` (${qp.assignment_kl_domain})` : ''}</td>
    <td style="padding: 6px;"><strong>Academic Year</strong></td>
    <td style="padding: 6px;">${qp.academic_year}</td>
  </tr>
  <tr>
    <td style="padding: 6px;"><strong>Course Code / Title</strong></td>
    <td colspan="5" style="padding: 6px;">${subjectDisplay}</td>
  </tr>
  <tr>
    <td style="padding: 6px;"><strong>Year / Semester</strong></td>
    <td style="padding: 6px;">${yearSemester}</td>
    <td style="padding: 6px;"><strong>Department</strong></td>
    <td style="padding: 6px;">${qp.department}</td>
    <td style="padding: 6px;"><strong>Common for</strong></td>
    <td style="padding: 6px;">${qp.common_for || qp.commonFor || 'NIL'}</td>
  </tr>
  <tr>
    <td style="padding: 6px;"><strong>Max Mark</strong></td>
    <td style="padding: 6px;">${qp.total_marks}</td>
    <td style="padding: 6px;"><strong>Duration</strong></td>
    <td style="padding: 6px;">${qp.duration || calculateDuration(qp.start_time, qp.end_time, qp.time_slot || qp.timeSlot) || '180 min'}</td>
    <td style="padding: 6px;"><strong>Date</strong></td>
    <td style="padding: 6px;">${qp.exam_date_display || formatExamDateDisplay(qp.exam_date) || (qp.exam_date ? new Date(qp.exam_date).toLocaleDateString() : '')}</td>
  </tr>
  <tr>
    <td style="padding: 6px;"><strong>Reg. No.</strong></td>
    <td colspan="5" style="padding: 6px;"></td>
  </tr>
</table>
  `;

  if (isAssignment) {
    html += `
<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; text-align: left; font-size: 12px;">
  <thead>
    <tr>
      <th style="width: 8%; text-align: center; padding: 4px;">Q. No.</th>
      <th style="width: 52%; text-align: center; padding: 4px;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px;">PI</th>
      <th style="width: 10%; text-align: center; padding: 4px;">Marks</th>
    </tr>
  </thead>
  <tbody>`;
    if (qp.assignment_config && qp.assignment_config.length > 0) {
      qp.assignment_config.forEach((q, idx) => {
        const allCOs = (q.mappings || []).map(m => `${m.co} (${m.marks || 0})`).join(', ');
        const allPIs = (q.mappings || []).map(m => (m.pis || []).map((pi, i) => `${pi}${m.piMarks && m.piMarks[i] != null ? ` (${m.piMarks[i]})` : ''}`).join(', ')).join(', ');
        html += `
          <tr>
            <td style="text-align: center; padding: 8px;">${idx + 1}</td>
            <td style="padding: 8px;">${q.question || ''}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px;">${qp.assignment_kl || ''}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px;">${allCOs}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px;">${allPIs}</td>
            <td style="text-align: center; padding: 4px;">${q.marks}</td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else {
    (qp.parts || []).forEach((part, index) => {
      const partLetter = String.fromCharCode(64 + index + 1);
      const totalMarks = `
<span style="font-weight: bold;">
  <span>${part.num_questions}</span>
  <span>&times;</span>
  <span>${part.marks_per_question}</span>
  <span>=</span>
  <span>${part.num_questions * part.marks_per_question}</span>
</span>`;

      html += `
<table style="width: 100%; border-collapse: collapse; font-weight: bold; font-size: 14px; margin-bottom: 6px; border: 1.5px solid black; margin-top: 15px;">
  <tr>
    <td style="width: 50%; padding: 6px; border: none;">Part ${partLetter} <span style="font-weight: normal; font-style: italic; font-size: 13px;">(Answer all questions)</span></td>
    <td style="width: 50%; padding: 6px; border: none; text-align: right;">${totalMarks} Marks</td>
  </tr>
</table>
<table border="1" style="width: 100%; border-collapse: collapse; margin-bottom: 15px; text-align: left; font-size: 12px; border: 1px solid #000;">
  <thead>
    <tr>
      <th style="width: 8%; text-align: center; padding: 4px;">Q. No.</th>
      <th style="width: 62%; text-align: center; padding: 4px;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px;">PI</th>
    </tr>
  </thead>
  <tbody>`;

      if (part.questions && part.questions.length > 0) {
        const filteredQuestions = (part.questions || []).filter(q =>
          !(q.question && q.question.trim().toLowerCase() === '(or)')
        );

        const formatMathText = (qStr) => {
          if (!qStr) return '';
          let str = String(qStr);

          // 0. Remove any leftover error markers like [Math Processing Error]
          str = str.replace(/\[Math Processing Error\]/gi, '');

          // 1. Auto-wrap matrix environments (\begin{bmatrix} ... \end{bmatrix}), including optional equation prefix like A=, B=, X=
          str = str.replace(/(?:\\\()?([A-Za-z0-9_\s\^\{\}-]*\s*=\s*)?\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Bmatrix|cases|align|array)\}([\s\S]*?)\\end\{\2\}(?:\\\))?/gi, (match, prefix, envName, innerText) => {
            const cleanPrefix = prefix ? prefix.trim() : '';
            const cleanInner = innerText ? innerText.trim() : '';
            return `\\(${cleanPrefix ? `${cleanPrefix} ` : ''}\\begin{${envName}} ${cleanInner} \\end{${envName}}\\)`;
          });

          // 2. Auto-wrap exponent / power expressions like A^{4} or A^{-1} if not wrapped in \(...\)
          str = str.replace(/(?:\\\()?([A-Za-z]\^\{[^{}]+\})(?:\\\))?/gi, (match, powerExp) => {
            return `\\(${powerExp}\\)`;
          });

          // Clean up any double-wrapped \(\( ... \)\)
          str = str.replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)');

          // 3. Wrap any \(...\) or \[...\] math blocks in <span class="math-tex">...</span> if not already wrapped
          str = str.replace(/(?:<span class="math-tex">)?(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])(?:<\/span>)?/gi, (match, mathContent) => {
            return `<span class="math-tex">${mathContent}</span>`;
          });

          return str;
        };

        filteredQuestions.forEach((q, qIdx) => {
          if (q.either_or) {
            if (q.sub === 'a') {
              const nextQ = filteredQuestions[qIdx + 1];
              html += `
                <tr>
                  <td style="text-align: center; padding: 4px;">${q.qno}</td>
                  <td style="padding: 4px;">${formatMathText(q.question || '')}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.kl || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.co || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${q.pi || ''}</td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"><strong>(Or)</strong></td>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"></td>
                  <td style="text-align: center; padding: 4px;"></td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 4px;">${nextQ?.qno || ""}</td>
                  <td style="padding: 4px;">${formatMathText(nextQ?.question || "")}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.kl || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.co || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px;">${nextQ?.pi || ''}</td>
                </tr>
              `;
            }
          } else {
            html += `
              <tr>
                <td style="text-align: center; padding: 4px;">${q.qno}</td>
                <td style="padding: 4px;">${formatMathText(q.question || '')}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px;">${q.kl || ''}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px;">${q.co || ''}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px;">${q.pi || ''}</td>
              </tr>
            `;
          }
        });
      } else {
        // Generate placeholders
        let questionCounter = 1; // This counter should be passed or managed differently if parts are dynamic
        for (let j = 0; j < part.num_questions; j++) {
          if (part.isEitherOr) {
            html += `
              <tr>
                <td style="text-align: center; padding: 4px;">${questionCounter}(a)</td>
                <td style="padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
              </tr>
              <tr>
                <td style="text-align: center; padding: 4px;"></td>
                <td style="text-align: center; padding: 4px;"><strong>(Or)</strong></td>
                <td style="text-align: center; padding: 4px;"></td>
                <td style="text-align: center; padding: 4px;"></td>
                <td style="text-align: center; padding: 4px;"></td>
              </tr>
              <tr>
                <td style="text-align: center; padding: 4px;">${questionCounter}(b)</td>
                <td style="padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
              </tr>`;
          } else {
            html += `
              <tr>
                <td style="text-align: center; padding: 4px;">${questionCounter}</td>
                <td style="padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px;"></td>
              </tr>`;
          }
          questionCounter++;
        }
      }
      html += `</tbody></table>`;
    });
  }

  const getBaseQno = (qno) => {
    let raw = String(qno || '').trim().toLowerCase().replace(/\s+/g, '');
    raw = raw.replace(/\(?[ab]\)/gi, '');
    return raw.replace(/^(\d+)[ab](.*)$/i, '$1$2');
  };

  const activeCOs = new Set();
  const coWeightage = {};

  if (qp.assessment_type === 'Assignment' || qp.assessment_type === 'Project' || qp.assessment_type === 'Practical' || qp.assessment_type === 'Indirect') {
    (qp.assignment_config || []).forEach((q) => {
      (q.mappings || []).forEach(m => {
        const co = String(m?.co || '').trim();
        if (!co || !co.toUpperCase().startsWith('CO')) return;
        const mapMarks = parseInt(m?.marks, 10) || 0;
        activeCOs.add(co);
        coWeightage[co] = (coWeightage[co] || 0) + mapMarks;
      });
    });
  } else {
    const groups = {};
    (qp.parts || []).forEach((part) => {
      (part?.questions || []).forEach((q) => {
        const co = String(q?.co || '').trim();
        const marks = parseInt(q?.marks, 10) || 0;
        if (!co || !co.toUpperCase().startsWith('CO') || marks <= 0) return;
        const base = getBaseQno(q?.qno);
        if (!base) return;
        activeCOs.add(co);
        if (!groups[base]) groups[base] = { marks, cos: new Set() };
        if (marks > 0) groups[base].marks = marks;
        groups[base].cos.add(co);
      });
    });
    Object.values(groups).forEach((group) => {
      group.cos.forEach((co) => {
        coWeightage[co] = (coWeightage[co] || 0) + group.marks;
      });
    });
  }

  // Resolve Course Outcomes list robustly (from passed cos, qp.course_outcomes, qp.courseOutcomes, or activeCOs)
  let effectiveCos = [];
  if (cos && Array.isArray(cos) && cos.length > 0) {
    effectiveCos = cos;
  } else if (qp?.course_outcomes && Array.isArray(qp.course_outcomes) && qp.course_outcomes.length > 0) {
    effectiveCos = qp.course_outcomes;
  } else if (qp?.courseOutcomes && Array.isArray(qp.courseOutcomes) && qp.courseOutcomes.length > 0) {
    effectiveCos = qp.courseOutcomes;
  } else if (activeCOs.size > 0) {
    effectiveCos = Array.from(activeCOs).sort().map(c => ({
      code: c,
      description: `${c} Course Outcome`
    }));
  }

  // Filter effectiveCos so only covered COs in this paper are shown in the summary table (matching QuestionPaperGenerator)
  const coveredCos = effectiveCos.filter((co) => {
    const coCode = (co.code || co.co_code || co.co || '').toUpperCase();
    return activeCOs.has(coCode) || (coWeightage[coCode] && coWeightage[coCode] > 0) || (co.weightage && co.weightage > 0) || co.tick === '✓';
  });

  const listToRender = coveredCos.length > 0 ? coveredCos : effectiveCos;

  let coRows = '';
  if (listToRender && listToRender.length > 0) {
    coRows = listToRender.map((co) => {
      const coCode = co.code || co.co_code || co.co || '';
      const coDesc = co.description || co.desc || co.co_description || '-';
      const tick = activeCOs.has(coCode) || (coWeightage[coCode] && coWeightage[coCode] > 0) || co.tick === '✓' ? '✓' : '';
      const w = coWeightage[coCode] || co.weightage || '';
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #000; text-align: center;">${coCode}</td>
          <td style="padding: 6px; border: 1px solid #000; text-align: left;">${coDesc}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #000;">${tick}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #000;">${w || ''}</td>
        </tr>
      `;
    }).join('');
  } else {
    coRows = `
      <tr>
        <td style="padding: 6px; border: 1px solid #000; text-align: center;">-</td>
        <td style="padding: 6px; border: 1px solid #000; text-align: center;">-</td>
        <td style="padding: 6px; border: 1px solid #000; text-align: center;">-</td>
        <td style="padding: 6px; border: 1px solid #000; text-align: center;">-</td>
      </tr>
    `;
  }

  html += `
      <div class="outcomes-summary-section" style="margin-top: 25px;">
        <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">Details of Course Outcomes</h3>
        <table border="1" style="border-collapse: collapse; width: 100%; font-size: 11px; border: 1px solid #000;">
            <thead>
                <tr>
                    <th style="padding: 6px; border: 1px solid #000; text-align: center;">Course Outcome Code</th>
                    <th style="padding: 6px; border: 1px solid #000; text-align: left;">Description</th>
                    <th style="padding: 6px; border: 1px solid #000; text-align: center;">Tick the CO's covered in this QP</th>
                    <th style="padding: 6px; border: 1px solid #000; text-align: center;">Weightage of marks allotted to each CO</th>
                </tr>
            </thead>
            <tbody>
                ${coRows}
            </tbody>
        </table>
      </div>

<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 11px; border: 1.5px solid #000;">
  <tr>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px;">${facultySignatureHtml}</td>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px;">${acSignatureHtml}</td>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px;">${hodSignatureHtml}</td>
  </tr>
  <tr>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: bold;">Subject Faculty Signature</td>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: bold;">Academic Coordinator Signature</td>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: bold;">HOD Signature</td>
  </tr>
</table>
</div>
  `;
  return html;
};
