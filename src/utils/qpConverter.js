import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function getParaText(p) {
  const texts = [];
  const rs = p.getElementsByTagNameNS(W_NS, 'r');
  for (const r of rs) {
    if (r.parentNode !== p) continue;
    const ts = r.getElementsByTagNameNS(W_NS, 't');
    for (const t of ts) {
      if (t.parentNode !== r) continue;
      if (t.textContent) texts.push(t.textContent);
    }
  }
  return texts.join('').trim();
}

function setRunFont(rPr, font = 'Century Schoolbook', sizePt = 12) {
  const szHalf = String(sizePt * 2);
  const doc = rPr.ownerDocument;
  let rFonts = null;
  for (const child of rPr.children) {
    if (child.localName === 'rFonts' && child.namespaceURI === W_NS) {
      rFonts = child;
      break;
    }
  }
  if (!rFonts) {
    rFonts = doc.createElementNS(W_NS, 'rFonts');
    rPr.insertBefore(rFonts, rPr.firstChild);
  }
  rFonts.setAttributeNS(W_NS, 'w:ascii', font);
  rFonts.setAttributeNS(W_NS, 'w:hAnsi', font);
  rFonts.setAttributeNS(W_NS, 'w:cs', font);
  let sz = null;
  for (const child of rPr.children) {
    if (child.localName === 'sz' && child.namespaceURI === W_NS && child.parentNode === rPr) {
      sz = child;
      break;
    }
  }
  if (!sz) {
    sz = doc.createElementNS(W_NS, 'sz');
    rPr.appendChild(sz);
  }
  sz.setAttributeNS(W_NS, 'w:val', szHalf);
  let szCs = null;
  for (const child of rPr.children) {
    if (child.localName === 'szCs' && child.namespaceURI === W_NS && child.parentNode === rPr) {
      szCs = child;
      break;
    }
  }
  if (!szCs) {
    szCs = doc.createElementNS(W_NS, 'szCs');
    rPr.appendChild(szCs);
  }
  szCs.setAttributeNS(W_NS, 'w:val', szHalf);
}

function applyFontToDoc(doc, font = 'Century Schoolbook', sizePt = 12) {
  const allRPr = doc.getElementsByTagNameNS(W_NS, 'rPr');
  for (let i = 0; i < allRPr.length; i++) {
    setRunFont(allRPr[i], font, sizePt);
  }
  const allR = doc.getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < allR.length; i++) {
    const r = allR[i];
    let hasRPr = false;
    for (const child of r.children) {
      if (child.localName === 'rPr' && child.namespaceURI === W_NS) {
        hasRPr = true;
        break;
      }
    }
    if (!hasRPr) {
      const rPr = doc.createElementNS(W_NS, 'rPr');
      r.insertBefore(rPr, r.firstChild);
      setRunFont(rPr, font, sizePt);
    }
  }
}

function setParaText(p, text, font = 'Century Schoolbook', sizePt = 12, bold = false) {
  const doc = p.ownerDocument;
  const existing = [];
  for (const child of p.children) {
    if (child.localName === 'r' && child.namespaceURI === W_NS) existing.push(child);
    if (child.localName === 'sdt' && child.namespaceURI === W_NS) existing.push(child);
  }
  existing.forEach(c => c.remove());
  let pPr = null;
  for (const child of p.children) {
    if (child.localName === 'pPr' && child.namespaceURI === W_NS) { pPr = child; break; }
  }
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, 'pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  const r = doc.createElementNS(W_NS, 'r');
  const rPr = doc.createElementNS(W_NS, 'rPr');
  setRunFont(rPr, font, sizePt);
  if (bold) {
    const b = doc.createElementNS(W_NS, 'b');
    rPr.appendChild(b);
  }
  r.appendChild(rPr);
  const t = doc.createElementNS(W_NS, 't');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
}

