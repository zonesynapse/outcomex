import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { useLocation } from "react-router-dom";
import { 
  Award, Clock, Eye, Download, Check, X, Search, Filter, Users, Loader2,
  Settings, Plus, Trash2, Save, BookOpen, ListTodo, Target, ChevronRight, Info,
  GraduationCap, Building2, User, FileText, Calendar, AlertTriangle, CheckCircle2, XCircle, 
  ArrowRight, BarChart3, Upload, Edit, MessageSquare, AlertCircle, Star, Globe, Layers, Printer, ClipboardCheck
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";
import { getAcademicYears, formatProgDisplay, formatBatchDisplay, formatProgrammeKey, sanitizeKey } from "../lib/utils";

const STATUS_OPTIONS = ["Pending", "Approved", "Returned", "Rejected", "Draft"];

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityList() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [studentsIndex, setStudentsIndex] = useState({});
  const [facultyIndex, setFacultyIndex] = useState({});
  const tabParam = searchParams.get("tab");
  const isApprovalsRoute = location.pathname === "/activities/approvals";
  const initialTab = isApprovalsRoute ? "approvals" : (tabParam && ["student", "faculty", "department", "approvals", "reports", "nba-export"].includes(tabParam) ? tabParam : "student");
  const [activeTab, setActiveTab] = useState(initialTab); // student, faculty, department, approvals, reports, nba-export
  
  // Search & Filter states
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedProg, setSelectedProg] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedActivityCode, setSelectedActivityCode] = useState("");
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});
  // Report specific
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  // NBA Export specific
  const [nbaDateFrom, setNbaDateFrom] = useState("");
  const [nbaDateTo, setNbaDateTo] = useState("");
  const [nbaCategory, setNbaCategory] = useState("");

  // Modal states
  const [reviewActivity, setReviewActivity] = useState(null);
  const reviewRegistry = useMemo(() => reviewActivity ? ACTIVITY_REGISTRY.find(r => r.code === reviewActivity.activityCode) : null, [reviewActivity]);
  const [returnComment, setReturnComment] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [viewActivity, setViewActivity] = useState(null);

  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  // Load user profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentUserData(data);
            if (data.role === "Faculty" || data.role === "HOD") {
              if (data.department) setSelectedDept(data.department);
              if (data.programme) setSelectedProg(data.programme);
            }
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Set status filter to Pending when approvals tab is active
  useEffect(() => {
    if (isApprovalsRoute || tabParam === "approvals") {
      setSelectedStatus("Pending");
    }
  }, [tabParam, isApprovalsRoute]);

  // Sync query param tab from URL
  useEffect(() => {
    if (isApprovalsRoute) {
      setActiveTab("approvals");
      return;
    }
    const tab = searchParams.get("tab");
    if (tab && ["student", "faculty", "department", "approvals", "reports", "nba-export"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams, isApprovalsRoute]);

  // Real-time activities listener (both activity_entries and step_activities)
  useEffect(() => {
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      orderBy("createdAt", "desc")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        list1.push({ id: d.id, ...d.data() });
      });
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      orderBy("createdAt", "desc")
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        let nba = "";
        let naac = "";
        if (data.category === "technical") { nba = "C2.2.3"; naac = "3.2.2"; }
        else if (data.category === "research") { nba = "C3.4"; naac = "3.3.3"; }
        else if (data.category === "industry") { nba = "C2.8"; naac = "3.2.1"; }
        else if (data.category === "social") { nba = "C9.11"; naac = "7.1.1"; }
        else if (data.category === "leadership") { nba = "C9.7"; naac = "5.3.1"; }
        else { nba = "C9.2"; naac = "5.1.2"; }

        list2.push({ 
          id: d.id, 
          isStep: true, 
          activityCode: "STEP", 
          activityName: data.activityName || data.activityType || "STEP Activity", 
          nbaCriterion: nba,
          naacCriterion: naac,
          ...data 
        });
      });
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading step_activities:", err));

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Load student index
  useEffect(() => {
    const q = collection(db, "student_section_index");
    const unsub = onSnapshot(q, (snapshot) => {
      const index = {};
      snapshot.forEach((d) => {
        const data = d.data();
        Object.entries(data).forEach(([key, val]) => {
          if (typeof val === "object" && val !== null) {
            index[key] = val;
          }
        });
      });
      setStudentsIndex(index);
    });
    return () => unsub();
  }, []);

  // Load batch section configs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  // Load faculty index
  useEffect(() => {
    const q = collection(db, "users");
    const unsub = onSnapshot(q, (snapshot) => {
      const index = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.facultyName) {
          index[data.facultyId || d.id] = { name: data.facultyName, department: data.department };
        }
      });
      setFacultyIndex(index);
    });
    return () => unsub();
  }, []);

  // Get activities for current tab
  const currentTabActivities = useMemo(() => {
    if (activeTab === "approvals" || activeTab === "reports" || activeTab === "nba-export") return ACTIVITY_REGISTRY;
    return ACTIVITY_REGISTRY.filter(a => getCategoryFromCode(a.code) === activeTab);
  }, [activeTab]);

  // Filter options
  const batchOptions = useMemo(() => {
    const b = new Set();

    let targetProgs = [];
    if (selectedProg) {
      targetProgs = [selectedProg];
    } else if (selectedDept) {
      targetProgs = Object.entries(PROGRAMME_DEPARTMENTS)
        .filter(([, depts]) => depts.includes(selectedDept))
        .map(([prog]) => prog);
    } else {
      targetProgs = Object.keys(PROGRAMME_DEPARTMENTS);
    }

    targetProgs.forEach(prog => {
      getActiveBatches(prog).forEach(batch => b.add(batch));
    });

    activities.forEach(a => { if (a.batch) b.add(a.batch); });
    return Array.from(b).sort();
  }, [activities, PROGRAMME_DEPARTMENTS, selectedProg, selectedDept, getActiveBatches]);

  const deptOptions = useMemo(() => {
    if (selectedProg) {
      return PROGRAMME_DEPARTMENTS[selectedProg] || [];
    }
    const d = new Set();
    activities.forEach(a => { if (a.department) d.add(a.department); });
    Object.values(PROGRAMME_DEPARTMENTS).forEach(list => list.forEach(dept => d.add(dept)));
    return Array.from(d).sort();
  }, [activities, PROGRAMME_DEPARTMENTS, selectedProg]);

  const sectionOptions = useMemo(() => {
    if (!selectedProg || !selectedDept || !selectedBatch) return [];

    const progKey = formatProgrammeKey(selectedProg);
    const deptKey = sanitizeKey(selectedDept);
    const batchKey = sanitizeKey(selectedBatch);
    const docId = `${progKey}_${deptKey}_${batchKey}`;

    console.log('[ActivityList sectionOptions]', { selectedProg, selectedDept, selectedBatch, progKey, deptKey, batchKey, docId, availableKeys: Object.keys(sectionConfigs) });

    // Try exact match on doc ID
    let cfg = sectionConfigs[docId];

    // Fallback: search through stored field values (handles key format mismatches)
    if (!cfg || !cfg.numSections) {
      const entry = Object.values(sectionConfigs).find(v =>
        v.batch === selectedBatch &&
        v.department === selectedDept &&
        (v.programme === selectedProg || formatProgrammeKey(v.programme) === progKey)
      );
      if (entry) {
        console.log('[ActivityList sectionOptions] Found via field fallback:', entry);
        cfg = entry;
      }
    }

    if (!cfg || !cfg.numSections) return [];
    const count = cfg.numSections;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
  }, [selectedProg, selectedDept, selectedBatch, sectionConfigs]);

  const programmeOptions = useMemo(() => Object.keys(PROGRAMME_DEPARTMENTS).sort(), [PROGRAMME_DEPARTMENTS]);

  const academicYearOptions = useMemo(() => {
    return selectedBatch ? getAcademicYears(selectedBatch) : [];
  }, [selectedBatch]);

  const activityCodeOptions = useMemo(() => {
    return currentTabActivities.map(a => ({ code: a.code, name: a.name }));
  }, [currentTabActivities]);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const category = getCategoryFromCode(act.activityCode || "");

      if (activeTab === "approvals") {
        // Show all pending activities across all categories
        if ((act.status || "Draft") !== "Pending") return false;
      } else if (activeTab === "reports") {
        // Show all approved activities
        if ((act.status || "Draft") !== "Approved") return false;
      } else if (activeTab === "nba-export") {
        // Show all approved activities
        if ((act.status || "Draft") !== "Approved") return false;
      } else {
        // Normal category tab filtering
        if (category !== activeTab) return false;
      }

      const status = act.status || "Draft";
      const matchesStatus = !selectedStatus || status === selectedStatus;
      const matchesBatch = !selectedBatch || act.batch === selectedBatch;
      const matchesDept = !selectedDept || act.department === selectedDept;
      const matchesProg = !selectedProg || act.programme === selectedProg;
      const matchesSection = !selectedSection || act.section === selectedSection;
      const matchesActivityCode = !selectedActivityCode || act.activityCode === selectedActivityCode;
      const matchesAcademicYear = !selectedAcademicYear || act.academicYear === selectedAcademicYear;

      const matchesSearch = !searchQuery.trim() || 
        (act.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.facultyName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.regNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.activityName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.title || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesBatch && matchesDept && matchesProg && matchesSection && matchesActivityCode && matchesAcademicYear && matchesSearch;
    });
  }, [activities, activeTab, selectedStatus, selectedBatch, selectedDept, selectedProg, selectedSection, selectedActivityCode, selectedAcademicYear, searchQuery]);

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

  // Stats
  const stats = useMemo(() => {
    let catActivities;
    if (activeTab === "approvals" || activeTab === "reports" || activeTab === "nba-export") {
      catActivities = activities;
    } else {
      catActivities = activities.filter(a => getCategoryFromCode(a.activityCode || "") === activeTab);
    }
    return {
      total: catActivities.length,
      pending: catActivities.filter(a => (a.status || "Draft") === "Pending").length,
      approved: catActivities.filter(a => (a.status || "Draft") === "Approved").length,
      returned: catActivities.filter(a => (a.status || "Draft") === "Returned").length,
      rejected: catActivities.filter(a => (a.status || "Draft") === "Rejected").length,
      draft: catActivities.filter(a => (a.status || "Draft") === "Draft").length
    };
  }, [activities, activeTab]);

  const handleApprove = async () => {
    if (!reviewActivity) return;
    setIsActioning(true);
    try {
      const docRef = doc(db, reviewActivity.isStep ? "step_activities" : "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "HOD_Pending",
        comments: "Approved by first-level reviewer",
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity approved and forwarded to HOD for final verification!");
      setReviewActivity(null);
    } catch (err) {
      console.error("Error approving:", err);
      alert("Failed to forward. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    if (!reviewActivity) return;
    if (!returnComment.trim()) {
      alert("Please provide rejection reason.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, reviewActivity.isStep ? "step_activities" : "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "Rejected",
        comments: returnComment,
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity rejected.");
      setReviewActivity(null);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error rejecting:", err);
      alert("Failed to reject.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturn = async () => {
    if (!reviewActivity) return;
    if (!returnComment.trim()) {
      alert("Please provide feedback comments explaining what correction is needed.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, reviewActivity.isStep ? "step_activities" : "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "Returned",
        comments: returnComment,
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity returned for corrections.");
      setReviewActivity(null);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning:", err);
      alert("Failed to return.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      alert("No data to export.");
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["Activity Code", "Activity Name", "Submitted By", "Department", "Batch", "Section", "Date", "Status", "Points", "Created At"];
    csvContent += headers.join(",") + "\n";
    filteredActivities.forEach(act => {
      const row = [
        act.activityCode || "",
        act.activityName || act.title || "",
        act.studentName || act.facultyName || "",
        act.department || "",
        act.batch || "",
        act.section || "",
        act.date || act.fromDate || "",
        act.status || "Draft",
        act.points || act.totalPoints || "",
        act.createdAt || ""
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Activity_Report_${viewConfig.label.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Monthly Report computations
  const approvedActivities = useMemo(() => {
    return activities.filter(a => (a.status || "Draft") === "Approved");
  }, [activities]);

  const monthlyActivities = useMemo(() => {
    if (!reportMonth) return [];
    const [y, m] = reportMonth.split('-').map(Number);
    return approvedActivities.filter(a => {
      const dateStr = a.date || a.fromDate || a.createdAt || '';
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d.getFullYear() === y && (d.getMonth() + 1) === m;
    });
  }, [approvedActivities, reportMonth]);

  const monthlyStats = useMemo(() => {
    const pts = monthlyActivities.reduce((s, a) => s + (Number(a.points) || Number(a.totalPoints) || 0), 0);
    return {
      total: monthlyActivities.length,
      student: monthlyActivities.filter(a => getCategoryFromCode(a.activityCode || '') === 'student').length,
      faculty: monthlyActivities.filter(a => getCategoryFromCode(a.activityCode || '') === 'faculty').length,
      department: monthlyActivities.filter(a => getCategoryFromCode(a.activityCode || '') === 'department').length,
      totalPoints: pts
    };
  }, [monthlyActivities]);

  const monthlyDeptFiltered = useMemo(() => {
    return monthlyActivities.filter(a => {
      const matchesDept = !selectedDept || a.department === selectedDept;
      const matchesBatch = !selectedBatch || a.batch === selectedBatch;
      const matchesSection = !selectedSection || a.section === selectedSection;
      const matchesActivityCode = !selectedActivityCode || a.activityCode === selectedActivityCode;
      return matchesDept && matchesBatch && matchesSection && matchesActivityCode;
    });
  }, [monthlyActivities, selectedDept, selectedBatch, selectedSection, selectedActivityCode]);

  const activityTypeBreakdown = useMemo(() => {
    const map = {};
    monthlyDeptFiltered.forEach(a => {
      const code = a.activityCode || 'Unknown';
      if (!map[code]) map[code] = { code, name: a.activityName || a.title || code, count: 0, points: 0, category: getCategoryFromCode(code) };
      map[code].count += 1;
      map[code].points += Number(a.points) || Number(a.totalPoints) || 0;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [monthlyDeptFiltered]);

  const nbaCoverage = useMemo(() => {
    const codes = new Set();
    monthlyDeptFiltered.forEach(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      if (reg?.nbaCriterion) codes.add(reg.nbaCriterion);
    });
    return [...codes].sort();
  }, [monthlyDeptFiltered]);

  const naacCoverage = useMemo(() => {
    const codes = new Set();
    monthlyDeptFiltered.forEach(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      if (reg?.naacCriterion) codes.add(reg.naacCriterion);
    });
    return [...codes].sort();
  }, [monthlyDeptFiltered]);

  const reportMonthOptions = useMemo(() => {
    const set = new Set();
    approvedActivities.forEach(a => {
      const dateStr = a.date || a.fromDate || a.createdAt || '';
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    return [...set].sort().reverse();
  }, [approvedActivities]);

  const handleExportMonthlyReport = () => {
    if (monthlyDeptFiltered.length === 0) { alert("No data to export."); return; }
    let csv = "data:text/csv;charset=utf-8,";
    csv += "Activity Code,Activity Name,Category,Submitted By,Department,Batch,Section,Date,Points,NBA Criterion,NAAC Criterion\n";
    monthlyDeptFiltered.forEach(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      csv += [
        a.activityCode, a.activityName || a.title || '',
        getCategoryFromCode(a.activityCode || ''), a.studentName || a.facultyName || '',
        a.department || '', a.batch || '', a.section || '',
        a.date || a.fromDate || '', a.points || a.totalPoints || '',
        reg?.nbaCriterion || '', reg?.naacCriterion || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
    });
    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Monthly_Report_${reportMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // NBA Export computations
  const nbaExportActivities = useMemo(() => {
    return approvedActivities.filter(a => {
      const dateStr = a.date || a.fromDate || a.createdAt || '';
      if (nbaDateFrom && dateStr && dateStr < nbaDateFrom) return false;
      if (nbaDateTo && dateStr && dateStr > nbaDateTo) return false;
      if (nbaCategory && getCategoryFromCode(a.activityCode || '') !== nbaCategory) return false;
      if (selectedDept && a.department !== selectedDept) return false;
      if (selectedBatch && a.batch !== selectedBatch) return false;
      if (selectedSection && a.section !== selectedSection) return false;
      return true;
    });
  }, [approvedActivities, nbaDateFrom, nbaDateTo, nbaCategory, selectedDept, selectedBatch, selectedSection]);

  const nbaCriterionSummary = useMemo(() => {
    const map = {};
    nbaExportActivities.forEach(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      const criteria = [];
      if (reg?.nbaCriterion) criteria.push({ type: 'NBA', code: reg.nbaCriterion });
      if (reg?.naacCriterion) criteria.push({ type: 'NAAC', code: reg.naacCriterion });
      if (reg?.nirfParameter) criteria.push({ type: 'NIRF', code: reg.nirfParameter });
      criteria.forEach(c => {
        if (!map[c.code]) map[c.code] = { type: c.type, code: c.code, count: 0, points: 0, activities: new Set() };
        map[c.code].count += 1;
        map[c.code].points += Number(a.points) || Number(a.totalPoints) || 0;
        map[c.code].activities.add(a.activityCode);
      });
    });
    return Object.values(map).map(item => ({ ...item, activities: [...item.activities].sort() })).sort((a, b) => b.count - a.count);
  }, [nbaExportActivities]);

  const nbaDeptSummary = useMemo(() => {
    const map = {};
    nbaExportActivities.forEach(a => {
      const dept = a.department || 'Unknown';
      if (!map[dept]) map[dept] = { department: dept, count: 0, points: 0, studentCount: 0, facultyCount: 0, deptCount: 0, nbaCriteria: new Set(), naacCriteria: new Set() };
      map[dept].count += 1;
      map[dept].points += Number(a.points) || Number(a.totalPoints) || 0;
      const cat = getCategoryFromCode(a.activityCode || '');
      if (cat === 'student') map[dept].studentCount += 1;
      else if (cat === 'faculty') map[dept].facultyCount += 1;
      else map[dept].deptCount += 1;
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      if (reg?.nbaCriterion) map[dept].nbaCriteria.add(reg.nbaCriterion);
      if (reg?.naacCriterion) map[dept].naacCriteria.add(reg.naacCriterion);
    });
    return Object.values(map).map(item => ({
      ...item,
      nbaCriteria: [...item.nbaCriteria].sort(),
      naacCriteria: [...item.naacCriteria].sort()
    })).sort((a, b) => b.count - a.count);
  }, [nbaExportActivities]);

  const handleExportNBA = (type) => {
    if (nbaExportActivities.length === 0) { alert("No data to export."); return; }
    let csv = "data:text/csv;charset=utf-8,";
    if (type === 'criterion') {
      csv += "Criterion Type,Criterion Code,Activity Count,Total Points,Activity Codes\n";
      nbaCriterionSummary.forEach(item => {
        csv += `"${item.type}","${item.code}",${item.count},${item.points},"${item.activities.join('; ')}"\n`;
      });
    } else if (type === 'department') {
      csv += "Department,Total Entries,Total Points,Student Activities,Faculty Activities,Dept Activities,NBA Criteria,NAAC Criteria\n";
      nbaDeptSummary.forEach(item => {
        csv += `"${item.department}",${item.count},${item.points},${item.studentCount},${item.facultyCount},${item.deptCount},"${item.nbaCriteria.join('; ')}","${item.naacCriteria.join('; ')}"\n`;
      });
    } else {
      csv += "Activity Code,Activity Name,Category,Submitted By,Department,Batch,Section,Date,Points,NBA Criterion,NAAC Criterion,NIRF Parameter\n";
      nbaExportActivities.forEach(a => {
        const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
        csv += [
          a.activityCode, a.activityName || a.title || '',
          getCategoryFromCode(a.activityCode || ''), a.studentName || a.facultyName || '',
          a.department || '', a.batch || '', a.section || '',
          a.date || a.fromDate || '', a.points || a.totalPoints || '',
          reg?.nbaCriterion || '', reg?.naacCriterion || '', reg?.nirfParameter || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
      });
    }
    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `NBA_Export_${type}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Layout title="Activity Management">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#120c7a]" size={40} />
        </div>
      </Layout>
    );
  }

  const currentCategory = ACTIVITY_CATEGORIES[activeTab];
  const fallbackView = {
    approvals: { icon: "ClipboardCheck", label: "Approval Queue" },
    reports: { icon: "BarChart3", label: "Monthly Reports" },
    "nba-export": { icon: "Download", label: "NBA Data Export" }
  };
  const viewConfig = currentCategory || fallbackView[activeTab] || { icon: "GraduationCap", label: "Activity" };
  const CategoryIcon = viewConfig.icon ? eval(viewConfig.icon) : GraduationCap;

  return (
    <Layout title="Activity Management">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#120c7a] to-[#0e0a5c] rounded-3xl p-6 md:p-8 text-white mb-8 shadow-xl flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
              <CategoryIcon size={32} className="text-yellow-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">ERP Administration</span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-0.5">
                {viewConfig.label} Dashboard
              </h1>
              <p className="text-blue-100 text-xs mt-1">Manage, review, and track all activities with NBA/NAAC compliance mapping</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Total Entries</span>
              <span className="text-3xl font-black text-white">{stats.total}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Pending Review</span>
              <span className="text-3xl font-black text-yellow-300">{stats.pending}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Approved</span>
              <span className="text-3xl font-black text-emerald-400">{stats.approved}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Returned</span>
              <span className="text-3xl font-black text-rose-400">{stats.returned}</span>
            </div>
          </div>
        </div>

        {/* Category Tabs — only for student/faculty/department */}
        {["student", "faculty", "department"].includes(activeTab) && (
        <div className="flex border-b border-zinc-200 mb-6 gap-2 flex-wrap">
          {Object.entries(ACTIVITY_CATEGORIES).map(([key, cat]) => {
            const Icon = eval(cat.icon);
            const count = activities.filter(a => getCategoryFromCode(a.activityCode || "") === key).length;
            return (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setSelectedStatus(""); setSearchQuery(""); }}
                className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === key 
                    ? "border-[#120c7a] text-[#120c7a]" 
                    : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
                }`}
              >
                <Icon size={14} />
                {cat.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === key ? "bg-[#120c7a] text-white" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        )}
        {activeTab === "reports" ? (
          <div className="space-y-6">
            {/* Month Selector + Filters */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Report Month</label>
                  <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
                  <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Departments</option>
                    {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch</label>
                  <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Batches</option>
                    {batchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
                  <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Sections</option>
                    {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Activity</label>
                  <select value={selectedActivityCode} onChange={e => setSelectedActivityCode(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Activities</option>
                    {ACTIVITY_REGISTRY.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm text-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Approved</span>
                <p className="text-3xl font-black text-[#120c7a] mt-1">{monthlyStats.total}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm text-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Student Activities</span>
                <p className="text-3xl font-black text-blue-600 mt-1">{monthlyStats.student}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm text-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Faculty Activities</span>
                <p className="text-3xl font-black text-amber-600 mt-1">{monthlyStats.faculty}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm text-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dept Activities</span>
                <p className="text-3xl font-black text-emerald-600 mt-1">{monthlyStats.department}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm text-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Points</span>
                <p className="text-3xl font-black text-purple-600 mt-1">{monthlyStats.totalPoints}</p>
              </div>
            </div>

            {/* NBA/NAAC Coverage */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-[#120c7a]" />
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">NBA / NAAC Criterion Coverage</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {nbaCoverage.map(c => <span key={c} className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-bold">NBA: {c}</span>)}
                {naacCoverage.map(c => <span key={c} className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-bold">NAAC: {c}</span>)}
                {nbaCoverage.length === 0 && naacCoverage.length === 0 && <p className="text-xs text-zinc-400 italic">No criteria mapped for selected filters</p>}
              </div>
            </div>

            {/* Activity Breakdown Table */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-zinc-800">Activity Breakdown ({monthlyDeptFiltered.length} entries)</h3>
                  <p className="text-xs text-zinc-400 font-medium">Grouped by activity type for {reportMonth.replace('-', ' / Month ')}</p>
                </div>
                <button onClick={handleExportMonthlyReport} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2">
                  <Download size={14} /> Export CSV
                </button>
              </div>
              {monthlyDeptFiltered.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">
                  <BarChart3 size={36} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-sm font-semibold text-zinc-600">No approved activities found for this month.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Activity Code</th>
                        <th className="p-4">Activity Name</th>
                        <th className="p-4">Category</th>
                        <th className="p-4 text-center">Entries</th>
                        <th className="p-4 text-center">Points</th>
                        <th className="p-4 text-center">NBA</th>
                        <th className="p-4 text-center">NAAC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {activityTypeBreakdown.map(item => {
                        const reg = ACTIVITY_REGISTRY.find(r => r.code === item.code);
                        const catLabel = item.category === 'student' ? 'Student' : item.category === 'faculty' ? 'Faculty' : 'Department';
                        return (
                          <tr key={item.code} className="hover:bg-zinc-50/50 transition-colors font-medium">
                            <td className="p-4 font-bold text-zinc-800">{item.code}</td>
                            <td className="p-4 max-w-xs truncate">{item.name}</td>
                            <td className="p-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.category === 'student' ? 'bg-blue-50 text-blue-700' : item.category === 'faculty' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{catLabel}</span></td>
                            <td className="p-4 text-center font-extrabold text-[#120c7a]">{item.count}</td>
                            <td className="p-4 text-center font-extrabold text-purple-700">{item.points}</td>
                            <td className="p-4 text-center text-[10px] font-bold text-blue-600">{reg?.nbaCriterion || '-'}</td>
                            <td className="p-4 text-center text-[10px] font-bold text-emerald-600">{reg?.naacCriterion || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Detailed Entries */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-base font-extrabold text-zinc-800">Detailed Entries</h3>
                <p className="text-xs text-zinc-400 font-medium">All approved activity submissions for {reportMonth.replace('-', ' / ')}</p>
              </div>
              {monthlyDeptFiltered.length === 0 ? null : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Submitted By</th>
                        <th className="p-4">Department</th>
                        <th className="p-4">Activity</th>
                        <th className="p-4 text-center">Date</th>
                        <th className="p-4 text-center">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium">
                      {monthlyDeptFiltered.map(a => (
                        <tr key={a.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-zinc-800">{a.studentName || a.facultyName || 'N/A'}</p>
                            <p className="text-[10px] text-zinc-400 font-bold">{a.regNo || a.facultyId || ''}</p>
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-zinc-700">{a.department}</p>
                            <p className="text-[10px] text-zinc-400 font-bold">{a.batch} {a.section ? `• ${a.section}` : ''}</p>
                          </td>
                          <td className="p-4 max-w-xs">
                            <p className="font-bold text-zinc-800 truncate">{a.activityName || a.title || a.activityCode}</p>
                            <span className="text-[10px] text-blue-600 font-bold">{a.activityCode}</span>
                          </td>
                          <td className="p-4 text-center font-bold text-zinc-700">{a.date || a.fromDate || '-'}</td>
                          <td className="p-4 text-center font-extrabold text-[#120c7a]">{a.points || a.totalPoints || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "nba-export" ? (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">From Date</label>
                  <input type="date" value={nbaDateFrom} onChange={e => setNbaDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">To Date</label>
                  <input type="date" value={nbaDateTo} onChange={e => setNbaDateTo(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Category</label>
                  <select value={nbaCategory} onChange={e => setNbaCategory(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Categories</option>
                    <option value="faculty">Faculty (Part C)</option>
                    <option value="department">Department (Part B)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
                  <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Departments</option>
                    {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch</label>
                  <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Batches</option>
                    {batchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
                  <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Sections</option>
                    {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5 shadow-sm">
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Approved</span>
                <p className="text-3xl font-black text-[#120c7a] mt-1">{nbaExportActivities.length}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-5 shadow-sm">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">NBA Criteria Covered</span>
                <p className="text-3xl font-black text-emerald-700 mt-1">{nbaCriterionSummary.filter(c => c.type === 'NBA').length}</p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100 p-5 shadow-sm">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">NAAC Criteria Covered</span>
                <p className="text-3xl font-black text-amber-700 mt-1">{nbaCriterionSummary.filter(c => c.type === 'NAAC').length}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl border border-purple-100 p-5 shadow-sm">
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Departments</span>
                <p className="text-3xl font-black text-purple-700 mt-1">{nbaDeptSummary.length}</p>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex flex-wrap gap-3">
              <button onClick={() => handleExportNBA('detail')} className="px-5 py-2.5 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2">
                <Download size={14} /> Export Detailed CSV
              </button>
              <button onClick={() => handleExportNBA('criterion')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2">
                <Download size={14} /> Export Criterion Summary
              </button>
              <button onClick={() => handleExportNBA('department')} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2">
                <Download size={14} /> Export Dept Summary
              </button>
            </div>

            {/* Criterion-wise Summary */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-base font-extrabold text-zinc-800">NBA / NAAC / NIRF Criterion Coverage</h3>
                <p className="text-xs text-zinc-400 font-medium">{nbaExportActivities.length} approved activities mapped to accreditation criteria</p>
              </div>
              {nbaCriterionSummary.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">
                  <Target size={36} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-sm font-semibold text-zinc-600">No criteria data for selected filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Type</th>
                        <th className="p-4">Criterion Code</th>
                        <th className="p-4 text-center">Activity Count</th>
                        <th className="p-4 text-center">Total Points</th>
                        <th className="p-4">Mapped Activities</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {nbaCriterionSummary.map(item => (
                        <tr key={item.code} className="hover:bg-zinc-50/50 transition-colors font-medium">
                          <td className="p-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.type === 'NBA' ? 'bg-blue-50 text-blue-700' : item.type === 'NAAC' ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>{item.type}</span>
                          </td>
                          <td className="p-4 font-bold text-zinc-800">{item.code}</td>
                          <td className="p-4 text-center font-extrabold text-[#120c7a]">{item.count}</td>
                          <td className="p-4 text-center font-extrabold text-purple-700">{item.points}</td>
                          <td className="p-4 text-[10px] text-zinc-500">{item.activities.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Department-wise Summary */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-base font-extrabold text-zinc-800">Department-wise Summary</h3>
              </div>
              {nbaDeptSummary.length === 0 ? null : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Department</th>
                        <th className="p-4 text-center">Total</th>
                        <th className="p-4 text-center">Student</th>
                        <th className="p-4 text-center">Faculty</th>
                        <th className="p-4 text-center">Dept</th>
                        <th className="p-4 text-center">Points</th>
                        <th className="p-4">NBA Criteria</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium">
                      {nbaDeptSummary.map(item => (
                        <tr key={item.department} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4 font-bold text-zinc-800">{item.department}</td>
                          <td className="p-4 text-center font-extrabold text-[#120c7a]">{item.count}</td>
                          <td className="p-4 text-center text-blue-600 font-bold">{item.studentCount}</td>
                          <td className="p-4 text-center text-amber-600 font-bold">{item.facultyCount}</td>
                          <td className="p-4 text-center text-emerald-600 font-bold">{item.deptCount}</td>
                          <td className="p-4 text-center font-extrabold text-purple-700">{item.points}</td>
                          <td className="p-4 text-[10px] text-zinc-500">{item.nbaCriteria.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Filters Panel */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-[#120c7a]" />
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Search & Filter Selection</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Program</label>
              <select value={selectedProg} onChange={e => { setSelectedProg(e.target.value); setSelectedDept(""); setSelectedBatch(""); setSelectedAcademicYear(""); }} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Programs</option>
                {programmeOptions.map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
              <select value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedBatch(""); setSelectedAcademicYear(""); }} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={currentUserData?.role === "Faculty" && currentUserData?.department}>
                <option value="">All Departments</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch</label>
              <select value={selectedBatch} onChange={e => { setSelectedBatch(e.target.value); setSelectedAcademicYear(""); setSelectedSection(""); }} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Batches</option>
                {batchOptions.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Academic Year</label>
              <select value={selectedAcademicYear} onChange={e => setSelectedAcademicYear(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={!selectedBatch}>
                <option value="">All Years</option>
                {academicYearOptions.map(ay => <option key={ay} value={ay}>{ay}</option>)}
              </select>
            </div>
            <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
                  <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={!selectedProg || !selectedDept || !selectedBatch || sectionOptions.length === 0}>
                    <option value="">{sectionOptions.length === 0 && selectedProg && selectedDept && selectedBatch ? "No sections configured" : "All Sections"}</option>
                    {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Activity</label>
              <select value={selectedActivityCode} onChange={e => setSelectedActivityCode(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Activities</option>
                {activityCodeOptions.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Status</label>
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Activity Table */}
        <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-800">
                {viewConfig.label} ({filteredActivities.length} entries)
              </h3>
              <p className="text-xs text-zinc-400 font-medium">Review submissions and cross-check evidence logs.</p>
            </div>
            <button onClick={handleExportCSV} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">
              <Clock size={36} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-semibold text-zinc-600">No activity logs found for current filter selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-600">
                <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Submitted By</th>
                    <th className="p-4">Department / Batch</th>
                    <th className="p-4">Activity</th>
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
                      {/* Month Group Header Row */}
                      <tr className="bg-zinc-50 border-y border-zinc-100">
                        <td colSpan={8} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Calendar size={13} className="text-[#120c7a]" />
                              {monthName}
                            </span>
                            <span className="text-[9px] bg-zinc-200 text-zinc-700 px-2.5 py-0.5 rounded-full font-bold">
                              {activitiesList.length} {activitiesList.length === 1 ? 'submission' : 'submissions'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Activity Rows for this month */}
                      {activitiesList.map((act) => {
                        const registry = ACTIVITY_REGISTRY.find(r => r.code === act.activityCode);
                        const status = act.status || "Draft";
                        return (
                          <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="p-4">
                              <p className="font-bold text-zinc-800">{act.studentName || act.facultyName || "N/A"}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold mt-0.5 uppercase">
                                <span>{act.regNo || act.facultyId || ""}</span>
                                {act.regNo && act.facultyId && <span>•</span>}
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="font-bold text-zinc-700">{act.department}</p>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase">{act.batch} • {act.section || "Sec-A"}</p>
                            </td>
                            <td className="p-4 max-w-xs md:max-w-sm">
                              <p className="font-bold text-zinc-800 truncate">{act.activityName || act.title || registry?.name || "Unnamed Activity"}</p>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 uppercase bg-blue-50 text-blue-700 border border-blue-100`}>
                                {act.activityCode}
                              </span>
                            </td>
                            <td className="p-4 text-center font-bold text-zinc-700">{act.date || act.fromDate || "-"}</td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                                status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                                status === "Pending" ? "bg-amber-100 text-amber-800" :
                                status === "Returned" ? "bg-rose-100 text-rose-800" :
                                status === "Rejected" ? "bg-red-100 text-red-800" :
                                "bg-zinc-100 text-zinc-600"
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="p-4 text-center font-extrabold text-[#120c7a]">{act.points || act.totalPoints || "-"}</td>
                            <td className="p-4 text-center text-[10px] font-bold">
                              {registry?.nbaCriterion && <div className="text-blue-700">NBA: {registry.nbaCriterion}</div>}
                              {registry?.naacCriterion && <div className="text-emerald-700">NAAC: {registry.naacCriterion}</div>}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => {
                                  setViewActivity(act);
                                  setReviewActivity(act);
                                  setReturnComment("");
                                  setShowReturnInput(false);
                                }}
                                className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye size={12} />
                                {status === "Pending" ? "Review" : "View"}
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
        )} {/* end conditional */}
      </div>

      {/* View/Review Modal */}
      {reviewActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    Activity Verification Board
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewActivity.studentName || reviewActivity.facultyName} 
                    ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                  </p>
                </div>
              </div>
              <button onClick={() => setReviewActivity(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Event details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                  <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityCode}</span>
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
                  <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.points || reviewActivity.totalPoints} Pts</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                  <span className="text-sm font-bold text-zinc-800">{reviewActivity.department} / {reviewActivity.batch} / {reviewActivity.section || "Sec-A"}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    {reviewRegistry?.nbaCriterion ? `NBA: ${reviewRegistry.nbaCriterion}` : ""} 
                    {reviewRegistry?.naacCriterion ? ` | NAAC: ${reviewRegistry.naacCriterion}` : ""}
                  </span>
                </div>
              </div>

              {/* Additional fields based on activity type */}
              <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                {Object.entries(reviewActivity).filter(([k, v]) => 
                  v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName", "submittedById", "submittedByRole"].includes(k)
                ).map(([key, value]) => {
                  // 1. If key is 'formData'
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
                    return null; // Skip flat formData object since it is already spread
                  }

                  // 2. If key is 'evidenceFiles'
                  if (key === "evidenceFiles") {
                    if (Array.isArray(value) && value.length > 0) {
                      return (
                        <div key={key} className="space-y-1.5 w-full">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Attached Files Info
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {value.map((file, fIdx) => (
                              <div key={fIdx} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[10px] font-medium text-zinc-600 shadow-sm">
                                <FileText size={12} className="text-blue-500" />
                                <span>{file.name}</span>
                                <span className="text-[9px] text-zinc-400">({(file.size / 1024).toFixed(1)} KB)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }

                  // 3. Skip other metadata fields that are already in the main header
                  if (["submittedBy", "month", "academicYear", "semester", "programme"].includes(key)) {
                    return null;
                  }

                  // 4. Default key-value pair rendering
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

              {/* Return for correction */}
              {showReturnInput && (
                <div className="space-y-2 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <label className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider">Correction Feedback:</label>
                  <textarea
                    rows={3}
                    placeholder="Provide detailed feedback e.g., Certificate not legible, Wrong category selected, Missing signatures..."
                    value={returnComment}
                    onChange={e => setReturnComment(e.target.value)}
                    className="w-full rounded-xl border border-rose-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowReturnInput(false)} className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-lg cursor-pointer">Cancel</button>
                    <button onClick={handleReturn} disabled={isActioning} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                      {isActioning ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />} Return for Correction
                    </button>
                  </div>
                </div>
              )}

              {/* Previous comments */}
              {reviewActivity.comments && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">Reviewer Comments:</span>
                  <p className="text-sm text-blue-700">{reviewActivity.comments}</p>
                  {reviewActivity.reviewedByName && (
                    <p className="text-[10px] text-blue-500 font-medium mt-1">Reviewed by: {reviewActivity.reviewedByName}</p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div>
                {reviewActivity.status !== "Pending" && (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    reviewActivity.status === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}>
                    Review Complete • {reviewActivity.status}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setReviewActivity(null)} className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                  Close
                </button>

                {reviewActivity.status === "Pending" && !showReturnInput && (
                  <>
                    <button onClick={handleApprove} disabled={isActioning} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer">
                      {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                      Approve for Grade Points
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}