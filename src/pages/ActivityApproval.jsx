import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Award, Clock, Eye, Download, Search, Filter, Calendar, Users, 
  CheckCircle2, Loader2, BookOpen, Layers, X, FileText, Printer, ArrowRight, AlertCircle
} from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY } from "../data/activityRegistry";
import { formatProgDisplay, formatBatchDisplay, sanitizeKey, formatDepartmentDisplay } from "../lib/utils";
import { 
  getYearSemDisplay, 
  getOrganizedByDisplay, 
  getOutcomeDisplay, 
  getStudentNameDisplay, 
  getRegNoDisplay, 
  getDepartmentDisplay, 
  getBatchDisplay, 
  resolveActivityReportField,
  renderConfiguredOrFallbackTable
} from "../utils/activityReportResolvers";

export default function ActivityApproval() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [userDept, setUserDept] = useState("");
  const [currentUid, setCurrentUid] = useState("");
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProg, setSelectedProg] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedActivityCode, setSelectedActivityCode] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  const [reviewActivity, setReviewActivity] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [reportStatusDoc, setReportStatusDoc] = useState(null);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Load current user details
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            setCurrentUserData(ud);
            setUserRole(ud.role || "");
            const dept = ud.department || ud.assignedDepartment || ud.departmentName || ud.dept || ud.deptName || ud.facultyDepartment || ud.departmentCode || "";
            setUserDept(dept);
            // Auto-filter by HOD's department if present
            if ((ud.role === "HOD" || ud.role === "hod") && dept) {
              setSelectedDept(dept);
            }
          }
        });
      }
    });
    return () => unsub();
  }, []);

  // Real-time approved activities listener
  useEffect(() => {
    setLoading(true);
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      where("status", "==", "Approved")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        list1.push({ id: d.id, ...d.data() });
      });
      combineAndSet();
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      where("status", "==", "Approved")
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const exactCode = data.activityId || data.activityType || data.activityCode || "STEP";
        list2.push({ id: d.id, isStep: true, activityCode: exactCode, ...data });
      });
      combineAndSet();
    }, (err) => console.error("Error loading step_activities:", err));

    const getMillis = (dateObj) => {
      if (!dateObj) return 0;
      if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
      if (typeof dateObj.toDate === 'function') return dateObj.toDate().getTime();
      if (dateObj.seconds) return dateObj.seconds * 1000;
      const parsed = Date.parse(dateObj);
      return isNaN(parsed) ? 0 : parsed;
    };

    const combineAndSet = () => {
      const combined = [...list1, ...list2].sort((a, b) => {
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      setActivities(combined);
      setLoading(false);
    };

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Fetch report status (forwarded to Principal or Approved)
  useEffect(() => {
    if (!selectedDept || !selectedMonth || !selectedYear) {
      setReportStatusDoc(null);
      return;
    }
    const reportId = `report_${sanitizeKey(selectedDept)}_${selectedMonth}_${selectedYear}`;
    const unsub = onSnapshot(doc(db, "monthly_reports", reportId), (snap) => {
      if (snap.exists()) {
        setReportStatusDoc(snap.data());
      } else {
        setReportStatusDoc(null);
      }
    });
    return () => unsub();
  }, [selectedDept, selectedMonth, selectedYear]);

  // Helper to normalize department names for comparison across different storage formats
  const normalizeDept = (d) => (d || '').replace(/[._]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeProg = (p) => (p || '').replace(/[._\s]/g, '').trim().toLowerCase();

  // Derive dropdown options dynamically
  const deptOptions = useMemo(() => {
    const map = new Map();
    const add = (d) => {
      if (!d) return;
      const key = normalizeDept(d);
      if (!map.has(key)) map.set(key, d);
    };
    add(userDept);
    activities.forEach(a => add(a.department));
    return [...map.values()].sort();
  }, [activities, userDept]);
  const batchOptions = useMemo(() => [...new Set(activities.map(a => a.batch).filter(Boolean))].sort(), [activities]);
  const programmeOptions = useMemo(() => [...new Set(activities.map(a => a.programme).filter(Boolean))].sort(), [activities]);
  const sectionOptions = useMemo(() => [...new Set(activities.map(a => a.section).filter(Boolean))].sort(), [activities]);
  const activityCodeOptions = useMemo(() => [...new Set(activities.map(a => a.activityCode).filter(Boolean))].sort(), [activities]);

  // Helper to extract Date object safely from activity
  const getActivityDate = (act) => {
    const raw = act.date || act.fromDate || act.createdAt;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds) return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  // Active Report Config from ActivitySettings
  const [reportConfig, setReportConfig] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "activity_report_config", "settings"), (snap) => {
      if (snap.exists()) {
        setReportConfig(snap.data() || {});
      }
    });
    return () => unsub();
  }, []);

  // Filtered Approved Activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Enabled Activities filter from reportConfig
      if (reportConfig && Array.isArray(reportConfig.enabledActivities)) {
        if (reportConfig.enabledActivities.length === 0) return false;
        const actCode = act.activityCode || act.activityId || act.activityType || "";
        const isEnabled = reportConfig.enabledActivities.some(c => 
          c === actCode || c === act.activityId || c === act.activityType || (act.isStep && c === "STEP")
        );
        if (!isEnabled) return false;
      }

      const isHodRole = userRole === "HOD" || userRole === "hod";
      if (isHodRole && userDept && act.department && normalizeDept(act.department) !== normalizeDept(userDept)) return false;
      if (selectedDept && act.department && normalizeDept(act.department) !== normalizeDept(selectedDept)) return false;

      const matchesBatch = !selectedBatch || act.batch === selectedBatch;
      const matchesProg = !selectedProg || normalizeProg(act.programme) === normalizeProg(selectedProg);
      const matchesSection = !selectedSection || act.section === selectedSection;
      const matchesActivityCode = !selectedActivityCode || act.activityCode === selectedActivityCode;

      const matchesSearch = !searchQuery.trim() || 
        (act.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.facultyName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.submittedBy || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.regNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.activityName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.title || "").toLowerCase().includes(searchQuery.toLowerCase());

      const actDate = getActivityDate(act);

      if (selectedMonth) {
        if (actDate) {
          if ((actDate.getMonth() + 1) !== parseInt(selectedMonth)) return false;
        } else {
          const dateVal = act.date || act.fromDate || "";
          const m = dateVal.split("-")[1];
          if (m && parseInt(m) !== parseInt(selectedMonth)) return false;
        }
      }
      if (selectedYear) {
        if (actDate) {
          if (actDate.getFullYear().toString() !== selectedYear) return false;
        } else {
          const dateVal = act.date || act.fromDate || "";
          const y = dateVal.split("-")[0];
          if (y && y !== selectedYear) return false;
        }
      }

      return matchesBatch && matchesProg && matchesSection && matchesActivityCode && matchesSearch;
    });
  }, [activities, selectedBatch, selectedDept, selectedProg, selectedSection, selectedActivityCode, searchQuery, userRole, userDept, selectedMonth, selectedYear, reportConfig]);

  // Group activities month-wise
  const groupedByMonth = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(act => {
      let mKey = "Unknown Month";
      const dateVal = act.date || act.fromDate;
      if (dateVal) {
        const d = new Date(dateVal + 'T00:00:00');
        if (!isNaN(d)) {
          mKey = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }
      if (!groups[mKey]) groups[mKey] = [];
      groups[mKey].push(act);
    });

    return Object.entries(groups).sort((a, b) => {
      if (a[0] === "Unknown Month") return 1;
      if (b[0] === "Unknown Month") return -1;
      const dateAStr = a[1]?.[0]?.date || a[1]?.[0]?.fromDate || "";
      const dateBStr = b[1]?.[0]?.date || b[1]?.[0]?.fromDate || "";
      if (!dateAStr) return 1;
      if (!dateBStr) return -1;
      const da = new Date(dateAStr + 'T00:00:00');
      const db = new Date(dateBStr + 'T00:00:00');
      return db - da;
    });
  }, [filteredActivities]);

  // Extract images from activity
  const getImages = (act) => {
    const urls = [];
    if (act.evidenceUrl) {
      const isImg = /\.(jpg|jpeg|png|webp|gif)/i.test(act.evidenceUrl) || act.evidenceUrl.includes("alt=media");
      if (isImg && !act.evidenceUrl.endsWith(".pdf")) {
        urls.push({ url: act.evidenceUrl, title: act.activityName || act.title || "Evidence File" });
      }
    }
    if (Array.isArray(act.evidenceFiles)) {
      act.evidenceFiles.forEach(f => {
        if (f.url) {
          const isImg = /\.(jpg|jpeg|png|webp|gif)/i.test(f.url) || f.url.includes("alt=media");
          if (isImg && !f.url.endsWith(".pdf")) {
            urls.push({ url: f.url, title: f.name || "Evidence File" });
          }
        }
      });
    }
    return urls;
  };

  // Helper to expand multi-row form entries (e.g. C5 online courses, C2/C3/C8 multi-row forms)
  const expandActivityRows = (activities) => {
    const result = [];
    (activities || []).forEach((act) => {
      if (act.formData && Array.isArray(act.formData) && act.formData.length > 0) {
        act.formData.forEach((row, idx) => {
          if (typeof row === "object" && row !== null) {
            result.push({
              ...act,
              ...row,
              id: `${act.id}_row_${idx}`,
              facultyName: row.facultyName || act.facultyName || act.submittedBy || "-",
              studentName: row.studentName || act.studentName || act.submittedBy || "-",
              courseName: row.courseName || row.courseTitle || row.title || row.nameOfCourse || row.name || act.courseName || act.courseTitle || act.title,
              platform: row.platform || row.university || row.organisation || row.platformUniversity || act.platform || act.university,
              weeks: row.weeks || row.durationWeeks || row.duration || act.weeks || act.duration,
              startDate: row.startDate || row.fromDate || act.startDate || act.fromDate,
              endDate: row.endDate || row.toDate || act.endDate || act.toDate,
              grade: row.grade !== undefined && row.grade !== "" ? row.grade : (row.score !== undefined ? row.score : act.grade),
              status: row.status || act.status,
              relevance: row.relevance || act.relevance,
            });
          }
        });
      } else if (act.formData && typeof act.formData === "object" && !Array.isArray(act.formData)) {
        result.push({
          ...act,
          ...act.formData,
          facultyName: act.formData.facultyName || act.facultyName || act.submittedBy || "-",
          studentName: act.formData.studentName || act.studentName || act.submittedBy || "-",
          courseName: act.formData.courseName || act.formData.courseTitle || act.formData.title || act.formData.nameOfCourse || act.formData.name || act.courseName || act.courseTitle || act.title,
          platform: act.formData.platform || act.formData.university || act.formData.organisation || act.platform || act.university,
          weeks: act.formData.weeks || act.formData.durationWeeks || act.formData.duration || act.weeks || act.duration,
          startDate: act.formData.startDate || act.formData.fromDate || act.startDate || act.fromDate,
          endDate: act.formData.endDate || act.formData.toDate || act.endDate || act.toDate,
          grade: act.formData.grade !== undefined && act.formData.grade !== "" ? act.formData.grade : (act.formData.score !== undefined ? act.formData.score : act.grade),
          status: act.formData.status || act.status,
          relevance: act.formData.relevance || act.relevance,
        });
      } else {
        result.push(act);
      }
    });
    return result;
  };

  const [customActivitiesMap, setCustomActivitiesMap] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "custom_activities"), (snap) => {
      const map = {};
      snap.forEach(d => { map[d.id] = { code: d.id, ...d.data() }; });
      setCustomActivitiesMap(map);
    });
    return () => unsub();
  }, []);

  // Sections for A4 compiled document report
  const partA_GuestLectures = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B9" || (a.isStep && a.category === "industry"))), [filteredActivities]);
  const partA_Association = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && a.category === "leadership")), [filteredActivities]);
  const partA_Internships = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && (a.category === "industry" || (a.activityName || "").toLowerCase().includes("internship")))), [filteredActivities]);
  const partA_OnlineCourses = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && a.category === "onlineCourse")), [filteredActivities]);
  const partA_PaperPresentations = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("present") || (a.activityType || "").toLowerCase().includes("present"))))), [filteredActivities]);
  const partA_Publications = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("publ") || (a.activityType || "").toLowerCase().includes("publ"))))), [filteredActivities]);
  const partA_Conferences = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && a.category === "technical")), [filteredActivities]);
  const partA_ExtraCurricular = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && (a.category === "sports" || a.category === "social"))), [filteredActivities]);
  const partA_Placements = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.isStep && a.category === "placement")), [filteredActivities]);

  const partB_Meetings = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B1")), [filteredActivities]);
  const partB_Advisory = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B2")), [filteredActivities]);
  const partB_Purchases = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B3")), [filteredActivities]);
  const partB_Mous = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B4")), [filteredActivities]);
  const partB_Parents = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B5")), [filteredActivities]);
  const partB_Audits = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B7")), [filteredActivities]);
  const partB_Newsletters = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B8")), [filteredActivities]);

  const partC_Phd = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C1")), [filteredActivities]);
  const partC_Publications = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C2")), [filteredActivities]);
  const partC_Attended = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C3")), [filteredActivities]);
  const partC_Organized = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C4")), [filteredActivities]);
  const partC_Online = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C5")), [filteredActivities]);
  const partC_Funding = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C6")), [filteredActivities]);
  const partC_Patents = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C7")), [filteredActivities]);
  const partC_Contributions = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C8")), [filteredActivities]);
  const partC_Achievements = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C9")), [filteredActivities]);
  const partB_Budget = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "B6")), [filteredActivities]);
  const partC_Mentoring = useMemo(() => expandActivityRows(filteredActivities.filter(a => a.activityCode === "C10")), [filteredActivities]);
  const getEffectiveCategory = (a) => {
    const code = a.activityCode || "";
    if (customActivitiesMap[code]?.category) return (customActivitiesMap[code].category || "").toLowerCase();
    return (a.category || "").toLowerCase();
  };
  const getEffectivePart = (a) => {
    const code = a.activityCode || "";
    if (customActivitiesMap[code]?.part) return (customActivitiesMap[code].part || "").toUpperCase();
    return (a.part || "").toUpperCase();
  };
  const KNOWN_DEPT_CODES = new Set(["B1","B2","B3","B4","B5","B6","B7","B8"]);
  const KNOWN_FACULTY_CODES = new Set(["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10"]);
  const customDeptGroups = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(a => {
      if (a.isStep) return;
      const code = a.activityCode || "";
      if (KNOWN_DEPT_CODES.has(code)) return;
      const cat = getEffectiveCategory(a);
      const part = getEffectivePart(a);
      if (!(cat === "department" || part === "B")) return;
      if (!groups[code]) groups[code] = { code, name: a.activityName || customActivitiesMap[code]?.name || code, items: [] };
      groups[code].items.push(a);
    });
    const result = {};
    Object.keys(groups).forEach(code => { result[code] = { ...groups[code], items: expandActivityRows(groups[code].items) }; });
    return result;
  }, [filteredActivities, customActivitiesMap]);
  const customFacultyGroups = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(a => {
      if (a.isStep) return;
      const code = a.activityCode || "";
      if (KNOWN_FACULTY_CODES.has(code)) return;
      const cat = getEffectiveCategory(a);
      const part = getEffectivePart(a);
      if (!(cat === "faculty" || part === "C")) return;
      if (!groups[code]) groups[code] = { code, name: a.activityName || customActivitiesMap[code]?.name || code, items: [] };
      groups[code].items.push(a);
    });
    const result = {};
    Object.keys(groups).forEach(code => { result[code] = { ...groups[code], items: expandActivityRows(groups[code].items) }; });
    return result;
  }, [filteredActivities, customActivitiesMap]);
  const customStudentGroups = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(a => {
      if (a.isStep) return;
      const code = a.activityCode || "";
      if (code.startsWith("B") || code.startsWith("C")) return;
      const cat = getEffectiveCategory(a);
      const part = getEffectivePart(a);
      if (!(cat === "student" || part === "A")) return;
      if (!groups[code]) groups[code] = { code, name: a.activityName || customActivitiesMap[code]?.name || code, items: [] };
      groups[code].items.push(a);
    });
    const result = {};
    Object.keys(groups).forEach(code => { result[code] = { ...groups[code], items: expandActivityRows(groups[code].items) }; });
    return result;
  }, [filteredActivities, customActivitiesMap]);
  const customGenericGroups = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(a => {
      if (a.isStep) return;
      const code = a.activityCode || "";
      if (KNOWN_DEPT_CODES.has(code) || KNOWN_FACULTY_CODES.has(code)) return;
      const cat = getEffectiveCategory(a);
      const part = getEffectivePart(a);
      if (["student","department","faculty"].includes(cat)) return;
      if (["A","B","C"].includes(part)) return;
      if (!groups[code]) groups[code] = { code, name: a.activityName || customActivitiesMap[code]?.name || code, category: a.category || customActivitiesMap[code]?.category || "custom", items: [] };
      groups[code].items.push(a);
    });
    const result = {};
    Object.keys(groups).forEach(code => { result[code] = { ...groups[code], items: expandActivityRows(groups[code].items) }; });
    return result;
  }, [filteredActivities, customActivitiesMap]);

  const allReportImages = useMemo(() => {
    const imagesList = [];
    filteredActivities.forEach(act => {
      const imgs = getImages(act);
      imgs.forEach(i => imagesList.push(i));
    });
    return imagesList;
  }, [filteredActivities]);

  const handleForwardToPrincipal = async () => {
    if (!selectedDept || !selectedMonth || !selectedYear) return;
    setIsForwarding(true);
    const reportId = `report_${sanitizeKey(selectedDept)}_${selectedMonth}_${selectedYear}`;
    try {
      await setDoc(doc(db, "monthly_reports", reportId), {
        id: reportId,
        department: selectedDept,
        month: selectedMonth,
        monthName: months[parseInt(selectedMonth) - 1],
        year: selectedYear,
        status: "Principal_Pending",
        submittedBy: currentUid,
        submittedByName: currentUserData?.facultyName || "HOD",
        submittedAt: new Date().toISOString(),
        comments: ""
      }, { merge: true });
      alert("Monthly Report successfully forwarded to Principal for approval!");
    } catch (err) {
      console.error("Error forwarding monthly report:", err);
      alert("Failed to forward report. Please try again.");
    } finally {
      setIsForwarding(false);
    }
  };

  // Helper to render section photo galleries directly under tables
  const renderSectionGallery = (activitiesArray, captionLabel) => {
    const images = [];
    activitiesArray.forEach(act => {
      getImages(act).forEach(img => {
        images.push(img);
      });
    });
    if (images.length === 0) return null;
    return (
      <div className="mt-4 border border-zinc-900 p-4 bg-white page-break-inside-avoid text-center">
        <div className="grid grid-cols-2 gap-6 justify-center items-center">
          {images.map((img, i) => (
            <div key={i} className="flex flex-col items-center justify-center p-2 bg-zinc-50 border border-zinc-200 rounded">
              <img 
                src={img.url} 
                alt={img.title} 
                className="max-h-48 max-w-full object-contain border border-zinc-300 shadow-sm"
                referrerPolicy="no-referrer"
              />
              <span className="text-[9px] font-sans text-zinc-500 text-center mt-1 uppercase tracking-wide">
                {img.title}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-bold text-red-600 uppercase mt-3 tracking-wider text-center font-serif">
          {captionLabel}
        </p>
      </div>
    );
  };

  return (
    <Layout title="Activity Approval">
      <style>{`
        @media print {
          /* Hide default browser headers/footers */
          @page {
            size: A4;
            margin: 0;
          }
          /* Hide all screen-only/non-essential elements */
          .no-print, header, nav, aside, footer, button, .action-bar {
            display: none !important;
          }
          /* Clean up root, body, and all parent wrapper divs */
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          /* Ensure all parent wraps are invisible */
          #root, main, .min-h-screen, .flex, .py-8, .px-4, .max-w-7xl, .space-y-6, div {
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: none !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Clean flat print sheet with standard professional 20mm document padding */
          .print-container {
            display: block !important;
            background: white !important;
            padding: 20mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          table {
            page-break-inside: auto;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          img {
            max-height: 250px !important;
            page-break-inside: avoid !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }

        /* Professional document stylesheet overrides */
        .print-container {
          font-family: 'Times New Roman', Times, serif !important;
          font-size: 10px !important;
          color: #111 !important;
          line-height: 1.4 !important;
        }
        .print-container h2 {
          font-size: 13px !important;
          font-weight: bold !important;
        }
        .print-container h3 {
          font-size: 11px !important;
          font-weight: bold !important;
        }
        .print-container h4 {
          font-size: 10px !important;
          font-weight: bold !important;
        }
        .print-container table {
          font-size: 8.5px !important;
        }
        .print-container table th {
          font-size: 8.5px !important;
          font-weight: bold !important;
          padding: 4px 6px !important;
          background-color: #fafafa !important;
        }
        .print-container table td {
          font-size: 8.5px !important;
          padding: 4px 6px !important;
        }
        .print-container p {
          font-size: 9px !important;
          line-height: 1.4 !important;
        }
        .print-container span {
          font-size: 8px !important;
        }
      `}</style>

      <div className="p-4 md:p-8 w-full space-y-6">
        
        {!previewMode ? (
          <>
            {/* Header Block */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 shadow-xl text-white mb-8 relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 bottom-0 translate-y-12 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-blue-200">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Verified Accomplishments
                  </div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">Activity Approval</h1>
                  <p className="text-sm text-blue-200 font-medium max-w-xl">
                    Comprehensive log of all approved student and faculty activities verified by HOD, segmented month-wise.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-center shrink-0 min-w-32">
                    <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest block">Approved Total</span>
                    <span className="text-3xl font-black block mt-1">{filteredActivities.length}</span>
                  </div>
                  {selectedMonth && selectedDept && (
                    <button
                      onClick={() => setPreviewMode(true)}
                      className="px-5 py-3 bg-white text-[#120c7a] rounded-2xl text-xs font-black shadow-lg hover:bg-zinc-50 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Printer size={14} /> Document Preview
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filters Panel */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Filter size={18} className="text-[#120c7a]" />
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Filter Verified Submissions</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Search Query</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-3.5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search name, register number, or title..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-4 py-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Program</label>
                  <select value={selectedProg} onChange={e => setSelectedProg(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Programs</option>
                    {programmeOptions.map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
                  <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={userRole === "HOD" && userDept}>
                    <option value="">All Departments</option>
                    {deptOptions.map(d => <option key={d} value={d}>{formatDepartmentDisplay(d)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Month</label>
                  <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Months</option>
                    {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Year</label>
                  <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* List View */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-base font-extrabold text-zinc-800">Verified Activity Log List</h3>
                <p className="text-xs text-zinc-400 font-medium">Click view on any record to inspect uploader logs and attached certificates.</p>
              </div>

              {loading ? (
                <div className="p-16 text-center">
                  <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
                  <p className="text-sm font-semibold text-zinc-600">Loading approved activity registry...</p>
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="p-16 text-center text-zinc-400">
                  <Clock size={36} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-sm font-semibold text-zinc-600">No approved activity records found matching filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Submitted By</th>
                        <th className="p-4">Department / Batch</th>
                        <th className="p-4">Activity Name</th>
                        <th className="p-4 text-center">Date</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Points</th>
                        <th className="p-4 text-center">NBA/NAAC</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium">
                      {groupedByMonth.map(([monthName, activitiesList]) => (
                        <React.Fragment key={monthName}>
                          <tr className="bg-zinc-50 border-y border-zinc-100">
                            <td colSpan={8} className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                  <Calendar size={13} className="text-[#120c7a]" />
                                  {monthName}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[9px] bg-zinc-200 text-zinc-700 px-2.5 py-0.5 rounded-full font-bold">
                                    {activitiesList.length} approved
                                  </span>
                                  <button
                                    onClick={() => {
                                      const [mName, yStr] = monthName.split(" ");
                                      const mIndex = months.indexOf(mName) + 1;
                                      setSelectedMonth(String(mIndex));
                                      setSelectedYear(yStr);
                                      setPreviewMode(true);
                                    }}
                                    className="px-3.5 py-1.5 bg-[#120c7a] text-white hover:bg-blue-900 rounded-xl text-[10px] font-black tracking-wide shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye size={11} /> View & Approve Report
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {activitiesList.map((act) => {
                            const registry = ACTIVITY_REGISTRY.find(r => r.code === act.activityCode);
                            return (
                              <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="p-4">
                                  <p className="font-bold text-zinc-800">{act.studentName || act.facultyName || act.submittedBy || "N/A"}</p>
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{act.regNo || act.facultyId || ""}</p>
                                </td>
                                <td className="p-4">
                                  <p className="font-bold text-zinc-700">{formatDepartmentDisplay(act.department, act.programme)}</p>
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase">{act.batch} • {act.section || "Sec-A"}</p>
                                </td>
                                <td className="p-4 max-w-xs md:max-w-sm">
                                  <p className="font-bold text-zinc-800 truncate">{act.activityName || act.title || registry?.name || "Unnamed Activity"}</p>
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                                    {act.activityCode}
                                  </span>
                                </td>
                                <td className="p-4 text-center font-bold text-zinc-700">{act.date || act.fromDate || "-"}</td>
                                <td className="p-4 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                                    Approved
                                  </span>
                                </td>
                                <td className="p-4 text-center font-extrabold text-[#120c7a]">{act.points || act.totalPoints || "-"}</td>
                                <td className="p-4 text-center text-[10px] font-bold">
                                  {registry?.nbaCriterion && <div className="text-blue-700">NBA: {registry.nbaCriterion}</div>}
                                  {registry?.naacCriterion && <div className="text-emerald-700">NAAC: {registry.naacCriterion}</div>}
                                </td>
                                <td className="p-4 text-center">
                                  <button
                                    onClick={() => setReviewActivity(act)}
                                    className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye size={12} /> View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Report Preview Mode with Forward to Principal Workflow */
          <div className="space-y-6">
            
            {/* Status bar */}
            <div className="no-print">
              {reportStatusDoc?.status === "Approved" ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>This Monthly Report has been approved and signed by the Principal! (Approved on {new Date(reportStatusDoc.approvedAt).toLocaleDateString()})</span>
                </div>
              ) : reportStatusDoc?.status === "Principal_Pending" ? (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <Clock size={16} className="text-amber-600 shrink-0 animate-pulse" />
                  <span>This Monthly Report is currently forwarded to the Principal and is pending approval.</span>
                </div>
              ) : reportStatusDoc?.status === "Returned" ? (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex flex-col gap-1.5 text-xs shadow-sm">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                    <span>Report Returned for Correction:</span>
                  </div>
                  <p className="pl-6 font-semibold italic text-rose-700">Comments: "{reportStatusDoc.comments}"</p>
                </div>
              ) : (
                <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <AlertCircle size={16} className="text-zinc-500 shrink-0" />
                  <span>Report Draft: This compiled report has not been forwarded to the Principal yet.</span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl flex justify-between items-center no-print">
              <button
                onClick={() => setPreviewMode(false)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <X size={14} /> Back to List
              </button>

              <div className="flex items-center gap-3">
                {(!reportStatusDoc || reportStatusDoc.status === "Returned") && (
                  <button
                    onClick={handleForwardToPrincipal}
                    disabled={isForwarding}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-xl text-xs font-black shadow-md hover:from-blue-800 hover:to-indigo-900 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isForwarding ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    Forward to Principal
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-zinc-800 text-white rounded-xl text-xs font-black shadow-md hover:bg-zinc-900 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} /> Print/Download PDF
                </button>
              </div>
            </div>

            {/* Document sheet */}
            <div className="bg-white shadow-xl border border-zinc-200 p-12 rounded-3xl max-w-4xl mx-auto print-container font-serif text-zinc-950 leading-relaxed space-y-6">
                           {/* Document Header */}
              <div className="flex justify-center mb-6">
                <img 
                  src="/logo.png" 
                  alt="CK College of Engineering & Technology Logo" 
                  className="max-h-24 w-auto object-contain"
                />
              </div>

              <div className="text-center space-y-1 mb-6">
                <h3 className="text-md font-bold text-zinc-800 font-serif uppercase tracking-wide">
                  Department of {selectedDept ? selectedDept : "Electrical and Electronics Engineering"}
                </h3>
                <h4 className="text-xs font-black text-zinc-950 tracking-wider uppercase">
                  MONTHLY REPORT FOR THE MONTH OF {months[parseInt(selectedMonth) - 1]?.toUpperCase()} - {selectedYear}
                </h4>
              </div>

              {/* Part A Title */}
              <div className="text-center mb-6">
                <h3 className="text-sm font-bold underline font-serif uppercase tracking-wide">
                  Part A: Activities related to the Students
                </h3>
              </div>

              <div className="space-y-6">
                
                {/* 1. Guest Lectures */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    1. Industry Oriented Guest Lecture Organized: {partA_GuestLectures.length === 0 ? "Nil" : ""}
                  </h4>
                  <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                    <thead>
                      <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">S.No</th>
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">Year/Sem</th>
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">Date & Time</th>
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">No of Student</th>
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">Name of the Program / Internship</th>
                        <th className="border border-zinc-900 p-2 text-[9px] font-extrabold uppercase">Resource Person</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partA_GuestLectures.length === 0 ? (
                        <tr className="text-center">
                          <td className="border border-zinc-900 p-2">-</td>
                          <td className="border border-zinc-900 p-2">-</td>
                          <td className="border border-zinc-900 p-2">-</td>
                          <td className="border border-zinc-900 p-2">-</td>
                          <td className="border border-zinc-900 p-2 font-bold">Nil</td>
                          <td className="border border-zinc-900 p-2">-</td>
                        </tr>
                      ) : (
                        partA_GuestLectures.map((act, index) => (
                          <tr key={act.id} className="text-center">
                            <td className="border border-zinc-900 p-2">{index + 1}</td>
                            <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                            <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "-"}</td>
                            <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left">{act.resourcePerson || act.speaker || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {renderSectionGallery(partA_GuestLectures, "Illustration of Industry Oriented Guest Lecture")}
                </div>

                {/* 2. Students Association Activities */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    2. Students Association Activities: {partA_Association.length === 0 ? "Nil" : ""}
                  </h4>
                  {partA_Association.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date & Time</th>
                            <th className="border border-zinc-900 p-2 uppercase">No of Student</th>
                            <th className="border border-zinc-900 p-2 uppercase">Name of the Event</th>
                            <th className="border border-zinc-900 p-2 uppercase">Resource Person</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_Association.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.resourcePerson || act.speaker || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_Association, "Illustration of Students Association Activities")}
                    </div>
                  )}
                </div>

                {/* 3. Industrial Practical Knowledge Training */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    3. Industrial Practical Knowledge Training: {partA_Internships.length === 0 ? "Nil" : ""}
                  </h4>
                  {partA_Internships.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date & Time</th>
                            <th className="border border-zinc-900 p-2 uppercase">No of Student</th>
                            <th className="border border-zinc-900 p-2 uppercase">Company/Industry Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Type of Training</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_Internships.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.resourcePerson || act.speaker || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_Internships, "Illustration of Industrial Practical Knowledge Training")}
                    </div>
                  )}
                </div>

                {/* 4. Work Along Program: Internship Program */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    4. Work Along Program: Internship Program: {partA_Internships.length === 0 ? "Nil" : ""}
                  </h4>
                </div>

                {/* 5. Value Added Course Organized */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    5. Value Added Course Organized: {partA_OnlineCourses.length === 0 ? "Nil" : ""}
                  </h4>
                </div>

                {/* 6. Co-curricular Activities */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    6. Co-curricular Activities:
                  </h4>
                  {partA_OnlineCourses.length === 0 ? (
                    <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                  ) : (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>S. No.</th>
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>Year / Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>No of Student Registered</th>
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>Title of the On-line Course</th>
                            <th className="border border-zinc-900 p-2 uppercase" colSpan={2}>Duration</th>
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>University</th>
                            <th className="border border-zinc-900 p-2 uppercase" rowSpan={2}>Status of the Online Course</th>
                          </tr>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-1 uppercase">Start date</th>
                            <th className="border border-zinc-900 p-1 uppercase">End date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_OnlineCourses.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "1"}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.courseTitle || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.toDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.university || act.platform || "NPTEL"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.courseStatus || "Going On"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_OnlineCourses, "Photo Gallery for Online Course Accomplishments")}
                    </div>
                  )}
                </div>

                {/* 7. a) Paper presented / Project presented / Spot Events */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    7. a) Paper presented / Project presented / Spot Events:
                  </h4>
                  {partA_PaperPresentations.length === 0 ? (
                    <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                  ) : (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Name of the Students</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/ Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">Program Organized By</th>
                            <th className="border border-zinc-900 p-2 uppercase">Name of the Event</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Prize/ Participated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_PaperPresentations.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left whitespace-pre-line">
                                {act.studentName || act.studentNames || act.facultyName || act.submittedBy || "-"}
                              </td>
                              <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.organizedBy || act.venue || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.prize || act.participationType || "Participated"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_PaperPresentations, "Photo Gallery for Event Participation")}
                    </div>
                  )}
                </div>

                {/* b) Student Publications (Conference & Journals) */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    b) Student Publications (Conference & Journals): {partA_Publications.length === 0 ? "Nil" : ""}
                  </h4>
                </div>

                {/* 8. Students Conferences / Seminars/Work shop/Symposium etc., Participated */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    8. Students Conferences / Seminars/Work shop/Symposium etc., Participated:
                  </h4>
                  {partA_Conferences.length === 0 ? (
                    <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                  ) : (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S. NO</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/ Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">Title of the Program</th>
                            <th className="border border-zinc-900 p-2 uppercase">Organized by / Resource Person</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Knowledge gained/Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_Conferences.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2">{getYearSemDisplay(act)}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{getOrganizedByDisplay(act)}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{getOutcomeDisplay(act)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_Conferences, "PHOTO GALLERY FOR THE TECHNICAL EXHIBITION")}
                    </div>
                  )}
                </div>

                {/* 9. Extra-Curricular activities: (Sports/NSS/NCC & others) */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    9. Extra-Curricular activities: (Sports/NSS/NCC & others):
                  </h4>
                  {partA_ExtraCurricular.length === 0 ? (
                    <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                  ) : (
                    <div className="space-y-4">
                      <div className="font-bold font-serif text-[10px] underline">(i) Sports, NSS & Social Outreach Competitions</div>
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Game/Event</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Venue</th>
                            <th className="border border-zinc-900 p-2 uppercase">No. of Students participated</th>
                            <th className="border border-zinc-900 p-2 uppercase">Prize details</th>
                            <th className="border border-zinc-900 p-2 uppercase">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_ExtraCurricular.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.eventName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.venue || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.prize || act.participationType || "Participated"}</td>
                              <td className="border border-zinc-900 p-2">{act.remarks || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partA_ExtraCurricular, "Photo Gallery for Event Participation")}
                    </div>
                  )}
                </div>

                {/* 10. Placement Details */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    10. Placement Details: {partA_Placements.length === 0 ? "Nil" : ""}
                  </h4>
                  {partA_Placements.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Student Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Company Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Designation</th>
                            <th className="border border-zinc-900 p-2 uppercase">Salary Package (LPA)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date of Offer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partA_Placements.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.studentName || act.studentNames || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.companyName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.designation || act.jobTitle || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.ctc || act.package || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || act.offerDate || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                       {renderSectionGallery(partA_Placements, "Photo Gallery for Placement Offers")}
                    </div>
                  )}
                </div>

                {/* Dynamic Custom Student Activities - always show heading even when Nil */}
                {(() => {
                  const sDefs = Object.values(customActivitiesMap).filter(d => (d.category||"").toLowerCase()==="student");
                  const allCodes = new Set([...sDefs.map(d=>d.code), ...Object.keys(customStudentGroups)]);
                  return Array.from(allCodes).map(code => {
                    const def = customActivitiesMap[code];
                    const group = customStudentGroups[code] || { code, name: def?.name || code, items: [] };
                    const displayName = def?.name || group.name;
                    return (
                  <div key={code}>
                    <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                      {code}: {displayName} {group.items.length===0?": NIL":`(${group.items.length})`}
                    </h4>
                    {group.items.length === 0 ? (
                      <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                    ) : (
                    <div className="space-y-2">
                    <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                          <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                          <th className="border border-zinc-900 p-2 uppercase">Date</th>
                          <th className="border border-zinc-900 p-2 uppercase">Title / Details</th>
                          <th className="border border-zinc-900 p-2 uppercase">Submitted By</th>
                          <th className="border border-zinc-900 p-2 uppercase">Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((act, idx) => (
                          <tr key={act.id} className="text-center">
                            <td className="border border-zinc-900 p-2">{idx + 1}</td>
                            <td className="border border-zinc-900 p-2">{act.date || act.fromDate || act.startDate || "-"}</td>
                            <td className="border border-zinc-900 p-2 font-bold text-left">{act.title || act.activityName || act.courseName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left">{act.submittedBy || act.studentName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left text-[9px]">{act.description || act.details || act.remarks || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {renderSectionGallery(group.items, `Gallery for ${displayName}`)}
                    </div>
                    )}
                  </div>
                    );
                  });
                })()}

              </div>

              {/* PART B */}
              <div className="space-y-6 pt-6 border-t border-zinc-300">
                <div className="text-center mb-6">
                  <h3 className="text-sm font-bold underline font-serif uppercase tracking-wide">
                    Part B: Details of Department Level Activities
                  </h3>
                </div>

                {/* B.1 Class Committee Meetings */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    1. Class Committee Meetings: {partB_Meetings.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Meetings.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Meeting No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Chairman</th>
                            <th className="border border-zinc-900 p-2 uppercase">Agenda</th>
                            <th className="border border-zinc-900 p-2 uppercase">Decisions / Action Taken</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Meetings.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-mono">{act.meetingNo || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.chairman || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.agenda || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left font-bold">{act.decisions || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Meetings, "Photo Gallery for Class Committee Meetings")}
                    </div>
                  )}
                </div>

                {/* B.2 Advisory Board Meetings */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    2. Department Advisory Board Meetings: {partB_Advisory.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Advisory.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Meeting No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">External Members</th>
                            <th className="border border-zinc-900 p-2 uppercase">Agenda</th>
                            <th className="border border-zinc-900 p-2 uppercase">Key Suggestions / Decisions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Advisory.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-mono">{act.meetingNo || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.externalMembers || act.members || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.agenda || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left font-bold">{act.suggestions || act.decisions || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Advisory, "Photo Gallery for Advisory Board Meetings")}
                    </div>
                  )}
                </div>

                {/* B.3 Laboratory Equipment Purchased / Maintenance */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    3. Equipment Purchased / Service & Maintenance: {partB_Purchases.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Purchases.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Equipment Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Lab Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Type</th>
                            <th className="border border-zinc-900 p-2 uppercase">Cost (₹)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Vendor</th>
                            <th className="border border-zinc-900 p-2 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Purchases.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.equipmentName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.labName || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.type || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-right font-bold">₹{parseFloat(act.cost || 0).toLocaleString("en-IN")}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.vendorName || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Purchases, "Photo Gallery for Equipment Purchased / Service & Maintenance")}
                    </div>
                  )}
                </div>

                {/* B.4 Parents Teachers Association Meetings */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    4. PTA Meetings: {partB_Parents.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Parents.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">No of Parents</th>
                            <th className="border border-zinc-900 p-2 uppercase">Feedback/Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Parents.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.yearSem || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.noOfParents || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.feedbackSummary || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Parents, "Photo Gallery for PTA Meetings")}
                    </div>
                  )}
                </div>

                {/* B.5 Memorandums of Understanding (MoUs) */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    5. Memorandums of Understanding (MoUs): {partB_Mous.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Mous.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Organization Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Signed Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Validity</th>
                            <th className="border border-zinc-900 p-2 uppercase">Activities Planned</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Mous.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.orgName || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.validityPeriod || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.activitiesPlan || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Mous, "Photo Gallery for MoUs & Industry Collaborations")}
                    </div>
                  )}
                </div>

                {/* B.6 Academic Audits Conducted */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    6. Academic Audits Conducted: {partB_Audits.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Audits.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Audit Type</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">External Auditor</th>
                            <th className="border border-zinc-900 p-2 uppercase">Observations/Action Taken</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Audits.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold">{act.auditType || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.auditorName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.observations || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Audits, "Photo Gallery for Academic Audits")}
                    </div>
                  )}
                </div>

                {/* B.7 Newsletters Published */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    7. Newsletters Published: {partB_Newsletters.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Newsletters.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Newsletter Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Volume / Issue</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date of Release</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Newsletters.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.volumeIssue || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Newsletters, "Photo Gallery for Newsletters & Department Publications")}
                    </div>
                  )}
                </div>

                {/* B.8 Department Budget Utilization (B6) */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    8. Department Budget Utilization: {partB_Budget.length === 0 ? "Nil" : ""}
                  </h4>
                  {partB_Budget.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Budget Head</th>
                            <th className="border border-zinc-900 p-2 uppercase">Allocated (₹)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Utilized (₹)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Month / Year</th>
                            <th className="border border-zinc-900 p-2 uppercase">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partB_Budget.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.budgetHead || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-right">₹{parseFloat(act.allocated || 0).toLocaleString("en-IN")}</td>
                              <td className="border border-zinc-900 p-2 text-right font-bold text-emerald-700">₹{parseFloat(act.utilized || 0).toLocaleString("en-IN")}</td>
                              <td className="border border-zinc-900 p-2">{act.month || "-"} {act.year || ""}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.remarks || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partB_Budget, "Gallery for Department Budget Utilization")}
                    </div>
                  )}
                </div>

                {/* Dynamic Custom Department Activities - serial 9,10… to continue Part B numbering */}
                {(() => {
                  const deptDefs = Object.values(customActivitiesMap).filter(d => (d.category||"").toLowerCase()==="department");
                  const allCodes = new Set([...deptDefs.map(d=>d.code), ...Object.keys(customDeptGroups)]);
                  return Array.from(allCodes).map((code, cIdx) => {
                    const serial = 9 + cIdx;
                    const def = customActivitiesMap[code];
                    const group = customDeptGroups[code] || { code, name: def?.name || code, items: [] };
                    const displayName = (def?.name || group.name || "").toUpperCase();
                    return (
                  <div key={code}>
                    <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                      {serial}. {displayName}: {group.items.length === 0 ? "NIL" : ""}
                    </h4>
                    {group.items.length === 0 ? (
                      <p className="text-[10px] italic text-zinc-500 pl-4">Nil</p>
                    ) : (
                    <>
                    <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                          <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                          <th className="border border-zinc-900 p-2 uppercase">Date</th>
                          <th className="border border-zinc-900 p-2 uppercase">Title / Details</th>
                          <th className="border border-zinc-900 p-2 uppercase">Submitted By</th>
                          <th className="border border-zinc-900 p-2 uppercase">Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((act, idx) => (
                          <tr key={act.id} className="text-center">
                            <td className="border border-zinc-900 p-2">{idx + 1}</td>
                            <td className="border border-zinc-900 p-2">{act.date || act.fromDate || act.startDate || "-"}</td>
                            <td className="border border-zinc-900 p-2 font-bold text-left">{act.title || act.activityName || act.programmeTitle || act.equipmentName || act.organisationName || act.projectTitle || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left">{act.submittedBy || act.facultyName || act.studentName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left text-[9px]">{act.description || act.agenda || act.decisions || act.details || act.remarks || act.purpose || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {renderSectionGallery(group.items, `Gallery for ${displayName}`)}
                    </>
                    )}
                  </div>
                    );
                  });
                })()}

              </div>

              {/* PART C */}
              <div className="space-y-6 pt-6 border-t border-zinc-300">
                <div className="text-center mb-6">
                  <h3 className="text-sm font-bold underline font-serif uppercase tracking-wide">
                    Part C: Details of Faculty Level Activities
                  </h3>
                </div>

                {/* C.1 PhD Registrations / Awarded */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    1. PhD Registrations / Awarded: {partC_Phd.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Phd.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">University</th>
                            <th className="border border-zinc-900 p-2 uppercase">Topic</th>
                            <th className="border border-zinc-900 p-2 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Phd.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.universityName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.phdTopic || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Phd, "Photo Gallery for Faculty Ph.D Registrations & Awards")}
                    </div>
                  )}
                </div>

                {/* C.2 Journal & Conference Publications */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    2. Journal & Conference Publications: {partC_Publications.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Publications.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Paper Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Journal/Conference</th>
                            <th className="border border-zinc-900 p-2 uppercase">ISSN/ISBN</th>
                            <th className="border border-zinc-900 p-2 uppercase">Impact Factor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Publications.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.paperTitle || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.journalName || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.issn || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold">{act.impactFactor || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Publications, "Photo Gallery for Faculty Journal & Conference Publications")}
                    </div>
                  )}
                </div>

                {/* C.3 Faculty FDP / Seminars / Workshops Attended */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    3. Faculty FDP / Seminars / Workshops Attended: {partC_Attended.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Attended.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Program Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Organizing Body</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date & Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Attended.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.programName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.organizedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Attended, "Photo Gallery for Faculty FDP & Seminars Attended")}
                    </div>
                  )}
                </div>

                {/* C.4 Faculty FDP / Seminars / Workshops Organized */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    4. Faculty FDP / Seminars / Workshops Organized: {partC_Organized.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Organized.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Coordinator</th>
                            <th className="border border-zinc-900 p-2 uppercase">Program Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Resource Person</th>
                            <th className="border border-zinc-900 p-2 uppercase">No of Participants</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Organized.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.programName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.resourcePerson || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.participantsCount || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Organized, "Photo Gallery for Faculty FDP & Seminars Organized")}
                    </div>
                  )}
                </div>

                {/* C.5 Faculty Online Courses Completed */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    5. Faculty Online Courses Completed: {partC_Online.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Online.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Course Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Platform</th>
                            <th className="border border-zinc-900 p-2 uppercase">Duration (Weeks)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Dates</th>
                            <th className="border border-zinc-900 p-2 uppercase">Score/Grade</th>
                            <th className="border border-zinc-900 p-2 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Online.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                               <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || act.name || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.courseName || act.courseTitle || act.title || act.activityName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.platform || act.university || act.organization || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.weeks || act.durationWeeks || act.duration || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.startDate && act.endDate ? `${act.startDate} to ${act.endDate}` : act.dates || act.date || act.fromDate || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.grade || act.score || act.scoreGrade || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "Completed"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Online, "Photo Gallery for Faculty Online Courses")}
                    </div>
                  )}
                </div>

                {/* C.6 Funded Research Projects / Consultancy */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    6. Funded Research Projects / Consultancy: {partC_Funding.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Funding.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Project Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Funding Agency</th>
                            <th className="border border-zinc-900 p-2 uppercase">PI Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Grant Amount (₹)</th>
                            <th className="border border-zinc-900 p-2 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Funding.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.projectTitle || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.fundingAgency || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left font-bold">{act.piName || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-right font-bold text-emerald-700">₹{parseFloat(act.grantAmount || 0).toLocaleString("en-IN")}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Funding, "Photo Gallery for Funded Research Projects & Consultancy")}
                    </div>
                  )}
                </div>

                {/* C.7 Patents Filed / Published / Granted by Faculty */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    7. Patents Filed / Published / Granted by Faculty: {partC_Patents.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Patents.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Inventors</th>
                            <th className="border border-zinc-900 p-2 uppercase">Patent Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Application No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Filing Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Type</th>
                            <th className="border border-zinc-900 p-2 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Patents.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.inventors || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.patentTitle || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-mono">{act.applicationNo || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.filingDate || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.type || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "Published"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Patents, "Photo Gallery for Faculty Patents")}
                    </div>
                  )}
                </div>

                {/* C.8 Faculty External Contributions */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    8. Faculty External Contributions (Guest Lectures, BoS, Examiner, etc.): {partC_Contributions.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Contributions.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Role / Title</th>
                            <th className="border border-zinc-900 p-2 uppercase">Host Institution</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Contributions.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.title || act.role || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.hostInstitution || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.duration || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Contributions, "Photo Gallery for Faculty External Contributions")}
                    </div>
                  )}
                </div>

                {/* C.9 Faculty Achievements / Awards / Recognitions */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    9. Faculty Achievements / Awards / Recognitions: {partC_Achievements.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Achievements.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Award / Recognition Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Awarding Body</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date</th>
                            <th className="border border-zinc-900 p-2 uppercase">Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Achievements.map((act, index) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2">{index + 1}</td>
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || act.submittedBy || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.awardName || act.title || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.awardingBody || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.date || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.level || "National"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Achievements, "Photo Gallery for Faculty Achievements")}
                    </div>
                  )}
                </div>

                {/* C.10 Faculty Mentoring / Student Projects Guided */}
                <div>
                  <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                    10. Faculty Mentoring / Student Projects Guided: {partC_Mentoring.length === 0 ? "Nil" : ""}
                  </h4>
                  {partC_Mentoring.length > 0 && (
                    <div className="space-y-2">
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">Faculty Name</th>
                            <th className="border border-zinc-900 p-2 uppercase">Type</th>
                            <th className="border border-zinc-900 p-2 uppercase">Students Guided</th>
                            <th className="border border-zinc-900 p-2 uppercase">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partC_Mentoring.map((act) => (
                            <tr key={act.id} className="text-center">
                              <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
                              <td className="border border-zinc-900 p-2 font-bold uppercase">{act.mentoringType || "-"}</td>
                              <td className="border border-zinc-900 p-2">{act.students || "-"}</td>
                              <td className="border border-zinc-900 p-2 text-left">{act.details || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {renderSectionGallery(partC_Mentoring, "Gallery for Faculty Mentoring")}
                    </div>
                  )}
                </div>

                {/* Dynamic Custom Faculty Activities - always show heading even when Nil */}
                {(() => {
                  const fDefs = Object.values(customActivitiesMap).filter(d => (d.category||"").toLowerCase()==="faculty");
                  const allCodes = new Set([...fDefs.map(d=>d.code), ...Object.keys(customFacultyGroups)]);
                  return Array.from(allCodes).map(code => {
                    const def = customActivitiesMap[code];
                    const group = customFacultyGroups[code] || { code, name: def?.name || code, items: [] };
                    const displayName = def?.name || group.name;
                    return (
                  <div key={code}>
                    <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                      {code}: {displayName} {group.items.length===0?": NIL":`(${group.items.length})`}
                    </h4>
                    {group.items.length === 0 ? (
                      <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                    ) : (
                    <>
                    <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                          <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                          <th className="border border-zinc-900 p-2 uppercase">Date</th>
                          <th className="border border-zinc-900 p-2 uppercase">Title / Details</th>
                          <th className="border border-zinc-900 p-2 uppercase">Submitted By</th>
                          <th className="border border-zinc-900 p-2 uppercase">Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((act, idx) => (
                          <tr key={act.id} className="text-center">
                            <td className="border border-zinc-900 p-2">{idx + 1}</td>
                            <td className="border border-zinc-900 p-2">{act.date || act.fromDate || act.startDate || "-"}</td>
                            <td className="border border-zinc-900 p-2 font-bold text-left">{act.title || act.activityName || act.programmeTitle || act.courseName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left">{act.submittedBy || act.facultyName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left text-[9px]">{act.description || act.details || act.remarks || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {renderSectionGallery(group.items, `Gallery for ${displayName}`)}
                    </>
                    )}
                  </div>
                    );
                  });
                })()}

                {/* Dynamic Custom Generic Activities */}
                {(() => {
                  const allCodes = new Set(Object.keys(customGenericGroups));
                  Object.values(customActivitiesMap).forEach(def => {
                    const cat = (def.category||"").toLowerCase();
                    const part = (def.part||"").toUpperCase();
                    if (["student","department","faculty"].includes(cat)) return;
                    if (["A","B","C"].includes(part)) return;
                    allCodes.add(def.code);
                  });
                  return Array.from(allCodes).map(code => {
                    const def = customActivitiesMap[code];
                    const group = customGenericGroups[code] || { code, name: def?.name || code, category: def?.category || "custom", items: [] };
                    const displayName = def?.name || group.name;
                    const catLabel = def?.category || group.category;
                    return (
                  <div key={code}>
                    <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                      {code}: {displayName} <span className="text-zinc-500 normal-case">({catLabel})</span> {group.items.length===0?": NIL":`(${group.items.length})`}
                    </h4>
                    {group.items.length === 0 ? (
                      <span className="font-bold font-serif ml-4 text-[10px] text-zinc-500">Nil</span>
                    ) : (
                    <>
                    <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                          <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                          <th className="border border-zinc-900 p-2 uppercase">Date</th>
                          <th className="border border-zinc-900 p-2 uppercase">Title / Details</th>
                          <th className="border border-zinc-900 p-2 uppercase">Submitted By</th>
                          <th className="border border-zinc-900 p-2 uppercase">Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((act, idx) => (
                          <tr key={act.id} className="text-center">
                            <td className="border border-zinc-900 p-2">{idx + 1}</td>
                            <td className="border border-zinc-900 p-2">{act.date || act.fromDate || act.startDate || "-"}</td>
                            <td className="border border-zinc-900 p-2 font-bold text-left">{act.title || act.activityName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left">{act.submittedBy || act.facultyName || act.studentName || "-"}</td>
                            <td className="border border-zinc-900 p-2 text-left text-[9px]">{act.description || act.details || act.remarks || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {renderSectionGallery(group.items, `Gallery for ${displayName}`)}
                    </>
                    )}
                  </div>
                    );
                  });
                })()}

              </div>

              {/* Signatures footer */}
              <div className="pt-12 grid grid-cols-3 text-center text-xs font-bold font-serif gap-4 mt-8 page-break-inside-avoid">
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Prepared & Verified By</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5 font-bold">Faculty Coordinator</p>
                </div>
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Head of the Department</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5 font-bold">HOD ({reportStatusDoc?.submittedByName || "Signed"})</p>
                </div>
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Principal</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5 font-bold">
                    {reportStatusDoc?.status === "Approved" ? "Approved & Signed" : "CKCET"}
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {reviewActivity && (
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    Approved Activity Details
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewActivity.studentName || reviewActivity.facultyName || reviewActivity.submittedBy} 
                    ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                  </p>
                </div>
              </div>
              <button onClick={() => setReviewActivity(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white">
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

              {/* Additional fields */}
              <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                {Object.entries(reviewActivity).filter(([k, v]) => 
                  v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "studentId", "userId", "uid", "student_id", "user_id", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName", "submittedById", "submittedByRole", "isStep"].includes(k)
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

              {reviewActivity.comments && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-1">Approval Verification Info:</span>
                  <p className="text-sm text-emerald-700">{reviewActivity.comments}</p>
                  {reviewActivity.reviewedByName && (
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">Verified By: {reviewActivity.reviewedByName}</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button onClick={() => setReviewActivity(null)} className="px-5 py-2 bg-[#120c7a] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
          </div>
      )}
    </Layout>
  );
}
