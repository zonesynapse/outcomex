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
<style>
  .qp-preview-container table { border-collapse: collapse !important; }
  .qp-preview-container table th,
  .qp-preview-container table td { border: 1px solid #000 !important; }
  .qp-preview-container table td table,
  figure.table table {
    border-collapse: collapse !important;
    width: 100% !important;
    margin: 8px 0 !important;
    border: 1px solid #000 !important;
  }
  .qp-preview-container table td table th,
  .qp-preview-container table td table td,
  figure.table table th,
  figure.table table td {
    border: 1px solid #000 !important;
    padding: 4px 6px !important;
    font-size: 12px !important;
    text-align: center !important;
  }
  figure.table {
    margin: 8px 0 !important;
    width: 100% !important;
  }
</style>
<div class="qp-preview-container" style="font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.4;">
<table cellspacing="0" border="1" style="border-collapse:collapse; font-size:11px; width:100%; border:1.5px solid #000; margin-bottom: 10px;">
  <tbody>
    <tr>
      <td style="height:70px; text-align:center; width:100%;"><img alt="logo" class="logo-img" src="/logo.png" style="height:60px; max-width:100%; width:754px;" /></td>
    </tr>
  </tbody>
</table>
<table class="header-box-table" style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1.5px solid #000;" border="1">
  <tr>
    <td style="padding: 6px; border: 1px solid #000;"><strong>${isAssignment ? (qp.assessment_type === 'Project' ? 'Project' : qp.assessment_type === 'Practical' ? 'Practical' : qp.assessment_type === 'Indirect' ? 'Indirect Assessment' : 'Assignment') : 'Internal Assessment Test'}</strong></td>
    <td colspan="3" style="padding: 6px; border: 1px solid #000;">${examDisplay}${isAssignment && qp.assignment_kl_domain ? ` (${qp.assignment_kl_domain})` : ''}</td>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Academic Year</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.academic_year}</td>
  </tr>
  <tr>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Course Code / Title</strong></td>
    <td colspan="5" style="padding: 6px; border: 1px solid #000;">${subjectDisplay}</td>
  </tr>
  <tr>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Year / Semester</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${yearSemester}</td>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Department</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.department}</td>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Common for</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.common_for || qp.commonFor || 'NIL'}</td>
  </tr>
  <tr>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Max Mark</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.total_marks}</td>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Duration</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.duration || calculateDuration(qp.start_time, qp.end_time, qp.time_slot || qp.timeSlot) || '180 min'}</td>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Date</strong></td>
    <td style="padding: 6px; border: 1px solid #000;">${qp.exam_date_display || formatExamDateDisplay(qp.exam_date) || (qp.exam_date ? new Date(qp.exam_date).toLocaleDateString() : '')}</td>
  </tr>
  <tr>
    <td style="padding: 6px; border: 1px solid #000;"><strong>Reg. No.</strong></td>
    <td colspan="5" style="padding: 6px; border: 1px solid #000;"></td>
  </tr>
</table>
  `;

  if (isAssignment) {
    html += `