function setCellPlain(cell, text, font = 'Century Schoolbook', sizePt = 12, center = false, bold = false) {
  const doc = cell.ownerDocument;
  const allPs = [];
  for (const child of cell.children) {
    if (child.localName === 'p' && child.namespaceURI === W_NS) allPs.push(child);
  }
  if (allPs.length === 0) return;
  for (const p of allPs) {
    const existingRs = [];
    for (const child of p.children) {
      if (child.localName === 'r' && child.namespaceURI === W_NS) existingRs.push(child);
    }
    existingRs.forEach(r => r.remove());
  }
  const p = allPs[0];
  for (let i = allPs.length - 1; i >= 1; i--) {
    allPs[i].remove();
  }
  let pPr = null;
  for (const child of p.children) {
    if (child.localName === 'pPr' && child.namespaceURI === W_NS) { pPr = child; break; }
  }
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, 'pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  let jc = null;
  for (const child of pPr.children) {
    if (child.localName === 'jc' && child.namespaceURI === W_NS) { jc = child; break; }
  }
  if (center) {
    if (!jc) { jc = doc.createElementNS(W_NS, 'jc'); pPr.appendChild(jc); }
    jc.setAttributeNS(W_NS, 'w:val', 'center');
  } else if (jc) {
    jc.remove();
  }
  const r = doc.createElementNS(W_NS, 'r');
  const rPr = doc.createElementNS(W_NS, 'rPr');
  setRunFont(rPr, font, sizePt);
  if (bold) {
    const b = doc.createElementNS(W_NS, 'b');
    rPr.appendChild(b);
  }
  r.appendChild(rPr);
  const t = doc.createElementNS(W_NS, 't');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
}

// ─────────────────────────────────────
//  Rich content transfer helpers
// ─────────────────────────────────────

function cellHasRealContent(cell) {
  const draws = cell.getElementsByTagNameNS(W_NS, 'drawing');
  if (draws.length > 0) return true;
  const tbls = cell.getElementsByTagNameNS(W_NS, 'tbl');
  if (tbls.length > 0) return true;
  return !!(cell.textContent || '').trim();
}

function applyFontToElement(elem, font, sizePt) {
  const rPrs = elem.getElementsByTagNameNS(W_NS, 'rPr');
  for (let i = 0; i < rPrs.length; i++) setRunFont(rPrs[i], font, sizePt);
}

