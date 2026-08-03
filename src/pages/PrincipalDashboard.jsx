import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, BookOpen, CreditCard, Briefcase,
  CheckCircle2, XCircle, Eye, Send, AlertTriangle, ArrowRight,
  UserCheck, Library, Activity, Zap, FileText, Clock,
  Calendar, DollarSign, Target, Award, BarChart3, Bell,
  ChevronRight, School, MapPin, X, User, Megaphone, Loader2, Globe, Building2
} from "lucide-react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { getEnquiriesRealtime, updateEnquiry, getEnquiryById } from "../services/enquiryService";
import { useDepartments } from "../hooks/useDepartments";
import { db } from "../firebase";
import { collection, getDocs, query, where, getCountFromServer, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { formatProgrammeKey, sanitizeKey as sanitizeKeyUtils } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
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

const formatCurrency = (value) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
};

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const { departments: allDeptMap } = useDepartments();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [editModal, setEditModal] = useState({ open: false, enquiry: null, saving: false });
  const [viewModal, setViewModal] = useState({ open: false, enquiry: null, loading: false });
  const [rejectModal, setRejectModal] = useState({ open: false, enquiry: null, saving: false, reason: "" });
  const [rejectError, setRejectError] = useState("");
  const [detailModal, setDetailModal] = useState({ open: false, enquiry: null });
  const [pendingPopup, setPendingPopup] = useState({ open: false });

  const [pendingReports, setPendingReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsPopup, setReportsPopup] = useState({ open: false });
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportPreviewModal, setShowReportPreviewModal] = useState(false);
  const [reportActivities, setReportActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  const [studentCount, setStudentCount] = useState(0);
  const [feeTotal, setFeeTotal] = useState(0);
  const [placedCount, setPlacedCount] = useState(0);
  const [activeDrives, setActiveDrives] = useState(0);
  const [bookCount, setBookCount] = useState(0);
  const [activeIssues, setActiveIssues] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [approvedAdmissionsDocs, setApprovedAdmissionsDocs] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [strengthModal, setStrengthModal] = useState({ open: false });
  const [selectedStrengthDept, setSelectedStrengthDept] = useState('All');
  const [attendanceModal, setAttendanceModal] = useState({ open: false });
  const [attendanceDate, setAttendanceDate] = useState('');
  const [todayAbsentees, setTodayAbsentees] = useState({});
  const [absenteesLoading, setAbsenteesLoading] = useState(false);
  const [selectedAbsentDept, setSelectedAbsentDept] = useState('All');

  const [pendingCirculars, setPendingCirculars] = useState([]);
  const [circularsLoading, setCircularsLoading] = useState(true);
  const [circularModal, setCircularModal] = useState({ open: false });
  const [selectedCircular, setSelectedCircular] = useState(null);
  const [showCircularPreview, setShowCircularPreview] = useState(false);
  const [circularReturnComment, setCircularReturnComment] = useState("");
  const [showCircularReturn, setShowCircularReturn] = useState(false);
  const [circularActioning, setCircularActioning] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "monthly_reports"),
      where("status", "==", "Principal_Pending")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setPendingReports(list);
      setReportsLoading(false);
    }, (err) => {
      console.error("Error loading monthly_reports:", err);
      setReportsLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch pending circulars
  useEffect(() => {
    const q = query(
      collection(db, "circulars"),
      where("status", "==", "Principal_Pending")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => ((a.createdAt || "") > (b.createdAt || "") ? -1 : 1));
      setPendingCirculars(list);
      setCircularsLoading(false);
    }, (err) => {
      console.error("Error loading circulars:", err);
      setCircularsLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedReport) {
      setReportActivities([]);
      return;
    }
    setActivitiesLoading(true);
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      where("status", "==", "Approved"),
      where("department", "==", selectedReport.department)
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const dateVal = data.date || data.fromDate || "";
        const m = dateVal.split("-")[1];
        const y = dateVal.split("-")[0];
        if (m && parseInt(m) === parseInt(selectedReport.month) && y === selectedReport.year) {
          list1.push({ id: d.id, ...data });
        }
      });
      combineAndSet();
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      where("status", "==", "Approved"),
      where("department", "==", selectedReport.department)
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const dateVal = data.date || data.fromDate || "";
        const m = dateVal.split("-")[1];
        const y = dateVal.split("-")[0];
        if (m && parseInt(m) === parseInt(selectedReport.month) && y === selectedReport.year) {
          list2.push({ id: d.id, isStep: true, activityCode: "STEP", ...data });
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
      setReportActivities(combined);
      setActivitiesLoading(false);
    };

    return () => {
      unsub1();
      unsub2();
    };
  }, [selectedReport]);

  const openReportsPopup = () => setReportsPopup({ open: true });
  const closeReportsPopup = () => setReportsPopup({ open: false });

  const handleApproveReport = async (rep) => {
    if (!rep) return;
    setIsActioning(true);
    try {
      await setDoc(doc(db, "monthly_reports", rep.id), {
        status: "Approved",
        approvedBy: auth.currentUser?.uid || "",
        approvedByName: "Principal",
        approvedAt: new Date().toISOString(),
        comments: "Approved by Principal"
      }, { merge: true });
      alert("Monthly report approved and signed successfully!");
      setSelectedReport(null);
      setShowReportPreviewModal(false);
    } catch (err) {
      console.error("Error approving report:", err);
      alert("Failed to approve report.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturnReport = async (rep) => {
    if (!rep) return;
    if (!returnComment.trim()) {
      alert("Please enter comments explaining the corrections needed.");
      return;
    }
    setIsActioning(true);
    try {
      await setDoc(doc(db, "monthly_reports", rep.id), {
        status: "Returned",
        comments: returnComment,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Monthly report returned for correction.");
      setSelectedReport(null);
      setShowReportPreviewModal(false);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning report:", err);
      alert("Failed to return report.");
    } finally {
      setIsActioning(false);
    }
  };

  // Circular handlers
  const handleApproveCircular = async (circ) => {
    if (!circ) return;
    setCircularActioning(true);
    try {
      await setDoc(doc(db, "circulars", circ.id), {
        status: "Approved",
        principalApprovedBy: auth.currentUser?.uid || "",
        principalApprovedByName: "Principal",
        principalApprovedAt: new Date().toISOString(),
        principalComments: "Approved by Principal"
      }, { merge: true });
      showToast("Circular approved and published to students!");
      setSelectedCircular(null);
      setShowCircularPreview(false);
    } catch (err) {
      console.error("Error approving circular:", err);
      showToast("Failed to approve circular", "error");
    } finally {
      setCircularActioning(false);
    }
  };

  const handleReturnCircular = async (circ) => {
    if (!circ) return;
    if (!circularReturnComment.trim()) {
      showToast("Please enter comments explaining the corrections needed.", "error");
      return;
    }
    setCircularActioning(true);
    try {
      await setDoc(doc(db, "circulars", circ.id), {
        status: "Returned",
        returnComment: circularReturnComment,
        returnedBy: auth.currentUser?.uid || "",
        returnedAt: new Date().toISOString()
      }, { merge: true });
      showToast("Circular returned for correction.");
      setSelectedCircular(null);
      setShowCircularPreview(false);
      setCircularReturnComment("");
      setShowCircularReturn(false);
    } catch (err) {
      console.error("Error returning circular:", err);
      showToast("Failed to return circular", "error");
    } finally {
      setCircularActioning(false);
    }
  };

  // Helper to extract image evidence URLs
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

  const partA_GuestLectures = useMemo(() => reportActivities.filter(a => a.activityCode === "B9" || (a.isStep && a.category === "industry")), [reportActivities]);
  const partA_Association = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "leadership"), [reportActivities]);
  const partA_Internships = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "industry" || (a.activityName || "").toLowerCase().includes("internship"))), [reportActivities]);
  const partA_OnlineCourses = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "onlineCourse"), [reportActivities]);
  const partA_PaperPresentations = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("present") || (a.activityType || "").toLowerCase().includes("present")))), [reportActivities]);
  const partA_Publications = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("publ") || (a.activityType || "").toLowerCase().includes("publ")))), [reportActivities]);
  const partA_Conferences = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "technical"), [reportActivities]);
  const partA_ExtraCurricular = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "sports" || a.category === "social")), [reportActivities]);
  const partA_Placements = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "placement"), [reportActivities]);

  const partB_Meetings = useMemo(() => reportActivities.filter(a => a.activityCode === "B1"), [reportActivities]);
  const partB_Advisory = useMemo(() => reportActivities.filter(a => a.activityCode === "B2"), [reportActivities]);
  const partB_Purchases = useMemo(() => reportActivities.filter(a => a.activityCode === "B3"), [reportActivities]);
  const partB_Mous = useMemo(() => reportActivities.filter(a => a.activityCode === "B4"), [reportActivities]);
  const partB_Parents = useMemo(() => reportActivities.filter(a => a.activityCode === "B5"), [reportActivities]);
  const partB_Audits = useMemo(() => reportActivities.filter(a => a.activityCode === "B7"), [reportActivities]);
  const partB_Newsletters = useMemo(() => reportActivities.filter(a => a.activityCode === "B8"), [reportActivities]);

  const partC_Phd = useMemo(() => reportActivities.filter(a => a.activityCode === "C1"), [reportActivities]);
  const partC_Publications = useMemo(() => reportActivities.filter(a => a.activityCode === "C2"), [reportActivities]);
  const partC_Attended = useMemo(() => reportActivities.filter(a => a.activityCode === "C3"), [reportActivities]);
  const partC_Organized = useMemo(() => reportActivities.filter(a => a.activityCode === "C4"), [reportActivities]);
  const partC_Online = useMemo(() => reportActivities.filter(a => a.activityCode === "C5"), [reportActivities]);
  const partC_Funding = useMemo(() => reportActivities.filter(a => a.activityCode === "C6"), [reportActivities]);
  const partC_Patents = useMemo(() => reportActivities.filter(a => a.activityCode === "C7"), [reportActivities]);
  const partC_Contributions = useMemo(() => reportActivities.filter(a => a.activityCode === "C8"), [reportActivities]);
  const partC_Achievements = useMemo(() => reportActivities.filter(a => a.activityCode === "C9"), [reportActivities]);

  const allReportImages = useMemo(() => {
    const imagesList = [];
    reportActivities.forEach(act => {
      const imgs = getImages(act);
      imgs.forEach(i => imagesList.push(i));
    });
    return imagesList;
  }, [reportActivities]);

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

  useEffect(() => {
    setLoading(true);
    const unsubscribe = getEnquiriesRealtime(
      (items) => { setApplications(items); setLoading(false); },
      () => setLoading(false)
    );
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [stuSnap, plcmtSnap, drivesSnap, booksSnap, issuesSnap] = await Promise.allSettled([
          getCountFromServer(query(collection(db, "students"))),
          getCountFromServer(query(collection(db, "placement_offers"), where("status", "==", "Accepted"))),
          getCountFromServer(query(collection(db, "placement_drives"), where("status", "==", "Active"))),
          getCountFromServer(query(collection(db, "books"))),
          getCountFromServer(query(collection(db, "book_issues"), where("returned", "==", false))),
        ]);

        if (stuSnap.status === "fulfilled") setStudentCount(stuSnap.value.data().count);
        if (plcmtSnap.status === "fulfilled") setPlacedCount(plcmtSnap.value.data().count);
        if (drivesSnap.status === "fulfilled") setActiveDrives(drivesSnap.value.data().count);
        if (booksSnap.status === "fulfilled") setBookCount(booksSnap.value.data().count);
        if (issuesSnap.status === "fulfilled") setActiveIssues(issuesSnap.value.data().count);

        const feeSnap = await getDocs(collection(db, "fee_payments"));
        let total = 0;
        feeSnap.forEach((d) => {
          const data = d.data();
          if (data.status === "SUCCESS") {
            total += Number(data.chargedAmount || data.amount) || 0;
          }
        });
        setFeeTotal(total);
      } catch (err) {
        console.error("Stats load error:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, []);

  // Fetch semester configs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'semester_config'), (snap) => {
      const configs = [];
      snap.forEach(d => { configs.push({ id: d.id, ...d.data() }); });
      setSemesterConfigs(configs);
    });
    return () => unsub();
  }, []);

  // Fetch approved_admissions (unassigned students by batch/prog/dept)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'approved_admissions'), (snap) => {
      const docs = [];
      snap.forEach(d => {
        docs.push({ id: d.id, ...d.data() });
      });
      setApprovedAdmissionsDocs(docs);
    });
    return () => unsub();
  }, []);

  // Fetch all students (section-assigned)
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const snap = await getDocs(collection(db, 'students'));
        const list = [];
        snap.forEach(d => { list.push({ id: d.id, ...d.data() }); });
        setStudentsList(list);
      } catch (err) {
        console.error("Error fetching students:", err);
      }
    };
    fetchStudents();
  }, []);

  const admissionItems = useMemo(() => applications.filter((e) => e.status === "Admission"), [applications]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: applications.length,
      today: applications.filter((e) => new Date(e.createdAt).toDateString() === today).length,
      new: applications.filter((e) => e.status === "Enquiry").length,
      application: applications.filter((e) => e.status === "Application").length,
      admission: applications.filter((e) => e.status === "Admission").length,
      approved: applications.filter((e) => e.status === "Approved").length,
      rejected: applications.filter((e) => e.status === "Rejected").length,
    };
  }, [applications]);

  const pendingApprovals = useMemo(() => {
    return admissionItems.slice(0, 10);
  }, [admissionItems]);

  const departmentList = useMemo(() => {
    return Object.values(allDeptMap || {}).flat().sort((a, b) => a.localeCompare(b));
  }, [allDeptMap]);

  const activeBatches = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const set = new Set();
    semesterConfigs.forEach(cfg => {
      if (!cfg.startDate || !cfg.endDate) return;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const end = new Date(cfg.endDate + 'T00:00:00');
      if (today < start || today > end) return;
      const batches = Array.isArray(cfg.batch) ? cfg.batch : (cfg.batch ? [cfg.batch] : []);
      batches.forEach(b => set.add(b));
    });
    return set;
  }, [semesterConfigs]);

  const deptBatchStrength = useMemo(() => {
    if (activeBatches.size === 0) return {};

    // department -> batch -> { approved, assigned, total }
    const deptMap = {};

    const ensureDept = (dept, batch) => {
      if (!deptMap[dept]) deptMap[dept] = {};
      if (!deptMap[dept][batch]) deptMap[dept][batch] = { batch, approved: 0, assigned: 0, total: 0 };
    };

    const parseDocId = (docId) => {
      // Format: {batch}_{progKey}_{deptKey}[_section]
      // batch is always YYYY-YYYY format
      const batchMatch = docId.match(/(\d{4}-\d{4})/);
      const batch = batchMatch ? batchMatch[1] : '';
      // dept is last segment (before optional Sec- section suffix)
      const parts = docId.split('_');
      let dept = '';
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        // If last part is a section suffix like Sec-A, use second-to-last
        if (/^Sec-/i.test(lastPart) && parts.length > 2) {
          dept = parts[parts.length - 2];
        } else {
          dept = lastPart;
        }
      }
      return { batch, dept };
    };

    // approved_admissions: each doc = {batch}_{progKey}_{deptKey}, data = { [regNo]: name, _order: [...] }
    approvedAdmissionsDocs.forEach(d => {
      const { batch, dept } = parseDocId(d.id || '');
      if (!batch || !dept || !activeBatches.has(batch)) return;
      ensureDept(dept, batch);
      // Count student entries (skip meta fields and the synthetic 'id' field)
      Object.entries(d).forEach(([key, val]) => {
        if (key.startsWith('_') || key === 'id') return;
        if (typeof val === 'string' && val.trim()) {
          deptMap[dept][batch].approved++;
          deptMap[dept][batch].total++;
        }
      });
    });

    // students collection: each doc = {batch}_{progKey}_{deptKey}[_section], data = { [regNo]: name or {name}, _meta? }
    studentsList.forEach(d => {
      const { batch, dept } = parseDocId(d.id || '');
      if (!batch || !dept || !activeBatches.has(batch)) return;
      ensureDept(dept, batch);
      // Count student entries (skip meta fields and the synthetic 'id' field)
      Object.entries(d).forEach(([key, val]) => {
        if (key.startsWith('_') || key === 'id') return;
        const name = typeof val === 'object' && val !== null ? (val.name || '') : val;
        if (name && typeof name === 'string') {
          deptMap[dept][batch].assigned++;
          deptMap[dept][batch].total++;
        }
      });
    });

    return deptMap;
  }, [activeBatches, approvedAdmissionsDocs, studentsList]);

  const totalStrength = useMemo(() => {
    let total = 0;
    Object.values(deptBatchStrength).forEach(batchMap => {
      Object.values(batchMap).forEach(b => { total += b.total; });
    });
    return total;
  }, [deptBatchStrength]);

  const departmentsWithData = useMemo(() => {
    return Object.keys(deptBatchStrength).sort();
  }, [deptBatchStrength]);

  const openViewModal = async (app) => {
    setViewModal({ open: true, enquiry: app, loading: true });
    if (app?.enquiryId) {
      try {
        const fresh = await getEnquiryById(app.enquiryId);
        setViewModal({ open: true, enquiry: fresh || app, loading: false });
        return;
      } catch (e) { console.error(e); }
    }
    setViewModal({ open: true, enquiry: app, loading: false });
  };

  const closeViewModal = () => setViewModal({ open: false, enquiry: null, loading: false });
  const openEditModal = (app) => setEditModal({ open: true, enquiry: app, saving: false });
  const closeEditModal = () => setEditModal({ open: false, enquiry: null, saving: false });

  const handleEditSave = async (values) => {
    if (!editModal.enquiry?.enquiryId) return;
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(editModal.enquiry.enquiryId, { ...editModal.enquiry, ...values });
      showToast("Application updated successfully");
      closeEditModal();
    } catch (error) {
      console.error("Edit save error:", error);
      showToast("Failed to update application", "error");
      setEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const addStudentToNamelist = async (app) => {
    try {
      const regNo = app.applicationNo || app.enquiryId;
      if (!regNo) return;
      const name = [app.firstName, app.lastName].filter(Boolean).join(" ").trim() || app.studentName || "-";
      const progKey = formatProgrammeKey(app.programme);
      if (!app.batch || !progKey || !app.department) return;
      const studentDocId = `${sanitizeKey(app.batch)}_${progKey}_${sanitizeKey(app.department)}`;
      const studentRef = doc(db, 'approved_admissions', studentDocId);
      const snap = await getDoc(studentRef);
      const existingData = snap.exists() ? snap.data() : {};
      const order = existingData._order || [];
      if (!existingData[regNo]) {
        order.push(regNo);
      }
      const joiningAY = existingData._joiningAY || {};
      await setDoc(studentRef, {
        ...existingData,
        [regNo]: name,
        _order: order,
        _meta: { ...(existingData._meta || {}), department: app.department },
        _joiningAY: { ...joiningAY, [regNo]: app.academicYear || "" }
      });
    } catch (err) {
      console.error("Failed to add student to namelist:", err);
    }
  };

  const handleApprove = async (app) => {
    try {
      await updateEnquiry(app.enquiryId, { ...app, status: "Approved" });
      await addStudentToNamelist(app);
      showToast("Admitted successfully");
    } catch (err) {
      console.error("Approve error:", err);
      showToast("Failed to approve admission", "error");
    }
  };

  const openRejectModal = (app) => {
    setRejectModal({ open: true, enquiry: app, saving: false, reason: "" });
    setRejectError("");
  };

  const closeRejectModal = () => {
    setRejectModal({ open: false, enquiry: null, saving: false, reason: "" });
    setRejectError("");
  };

  const openPendingPopup = () => setPendingPopup({ open: true });
  const closePendingPopup = () => setPendingPopup({ open: false });

  const openDetailModal = async (app) => {
    setDetailModal({ open: true, enquiry: null });
    if (app?.enquiryId) {
      try {
        const fresh = await getEnquiryById(app.enquiryId);
        setDetailModal({ open: true, enquiry: fresh || app });
        return;
      } catch (e) { console.error(e); }
    }
    setDetailModal({ open: true, enquiry: app });
  };

  const closeDetailModal = () => setDetailModal({ open: false, enquiry: null });

  const parseAttendanceDocId = (docId) => {
    const parts = docId.split('_');
    const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
    if (batchIdx < 1) return null;
    const batch = parts[batchIdx];

    const knownProgKeys = ['UG_B_Tech', 'UG_M_Tech', 'UG_B_E', 'UG_M_E', 'B_Tech', 'M_Tech', 'B_E', 'M_E'];
    const progDisplayMap = { B_E: 'B.E.', B_Tech: 'B.Tech.', M_E: 'M.E.', M_Tech: 'M.Tech.' };
    let progEndIdx = -1;
    let progDisplay = '';
    for (const pk of knownProgKeys) {
      const pkParts = pk.split('_');
      if (parts.slice(0, pkParts.length).join('_') === pk) {
        progEndIdx = pkParts.length;
        const baseKey = pk.replace(/^UG_/, '');
        progDisplay = progDisplayMap[baseKey] || '';
        break;
      }
    }
    if (progEndIdx < 0) progEndIdx = 1;
    const progKey = parts.slice(0, progEndIdx).join('_');
    const deptKey = parts.slice(progEndIdx, batchIdx).join('_').trim();
    return { batch, deptKey, progKey, progDisplay };
  };

  const fetchAbsenteesForDate = async (date) => {
    setAbsenteesLoading(true);
    try {
      const snap = await getDocs(collection(db, 'attendance'));
      const absentees = {};
      const nameMap = {};

      approvedAdmissionsDocs.forEach(d => {
        Object.entries(d).forEach(([key, val]) => {
          if (key.startsWith('_') || key === 'id') return;
          if (typeof val === 'string' && val.trim()) nameMap[key] = val.trim();
        });
      });
      studentsList.forEach(d => {
        Object.entries(d).forEach(([key, val]) => {
          if (key.startsWith('_') || key === 'id') return;
          const name = typeof val === 'object' && val !== null ? (val.name || '') : String(val);
          if (name && name.trim()) nameMap[key] = name.trim();
        });
      });

      // Collect unique enrollment doc IDs
      const enrolDocIds = new Set();
      const docInfos = []; // { enrolDocId, deptLabel, regNo }
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data?.records) return;

        const parsed = parseAttendanceDocId(docSnap.id);
        if (!parsed || !activeBatches.has(parsed.batch)) return;

        // Extract ay, semNum, subjectCode for enrollment check
        const parts = docSnap.id.split('_');
        const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
        if (batchIdx < 0 || batchIdx + 3 >= parts.length) return;
        const ay = parts[batchIdx + 1];
        const semNum = parts[batchIdx + 2];
        const subjectCodeStart = batchIdx + 3;
        let subjectCode = parts.slice(subjectCodeStart).join('_').replace(/_(Sec-\w+)$/, '');

        const enrolDocId = `${parsed.progKey || ''}_${sanitizeKey(parsed.deptKey)}_${sanitizeKey(parsed.batch)}_${sanitizeKey(ay)}_${semNum}_${sanitizeKey(subjectCode)}`;

        Object.entries(data.records).forEach(([recordKey, record]) => {
          const datePart = recordKey.includes('_P') ? recordKey.split('_P')[0] : recordKey;
          if (datePart !== date) return;

          Object.entries(record.students || {}).forEach(([regNo, hVal]) => {
            const hrs = typeof hVal === 'object' && hVal !== null ? (hVal.hours ?? 0) : (hVal ?? 0);
            if (Number(hrs) === 0 || hVal === false) {
              const deptLabel = parsed.progDisplay ? `${parsed.progDisplay} ${parsed.deptKey}` : parsed.deptKey;
              enrolDocIds.add(enrolDocId);
              docInfos.push({ enrolDocId, deptLabel, regNo });
            }
          });
        });
      });

      // Fetch enrollment data for all unique subjects
      const enrolMap = {};
      await Promise.all([...enrolDocIds].map(async (eid) => {
        try {
          const eSnap = await getDoc(doc(db, 'course_enrolments', eid));
          if (eSnap.exists()) {
            const eData = eSnap.data();
            enrolMap[eid] = new Set(Object.keys(eData).filter(k => eData[k]));
          }
        } catch (e) { /* enrollment doc may not exist */ }
      }));

      // Build final absentees map filtered by enrollment
      docInfos.forEach(({ enrolDocId, deptLabel, regNo }) => {
        const enrolledSet = enrolMap[enrolDocId];
        if (enrolledSet && !enrolledSet.has(regNo)) return; // not enrolled → skip
        if (!absentees[deptLabel]) absentees[deptLabel] = {};
        absentees[deptLabel][regNo] = nameMap[regNo] || regNo;
      });

      setTodayAbsentees(absentees);
    } catch (err) {
      console.error("Error fetching absentees:", err);
    } finally {
      setAbsenteesLoading(false);
    }
  };

  const openAttendanceModal = async () => {
    const today = new Date().toISOString().split('T')[0];
    setAttendanceDate(today);
    setAttendanceModal({ open: true });
    setSelectedAbsentDept('All');
    await fetchAbsenteesForDate(today);
  };

  const handleConfirmReject = async () => {
    const app = rejectModal.enquiry;
    if (!app?.enquiryId) return;
    if (!rejectModal.reason.trim()) { setRejectError("Please fill the message"); return; }
    setRejectModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateEnquiry(app.enquiryId, { ...app, status: "Rejected", remarks: rejectModal.reason || "Rejected by Principal" });
      showToast("Admission rejected");
      closeRejectModal();
    } catch (err) {
      console.error("Reject error:", err);
      showToast("Failed to reject admission", "error");
      setRejectModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const kpiCards = [
    { key: "students", label: "Student Strength", value: totalStrength, icon: GraduationCap, color: "blue", href: null, onClick: "strengthModal", format: (v) => v.toLocaleString() },
    { key: "pending", label: "Admission Pending Approvals", value: stats.admission, icon: Clock, color: "amber", href: null, onClick: "pendingPopup", format: (v) => String(v) },
    { key: "monthlyReports", label: "Monthly Reports Pending", value: pendingReports.length, icon: FileText, color: "rose", href: null, onClick: "reportsPopup", format: (v) => String(v) },
    { key: "enquiries", label: "Total Enquiries", value: stats.total, icon: FileText, color: "indigo", href: "/admissions/enquiries", format: (v) => v.toLocaleString() },
    { key: "placed", label: "Students Placed", value: placedCount, icon: Briefcase, color: "emerald", href: "/placement/dashboard", format: (v) => v.toLocaleString() },
    { key: "fee", label: "Fee Collected", value: feeTotal, icon: CreditCard, color: "violet", href: "/fee/dashboard", format: (v) => formatCurrency(v) },
    { key: "circulars", label: "Circulars Pending", value: pendingCirculars.length, icon: Megaphone, color: "cyan", href: null, onClick: "circularModal", format: (v) => String(v) },
  ];

  const colorMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-500" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200", gradient: "from-indigo-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", gradient: "from-emerald-500" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200", gradient: "from-violet-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200", gradient: "from-rose-500" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-600", iconBg: "bg-cyan-100", border: "border-cyan-200", gradient: "from-cyan-500" },
  };

  const quickActions = [
    { label: "Admission Confirmation", icon: UserCheck, desc: "Review & approve applications", href: "/admissions/confirm", color: "bg-emerald-500" },
    { label: "Fee Dashboard", icon: DollarSign, desc: "Fee collection & reports", href: "/fee/dashboard", color: "bg-violet-500" },
    { label: "Placement Overview", icon: Briefcase, desc: "Drives, offers & placements", href: "/placement/dashboard", color: "bg-blue-500" },
    { label: "Library", icon: Library, desc: "Catalog, circulation & reports", href: "/library/catalog", color: "bg-amber-500" },
    { label: "Attendance", icon: Activity, desc: "Daily & overall attendance", color: "bg-rose-500", onClick: "attendanceModal" },
    { label: "Course Enrolment", icon: BookOpen, desc: "Student course registration", href: "/course-enrolment", color: "bg-cyan-500" },
    { label: "Academic Calendar", icon: Calendar, desc: "Events & holidays", href: "/academic-calendar", color: "bg-orange-500" },
    { label: "Marks Entry", icon: Award, desc: "Internal assessment marks", href: "/markk", color: "bg-teal-500" },
  ];

  const moduleCards = [
    {
      title: "Admissions", icon: UserCheck, color: "emerald",
      href: "/admissions/seats",
      stats: [
        { label: "Today", value: stats.today },
        { label: "Enquiries", value: stats.new },
        { label: "Applications", value: stats.application },
        { label: "Admitted", value: stats.approved },
      ]
    },
    {
      title: "Fee Management", icon: CreditCard, color: "violet",
      href: "/fee/dashboard",
      stats: [
        { label: "Collected", value: formatCurrency(feeTotal) },
        { label: "Active Drives", value: activeDrives },
      ]
    },
    {
      title: "Placements", icon: Briefcase, color: "blue",
      href: "/placement/dashboard",
      stats: [
        { label: "Placed", value: placedCount },
        { label: "Active Drives", value: activeDrives },
      ]
    },
    {
      title: "Library", icon: Library, color: "amber",
      href: "/library/catalog",
      stats: [
        { label: "Books", value: bookCount },
        { label: "Issued", value: activeIssues },
      ]
    },
    {
      title: "Academics", icon: GraduationCap, color: "rose",
      href: "/academic-calendar",
      stats: [
        { label: "Students", value: studentCount },
        { label: "Courses", value: "-" },
      ]
    },
    {
      title: "Outcome Based Edu.", icon: Target, color: "cyan",
      href: "/po-attainment",
      stats: [
        { label: "CO's", value: "-" },
        { label: "PO's", value: "-" },
      ]
    },
  ];

  return (
    <>
      <Layout title="Principal Dashboard">
        <style>{`
          @media print {
            /* Hide default browser headers/footers */
            @page {
              size: A4;
              margin: 0;
            }
            /* Hide all screen-only/non-essential elements */
            .no-print, header, nav, aside, footer, button, .action-bar, .modal-backdrop, .modal {
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
        <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">

          {/* Welcome Header */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-white/10">
                    <School size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Principal Dashboard</h1>
                    <p className="text-blue-200 text-sm">{dateStr}</p>
                  </div>
                </div>
                <p className="text-blue-100/80 text-sm mt-2 max-w-xl">
                  Overview of institution activities across all departments and modules.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate("/admissions/confirm")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                  <Bell size={16} />
                  <span className="hidden sm:inline">Pending</span>
                  {stats.admission > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {stats.admission}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {kpiCards.map((kpi) => {
              const c = colorMap[kpi.color];
              const Icon = kpi.icon;
              const navHref = kpi.href;
              const handleClick = () => {
                if (kpi.onClick === "pendingPopup") openPendingPopup();
                else if (kpi.onClick === "reportsPopup") openReportsPopup();
                else if (kpi.onClick === "strengthModal") setStrengthModal({ open: true });
                else if (kpi.onClick === "circularModal") setCircularModal({ open: true });
                else if (navHref) navigate(navHref);
              };
              const clickable = !!(navHref || kpi.onClick);
              return (
                <div key={kpi.key}
                  onClick={handleClick}
                  className={`relative bg-white rounded-2xl border ${c.border} shadow-sm p-5 transition-all duration-200 ${clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                      <Icon size={20} className={c.text} />
                    </div>
                    {navHref && <ChevronRight size={16} className="text-zinc-300" />}
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 tracking-tight">
                    {statsLoading && ["students", "placed", "fee"].includes(kpi.key) ? (
                      <span className="inline-block w-16 h-6 rounded bg-zinc-200 animate-pulse" />
                    ) : (
                      kpi.format(kpi.value)
                    )}
                  </p>
                  <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{kpi.label}</p>
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.gradient} to-transparent rounded-b-2xl`} />
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Zap size={20} className="text-amber-500" />
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
              {quickActions.map((action) => (
                <button key={action.label}
                  onClick={() => {
                    if (action.onClick === 'attendanceModal') openAttendanceModal();
                    else if (action.href) navigate(action.href);
                  }}
                  className="group bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mx-auto mb-2 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                    <action.icon size={18} className="text-white" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-700 leading-tight">{action.label}</p>
                  <p className="text-[9px] text-zinc-400 mt-0.5 hidden sm:block">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Admission Pending Approvals */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Clock size={20} className="text-amber-500" />
                Admission Pending Approvals
                {stats.admission > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{stats.admission}</span>
                )}
              </h2>
              <button onClick={() => navigate("/admissions/confirm")}
                className="text-xs font-semibold text-[#120c7a] hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              </div>
            ) : pendingApprovals.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">All Clear!</h3>
                <p className="text-sm text-zinc-500 mt-1">No pending approvals. All applications have been processed.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Applicant</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Application No</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dept. Choice</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pendingApprovals.map((app) => (
                        <tr key={app.enquiryId} onClick={() => openDetailModal(app)} className="hover:bg-zinc-50/50 transition-colors cursor-pointer">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#120c7a]/10 text-[#120c7a] flex items-center justify-center text-xs font-bold">
                                {(app.firstName || app.studentName || "?").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-zinc-900">
                                  {app.firstName || app.lastName
                                    ? `${app.firstName || ""} ${app.lastName || ""}`.trim()
                                    : app.studentName || "-"}
                                </p>
                                <p className="text-[10px] text-zinc-500">{app.mobile || "-"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#120c7a]">{app.applicationNo || app.enquiryId}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold border border-blue-100">
                              {app.department || app.department2 || app.department3 || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-zinc-600">{formatDate(app.enquiryDate || app.createdAt)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(app); }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                title="Admit">
                                <CheckCircle2 size={12} /> Admit
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openRejectModal(app); }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-bold border border-red-200 hover:bg-red-100 transition-colors"
                                title="Reject">
                                <XCircle size={12} /> Reject
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openViewModal(app); }}
                                className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:border-[#120c7a] hover:text-[#120c7a] transition-colors"
                                title="View">
                                <Eye size={14} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openEditModal(app); }}
                                className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:border-blue-500 hover:text-blue-600 transition-colors"
                                title="Edit">
                                <Send size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Circular Pending Approvals */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Megaphone size={20} className="text-cyan-500" />
                Circulars Pending Approval
                {pendingCirculars.length > 0 && (
                  <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-bold">{pendingCirculars.length}</span>
                )}
              </h2>
              <button onClick={() => setCircularModal({ open: true })}
                className="text-xs font-semibold text-[#120c7a] hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </button>
            </div>
            {circularsLoading ? (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              </div>
            ) : pendingCirculars.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">All Circulars Processed!</h3>
                <p className="text-sm text-zinc-500 mt-1">No circulars pending your approval.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Title</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Type</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">From</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pendingCirculars.slice(0, 5).map((circ) => (
                        <tr key={circ.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-zinc-900 truncate max-w-xs">{circ.title}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              circ.type === "institution"
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              {circ.type === "institution" ? <Globe size={11} /> : <Building2 size={11} />}
                              {circ.type === "institution" ? "Institution" : "Department"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-zinc-700">{circ.createdByName || "Unknown"}</td>
                          <td className="px-5 py-4 text-sm text-zinc-500">{formatDate(circ.createdAt)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedCircular(circ); setShowCircularPreview(true); }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 text-white text-[11px] font-bold shadow-sm hover:shadow-md transition-all"
                                title="Review">
                                <Eye size={12} /> Review
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingCirculars.length > 5 && (
                  <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 text-center">
                    <button onClick={() => setCircularModal({ open: true })}
                      className="text-xs font-semibold text-[#120c7a] hover:underline">
                      View all {pendingCirculars.length} circulars
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Module Overview */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-indigo-500" />
                Module Overview
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {moduleCards.map((mod) => {
                const c = colorMap[mod.color];
                const Icon = mod.icon;
                return (
                  <div key={mod.title}
                    onClick={() => navigate(mod.href)}
                    className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                        <Icon size={18} className={c.text} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-zinc-900">{mod.title}</h3>
                      </div>
                      <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {mod.stats.map((s) => (
                        <div key={s.label}>
                          <p className="text-lg font-bold text-zinc-900">{s.value}</p>
                          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {toast.show && (
          <div className={`fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl ${
            toast.type === "success" ? "bg-emerald-700" : "bg-red-600"
          }`}>
            {toast.message}
          </div>
        )}
      </Layout>

      <AddEnquiryModal open={editModal.open} mode="edit" initialValues={editModal.enquiry}
        departments={departmentList} saving={editModal.saving}
        onClose={closeEditModal} onSubmit={handleEditSave} />

      <AddEnquiryModal open={viewModal.open} mode="view" initialValues={viewModal.enquiry}
        departments={departmentList} saving={false}
        onClose={closeViewModal} onSubmit={closeViewModal} />

      {rejectModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeRejectModal} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Reject Admission</h3>
                <p className="text-sm text-zinc-500">{rejectModal.enquiry?.firstName || rejectModal.enquiry?.studentName}</p>
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Reason for Rejection</span>
              <textarea value={rejectModal.reason}
                onChange={(e) => { setRejectModal((prev) => ({ ...prev, reason: e.target.value })); setRejectError(""); }}
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all resize-none ${
                  rejectError ? "border-red-400 ring-2 ring-red-100" : "border-zinc-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                }`}
                placeholder="Enter reason for rejecting this admission..." />
              {rejectError && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertTriangle size={12} /> {rejectError}
                </p>
              )}
            </label>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeRejectModal}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50">
                Cancel
              </button>
              <button type="button" disabled={rejectModal.saving} onClick={handleConfirmReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                {rejectModal.saving ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPopup.open && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closePendingPopup} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-amber-500" />
                <h3 className="text-lg font-bold text-zinc-900">Admission Pending Approvals</h3>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{admissionItems.length}</span>
              </div>
              <button onClick={closePendingPopup} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <X size={18} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {admissionItems.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                  <p className="text-zinc-500 font-medium">No pending approvals</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {admissionItems.map((app) => {
                    const name = app.firstName || app.lastName
                      ? `${app.firstName || ""} ${app.lastName || ""}`.trim()
                      : app.studentName || "-";
                    return (
                      <div key={app.enquiryId} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#120c7a]/10 text-[#120c7a] flex items-center justify-center text-xs font-bold shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate">{name}</p>
                            <p className="text-[11px] text-zinc-500 truncate">
                              {app.applicationNo || app.enquiryId} | {app.department || app.department2 || app.department3 || "-"} | {app.mobile || "-"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          <button onClick={(e) => { e.stopPropagation(); handleApprove(app); closePendingPopup(); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            title="Admit">
                            <CheckCircle2 size={12} /> Admit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/admissions/confirm/${app.enquiryId}`); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-bold border border-red-200 hover:bg-red-100 transition-colors"
                            title="Reject">
                            <XCircle size={12} /> Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detailModal.open && detailModal.enquiry && (
        <div className="fixed inset-0 z-[180] flex items-start justify-center pt-10 pb-10 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDetailModal} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <User size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {detailModal.enquiry.firstName || detailModal.enquiry.lastName
                        ? `${detailModal.enquiry.firstName || ""} ${detailModal.enquiry.lastName || ""}`.trim()
                        : detailModal.enquiry.studentName || "Applicant"}
                    </h2>
                    <p className="text-blue-200 text-xs">
                      {detailModal.enquiry.gender && `${detailModal.enquiry.gender} | `}
                      App No: {detailModal.enquiry.applicationNo || "N/A"}
                    </p>
                  </div>
                </div>
                <button onClick={closeDetailModal} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">
              {/* Personal Information */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                  <User size={15} className="text-[#120c7a]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Personal Information</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  {[
                    ["Applicant Name", detailModal.enquiry.firstName || detailModal.enquiry.lastName
                      ? `${detailModal.enquiry.firstName || ""} ${detailModal.enquiry.lastName || ""}`.trim()
                      : detailModal.enquiry.studentName],
                    ["Father / Guardian", detailModal.enquiry.fatherGuardianName],
                    ["Mother Name", detailModal.enquiry.motherName],
                    ["Date of Birth", detailModal.enquiry.dateOfBirth],
                    ["Gender", detailModal.enquiry.gender],
                    ["Nationality", detailModal.enquiry.nationality],
                    ["Religion", detailModal.enquiry.religion],
                    ["Community / Caste", [detailModal.enquiry.community, detailModal.enquiry.caste].filter(Boolean).join(" / ")],
                    ["Mother Tongue", detailModal.enquiry.motherTongue],
                    ["Blood Group", detailModal.enquiry.bloodGroup],
                    ["Aadhar No", detailModal.enquiry.aadharNo],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider shrink-0">{label}</span>
                      <span className="text-zinc-800 font-medium text-right">{value || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact & Address */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                  <MapPin size={15} className="text-[#120c7a]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Contact & Address</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  {[
                    ["Mobile", detailModal.enquiry.mobile],
                    ["Parent Mobile", detailModal.enquiry.parentMobile],
                    ["Email", detailModal.enquiry.emailId],
                    ["Present Address", [detailModal.enquiry.presentAddress, detailModal.enquiry.presentCity, detailModal.enquiry.presentDistrict, detailModal.enquiry.presentState, detailModal.enquiry.presentPincode].filter(Boolean).join(", ")],
                    ["Permanent Address", [detailModal.enquiry.permanentAddress, detailModal.enquiry.permanentCity, detailModal.enquiry.permanentDistrict, detailModal.enquiry.permanentState, detailModal.enquiry.permanentPincode].filter(Boolean).join(", ")],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider shrink-0">{label}</span>
                      <span className="text-zinc-800 font-medium text-right">{value || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Academic Details */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                  <GraduationCap size={15} className="text-[#120c7a]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Academic Details</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  {[
                    ["Programme", detailModal.enquiry.programme],
                    ["Batch", detailModal.enquiry.batch],
                    ["Qualifying Exam", detailModal.enquiry.qualifyingExamProgrammes],
                    ["Institute", detailModal.enquiry.qualifyingExamInstitute],
                    ["Board / University", detailModal.enquiry.qualifyingExamBoardUniversity],
                    ["Maths Mark", detailModal.enquiry.mathsMark],
                    ["Physics Mark", detailModal.enquiry.physicsMark],
                    ["Chemistry Mark", detailModal.enquiry.chemistryMark],
                    ["Total Marks", detailModal.enquiry.totalMarks],
                    ["Cutoff", detailModal.enquiry.cutoff],
                    ["Eligibility", detailModal.enquiry.eligibility],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider shrink-0">{label}</span>
                      <span className="text-zinc-800 font-medium text-right">{value || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Department Choices */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                  <FileText size={15} className="text-[#120c7a]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Department Choices</span>
                </div>
                <div className="p-4 grid grid-cols-3 gap-3">
                  {[
                    ["Choice 1", detailModal.enquiry.department],
                    ["Choice 2", detailModal.enquiry.department2],
                    ["Choice 3", detailModal.enquiry.department3],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-semibold text-[#120c7a] mt-0.5">{value}</p>
                    </div>
                  ))}
                  {[detailModal.enquiry.department, detailModal.enquiry.department2, detailModal.enquiry.department3].filter(Boolean).length === 0 && (
                    <p className="col-span-3 text-sm text-zinc-400 text-center py-2">No departments chosen</p>
                  )}
                </div>
              </div>

              {/* Payments */}
              {detailModal.enquiry.payments && detailModal.enquiry.payments.length > 0 && (
                <div className="rounded-xl border border-zinc-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                    <CreditCard size={15} className="text-[#120c7a]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Payments</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {detailModal.enquiry.payments.map((p, i) => (
                      <div key={i} className="grid grid-cols-4 gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Category</p>
                          <p className="text-xs font-semibold text-zinc-700">{p.feeCategory || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Amount</p>
                          <p className="text-xs font-semibold text-zinc-700">{p.feeAmount || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mode</p>
                          <p className="text-xs font-semibold text-zinc-700">{p.paymentMode || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Date</p>
                          <p className="text-xs font-semibold text-zinc-700">{p.paymentDate || "-"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer - Actions */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <button onClick={closeDetailModal}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100">
                Close
              </button>
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); handleApprove(detailModal.enquiry); closeDetailModal(); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md">
                  <CheckCircle2 size={16} /> Admit
                </button>
                <button onClick={(e) => { e.stopPropagation(); openRejectModal(detailModal.enquiry); closeDetailModal(); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md">
                  <XCircle size={16} /> Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Strength Modal */}
      {strengthModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setStrengthModal({ open: false })}>
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-800">Student Strength by Department</h3>
                  <p className="text-[11px] text-zinc-500">{totalStrength.toLocaleString()} total students across {departmentsWithData.length} departments</p>
                </div>
              </div>
              <button onClick={() => setStrengthModal({ open: false })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {departmentsWithData.length === 0 ? (
                <p className="text-xs text-zinc-400 italic text-center py-12">No student data available for active semesters</p>
              ) : (
                <div className="space-y-6">
                  {/* Department selector */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedStrengthDept('All')}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                        selectedStrengthDept === 'All'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      All ({departmentsWithData.length})
                    </button>
                    {departmentsWithData.map(dept => (
                      <button
                        key={dept}
                        onClick={() => setSelectedStrengthDept(dept)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                          selectedStrengthDept === dept
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>

                  {/* Chart */}
                  {(() => {
                    if (selectedStrengthDept === 'All') {
                      // Comparative chart: one bar per department (total)
                      const deptTotals = departmentsWithData.map(dept => {
                        const total = Object.values(deptBatchStrength[dept]).reduce((s, b) => s + b.total, 0);
                        return { dept, total };
                      });
                      const maxVal = Math.max(...deptTotals.map(d => d.total), 1);
                      const MAX_BAR_H = 160;
                      const barColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-blue-500', 'bg-orange-500'];
                      const borderColors = ['border-indigo-600', 'border-emerald-600', 'border-violet-600', 'border-amber-600', 'border-rose-600', 'border-cyan-600', 'border-blue-600', 'border-orange-600'];
                      return (
                        <div>
                          <p className="text-[11px] font-bold text-zinc-500 mb-3 uppercase tracking-wider">Comparative — Total per Department</p>
                          <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
                            <div className="flex items-end justify-around gap-2" style={{ height: `${MAX_BAR_H + 52}px` }}>
                              {deptTotals.map((d, i) => {
                                const barH = Math.max((d.total / maxVal) * MAX_BAR_H, 6);
                                return (
                                  <div key={d.dept} className="flex flex-col items-center flex-1 min-w-0">
                                    <span className="text-lg font-black text-zinc-800 mb-1">{d.total}</span>
                                    <div
                                      className={`w-full max-w-[48px] rounded-t-xl ${barColors[i % barColors.length]} border-b-4 ${borderColors[i % borderColors.length]} shadow-md`}
                                      style={{ height: `${barH}px` }}
                                      title={d.dept}
                                    />
                                    <span className="text-[9px] font-bold text-zinc-500 text-center leading-tight mt-2 truncate w-full">{d.dept}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Per-department summary cards */}
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {deptTotals.map(d => (
                              <div key={d.dept} className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-100">
                                <p className="text-[11px] font-bold text-zinc-700">{d.dept}</p>
                                <p className="text-base font-black text-indigo-700">{d.total}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    } else {
                      // Selected department: batch-wise chart
                      const deptData = deptBatchStrength[selectedStrengthDept];
                      if (!deptData) return <p className="text-xs text-zinc-400 italic text-center py-8">No data for this department</p>;
                      const batchArr = Object.values(deptData).sort((a, b) => a.batch.localeCompare(b.batch));
                      const maxVal = Math.max(...batchArr.map(b => b.total), 1);
                      const MAX_BAR_H = 160;
                      const barColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
                      const borderColors = ['border-indigo-600', 'border-emerald-600', 'border-violet-600', 'border-amber-600', 'border-rose-600', 'border-cyan-600'];
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Batch-wise — {selectedStrengthDept}</p>
                            <p className="text-lg font-black text-indigo-700">{batchArr.reduce((s, b) => s + b.total, 0)}</p>
                          </div>
                          <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
                            <div className="flex items-end justify-around gap-3" style={{ height: `${MAX_BAR_H + 52}px` }}>
                              {batchArr.map((b, i) => {
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
                          {/* Per-batch summary */}
                          <div className="mt-4 space-y-2">
                            {batchArr.map(b => (
                              <div key={b.batch} className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-100">
                                <div>
                                  <p className="text-sm font-bold text-zinc-800">{b.batch}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[11px] text-emerald-600 font-semibold">{b.assigned} assigned</span>
                                    <span className="text-[11px] text-amber-600 font-semibold">{b.approved} unassigned</span>
                                  </div>
                                </div>
                                <p className="text-2xl font-black text-indigo-700">{b.total}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Absentees Modal */}
      {attendanceModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setAttendanceModal({ open: false })}>
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-800">Today's Absentees</h3>
                  <p className="text-[11px] text-zinc-500">
                    {attendanceDate
                      ? new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '-'}
                  </p>
                </div>
              </div>
              <button onClick={() => setAttendanceModal({ open: false })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition"><X size={16} className="text-zinc-400" /></button>
            </div>
            <div className="px-5 py-3 border-b border-zinc-50 shrink-0">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <Calendar size={14} />
                Date
                <input type="date" value={attendanceDate}
                  onChange={async (e) => {
                    const d = e.target.value;
                    setAttendanceDate(d);
                    setSelectedAbsentDept('All');
                    await fetchAbsenteesForDate(d);
                  }}
                  className="ml-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" />
              </label>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {absenteesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : Object.keys(todayAbsentees).length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={28} />
                  </div>
                  <p className="text-base font-bold text-zinc-800">No Absences Found</p>
                  <p className="text-xs text-zinc-500 mt-1">All students marked present on this date.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Department selector */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedAbsentDept('All')}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                        selectedAbsentDept === 'All'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      All ({Object.values(todayAbsentees).reduce((s, v) => s + Object.keys(v).length, 0)})
                    </button>
                    {Object.keys(todayAbsentees).sort().map(dept => (
                      <button
                        key={dept}
                        onClick={() => setSelectedAbsentDept(dept)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                          selectedAbsentDept === dept
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {dept} ({Object.keys(todayAbsentees[dept]).length})
                      </button>
                    ))}
                  </div>

                  {/* Absentee list */}
                  {(() => {
                    if (selectedAbsentDept === 'All') {
                      const depts = Object.keys(todayAbsentees).sort();
                      return depts.map(dept => {
                        const students = Object.entries(todayAbsentees[dept]);
                        return (
                          <div key={dept}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-bold text-zinc-800">{dept}</h4>
                              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">{students.length} absent</span>
                            </div>
                            <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3 max-h-48 overflow-y-auto">
                              {students.length === 0 ? (
                                <p className="text-xs text-zinc-400 italic">No absentees</p>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                  {students.map(([regNo, name]) => (
                                    <div key={regNo} className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-zinc-100 text-xs">
                                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {(String(name || regNo).charAt(0) || '?').toUpperCase()}
                                      </span>
                                      <span className="font-semibold text-zinc-700 truncate">{String(name)}</span>
                                      {name !== regNo && (
                                        <span className="text-[10px] text-zinc-400 truncate shrink-0">({regNo})</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    } else {
                      const students = Object.entries(todayAbsentees[selectedAbsentDept] || {});
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-zinc-800">{selectedAbsentDept}</h4>
                            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">{students.length} absent</span>
                          </div>
                          {students.length === 0 ? (
                            <p className="text-xs text-zinc-400 italic py-8 text-center">No absentees</p>
                          ) : (
                            <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3 max-h-96 overflow-y-auto">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {students.map(([regNo, name]) => (
                                  <div key={regNo} className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-zinc-100 text-xs">
                                    <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                                      {(String(name || regNo).charAt(0) || '?').toUpperCase()}
                                    </span>
                                    <span className="font-semibold text-zinc-700 truncate">{String(name)}</span>
                                    {name !== regNo && (
                                      <span className="text-[10px] text-zinc-400 truncate shrink-0">({regNo})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Reports Pending Popup */}
      {reportsPopup.open && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeReportsPopup} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-rose-500" />
                <h3 className="text-lg font-bold text-zinc-900">Monthly Reports Pending Approvals</h3>
                <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">{pendingReports.length}</span>
              </div>
              <button onClick={closeReportsPopup} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <X size={18} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {reportsLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="animate-spin text-rose-500 mx-auto mb-3" size={32} />
                  <p className="text-zinc-500 text-sm font-semibold">Loading monthly reports queue...</p>
                </div>
              ) : pendingReports.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                  <p className="text-zinc-500 font-medium">No pending monthly reports to approve</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingReports.map((rep) => (
                    <div key={rep.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">
                          Department of {rep.department}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Report Month: <span className="font-bold text-zinc-700">{rep.monthName} {rep.year}</span> | Submitted by: <span className="font-semibold text-zinc-700">{rep.submittedByName || "HOD"}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedReport(rep);
                          setShowReportPreviewModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-lg text-xs font-black shadow hover:from-blue-800 hover:to-indigo-900 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Eye size={12} /> Review Report
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Report Full A4 Preview Modal for Principal Approval */}
      {showReportPreviewModal && selectedReport && (
        <div className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm flex flex-col">
          {/* Header Bar */}
          <div className="bg-white p-4 border-b border-zinc-200 flex justify-between items-center px-6">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-[#120c7a]" />
              <div>
                <h3 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wide">
                  Reviewing Monthly Report
                </h3>
                <p className="text-[11px] text-zinc-500 font-semibold">
                  Department of {selectedReport.department} | {selectedReport.monthName} {selectedReport.year}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowReportPreviewModal(false);
                  setSelectedReport(null);
                  setShowReturnInput(false);
                  setReturnComment("");
                }}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>

              <button
                onClick={() => setShowReturnInput(p => !p)}
                className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Return for Correction
              </button>

              <button
                onClick={() => handleApproveReport(selectedReport)}
                disabled={isActioning}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl text-xs font-black shadow hover:from-emerald-700 hover:to-teal-800 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                {isActioning ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Approve & Sign
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-zinc-100">
            {/* Return Comment Box */}
            {showReturnInput && (
              <div className="max-w-4xl mx-auto mb-6 bg-white p-5 rounded-2xl border border-rose-200 shadow-md">
                <label className="block text-xs font-black text-rose-700 uppercase tracking-wider mb-2">
                  Feedback comments / corrections required
                </label>
                <textarea
                  placeholder="Explain what corrections are required..."
                  value={returnComment}
                  onChange={e => setReturnComment(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setShowReturnInput(false)}
                    className="px-3.5 py-1.5 bg-zinc-200 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-300 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReturnReport(selectedReport)}
                    disabled={isActioning}
                    className="px-4 py-1.5 bg-rose-600 text-white text-xs font-black rounded-lg hover:bg-rose-700 transition-all cursor-pointer disabled:opacity-65"
                  >
                    {isActioning ? "Submitting..." : "Send Back"}
                  </button>
                </div>
              </div>
            )}
            {/* A4 compiled document sheet */}
            <div className="bg-white shadow-xl border border-zinc-200 p-12 rounded-3xl max-w-4xl mx-auto print-container font-serif text-zinc-900 leading-relaxed space-y-6">
              
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
                  Department of {selectedReport.department ? selectedReport.department : ""}
                </h3>
                <h4 className="text-xs font-black text-zinc-950 tracking-wider uppercase">
                  MONTHLY REPORT FOR THE MONTH OF {selectedReport.monthName?.toUpperCase()} - {selectedReport.year}
                </h4>
              </div>

              {activitiesLoading ? (
                <div className="p-16 text-center">
                  <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
                  <p className="text-sm font-semibold text-zinc-600">Compiling report tables from approved databases...</p>
                </div>
              ) : (
                <>
                  {/* PART A */}
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h3 className="text-sm font-bold underline font-serif uppercase tracking-wide">
                        Part A: Activities related to the Students
                      </h3>
                    </div>

                    {/* A.1 Guest Lectures */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        1. Industry Oriented Guest Lecture Organized: {partA_GuestLectures.length === 0 ? "Nil" : ""}
                      </h4>
                      <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                        <thead>
                          <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                            <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                            <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                            <th className="border border-zinc-900 p-2 uppercase">Date & Time</th>
                            <th className="border border-zinc-900 p-2 uppercase">No of Student</th>
                            <th className="border border-zinc-900 p-2 uppercase">Name of the Program / Internship</th>
                            <th className="border border-zinc-900 p-2 uppercase">Resource Person</th>
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

                    {/* A.2 Students Association Activities */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        2. Association Activities Organized: {partA_Association.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_Association.length > 0 && (
                        <div className="space-y-2">
                          <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                            <thead>
                              <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                                <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                                <th className="border border-zinc-900 p-2 uppercase">Event Name</th>
                                <th className="border border-zinc-900 p-2 uppercase">Date</th>
                                <th className="border border-zinc-900 p-2 uppercase">No of Participants</th>
                                <th className="border border-zinc-900 p-2 uppercase">Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {partA_Association.map((act, index) => (
                                <tr key={act.id} className="text-center">
                                  <td className="border border-zinc-900 p-2">{index + 1}</td>
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.noOfStudents || act.studentsCount || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.briefReport || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renderSectionGallery(partA_Association, "Illustration of Students Association Activities")}
                        </div>
                      )}
                    </div>

                    {/* A.3 Industrial Training / Internships */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        3. Industrial Visit / Internship / In-plant Training: {partA_Internships.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_Internships.length > 0 && (
                        <div className="space-y-2">
                          <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                            <thead>
                              <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                                <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                                <th className="border border-zinc-900 p-2 uppercase">Student Name</th>
                                <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                                <th className="border border-zinc-900 p-2 uppercase">Industry Name</th>
                                <th className="border border-zinc-900 p-2 uppercase">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {partA_Internships.map((act, index) => (
                                <tr key={act.id} className="text-center">
                                  <td className="border border-zinc-900 p-2">{index + 1}</td>
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.studentName || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.industryName || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renderSectionGallery(partA_Internships, "Illustration of Industrial Practical Knowledge Training")}
                        </div>
                      )}
                    </div>

                    {/* A.4 Online Courses by Students */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        4. Online Courses Completed by Students: {partA_OnlineCourses.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_OnlineCourses.length > 0 && (
                        <div className="space-y-2">
                          <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                            <thead>
                              <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                                <th className="border border-zinc-900 p-2 uppercase">S. No.</th>
                                <th className="border border-zinc-900 p-2 uppercase">Year / Sem</th>
                                <th className="border border-zinc-900 p-2 uppercase">No of Student Registered</th>
                                <th className="border border-zinc-900 p-2 uppercase">Title of the On-line Course</th>
                                <th className="border border-zinc-900 p-2 uppercase">Duration (Start date | End date)</th>
                                <th className="border border-zinc-900 p-2 uppercase">University</th>
                                <th className="border border-zinc-900 p-2 uppercase">Status of the Online Course</th>
                              </tr>
                            </thead>
                            <tbody>
                              {partA_OnlineCourses.map((act, index) => (
                                <tr key={act.id} className="text-center">
                                  <td className="border border-zinc-900 p-2">{index + 1}</td>
                                  <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                                  <td className="border border-zinc-900 p-2">1</td>
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.courseName || act.activityName || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.platform || "-"}</td>
                                  <td className="border border-zinc-900 p-2 font-bold uppercase">{act.status || "Completed"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renderSectionGallery(partA_OnlineCourses, "Photo Gallery for Online Course Accomplishments")}
                        </div>
                      )}
                    </div>

                    {/* A.5 Paper Presentation */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        5. Paper Presentation inside/outside state: {partA_PaperPresentations.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_PaperPresentations.length > 0 && (
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.studentName || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.organizedBy || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.activityName || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                                  <td className="border border-zinc-900 p-2 font-bold uppercase">{act.prizeDetails || act.awardType || "Participated"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renderSectionGallery(partA_PaperPresentations, "Photo Gallery for Event Participation")}
                        </div>
                      )}
                    </div>

                    {/* A.6 Co-curricular Activities / Technical Exhibitions */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        6. Co-curricular activities: {partA_Conferences.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_Conferences.length > 0 && (
                        <div className="space-y-2">
                          <table className="w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif">
                            <thead>
                              <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
                                <th className="border border-zinc-900 p-2 uppercase">S.No</th>
                                <th className="border border-zinc-900 p-2 uppercase">Name of the Student</th>
                                <th className="border border-zinc-900 p-2 uppercase">Year/Sem</th>
                                <th className="border border-zinc-900 p-2 uppercase">Organized By</th>
                                <th className="border border-zinc-900 p-2 uppercase">Event Title</th>
                                <th className="border border-zinc-900 p-2 uppercase">Awards / Participation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {partA_Conferences.map((act, index) => (
                                <tr key={act.id} className="text-center">
                                  <td className="border border-zinc-900 p-2">{index + 1}</td>
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.studentName || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.yearSem || act.sem || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.organizedBy || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.activityName || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2 font-bold uppercase">{act.prizeDetails || act.awardType || "Participated"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renderSectionGallery(partA_Conferences, "PHOTO GALLERY FOR THE TECHNICAL EXHIBITION")}
                        </div>
                      )}
                    </div>

                    {/* A.7 Extra-Curricular Activities */}
                    <div>
                      <h4 className="text-[11px] font-bold mb-2 uppercase font-serif">
                        7. Extra-Curricular activities: {partA_ExtraCurricular.length === 0 ? "Nil" : ""}
                      </h4>
                      {partA_ExtraCurricular.length > 0 && (
                        <div className="space-y-2">
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.activityName || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.venue || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.studentName ? 1 : (act.noOfStudents || 1)}</td>
                                  <td className="border border-zinc-900 p-2 font-bold uppercase">{act.prizeDetails || act.awardType || "Participated"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.remarks || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.universityName || act.university || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.phdTopic || act.monthlyProgress || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.paperTitle || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.journalName || act.journalConference || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.programName || act.programmeTitle || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.organizedBy || act.organisedBy || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.date || act.fromDate || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.courseName || act.title || "-"}</td>
                                  <td className="border border-zinc-900 p-2 text-left">{act.platform || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.weeks || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.startDate && act.endDate ? `${act.startDate} to ${act.endDate}` : act.date || "-"}</td>
                                  <td className="border border-zinc-900 p-2">{act.grade || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 text-right font-bold text-emerald-700 font-serif">₹{parseFloat(act.grantAmount || 0).toLocaleString("en-IN")}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
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
                                  <td className="border border-zinc-900 p-2 font-bold text-left">{act.facultyName || "-"}</td>
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

                  </div>

                  {/* Signatures footer */}
                  <div className="pt-12 grid grid-cols-3 text-center text-xs font-bold font-serif gap-4 mt-8 page-break-inside-avoid">
                    <div>
                      <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Prepared & Verified By</p>
                      <p className="text-[9px] text-zinc-500 font-sans mt-0.5">Faculty Coordinator</p>
                    </div>
                    <div>
                      <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Head of the Department</p>
                      <p className="text-[9px] text-zinc-500 font-sans mt-0.5">HOD ({selectedReport.submittedByName || "Signed"})</p>
                    </div>
                    <div>
                      <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Principal</p>
                      <p className="text-[9px] text-zinc-500 font-sans mt-0.5">
                        {selectedReport.status === "Approved" ? "Approved & Signed" : "CKCET"}
                      </p>
                    </div>
                  </div>
                </>
              )}            </div>
          </div>
        </div>
      )}

      {/* Circular Pending Popup */}
      {circularModal.open && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCircularModal({ open: false })} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <Megaphone size={20} className="text-cyan-500" />
                <h3 className="text-lg font-bold text-zinc-900">Circulars Pending Approval</h3>
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-bold">{pendingCirculars.length}</span>
              </div>
              <button onClick={() => setCircularModal({ open: false })} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <X size={18} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {circularsLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="animate-spin text-cyan-500 mx-auto mb-3" size={32} />
                  <p className="text-zinc-500 text-sm font-semibold">Loading circulars...</p>
                </div>
              ) : pendingCirculars.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                  <p className="text-zinc-500 font-medium">No pending circulars to approve</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingCirculars.map((circ) => (
                    <div key={circ.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                            circ.type === "institution"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            {circ.type === "institution" ? <Globe size={10} /> : <Building2 size={10} />}
                            {circ.type === "institution" ? "Institution" : "Dept"}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-zinc-900 truncate">{circ.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {circ.createdByName || "Unknown"} • {formatDate(circ.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCircular(circ);
                          setShowCircularPreview(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-lg text-xs font-black shadow hover:from-cyan-700 hover:to-blue-800 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ml-3"
                      >
                        <Eye size={12} /> Review
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Circular Review Modal */}
      {showCircularPreview && selectedCircular && (
        <div className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm flex flex-col">
          <div className="bg-white p-4 border-b border-zinc-200 flex justify-between items-center px-6">
            <div className="flex items-center gap-3">
              <Megaphone size={20} className="text-[#120c7a]" />
              <div>
                <h3 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wide">Review Circular</h3>
                <p className="text-[11px] text-zinc-500 font-semibold">
                  {selectedCircular.title} | {selectedCircular.type === "institution" ? "Institution Level" : `Department: ${selectedCircular.department || "N/A"}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowCircularPreview(false);
                  setSelectedCircular(null);
                  setShowCircularReturn(false);
                  setCircularReturnComment("");
                }}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => setShowCircularReturn(p => !p)}
                className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Return for Correction
              </button>
              <button
                onClick={() => handleApproveCircular(selectedCircular)}
                disabled={circularActioning}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl text-xs font-black shadow hover:from-emerald-700 hover:to-teal-800 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                {circularActioning ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Approve & Publish
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-zinc-100">
            {showCircularReturn && (
              <div className="max-w-4xl mx-auto mb-6 bg-white p-5 rounded-2xl border border-rose-200 shadow-md">
                <label className="block text-xs font-black text-rose-700 uppercase tracking-wider mb-2">
                  Comments / corrections required
                </label>
                <textarea
                  placeholder="Explain what corrections are required..."
                  value={circularReturnComment}
                  onChange={e => setCircularReturnComment(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setShowCircularReturn(false)}
                    className="px-3.5 py-1.5 bg-zinc-200 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-300 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReturnCircular(selectedCircular)}
                    disabled={circularActioning}
                    className="px-4 py-1.5 bg-rose-600 text-white text-xs font-black rounded-lg hover:bg-rose-700 transition-all cursor-pointer disabled:opacity-65"
                  >
                    {circularActioning ? "Submitting..." : "Send Back"}
                  </button>
                </div>
              </div>
            )}
            <div className="max-w-4xl mx-auto bg-white shadow-xl border border-zinc-200 rounded-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-8 py-6">
                <div className="flex items-center gap-3">
                  <Megaphone size={24} className="text-white/80" />
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedCircular.title}</h2>
                    <p className="text-blue-200 text-xs mt-1">
                      {selectedCircular.type === "institution" ? "Institution Level Circular" : `Department of ${selectedCircular.department || "N/A"}`}
                      <span className="mx-2">•</span>
                      {formatDate(selectedCircular.createdAt)}
                      <span className="mx-2">•</span>
                      By {selectedCircular.createdByName || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-8">
                <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {selectedCircular.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}