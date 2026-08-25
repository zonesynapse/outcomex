import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, getDocs, addDoc, onSnapshot, setDoc, query, where } from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";
import {
  Eye, Loader2, ClipboardList, User, X, FileText, CheckCircle2, Edit2,
  Clock, BookOpen, TrendingUp, Search, Filter, School, ChevronRight,
  Sparkles, BarChart3, ArrowUpRight, Zap, Bell, AlertCircle, Calendar,
  Users, GraduationCap, CalendarCheck2, AlertTriangle, RefreshCw, Award, Check,
  Download, FileSpreadsheet
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { fetchAllCourseNamesMap, getCourseName } from "../utils/courseUtils";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { useRegulations } from "../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey, formatDepartmentDisplay, formatBatchDisplay, getAttendanceRecords, parseSubjectField, formatQPSetDisplay } from "../lib/utils";
import { typesetMath } from "../utils/mathJaxUtils";

function bsKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/]/g, '_');
}

const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const subjectStatPct = (st) => {
  const t = st?.total || 0;
  const od = st?.od || 0;
  const a = st?.attended || 0;
  const active = t - od;
  return active > 0 ? ((a / active) * 100).toFixed(1) : "0.0";
};

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-500" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", gradient: "from-emerald-500" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200", gradient: "from-violet-500" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200", gradient: "from-rose-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200", gradient: "from-indigo-500" },
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function HODDashboard() {
  const navigate = useNavigate();
  const { getRegulationForBatch } = useRegulations();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [hodName, setHodName] = useState("");
  const [hodLoading, setHodLoading] = useState(true);

  const [usersMap, setUsersMap] = useState({});
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasks, setTasks] = useState([]);

  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [currentHodSignature, setCurrentHodSignature] = useState('');
  const [facultySignatureForQP, setFacultySignatureForQP] = useState('');
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState('');
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [fullQPForModal, setFullQPForModal] = useState(null);
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [hodDepartment, setHodDepartment] = useState("");
  const [hodProgramme, setHodProgramme] = useState("");
  const [deptMetadata, setDeptMetadata] = useState({});
  const [approvedStudentsList, setApprovedStudentsList] = useState([]);
  const [allStudentNames, setAllStudentNames] = useState({});
  const [academicEvents, setAcademicEvents] = useState({});
  const [attendanceOverview, setAttendanceOverview] = useState({});
  const [attendanceOverviewLoading, setAttendanceOverviewLoading] = useState(false);
  const [subjectNamesMap, setSubjectNamesMap] = useState({});
  const [timetableAllocation, setTimetableAllocation] = useState({});
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [sectionAllotmentPopup, setSectionAllotmentPopup] = useState({ open: false });
  const [sectionConfigs, setSectionConfigs] = useState({});
  const [sectionAssignments, setSectionAssignments] = useState({});
  const [savingSection, setSavingSection] = useState(false);
  const [deptMetadataLoaded, setDeptMetadataLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [batchStrengthModal, setBatchStrengthModal] = useState({ open: false });
  const [sectionStudents, setSectionStudents] = useState([]);

  const [pendingActivities, setPendingActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [reviewActivity, setReviewActivity] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  // HOD Batch Attendance Report state
  const [reportBatch, setReportBatch] = useState("");
  const [reportSection, setReportSection] = useState("");
  const [reportFromDate, setReportFromDate] = useState(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return formatDateKey(startOfMonth);
  });
  const [reportToDate, setReportToDate] = useState(() => formatDateKey(new Date()));
  const [generatedReport, setGeneratedReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showReportPdfPreview, setShowReportPdfPreview] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState("");
  const [reportPdfDoc, setReportPdfDoc] = useState(null);
  const [reportPdfFilename, setReportPdfFilename] = useState("");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [reportAcademicYear, setReportAcademicYear] = useState("");
  const [reportSemester, setReportSemester] = useState("");
  const [selectedReportSubjects, setSelectedReportSubjects] = useState([]);
  const [pendingAttendanceModal, setPendingAttendanceModal] = useState({ open: false, items: [] });

  const averageAttendance = useMemo(() => {
    if (!generatedReport || generatedReport.students.length === 0) return "0.0";
    const total = generatedReport.students.reduce((sum, s) => sum + parseFloat(s.percentage || 0), 0);
    return (total / generatedReport.students.length).toFixed(1);
  }, [generatedReport]);

  const countBelow75 = useMemo(() => {
    if (!generatedReport) return 0;
    return generatedReport.students.filter(s => parseFloat(s.percentage || 0) < 75).length;
  }, [generatedReport]);

  const filteredReportStudents = useMemo(() => {
    if (!generatedReport) return [];
    if (!reportSearchQuery.trim()) return generatedReport.students;
    const q = reportSearchQuery.toLowerCase();
    return generatedReport.students.filter(s => 
      s.name.toLowerCase().includes(q) || 
      s.reg.toLowerCase().includes(q)
    );
  }, [generatedReport, reportSearchQuery]);

  const handleGenerateBatchReport = async () => {
    if (!reportBatch) {
      alert("Please select a batch.");
      return;
    }
    if (reportDateRange.min && reportDateRange.max && (reportFromDate < reportDateRange.min || reportToDate > reportDateRange.max)) {
      alert(`Please select dates between ${reportDateRange.min} and ${reportDateRange.max} (as per the configured academic semester).`);
      return;
    }
    setGeneratingReport(true);
    try {
      // Find students in batch/section
      const targetStudents = sectionStudents.filter(s => {
        if (s.batch !== reportBatch) return false;
        if (reportSection) {
          const parts = s.docId.split('_');
          const secPart = parts.find(p => p.startsWith('Sec-'));
          return secPart === reportSection;
        }
        return true;
      });

      if (targetStudents.length === 0) {
        alert("No students found in this batch/section.");
        setGeneratedReport(null);
        setGeneratingReport(false);
        return;
      }

      // Collect attendance records from already-loaded resolvedAttendanceOverview
      // (same data source the Attendance Status section uses — avoids dept-matching issues)
      const batchItems = (resolvedAttendanceOverview[reportBatch] || []).filter(item => {
        if (reportAcademicYear && item.ay !== reportAcademicYear) return false;
        if (reportSemester && item.sem !== reportSemester) return false;
        if (reportSection && item.section !== reportSection) return false;
        if (selectedReportSubjects.length > 0 && !selectedReportSubjects.includes(item.subjectCode)) return false;
        return true;
      });

      // ─── CHECK PENDING ATTENDANCE IN DATE RANGE ───
      const pendingList = [];
      const isSubjectSpecific = selectedReportSubjects.length > 0;
      const dayScheduleMap = timetableAllocation[reportBatch] || {};

      // Loop through all dates in the requested range [reportFromDate -> reportToDate]
      const curDate = new Date(reportFromDate + 'T00:00:00');
      const endDateObj = new Date(reportToDate + 'T00:00:00');

      while (curDate <= endDateObj) {
        const dStr = formatDateKey(curDate);
        const dayName = curDate.toLocaleDateString('en-US', { weekday: 'long' });
        const isSunday = curDate.getDay() === 0;
        const isHoliday = academicEvents[dStr]?.some(e => e.type === 'Holiday');

        if (!isSunday && !isHoliday) {
          const rawDaySchedule = dayScheduleMap[dayName];
          if (rawDaySchedule) {
            // Expand continuous period spans (e.g. "P1: EE3403|2") into individual periods
            const expandedDaySchedule = {};
            Object.entries(rawDaySchedule).forEach(([pStart, rawEntries]) => {
              const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
              entries.forEach(entry => {
                const parts = String(entry || '').split('|');
                const code = parts[0].trim();
                const span = parseInt(parts[1], 10) || 1;
                if (!code) return;
                for (let p = parseInt(pStart), endP = p + span; p < endP; p++) {
                  const pStr = String(p);
                  if (!expandedDaySchedule[pStr]) expandedDaySchedule[pStr] = [];
                  if (!expandedDaySchedule[pStr].includes(code)) expandedDaySchedule[pStr].push(code);
                }
              });
            });

            // Check each scheduled period for this day
            Object.entries(expandedDaySchedule).forEach(([periodNum, codes]) => {
              codes.forEach(code => {
                // If specific subjects are selected, only check for those subjects
                if (isSubjectSpecific && !selectedReportSubjects.map(s => s.toLowerCase()).includes(code.toLowerCase())) {
                  return;
                }

                // Find matching subject assignment item
                const targetItem = batchItems.find(i => i.subjectCode.toLowerCase() === code.toLowerCase());
                const recordKey = `${dStr}_P${periodNum}`;

                let hasRecord = false;

                if (targetItem && targetItem.attRecords?.[recordKey]) {
                  hasRecord = true;
                } else {
                  // Check if substitute / alternate subject marked attendance for this period
                  const substituteRecord = batchItems.some(i => i.attRecords?.[recordKey]);
                  if (substituteRecord) {
                    hasRecord = true;
                  }
                }

                if (!hasRecord) {
                  const subjObj = targetItem || batchItems.find(i => i.subjectCode.toLowerCase() === code.toLowerCase());
                  const subjectName = subjObj?.subjectName || subjectNamesMap[code] || code;
                  const facultyName = subjObj?.facultyName || "Not Assigned";
                  pendingList.push({
                    date: dStr,
                    day: dayName,
                    period: periodNum,
                    subjectCode: code,
                    subjectName: subjectName,
                    facultyName: facultyName
                  });
                }
              });
            });
          }
        }
        curDate.setDate(curDate.getDate() + 1);
      }

      if (pendingList.length > 0) {
        setGeneratingReport(false);
        setPendingAttendanceModal({ open: true, items: pendingList });
        return;
      }

      const recordsMap = {};
      const periodInfoMap = {};
      const matchedPeriodsSet = new Set();

      batchItems.forEach(item => {
        Object.entries(item.attRecords || {}).forEach(([rk, recordVal]) => {
          const datePart = rk.includes('_P') ? rk.slice(0, rk.lastIndexOf('_P')) : rk;
          if (datePart >= reportFromDate && datePart <= reportToDate) {
            matchedPeriodsSet.add(rk);
            if (!recordsMap[rk]) recordsMap[rk] = [];
            recordsMap[rk].push({
              ...recordVal,
              subjectCode: item.subjectCode
            });
            if (!periodInfoMap[rk]) periodInfoMap[rk] = { subjectCodes: new Set(), eventNames: new Set() };
            if (recordVal?.isEvent) {
              periodInfoMap[rk].eventNames.add(recordVal.eventName || 'Event');
            } else {
              periodInfoMap[rk].subjectCodes.add(item.subjectCode);
            }
          }
        });
      });

      // Label each period with the subject code of whoever marked attendance,
      // or the event name when the record is an event period.
      const periodInfo = {};
      Object.entries(periodInfoMap).forEach(([rk, info]) => {
        const label = info.eventNames.size > 0
          ? [...info.eventNames][0]
          : [...info.subjectCodes].filter(Boolean).join(', ');
        if (label) periodInfo[rk] = label;
      });

      const sortedPeriods = [...matchedPeriodsSet].sort((a, b) => {
        const [dateA, periodA] = a.split('_P');
        const [dateB, periodB] = b.split('_P');
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (parseInt(periodA) || 0) - (parseInt(periodB) || 0);
      });

      // Group period keys by date for the date-wise map
      const groupedPeriods = [];
      sortedPeriods.forEach(rk => {
        const [date] = rk.split('_P');
        const last = groupedPeriods[groupedPeriods.length - 1];
        if (last && last.date === date) {
          last.periods.push(rk);
        } else {
          groupedPeriods.push({ date, periods: [rk] });
        }
      });

      const studentStats = targetStudents.map(student => {
        let attended = 0;
        let absent = 0;
        let odCount = 0;
        let totalClasses = 0;
        const dailyRecords = {};
        const subjectStats = {};

        sortedPeriods.forEach(rk => {
          const matchedRecords = recordsMap[rk] || [];
          let foundStatus = undefined;
          let recordSubject = "";
          for (const rec of matchedRecords) {
            const stuVal = rec?.students?.[student.reg];
            if (stuVal !== undefined) {
              const rawH = stuVal;
              foundStatus = typeof rawH === 'object' && rawH !== null 
                ? (rawH.status || (rawH.hours > 0 ? 'P' : 'A')) 
                : (rawH === 'OD' || rawH === -1 ? 'OD' : (rawH > 0 ? 'P' : 'A'));
              recordSubject = rec.subjectCode || "";
              break;
            }
          }

          if (foundStatus !== undefined) {
            dailyRecords[rk] = foundStatus;

            if (recordSubject) {
              if (!subjectStats[recordSubject]) {
                subjectStats[recordSubject] = { attended: 0, absent: 0, od: 0, total: 0 };
              }
              if (foundStatus === 'P') {
                subjectStats[recordSubject].attended++;
                subjectStats[recordSubject].total++;
              } else if (foundStatus === 'A') {
                subjectStats[recordSubject].absent++;
                subjectStats[recordSubject].total++;
              } else if (foundStatus === 'OD') {
                subjectStats[recordSubject].od++;
                subjectStats[recordSubject].total++;
              }
            }

            if (foundStatus === 'P') {
              attended++;
              totalClasses++;
            } else if (foundStatus === 'A') {
              absent++;
              totalClasses++;
            } else if (foundStatus === 'OD') {
              odCount++;
              totalClasses++;
            }
          } else {
            dailyRecords[rk] = '—';
          }
        });

        const activeClasses = totalClasses - odCount;
        const percentage = activeClasses > 0 ? ((attended / activeClasses) * 100).toFixed(1) : "0.0";

        return {
          reg: student.reg,
          name: student.name,
          section: student.docId.split('_').find(p => p.startsWith('Sec-')) || 'Sec-A',
          attended,
          absent,
          od: odCount,
          total: totalClasses,
          percentage,
          dailyRecords,
          subjectStats
        };
      });

      studentStats.sort((a, b) => a.reg.localeCompare(b.reg));

      setGeneratedReport({
        periods: sortedPeriods,
        groupedPeriods,
        periodInfo,
        students: studentStats,
        fromDate: reportFromDate,
        toDate: reportToDate,
        batch: reportBatch,
        section: reportSection || "All Sections",
        academicYear: reportAcademicYear,
        semester: reportSemester,
        selectedSubjects: selectedReportSubjects
      });

      showToast("Report generated successfully!", "success");
    } catch (err) {
      console.error("Error generating report:", err);
      alert("Failed to generate report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportCSV = () => {
    if (!generatedReport) return;
    const { periods, students, batch, section, fromDate, toDate } = generatedReport;
    const selectedSubjects = generatedReport.selectedSubjects || [];

    const subjHeaders = selectedSubjects.length > 0
      ? selectedSubjects.flatMap(code => [`${code} Total`, `${code} Present`, `${code} Absent`, `${code} %`])
      : [];

    let headers, rows;
    headers = ["Register No", "Student Name", "Section", ...periods.map(p => {
      const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
      const info = generatedReport.periodInfo?.[p];
      return info ? `P${pNum} (${info})` : `P${pNum}`;
    }), "Total Classes", "Present", "OD", "Absent", "Percentage (%)", ...subjHeaders];
    rows = students.map(s => {
      const dailyVals = periods.map(p => s.dailyRecords[p]);
      const subjVals = selectedSubjects.flatMap(code => {
        const st = s.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
        return [st.total, st.attended, st.absent, subjectStatPct(st)];
      });
      return [
        s.reg,
        s.name,
        s.section,
        ...dailyVals,
        s.total,
        s.attended,
        s.od,
        s.absent,
        s.percentage,
        ...subjVals
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Report_${batch}_${section}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (!generatedReport) return;
    const { students, batch, section, fromDate, toDate } = generatedReport;
    const groupedPeriods = generatedReport.groupedPeriods || [];

    let logoDataUrl = null;
    try {
      const resp = await fetch('/logo.png');
      const blob = await resp.blob();
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { }

    const doc = new jsPDF({ orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginL = 14;
    const marginR = 14;
    const usableW = pageW - marginL - marginR;

    const drawHeader = (isFirst = false) => {
      let y = 10;
      if (isFirst && logoDataUrl) {
        try {
          const logoW = usableW;
          const logoH = logoW * 0.065;
          doc.addImage(logoDataUrl, 'PNG', marginL, y, logoW, logoH);
          y += logoH + 3;
        } catch { }
      }
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Batch Attendance Report', marginL, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Department: ${hodDepartment}  |  Batch: ${batch}  |  Section: ${section}  |  Range: ${fromDate} to ${toDate}`, marginL, y);
      return y + 5;
    };

    let yPos = drawHeader(true);

    const selectedSubjects = generatedReport.selectedSubjects || [];

    // ── Overall Attendance Summary Table (only in Overall mode) ──
    if (selectedSubjects.length === 0) {
      const summaryHeaders = ['Reg No', 'Student Name', 'Sec', 'Total', 'Present', 'OD', 'Absent', '%'];
      const summaryRows = students.map(s => [
        s.reg,
        s.name,
        s.section.replace('Sec-', ''),
        s.total,
        s.attended,
        s.od,
        s.absent,
        s.percentage + '%'
      ]);
      const colStyles = {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: 10 },
        3: { cellWidth: 14 },
        4: { cellWidth: 15 },
        5: { cellWidth: 12 },
        6: { cellWidth: 15 },
        7: { fontStyle: 'bold', cellWidth: 15 }
      };

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Overall Attendance Summary', marginL, yPos);
      yPos += 4;

      autoTable(doc, {
        head: [summaryHeaders],
        body: summaryRows,
        startY: yPos,
        margin: { left: marginL, right: marginR },
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
        columnStyles: colStyles,
        headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold' },
        didParseCell: (data) => {
          const pctColIndex = summaryHeaders.length - 1;
          if (data.section === 'body' && data.column.index === pctColIndex) {
            const val = parseFloat(data.cell.raw);
            if (val < 75) {
              data.cell.styles.textColor = [200, 30, 30];
            } else {
              data.cell.styles.textColor = [16, 128, 80];
            }
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 8;
    }

    // ── Subject-wise Attendance Summary Table (when specific subjects selected) ──
    if (selectedSubjects.length > 0) {
      if (yPos + 25 > pageH) {
        doc.addPage();
        yPos = drawHeader(false);
      }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Subject-wise Attendance Summary', marginL, yPos);
      yPos += 4;

      const subjHeaders = ['Reg No', 'Student Name', ...selectedSubjects.flatMap(code => [`${code} Total`, `${code} P`, `${code} A`, `${code} %`])];
      const subjRows = students.map(s => [
        s.reg,
        s.name,
        ...selectedSubjects.flatMap(code => {
          const st = s.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
          return [st.total, st.attended, st.absent, subjectStatPct(st) + '%'];
        })
      ]);

      autoTable(doc, {
        head: [subjHeaders],
        body: subjRows,
        startY: yPos,
        margin: { left: marginL, right: marginR },
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
          1: { halign: 'left', fontStyle: 'bold' },
        },
        headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold' },
        didParseCell: (data) => {
          const { section, column } = data;
          if (section === 'body' && column.index >= 2) {
            const colInGroup = (column.index - 2) % 4;
            if (colInGroup === 3) {
              const val = parseFloat(data.cell.raw);
              data.cell.styles.textColor = val < 75 ? [200, 30, 30] : [16, 128, 80];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 8;
    }

    // Show daily period breakdown (filtered to the selected subjects' periods)
    if (groupedPeriods.length > 0) {
      if (yPos + 25 > pageH) {
        doc.addPage();
        yPos = drawHeader(false);
      }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Daily Period-wise Breakdown', marginL, yPos);
      yPos += 5;

      groupedPeriods.forEach((group, gi) => {
        const dateLabel = group.date;
        const dayName = new Date(group.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

        // Check if we have enough space; otherwise new page
        const headerH = 8;
        const tableRowH = 5.5;
        const neededForHeader = headerH + 15;
        const neededForTable = students.length * tableRowH + 10;
        if (yPos + neededForHeader > pageH - 10) {
          doc.addPage();
          yPos = drawHeader(false);
        }

        // Date section header
        doc.setFillColor(18, 12, 122);
        doc.rect(marginL, yPos, usableW, 7, 'F');
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(`${dateLabel}  (${dayName})  —  ${group.periods.length} period(s)`, marginL + 2, yPos + 5);
        doc.setTextColor(0, 0, 0);
        yPos += 8;

        // Build table: Reg No | Name | P1 | P2 | ... | Pn
        const headers = ['Reg No', 'Student Name', ...group.periods.map(p => {
          const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
          const info = generatedReport.periodInfo?.[p];
          return info ? `P${pNum} (${info})` : `P${pNum}`;
        })];
        const rows = students.map(s => {
          const vals = group.periods.map(p => {
            const v = s.dailyRecords[p];
            return v || '—';
          });
          return [s.reg, s.name, ...vals];
        });

        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: yPos,
          margin: { left: marginL, right: marginR },
          theme: 'grid',
          styles: { fontSize: 6.5, cellPadding: 1.2, halign: 'center', overflow: 'linebreak' },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
            1: { halign: 'left', cellWidth: 45 },
          },
          headStyles: { fillColor: [18, 12, 122], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
          didParseCell: (data) => {
            const { section, column, cell, row } = data;
            if (section === 'body') {
              const ci = column.index;
              if (ci >= 2) {
                const val = cell.raw;
                if (val === 'P') {
                  cell.styles.textColor = [16, 128, 80];
                  cell.styles.fontStyle = 'bold';
                } else if (val === 'A') {
                  cell.styles.textColor = [200, 30, 30];
                  cell.styles.fontStyle = 'bold';
                  cell.styles.fillColor = [254, 226, 226];
                } else if (val === 'OD') {
                  cell.styles.textColor = [30, 100, 200];
                  cell.styles.fontStyle = 'bold';
                }
              }
              if (row.index % 2 === 1 && cell.styles.fillColor === undefined) {
                cell.styles.fillColor = [245, 245, 255];
              }
            }
          },
        });

        yPos = doc.lastAutoTable.finalY + 4;

        // Date summary row
        const totalStudents = students.length;
        let dateP = 0, dateA = 0, dateOD = 0;
        students.forEach(s => {
          group.periods.forEach(p => {
            const v = s.dailyRecords[p];
            if (v === 'P') dateP++;
            else if (v === 'A') dateA++;
            else if (v === 'OD') dateOD++;
          });
        });
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(`P: ${dateP}  |  A: ${dateA}  |  OD: ${dateOD}  |  Total Records: ${group.periods.length * totalStudents}`, marginL, yPos + 3);
        yPos += 8;
      });
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    setReportPdfUrl(url);
    setReportPdfDoc(doc);
    setReportPdfFilename(`Attendance_Report_${batch}_${section}_${fromDate}_to_${toDate}.pdf`);
    setShowReportPdfPreview(true);
  };

  useEffect(() => {
    if (!hodDepartment) {
      setActivitiesLoading(false);
      return;
    }
    setActivitiesLoading(true);
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      where("status", "==", "HOD_Pending")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.department === hodDepartment) {
          list1.push({ id: d.id, ...data });
        }
      });
      combineAndSet();
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      where("status", "==", "HOD_Pending")
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.department === hodDepartment) {
          list2.push({ id: d.id, isStep: true, ...data });
        }
      });
      combineAndSet();
    }, (err) => console.error("Error loading step_activities:", err));

    const combineAndSet = () => {
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setPendingActivities(combined);
      setActivitiesLoading(false);
    };

    return () => {
      unsub1();
      unsub2();
    };
  }, [hodDepartment]);

  const handleApproveActivity = async (act) => {
    if (!act) return;
    setIsActioning(true);
    try {
      const docRef = doc(db, act.isStep ? "step_activities" : "activity_entries", act.id);
      await setDoc(docRef, {
        status: "Approved",
        comments: "Approved by HOD",
        reviewedBy: currentUid || "",
        reviewedByName: hodName || "HOD",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity approved successfully!");
      setReviewActivity(null);
      setShowActivityModal(false);
    } catch (err) {
      console.error("Error approving activity:", err);
      alert("Failed to approve activity.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturnActivity = async (act) => {
    if (!act) return;
    if (!returnComment.trim()) {
      alert("Please enter comments explaining the corrections needed.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, act.isStep ? "step_activities" : "activity_entries", act.id);
      await setDoc(docRef, {
        status: "Returned",
        comments: returnComment,
        reviewedBy: currentUid || "",
        reviewedByName: hodName || "HOD",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity returned for correction.");
      setReviewActivity(null);
      setShowActivityModal(false);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning activity:", err);
      alert("Failed to return activity.");
    } finally {
      setIsActioning(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  useEffect(() => {
    const ciaRef = collection(db, 'cia_configs');
    const unsubscribe = onSnapshot(ciaRef, (snapshot) => {
      if (snapshot.exists) {
        const data = {};
        snapshot.forEach(d => { data[d.id] = d.data(); });
        setCiaConfigs(data);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            console.log('[HODDashboard] User doc fields:', Object.keys(ud).join(', '), '| Full:', ud);
            setCurrentHodSignature(ud.signatureUrl || '');
            setHodName(ud.facultyName || ud.displayName || ud.email || "HOD");
            setHodDepartment(ud.department || ud.assignedDepartment || ud.departmentName || ud.dept || ud.deptName || ud.facultyDepartment || ud.departmentCode || "");
            setHodProgramme(ud.programme || "");
          }
          setHodLoading(false);
        });
      } else {
        setCurrentHodSignature('');
        setHodName("");
        setHodLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(
      usersRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        setUsersMap(data || {});
      },
      () => setUsersMap({})
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    const qpRef = collection(db, "generated_qps");
    const unsub = onSnapshot(
      qpRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { data[doc.id] = doc.data(); });
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });
        const forwarded = all
          .filter((qp) => qp?.status === "forwarded" && qp?.forwarded_to === currentUid)
          .sort((a, b) => {
            const at = new Date(a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });
        setTasks(forwarded);
        setTasksLoading(false);
      },
      () => { setTasks([]); setTasksLoading(false); }
    );
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!hodDepartment) {
      setApprovedStudentsList([]);
      return;
    }
    setStudentsLoading(true);
    const hodNorm = sanitizeKey(hodDepartment).toLowerCase().replace(/[_ ]+/g, '');
    const unsub = onSnapshot(
      collection(db, 'approved_admissions'),
      (snap) => {
        const all = [];
        snap.forEach(docSnap => {
          const docId = docSnap.id;
          const data = docSnap.data();
          // 1) Try _meta.department first
          let deptMatch = false;
          if (data._meta?.department) {
            const metaDept = sanitizeKey(data._meta.department).toLowerCase().replace(/[_ ]+/g, '');
            deptMatch = metaDept === hodNorm || metaDept.includes(hodNorm) || hodNorm.includes(metaDept);
          }
          // 2) Fall back to doc ID: {batch}_{progKey}_{deptKey} where deptKey can span multiple segments
          if (!deptMatch) {
            const parts = docId.split('_');
            if (parts.length > 1) {
              // Try matching the full composite after batch against the HOD dept name
              const batchMatch2 = docId.match(/(\d{4}-\d{4})/);
              if (batchMatch2) {
                const afterBatch = docId.slice(docId.indexOf(batchMatch2[1]) + batchMatch2[1].length + 1);
                const normComposite = afterBatch.toLowerCase().replace(/[_ ]+/g, '');
                deptMatch = normComposite === hodNorm || normComposite.includes(hodNorm) || hodNorm.includes(normComposite);
              } else {
                // Fallback: last segment only
                const lastPart = parts[parts.length - 1].toLowerCase();
                deptMatch = lastPart === hodNorm || lastPart.includes(hodNorm) || hodNorm.includes(lastPart);
              }
            }
          }
          if (!deptMatch) return;

          // Extract batch from doc ID (first segment with dash)
          let batch = "";
          const batchMatch = docId.match(/(\d{4}-\d{4})/);
          if (batchMatch) batch = batchMatch[1];

          Object.entries(data).forEach(([key, val]) => {
            if (key === '_order' || key.startsWith('_')) return;
            all.push({ reg: key, name: val, batch, docId });
          });
        });
        all.sort((a, b) => a.reg.localeCompare(b.reg));
        setApprovedStudentsList(all);
        setStudentsLoading(false);
      },
      () => { setApprovedStudentsList([]); setStudentsLoading(false); }
    );
    return () => unsub();
  }, [hodDepartment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const map = {};
      snap.forEach(docSnap => {
        const data = docSnap.data();
        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') map[key] = name;
        });
      });
      setAllStudentNames(map);
    }, () => setAllStudentNames({}));
    return () => unsub();
  }, []);

  // Fetch section-assigned students per batch for this dept
  useEffect(() => {
    if (!hodDepartment) { setSectionStudents([]); return; }
    const hodNorm = sanitizeKey(hodDepartment).toLowerCase().replace(/[_ ]+/g, '');
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        const docId = docSnap.id;
        const data = docSnap.data();
        // 1) Try _meta.department first (most reliable)
        let deptMatch = false;
        if (data._meta?.department) {
          const metaDept = sanitizeKey(data._meta.department).toLowerCase().replace(/[_ ]+/g, '');
          deptMatch = metaDept === hodNorm || metaDept.includes(hodNorm) || hodNorm.includes(metaDept);
        }
        // 2) Fall back to doc ID parsing: {batch}_{progKey}_{deptKey}[_section]
        if (!deptMatch) {
          const parts = docId.split('_');
          // Find batch (contains a dash like 2024-2028)
          const batchIdx = parts.findIndex(p => /\d{4}-\d{4}/.test(p));
          if (batchIdx >= 0) {
            // deptKey is the part right before the batch or after progKey
            // But since progKey can be multi-part (B_Tech), dept is the last part before batch
            // Actually in {batch}_{progKey}_{deptKey}, batch is FIRST
            // So: parts[0] = batch, rest is {progKey}_{deptKey}[_section]
            // deptKey = second-to-last segment (or last if no section)
            const afterBatch = parts.slice(1);
            // Remove section suffix if present (last part starts with Sec-)
            const coreParts = afterBatch.length > 0 && afterBatch[afterBatch.length - 1].match(/^Sec-/)
              ? afterBatch.slice(0, -1)
              : afterBatch;
            // deptKey is the last part of core
            if (coreParts.length > 0) {
              const lastPart = coreParts[coreParts.length - 1].toLowerCase();
              deptMatch = lastPart === hodNorm || lastPart.includes(hodNorm) || hodNorm.includes(lastPart);
            }
          }
        }
        if (!deptMatch) return;

        // Extract batch from doc ID
        let batch = "";
        const batchMatch = docId.match(/(\d{4}-\d{4})/);
        if (batchMatch) batch = batchMatch[1];

        Object.entries(data).forEach(([key, val]) => {
          if (key.startsWith('_')) return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
          if (name && typeof name === 'string') list.push({ reg: key, name, batch, docId });
        });
      });
      setSectionStudents(list);
    }, () => setSectionStudents([]));
    return () => unsub();
  }, [hodDepartment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(d => { configs.push({ id: d.id, ...d.data() }); });
      setSemesterConfigs(configs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const eventsRef = collection(db, 'academic_calendar_events');
    const unsub = onSnapshot(eventsRef, (snap) => {
      const dateMap = {};
      snap.forEach(doc => {
        const ev = { id: doc.id, ...doc.data() };
        const start = new Date(ev.fromDate);
        const end = new Date(ev.toDate);
        if (!ev.fromDate || !ev.toDate || isNaN(start.getTime()) || isNaN(end.getTime())) return;
        let cursor = new Date(start);
        while (cursor <= end) {
          const dStr = formatDateKey(cursor);
          if (!dateMap[dStr]) dateMap[dStr] = [];
          dateMap[dStr].push(ev);
          cursor.setDate(cursor.getDate() + 1);
        }
      });
      setAcademicEvents(dateMap);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'department_metadata'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setDeptMetadata(data);
      setDeptMetadataLoaded(true);
    });
    return () => unsub();
  }, []);

  // ─── Attendance Overview ───
  useEffect(() => {
    if (!currentUid || !deptMetadataLoaded) {
      setAttendanceOverview({});
      setAttendanceOverviewLoading(false);
      return;
    }
    setAttendanceOverviewLoading(true);

    let cancelled = false;

    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const currentAy = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    // Build valid dept keys: both sanitized name AND code from deptMetadata
    const stripDegreePrefix = (s) => s.replace(/^(B\.? ?Tech|M\.? ?Tech|B\.?E\.?|M\.?E\.?|B\.?Sc|M\.?Sc|Ph\.?D)\s+/i, '').trim();
    const hodNorm = hodDepartment ? stripDegreePrefix(hodDepartment) : '';
    const validDeptKeys = new Set();
    if (hodDepartment) {
      validDeptKeys.add(sanitizeKey(hodDepartment).toLowerCase());
      validDeptKeys.add(sanitizeKey(hodNorm).toLowerCase());
      Object.values(deptMetadata).forEach(depts => {
        Object.entries(depts).forEach(([name, code]) => {
          if (name === hodDepartment || name === hodNorm || code === hodDepartment || code === hodNorm ||
            sanitizeKey(name).toLowerCase() === sanitizeKey(hodNorm).toLowerCase() ||
            code.toLowerCase() === hodNorm.toLowerCase()) {
            validDeptKeys.add(sanitizeKey(name).toLowerCase());
            validDeptKeys.add(sanitizeKey(code).toLowerCase());
          }
        });
      });
    }

    const unsub = onSnapshot(collection(db, "subject_assignments"), async (snap) => {
      const allAssignments = [];

      snap.forEach(d => {
        const parts = d.id.split('_');
        const yearIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
        if (yearIdx < 2) return;

        const batchKey = parts[yearIdx];
        const ayKey = parts[yearIdx + 1];
        const semNum = parts[yearIdx + 2];
        const secSuffix = parts.slice(yearIdx + 3).join('_');

        const combinedBeforeBatch = parts.slice(0, yearIdx).join('_');
        let progKey = '';
        let deptFromDoc = '';

        // Strategy 1: use hodProgramme (from user doc) as the known programme key
        if (hodProgramme && combinedBeforeBatch.startsWith(hodProgramme + '_')) {
          progKey = hodProgramme;
          deptFromDoc = combinedBeforeBatch.slice(hodProgramme.length + 1);
        }

        // Strategy 2: try matching against deptMetadata
        if (!progKey) {
          for (const [pk, depts] of Object.entries(deptMetadata)) {
            if (!combinedBeforeBatch.startsWith(pk + '_')) continue;
            const deptCandidate = combinedBeforeBatch.slice(pk.length + 1);
            for (const [deptName, deptCode] of Object.entries(depts)) {
              if (sanitizeKey(deptName) === deptCandidate || deptCode === deptCandidate) {
                progKey = pk;
                deptFromDoc = deptCandidate;
                break;
              }
            }
            if (progKey) break;
          }
        }

        // Strategy 3: try all programme keys from deptMetadata and match dept by name/code
        if (!progKey) {
          for (const [pk, depts] of Object.entries(deptMetadata)) {
            if (!combinedBeforeBatch.startsWith(pk + '_')) continue;
            progKey = pk;
            deptFromDoc = combinedBeforeBatch.slice(pk.length + 1);
            break;
          }
        }

        // Strategy 4: fallback — old parsing (single-word dept names only)
        if (!progKey) {
          deptFromDoc = parts[yearIdx - 1];
          progKey = parts.slice(0, yearIdx - 1).join('_');
        }

        const data = d.data();

        Object.entries(data).forEach(([uid, codes]) => {
          if (Array.isArray(codes)) {
            codes.forEach(code => {
              allAssignments.push({ uid, subjectCode: code, batch: batchKey, ay: ayKey, sem: semNum, section: secSuffix, progKey, attDeptKey: deptFromDoc });
            });
          }
        });
      });

      // Filter by department using validDeptKeys (name + code matching)
      let deptFiltered = allAssignments;
      if (validDeptKeys.size > 0) {
        const hodDirectKey = hodNorm ? sanitizeKey(hodNorm).toLowerCase() : '';
        deptFiltered = allAssignments.filter(a => {
          const normKey = sanitizeKey(a.attDeptKey.trim()).toLowerCase();
          return validDeptKeys.has(normKey) || (hodDirectKey && normKey === hodDirectKey);
        });
      }

      console.log('[AttendanceOverview] hodProgramme:', hodProgramme, '| hodDept:', hodDepartment, '| validDeptKeys:', [...validDeptKeys], '| allAssignments:', allAssignments.length, '| deptFiltered:', deptFiltered.length);

      let filtered = deptFiltered.filter(a => a.ay === currentAy);
      if (filtered.length === 0 && deptFiltered.length > 0) {
        filtered = deptFiltered;
      }

      const seen = new Set();
      const unique = [];
      filtered.forEach(a => {
        const key = `${a.batch}_${a.subjectCode}_${a.sem}_${a.section}`;
        if (!seen.has(key)) { seen.add(key); unique.push(a); }
      });

      const attDocPromises = unique.map(async (a) => {
        const sectionSuffix = a.section ? `_${sanitizeKey(a.section)}` : "";
        const attDocId = `${a.progKey}_${a.attDeptKey}_${sanitizeKey(a.batch)}_${sanitizeKey(a.ay)}_${a.sem}_${a.subjectCode}${sectionSuffix}`;
        let attRecords = {};
        try {
          const attSnap = await getDoc(doc(db, "attendance", attDocId));
          if (attSnap.exists()) {
            attRecords = getAttendanceRecords(attSnap.data());
          }
        } catch { /* skip */ }
        return { ...a, attRecords, facultyUid: a.uid, attDocId };
      });

      const syllabusPromise = (async () => {
        try {
          return await fetchAllCourseNamesMap();
        } catch (e) {
          console.warn('[AttendanceOverview] course names fetch error:', e);
          return {};
        }
      })();

      const [results, nameMap] = await Promise.all([Promise.all(attDocPromises), syllabusPromise]);

      if (cancelled) return;

      const grouped = {};
      results.forEach(r => {
        if (!grouped[r.batch]) grouped[r.batch] = [];
        grouped[r.batch].push(r);
      });

      setSubjectNamesMap(nameMap);
      setAttendanceOverview(grouped);
      setAttendanceOverviewLoading(false);
    }, () => { if (!cancelled) { setAttendanceOverview({}); setAttendanceOverviewLoading(false); } });
    return () => { cancelled = true; unsub(); };
  }, [hodDepartment, hodProgramme, currentUid, deptMetadata, deptMetadataLoaded]);

  // ─── Fetch timetable allocation for each batch ───
  useEffect(() => {
    if (Object.keys(attendanceOverview).length === 0) { setTimetableAllocation({}); return; }
    const fetchTimetables = async () => {
      const newMap = {};
      for (const [batch, items] of Object.entries(attendanceOverview)) {
        const first = items[0];
        if (!first) continue;
        const ttKey = `${first.progKey}_${first.attDeptKey}_${sanitizeKey(first.batch)}_${sanitizeKey(first.ay)}_${first.sem}`;
        console.log('[Timetable] Looking up key:', ttKey, '| batch:', batch, '| progKey:', first.progKey, '| deptKey:', first.attDeptKey);
        try {
          const snap = await getDoc(doc(db, 'timetable_allocations', ttKey));
          if (snap.exists()) {
            const data = snap.data();
            console.log('[Timetable] Found for', batch, '| subjectAllocation:', data.subjectAllocation);
            newMap[batch] = data.subjectAllocation || {};
          } else {
            console.log('[Timetable] No doc found for key:', ttKey);
          }
        } catch (e) { console.warn('[Timetable] fetch error for', ttKey, e); }
      }
      console.log('[Timetable] Final timetableAllocation:', newMap);
      setTimetableAllocation(newMap);
    };
    fetchTimetables();
  }, [attendanceOverview]);

  const resolvedAttendanceOverview = useMemo(() => {
    const resolved = {};
    Object.entries(attendanceOverview).forEach(([batch, items]) => {
      resolved[batch] = items.map(item => ({
        ...item,
        facultyName: item.facultyUid
          ? (usersMap[item.facultyUid]?.facultyName || usersMap[item.facultyUid]?.displayName || usersMap[item.facultyUid]?.email || item.facultyUid)
          : item.facultyUid,
        subjectName: getCourseName(subjectNamesMap, item.subjectCode, hodDepartment, hodProgramme) || ""
      }));
    });
    return resolved;
  }, [attendanceOverview, usersMap, subjectNamesMap, hodDepartment, hodProgramme]);


  const activeSemesters = useMemo(() => {
    const selected = new Date(attendanceDate + 'T00:00:00');
    return semesterConfigs.filter(cfg => {
      if (!cfg.startDate || !cfg.endDate) return false;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      return selected >= start && selected <= end;
    });
  }, [semesterConfigs, attendanceDate]);

  const attendanceDateOutsideSemester = useMemo(() => {
    if (!semesterConfigs.length) return false;
    const selected = new Date(attendanceDate + 'T00:00:00');
    return !semesterConfigs.some(cfg => {
      if (!cfg.startDate || !cfg.endDate) return false;
      const s = new Date(cfg.startDate + 'T00:00:00');
      const e = new Date(cfg.endDate + 'T00:00:00');
      return selected >= s && selected <= e;
    });
  }, [semesterConfigs, attendanceDate]);

  const attendanceDateEvents = useMemo(() => academicEvents[attendanceDate] || [], [academicEvents, attendanceDate]);
  const attendanceDateIsHoliday = useMemo(() => attendanceDateEvents.some(e => e.type === 'Holiday'), [attendanceDateEvents]);
  const attendanceDateIsSunday = useMemo(() => new Date(attendanceDate + 'T00:00:00').getDay() === 0, [attendanceDate]);

  const availablePeriods = useMemo(() => Array.from({ length: 8 }, (_, i) => String(i + 1)), []);

  const [detailModal, setDetailModal] = useState({ open: false, title: '', students: [] });
  const [subjectEnrollments, setSubjectEnrollments] = useState({}); // enrolDocId → Set<regNo>

  // Load course enrollment data for all subjects in attendance overview (backward compat)
  useEffect(() => {
    const items = Object.values(resolvedAttendanceOverview).flat();
    if (items.length === 0) { setSubjectEnrollments({}); return; }
    let cancelled = false;
    const fetchEnrollments = async () => {
      const map = {};
      await Promise.all(items.map(async (item) => {
        const enrolDocId = `${item.progKey}_${sanitizeKey(item.attDeptKey)}_${sanitizeKey(item.batch)}_${sanitizeKey(item.ay)}_${item.sem}_${sanitizeKey(item.subjectCode)}`;
        try {
          const snap = await getDoc(doc(db, 'course_enrolments', enrolDocId));
          if (snap.exists()) {
            const data = snap.data();
            map[enrolDocId] = new Set(Object.keys(data).filter(k => data[k]));
          }
        } catch (e) { /* enrollment doc may not exist */ }
      }));
      if (!cancelled) setSubjectEnrollments(map);
    };
    fetchEnrollments();
    return () => { cancelled = true; };
  }, [resolvedAttendanceOverview]);

  const batchStrength = useMemo(() => {
    // Only include batches that have an ACTIVE semester_config (today within startDate→endDate)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeBatches = new Set();
    semesterConfigs.forEach(cfg => {
      if (!cfg.startDate || !cfg.endDate) return;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      if (today < start || today > end) return; // skip expired/future configs
      const batches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
      batches.forEach(b => activeBatches.add(b));
    });
    if (activeBatches.size === 0) return [];

    const counts = {};
    // Approved (not yet section-assigned)
    approvedStudentsList.forEach(s => {
      if (!activeBatches.has(s.batch)) return;
      if (!counts[s.batch]) counts[s.batch] = { batch: s.batch, approved: 0, sectionAssigned: 0, total: 0 };
      counts[s.batch].approved++;
      counts[s.batch].total++;
    });
    // Already section-assigned
    sectionStudents.forEach(s => {
      if (!activeBatches.has(s.batch)) return;
      if (!counts[s.batch]) counts[s.batch] = { batch: s.batch, approved: 0, sectionAssigned: 0, total: 0 };
      counts[s.batch].sectionAssigned++;
      counts[s.batch].total++;
    });
    return Object.values(counts).sort((a, b) => a.batch.localeCompare(b.batch));
  }, [approvedStudentsList, sectionStudents, semesterConfigs]);

  const studentNamesMap = useMemo(() => {
    const map = {};
    Object.assign(map, allStudentNames);
    approvedStudentsList.forEach(s => { if (!map[s.reg]) map[s.reg] = s.name; });
    return map;
  }, [approvedStudentsList, allStudentNames]);

  const attendanceWithPeriods = useMemo(() => {
    const getH = (v) => (typeof v === 'object' && v !== null ? (v.hours ?? 0) : (v ?? 0));
    const result = {};
    const dayName = new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    const isHoliday = academicEvents[attendanceDate]?.some(e => e.type === 'Holiday');
    if (dayName === 'Sunday' || isHoliday) {
      Object.entries(resolvedAttendanceOverview).forEach(([batch, items]) => {
        result[batch] = { items: [], section: items[0]?.section || '', sem: items[0]?.sem || '', hasTimetable: false, isHoliday: true };
      });
      return result;
    }
    Object.entries(resolvedAttendanceOverview).forEach(([batch, items]) => {
      const rows = [];
      let daySchedule = (timetableAllocation[batch] || {})[dayName];
      // Expand continuous periods into individual entries
      if (daySchedule) {
        const expanded = {};
        Object.entries(daySchedule).forEach(([period, rawEntries]) => {
          const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
          entries.forEach(entry => {
            const parts = String(entry || '').split('|');
            const code = parts[0].trim();
            const span = parseInt(parts[1], 10) || 1;
            if (!code) return;
            for (let p = parseInt(period), end = p + span; p < end; p++) {
              const pStr = String(p);
              if (!expanded[pStr]) expanded[pStr] = [];
              if (!expanded[pStr].includes(code)) expanded[pStr].push(code);
            }
          });
        });
        daySchedule = expanded;
      }
      if (daySchedule) {
        const processedPeriods = new Set();
        Object.entries(daySchedule).forEach(([period, rawEntries]) => {
          processedPeriods.add(period);
          const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

          // Collect record information for each entry in this period
          const entryRecords = entries.map(entry => {
            const code = String(entry || '').split('|')[0].trim();
            if (!code) return null;
            const item = items.find(i => i.subjectCode.toLowerCase() === code.toLowerCase());
            const recordKey = `${attendanceDate}_P${period}`;

            let rec = item?.attRecords?.[recordKey];
            let actualItem = item;
            let substituteFaculty = '';
            let substituteSubjectCode = '';

            if (rec) {
              if (rec.markedBy && item?.facultyUid && rec.markedBy !== item.facultyUid) {
                substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
              }
            } else {
              // Scheduled subject has no record for this period.
              // Check if ANY OTHER subject in items has an attendance record for this period,
              // excluding subjects that are explicitly scheduled as their own entry in this period
              const scheduledCodesInPeriod = new Set(entries.map(e => String(e || '').split('|')[0].trim().toLowerCase()));
              const currentSubjectCodeLower = (item?.subjectCode || code).toLowerCase();
              const subMatch = items.find(i => {
                if (!i.attRecords?.[recordKey]) return false;
                const sCode = (i.subjectCode || '').toLowerCase();
                if (scheduledCodesInPeriod.has(sCode) && sCode !== currentSubjectCodeLower) return false;
                return true;
              });
              if (subMatch) {
                rec = subMatch.attRecords[recordKey];
                actualItem = subMatch;
                if (subMatch.subjectCode !== (item?.subjectCode || code)) {
                  substituteSubjectCode = subMatch.subjectCode;
                }
                const markerUid = rec.markedBy || subMatch.facultyUid;
                if (markerUid && item?.facultyUid && markerUid !== item.facultyUid) {
                  substituteFaculty = usersMap[markerUid]?.facultyName || usersMap[markerUid]?.displayName || subMatch.facultyName || markerUid;
                } else if (subMatch.facultyName && item?.facultyName && subMatch.facultyName !== item.facultyName) {
                  substituteFaculty = subMatch.facultyName;
                } else if (markerUid) {
                  substituteFaculty = usersMap[markerUid]?.facultyName || usersMap[markerUid]?.displayName || markerUid;
                }
              }
            }

            const stuMap = rec?.students || {};
            // Filter by course enrollment for backward compat (old data may include non-enrolled students)
            const subj = actualItem || item;
            if (!subj) { console.warn('[HODDash] No matching subject for timetable entry:', { code, period: attendanceDate + '_P' + period, batch }); return null; }
            const enrolDocId = `${subj.progKey}_${sanitizeKey(subj.attDeptKey)}_${sanitizeKey(subj.batch)}_${sanitizeKey(subj.ay)}_${subj.sem}_${sanitizeKey(subj.subjectCode)}`;
            const enrolledSet = subjectEnrollments[enrolDocId];
            const entries2 = Object.entries(stuMap).filter(([reg]) => !enrolledSet || enrolledSet.has(reg));
            const present = entries2.filter(([, h]) => getH(h) > 0);
            const absent = entries2.filter(([, h]) => getH(h) === 0);
            const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));

            return {
              entry, code, item, rec, actualItem,
              substituteFaculty, substituteSubjectCode,
              present, absent, od
            };
          }).filter(Boolean);

          // Deduplicate present students among multiple scheduled subjects in the same period (e.g. historical merged data)
          const activeRecords = entryRecords.filter(er => er.rec && er.present.length > 0);
          if (activeRecords.length > 1) {
            for (let i = 0; i < activeRecords.length; i++) {
              for (let j = i + 1; j < activeRecords.length; j++) {
                const a = activeRecords[i];
                const b = activeRecords[j];

                const setA = new Set(a.present.map(([reg]) => reg));
                const setB = new Set(b.present.map(([reg]) => reg));
                const overlap = [...setA].filter(reg => setB.has(reg));

                if (overlap.length > 0) {
                  if (a.present.length < b.present.length) {
                    // 'a' has fewer marked students, meaning 'a''s students were merged into 'b'.
                    // Remove overlapping students from 'b'
                    const overlapSet = new Set(overlap);
                    b.present = b.present.filter(([reg]) => !overlapSet.has(reg));
                  } else if (b.present.length < a.present.length) {
                    // 'b' has fewer marked students, meaning 'b''s students were merged into 'a'.
                    // Remove overlapping students from 'a'
                    const overlapSet = new Set(overlap);
                    a.present = a.present.filter(([reg]) => !overlapSet.has(reg));
                  } else {
                    // Equal lengths (e.g. both 60 because both saved merged data):
                    // Split overlap between 'a' (first scheduled) and 'b' (second scheduled)
                    const half = Math.floor(overlap.length / 2);
                    const removeForA = new Set(overlap.slice(half));
                    const removeForB = new Set(overlap.slice(0, half));
                    a.present = a.present.filter(([reg]) => !removeForA.has(reg));
                    b.present = b.present.filter(([reg]) => !removeForB.has(reg));
                  }
                }
              }
            }
          }

          // Build row output
          entryRecords.forEach(er => {
            const {
              entry, code, item, rec, actualItem,
              substituteFaculty, substituteSubjectCode,
              present, absent, od
            } = er;

            const subjectCode = item?.subjectCode || code;
            const subjectName = item?.subjectName || actualItem?.subjectName || "";
            const facultyName = item?.facultyName || "—";
            const section = item?.section || actualItem?.section || "";

            if (rec) {
              rows.push({
                period, hasRecord: true,
                subjectCode: rec?.isEvent ? '-' : subjectCode,
                subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : subjectName,
                section, facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode,
                isEvent: rec?.isEvent || false,
              });
            } else {
              rows.push({
                period, hasRecord: false,
                subjectCode, subjectName,
                section, facultyName,
                presentCount: 0, absentCount: 0, odCount: 0,
                presentStudents: [], absentStudents: [], odStudents: [],
                substituteFaculty: '', substituteSubjectCode: '',
                isEvent: false,
              });
            }
          });
        });

        // Include any extra periods recorded on this date that were NOT in daySchedule
        items.forEach(item => {
          const recordKeys = Object.keys(item.attRecords || {});
          recordKeys.forEach(rk => {
            const m = rk.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/);
            if (m && m[1] === attendanceDate) {
              const p = m[2];
              if (!processedPeriods.has(p)) {
                processedPeriods.add(p);
                const rec = item.attRecords[rk];
                const stuMap = rec?.students || {};
                const entries2 = Object.entries(stuMap);
                const present = entries2.filter(([, h]) => getH(h) > 0);
                const absent = entries2.filter(([, h]) => getH(h) === 0);
                const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));
                let substituteFaculty = '';
                if (rec.markedBy && item.facultyUid && rec.markedBy !== item.facultyUid) {
                  substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
                }
                rows.push({
                  period: p, hasRecord: true,
                  subjectCode: rec?.isEvent ? '-' : item.subjectCode,
                  subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : item.subjectName,
                  section: item.section, facultyName: item.facultyName,
                  presentCount: present.length, absentCount: absent.length, odCount: od.length,
                  presentStudents: present, absentStudents: absent, odStudents: od,
                  substituteFaculty, substituteSubjectCode: '',
                  isEvent: rec?.isEvent || false,
                });
              }
            }
          });
        });
      } else {
        items.forEach(item => {
          const recordKeys = Object.keys(item.attRecords || {});
          const matchedPeriods = recordKeys
            .map(rk => { const m = rk.match(/^(\d{4}-\d{2}-\d{2})_P(\d+)$/); return m && m[1] === attendanceDate ? m[2] : null; })
            .filter(Boolean);
          if (matchedPeriods.length > 0) {
            matchedPeriods.forEach(p => {
              const recordKey = `${attendanceDate}_P${p}`;
              const rec = item.attRecords[recordKey];
              const stuMap = rec?.students || {};
              const entries2 = Object.entries(stuMap);
              const present = entries2.filter(([, h]) => getH(h) > 0);
              const absent = entries2.filter(([, h]) => getH(h) === 0);
              const od = entries2.filter(([, h]) => getH(h) === -1 || h === 'OD' || (typeof h === 'object' && h?.hours === -1));
              let substituteFaculty = '';
              if (rec && rec.markedBy && item.facultyUid && rec.markedBy !== item.facultyUid) {
                substituteFaculty = usersMap[rec.markedBy]?.facultyName || usersMap[rec.markedBy]?.displayName || rec.markedBy;
              }
              rows.push({
                period: p, hasRecord: true,
                subjectCode: rec?.isEvent ? '-' : item.subjectCode,
                subjectName: rec?.isEvent ? (rec?.eventName || 'Event') : item.subjectName,
                section: item.section, facultyName: item.facultyName,
                presentCount: present.length, absentCount: absent.length, odCount: od.length,
                presentStudents: present, absentStudents: absent, odStudents: od,
                substituteFaculty, substituteSubjectCode: '',
                isEvent: rec?.isEvent || false,
              });
            });
          } else {
            rows.push({
              period: '?', hasRecord: false,
              subjectCode: item.subjectCode, subjectName: item.subjectName,
              section: item.section, facultyName: item.facultyName,
              presentCount: 0, absentCount: 0, odCount: 0,
              presentStudents: [], absentStudents: [], odStudents: [],
              substituteFaculty: '', substituteSubjectCode: '',
            });
          }
        });
      }
      rows.sort((a, b) => {
        if (a.period === '?') return 1;
        if (b.period === '?') return -1;
        return Number(a.period) - Number(b.period);
      });
      result[batch] = { items: rows, section: items[0]?.section || '', sem: items[0]?.sem || '', hasTimetable: !!timetableAllocation[batch] };
    });
    if (activeSemesters.length > 0) {
      const filtered = {};
      Object.entries(result).forEach(([batchKey, data]) => {
        const hasActive = activeSemesters.some(as => {
          const configBatches = Array.isArray(as.batch) ? as.batch : (as.batch ? [as.batch] : []);
          return configBatches.some(b => {
            const bStr = String(b || '');
            return bStr.split('-')[0] === String(batchKey || '').split('-')[0] &&
              bStr.slice(-2) === String(batchKey || '').slice(-2);
          });
        });
        if (hasActive) filtered[batchKey] = data;
      });
      return filtered;
    }
    return result;
  }, [resolvedAttendanceOverview, attendanceDate, availablePeriods, timetableAllocation, activeSemesters, usersMap, academicEvents]);

  // Available batches for HOD
  const availableReportBatches = useMemo(() => {
    return Object.keys(attendanceWithPeriods).sort();
  }, [attendanceWithPeriods]);

  // Available sections for chosen batch
  const availableReportSections = useMemo(() => {
    if (!reportBatch) return [];
    const sections = new Set();
    sectionStudents.forEach(s => {
      if (s.batch === reportBatch) {
        const parts = s.docId.split('_');
        const secPart = parts.find(p => p.startsWith('Sec-'));
        if (secPart) sections.add(secPart);
      }
    });
    return [...sections].sort();
  }, [reportBatch, sectionStudents]);

  const reportBatchItems = useMemo(() => resolvedAttendanceOverview[reportBatch] || [], [resolvedAttendanceOverview, reportBatch]);

  // Compute the semester number for a SPECIFIC batch from its semester_config,
  // using the same formula as AcademicCalendar (batch start year + config dates).
  // Stored cfg.semesterNumber is computed from the config's FIRST batch only, so it is
  // wrong for other batches sharing the same config — always recompute per batch.
  const semesterNumFor = useCallback((batch, cfg) => {
    if (!batch || !cfg || !cfg.startDate) return cfg?.semesterNumber || cfg?.semester || undefined;
    const batchStart = parseInt(String(batch).split('-')[0], 10);
    const startYear = new Date(cfg.startDate).getFullYear();
    if (!batchStart || !startYear) return cfg?.semesterNumber || cfg?.semester || undefined;
    const isOdd = cfg.semesterType !== 'Even';
    const academicYearStart = isOdd ? startYear : startYear - 1;
    const yearNumber = academicYearStart - batchStart + 1;
    if (yearNumber < 1) return cfg?.semesterNumber || cfg?.semester || undefined;
    const base = (yearNumber - 1) * 2;
    return String(isOdd ? base + 1 : base + 2);
  }, []);

  const availableReportAcademicYears = useMemo(() => {
    if (!reportBatch) return [];
    const fromItems = [...new Set(reportBatchItems.map(i => i.ay).filter(Boolean))];
    const fromConfigs = semesterConfigs
      .filter(cfg => (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch))
      .map(c => c.academicYear)
      .filter(Boolean);
    return [...new Set([...fromItems, ...fromConfigs])].sort();
  }, [reportBatch, reportBatchItems, semesterConfigs]);

  const availableReportSemesters = useMemo(() => {
    if (!reportBatch || !reportAcademicYear) return [];
    const fromItems = [...new Set(reportBatchItems.filter(i => i.ay === reportAcademicYear).map(i => i.sem).filter(Boolean))];
    const fromConfigs = semesterConfigs
      .filter(cfg =>
        (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch) &&
        cfg.academicYear === reportAcademicYear
      )
      .map(c => semesterNumFor(reportBatch, c))
      .filter(Boolean);
    return [...new Set([...fromItems, ...fromConfigs])].sort((a, b) => parseInt(a) - parseInt(b));
  }, [reportBatch, reportAcademicYear, reportBatchItems, semesterConfigs, semesterNumFor]);

  const availableReportSubjects = useMemo(() => {
    if (!reportBatch || !reportSemester) return [];
    const filtered = reportBatchItems.filter(item => {
      if (item.sem !== reportSemester) return false;
      if (reportSection && item.section && item.section !== reportSection) return false;
      return true;
    });
    const unique = [];
    const seen = new Set();
    filtered.forEach(item => {
      const code = item.subjectCode;
      if (!seen.has(code)) {
        seen.add(code);
        const name = subjectNamesMap[code] || item.subjectName || code;
        unique.push({ code, name });
      }
    });
    return unique.sort((a, b) => a.code.localeCompare(b.code));
  }, [reportBatch, reportSemester, reportSection, reportBatchItems, subjectNamesMap]);

  // Determine current academic year (Jul→Dec = current+next, Jan→Jun = prev-current)
  const currentAcademicYear = useMemo(() => {
    const today = new Date();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }, []);

  useEffect(() => {
    if (semesterConfigs.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const activeCfg = semesterConfigs.find(cfg => {
        if (!cfg.startDate || !cfg.endDate) return false;
        return today >= cfg.startDate && today <= cfg.endDate;
      });
      if (activeCfg) {
        const batches = Array.isArray(activeCfg.batch) ? activeCfg.batch : [activeCfg.batch];
        const firstBatch = batches[0] || "";
        if (firstBatch && !reportBatch) {
          setReportBatch(firstBatch);
        }
        if (activeCfg.academicYear && !reportAcademicYear) {
          setReportAcademicYear(activeCfg.academicYear);
        }
        if (!reportSemester) {
          const sem = semesterNumFor(firstBatch, activeCfg);
          if (sem) setReportSemester(sem);
        }
      } else {
        if (availableReportBatches.length > 0 && !reportBatch) {
          setReportBatch(availableReportBatches[0]);
        }
      }
    }
  }, [semesterConfigs, availableReportBatches, semesterNumFor]);

  useEffect(() => {
    if (!reportBatch) return;
    const today = new Date().toISOString().split('T')[0];
    const batchConfigs = semesterConfigs.filter(cfg => {
      const batches = Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch];
      return batches.some(b => String(b) === reportBatch);
    });
    // Prefer the active (today) config for this batch, else current academic year
    const activeCfg = batchConfigs.find(cfg => today >= cfg.startDate && today <= cfg.endDate);
    const targetAY = activeCfg?.academicYear
      || (availableReportAcademicYears.includes(currentAcademicYear) ? currentAcademicYear : undefined)
      || (batchConfigs.map(c => c.academicYear).filter(Boolean).sort().slice(-1)[0])
      || (reportBatchItems.map(i => i.ay).filter(Boolean).sort().slice(-1)[0]);
    if (targetAY) {
      setReportAcademicYear(targetAY);
      const aySems = availableReportSemesters.length > 0
        ? [...new Set([...(batchConfigs.filter(c => c.academicYear === targetAY).map(c => semesterNumFor(reportBatch, c)).filter(Boolean)),
                       ...reportBatchItems.filter(i => i.ay === targetAY).map(i => i.sem).filter(Boolean)])].sort((a, b) => parseInt(a) - parseInt(b))
        : [];
      const activeSem = batchConfigs.find(c => c.academicYear === targetAY && today >= c.startDate && today <= c.endDate);
      const targetSem = activeSem
        ? semesterNumFor(reportBatch, activeSem)
        : (aySems.length > 0 ? aySems[aySems.length - 1] : undefined);
      if (targetSem) setReportSemester(targetSem);
    }
  }, [reportBatch, semesterConfigs, availableReportAcademicYears, availableReportSemesters, reportBatchItems, currentAcademicYear, semesterNumFor]);

  useEffect(() => {
    if (reportBatch && reportAcademicYear) {
      const today = new Date().toISOString().split('T')[0];
      const batchAYConfigs = semesterConfigs.filter(cfg =>
        (Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch]).some(b => String(b) === reportBatch) && cfg.academicYear === reportAcademicYear
      );
      const itemSems = [...new Set(reportBatchItems.filter(i => i.ay === reportAcademicYear).map(i => i.sem).filter(Boolean))];
      const uniqueSems = [...new Set([...batchAYConfigs.map(c => semesterNumFor(reportBatch, c)), ...itemSems].filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
      const activeCfg = batchAYConfigs.find(cfg => today >= cfg.startDate && today <= cfg.endDate);
      const targetSem = activeCfg ? semesterNumFor(reportBatch, activeCfg)
        : (uniqueSems.includes(semesterNumFor(reportBatch, batchAYConfigs[0])) ? semesterNumFor(reportBatch, batchAYConfigs[0]) : (uniqueSems[uniqueSems.length - 1]));
      if (uniqueSems.length > 0 && targetSem) {
        setReportSemester(prev => (prev && uniqueSems.includes(prev)) ? prev : targetSem);
      }
    }
  }, [reportAcademicYear, reportBatch, semesterConfigs, reportBatchItems, semesterNumFor]);

  // Date range allowed by semester_config (AcademicCalendar) for the selected batch
  // Reuses activeSemesters (filtered by today's date, same as attendance status)
  const reportDateRange = useMemo(() => {
    const active = activeSemesters.filter(cfg => {
      if (!reportBatch) return true;
      const batches = Array.isArray(cfg.batch) ? cfg.batch : [cfg.batch];
      return batches.some(b => String(b) === reportBatch);
    });
    let min = null;
    let max = null;
    active.forEach(cfg => {
      if (!min || cfg.startDate < min) min = cfg.startDate;
      if (!max || cfg.endDate > max) max = cfg.endDate;
    });
    return { min, max };
  }, [activeSemesters, reportBatch]);

  const reportDatesOutsideSemester = useMemo(() => {
    if (!reportDateRange.min || !reportDateRange.max) return false;
    return reportFromDate < reportDateRange.min || reportToDate > reportDateRange.max;
  }, [reportDateRange, reportFromDate, reportToDate]);

  // Clamp initial report dates into the semester-config range once configs load
  useEffect(() => {
    if (!reportDateRange.min || !reportDateRange.max) return;
    setReportFromDate(prev => (prev && prev >= reportDateRange.min ? prev : reportDateRange.min));
    setReportToDate(prev => (prev && prev <= reportDateRange.max ? prev : reportDateRange.max));
  }, [reportDateRange]);

  const taskCount = useMemo(() => tasks.length, [tasks]);

  const todayStr = useMemo(() => new Date().toDateString(), []);
  const reviewedToday = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at).toDateString() === todayStr).length, [tasks, todayStr]);
  const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; }, []);
  const reviewedThisWeek = useMemo(() => tasks.filter(t => t.approved_at && new Date(t.approved_at) >= weekAgo).length, [tasks, weekAgo]);

  const batchOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.batch).filter(Boolean))].sort();
  }, [tasks]);
  const semesterOptions = useMemo(() => {
    return [...new Set(tasks.map(t => t.semester).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [tasks]);

  const resolveForwardedByName = (uid) => {
    if (!uid) return "-";
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || uid;
  };

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const setLabel = formatQPSetDisplay(qp);
    let display = examName;
    if (!display) {
      if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
        display = ciaConfigs[qpaperName].examName;
      } else {
        display = qpaperName;
      }
    }
    return `${display} (${setLabel})`;
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t => {
        const p = parseSubjectField(t.subject);
        const subjCode = p.code || t.subject || '';
        const subjName = p.name || t.subject_name || '';
        return subjCode.toLowerCase().includes(q) ||
          subjName.toLowerCase().includes(q) ||
          (resolveForwardedByName(t.forwarded_by) || "").toLowerCase().includes(q) ||
          (resolveExamDisplay(t) || "").toLowerCase().includes(q);
      });
    }
    if (filterBatch) result = result.filter(t => t.batch === filterBatch);
    if (filterSemester) result = result.filter(t => t.semester === filterSemester);
    return result;
  }, [tasks, searchQuery, filterBatch, filterSemester]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setSelectedQPHodSignature('');
        setFullQPForModal(null);
        return;
      }

      // Full data already in selectedQP (parent doc stores full payload)
      setFullQPForModal({ ...selectedQP });

      // First priority for COs: use saved course_outcomes stored directly on the paper
      const savedCos = selectedQP.course_outcomes || selectedQP.courseOutcomes;
      if (Array.isArray(savedCos) && savedCos.length > 0) {
        setModalCourseOutcomes(savedCos);
      }

      // Try to get/refresh CO descriptions — mirrors QPG's 3-level fallback:
      // 1. course_outcomes collection  2. alt doc ID keys  3. courses (CourseBank)
      const sanitizeKeyStrict = (k) => k ? String(k).replace(/[.#$[\]/ ]/g, '_') : '';
      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const parsedSubj = parseSubjectField(selectedQP.subject);
        const subjCode = parsedSubj.code || selectedQP.subject || '';
        const deptKey = sanitizeKey(selectedQP.department);
        const regKey = sanitizeKey(regulation);
        const subjKey = sanitizeKey(subjCode);
        const ayKey = sanitizeKey(selectedQP.academic_year);
        let fetchedCOs = [];

        // Level 1: primary course_outcomes doc
        try {
          const coDocId = `${deptKey}_${regKey}_${subjKey}_${ayKey}`;
          const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
          if (coSnap.exists()) {
            const data = coSnap.data();
            fetchedCOs = Object.entries(data)
              .filter(([k]) => k.toUpperCase().startsWith('CO'))
              .map(([code, val]) => ({ code: code.toUpperCase(), description: typeof val === 'object' && val !== null ? val.description : val }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
          }
        } catch (e) { /* ignore */ }

        const hasPlaceholder = fetchedCOs.length > 0 && fetchedCOs.every(co => {
          const d = (co.description || '').trim();
          return !d || d.toUpperCase() === co.code.toUpperCase();
        });

        // Level 2: try alternative course_outcomes doc ID keys
        if (fetchedCOs.length === 0 || hasPlaceholder) {
          const altKeys = [
            `${deptKey}_${regKey}_${subjKey}`,
            `${deptKey}_${subjKey}_${ayKey}`,
            `${regKey}_${subjKey}`,
            `${subjKey}`
          ];
          for (const key of altKeys) {
            try {
              const altSnap = await getDoc(doc(db, 'course_outcomes', key));
              if (altSnap.exists()) {
                const altData = altSnap.data();
                const altCOs = Object.entries(altData)
                  .filter(([k]) => k.toUpperCase().startsWith('CO'))
                  .map(([code, val]) => ({ code: code.toUpperCase(), description: typeof val === 'object' && val !== null ? val.description : val }))
                  .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
                if (altCOs.length > 0) { fetchedCOs = altCOs; break; }
              }
            } catch (_) { /* skip */ }
          }
        }

        const hasPlaceholder2 = fetchedCOs.length > 0 && fetchedCOs.every(co => {
          const d = (co.description || '').trim();
          return !d || d.toUpperCase() === co.code.toUpperCase();
        });

        // Level 3: courses collection (CourseBank) — has real CO descriptions
        if (fetchedCOs.length === 0 || hasPlaceholder2) {
          const fbDeptStrict = sanitizeKeyStrict(selectedQP.department);
          const fbSubjStrict = sanitizeKeyStrict(subjCode);
          const fbRegStrict = sanitizeKeyStrict(regulation);
          const courseKeyCandidates = [
            `${progKey}_${fbDeptStrict}_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_${deptKey}_${regKey}_${subjKey}`,
            `${progKey}_${fbDeptStrict}_${regKey}_${fbSubjStrict}`,
            `${progKey}_${deptKey}_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_Overall_${fbRegStrict}_${fbSubjStrict}`,
            `${progKey}_Overall_${regKey}_${subjKey}`,
          ];
          try {
            for (const key of courseKeyCandidates) {
              try {
                const cSnap = await getDoc(doc(db, 'courses', key));
                if (cSnap.exists()) {
                  const bd = cSnap.data();
                  if (bd.co && Array.isArray(bd.co)) {
                    fetchedCOs = bd.co.map(c => ({ code: c.id, description: c.description || '' }))
                      .sort((a, b) => (parseInt(String(a.code || '').replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.code || '').replace(/\D/g, ''), 10) || 0));
                    break;
                  }
                }
              } catch (_) { /* skip invalid keys */ }
            }
          } catch (e) { /* ignore */ }
        }

        // Only overwrite saved COs if fetched COs have REAL descriptions (not just placeholders matching code names)
        if (fetchedCOs.length > 0) {
          const fetchedHasRealDescs = fetchedCOs.some(co => {
            const d = (co.description || '').trim();
            return d && d.toUpperCase() !== co.code.toUpperCase();
          });
          if (fetchedHasRealDescs) {
            setModalCourseOutcomes(fetchedCOs);
          }
        }
      }
      if (selectedQP.forwarded_by) {
        const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
        if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
      }
      setSelectedQPHodSignature(selectedQP.hod_signature_url || '');
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs]);

  const handleRecorrect = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for revoking the paper.", "error");
      return;
    }
    try {
      const now = new Date().toISOString();
      const updates = {
        status: 'recorrected',
        forwarded_to: selectedQP.forwarded_by,
        forwarded_by: null,
        hod_comments: recorrectComments.trim(),
        hod_signature_url: null,
        updated_at: now
      };
      if (selectedQP._isFlatDoc || (selectedQP.id && selectedQP.id.includes('__'))) {
        const docId = selectedQP.compositeKey.includes('__') ? selectedQP.compositeKey : `${selectedQP.compositeKey}__${selectedQP.id}`;
        await setDoc(doc(db, 'generated_qps', docId), updates, { merge: true });
      } else {
        await setDoc(doc(db, 'generated_qps', selectedQP.compositeKey), { [selectedQP.id]: updates }, { merge: true });
      }

      // Notify everyone below the HOD in the chain (Academic Coordinator + Faculty)
      const notifyTargets = [];
      if (selectedQP.ac_approved_by && selectedQP.ac_approved_by !== currentUid) {
        notifyTargets.push({ uid: selectedQP.ac_approved_by, name: selectedQP.ac_approved_by_name || "Academic Coordinator" });
      }
      if (selectedQP.forwarded_by && selectedQP.forwarded_by !== currentUid) {
        notifyTargets.push({ uid: selectedQP.forwarded_by, name: selectedQP.forwarded_by_name || "Faculty" });
      }
      for (const t of notifyTargets) {
        try {
          await addDoc(collection(db, 'notifications'), {
            type: 'qp_revoked',
            targetUid: t.uid,
            targetName: t.name,
            subjectCode: selectedQP.code || selectedQP.subjectCode || '',
            subjectName: selectedQP.name || selectedQP.subjectName || selectedQP.subject || '',
            reason: recorrectComments.trim(),
            revokedBy: hodName || "HOD",
            revokedByUid: currentUid,
            assignedBy: currentUid,
            createdAt: serverTimestamp(),
            read: false
          });
        } catch (err) {
          console.error("Error sending revoke notification:", err);
        }
      }

      showToast("Question paper revoked and sent back to the faculty.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
    } catch (error) {
      console.error("Error revoking paper:", error);
      showToast("Failed to revoke question paper.", "error");
    }
  };

  const handleApproveByHOD = async () => {
    if (!selectedQP) return;
    if (!currentHodSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }
    try {
      const now = new Date().toISOString();
      const updates = {
        status: 'approved_by_hod',
        hod_signature_url: currentHodSignature,
        approved_at: now,
        forwarded_to: null,
        hod_comments: null,
        updated_at: now
      };
      if (selectedQP._isFlatDoc || (selectedQP.id && selectedQP.id.includes('__'))) {
        const docId = selectedQP.compositeKey.includes('__') ? selectedQP.compositeKey : `${selectedQP.compositeKey}__${selectedQP.id}`;
        await setDoc(doc(db, 'generated_qps', docId), updates, { merge: true });
      } else {
        await setDoc(doc(db, 'generated_qps', selectedQP.compositeKey), { [selectedQP.id]: updates }, { merge: true });
      }
      showToast("Question paper approved and forwarded to COE.", "success");
      setShowQPModal(false);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const statsCards = [
    { key: "sectionAllotment", label: "Section Allotment", value: approvedStudentsList.length, icon: Users, color: "amber", onClick: () => setSectionAllotmentPopup({ open: true }) },
    { key: "studentStrength", label: "Student Strength", value: Object.values(batchStrength).reduce((s, b) => s + b.total, 0) || approvedStudentsList.length, icon: GraduationCap, color: "blue", onClick: () => setBatchStrengthModal({ open: true }) },
    { key: "today", label: "Reviewed Today", value: reviewedToday, icon: TrendingUp, color: "emerald" },
    { key: "week", label: "This Week", value: reviewedThisWeek, icon: BarChart3, color: "violet" },
    { key: "total", label: "Total QP Tasks", value: tasks.length + reviewedThisWeek, icon: BookOpen, color: "indigo" },
  ];

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, []);

  // Typeset MathJax whenever the QP review modal opens (math equations stored as math-tex spans)
  useEffect(() => {
    if (!showQPModal || !(fullQPForModal || selectedQP)) return;
    const container = document.querySelector('.qp-print-wrapper');
    typesetMath(container);
  }, [showQPModal, fullQPForModal, selectedQP]);

  return (
    <Layout title="HOD Dashboard">
      {toast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-3 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border ${toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
            }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-white/10">
                  <School size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    {hodLoading ? (
                      <span className="inline-block w-48 h-7 rounded-lg bg-white/10 animate-pulse" />
                    ) : (
                      <>{greeting}, {hodName.split(" ")[0]}</>
                    )}
                  </h1>
                  <p className="text-blue-200 text-sm">{dateStr}</p>
                </div>
              </div>
              <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                {taskCount > 0 ? (
                  <>
                    You have <strong className="text-white font-bold">{taskCount}</strong> question paper{taskCount > 1 ? "s" : ""} awaiting your review.
                  </>
                ) : (
                  "All caught up! No question papers pending your review."
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate("/co_configuration")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <Zap size={16} />
                <span className="hidden sm:inline">CO Config</span>
              </button>
              <button onClick={() => navigate("/qp-generator")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <FileText size={16} />
                <span className="hidden sm:inline">QP Generator</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
          {statsCards.map((s) => {
            const c = colorMap[s.color];
            const Icon = s.icon;
            return (
              <div key={s.key}
                className={`relative bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${s.onClick ? 'cursor-pointer' : ''}`}
                onClick={s.onClick || undefined}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                    <Icon size={20} className={c.text} />
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-300" />
                </div>
                <p className="text-2xl font-bold text-zinc-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
              </div>
            );
          })}
        </div>

        {/* ═══ Tasks & Approvals Grid ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 mt-8">
          
          {/* Column 1: Forwarded Question Papers */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col h-[580px]">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4 shrink-0">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <ClipboardList size={18} className="text-[#120c7a]" />
                Forwarded Question Papers
                {taskCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{taskCount}</span>
                )}
              </h2>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${showFilters ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                <Filter size={12} /> Filters
              </button>
            </div>

            {/* Search Input inside Card */}
            <div className="mb-4 shrink-0">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 focus-within:border-[#120c7a] focus-within:bg-white transition-all shadow-sm">
                <Search size={16} className="text-zinc-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-zinc-400 text-zinc-700"
                  placeholder="Search subject, faculty, or exam..." />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                    <X size={12} className="text-zinc-400" />
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-zinc-100">
                  <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-600 outline-none focus:border-[#120c7a]">
                    <option value="">All Batches</option>
                    {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-600 outline-none focus:border-[#120c7a]">
                    <option value="">All Semesters</option>
                    {semesterOptions.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                  {(filterBatch || filterSemester) && (
                    <button onClick={() => { setFilterBatch(""); setFilterSemester(""); }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1.5">
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable list content */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {tasksLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-zinc-50/50 rounded-2xl border border-zinc-150 p-4 shadow-sm animate-pulse h-28" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full min-h-[250px]">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900">
                    {searchQuery || filterBatch || filterSemester ? "No matching papers" : "All caught up!"}
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">
                    {searchQuery || filterBatch || filterSemester
                      ? "Try adjusting your search query or dropdown filter choices."
                      : "No question papers waiting for your review."}
                  </p>
                </div>
              ) : (
                filteredTasks.map((qp) => {
                  const name = resolveForwardedByName(qp.forwarded_by);
                  const initial = (name || "?").charAt(0).toUpperCase();
                  const examDisplay = resolveExamDisplay(qp);
                  const sentTime = timeAgo(qp.forwarded_at || qp.saved_at);
                  const colorIdx = Math.abs((qp.subject || "").length) % 6;
                  const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
                  const dotColor = dotColors[colorIdx];

                  return (
                    <div key={`${qp.compositeKey}-${qp.id}`}
                      className="group bg-zinc-50/40 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all duration-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-[#120c7a]/15 text-[#120c7a] flex items-center justify-center text-xs font-black shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-zinc-800 truncate">{name}</span>
                              <span className="text-[10px] text-zinc-300">•</span>
                              <span className="text-[10px] text-zinc-400">{sentTime}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-xs font-black text-zinc-800 truncate">{(() => { const p = parseSubjectField(qp.subject); return p.code || qp.subject; })()}</span>
                              {(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })() && (
                                <span className="text-[10px] text-zinc-400 truncate max-w-[130px] font-medium">{(() => { const p = parseSubjectField(qp.subject); return p.name || qp.subject_name; })()}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50/50 text-blue-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-blue-100/40">
                                {examDisplay}
                              </span>
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">
                                {qp.batch || "-"}
                              </span>
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">
                                Sem {qp.semester || "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#120c7a] text-white text-[11px] font-extrabold hover:bg-[#0f0a66] transition-all shadow-sm cursor-pointer">
                          <Eye size={12} /> Review
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Pending Activity Approvals */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col h-[580px]">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4 shrink-0">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Award size={18} className="text-[#120c7a]" />
                Pending Activity Approvals
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                  {pendingActivities.length}
                </span>
              </h2>
            </div>

            {/* Scrollable list content */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {activitiesLoading ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full">
                  <Loader2 className="animate-spin text-zinc-400 mb-2" size={24} />
                  <span className="text-xs text-zinc-400 font-medium">Checking pending activities...</span>
                </div>
              ) : pendingActivities.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-8 text-center flex flex-col justify-center items-center h-full min-h-[250px]">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900">All caught up!</h3>
                  <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">No activities currently waiting for HOD verification.</p>
                </div>
              ) : (
                pendingActivities.map((act) => {
                  const dateParts = (act.date || act.fromDate || "").split('-');
                  const displayDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : (act.date || act.fromDate || "-");
                  return (
                    <div key={act.id} className="bg-zinc-50/40 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all duration-200">
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-800 leading-tight">{act.studentName || act.facultyName || "N/A"}</p>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{act.regNo || act.facultyId || ""}</p>
                        </div>
                        <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-black uppercase tracking-wider shrink-0">
                          {act.activityCode || "STEP"}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-zinc-700 mb-1 leading-normal line-clamp-1">{act.activityName || act.title || "Unnamed Activity"}</p>
                      <p className="text-[10px] text-zinc-400 font-extrabold uppercase">{act.batch} &bull; {act.section || "Sec-A"}</p>

                      <div className="mt-4 flex items-center justify-between border-t border-zinc-150/60 pt-3">
                        <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-1">
                          <Calendar size={11} /> {displayDate}
                        </span>
                        <button
                          onClick={() => {
                            setReviewActivity(act);
                            setReturnComment("");
                            setShowReturnInput(false);
                            setShowActivityModal(true);
                          }}
                          className="px-3 py-1.5 bg-[#120c7a]/15 hover:bg-[#120c7a]/25 text-[#120c7a] rounded-xl text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={12} /> Verify
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ═══ Activity Review Modal ═══ */}
        {showActivityModal && reviewActivity && (
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
              <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Award className="text-yellow-400" size={24} />
                  <div>
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                      Activity Verification Board (HOD Review)
                    </h4>
                    <p className="text-base font-bold truncate mt-0.5">
                      {reviewActivity.studentName || reviewActivity.facultyName} 
                      ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowActivityModal(false); setReviewActivity(null); }} className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                    <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityCode || "STEP"}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Name</span>
                    <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityName || reviewActivity.title}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date</span>
                    <span className="text-sm font-bold text-zinc-700">{reviewActivity.date || reviewActivity.fromDate}</span>
                  </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Claimed</span>
                    <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.points || reviewActivity.totalPoints || "-"} Pts</span>
                  </div>
                    <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                      <span className="text-sm font-bold text-zinc-800">{formatDepartmentDisplay(reviewActivity.department, reviewActivity.programme)} / {formatBatchDisplay(reviewActivity.batch) || reviewActivity.batch} / {reviewActivity.section || "Sec-A"}</span>
                    </div>
                  <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                    <span className="text-xs font-semibold text-zinc-700">
                      {reviewActivity.nbaCriterion ? `NBA: ${reviewActivity.nbaCriterion}` : ""} 
                      {reviewActivity.naacCriterion ? ` | NAAC: ${reviewActivity.naacCriterion}` : ""}
                    </span>
                  </div>
                </div>

                {/* Additional fields based on activity type */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                  {Object.entries(reviewActivity).filter(([k, v]) => 
                    v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName", "submittedById", "submittedByRole", "isStep"].includes(k)
                  ).map(([key, value]) => {
                    if (key === "formData") {
                      if (Array.isArray(value) && value.length > 0) {
                        const basicInfoKeys = new Set(["programme", "department", "batch", "academicYear", "semester", "section", "date", "submittedBy", "month"]);
                        const headers = Object.keys(value[0]).filter(hk => !basicInfoKeys.has(hk));
                        return (
                          <div key={key} className="space-y-2 w-full">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                              Activity Record List
                            </span>
                            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="bg-zinc-50 border-b border-zinc-200">
                                    {headers.map(h => (
                                      <th key={h} className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">
                                        {h.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {value.map((row, rIdx) => (
                                    <tr key={rIdx} className="hover:bg-zinc-50/50">
                                      {headers.map(h => (
                                        <td key={h} className="px-3 py-2 text-zinc-700 font-medium">
                                          {row[h] || "—"}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }

                    if (key === "evidenceFiles") {
                      if (Array.isArray(value) && value.length > 0) {
                        return (
                          <div key={key} className="space-y-2 w-full">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                              Attached Files Info
                            </span>
                            <div className="flex flex-col gap-3">
                              {value.map((file, fIdx) => {
                                const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) || (file.type && file.type.startsWith('image/'));
                                const isPDF = /\.pdf$/i.test(file.name) || (file.type && file.type === 'application/pdf');
                                const hasUrl = !!file.url;
                                return (
                                  <div key={fIdx} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                                      {isImage ? (
                                        <div className="w-6 h-6 rounded bg-purple-50 flex items-center justify-center shrink-0">
                                          <span className="text-[8px] font-bold text-purple-600">IMG</span>
                                        </div>
                                      ) : isPDF ? (
                                        <div className="w-6 h-6 rounded bg-red-50 flex items-center justify-center shrink-0">
                                          <span className="text-[8px] font-bold text-red-600">PDF</span>
                                        </div>
                                      ) : (
                                        <FileText size={14} className="text-blue-500 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[11px] font-semibold text-zinc-700 block truncate">{file.name}</span>
                                        <span className="text-[9px] text-zinc-400">{(file.size / 1024).toFixed(1)} KB</span>
                                      </div>
                                    </div>
                                    {hasUrl && isImage && (
                                      <div className="p-2 bg-zinc-50 flex items-center justify-center">
                                        <img
                                          src={file.url}
                                          alt={file.name}
                                          className="max-h-48 max-w-full object-contain rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                          referrerPolicy="no-referrer"
                                          onClick={() => window.open(file.url, '_blank')}
                                        />
                                      </div>
                                    )}
                                    {hasUrl && isPDF && (
                                      <div className="bg-zinc-50">
                                        <iframe
                                          src={file.url}
                                          className="w-full h-72 rounded-b-lg border-0"
                                          title={file.name}
                                        />
                                      </div>
                                    )}
                                    {!hasUrl && (
                                      <div className="px-3 py-2 bg-zinc-50 text-[9px] text-zinc-400 italic">File not available for preview</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }

                    if (["submittedBy", "month", "academicYear", "semester", "programme"].includes(key)) {
                      return null;
                    }

                    return (
                      <div key={key} className="flex gap-4">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-40 shrink-0">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </span>
                        <span className="text-zinc-700 font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Evidence Review */}
                {reviewActivity.evidenceUrl && (
                  <div>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Evidence</span>
                    <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-2 flex items-center justify-center min-h-60 overflow-hidden shadow-inner">
                      {reviewActivity.evidenceUrl.endsWith('.pdf') ? (
                        <iframe src={reviewActivity.evidenceUrl} className="w-full h-96 rounded-xl" title="Evidence PDF" />
                      ) : (
                        <img src={reviewActivity.evidenceUrl} alt="Evidence" className="max-w-full max-h-96 object-contain rounded-xl shadow-md" referrerPolicy="no-referrer" />
                      )}
                    </div>
                  </div>
                )}

                {/* Return for correction input */}
                {showReturnInput && (
                  <div className="space-y-2 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                    <label className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider">Correction Feedback comments:</label>
                    <textarea
                      rows={3}
                      placeholder="Provide details of corrections required..."
                      value={returnComment}
                      onChange={e => setReturnComment(e.target.value)}
                      className="w-full rounded-xl border border-rose-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowReturnInput(false)} className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-lg cursor-pointer">Cancel</button>
                      <button onClick={() => handleReturnActivity(reviewActivity)} disabled={isActioning} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                        {isActioning ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />} Return for Correction
                      </button>
                    </div>
                  </div>
                )}

                {reviewActivity.comments && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">Previous comments:</span>
                    <p className="text-sm text-blue-700">{reviewActivity.comments}</p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button onClick={() => { setShowActivityModal(false); setReviewActivity(null); }} className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                  Close
                </button>
                {!showReturnInput && (
                  <>
                    <button onClick={() => setShowReturnInput(true)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer">
                      <X size={14} /> Return for Correction
                    </button>
                    <button onClick={() => handleApproveActivity(reviewActivity)} disabled={isActioning} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer">
                      {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                      Approve & Grant Points
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Batch Attendance Report ═══ */}
        <div className="mt-8 bg-white rounded-[2rem] border border-zinc-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg mb-8">
          <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">Batch Attendance Report Generator</h2>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">Department-level Student Analytics</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Row 1 */}
              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Select Batch</label>
                <select 
                  value={reportBatch} 
                  onChange={(e) => { setReportBatch(e.target.value); setReportSection(""); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Batch --</option>
                  {availableReportBatches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Academic Year</label>
                <select 
                  value={reportAcademicYear} 
                  onChange={(e) => { setReportAcademicYear(e.target.value); setReportSemester(""); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  disabled={!reportBatch}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose AY --</option>
                  {availableReportAcademicYears.map(ay => (
                    <option key={ay} value={ay}>{ay}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Semester</label>
                <select 
                  value={reportSemester} 
                  onChange={(e) => { setReportSemester(e.target.value); setSelectedReportSubjects([]); setGeneratedReport(null); }}
                  disabled={!reportAcademicYear}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Semester --</option>
                  {availableReportSemesters.map(sem => (
                    <option key={sem} value={sem}>Semester {sem}</option>
                  ))}
                </select>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Select Section (Optional)</label>
                <select 
                  value={reportSection} 
                  onChange={(e) => { setReportSection(e.target.value); setGeneratedReport(null); }}
                  disabled={!reportBatch}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">All Sections</option>
                  {availableReportSections.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              {/* Row 2 */}
              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Select Subjects</label>
                  {selectedReportSubjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedReportSubjects([]); setGeneratedReport(null); }}
                      className="text-[10px] font-bold text-red-500 hover:underline"
                    >
                      Overall (All Subjects)
                    </button>
                  )}
                </div>
                <select
                  value=""
                  disabled={!reportSemester}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedReportSubjects.includes(val)) {
                      setSelectedReportSubjects(prev => [...prev, val]);
                      setGeneratedReport(null);
                    }
                  }}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 pr-8 text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-[#120c7a]/20 transition-all appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Add Subject --</option>
                  {availableReportSubjects.map(sub => (
                    <option key={sub.code} value={sub.code} disabled={selectedReportSubjects.includes(sub.code)}>
                      {sub.code} - {sub.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedReportSubjects.length === 0 ? (
                    <span className="px-2.5 py-1 bg-white text-zinc-400 text-[10px] font-bold rounded-full border border-zinc-200 uppercase tracking-tighter">
                      Overall (All Subjects)
                    </span>
                  ) : (
                    selectedReportSubjects.map(code => (
                      <span
                        key={code}
                        title={availableReportSubjects.find(s => s.code === code)?.name || code}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-full flex items-center gap-1 border border-blue-100 uppercase tracking-tighter"
                      >
                        {code}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReportSubjects(prev => prev.filter(c => c !== code));
                            setGeneratedReport(null);
                          }}
                          className="hover:text-red-500 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">From Date</label>
                <input 
                  type="date" 
                  value={reportFromDate} 
                  min={reportDateRange.min || undefined}
                  max={reportDateRange.max || undefined}
                  onChange={(e) => { setReportFromDate(e.target.value); setGeneratedReport(null); }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none [color-scheme:light]"
                />
              </div>

              <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-2xl hover:border-blue-300 hover:bg-white transition-all duration-205">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">To Date</label>
                <input 
                  type="date" 
                  value={reportToDate} 
                  min={reportDateRange.min || undefined}
                  max={reportDateRange.max || undefined}
                  onChange={(e) => { setReportToDate(e.target.value); setGeneratedReport(null); }}
                  className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none [color-scheme:light]"
                />
              </div>
            </div>

            {reportDateRange.min && reportDateRange.max && (
              <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-[11px] font-semibold text-blue-700 flex items-center gap-2 flex-wrap">
                <CalendarCheck2 size={14} className="text-blue-500" />
                <span>Academic semester range: <strong>{reportDateRange.min}</strong> to <strong>{reportDateRange.max}</strong>. Report dates must fall within this range.</span>
                {reportDatesOutsideSemester && (
                  <span className="ml-auto inline-flex items-center gap-1 text-rose-600 bg-rose-100/60 px-2.5 py-0.5 rounded-full border border-rose-200/50 text-[10px] font-bold">
                    <AlertCircle size={12} /> Outside Semester Range
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
              <button
                onClick={handleGenerateBatchReport}
                disabled={generatingReport || !reportBatch}
                className="px-6 py-3 bg-[#120c7a] hover:bg-[#0f0a66] text-white text-xs font-extrabold rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98"
              >
                {generatingReport ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing database records...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    <span>Generate Report</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated Report Preview */}
            {generatedReport && (
              <div className="mt-8 border-t border-zinc-200 pt-6 space-y-6">
                
                {/* Visual Analytics Dashboard */}
                {generatedReport.students.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Students</span>
                        <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg"><Users size={14} /></div>
                      </div>
                      <p className="text-2xl font-black text-zinc-800">{generatedReport.students.length}</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Classes Tracked</span>
                        <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg"><Clock size={14} /></div>
                      </div>
                      <p className="text-2xl font-black text-zinc-800">{generatedReport.periods.length}</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Class Average</span>
                        <div className={`p-1.5 rounded-lg ${parseFloat(averageAttendance) >= 75 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}><TrendingUp size={14} /></div>
                      </div>
                      <p className={`text-2xl font-black ${parseFloat(averageAttendance) >= 75 ? "text-emerald-600" : "text-rose-600"}`}>{averageAttendance}%</p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Defaulters (&lt;75%)</span>
                        <div className={`p-1.5 rounded-lg ${countBelow75 > 0 ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-400"}`}><AlertTriangle size={14} /></div>
                      </div>
                      <p className={`text-2xl font-black ${countBelow75 > 0 ? "text-rose-600" : "text-zinc-600"}`}>{countBelow75}</p>
                    </div>
                  </div>
                )}

                {/* Progress bar indicator */}
                {generatedReport.students.length > 0 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-zinc-500 uppercase">Batch Average Attendance Progress</span>
                      <span className="text-xs font-black text-indigo-700">{averageAttendance}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 rounded-full h-3 overflow-hidden shadow-inner">
                      <div 
                        className={`h-full rounded-full bg-gradient-to-r ${parseFloat(averageAttendance) >= 75 ? "from-emerald-400 to-teal-500" : "from-rose-400 to-amber-500"}`}
                        style={{ width: `${averageAttendance}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center flex-wrap gap-4 border-t border-zinc-200 pt-6">
                  <div>
                    <h3 className="text-sm font-black text-zinc-800">
                      Report Preview: {generatedReport.batch} ({generatedReport.section})
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">
                      Range: {generatedReport.fromDate} to {generatedReport.toDate} &middot; {generatedReport.groupedPeriods ? generatedReport.groupedPeriods.length : 0} Days · {generatedReport.periods.length} Periods Found
                      {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 && (
                        <span className="text-indigo-600 font-extrabold"> &middot; Subjects: {generatedReport.selectedSubjects.join(", ")}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleExportCSV}
                      className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-98"
                    >
                      <Download size={14} />
                      <span>Export PDF</span>
                    </button>
                  </div>
                </div>

                {generatedReport.periods.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-50 border border-zinc-100 rounded-2xl">
                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={24} />
                    <h4 className="text-xs font-bold text-zinc-700">No periods found</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">No attendance was marked for this batch in the selected date range.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Premium Search / Table filter input */}
                    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10 transition-all max-w-md shadow-sm">
                      <Search size={16} className="text-zinc-400" />
                      <input 
                        value={reportSearchQuery} 
                        onChange={(e) => setReportSearchQuery(e.target.value)}
                        className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-zinc-400 text-zinc-700"
                        placeholder="Search student by name or register number..." 
                      />
                      {reportSearchQuery && (
                        <button onClick={() => setReportSearchQuery("")} className="p-0.5 rounded-full hover:bg-zinc-200 transition-colors">
                          <X size={14} className="text-zinc-400" />
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-inner bg-zinc-50 max-h-[450px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <>
                          <thead className="bg-zinc-100 border-b border-zinc-200 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider min-w-[100px]">Reg No</th>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider min-w-[150px]">Student Name</th>
                              <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center w-12">Sec</th>
                              {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => (
                                <th key={date} colSpan={periods.length} className={`px-1.5 py-2.5 text-[9px] font-extrabold uppercase text-center border-l-[3px] border-[#120c7a]/60 ${gi % 2 === 1 ? "bg-amber-50/80 text-amber-800" : "bg-sky-50/80 text-sky-800"}`} title={date}>
                                  {date.slice(5).replace('-', '/')}
                                </th>
                              ))}
                              {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? (
                                generatedReport.selectedSubjects.map(code => (
                                  <th key={`sh_${code}`} colSpan={4} className={`px-1.5 py-2.5 text-[9px] font-extrabold uppercase text-center border-l-[3px] border-[#120c7a]/60 bg-indigo-50/80 text-indigo-700`} title={code}>
                                    {code}
                                  </th>
                                ))
                              ) : (
                                <>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-300 min-w-[60px] bg-zinc-150">Total</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">P</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">OD</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-200 min-w-[50px] bg-zinc-150">A</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center border-l border-zinc-300 min-w-[60px] bg-zinc-150">Pct</th>
                                </>
                              )}
                            </tr>
                              <tr className="border-b border-zinc-200 bg-zinc-50/50">
                                <th className="bg-transparent" colSpan={3}></th>
                                {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => periods.map(p => {
                                  const pNum = p.includes('_P') ? p.slice(p.lastIndexOf('_P') + 2) : p;
                                  const info = generatedReport.periodInfo?.[p];
                                  return (
                                    <th key={p} className={`px-1.5 py-1.5 text-[9px] font-extrabold text-zinc-500 uppercase text-center border-l border-zinc-250/60 ${gi % 2 === 1 ? "bg-amber-50/30" : "bg-sky-50/20"}`} title={p}>
                                      <span className="block">P{pNum}</span>
                                      {info && <span className="block text-[8px] text-[#120c7a] font-black mt-0.5 normal-case tracking-normal">({info})</span>}
                                    </th>
                                  );
                                }))}
                                <th className="bg-transparent" colSpan={generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? generatedReport.selectedSubjects.length * 4 : 5}></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-white">
                              {filteredReportStudents.length === 0 ? (
                                <tr>
                                  <td colSpan={3 + generatedReport.periods.length + (generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? generatedReport.selectedSubjects.length * 4 : 5)} className="px-6 py-10 text-center text-xs text-zinc-400 italic font-medium">
                                    No students match your search query.
                                  </td>
                                </tr>
                              ) : (
                                filteredReportStudents.map((student) => (
                                  <tr key={student.reg} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-3 py-2.5 text-xs font-semibold text-zinc-700">{student.reg}</td>
                                    <td className="px-3 py-2.5 text-xs font-bold text-zinc-800">{student.name}</td>
                                    <td className="px-3 py-2.5 text-xs text-zinc-500 text-center">{student.section.replace('Sec-', '')}</td>
                                    {(generatedReport.groupedPeriods || []).map(({ date, periods }, gi) => periods.map(p => {
                                      const val = student.dailyRecords[p];
                                      let cellBg = "";
                                      let cellText = "";
                                      if (val === 'P') { cellBg = "bg-emerald-50 text-emerald-700 border-emerald-100"; cellText = "P"; }
                                      else if (val === 'A') { cellBg = "bg-rose-50 text-rose-700 border-rose-100"; cellText = "A"; }
                                      else if (val === 'OD') { cellBg = "bg-blue-50 text-blue-700 border-blue-100"; cellText = "OD"; }
                                      else { cellBg = "text-zinc-300"; cellText = "—"; }

                                      const isGroupStart = p === periods[0];
                                      const groupBgClass = gi % 2 === 1
                                        ? "bg-amber-50/50"
                                        : "bg-sky-50/40";
                                      const borderClass = isGroupStart && gi > 0
                                        ? "border-l-[3px] border-l-[#120c7a]/60"
                                        : "border-l border-l-zinc-200/50";

                                      return (
                                        <td key={p} className={`px-1 py-1.5 text-center ${groupBgClass} ${borderClass}`}>
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${cellBg} shadow-sm`}>
                                            {cellText}
                                          </span>
                                        </td>
                                      );
                                    }))}
                                    {generatedReport.selectedSubjects && generatedReport.selectedSubjects.length > 0 ? (
                                      generatedReport.selectedSubjects.map(code => {
                                        const st = student.subjectStats?.[code] || { attended: 0, absent: 0, od: 0, total: 0 };
                                        const spct = subjectStatPct(st);
                                        return (
                                          <Fragment key={`sc_${student.reg}_${code}`}>
                                            <td className="px-2 py-2.5 text-xs font-bold text-zinc-800 text-center border-l border-zinc-300 bg-zinc-50">{st.total}</td>
                                            <td className="px-2 py-2.5 text-xs font-bold text-emerald-600 text-center border-l border-zinc-200 bg-zinc-50">{st.attended}</td>
                                            <td className="px-2 py-2.5 text-xs font-bold text-rose-600 text-center border-l border-zinc-200 bg-zinc-50">{st.absent}</td>
                                            <td className={`px-2 py-2.5 text-xs font-black text-center border-l border-zinc-300 bg-zinc-100 ${parseFloat(spct) < 75 ? "text-rose-600" : "text-indigo-700"}`}>
                                              {spct}%
                                            </td>
                                          </Fragment>
                                        );
                                      })
                                    ) : (
                                      <>
                                        <td className="px-3 py-2.5 text-xs font-bold text-zinc-800 text-center border-l border-zinc-300 bg-zinc-50">{student.total}</td>
                                        <td className="px-3 py-2.5 text-xs font-bold text-emerald-600 text-center border-l border-zinc-200 bg-zinc-50">{student.attended}</td>
                                        <td className="px-3 py-2.5 text-xs font-bold text-blue-600 text-center border-l border-zinc-200 bg-zinc-50">{student.od}</td>
                                        <td className="px-3 py-2.5 text-xs font-bold text-rose-600 text-center border-l border-zinc-200 bg-zinc-50">{student.absent}</td>
                                        <td className={`px-3 py-2.5 text-xs font-black text-center border-l border-zinc-300 bg-zinc-100 ${parseFloat(student.percentage) < 75 ? "text-rose-600" : "text-indigo-700"}`}>
                                          {student.percentage}%
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </>
                        </table>
                      </div>
                    </div>
)}
                </div>
              )}
            </div>
          </div>

        {/* ═══ Attendance Overview ═══ */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 px-5 md:px-7 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                <CalendarCheck2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">Attendance Status</h2>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">Current Academic Year</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const semMinDate = semesterConfigs.reduce((min, cfg) => {
                  if (!cfg.startDate) return min;
                  return !min || cfg.startDate < min ? cfg.startDate : min;
                }, null);
                return (
                  <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                    min={semMinDate || undefined}
                    max={new Date().toISOString().split('T')[0]}
                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-white/15 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 [color-scheme:dark]" />
                );
              })()}
              <span className="text-[11px] font-bold text-blue-200 bg-white/10 px-2.5 py-1.5 rounded-lg">
                {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              {attendanceDateOutsideSemester && (
                <span className="text-[10px] font-bold text-rose-300 bg-rose-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-rose-400/30">
                  <AlertCircle size={12} /> Outside Semester Range
                </span>
              )}
              {attendanceOverviewLoading && <RefreshCw size={16} className="text-white/60 animate-spin" />}
              <button onClick={() => navigate("/attendance")}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-xl transition-all backdrop-blur-sm border border-white/20">
                Go to Attendance
              </button>
            </div>
          </div>

          {attendanceOverviewLoading ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-zinc-400 font-medium">Checking attendance records...</p>
            </div>
          ) : attendanceDateIsHoliday ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Calendar size={28} />
              </div>
              <p className="text-lg font-bold text-rose-700">Holiday</p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {attendanceDateEvents.filter(e => e.type === 'Holiday').map(ev => (
                  <span key={ev.id} className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-full border border-rose-200">
                    {ev.title}
                  </span>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mt-2">No classes — Academic Calendar holiday.</p>
            </div>
          ) : attendanceDateIsSunday ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <Calendar size={28} />
              </div>
              <p className="text-lg font-bold text-amber-700">Sunday — Weekly Off</p>
              <p className="text-xs text-zinc-400 mt-2">No classes scheduled on Sundays.</p>
            </div>
          ) : attendanceDateOutsideSemester ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={28} />
              </div>
              <p className="text-lg font-bold text-rose-700">Outside Semester Range</p>
              <p className="text-xs text-zinc-400 mt-2">This date is not within any configured semester period. Attendance cannot be marked.</p>
            </div>
          ) : Object.keys(attendanceWithPeriods).length === 0 ? (
            <div className="p-8 text-center">
              <CalendarCheck2 size={36} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No subject assignments found</p>
              <p className="text-xs text-zinc-300 mt-1">No subjects allocated for your department in the current academic year.</p>
            </div>
          ) : (
            <div>
              <div className="divide-y divide-zinc-100">
                {Object.entries(attendanceWithPeriods).sort().map(([batch, batchData]) => {
                  const { items: rows, section: sec, sem, hasTimetable } = batchData;
                  const totalSubjects = [...new Set(rows.map(r => r.subjectCode))].length;
                  const markedCount = rows.filter(r => r.hasRecord).length;
                  const totalCount = rows.length;
                  const pendingCount = totalCount - markedCount;
                  return (
                    <div key={batch} className="p-5 md:p-6">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <h3 className="text-sm font-black text-zinc-800">{batch}</h3>
                        {sem && <span className="px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-full border border-violet-100">Sem {sem}</span>}
                        {sec && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-bold rounded-full border border-sky-100">{sec}</span>}
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100">{totalSubjects} subjects</span>
                        {markedCount > 0 && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">{markedCount} entered</span>}
                        {pendingCount > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200">{pendingCount} pending</span>}
                        {!hasTimetable && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-200">No timetable</span>}
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">No attendance recorded for {attendanceDate}.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-zinc-100">
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-12">Period</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subject Code</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subject Name</th>
                                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-400">Faculty</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Present</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">Absent</th>
                                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">OD</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {(() => {
                                const periodGroups = {};
                                rows.forEach((row, idx) => {
                                  if (!periodGroups[row.period]) periodGroups[row.period] = [];
                                  periodGroups[row.period].push({ ...row, _idx: idx });
                                });
                                return Object.entries(periodGroups).sort(([a], [b]) => {
                                  if (a === '?') return 1;
                                  if (b === '?') return -1;
                                  return Number(a) - Number(b);
                                }).map(([, group]) => (
                                  group.map((row, gIdx) => (
                                    <tr key={row._idx} className="hover:bg-zinc-50/50 transition-colors">
                                      {gIdx === 0 ? (
                                        <td className={`px-3 py-2.5 text-xs text-center font-black border-b border-zinc-100 ${row.period === '?' ? 'text-amber-500' : 'text-indigo-700'}`} rowSpan={group.length}>{row.period === '?' ? '—' : `P${row.period}`}</td>
                                      ) : null}
                                      <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800">
                                        {row.isEvent ? <span className="text-amber-700">-</span> : row.subjectCode}
                                        {row.isEvent && <span className="ml-1 text-[9px] text-amber-600 font-bold">(Event)</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs max-w-[200px] truncate" title={row.substituteSubjectCode ? `${row.subjectName} (entered under ${row.substituteSubjectCode})` : row.subjectName || ""}>
                                        <span className={row.isEvent ? 'text-amber-600 font-medium' : 'text-zinc-600'}>{row.subjectName || "—"}</span>
                                        {row.substituteSubjectCode && <span className="ml-1 text-[9px] text-amber-600 font-bold italic">(sub: {row.substituteSubjectCode})</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs text-zinc-600 max-w-[160px] truncate" title={row.substituteFaculty ? `${row.facultyName} (sub: ${row.substituteFaculty})` : row.facultyName}>
                                        <span>{row.facultyName}</span>
                                        {row.substituteFaculty && <span className="ml-1 text-[9px] text-amber-600 font-bold italic">(sub: {row.substituteFaculty})</span>}
                                      </td>
                                      {row.hasRecord ? (
                                        <>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — Present`, students: row.presentStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">{row.presentCount}</button>
                                          </td>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — Absent`, students: row.absentStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200 hover:bg-rose-100 transition cursor-pointer">{row.absentCount}</button>
                                          </td>
                                          <td className="px-3 py-2.5 text-xs text-center">
                                            <button onClick={() => setDetailModal({ open: true, title: `P${row.period} — ${row.subjectCode} — OD`, students: row.odStudents.map(([r]) => r) })}
                                              className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200 hover:bg-blue-100 transition cursor-pointer">{row.odCount}</button>
                                          </td>
                                        </>
                                      ) : (
                                        <td className="px-3 py-2.5 text-xs text-center" colSpan={3}>
                                          <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full border border-amber-200">Pending</span>
                                        </td>
                                      )}
                                    </tr>
                                  ))
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Attendance Detail Modal ═══ */}
      {detailModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, title: '', students: [] })}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <h3 className="text-sm font-black text-zinc-800">{detailModal.title}</h3>
              <button onClick={() => setDetailModal({ open: false, title: '', students: [] })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {detailModal.students.length === 0 ? (
                <p className="text-xs text-zinc-400 italic text-center py-4">No students</p>
              ) : (
                <div className="space-y-1.5">
                  {detailModal.students.map((reg, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200">
                      <span className="text-[11px] font-bold text-zinc-700 min-w-[80px]">{studentNamesMap[reg] || reg}</span>
                      {studentNamesMap[reg] && <span className="text-[10px] text-zinc-400">({reg})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 text-right">
              <button onClick={() => setDetailModal({ open: false, title: '', students: [] })} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-700 rounded-xl transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showReportPdfPreview && reportPdfUrl && (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">Batch Attendance Report PDF Preview</h3>
                  <p className="text-xs text-zinc-500">{reportPdfFilename}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (reportPdfDoc) {
                      reportPdfDoc.save(reportPdfFilename);
                    }
                  }}
                  className="inline-flex items-center gap-2 bg-[#120c7a] hover:bg-[#0f0a66] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer"
                >
                  <Download size={16} /> Download PDF
                </button>
                <button
                  onClick={() => {
                    setShowReportPdfPreview(false);
                    URL.revokeObjectURL(reportPdfUrl);
                    setReportPdfUrl("");
                    setReportPdfDoc(null);
                  }}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-zinc-100 p-4 overflow-hidden">
              <iframe src={reportPdfUrl} className="w-full h-full rounded-2xl border border-zinc-200 shadow-inner" title="PDF Preview" />
            </div>
          </div>
        </div>
      )}

      {/* QP Review Modal */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#120c7a]/10 p-2.5 rounded-xl text-[#120c7a]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                  <p className="text-xs text-zinc-500">{(() => { const p = parseSubjectField(selectedQP.subject); return p.code || selectedQP.subject; })()} &middot; {(() => { const p = parseSubjectField(selectedQP.subject); return p.name || selectedQP.subject_name; })()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleApproveByHOD}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <CheckCircle2 size={16} /> Submit to COE
                </button>
                <button onClick={() => setShowRecorrectModal(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                  <Edit2 size={16} /> Revoke
                </button>
                <button onClick={() => setShowQPModal(false)}
                  className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                .qp-print-wrapper .logo-img { max-width: 100%; width: 754px !important; height: 60px !important; object-fit: contain; }
                .qp-print-wrapper p { margin: 0 0 5px 0; }
              `}</style>
              <div className="bg-white shadow-xl mx-auto qp-print-wrapper rounded-xl"
                style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}>
                <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(fullQPForModal || selectedQP) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Allotment Popup */}
      {sectionAllotmentPopup.open && (
        <div className="fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Section Allotment</h3>
                  <p className="text-xs text-zinc-500">
                    {hodDepartment ? `${hodDepartment} department` : ""} &middot; {approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="p-2.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {studentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-zinc-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : approvedStudentsList.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                    <Users size={28} />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-700">No students yet</h4>
                  <p className="text-sm text-zinc-400 mt-1">
                    Students approved by the principal will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">#</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Student Name</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Register No</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Batch</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Section</th>
                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {approvedStudentsList.map((s, i) => {
                        const parts = s.docId.split('_');
                        const progKey = parts[1] || "";
                        const batchKey = parts[0] || "";
                        const configDocId = `${progKey}_${bsKey(hodDepartment)}_${batchKey}`;
                        const cfg = sectionConfigs[configDocId];
                        const numSections = cfg?.numSections || 0;
                        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const sections = Array.from({ length: numSections }, (_, si) => `Sec-${letters[si]}`);
                        const selected = sectionAssignments[`${s.docId}-${s.reg}`] || "";

                        return (
                          <tr key={`${s.docId}-${s.reg}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-zinc-500">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-zinc-900">{s.name}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.reg}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{s.batch}</td>
                            <td className="px-4 py-3">
                              {numSections > 0 ? (
                                <select
                                  value={selected}
                                  onChange={(e) => setSectionAssignments(prev => ({ ...prev, [`${s.docId}-${s.reg}`]: e.target.value }))}
                                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                                >
                                  <option value="">-- Select --</option>
                                  {sections.map(sec => (
                                    <option key={sec} value={sec}>{sec}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-zinc-400 italic">No sections configured</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  const sec = sectionAssignments[`${s.docId}-${s.reg}`];
                                  if (!sec) { showToast("Please select a section", "error"); return; }
                                  setSavingSection(true);
                                  try {
                                    const currentSnap = await getDoc(doc(db, 'approved_admissions', s.docId));
                                    if (!currentSnap.exists()) { showToast("Student doc not found", "error"); setSavingSection(false); return; }
                                    const currentData = currentSnap.data();
                                    const { [s.reg]: studentVal, ...rest } = currentData;
                                    const newOrder = (currentData._order || []).filter(r => r !== s.reg);
                                    await setDoc(doc(db, 'approved_admissions', s.docId), { ...rest, _order: newOrder });

                                    const secDocId = `${s.docId}_${sanitizeKey(sec)}`;
                                    const secSnap = await getDoc(doc(db, 'students', secDocId));
                                    const secData = secSnap.exists() ? secSnap.data() : {};
                                    const secOrder = secData._order || [];
                                    if (!secData[s.reg]) secOrder.push(s.reg);
                                    const joiningAY = currentData._joiningAY || {};
                                    const secJoiningAY = secData._joiningAY || {};
                                    await setDoc(doc(db, 'students', secDocId), {
                                      ...secData,
                                      [s.reg]: studentVal,
                                      _order: secOrder,
                                      _joiningAY: { ...secJoiningAY, [s.reg]: joiningAY[s.reg] || "" }
                                    });

                                    // Write to student_index for dual-ID lookup
                                    const now = new Date().toISOString();
                                    await setDoc(doc(db, 'student_index', s.reg), {
                                      canonicalId: s.reg,
                                      admissionNo: s.reg,
                                      regNo: "",
                                      name: s.name,
                                      studentDocId: secDocId,
                                      batch: s.batch,
                                      _createdAt: now,
                                      _updatedAt: now
                                    });

                                    // Update section-level mapping for bulk lookup in MarkEntry
                                    const sectionIndexRef = doc(db, 'student_section_index', secDocId);
                                    const sectionIndexSnap = await getDoc(sectionIndexRef);
                                    const sectionIndexData = sectionIndexSnap.exists() ? sectionIndexSnap.data() : {};
                                    await setDoc(sectionIndexRef, {
                                      ...sectionIndexData,
                                      [s.reg]: { admissionNo: s.reg, regNo: "", name: s.name },
                                      _updatedAt: now
                                    });

                                    setSectionAssignments(prev => { const n = { ...prev }; delete n[`${s.docId}-${s.reg}`]; return n; });
                                    showToast(`${s.name} assigned to ${sec}`, "success");
                                  } catch (err) {
                                    console.error("Section assignment error:", err);
                                    showToast("Failed to assign section", "error");
                                  } finally {
                                    setSavingSection(false);
                                  }
                                }}
                                disabled={savingSection || !sectionAssignments[`${s.docId}-${s.reg}`]}
                                className="px-3 py-1.5 rounded-lg bg-[#120c7a] text-white text-[11px] font-bold hover:bg-[#0f0a66] transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-zinc-50 px-6 py-3 border-t border-zinc-200 flex justify-between items-center">
              <span className="text-xs text-zinc-400">{approvedStudentsList.length} student{approvedStudentsList.length !== 1 ? "s" : ""} found</span>
              <button onClick={() => { setSectionAllotmentPopup({ open: false }); setSectionAssignments({}); }}
                className="px-4 py-2 rounded-xl bg-zinc-200 text-zinc-700 text-xs font-bold hover:bg-zinc-300 transition-all active:scale-95">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Strength Modal */}
      {batchStrengthModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setBatchStrengthModal({ open: false })}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-800">Student Strength</h3>
                  <p className="text-[11px] text-zinc-500">{hodDepartment}</p>
                </div>
              </div>
              <button onClick={() => setBatchStrengthModal({ open: false })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {batchStrength.length === 0 ? (
                <p className="text-xs text-zinc-400 italic text-center py-8">No student data available</p>
              ) : (
                <div>
                  {/* Total summary */}
                  <div className="text-center mb-5">
                    <p className="text-4xl font-black text-indigo-700">{batchStrength.reduce((s, b) => s + b.total, 0)}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Total Students</p>
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <span className="text-[11px] font-bold text-emerald-600">{batchStrength.reduce((s, b) => s + b.sectionAssigned, 0)} assigned</span>
                      <span className="text-[11px] font-bold text-amber-600">{batchStrength.reduce((s, b) => s + b.approved, 0)} unassigned</span>
                    </div>
                  </div>

                  {/* Chart */}
                  {(() => {
                    const maxVal = Math.max(...batchStrength.map(b => b.total), 1);
                    const MAX_BAR_H = 140;
                    const barColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
                    const borderColors = ['border-indigo-600', 'border-emerald-600', 'border-violet-600', 'border-amber-600', 'border-rose-600', 'border-cyan-600'];
                    return (
                      <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                        <div className="flex items-end justify-around gap-3" style={{ height: `${MAX_BAR_H + 52}px` }}>
                          {batchStrength.map((b, i) => {
                            const barH = Math.max((b.total / maxVal) * MAX_BAR_H, 6);
                            return (
                              <div key={b.batch} className="flex flex-col items-center flex-1 min-w-0">
                                <span className="text-lg font-black text-zinc-800 mb-1">{b.total}</span>
                                <div
                                  className={`w-full max-w-[56px] rounded-t-xl ${barColors[i % barColors.length]} border-b-4 ${borderColors[i % borderColors.length]} shadow-md`}
                                  style={{ height: `${barH}px` }}
                                />
                                <span className="text-[10px] font-bold text-zinc-600 text-center leading-tight mt-2">{b.batch}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 text-right">
              <button onClick={() => setBatchStrengthModal({ open: false })} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-700 rounded-xl transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[190] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Revoke Question Paper</h3>
                  <p className="text-xs text-zinc-500">Send the paper back to the faculty</p>
                </div>
              </div>
              <button onClick={() => setShowRecorrectModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <textarea value={recorrectComments} onChange={(e) => setRecorrectComments(e.target.value)}
                className="w-full h-36 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none text-sm"
                placeholder="Enter your reasons/suggestions for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRecorrect} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                  Revoke Paper
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Pending Attendance Warning Modal for Report Generator */}
      {pendingAttendanceModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[220] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPendingAttendanceModal({ open: false, items: [] })}>
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-rose-100" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-700 via-red-800 to-rose-950 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-sm text-white">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Pending Attendance Found</h3>
                  <p className="text-rose-200 text-[11px] font-semibold">Report generation blocked until attendance is completed for these periods</p>
                </div>
              </div>
              <button 
                onClick={() => setPendingAttendanceModal({ open: false, items: [] })}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2.5">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>There are <strong>{pendingAttendanceModal.items.length} pending period(s)</strong> in the selected date range ({reportFromDate} to {reportToDate}). Please complete these attendance entries first.</span>
              </div>

              <div className="border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-zinc-100/80 sticky top-0 border-b border-zinc-200 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Date & Day</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3">Faculty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150 font-medium text-zinc-700">
                      {pendingAttendanceModal.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-zinc-900">
                            {item.date}
                            <span className="block text-[10px] text-zinc-400 font-normal">{item.day}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-700">
                            Period {item.period}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-zinc-800">{item.subjectCode}</span>
                            <span className="block text-[10px] text-zinc-500 font-normal line-clamp-1">{item.subjectName}</span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-amber-700">
                            {item.facultyName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-500">Total Pending: <strong>{pendingAttendanceModal.items.length}</strong></span>
              <button
                onClick={() => setPendingAttendanceModal({ open: false, items: [] })}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold rounded-xl transition active:scale-95"
              >
                Understood & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