async function transferCellContent(srcCell, tgtCell, sourceZip, tgtZip, srcRels, tgtRels, relRIdMap, nextRId) {
  const doc = tgtCell.ownerDocument;
  // Deep-copy all children except tcPr
  const childrenToCopy = [];
  for (const child of srcCell.children) {
    if (child.localName === 'tcPr' && child.namespaceURI === W_NS) continue;
    childrenToCopy.push(child);
  }
  // Remove existing children in target cell (except tcPr)
  const toRemove = [];
  for (const child of tgtCell.children) {
    if (child.localName === 'tcPr' && child.namespaceURI === W_NS) continue;
    toRemove.push(child);
  }
  toRemove.forEach(c => c.remove());

  // If source has nothing beyond tcPr, skip
  if (childrenToCopy.length === 0) return;

  // Find all relationship references in the source content
  const usedRIds = new Set();
  const allElems = [];
  childrenToCopy.forEach(c => collectAllDescendants(c, allElems));
  childrenToCopy.forEach(c => allElems.push(c));

  for (const el of allElems) {
    for (const attr of el.attributes) {
      if (attr.namespaceURI === R_NS && (attr.localName === 'embed' || attr.localName === 'id' || attr.localName === 'link' || attr.localName === 'href')) {
        usedRIds.add(attr.value);
      }
    }
  }

  // Build target doc relationships (copy media from source)
  for (const rId of usedRIds) {
    if (relRIdMap.has(rId)) continue; // already mapped
    const srcRel = srcRels[rId];
    if (!srcRel) continue;
    // Copy media file
    const srcPath = srcRel.target;
    const srcFile = sourceZip.file(srcPath.replace(/^\//, ''));
    if (!srcFile) continue;
    const content = await srcFile.async('arraybuffer');
    const tgtPath = srcPath; // same path
    tgtZip.file(tgtPath, content);
    // Create new relationship in target
    const newRId = `rId${nextRId.current++}`;
    tgtRels.push({ id: newRId, type: srcRel.type, target: srcRel.target });
    relRIdMap.set(rId, newRId);
  }

  // Deep-copy source children, remapping rIds
  for (const srcChild of childrenToCopy) {
    const cloned = doc.importNode ? doc.importNode(srcChild, true) : srcChild.cloneNode(true);
    // Remap rIds
    const clonedElems = [];
    collectAllDescendants(cloned, clonedElems);
    clonedElems.push(cloned);
    for (const el of clonedElems) {
      for (const attr of el.attributes) {
        if (attr.namespaceURI === R_NS && (attr.localName === 'embed' || attr.localName === 'id' || attr.localName === 'link' || attr.localName === 'href')) {
          const mapped = relRIdMap.get(attr.value);
          if (mapped) attr.value = mapped;
        }
      }
    }
    // Apply font
    applyFontToElement(cloned, 'Century Schoolbook', 12);
    tgtCell.appendChild(cloned);
  }
}

function collectAllDescendants(el, arr) {
  for (const child of el.children) {
    arr.push(child);
    collectAllDescendants(child, arr);
  }
}

function removeTableBorders(tbl) {
  const doc = tbl.ownerDocument;
  // Remove tblBorders from tblPr
  let tblPr = null;
  for (const child of tbl.children) {
    if (child.localName === 'tblPr' && child.namespaceURI === W_NS) { tblPr = child; break; }
  }
  if (tblPr) {
    const toRemove = [];
    for (const child of tblPr.children) {
      if (child.localName === 'tblBorders' && child.namespaceURI === W_NS) toRemove.push(child);
    }
    toRemove.forEach(c => c.remove());
  }
  // Remove tcBorders from all tcPr
  const tcPrs = tbl.getElementsByTagNameNS(W_NS, 'tcPr');
  for (let i = 0; i < tcPrs.length; i++) {
    const tcPr = tcPrs[i];
    const toRemove = [];
    for (const child of tcPr.children) {
      if (child.localName === 'tcBorders' && child.namespaceURI === W_NS) toRemove.push(child);
    }
    toRemove.forEach(c => c.remove());
  }
}

// ─────────────────────────────────────
//  Detect format
// ─────────────────────────────────────

const DEPT_MAP = {
  "COMPUTER SCIENCE AND ENGINEERING": "COMPUTER SCIENCE AND ENGINEERING",
  "CSE": "COMPUTER SCIENCE AND ENGINEERING",
  "ECE": "ELECTRONICS AND COMMUNICATION ENGINEERING",
  "EEE": "ELECTRICAL AND ELECTRONICS ENGINEERING",
  "IT": "INFORMATION TECHNOLOGY",
  "MECH": "MECHANICAL ENGINEERING",
  "CIVIL": "CIVIL ENGINEERING",
  "AI&DS": "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE",
  "AIDS": "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE",
  "AIML": "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING",
  "CSBS": "COMPUTER SCIENCE AND BUSINESS SYSTEMS",
  "MBA": "MASTER OF BUSINESS ADMINISTRATION",
  "MCA": "MASTER OF COMPUTER APPLICATIONS",
  "BME": "BIOMEDICAL ENGINEERING",
  "AGRI": "AGRICULTURAL ENGINEERING",
};
const DEPT_MAP_KEYS = Object.keys(DEPT_MAP);

function detectFormat(paras, tables) {
  for (const p of paras) {
    const txt = getParaText(p);
    const nt = norm(txt);
    if (/course code|registration number|year \/ semester|internal assessment/i.test(nt)) return 'iat';
  }
  for (const tbl of tables) {
    const rows = getChildElements(tbl, 'tr');
    for (const row of rows) {
      const cells = getChildElements(row, 'tc');
      for (const cell of cells) {
        const ct = norm(cell.textContent);
        if (/course code|registration number|year \/ semester|internal assessment/i.test(ct)) return 'iat';
      }
    }
  }
  return 'endsem';
}

function getChildElements(parent, localName) {
  const result = [];
  for (const child of parent.children) {
    if (child.localName === localName && child.namespaceURI === W_NS) {
      result.push(child);
    }
  }
  return result;
}

function getAllDescendantElements(parent, localName) {
  return Array.from(parent.getElementsByTagNameNS(W_NS, localName));
}

// ─────────────────────────────────────
//  EndSem parser
// ─────────────────────────────────────

function parseEndsem(paras) {
  const data = { semester: '', department: '', subject_code_name: '', regulation: '', part_a: [], part_b: [] };
  for (const p of paras) {
    const t = getParaText(p);
    if (!t) continue;
    if (!data.semester) {
      const m = t.match(/((?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth)\s+Semester)/i);
      if (m) data.semester = m[1];
    }
    if (!data.department) {
      const normalized = t.toUpperCase().replace(/[^A-Z0-9& ]/g, '').replace(/\s+/g, ' ').trim();
      if (DEPT_MAP[normalized]) data.department = DEPT_MAP[normalized];
    }
    if (!data.subject_code_name) {
      const m = t.match(/^([A-Z]{2,6}\d{3,4})\s+(.*)$/i);
      if (m) {
        const code = m[1].trim();
        let name = m[2].trim();
        name = name.replace(/^and\s+/i, '');
        data.subject_code_name = `${code} - ${name}`;
      }
    }
    if (!data.regulation) {
      const m = t.match(/Regulation\s*\(?\s*(\d{4})\s*\)?/i);
      if (m) data.regulation = m[1];
    }
  }
  parseQuestionTables(paras, data);
  return data;
}

// ─────────────────────────────────────
//  IAT parser
// ─────────────────────────────────────

const IAT_LABEL_MAP = {
  'branch': 'department',
  'dept': 'department',
  'department': 'department',
  'course code & title': 'subject_code_name',
  'course code and title': 'subject_code_name',
  'course code & name': 'subject_code_name',
  'subject': 'subject_code_name',
  'course title': 'subject_code_name',
  'year / semester': 'semester_raw',
  'year/semester': 'semester_raw',
  'semester': 'semester',
  'degree': 'degree',
};

const SEM_ORDINALS = {
  '1': 'First', 'i': 'First',
  '2': 'Second', 'ii': 'Second',
  '3': 'Third', 'iii': 'Third',
  '4': 'Fourth', 'iv': 'Fourth',
  '5': 'Fifth', 'v': 'Fifth',
  '6': 'Sixth', 'vi': 'Sixth',
  '7': 'Seventh', 'vii': 'Seventh',
  '8': 'Eighth', 'viii': 'Eighth',
};

function semFromYearSem(raw) {
  const parts = raw.split(/[/\s]+/).map(p => p.trim().toLowerCase()).filter(Boolean);
  const token = parts.length >= 2 ? parts[1] : (parts[0] || '');
  return (SEM_ORDINALS[token] || token.charAt(0).toUpperCase() + token.slice(1)) + ' Semester';
}

function parseIat(tables) {
  const data = { semester: '', department: '', subject_code_name: '', regulation: '', degree: '', part_a: [], part_b: [] };
  for (const tbl of tables) {
    const rows = getChildElements(tbl, 'tr');
    for (const row of rows) {
      const cells = getChildElements(row, 'tc');
      const texts = Array.from(cells).map(c => norm(c.textContent));
      const rawTexts = Array.from(cells).map(c => (c.textContent || '').trim());
      if (texts.some(t => t === 'degree') && texts.some(t => t === 'branch')) {
        const di = texts.indexOf('degree');
        const bi = texts.indexOf('branch');
        if (di + 1 < rawTexts.length) data.degree = rawTexts[di + 1];
        if (bi + 1 < rawTexts.length) data.department = rawTexts[bi + 1];
      }
      for (let ci = 0; ci < texts.length; ci++) {
        const label = texts[ci];
        if (!label) continue;
        let matchedKey = null;
        for (const [lbl, key] of Object.entries(IAT_LABEL_MAP)) {
          if (label.includes(lbl)) { matchedKey = key; break; }
        }
        if (!matchedKey) continue;
        let value = '';
        for (let vi = ci + 1; vi < rawTexts.length; vi++) {
          if (rawTexts[vi]) { value = rawTexts[vi]; break; }
        }
        if (!value) continue;
        if (matchedKey === 'semester_raw') {
          data.semester = semFromYearSem(value);
        } else if (matchedKey === 'department') {
          if (!data.department && !/^B\.?(E|TECH)|^M\.?(E|TECH)/i.test(value)) {
            data.department = value;
          }
        } else {
          data[matchedKey] = value;
        }
      }
    }
  }
  parseQuestionTables(parasFromTables(tables), data);
  return data;
}

function parasFromTables(tables) {
  const all = [];
  for (const tbl of tables) {
    const rows = getChildElements(tbl, 'tr');
    for (const row of rows) {
      const cells = getChildElements(row, 'tc');
      for (const cell of cells) {
        const ps = getChildElements(cell, 'p');
        ps.forEach(p => all.push(p));
      }
    }
  }
  return all;
}

// ─────────────────────────────────────
//  Shared question-table parser
// ─────────────────────────────────────

function isOrRow(cellTexts) {
  const joined = cellTexts.join('').replace(/\s+/g, '').toUpperCase();
  return /^\(OR\)+$/.test(joined);
}

function colIdx(headers, pattern) {
  for (let i = 0; i < headers.length; i++) {
    if (pattern.test(headers[i])) return i;
  }
  return -1;
}

function safe(cells, idx, def = '') {
  if (idx < 0 || idx >= cells.length) return def;
  return (cells[idx] || '').trim() || def;
}

function parseQuestionTables(paras, data) {
  const tables = [];
  paras.forEach(p => {
    let tbl = p.parentNode;
    while (tbl && tbl.localName !== 'tbl') tbl = tbl.parentNode;
    if (tbl && !tables.includes(tbl)) tables.push(tbl);
  });
  if (tables.length === 0) {
    const doc = paras.length ? (paras[0].parentNode?.ownerDocument || paras[0].ownerDocument) : null;
    if (doc) {
      const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
      if (body) tables.push(...getChildElements(body, 'tbl'));
    }
  }
  for (const tbl of tables) {
    const rows = getChildElements(tbl, 'tr');
    if (rows.length < 2) continue;
    const hCells = getChildElements(rows[0], 'tc');
    const headers = Array.from(hCells).map(c => norm(c.textContent));
    const hasUnit = headers.some(h => h.includes('unit'));
    const hasMark = headers.some(h => h.includes('mark'));
    const hasQno = headers.some(h => /q[\.\s]*no/.test(h));
    const hasKLevel = headers.some(h => (/\bk\b/.test(h) && (h.includes('level') || h.includes('k1'))) || /^kl$/i.test(h));
    const hasCo = headers.some(h => /^co$|^c\.o|co\b/.test(h));
    let partKey = null;
    if (hasQno && hasUnit && hasKLevel && !hasMark) {
      partKey = 'part_a';
    } else if (hasQno && hasMark) {
      partKey = 'part_b';
    } else if (hasQno && hasKLevel && hasCo && !hasUnit && !hasMark) {
      const iatTableCount = data.part_a.filter(q => !q.is_or).length + data.part_b.filter(q => !q.is_or).length;
      partKey = 'part_a';
      if (data.part_a.length > 0 && (iatTableCount > 0 || headers.some(h => /mark/i.test(h)))) {
        partKey = 'part_b';
      }
    }
    if (!partKey) continue;
    const qCol = colIdx(headers, /q[\.\s]*no/);
    const qsCol = colIdx(headers, /question/);
    const mkCol = colIdx(headers, /mark/);
    const unCol = colIdx(headers, /unit/);
    const klCol = colIdx(headers, /k\b|k.?level|^kl$/i);
    const coCol = colIdx(headers, /\bco\b/);
    const qsCellIdx = qsCol >= 0 ? qsCol : 1;
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = getChildElements(rows[ri], 'tc');
      const ct = Array.from(cells).map(c => (c.textContent || '').trim());
      if (partKey === 'part_b' && isOrRow(ct)) {
        data.part_b.push({ is_or: true });
        continue;
      }
      if (ct[0]) {
        const entry = {
          q_no: qCol >= 0 ? safe(ct, qCol) : '',
          question: qsCol >= 0 ? safe(ct, qsCol) : '',
          unit: unCol >= 0 ? safe(ct, unCol) : '',
          k_level: klCol >= 0 ? safe(ct, klCol) : '',
          co: coCol >= 0 ? safe(ct, coCol) : '',
          _srcCellNode: cells[qsCellIdx],
        };
        if (partKey === 'part_b') {
          entry.marks = mkCol >= 0 ? safe(ct, mkCol) : '';
          entry.is_or = false;
        }
        data[partKey].push(entry);
      }
    }
  }
}

// ─────────────────────────────────────
//  Main parse entry point
// ─────────────────────────────────────

export async function parseDocx(file) {
  const zip = await JSZip.loadAsync(file);
  let docXmlStr = await zip.file('word/document.xml').async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXmlStr, 'text/xml');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const paras = body ? getChildElements(body, 'p') : [];
  const tables = body ? getChildElements(body, 'tbl') : [];
  const fmt = detectFormat(paras, tables);
  const data = fmt === 'iat' ? parseIat(tables) : parseEndsem(paras);
  data._format = fmt;
  data._sourceDoc = doc;
  data._sourceZip = zip;
  return data;
}

