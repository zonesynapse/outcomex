import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, Clock, FileText, Loader2, ShieldCheck, Calendar,
  FileDown, Printer, X, Download, Eye, Sparkles
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db, auth } from "../firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { formatDepartmentDisplay, formatBatchDisplay } from "../lib/utils";

const parseSyllabusDocId = (id) => {
  const parts = id.split('_');
  if (parts.length < 3) return { progKey: "", deptKey: "", regKey: "" };
  let progKey = parts[0];
  let deptStartIdx = 1;
  if (['B', 'M'].includes(parts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(parts[1])) {
    progKey = `${parts[0]}_${parts[1]}`;
    deptStartIdx = 2;
  }
  const regKey = parts[parts.length - 1];
  const deptKey = parts.slice(deptStartIdx, parts.length - 1).join('_');
  return { progKey, deptKey, regKey };
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

const formatDateWithDay = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${dateStr} (${dayName})`;
  } catch {
    return String(value);
  }
};

const format12Hour = (time24) => {
  if (!time24) return '';
  if (time24.includes('AM') || time24.includes('PM')) return time24;
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const formattedH = String(h).padStart(2, '0');
  return `${formattedH}:${mStr || '00'} ${ampm}`;
};

const getLogoDataUrl = async () => {
  // First try fetching and FileReader
  try {
    const resp = await fetch('/logo.png');
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) return dataUrl;
    }
  } catch (e) {
    console.warn("fetch /logo.png failed:", e);
  }

  // Second try Image + Canvas
  try {
    const dataUrl = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width || 754;
          canvas.height = img.naturalHeight || img.height || 60;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/logo.png";
    });
    if (dataUrl) return dataUrl;
  } catch (e) {
    console.warn("Image canvas /logo.png failed:", e);
  }

  // Third try fallback URL
  try {
    const resp = await fetch('https://i.postimg.cc/QdgcKs7s/ckcet-logo.png');
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) return dataUrl;
    }
  } catch (e) {
    console.warn("fetch fallback logo failed:", e);
  }

  return null;
};

const buildPrintHtml = (deptGroup, selectedBatchKey, logoUrl) => {
  const targetBatchGroups = selectedBatchKey === "ALL"
    ? deptGroup.batchGroups
    : deptGroup.batchGroups.filter(bg => `${bg.batch}___${bg.semester}` === selectedBatchKey);

  const firstItem = targetBatchGroups[0]?.items[0];
  const academicYearStr = firstItem?.academicYear ? `Academic Year: ${firstItem.academicYear}` : "";
  const examStr = firstItem?.examName ? `Exam: ${firstItem.examName}` : "";
  const metaLine = [academicYearStr, examStr].filter(Boolean).join(" &nbsp;|&nbsp; ");

  const tablesHtml = targetBatchGroups.map((bg) => {
    const rowsHtml = bg.items.map((r, i) => {
      const dateStr = formatDateWithDay(r.examDate);
      const timeStr = r.slot
        ? `<span class="slot-badge">${r.slot}</span> ${r.startTime ? `<span>${format12Hour(r.startTime)} - ${format12Hour(r.endTime)}</span>` : ""}`
        : (r.startTime ? `<span>${format12Hour(r.startTime)} - ${format12Hour(r.endTime)}</span>` : "-");

      return `
        <tr>
          <td class="center font-bold">${i + 1}</td>
          <td class="font-medium">${dateStr}</td>
          <td class="center">${timeStr}</td>
          <td class="center font-bold code-cell">${r.code}</td>
          <td class="font-bold">${r.name}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="batch-section">
        <div class="batch-banner">
          Batch: ${formatBatchDisplay(bg.batch)} &nbsp;|&nbsp; Semester: ${bg.semester} ${bg.academicYear ? `(${bg.academicYear})` : ""}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 6%;">#</th>
              <th style="width: 22%;">Date &amp; Day</th>
              <th style="width: 25%;">Session &amp; Time</th>
              <th style="width: 15%;">Course Code</th>
              <th style="width: 32%;">Course Name</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  const logoImgHtml = logoUrl
    ? `<img src="${logoUrl}" class="header-logo" alt="C.K. College of Engineering & Technology" />`
    : `<div style="font-size: 16px; font-weight: bold; color: #120c7a; margin-bottom: 6px;">C.K. COLLEGE OF ENGINEERING &amp; TECHNOLOGY</div>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Timetable - Department of ${deptGroup.dept}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
          }
          .page-container {
            width: 100%;
            max-width: 190mm;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            min-height: 268mm;
            justify-content: space-between;
          }
          .header-container {
            text-align: center;
            border-bottom: 2px solid #120c7a;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .header-logo {
            display: block;
            max-height: 56px;
            max-width: 100%;
            margin: 0 auto 6px auto;
            object-fit: contain;
          }
          .dept-title {
            font-size: 13.5px;
            font-weight: 800;
            color: #120c7a;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            margin: 0 0 2px 0;
          }
          .doc-title {
            font-size: 11.5px;
            font-weight: 700;
            color: #0f172a;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            margin: 0 0 3px 0;
          }
          .meta-title {
            font-size: 9.5px;
            color: #475569;
            font-weight: 600;
            margin: 0;
          }
          .batch-section {
            margin-bottom: 14px;
            page-break-inside: avoid;
          }
          .batch-banner {
            background-color: #f1f5f9 !important;
            border-left: 4px solid #120c7a;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 700;
            color: #120c7a;
            margin-bottom: 6px;
            border-radius: 0 3px 3px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
            vertical-align: middle;
            text-align: left;
          }
          th {
            background-color: #120c7a !important;
            color: #ffffff !important;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            text-align: center;
            letter-spacing: 0.2px;
          }
          tbody tr:nth-child(even) {
            background-color: #f8fafc !important;
          }
          .center {
            text-align: center;
          }
          .font-bold {
            font-weight: 700;
          }
          .font-medium {
            font-weight: 500;
          }
          .code-cell {
            color: #120c7a;
          }
          .slot-badge {
            display: inline-block;
            padding: 1px 5px;
            font-size: 9px;
            font-weight: 800;
            background-color: #e0e7ff !important;
            color: #3730a3 !important;
            border: 1px solid #c7d2fe;
            border-radius: 3px;
            margin-right: 4px;
            text-transform: uppercase;
          }
          .signatures-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 36px;
            padding: 0 16px 8px 16px;
            page-break-inside: avoid;
          }
          .sig-box {
            width: 190px;
            text-align: center;
          }
          .sig-line {
            border-top: 1px dashed #475569;
            padding-top: 5px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #0f172a;
          }
          .sig-sub {
            font-size: 9px;
            color: #64748b;
            margin-top: 2px;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="page-container">
          <div>
            <div class="header-container">
              ${logoImgHtml}
              <div class="dept-title">DEPARTMENT OF ${deptGroup.dept.toUpperCase()}</div>
              <div class="doc-title">INTERNAL ASSESSMENT EXAMINATION TIMETABLE</div>
              ${metaLine ? `<div class="meta-title">${metaLine}</div>` : ""}
            </div>
            ${tablesHtml}
          </div>

          <div class="signatures-container">
            <div class="sig-box">
              <div class="sig-line">Exam Cell Coordinator</div>
              <div class="sig-sub">(Signature &amp; Date)</div>
            </div>
            <div class="sig-box">
              <div class="sig-line">Principal</div>
              <div class="sig-sub">(Signature &amp; Seal)</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export default function PrincipalIAScheduleView({ showApproveButton = true, hideApproveButton = false }) {
  const [scheduleDocs, setScheduleDocs] = useState([]);
  const [allSyllabus, setAllSyllabus] = useState([]);
  const [approvingKey, setApprovingKey] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [logoBase64, setLogoBase64] = useState(null);

  // PDF Preview & Export state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDeptGroup, setPreviewDeptGroup] = useState(null);
  const [previewSelectedBatch, setPreviewSelectedBatch] = useState("ALL");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Preload logo on mount
  useEffect(() => {
    getLogoDataUrl().then((url) => {
      if (url) setLogoBase64(url);
    });
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleOpenPreviewModal = (group, specificBg = null) => {
    setPreviewDeptGroup(group);
    setPreviewSelectedBatch(specificBg ? `${specificBg.batch}___${specificBg.semester}` : "ALL");
    setPreviewModalOpen(true);
  };

  const handleClosePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewDeptGroup(null);
  };

  const downloadDepartmentTimetablePDF = async (deptGroup, selectedBatchKey = "ALL") => {
    if (!deptGroup) return;
    setIsGeneratingPdf(true);
    try {
      let activeLogo = logoBase64;
      if (!activeLogo) {
        activeLogo = await getLogoDataUrl();
        if (activeLogo) setLogoBase64(activeLogo);
      }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
      const marginLeft = 12;
      const marginRight = 12;
      const contentWidth = pageWidth - marginLeft - marginRight; // 186mm
      let yPos = 10;

      // Filter items based on selectedBatchKey
      const targetBatchGroups = selectedBatchKey === "ALL"
        ? deptGroup.batchGroups
        : deptGroup.batchGroups.filter(bg => `${bg.batch}___${bg.semester}` === selectedBatchKey);

      if (!targetBatchGroups.length) {
        showToast("No schedule items found for the selected batch", "error");
        setIsGeneratingPdf(false);
        return;
      }

      // ── 1. Logo ──
      if (activeLogo) {
        try {
          const logoH = 14;
          const logoW = Math.min(130, contentWidth);
          const logoX = marginLeft + (contentWidth - logoW) / 2;
          doc.addImage(activeLogo, "PNG", logoX, yPos, logoW, logoH);
          yPos += logoH + 3;
        } catch (e) {
          console.warn("Logo add image error in PDF:", e);
        }
      }

      // ── 2. Header Box & Titles ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(18, 12, 122); // #120c7a
      doc.text(`DEPARTMENT OF ${deptGroup.dept.toUpperCase()}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 5;

      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text("INTERNAL ASSESSMENT EXAMINATION TIMETABLE", pageWidth / 2, yPos, { align: "center" });
      yPos += 4.5;

      // Academic Year / Exam meta
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const firstItem = targetBatchGroups[0]?.items[0];
      const academicYearStr = firstItem?.academicYear ? `Academic Year: ${firstItem.academicYear}` : "";
      const examStr = firstItem?.examName ? `Exam: ${firstItem.examName}` : "";
      const metaLine = [academicYearStr, examStr].filter(Boolean).join("   |   ");
      if (metaLine) {
        doc.text(metaLine, pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
      }

      // Header divider line
      doc.setDrawColor(18, 12, 122);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
      yPos += 5;

      // ── 3. Tables for each Batch Group ──
      for (let bgIdx = 0; bgIdx < targetBatchGroups.length; bgIdx++) {
        const bg = targetBatchGroups[bgIdx];

        // Check if we need a new page for this batch table
        if (yPos > pageHeight - 65) {
          doc.addPage();
          yPos = 15;
        }

        // Batch subheader banner
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(18, 12, 122);
        const batchTitle = `Batch: ${formatBatchDisplay(bg.batch)}   |   Semester: ${bg.semester}${bg.academicYear ? `   (${bg.academicYear})` : ""}`;
        doc.text(batchTitle, marginLeft, yPos);
        yPos += 3.5;

        // Headers without Exam and QP Setter columns
        const headers = [["#", "Date & Day", "Session & Time", "Course Code", "Course Name"]];
        const tableRows = bg.items.map((r, i) => {
          const dateStr = formatDateWithDay(r.examDate);
          const timeStr = r.slot
            ? `${r.slot}${r.startTime ? `\n(${format12Hour(r.startTime)} - ${format12Hour(r.endTime)})` : ""}`
            : (r.startTime ? `${format12Hour(r.startTime)} - ${format12Hour(r.endTime)}` : "-");
          return [
            String(i + 1),
            dateStr,
            timeStr,
            r.code,
            r.name
          ];
        });

        autoTable(doc, {
          head: headers,
          body: tableRows,
          startY: yPos,
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          styles: {
            fontSize: 8,
            cellPadding: 2.5,
            textColor: [30, 30, 30],
            lineWidth: 0.1,
            lineColor: [203, 213, 225],
            valign: "middle"
          },
          headStyles: {
            fillColor: [18, 12, 122],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
            halign: "center",
            valign: "middle"
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: { halign: "center", cellWidth: 10, fontStyle: "bold" },
            1: { halign: "left", cellWidth: 38 },
            2: { halign: "center", cellWidth: 38 },
            3: { halign: "center", cellWidth: 26, fontStyle: "bold", textColor: [18, 12, 122] },
            4: { halign: "left", cellWidth: "auto", fontStyle: "bold" }
          },
          didDrawPage: () => {
            const pageNum = doc.internal.getNumberOfPages();
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text("C.K. College of Engineering & Technology — IA Examination Timetable", marginLeft, pageHeight - 6);
            doc.text(`Page ${pageNum}`, pageWidth - marginRight, pageHeight - 6, { align: "right" });
          }
        });

        yPos = (doc.lastAutoTable?.finalY || yPos) + 6;
      }

      // ── 4. Signatures (Exam Cell Coordinator & Principal) ──
      const requiredSigSpace = 32;
      if (yPos + requiredSigSpace > pageHeight - 14) {
        doc.addPage();
        yPos = 25;
      } else {
        yPos = Math.max(yPos + 12, pageHeight - 36);
      }

      const sigColWidth = 55;
      const ecCoordX = marginLeft + 10;
      const principalX = pageWidth - marginRight - sigColWidth - 10;

      // Dashed signature lines
      doc.setDrawColor(71, 85, 105);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1], 0);
      doc.line(ecCoordX, yPos, ecCoordX + sigColWidth, yPos);
      doc.line(principalX, yPos, principalX + sigColWidth, yPos);
      doc.setLineDashPattern([], 0); // reset to solid

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Exam Cell Coordinator", ecCoordX + sigColWidth / 2, yPos + 4, { align: "center" });
      doc.text("Principal", principalX + sigColWidth / 2, yPos + 4, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("(Signature & Date)", ecCoordX + sigColWidth / 2, yPos + 7.5, { align: "center" });
      doc.text("(Signature & Seal)", principalX + sigColWidth / 2, yPos + 7.5, { align: "center" });

      const safeDeptName = deptGroup.dept.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Timetable_${safeDeptName}.pdf`);
      showToast("Timetable PDF downloaded successfully!", "success");
    } catch (err) {
      console.error("Error generating timetable PDF:", err);
      showToast("Failed to generate PDF. Please try again.", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintModal = async () => {
    if (!previewDeptGroup) return;
    let activeLogo = logoBase64;
    if (!activeLogo) {
      activeLogo = await getLogoDataUrl();
      if (activeLogo) setLogoBase64(activeLogo);
    }
    const htmlContent = buildPrintHtml(previewDeptGroup, previewSelectedBatch, activeLogo);
    const win = window.open("", "_blank");
    if (!win) {
      showToast("Please allow popups to print the timetable", "error");
      return;
    }
    win.document.open();
    win.document.write(htmlContent);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch (e) {
        console.warn("Print error:", e);
      }
    }, 400);
  };

  // 1. Read all saved QP Setter Assignments / IA Schedules (all batches)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      setScheduleDocs(docs);
    }, (err) => {
      console.warn("qp_setter_assignments listener error:", err);
      setScheduleDocs([]);
    });
    return () => unsub();
  }, []);

  // 2. Read all syllabus docs to resolve department per course code
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const parsed = parseSyllabusDocId(d.id);
        docs.push({ id: d.id, ...parsed, data: d.data() });
      });
      setAllSyllabus(docs);
    }, (err) => {
      console.warn("syllabus_data listener error:", err);
      setAllSyllabus([]);
    });
    return () => unsub();
  }, []);

  const normCodeKey = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && v !== null) {
      const vals = Object.values(v);
      if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
      return vals;
    }
    return [];
  };

  // Global code → departments map (across all programmes/semesters)
  const codeDeptMap = useMemo(() => {
    const map = {};
    allSyllabus.forEach(sDoc => {
      const subsBySem = sDoc.data?.semesters || {};
      Object.entries(subsBySem).forEach(([semKey, rawSubs]) => {
        const subs = toArray(rawSubs);
        subs.forEach(sub => {
          if (!sub || sub.isNonOBE === true || sub.isActive === false) return;
          const code = String(sub.code || sub.subjectCode || sub.courseCode || "").trim();
          if (!code) return;
          const normKey = normCodeKey(code);
          if (!map[normKey]) map[normKey] = [];
          const key = `${sDoc.progKey}|||${sDoc.deptKey}`;
          if (!map[normKey].some(d => d.key === key)) {
            map[normKey].push({ progKey: sDoc.progKey, dept: sDoc.deptKey, sem: String(semKey).trim(), key });
          }
        });
      });
    });
    return map;
  }, [allSyllabus]);

  const [courseBankNameMap, setCourseBankNameMap] = useState({});
  const [batchRegulations, setBatchRegulations] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "batch_regulations"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setBatchRegulations(data);
    }, () => { });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      const nameMap = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const rawCode = String(data.code || data.subjectCode || data.courseCode || "").trim();
        const name = String(data.name || data.courseName || data.subjectName || "").trim();
        if (rawCode && name) {
          const normName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          nameMap[normName] = rawCode;
          if (data.department) {
            const cleanD = String(data.department).replace(/[.#$[\]/ ]/g, '_');
            nameMap[`${cleanD}_${normName}`] = rawCode;
          }
        }
      });
      setCourseBankNameMap(nameMap);
    }, () => { });
    return () => unsub();
  }, []);

  const resolveBatchRegulation = (batch, progKey) => {
    if (!batch) return "";
    const cleanB = String(batch).trim();

    if (progKey && batchRegulations?.[progKey]?.[cleanB]) {
      return batchRegulations[progKey][cleanB];
    }
    if (progKey) {
      const cleanP = String(progKey).replace(/[.#$[\]/ ]/g, '_');
      if (batchRegulations?.[cleanP]?.[cleanB]) {
        return batchRegulations[cleanP][cleanB];
      }
    }

    for (const pKey of Object.keys(batchRegulations || {})) {
      if (batchRegulations[pKey]?.[cleanB]) {
        return batchRegulations[pKey][cleanB];
      }
    }

    const match = allSyllabus.find(s => s.data?.batch === cleanB || s.id?.includes(cleanB));
    if (match && match.regKey) {
      return match.regKey.replace(/_/g, ' ').replace(/([A-Z]+)(R\d+)/i, '$1 - $2').trim();
    }

    return "";
  };

  const formatExamNameWithRegulation = (rawExamName, batch, progKey) => {
    if (!rawExamName) return "-";

    const resolvedReg = resolveBatchRegulation(batch, progKey);
    if (!resolvedReg) return rawExamName;

    let cleanReg = resolvedReg.trim();
    const rMatch = cleanReg.match(/R\d{4}/i);
    if (rMatch) {
      const rCode = rMatch[0].toUpperCase();
      cleanReg = `AU - ${rCode}`;
    }

    const regParenRegex = /\((?:AU\s*-\s*)?R\d{4}\)/i;
    if (regParenRegex.test(rawExamName)) {
      return rawExamName.replace(regParenRegex, `(${cleanReg})`);
    }

    return `${rawExamName} (${cleanReg})`;
  };

  const getCanonicalCode = (code, name, deptKey) => {
    if (!name) return code || "";
    const normName = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (deptKey) {
      const cleanD = String(deptKey).replace(/[.#$[\]/ ]/g, '_');
      if (courseBankNameMap[`${cleanD}_${normName}`]) {
        return courseBankNameMap[`${cleanD}_${normName}`];
      }
    }
    if (courseBankNameMap[normName]) {
      return courseBankNameMap[normName];
    }
    return code || "";
  };

  // Flatten only subjects that have an assigned exam date, grouped by department
  const rows = useMemo(() => {
    const out = [];
    scheduleDocs.forEach(sDoc => {
      const assignments = sDoc.assignments || {};
      Object.entries(assignments).forEach(([assignKey, as]) => {
        if (!as?.examDate) return; // only subjects with assigned dates
        const rawCode = String(as.code || assignKey || "").trim();
        const normKey = normCodeKey(rawCode);

        // Priority 1: Use explicit departments saved on the assignment
        const explicitDepts = Array.isArray(as.departments) && as.departments.length > 0 ? as.departments : [];

        // Priority 2: Fallback to mapped departments matching current semester
        let depts = explicitDepts;
        if (depts.length === 0) {
          const allMapped = codeDeptMap[normKey] || [];
          const semMapped = allMapped.filter(d => !d.sem || String(d.sem) === String(sDoc.semester));
          depts = semMapped.length > 0 ? semMapped : allMapped;
        }

        const displayCode = getCanonicalCode(as.code || assignKey, as.name, depts[0]?.dept);

        const sTime = as.startTime || "";
        const eTime = as.endTime || "";
        const slot = as.slot || as.session || (sTime ? (parseInt(sTime.split(':')[0], 10) < 12 ? 'FN' : 'AN') : "");

        const formattedExam = formatExamNameWithRegulation(
          sDoc.examName || sDoc.examId || "",
          sDoc.batch,
          depts[0]?.progKey
        );

        const row = {
          docId: sDoc.id,
          rawKey: assignKey,
          rawCode: as.code || assignKey || "",
          code: displayCode || as.code || assignKey || "",
          name: as.name || "",
          examDate: as.examDate || "",
          startTime: sTime,
          endTime: eTime,
          slot,
          timeSlot: as.timeSlot || "",
          setterName: as.setterName || "-",
          numSets: as.numSets || 1,
          fromDate: as.fromDate || "",
          toDate: as.toDate || "",
          batch: sDoc.batch || "",
          academicYear: sDoc.academicYear || "",
          semester: sDoc.semester || "",
          examName: formattedExam || sDoc.examName || "-",
          approved: as.approved === true,
          departments: depts.length ? depts : [{ progKey: "", dept: "_unmapped", key: "_unmapped" }]
        };
        out.push(row);
      });
    });

    const grouped = {};
    out.forEach(r => {
      r.departments.forEach(d => {
        const label = d.dept === "_unmapped"
          ? "Unknown Department"
          : formatDepartmentDisplay(d.dept, d.progKey);
        if (!grouped[label]) grouped[label] = [];
        grouped[label].push({ ...r, deptLabel: label });
      });
    });

    return Object.entries(grouped)
      .map(([dept, items]) => {
        const sortedItems = items.sort((a, b) =>
          String(a.examDate).localeCompare(String(b.examDate)) || a.code.localeCompare(b.code)
        );

        const batchMap = {};
        sortedItems.forEach(item => {
          const bKey = `${item.batch || "Unknown"}___${item.semester || ""}`;
          if (!batchMap[bKey]) {
            batchMap[bKey] = {
              batch: item.batch,
              semester: item.semester,
              academicYear: item.academicYear,
              items: []
            };
          }
          batchMap[bKey].items.push(item);
        });

        const batchGroups = Object.values(batchMap).sort((a, b) =>
          String(b.batch).localeCompare(String(a.batch)) || String(a.semester).localeCompare(String(b.semester))
        );

        return {
          dept,
          items: sortedItems,
          batchGroups
        };
      })
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [scheduleDocs, codeDeptMap]);

  const [selectedBatchFilter, setSelectedBatchFilter] = useState("ALL");

  const availableBatches = useMemo(() => {
    const set = new Set();
    rows.forEach(g => {
      g.items.forEach(i => { if (i.batch) set.add(i.batch); });
    });
    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedBatchFilter === "ALL") return rows;
    return rows.map(g => {
      const filteredItems = g.items.filter(i => String(i.batch) === String(selectedBatchFilter));
      if (!filteredItems.length) return null;

      const batchMap = {};
      filteredItems.forEach(item => {
        const bKey = `${item.batch || "Unknown"}___${item.semester || ""}`;
        if (!batchMap[bKey]) {
          batchMap[bKey] = {
            batch: item.batch,
            semester: item.semester,
            academicYear: item.academicYear,
            items: []
          };
        }
        batchMap[bKey].items.push(item);
      });

      const batchGroups = Object.values(batchMap).sort((a, b) =>
        String(b.batch).localeCompare(String(a.batch)) || String(a.semester).localeCompare(String(b.semester))
      );

      return {
        ...g,
        items: filteredItems,
        batchGroups
      };
    }).filter(Boolean);
  }, [rows, selectedBatchFilter]);

  const totalScheduled = useMemo(() => rows.reduce((sum, g) => sum + g.items.length, 0), [rows]);
  const approvedCount = useMemo(() => {
    return rows.reduce((sum, g) => sum + g.items.filter(i => i.approved).length, 0);
  }, [rows]);

  const handleApproveDept = async (items) => {
    if (!items || items.length === 0) return;
    const uid = auth.currentUser?.uid || "";
    const approvedAt = new Date().toISOString();

    const itemsByDoc = {};
    items.forEach(it => {
      if (!itemsByDoc[it.docId]) itemsByDoc[it.docId] = [];
      itemsByDoc[it.docId].push(it);
    });

    const key = Object.keys(itemsByDoc).sort().join("|||");
    setApprovingKey(key);

    try {
      await Promise.all(Object.entries(itemsByDoc).map(([docId, docItems]) => {
        const sDoc = scheduleDocs.find(d => d.id === docId);
        const existingAssignments = sDoc?.assignments || {};
        const updates = {};

        docItems.forEach(it => {
          const targetKeys = new Set();
          if (it.rawKey) targetKeys.add(it.rawKey);
          if (it.rawCode) targetKeys.add(it.rawCode);
          if (it.code) targetKeys.add(it.code);

          const itNormCode = normCodeKey(it.code || it.rawCode || it.rawKey);
          Object.keys(existingAssignments).forEach(existingKey => {
            if (normCodeKey(existingKey) === itNormCode) {
              targetKeys.add(existingKey);
            }
          });

          targetKeys.forEach(k => {
            updates[`assignments.${k}.approved`] = true;
            updates[`assignments.${k}.principalApprovedBy`] = uid;
            updates[`assignments.${k}.principalApprovedByName`] = "Principal";
            updates[`assignments.${k}.principalApprovedAt`] = approvedAt;
          });
        });

        updates["status"] = "Approved";
        updates["principalApproved"] = true;
        updates["updatedBy"] = "Principal";
        updates["updatedAt"] = approvedAt;

        return updateDoc(doc(db, "qp_setter_assignments", docId), updates);
      }));

      showToast("IA Schedule approved successfully!", "success");
    } catch (err) {
      console.error("Error approving IA schedule:", err);
      showToast("Failed to approve IA schedule", "error");
    } finally {
      setApprovingKey("");
    }
  };

  return (
    <div className="w-full">
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{totalScheduled}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Subjects Scheduled</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{approvedCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Approved Subjects</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-700 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{totalScheduled - approvedCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Pending Approval</p>
        </div>
      </div>

      {/* Batch Filter Bar */}
      {availableBatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5 p-2 bg-zinc-100/80 rounded-xl border border-zinc-200">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-2">Filter Batch:</span>
          <button
            onClick={() => setSelectedBatchFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedBatchFilter === "ALL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-zinc-600 hover:bg-zinc-200/70 border border-zinc-200"
              }`}
          >
            All Batches ({totalScheduled})
          </button>
          {availableBatches.map(b => {
            const count = rows.reduce((acc, g) => acc + g.items.filter(i => String(i.batch) === String(b)).length, 0);
            return (
              <button
                key={b}
                onClick={() => setSelectedBatchFilter(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedBatchFilter === b
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-zinc-600 hover:bg-zinc-200/70 border border-zinc-200"
                  }`}
              >
                {formatBatchDisplay(b)} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Main Scheduled Items Grouped by Department & Batch */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-zinc-400">
          <Calendar size={36} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold">No IA exam schedules found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredRows.map(group => {
            const allApproved = group.items.every(i => i.approved);
            const approvingKeyStr = [...new Set(group.items.map(i => i.docId))].sort().join("|||");
            return (
              <div key={group.dept} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                    <span className="font-bold text-zinc-900 text-sm truncate">{group.dept}</span>
                    <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 rounded-full px-2.5 py-0.5 shrink-0">
                      {group.items.length} {group.items.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {allApproved ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={13} /> Approved
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-700">
                          Pending
                        </span>
                        {showApproveButton && !hideApproveButton && (
                          <button
                            onClick={() => handleApproveDept(group.items)}
                            disabled={!!approvingKey}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[12px] font-bold shadow-sm hover:shadow-md hover:opacity-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {approvingKey === approvingKeyStr ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                            {approvingKey === approvingKeyStr ? "Approving..." : "Approve Department"}
                          </button>
                        )}
                      </>
                    )}

                    {/* Export PDF Button (Next to Approved / Pending status) */}
                    <button
                      type="button"
                      onClick={() => handleOpenPreviewModal(group)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[12px] font-bold shadow-sm transition-all cursor-pointer"
                      title="Preview and Export Department Timetable as PDF"
                    >
                      <FileDown size={14} />
                      <span>Export PDF</span>
                    </button>
                  </div>
                </div>

                {/* Batch-wise sub-sections inside Department Card */}
                <div className="divide-y divide-zinc-200">
                  {group.batchGroups.map((bg, bgIdx) => (
                    <div key={`${bg.batch}_${bg.semester}_${bgIdx}`} className="p-4 sm:p-5">
                      {/* Sub-Header Banner for Batch & Semester */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {formatBatchDisplay(bg.batch)}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-700">
                            Semester {bg.semester}
                          </span>
                          {bg.academicYear && (
                            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
                              ({bg.academicYear})
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-zinc-500">
                          {bg.items.length} {bg.items.length === 1 ? 'subject' : 'subjects'}
                        </span>
                      </div>

                      {/* Batch Table */}
                      <div className="overflow-x-auto rounded-lg border border-zinc-200 shadow-sm">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-zinc-50/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                              <th className="px-4 py-2.5">Course Code</th>
                              <th className="px-4 py-2.5">Course Name</th>
                              <th className="px-4 py-2.5">Exam</th>
                              <th className="px-4 py-2.5">Exam Date</th>
                              <th className="px-4 py-2.5">QP Setter</th>
                              <th className="px-4 py-2.5">Submission Window</th>
                              <th className="px-4 py-2.5 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 bg-white">
                            {bg.items.map((r, idx) => {
                              const approved = r.approved;
                              return (
                                <tr key={`${r.docId}_${r.code}_${idx}`} className="hover:bg-blue-50/40 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <span className="text-sm font-bold text-blue-700">{r.code}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-800 max-w-[240px] font-medium">{r.name}</td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-600">{r.examName || "-"}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="space-y-0.5">
                                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-800">
                                        <Clock size={13} className="text-emerald-600 shrink-0" />
                                        {formatDate(r.examDate)}
                                      </span>
                                      {r.slot ? (
                                        <div className="flex items-center gap-1">
                                          <span className={`inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded uppercase border ${r.slot === "FN" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-amber-100 text-amber-800 border-amber-200"
                                            }`}>
                                            {r.slot}
                                          </span>
                                          {r.startTime && (
                                            <span className="text-[10px] font-bold text-zinc-600">
                                              {format12Hour(r.startTime)}{r.endTime ? ` - ${format12Hour(r.endTime)}` : ''}
                                            </span>
                                          )}
                                        </div>
                                      ) : r.startTime ? (
                                        <div className="text-[10px] font-bold text-zinc-600">
                                          {format12Hour(r.startTime)}{r.endTime ? ` - ${format12Hour(r.endTime)}` : ''}
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-700">{r.setterName}</td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-600">
                                    {r.fromDate ? `${formatDate(r.fromDate)} → ${formatDate(r.toDate)}` : "-"}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {approved ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1">
                                        <CheckCircle2 size={12} /> Approved
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">
                                        <Clock size={12} /> Pending
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timetable PDF Preview & Export Modal */}
      {previewModalOpen && previewDeptGroup && (() => {
        const targetBatchGroups = previewSelectedBatch === "ALL"
          ? previewDeptGroup.batchGroups
          : previewDeptGroup.batchGroups.filter(bg => `${bg.batch}___${bg.semester}` === previewSelectedBatch);

        const totalItemsInPreview = targetBatchGroups.reduce((acc, bg) => acc + bg.items.length, 0);
        const firstItem = targetBatchGroups[0]?.items[0];

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-start p-2 sm:p-4 md:p-6 overflow-y-auto">
            <div className="relative w-full max-w-5xl bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-900 border-b border-slate-800 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <FileDown size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-100">Timetable PDF Preview & Export</h3>
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {previewDeptGroup.dept}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Preview the A4 formatted institutional timetable with college logo and signature lines
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors shadow-sm cursor-pointer"
                    title="Print directly or save via browser print dialog"
                  >
                    <Printer size={14} />
                    <span>Print / Save</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadDepartmentTimetablePDF(previewDeptGroup, previewSelectedBatch)}
                    disabled={isGeneratingPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    <span>{isGeneratingPdf ? "Generating PDF..." : "Download PDF"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClosePreviewModal}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
                    title="Close Preview"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Batch Switcher Tabs (if department has multiple batches) */}
              {previewDeptGroup.batchGroups.length > 1 && (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950 border-b border-slate-800/80 overflow-x-auto">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Include in PDF:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewSelectedBatch("ALL")}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${previewSelectedBatch === "ALL"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                      }`}
                  >
                    All Batches ({previewDeptGroup.items.length} subjects)
                  </button>
                  {previewDeptGroup.batchGroups.map(bg => {
                    const key = `${bg.batch}___${bg.semester}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPreviewSelectedBatch(key)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${previewSelectedBatch === key
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                          }`}
                      >
                        {formatBatchDisplay(bg.batch)} (Sem {bg.semester}) ({bg.items.length})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* A4 Preview Container */}
              <div className="bg-slate-950/70 p-4 sm:p-8 flex justify-center overflow-x-auto max-h-[72vh] overflow-y-auto">
                <div
                  id="timetable-a4-preview-sheet"
                  className="bg-white text-slate-900 w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-2xl rounded-sm border border-slate-200 font-sans flex flex-col justify-between"
                  style={{ boxSizing: "border-box" }}
                >
                  <div>
                    {/* Header Section with College Logo */}
                    <div className="header-title text-center pb-3 border-b-2 border-[#120c7a] mb-4">
                      {logoBase64 ? (
                        <img
                          src={logoBase64}
                          alt="C.K. College of Engineering & Technology"
                          className="header-img max-h-14 w-auto mx-auto object-contain mb-2"
                        />
                      ) : (
                        <img
                          src="/logo.png"
                          alt="C.K. College of Engineering & Technology"
                          className="header-img max-h-14 w-auto mx-auto object-contain mb-2"
                          onError={(e) => {
                            e.currentTarget.src = "https://i.postimg.cc/QdgcKs7s/ckcet-logo.png";
                          }}
                        />
                      )}
                      <div className="dept-name text-center text-sm sm:text-base font-black text-[#120c7a] tracking-wide uppercase">
                        DEPARTMENT OF {previewDeptGroup.dept}
                      </div>
                      <div className="sub-title text-center text-xs sm:text-sm font-bold text-slate-800 tracking-wider uppercase mt-0.5">
                        INTERNAL ASSESSMENT EXAMINATION TIMETABLE
                      </div>
                      <div className="meta-info text-center text-xs text-slate-600 mt-1">
                        {[
                          firstItem?.academicYear ? `Academic Year: ${firstItem.academicYear}` : "",
                          firstItem?.examName ? `Exam: ${firstItem.examName}` : ""
                        ].filter(Boolean).join("   |   ")}
                      </div>
                    </div>

                    {/* Batch Tables */}
                    {targetBatchGroups.map((bg, bIdx) => (
                      <div key={`modal_bg_${bg.batch}_${bg.semester}_${bIdx}`} className="mb-6">
                        <div className="batch-banner bg-slate-100 border-l-4 border-[#120c7a] px-3 py-1 text-xs font-bold text-[#120c7a] mb-2 rounded-r">
                          Batch: {formatBatchDisplay(bg.batch)} &nbsp;|&nbsp; Semester: {bg.semester} {bg.academicYear ? `(${bg.academicYear})` : ""}
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                            <thead>
                              <tr className="bg-[#120c7a] text-white">
                                <th className="border border-slate-300 px-3 py-2 text-center w-10 font-bold">#</th>
                                <th className="border border-slate-300 px-4 py-2 font-bold w-44">Date & Day</th>
                                <th className="border border-slate-300 px-4 py-2 font-bold text-center w-48">Session & Time</th>
                                <th className="border border-slate-300 px-3 py-2 font-bold text-center w-28">Course Code</th>
                                <th className="border border-slate-300 px-4 py-2 font-bold">Course Name</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {bg.items.map((r, rIdx) => {
                                const isEven = rIdx % 2 === 0;
                                return (
                                  <tr key={`modal_row_${r.code}_${rIdx}`} className={isEven ? "bg-white" : "bg-slate-50/70"}>
                                    <td className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-500">
                                      {rIdx + 1}
                                    </td>
                                    <td className="border border-slate-300 px-4 py-2 font-medium text-slate-800">
                                      {formatDateWithDay(r.examDate)}
                                    </td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">
                                      {r.slot && (
                                        <span className="slot-badge inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 mr-1.5">
                                          {r.slot}
                                        </span>
                                      )}
                                      {r.startTime && (
                                        <span className="text-[11px] font-semibold text-slate-700">
                                          {format12Hour(r.startTime)}{r.endTime ? ` - ${format12Hour(r.endTime)}` : ""}
                                        </span>
                                      )}
                                      {!r.slot && !r.startTime && <span className="text-slate-400">-</span>}
                                    </td>
                                    <td className="border border-slate-300 px-3 py-2 text-center font-bold text-[#120c7a]">
                                      {r.code}
                                    </td>
                                    <td className="border border-slate-300 px-4 py-2 font-semibold text-slate-900">
                                      {r.name}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Signatures Space at Bottom */}
                  <div className="sig-row mt-12 pt-8 border-t border-slate-200 flex items-end justify-between px-6 pb-2">
                    <div className="sig-box w-48 text-center">
                      <div className="sig-line border-t border-dashed border-slate-600 pt-1.5 text-xs font-bold uppercase text-slate-900">
                        Exam Cell Coordinator
                      </div>
                      <div className="sig-sub text-[10px] text-slate-500 mt-0.5">
                        (Signature & Date)
                      </div>
                    </div>

                    <div className="sig-box w-48 text-center">
                      <div className="sig-line border-t border-dashed border-slate-600 pt-1.5 text-xs font-bold uppercase text-slate-900">
                        Principal
                      </div>
                      <div className="sig-sub text-[10px] text-slate-500 mt-0.5">
                        (Signature & Seal)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-t border-slate-800">
                <span className="text-xs text-slate-400">
                  Ready to export <strong className="text-slate-200">{totalItemsInPreview} subjects</strong> for {previewDeptGroup.dept}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClosePreviewModal}
                    className="px-4 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDepartmentTimetablePDF(previewDeptGroup, previewSelectedBatch)}
                    disabled={isGeneratingPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    <span>{isGeneratingPdf ? "Generating..." : "Download PDF"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