<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; text-align: left; font-size: 12px;">
  <thead>
    <tr>
      <th style="width: 8%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">Q. No.</th>
      <th style="width: 52%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">PI</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">Marks</th>
    </tr>
  </thead>
  <tbody>`;
    if (qp.assignment_config && qp.assignment_config.length > 0) {
      qp.assignment_config.forEach((q, idx) => {
        const allCOs = (q.mappings || []).map(m => `${m.co} (${m.marks || 0})`).join(', ');
        const allPIs = (q.mappings || []).map(m => (m.pis || []).map((pi, i) => `${pi}${m.piMarks && m.piMarks[i] != null ? ` (${m.piMarks[i]})` : ''}`).join(', ')).join(', ');
        html += `
          <tr>
            <td style="text-align: center; padding: 8px; border: 1px solid #000;">${idx + 1}</td>
            <td style="padding: 8px; border: 1px solid #000;">${q.question || ''}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${qp.assignment_kl || ''}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${allCOs}</td>
            <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${allPIs}</td>
            <td style="text-align: center; padding: 4px; border: 1px solid #000;">${q.marks}</td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else {
    (qp.parts || []).forEach((part, index) => {
      const partLetter = String.fromCharCode(64 + index + 1);
      const totalMarks = `<span>${part.num_questions} &times; ${part.marks_per_question} = ${part.num_questions * part.marks_per_question}</span>`;

      html += `
<table class="part-section-table" border="1" style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; text-align: left; font-size: 12px; border: 1.5px solid #000;">
  <thead style="display: table-header-group;">
    <tr class="part-title-row" style="break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid;">
      <td colspan="3" style="padding: 6px; border: 1px solid #000; border-right: none; font-size: 12px; font-weight: normal;">Part ${partLetter} <span style="font-weight: normal; font-style: italic; font-size: 12px;">(Answer all questions)</span></td>
      <td colspan="2" style="padding: 6px; border: 1px solid #000; border-left: none; text-align: right; font-size: 12px; font-weight: normal;">${totalMarks} Marks</td>
    </tr>
    <tr class="part-column-headers-row" style="break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid;">
      <th style="width: 8%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">Q. No.</th>
      <th style="width: 62%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">Question(s)</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">KL</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">CO</th>
      <th style="width: 10%; text-align: center; padding: 4px; border: 1px solid #000; font-weight: normal;">PI</th>
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

          if (/<table/i.test(str)) {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(`<div>${str}</div>`, 'text/html');
              const innerTables = doc.querySelectorAll('table');
              innerTables.forEach(t => {
                t.setAttribute('border', '1');
                t.style.borderCollapse = 'collapse';
                t.style.margin = '8px 0';
                t.style.width = '100%';
                t.style.border = '1px solid #000';
                t.querySelectorAll('th, td').forEach(c => {
                  c.style.border = '1px solid #000';
                  c.style.padding = '4px 6px';
                  c.style.fontSize = '12px';
                  c.style.textAlign = 'center';
                });
              });
              const rootDiv = doc.body.firstElementChild;
              if (rootDiv) str = rootDiv.innerHTML;
            } catch (e) { }
          } else {
            str = str.replace(/<\/p>\s*<p[^>]*>(?=\s*(?:<span[^>]*class="[^"]*math[^"]*"[^>]*>|\\\(|\\\[|,|\.|\b(and|or|let|where|find|with|if|then|for|is|are|the|a|an)\b))/gi, ' ');
            str = str.replace(/(?:<\/span>|\\\)|\\\])\s*<\/p>\s*<p[^>]*>/gi, ' ');
            str = str.replace(/<\/p>\s*<p[^>]*>/gi, '<br>').replace(/<\/?p[^>]*>/gi, '').replace(/<\/div>\s*<div[^>]*>/gi, '<br>').replace(/<\/?div[^>]*>/gi, '');
            str = str.replace(/<br\s*\/?>\s*(?=<span[^>]*class="[^"]*math[^"]*"[^>]*>|\\\()/gi, ' ');
            str = str.replace(/(?:<\/span>|\\\))\s*<br\s*\/?>\s*(?=[a-z0-9,.\)\(])/gi, ' ');
          }

          str = str.replace(/\[Math Processing Error\]/gi, '');

          str = str.replace(/(?:\\\()?([A-Za-z0-9_\s\^\{\}-]*\s*=\s*)?\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Bmatrix|cases|align|array)\}([\s\S]*?)\\end\{\2\}(?:\\\))?/gi, (match, prefix, envName, innerText) => {
            const cleanPrefix = prefix ? prefix.trim() : '';
            const cleanInner = innerText ? innerText.trim() : '';
            return `\\(${cleanPrefix ? `${cleanPrefix} ` : ''}\\begin{${envName}} ${cleanInner} \\end{${envName}}\\)`;
          });

          str = str.replace(/(?:\\\()?([A-Za-z]\^\{[^{}]+\})(?:\\\))?/gi, (match, powerExp) => {
            return `\\(${powerExp}\\)`;
          });

          str = str.replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)');

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
                <tr class="either-or-row either-or-start" style="break-after: avoid !important; page-break-after: avoid !important;">
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;">${q.qno}</td>
                  <td style="padding: 4px; border: 1px solid #000;">${formatMathText(q.question || '')}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.kl || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.co || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.pi || ''}</td>
                </tr>
                <tr class="either-or-row either-or-middle" style="break-before: avoid !important; page-break-before: avoid !important; break-after: avoid !important; page-break-after: avoid !important;">
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;">(Or)</td>
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                </tr>
                <tr class="either-or-row either-or-end" style="break-before: avoid !important; page-break-before: avoid !important;">
                  <td style="text-align: center; padding: 4px; border: 1px solid #000;">${nextQ?.qno || ""}</td>
                  <td style="padding: 4px; border: 1px solid #000;">${formatMathText(nextQ?.question || "")}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${nextQ?.kl || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${nextQ?.co || ''}</td>
                  <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${nextQ?.pi || ''}</td>
                </tr>
              `;
            }
          } else {
            html += `
              <tr>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;">${q.qno}</td>
                <td style="padding: 4px; border: 1px solid #000;">${formatMathText(q.question || '')}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.kl || ''}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.co || ''}</td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;">${q.pi || ''}</td>
              </tr>
            `;
          }
        });
      } else {
        let questionCounter = 1;
        for (let j = 0; j < part.num_questions; j++) {
          if (part.isEitherOr) {
            html += `
              <tr class="either-or-row either-or-start" style="break-after: avoid !important; page-break-after: avoid !important;">
                <td style="text-align: center; padding: 4px; border: 1px solid #000;">${questionCounter}(a)</td>
                <td style="padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
              </tr>
              <tr class="either-or-row either-or-middle" style="break-before: avoid !important; page-break-before: avoid !important; break-after: avoid !important; page-break-after: avoid !important;">
                <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;">(Or)</td>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
              </tr>
              <tr class="either-or-row either-or-end" style="break-before: avoid !important; page-break-before: avoid !important;">
                <td style="text-align: center; padding: 4px; border: 1px solid #000;">${questionCounter}(b)</td>
                <td style="padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
              </tr>`;
          } else {
            html += `
              <tr>
                <td style="text-align: center; padding: 4px; border: 1px solid #000;">${questionCounter}</td>
                <td style="padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
                <td contenteditable="true" style="text-align: center; padding: 4px; border: 1px solid #000;"></td>
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

  const hasRealDescs = (arr) => Array.isArray(arr) && arr.length > 0 && arr.some(co => {
    const d = (co.description || '').trim();
    return d && d.toUpperCase() !== (co.code || '').toUpperCase();
  });

  let effectiveCos = [];
  const qpSavedCos = qp?.course_outcomes || qp?.courseOutcomes;
  if (hasRealDescs(qpSavedCos)) {
    effectiveCos = qpSavedCos;
  } else if (cos && Array.isArray(cos) && cos.length > 0 && hasRealDescs(cos)) {
    effectiveCos = cos;
  } else if (cos && Array.isArray(cos) && cos.length > 0) {
    effectiveCos = cos;
  } else if (qpSavedCos && Array.isArray(qpSavedCos) && qpSavedCos.length > 0) {
    effectiveCos = qpSavedCos;
  } else if (activeCOs.size > 0) {
    effectiveCos = Array.from(activeCOs).sort().map(c => ({
      code: c,
      description: `${c} Course Outcome`
    }));
  }

  const coveredCos = effectiveCos.filter((co) => {
    const coCode = (co.code || co.co_code || co.co || '').toUpperCase();
    return activeCOs.has(coCode) || (coWeightage[coCode] && coWeightage[coCode] > 0) || (co.weightage && co.weightage > 0) || co.tick === '✓';
  });

  const listToRender = coveredCos.length > 0 ? coveredCos : effectiveCos;

  const extractCleanSubjectTitle = (input) => {
    if (!input) return '';
    let str = input;
    if (typeof str === 'object' && str !== null) {
      str = str.name || str.title || str.label || str.subjectName || str.code || '';
    } else if (typeof str === 'string') {
      str = str.trim();
      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          str = parsed.name || parsed.title || parsed.label || parsed.subjectName || parsed.code || '';
        } catch (e) { }
      }
    }
    str = String(str || '').trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      const codePart = parts[0].trim();
      const titlePart = parts.slice(1).join('-').trim();
      if (/^[A-Z0-9]+$/i.test(codePart) && titlePart) {
        return titlePart;
      }
    }
    return str;
  };

  let coRows = '';
  if (listToRender && listToRender.length > 0) {
    const subjTitle = extractCleanSubjectTitle(qp?.subject || qp?.subject_name || qp?.subjectTitle);
    coRows = listToRender.map((co) => {
      const coCode = (co.code || co.co_code || co.co || '').toUpperCase();
      const rawDesc = (co.description || co.desc || co.co_description || co.statement || co.details || '').trim();
      const fallbackDesc = subjTitle ? `Understand and apply concepts of ${subjTitle}` : `Understand and apply course outcome concepts (${coCode})`;
      const coDesc = (rawDesc && rawDesc.toUpperCase() !== coCode && rawDesc !== '—' && !rawDesc.startsWith('{')) ? rawDesc : fallbackDesc;
      const tick = activeCOs.has(coCode) || (coWeightage[coCode] && coWeightage[coCode] > 0) || co.tick === '✓' ? '✓' : '';
      const w = coWeightage[coCode] || co.weightage || '';
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #000; text-align: center; word-wrap: break-word; overflow-wrap: break-word;">${coCode}</td>
          <td style="padding: 6px; border: 1px solid #000; text-align: left; word-wrap: break-word; overflow-wrap: break-word;">${coDesc}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #000; word-wrap: break-word; overflow-wrap: break-word;">${tick}</td>
          <td style="text-align: center; padding: 6px; border: 1px solid #000; word-wrap: break-word; overflow-wrap: break-word;">${w || ''}</td>
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
      <div class="outcomes-summary-section" style="margin-top: 25px; page-break-inside: avoid; break-inside: avoid;">
        <h3 style="font-size: 12px; margin-bottom: 8px; font-weight: normal;">Details of Course Outcomes</h3>
        <table class="co-summary-table" border="1" style="border-collapse: collapse; width: 100%; font-size: 12px; border: 1.5px solid #000; box-sizing: border-box; table-layout: fixed;">
            <thead>
                <tr>
                    <th style="width: 16%; padding: 6px; border: 1px solid #000; text-align: center; font-weight: normal;">Course Outcome Code</th>
                    <th style="width: 52%; padding: 6px; border: 1px solid #000; text-align: left; font-weight: normal;">Description</th>
                    <th style="width: 16%; padding: 6px; border: 1px solid #000; text-align: center; font-weight: normal;">Tick the CO's covered in this QP</th>
                    <th style="width: 16%; padding: 6px; border: 1px solid #000; text-align: center; font-weight: normal;">Weightage of marks allotted to each CO</th>
                </tr>
            </thead>
            <tbody>
                ${coRows}
            </tbody>
        </table>
      </div>

<table class="signatures-table" border="1" style="width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 12px; border: 1.5px solid #000; box-sizing: border-box; table-layout: fixed;">
  <tr>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px; border: 1px solid #000;">${facultySignatureHtml}</td>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px; border: 1px solid #000;">${acSignatureHtml}</td>
    <td style="height: 65px; width: 33.33%; text-align: center; vertical-align: bottom; padding: 5px; border: 1px solid #000;">${hodSignatureHtml}</td>
  </tr>
  <tr>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: normal;">Subject Faculty Signature</td>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: normal;">Academic Coordinator Signature</td>
    <td style="text-align: center; padding: 6px; border: 1px solid #000; font-weight: normal;">HOD Signature</td>
  </tr>
</table>
</div>
  `;
  return html;
};

export const buildQuestionPaperPrintShell = (content, title = 'Question Paper') => {
  const contentNoInnerStyle = (content || '').replace(/<style[\s\S]*?<\/style>/gi, '');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 12mm 14mm 12mm;
  }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  html,body{margin:0!important;padding:0!important;font-family:'Times New Roman',Times,serif!important;font-size:12px!important;color:#000!important;background:#fff!important;line-height:1.4}
  .page-shell{width:100%;max-width:186mm;margin:0 auto}
  table{border-collapse:collapse;width:100%;box-sizing:border-box!important}
  td,th{border:1px solid #000!important;padding:4px 6px;font-family:'Times New Roman',Times,serif!important;font-size:12px!important;vertical-align:top;box-sizing:border-box!important}
  .qp-preview-container,.qp-preview-container *{font-family:'Times New Roman',Times,serif!important;font-size:12px!important}
  .co-summary-table,.signatures-table,.header-box-table,.part-section-table{box-sizing:border-box!important;width:100%!important}
  /* STRICT BOLD REMOVAL: Only .header-box-table elements can be bold. Everything else in QP is font-weight: normal */
  .qp-preview-container *:not(.header-box-table):not(.header-box-table *){font-weight:normal!important}
  b,strong,th,td,h3,span,div,p{font-weight:normal}
  .header-box-table,.header-box-table *,.header-box-table b,.header-box-table strong,.header-box-table td strong{font-weight:bold!important}
  img{max-width:100%;height:auto}
  .logo-img{height:58px!important;width:auto!important;max-width:100%!important;display:block;margin:0 auto;object-fit:contain}
  thead{display:table-header-group}
  tfoot{display:table-footer-group}
  tr{page-break-inside:avoid;break-inside:avoid}
  .outcomes-summary-section{page-break-inside:avoid}
  /* Prevent Orphan Part Headers (Part title + column headers + 1st question stay together) */
  .part-title-row,.part-column-headers-row{break-after:avoid!important;page-break-after:avoid!important;break-inside:avoid!important;page-break-inside:avoid!important}
  .part-section-table tbody tr:first-child{break-before:avoid!important;page-break-before:avoid!important}
  .part-section-table{orphans:2;widows:2}
  /* Unbreakable Either/Or Question Pair Binding */
  tr.either-or-start,tr.either-or-start td{break-after:avoid!important;page-break-after:avoid!important}
  tr.either-or-middle,tr.either-or-middle td{break-before:avoid!important;page-break-before:avoid!important;break-after:avoid!important;page-break-after:avoid!important}
  tr.either-or-end,tr.either-or-end td{break-before:avoid!important;page-break-before:avoid!important}
  tr.either-or-row{break-inside:avoid!important;page-break-inside:avoid!important}
  .print-bar{position:fixed;top:0;left:0;right:0;background:#202124;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:9999;font-family:system-ui,-apple-system,sans-serif;font-size:13px}
  .print-bar button{background:#1a73e8;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-weight:600}
  @media screen{
    html,body{background:#525659!important}
    .paper-frame{background:#fff;width:210mm;min-height:297mm;margin:52px auto 24px;box-shadow:0 6px 28px rgba(0,0,0,.45);overflow:hidden;padding:0}
    .page-shell{padding:16mm 12mm 14mm 12mm}
  }
  @media print{
    html,body{background:#fff!important;width:auto!important;margin:0!important;padding:0!important}
    .paper-frame{box-shadow:none!important;margin:0!important;width:auto!important;min-height:auto!important;background:#fff!important;padding:0!important}
    .page-shell{padding:0!important;margin:0 auto!important}
    .qp-preview-container{padding-top:8mm!important;box-decoration-break:clone!important;-webkit-box-decoration-break:clone!important}
    .print-bar{display:none!important}
  }
</style>
<script>
window.MathJax={
  tex:{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]},
  svg:{fontCache:'global'},
  startup:{pageReady:()=>MathJax.startup.defaultPageReady().then(()=>{setTimeout(()=>{window.focus();window.print()},800)})}
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" async></script>
</head><body>
<div class="print-bar no-print">
  <span>Question Paper — A4 Portrait &bull; 14mm top/bottom, 12mm left/right margins on every page</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div class="paper-frame">
  <div class="page-shell">
    ${contentNoInnerStyle}
  </div>
</div>
<script>
  setTimeout(()=>{if(!window.MathJax||!window.MathJax.typesetPromise){window.focus();window.print()}},2000);
</script>
</body></html>`;
};