// ─────────────────────────────────────
//  Fill template
// ─────────────────────────────────────

export async function generateDocx(data) {
  const resp = await fetch('/question_paper_template.docx');
  const templateBuf = await resp.arrayBuffer();
  const tgtZip = await JSZip.loadAsync(templateBuf);

  let docXmlStr = await tgtZip.file('word/document.xml').async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXmlStr, 'text/xml');

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const allParas = body ? getChildElements(body, 'p') : [];

  function findParaByText(textPattern) {
    for (const p of allParas) {
      if (textPattern.test(getParaText(p))) return p;
    }
    return null;
  }

  // Semester
  const semPara = findParaByText(/^Semester$/);
  if (semPara && data.semester) {
    setParaText(semPara, data.semester, 'Century Schoolbook', 12, true);
  }

  // Department
  const deptPara = findParaByText(/^Name of the Department$/);
  if (deptPara && data.department) {
    setParaText(deptPara, data.department, 'Century Schoolbook', 12, true);
  }

  // Subject
  const subPara = findParaByText(/^Subject Code and Subject Name$/);
  if (subPara && data.subject_code_name) {
    setParaText(subPara, data.subject_code_name, 'Century Schoolbook', 12, true);
  }

  // Regulation
  for (const p of allParas) {
    const txt = getParaText(p);
    if (/Regulation\s+\d{4}/i.test(txt)) {
      if (data.regulation) {
        setParaText(p, `(Regulation ${data.regulation})`, 'Century Schoolbook', 12, true);
      }
      break;
    }
  }

  // Find Part A & B tables
  const tables = body ? getChildElements(body, 'tbl') : [];
  let partATbl = null;
  let partBTbl = null;
  for (const tbl of tables) {
    const rows = getChildElements(tbl, 'tr');
    if (!partATbl) {
      const hText = rows.length > 0 ? norm(rows[0].textContent) : '';
      if ((hText.includes('q.no') || hText.includes('q. no')) && rows.length >= 10) partATbl = tbl;
    }
    if (!partBTbl && partATbl && tbl !== partATbl) {
      const hText = rows.length > 0 ? norm(rows[0].textContent) : '';
      if ((hText.includes('q.no') || hText.includes('q. no')) && rows.length >= 6) partBTbl = tbl;
    }
    if (partATbl && partBTbl) break;
  }

  // Fallback by index
  if (!partATbl && tables.length >= 2) {
    const hTxt = tables[0].textContent.toLowerCase();
    if (hTxt.includes('q.no') || hTxt.includes('q. no')) partATbl = tables[0];
    if (tables.length >= 4 && (tables[2].textContent.toLowerCase().includes('q.no') || tables[2].textContent.toLowerCase().includes('q. no'))) {
      partATbl = tables[2];
      if (tables.length >= 5) partBTbl = tables[4];
    }
  }

  // Remove borders from Part A and Part B tables
  if (partATbl) removeTableBorders(partATbl);
  if (partBTbl) removeTableBorders(partBTbl);

  // Load source relationships and target relationships
  let srcRels = {};
  const sourceZip = data._sourceZip;
  if (sourceZip) {
    const srcRelsFile = sourceZip.file('word/_rels/document.xml.rels');
    if (srcRelsFile) {
      const srcRelsXml = await srcRelsFile.async('string');
      srcRels = parseRelationships(srcRelsXml);
    }
  }

  let tgtRels = [];
  let tgtRelsXmlStr = '';
  const tgtRelsFile = tgtZip.file('word/_rels/document.xml.rels');
  if (tgtRelsFile) {
    tgtRelsXmlStr = await tgtRelsFile.async('string');
    tgtRels = parseRelationshipArray(tgtRelsXmlStr);
  }
  const nextRId = { current: (tgtRels.length + 1) };
  const relRIdMap = new Map();

  // Fill Part A
  if (partATbl && data.part_a && data.part_a.length) {
    const rows = getChildElements(partATbl, 'tr');
    if (rows.length > 0) {
      const hCells = getChildElements(rows[0], 'tc');
      if (hCells.length > 0) setCellPlain(hCells[0], hCells[0].textContent.trim(), 'Century Schoolbook', 12, true, true);
      if (hCells.length > 4) setCellPlain(hCells[4], hCells[4].textContent.trim(), 'Century Schoolbook', 12, true, true);
      if (hCells.length > 3) setCellPlain(hCells[3], 'KL', 'Century Schoolbook', 12, true, true);
    }
    let qIdx = 0;
    for (let ri = 1; ri < rows.length && qIdx < data.part_a.length; ri++) {
      const cells = getChildElements(rows[ri], 'tc');
      if (cells.length < 2) continue;
      const numText = cells[0].textContent.trim();
      if (/^\d+\.?$/.test(numText) && (!cells[1].textContent.trim() || cells[1].textContent.trim().toLowerCase().includes('enter question'))) {
        const q = data.part_a[qIdx];
        setCellPlain(cells[0], numText, 'Century Schoolbook', 12, false, false);
        // Rich content transfer
        const srcCell = q._srcCellNode;
        if (srcCell && sourceZip && cellHasRealContent(srcCell)) {
          await transferCellContent(srcCell, cells[1], sourceZip, tgtZip, srcRels, tgtRels, relRIdMap, nextRId);
        } else {
          setCellPlain(cells[1], q.question, 'Century Schoolbook', 12);
        }
        if (cells.length > 2) setCellPlain(cells[2], '2', 'Century Schoolbook', 12, true);
        if (cells.length > 3) setCellPlain(cells[3], q.k_level, 'Century Schoolbook', 12, true);
        if (cells.length > 4) setCellPlain(cells[4], q.co, 'Century Schoolbook', 12, true);
        qIdx++;
      }
    }
  }

  // Fill Part B
  if (partBTbl && data.part_b && data.part_b.length) {
    const rows = getChildElements(partBTbl, 'tr');
    // Set KL header
    if (rows.length > 0) {
      const hCells = getChildElements(rows[0], 'tc');
      if (hCells.length > 3) setCellPlain(hCells[3], 'KL', 'Century Schoolbook', 12, true, true);
    }
    const pbQs = data.part_b.filter(q => !q.is_or);
    let qIdx = 0;
    for (let ri = 1; ri < rows.length && qIdx < pbQs.length; ri++) {
      const cells = getChildElements(rows[ri], 'tc');
      if (cells.length < 2) continue;
      const qNoText = cells[0].textContent.trim();
      const isEmptyOrEnter = !cells[1].textContent.trim() || cells[1].textContent.trim().toLowerCase().includes('enter question');
      if (!isEmptyOrEnter) continue;
      const q = pbQs[qIdx];
      const marksVal = q.marks || '16';
      setCellPlain(cells[0], qNoText || q.q_no, 'Century Schoolbook', 12, false, false);
      // Add noWrap to Q.No cell
      const tc0 = cells[0];
      let tcPr0 = null;
      for (const child of tc0.children) {
        if (child.localName === 'tcPr' && child.namespaceURI === W_NS) { tcPr0 = child; break; }
      }
      if (tcPr0) {
        let hasNoWrap = false;
        for (const child of tcPr0.children) {
          if (child.localName === 'noWrap' && child.namespaceURI === W_NS) { hasNoWrap = true; break; }
        }
        if (!hasNoWrap) {
          const nw = doc.createElementNS(W_NS, 'noWrap');
          tcPr0.appendChild(nw);
        }
      }
      // Rich content transfer
      const srcCell = q._srcCellNode;
      if (srcCell && sourceZip && cellHasRealContent(srcCell)) {
        await transferCellContent(srcCell, cells[1], sourceZip, tgtZip, srcRels, tgtRels, relRIdMap, nextRId);
      } else {
        setCellPlain(cells[1], q.question, 'Century Schoolbook', 12);
      }
      if (cells.length > 2) setCellPlain(cells[2], marksVal, 'Century Schoolbook', 12, true);
      if (cells.length > 3) setCellPlain(cells[3], q.k_level, 'Century Schoolbook', 12, true);
      if (cells.length > 4) setCellPlain(cells[4], q.co, 'Century Schoolbook', 12, true);
      qIdx++;
    }
  }

  // Apply font
  applyFontToDoc(doc, 'Century Schoolbook', 12);

  // Serialize
  const serializer = new XMLSerializer();
  let newDocXml = serializer.serializeToString(doc);
  if (!newDocXml.startsWith('<?xml')) {
    newDocXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newDocXml;
  }
  tgtZip.file('word/document.xml', newDocXml);

  // Write updated target relationships
  if (tgtRels.length > 0) {
    let relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    relsXml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n';
    for (const r of tgtRels) {
      relsXml += `  <Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>\n`;
    }
    relsXml += '</Relationships>';
    tgtZip.file('word/_rels/document.xml.rels', relsXml);
  }

  const outBlob = await tgtZip.generateAsync({ type: 'blob' });
  return outBlob;
}

function parseRelationships(xmlStr) {
  const result = {};
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const r = rels[i];
    result[r.getAttribute('Id')] = {
      id: r.getAttribute('Id'),
      type: r.getAttribute('Type'),
      target: r.getAttribute('Target'),
    };
  }
  return result;
}

function parseRelationshipArray(xmlStr) {
  const result = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const r = rels[i];
    result.push({
      id: r.getAttribute('Id'),
      type: r.getAttribute('Type'),
      target: r.getAttribute('Target'),
    });
  }
  return result;
}
