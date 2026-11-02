import React, { useState, useEffect, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where
} from "firebase/firestore";
import {
  Bus,
  PlusCircle,
  Ticket,
  Megaphone,
  Ban,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  Phone,
  User,
  IndianRupee,
  Calendar,
  ArrowRight,
  QrCode,
  Printer,
  ShieldCheck,
  X,
  Search,
  Sparkles,
  Info,
  ChevronDown,
  Lock
} from "lucide-react";
import { formatProgDisplay, formatProgrammeKey } from "../../lib/utils";

// Clean department helper: removes unwanted underscores and matches profile format
const formatCleanDept = (dept) => {
  if (!dept || typeof dept !== 'string') return '';
  let str = dept.trim();

  // 1. Remove leading UG / PG prefixes like "UG ", "PG ", "UG_", "PG_"
  str = str.replace(/^(UG|PG)[_\s]+/i, '');

  // 2. Map degree prefix (e.g. B_E -> B.E., B_Tech -> B.Tech.)
  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' },
    { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' },
    { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' },
    { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' },
    { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' },
    { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' },
    { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' },
    { key: 'M_A', display: 'M.A.' },
  ];

  for (const { key, display } of progPrefixMap) {
    const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
    if (regex.test(str)) {
      str = str.replace(regex, display + ' ');
      break;
    }
  }

  // 3. Remove all remaining underscores and redundant spaces
  str = str.replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return str;
};

export default function StudentTransport() {
  const [activeTab, setActiveTab] = useState("apply"); // "apply" | "passes" | "absence" | "cancellation"
  const [currentUser, setCurrentUser] = useState(null);
  const [studentProfile, setStudentProfile] = useState({
    studentId: "",
    fullName: "",
    deptClass: "",
    programme: "",
    batch: "",
    mobile: "",
    guardianEmergency: "",
    academicYear: "2026-2027"
  });

  // Transport master configuration data
  const [routes, setRoutes] = useState([]);
  const [busFleet, setBusFleet] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [semesterConfigs, setSemesterConfigs] = useState([]);

  // Student specific transport records
  const [myApplications, setMyApplications] = useState([]);
  const [myAbsences, setMyAbsences] = useState([]);
  const [myCancellations, setMyCancellations] = useState([]);
  const [submittingApply, setSubmittingApply] = useState(false);
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [toast, setToast] = useState(null);

  // Modal for Viewing Digital Boarding Pass
  const [viewingPass, setViewingPass] = useState(null);
  const [passQrCodeUrl, setPassQrCodeUrl] = useState("");

  // Generate real scannable QR Code containing student register number when viewing pass
  useEffect(() => {
    if (!viewingPass) {
      setPassQrCodeUrl("");
      return;
    }
    const studentRegNo = String(
      viewingPass.regNo ||
      viewingPass.studentId ||
      viewingPass.registerNumber ||
      viewingPass.rollNo ||
      studentProfile.studentId ||
      ""
    ).trim();

    if (studentRegNo) {
      QRCode.toDataURL(studentRegNo, {
        width: 240,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
        .then((url) => setPassQrCodeUrl(url))
        .catch((err) => {
          console.error("Error generating student QR code:", err);
          setPassQrCodeUrl("");
        });
    } else {
      setPassQrCodeUrl("");
    }
  }, [viewingPass, studentProfile.studentId]);

  // Form states for New Boarding Application
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [billingTerm, setBillingTerm] = useState("annual"); // "annual" | "semester" | "monthly"
  const [customMobile, setCustomMobile] = useState("");
  const [customGuardian, setCustomGuardian] = useState("");

  // Form states for Absence Intimation
  const [absencePassId, setAbsencePassId] = useState("");
  const [absenceDate, setAbsenceDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [absenceSession, setAbsenceSession] = useState("Morning Pickup");
  const [absenceReason, setAbsenceReason] = useState("Personal Leave / Medical Appointment");

  // Form states for Cancellation
  const [cancelPassId, setCancelPassId] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // 1. Fetch current logged-in student's information
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          // Fetch user doc
          const userSnap = await getDoc(doc(db, "users", user.uid));
          let uData = userSnap.exists() ? userSnap.data() : {};
          const reg = uData.regNo || uData.registerNo || uData.rollNo || uData.admissionNo || "";

          // Fetch student index if available
          let idxData = {};
          if (reg) {
            try {
              const idxSnap = await getDoc(doc(db, "student_index", String(reg).replace(/[.#$[\]/ ]/g, '_')));
              if (idxSnap.exists()) {
                idxData = idxSnap.data() || {};
              }
            } catch (e) {
              // ignore
            }
          }

          const resolvedReg = reg || idxData.regNo || "";
          const resolvedName = uData.studentName || uData.name || idxData.studentName || idxData.name || (user.displayName || "");
          const rawDept = uData.department || idxData.department || "";
          const cleanDept = formatCleanDept(rawDept);

          // Resolve studentDocId exactly like Profile.jsx
          let sDocId = idxData.studentDocId || "";
          if (!sDocId && resolvedReg) {
            try {
              const studentsSnap = await getDocs(collection(db, "students"));
              for (const d of studentsSnap.docs) {
                const sData = d.data();
                if (sData._order?.includes(resolvedReg) || sData[resolvedReg] || sData._student_data?.[resolvedReg]) {
                  sDocId = d.id;
                  break;
                }
              }
            } catch (_) {}
          }

          // Student mobile number strictly mirrors what is displayed on the student's Profile page (Profile.jsx)
          // Profile.jsx displays extra.mobile from students collection _student_data[reg].
          let resolvedPhone = "";
          if (sDocId && resolvedReg) {
            try {
              const sSnap = await getDoc(doc(db, "students", sDocId));
              if (sSnap.exists()) {
                const sData = sSnap.data() || {};
                const extra = sData._student_data?.[resolvedReg] || {};
                if (extra.mobile && String(extra.mobile).trim()) {
                  resolvedPhone = String(extra.mobile).trim();
                }
              }
            } catch (_) { }
          }

          // Emergency Contact starts empty so student types the number
          const resolvedGuardian = "";

          setStudentProfile({
            studentId: resolvedReg,
            fullName: resolvedName,
            deptClass: cleanDept,
            programme: uData.programme || idxData.programme || "",
            batch: uData.batch || idxData.batch || (sDocId ? sDocId.split('_').pop() : "") || "",
            mobile: resolvedPhone,
            guardianEmergency: resolvedGuardian,
            academicYear: "2026-2027",
            studentDocId: sDocId
          });
          setCustomMobile(resolvedPhone);
          setCustomGuardian("");
        } catch (err) {
          console.warn("[StudentTransport] Error fetching student info:", err);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Real-time listener for profile changes in students collection (mirrors Profile.jsx)
  useEffect(() => {
    if (!studentProfile.studentDocId || !studentProfile.studentId) return;
    const unsub = onSnapshot(doc(db, "students", studentProfile.studentDocId), (snap) => {
      if (!snap.exists()) return;
      const extra = snap.data()?._student_data?.[studentProfile.studentId] || {};
      const liveMobile = (extra.mobile && String(extra.mobile).trim()) ? String(extra.mobile).trim() : "";
      setStudentProfile(prev => ({
        ...prev,
        mobile: liveMobile
      }));
      setCustomMobile(liveMobile);
    });
    return () => unsub();
  }, [studentProfile.studentDocId, studentProfile.studentId]);

  // 2. Real-time listener for transport config (Routes, Fleet, Drivers)
  useEffect(() => {
    const unsubRoutes = onSnapshot(doc(db, "transport_config", "routes"), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.routes)) {
        setRoutes(snap.data().routes);
      } else {
        setRoutes([]);
      }
      setLoadingConfig(false);
    }, (err) => {
      console.warn("Routes config listener error:", err);
      setRoutes([]);
      setLoadingConfig(false);
    });

    const unsubFleet = onSnapshot(doc(db, "transport_config", "bus_fleet"), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.buses)) {
        setBusFleet(snap.data().buses);
      }
    });

    const unsubDrivers = onSnapshot(doc(db, "transport_config", "drivers"), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.drivers)) {
        setDrivers(snap.data().drivers);
      }
    });

    const unsubSem = onSnapshot(collection(db, "semester_config"), (snap) => {
      setSemesterConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setSemesterConfigs([]));

    return () => {
      unsubRoutes();
      unsubFleet();
      unsubDrivers();
      unsubSem();
    };
  }, []);

  // 3. Real-time listener for current student's transport applications and absence intimations
  useEffect(() => {
    if (!currentUser) return;

    const myUid = currentUser.uid;
    const myReg = String(studentProfile.studentId || "").trim().toLowerCase();

    const isStudentMatch = (data) => {
      if (!data) return false;
      if (myUid && (data.studentUid === myUid || data.uid === myUid)) return true;
      if (myReg) {
        const dReg = String(data.regNo || data.studentId || data.rollNo || "").trim().toLowerCase();
        if (dReg && dReg === myReg) return true;
      }
      return false;
    };

    const unsubApps = onSnapshot(collection(db, "student_transport_applications"), (snap) => {
      const apps = [];
      snap.forEach(d => {
        const data = d.data();
        if (isStudentMatch(data)) {
          apps.push({ id: d.id, ...data });
        }
      });
      apps.sort((a, b) => String(b.appliedAt || "").localeCompare(String(a.appliedAt || "")));
      setMyApplications(apps);
    });

    const unsubAbsences = onSnapshot(collection(db, "student_transport_absences"), (snap) => {
      const absList = [];
      snap.forEach(d => {
        const data = d.data();
        if (isStudentMatch(data)) {
          absList.push({ id: d.id, ...data });
        }
      });
      absList.sort((a, b) => String(b.absenceDate || "").localeCompare(String(a.absenceDate || "")));
      setMyAbsences(absList);
    });

    const unsubCancels = onSnapshot(collection(db, "student_transport_cancellations"), (snap) => {
      const cancelList = [];
      snap.forEach(d => {
        const data = d.data();
        if (isStudentMatch(data)) {
          cancelList.push({ id: d.id, ...data });
        }
      });
      cancelList.sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));
      setMyCancellations(cancelList);
    });

    return () => {
      unsubApps();
      unsubAbsences();
      unsubCancels();
    };
  }, [currentUser, studentProfile.studentId]);

  // Active semester_config matching this student's programme and batch per Academic Calendar
  const activeSemesterConfig = useMemo(() => {
    if (!semesterConfigs.length) return null;
    const progKey = formatProgrammeKey(studentProfile.programme || studentProfile.deptClass || "");
    const bMatch = String(studentProfile.batch || "").match(/(\d{4})/);
    const bStart = bMatch ? Number(bMatch[1]) : null;

    const mine = semesterConfigs.filter((c) => {
      if (progKey && c.programme && formatProgrammeKey(c.programme) !== progKey) return false;
      const batches = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
      if (bStart && batches.length && !batches.some(b => String(b).includes(String(bStart)))) return false;
      return true;
    });

    const pool = mine.length ? mine : semesterConfigs;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inRange = pool.filter((c) => {
      if (!c.startDate || !c.endDate) return false;
      return today >= new Date(`${c.startDate}T00:00:00`) && today <= new Date(`${c.endDate}T00:00:00`);
    });

    const distToRange = (c) => {
      if (!c.startDate || !c.endDate) return Infinity;
      const t = today.getTime();
      const s = new Date(`${c.startDate}T00:00:00`).getTime();
      const e = new Date(`${c.endDate}T00:00:00`).getTime();
      if (isNaN(s) || isNaN(e)) return Infinity;
      if (t < s) return s - t;
      if (t > e) return t - e;
      return 0;
    };

    return (inRange.length ? inRange : [...pool].sort((a, b) => distToRange(a) - distToRange(b)))[0] || null;
  }, [studentProfile, semesterConfigs]);

  const resolvedAcademicYear = useMemo(() => {
    if (activeSemesterConfig?.academicYear) return activeSemesterConfig.academicYear;
    const now = new Date();
    const y = now.getFullYear();
    const start = (now.getMonth() + 1) >= 6 ? y : y - 1;
    return `${start}-${start + 1}`;
  }, [activeSemesterConfig]);

  const resolvedSemesterNum = useMemo(() => {
    return activeSemesterConfig?.semesterNumber || "1";
  }, [activeSemesterConfig]);

  const resolvedSemesterLabel = useMemo(() => {
    if (billingTerm === "annual") return "All";
    return String(resolvedSemesterNum).startsWith("Sem") ? String(resolvedSemesterNum) : `Sem ${resolvedSemesterNum}`;
  }, [billingTerm, resolvedSemesterNum]);

  // Derived selected route and stage objects
  const selectedRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

  const availableStages = useMemo(() => {
    return selectedRoute?.stages || [];
  }, [selectedRoute]);

  const selectedStage = useMemo(() => {
    return availableStages.find(s => s.id === selectedStageId) || null;
  }, [availableStages, selectedStageId]);

  // Dynamic fee calculation based on selected stage and billing term
  const calculatedFee = useMemo(() => {
    if (!selectedStage) return 0;
    if (billingTerm === "annual") return Number(selectedStage.annualFee) || 0;
    if (billingTerm === "semester") return Number(selectedStage.semesterFee ?? selectedStage.semFee) || 0;
    if (billingTerm === "monthly") return Number(selectedStage.monthlyFee) || 0;
    return 0;
  }, [selectedStage, billingTerm]);

  // Dynamic calculation of boarding pass validity based on billing term and Academic Calendar configurations
  const getPassValidity = useCallback((app) => {
    if (!app) return null;
    const term = app.billingTerm || "annual";
    const now = new Date();

    // Determine start/activation date
    const activationDateStr = app.principalSignedAt || app.approvedAt || app.allocatedAt || app.issuedAt || app.appliedAt;
    const startDate = activationDateStr ? new Date(activationDateStr) : new Date();

    let validFrom = app.validFrom ? new Date(app.validFrom) : startDate;
    let validUntil = null;
    let validityLabel = "";
    let validityDetail = "";

    if (term === "monthly") {
      validityLabel = "30-Day Monthly Pass";
      // Monthly fee is active for exactly 30 days from activation / start date
      if (app.validUntil) {
        validUntil = new Date(app.validUntil);
      } else {
        const exp = new Date(validFrom.getTime());
        exp.setDate(exp.getDate() + 30);
        exp.setHours(23, 59, 59, 999);
        validUntil = exp;
      }
      validityDetail = "Active for 30 Days from Issue";
    } else if (term === "semester") {
      const semStr = app.semesterNumber || (app.semester ? String(app.semester).replace(/\D/g, '') : "") || "1";
      validityLabel = `Semester Pass (Sem ${semStr})`;

      // Semester range configured in AcademicCalendar (semester_config)
      const progKey = studentProfile.programme ? formatProgrammeKey(studentProfile.programme) : "";
      const bStart = (studentProfile.batch || "").match(/(\d{4})/)?.[1];

      // Match semester_config for this student's programme, batch, and semester
      const semMatch = semesterConfigs.find(c => {
        if (c.programme && progKey && formatProgrammeKey(c.programme) !== progKey) return false;
        const batches = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
        if (bStart && batches.length && !batches.some(b => String(b).includes(String(bStart)))) return false;
        if (app.academicYear && c.academicYear && c.academicYear !== app.academicYear) return false;
        if (c.semesterNumber && String(c.semesterNumber) === String(semStr)) return true;
        return false;
      }) || activeSemesterConfig;

      if (semMatch?.endDate) {
        validUntil = new Date(`${semMatch.endDate}T23:59:59.999`);
        if (semMatch.startDate) {
          validFrom = new Date(`${semMatch.startDate}T00:00:00`);
        }
      } else if (app.validUntil) {
        validUntil = new Date(app.validUntil);
      } else {
        // Fallback: 120 days
        const exp = new Date(validFrom.getTime());
        exp.setDate(exp.getDate() + 120);
        exp.setHours(23, 59, 59, 999);
        validUntil = exp;
      }
      validityDetail = `Valid through ${semMatch?.endDate ? new Date(semMatch.endDate).toLocaleDateString('en-GB') : 'Semester End'}`;
    } else {
      // "annual" - Full Academic Year completing with even semester range
      const targetYear = app.academicYear || resolvedAcademicYear;
      validityLabel = `Academic Year Pass (${targetYear})`;

      const progKey = studentProfile.programme ? formatProgrammeKey(studentProfile.programme) : "";
      const bStart = (studentProfile.batch || "").match(/(\d{4})/)?.[1];

      const yearConfigs = semesterConfigs.filter(c => {
        if (c.programme && progKey && formatProgrammeKey(c.programme) !== progKey) return false;
        const batches = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
        if (bStart && batches.length && !batches.some(b => String(b).includes(String(bStart)))) return false;
        if (targetYear && c.academicYear && c.academicYear !== targetYear) return false;
        return true;
      });

      // Find Even semester config within this academic year
      const evenSemConfig = yearConfigs.find(c =>
        String(c.semesterType || "").toLowerCase() === "even" ||
        (c.semesterNumber && Number(c.semesterNumber) % 2 === 0)
      );
      const latestConfig = [...yearConfigs].sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0];
      const effectiveAnnualConfig = evenSemConfig || latestConfig;

      if (effectiveAnnualConfig?.endDate) {
        validUntil = new Date(`${effectiveAnnualConfig.endDate}T23:59:59.999`);
      } else if (app.validUntil) {
        validUntil = new Date(app.validUntil);
      } else {
        const yrEnd = (targetYear && targetYear.split('-')[1]) ? Number(targetYear.split('-')[1]) : (now.getFullYear() + 1);
        validUntil = new Date(yrEnd, 5, 30, 23, 59, 59, 999); // June 30
      }
      validityDetail = `Valid through Even Semester (${effectiveAnnualConfig?.endDate ? new Date(effectiveAnnualConfig.endDate).toLocaleDateString('en-GB') : 'Academic Year End'})`;
    }

    const isExpired = now.getTime() > validUntil.getTime();
    const msRemaining = Math.max(0, validUntil.getTime() - now.getTime());
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    return {
      billingTerm: term,
      validFrom,
      validUntil,
      validFromStr: validFrom ? validFrom.toLocaleDateString('en-GB') : '',
      validUntilStr: validUntil ? validUntil.toLocaleDateString('en-GB') : '',
      isExpired,
      daysRemaining,
      validityLabel,
      validityDetail
    };
  }, [semesterConfigs, studentProfile, activeSemesterConfig, resolvedAcademicYear]);

  // Filter for approved applications: split into active approved and expired/deactivated
  const { approvedApplications, expiredApplications } = useMemo(() => {
    const active = [];
    const expired = [];

    myApplications.forEach(app => {
      const status = String(app.status || "").trim();
      const sLower = status.toLowerCase();

      // Check if this pass has completed cancellation and seat release by coordinator
      const isCancellationCompleted =
        sLower === "cancelled" ||
        sLower === "cancelled - seat released" ||
        sLower === "pass cancelled" ||
        sLower === "cancelled by coordinator" ||
        app.allocatedSeat === "Released" ||
        app.seatReleased === true;
      if (isCancellationCompleted) return;

      // Check if THIS SPECIFIC pass has an approved cancellation record in student_transport_cancellations
      // (Only APPROVED / RELEASED cancellations by coordinator count! A pending request does NOT cancel yet!)
      const isThisPassCancelApproved = myCancellations.some(c => {
        const isTargetPass = (c.passId && c.passId === app.id) ||
          (c.applicationId && c.applicationId === app.id) ||
          (c.applicationNo && app.applicationNo && c.applicationNo === app.applicationNo);
        if (!isTargetPass) return false;
        const cStatus = String(c.status || "").toLowerCase();
        return cStatus.includes("released") ||
          cStatus === "cancelled - seat released" ||
          cStatus === "approved - pass cancelled" ||
          cStatus === "cancelled - approved by coordinator";
      });
      if (isThisPassCancelApproved) return;

      // Pending new application or rejected states are not approved passes
      const isInitialPending = sLower === "pending approval" || sLower === "needs bus & seat" || sLower === "under review" || sLower === "awaiting principal signature";
      const isRejected = sLower.includes("reject");
      if (isInitialPending || isRejected) return;

      // Must be an active approval status (remains active even if cancellation request is under review)
      const isApprovedStatus = sLower === "approved" ||
        sLower === "active" ||
        sLower === "sanctioned" ||
        sLower === "issued" ||
        sLower === "cancellation requested" ||
        sLower.includes("approved") ||
        sLower.includes("sanctioned") ||
        Boolean(app.principalApproved);
      if (!isApprovedStatus) return;

      const validity = getPassValidity(app);
      const appWithValidity = { ...app, _validity: validity };

      if (validity?.isExpired) {
        expired.push(appWithValidity);
      } else {
        active.push(appWithValidity);
      }
    });

    return { approvedApplications: active, expiredApplications: expired };
  }, [myApplications, myCancellations, getPassValidity]);

  const activeApprovedPass = useMemo(() => {
    return approvedApplications[0] || null;
  }, [approvedApplications]);

  const hasApprovedPass = Boolean(activeApprovedPass);

  // Check if student has an active cancellation request pending coordinator verification
  const activePendingCancellation = useMemo(() => {
    return myCancellations.find(c => {
      const s = String(c.status || "").toLowerCase();
      return !s || s.includes("pending");
    }) || null;
  }, [myCancellations]);

  // Check for any currently pending initial application (applied, but not yet approved, and not cancelled)
  const pendingApplication = useMemo(() => {
    if (hasApprovedPass) return null;
    return myApplications.find(app => {
      const status = String(app.status || "").trim();
      const sLower = status.toLowerCase();
      const isCancellationCompleted =
        sLower === "cancelled" ||
        sLower === "cancelled - seat released" ||
        sLower === "pass cancelled" ||
        app.allocatedSeat === "Released" ||
        app.seatReleased === true;
      if (isCancellationCompleted) return false;
      const isApproved = sLower === "approved" ||
        sLower === "active" ||
        sLower === "sanctioned" ||
        sLower === "issued" ||
        sLower === "cancellation requested" ||
        sLower.includes("approved") ||
        sLower.includes("sanctioned") ||
        Boolean(app.principalApproved);
      return !isApproved;
    }) || null;
  }, [myApplications, hasApprovedPass]);

  // Synchronize active tab: when pass is not approved (or cancelled), only "apply" is accessible.
  // When approved, default to "passes" tab.
  useEffect(() => {
    if (!hasApprovedPass) {
      if (activeTab !== "apply") {
        setActiveTab("apply");
      }
    } else {
      if (activeTab === "apply") {
        setActiveTab("passes");
      }
    }
  }, [hasApprovedPass, activeTab]);

  // Auto-select first active pass in absence/cancel forms if available
  useEffect(() => {
    if (approvedApplications.length > 0) {
      if (!absencePassId) setAbsencePassId(approvedApplications[0].id);
      if (!cancelPassId) setCancelPassId(approvedApplications[0].id);
    }
  }, [approvedApplications, absencePassId, cancelPassId]);

  // Handle withdrawing a pending application
  const handleWithdrawApplication = async (appId) => {
    if (!window.confirm("Are you sure you want to withdraw this pending boarding application?")) return;
    try {
      await deleteDoc(doc(db, "student_transport_applications", appId));
      showToast("Application withdrawn successfully. You can now submit a new application.", "success");
    } catch (err) {
      console.error("Error withdrawing application:", err);
      showToast("Failed to withdraw application", "error");
    }
  };

  // Handle New Boarding Application submission
  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    if (!selectedRoute) {
      showToast("Please choose your preferred transport route", "error");
      return;
    }
    if (!selectedStage) {
      showToast("Please select your boarding stage / stop", "error");
      return;
    }

    setSubmittingApply(true);
    try {
      const termLabel = billingTerm === "annual"
        ? "Full Academic Year (Annual Fee)"
        : billingTerm === "semester"
          ? "Semester Fee (Half Year)"
          : "Monthly Term Fee";

      // Look up assigned bus for this route if available
      const assignedBus = busFleet.find(b => b.routeId === selectedRoute.id);
      const assignedDriver = assignedBus ? drivers.find(d => d.id === assignedBus.driverId || d.vehicleNumber === assignedBus.registrationNumber) : null;

      const routeCode = selectedRoute.code || selectedRoute.routeCode || "R-01";
      const routeName = selectedRoute.name || selectedRoute.routeName || "Express Route";
      const stageName = selectedStage.stageName || selectedStage.name || "Stop";
      const pickupTime = selectedStage.morningTime || selectedStage.pickupTime || "07:30 AM";
      const dropTime = selectedStage.eveningTime || selectedStage.dropTime || "05:30 PM";

      // Compute initial validity period based on institutional calendar & billing term
      let initValidFrom = new Date();
      let initValidUntil = new Date();
      if (billingTerm === "monthly") {
        initValidUntil.setDate(initValidUntil.getDate() + 30);
        initValidUntil.setHours(23, 59, 59, 999);
      } else if (billingTerm === "semester") {
        if (activeSemesterConfig?.endDate) {
          initValidUntil = new Date(`${activeSemesterConfig.endDate}T23:59:59.999`);
          if (activeSemesterConfig.startDate) initValidFrom = new Date(`${activeSemesterConfig.startDate}T00:00:00`);
        } else {
          initValidUntil.setDate(initValidUntil.getDate() + 120);
          initValidUntil.setHours(23, 59, 59, 999);
        }
      } else {
        // "annual" - Even semester endDate
        const progKey = studentProfile.programme ? formatProgrammeKey(studentProfile.programme) : "";
        const bStart = (studentProfile.batch || "").match(/(\d{4})/)?.[1];
        const yearConfigs = semesterConfigs.filter(c => {
          if (c.programme && progKey && formatProgrammeKey(c.programme) !== progKey) return false;
          const batches = Array.isArray(c.batch) ? c.batch : (c.batch ? [c.batch] : []);
          if (bStart && batches.length && !batches.some(b => String(b).includes(String(bStart)))) return false;
          if (resolvedAcademicYear && c.academicYear && c.academicYear !== resolvedAcademicYear) return false;
          return true;
        });
        const evenSemConfig = yearConfigs.find(c =>
          String(c.semesterType || "").toLowerCase() === "even" ||
          (c.semesterNumber && Number(c.semesterNumber) % 2 === 0)
        );
        const latestConfig = [...yearConfigs].sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0];
        const effectiveAnnualConfig = evenSemConfig || latestConfig;
        if (effectiveAnnualConfig?.endDate) {
          initValidUntil = new Date(`${effectiveAnnualConfig.endDate}T23:59:59.999`);
        } else {
          const yrEnd = (resolvedAcademicYear && resolvedAcademicYear.split('-')[1]) ? Number(resolvedAcademicYear.split('-')[1]) : (new Date().getFullYear() + 1);
          initValidUntil = new Date(yrEnd, 5, 30, 23, 59, 59, 999);
        }
      }

      const appData = {
        applicationNo: `STU-TR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        studentUid: currentUser?.uid || "guest",
        regNo: studentProfile.studentId || "",
        studentName: studentProfile.fullName || "Student",
        department: studentProfile.deptClass || "",
        programme: studentProfile.programme || "",
        batch: studentProfile.batch || "",
        studentMobile: customMobile || studentProfile.mobile || "",
        guardianEmergencyContact: customGuardian || studentProfile.guardianEmergency || "",
        academicYear: resolvedAcademicYear,
        semester: resolvedSemesterLabel,
        semesterNumber: resolvedSemesterNum,
        billingTerm: billingTerm,
        billingTermLabel: termLabel,
        calculatedFee: calculatedFee,
        status: "Pending Approval",
        routeId: selectedRoute.id,
        routeCode: routeCode,
        routeName: routeName,
        stageId: selectedStage.id,
        stageName: stageName,
        pickupTime: pickupTime,
        dropTime: dropTime,
        assignedBusNumber: assignedBus?.busNo || assignedBus?.busNumber || "Bus Under Assignment",
        assignedDriverName: assignedDriver?.name || "Driver Under Assignment",
        assignedDriverPhone: assignedDriver?.phone || "Pending",
        validFrom: initValidFrom.toISOString(),
        validUntil: initValidUntil.toISOString(),
        validityDays: billingTerm === "monthly" ? 30 : null,
        appliedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "student_transport_applications"), appData);
      showToast("Boarding pass application submitted successfully for approval!", "success");

      // Reset selection and keep on apply tab to display verification status
      setSelectedRouteId("");
      setSelectedStageId("");
      setActiveTab("apply");
    } catch (err) {
      console.error("Error submitting boarding application:", err);
      showToast("Failed to submit boarding application. Please try again.", "error");
    } finally {
      setSubmittingApply(false);
    }
  };

  // Handle Prior Absence Intimation submission
  const handleSubmitAbsence = async (e) => {
    e.preventDefault();
    const targetPass = myApplications.find(a => a.id === absencePassId) || (myApplications.length > 0 ? myApplications[0] : null);

    if (!absenceDate) {
      showToast("Please pick your date of planned absence", "error");
      return;
    }

    setSubmittingAbsence(true);
    try {
      const intId = `INT-${new Date().getFullYear()}-${String(myAbsences.length + 1).padStart(3, '0')}`;
      const absenceData = {
        intimationId: intId,
        studentUid: currentUser?.uid || "guest",
        studentName: studentProfile.fullName || "Student",
        passId: targetPass?.id || "PASS-2026",
        stageName: targetPass?.stageName || "Tech Park Circle",
        routeCode: targetPass?.routeCode || "R-01",
        routeName: targetPass?.routeName || "Main City Route",
        absenceDate: absenceDate,
        session: absenceSession,
        reason: absenceReason,
        status: "Intimated To Driver",
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "student_transport_absences"), absenceData);
      showToast(`Absence intimated to driver! Bus will skip waiting at your stage on ${absenceDate}.`, "success");
    } catch (err) {
      console.error("Error submitting absence intimation:", err);
      showToast("Failed to send absence intimation", "error");
    } finally {
      setSubmittingAbsence(false);
    }
  };

  // Handle Cancellation Request submission
  const handleSubmitCancellation = async (e) => {
    e.preventDefault();
    if (!cancelPassId) {
      showToast("Please choose the boarding pass to cancel", "error");
      return;
    }
    if (!cancelReason.trim()) {
      showToast("Please enter a valid reason for transport cancellation", "error");
      return;
    }

    setSubmittingCancel(true);
    try {
      const targetPass = myApplications.find(a => a.id === cancelPassId);
      const cancelData = {
        studentUid: currentUser?.uid || "guest",
        studentName: studentProfile.fullName,
        regNo: studentProfile.studentId,
        passId: cancelPassId,
        applicationId: cancelPassId,
        applicationNo: targetPass?.applicationNo || "",
        routeName: targetPass?.routeName || "",
        stageName: targetPass?.stageName || "",
        calculatedFee: targetPass?.calculatedFee || 0,
        paidFee: targetPass?.paidFee || 0,
        reason: cancelReason,
        status: "Pending Cancellation Approval",
        requestedAt: new Date().toISOString()
      };

      await addDoc(collection(db, "student_transport_cancellations"), cancelData);

      // Keep pass active with cancellationPending flag - pass and pages remain active until coordinator verifies dues and releases seat
      await updateDoc(doc(db, "student_transport_applications", cancelPassId), {
        cancellationPending: true,
        cancellationRequested: true,
        cancellationStatus: "Pending Cancellation Approval",
        cancellationReason: cancelReason,
        cancellationRequestedAt: new Date().toISOString()
      });

      showToast("Cancellation request submitted to Transport Coordinator. Your pass remains active until verified and approved.", "success");
      setCancelReason("");
      setActiveTab("passes");
    } catch (err) {
      console.error("Error submitting cancellation:", err);
      showToast("Failed to submit cancellation request", "error");
    } finally {
      setSubmittingCancel(false);
    }
  };

  return (
    <div className="w-full space-y-6 max-w-7xl mx-auto px-3 sm:px-6 py-4 font-sans text-slate-800">

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-xs font-bold text-white transition-all transform animate-in fade-in slide-in-from-top-4 ${toast.type === "success" ? "bg-emerald-600 border border-emerald-500" : "bg-rose-600 border border-rose-500"
          }`}>
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header with Title & Sub-navigation Pill Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-[#120c7a] flex items-center justify-center font-black border border-indigo-100 shadow-xs">
              <Bus size={22} className="text-[#120c7a]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Student Transport Portal
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Apply for Boarding Pass, Intimate Prior Absences to Driver, Manage Passes, or Request Cancellation
              </p>
            </div>
          </div>
        </div>

        {/* Pill Navigation Tabs - visible ONLY when student has an Approved Pass */}
        {hasApprovedPass ? (
          <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => setActiveTab("passes")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${activeTab === "passes"
                  ? "bg-white text-[#120c7a] shadow-xs border border-indigo-200/60 ring-2 ring-indigo-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
            >
              <span>🎫</span> My Passes & Status
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === "passes" ? "bg-indigo-100 text-[#120c7a]" : "bg-slate-200 text-slate-700"
                }`}>
                {approvedApplications.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("absence")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${activeTab === "absence"
                  ? "bg-white text-[#120c7a] shadow-xs border border-indigo-200/60 ring-2 ring-indigo-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
            >
              <span>📢</span> Prior Absence Intimation
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === "absence" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"
                }`}>
                {myAbsences.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("cancellation")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${activeTab === "cancellation"
                  ? "bg-white text-[#120c7a] shadow-xs border border-indigo-200/60 ring-2 ring-indigo-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
            >
              <span>🚫</span> Cancellation Form
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
            <div className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-white text-[#120c7a] shadow-xs border border-indigo-200/60 ring-2 ring-indigo-50">
              <span>{pendingApplication ? "⏳" : "📝"}</span>
              <span>{pendingApplication ? "Application Under Verification" : "New Boarding Application"}</span>
              {pendingApplication && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                  {pendingApplication.status}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: NEW BOARDING APPLICATION OR PENDING APPLICATION TRACKER */}
      {/* ========================================================================= */}
      {activeTab === "apply" && (
        pendingApplication ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-black border border-amber-200 shadow-xs">
                  <Clock size={20} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Boarding Pass Application Under Verification
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Your transport application has been submitted and is currently awaiting approval & bus seat allocation.
                  </p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-200 w-fit flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                {pendingApplication.status || "Pending Approval"}
              </span>
            </div>

            {/* Application Details Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Application Number</p>
                <p className="font-black text-slate-900 text-sm mt-0.5">{pendingApplication.applicationNo || pendingApplication.id}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Selected Route</p>
                <p className="font-extrabold text-slate-800 mt-0.5">{pendingApplication.routeCode}: {pendingApplication.routeName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Boarding Stage</p>
                <p className="font-extrabold text-slate-800 mt-0.5 flex items-center gap-1">
                  <MapPin size={13} className="text-indigo-600 shrink-0" />
                  {pendingApplication.stageName} ({pendingApplication.pickupTime || "07:30 AM"})
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Assessed Fee</p>
                <p className="font-black text-[#120c7a] text-sm mt-0.5">₹{(pendingApplication.calculatedFee || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Workflow Progress Steps */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Approval & Issuance Workflow</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>1. Application Submitted</span>
                  </div>
                  <p className="text-[11px] text-emerald-700/80">Submitted on {new Date(pendingApplication.appliedAt || Date.now()).toLocaleDateString('en-GB')}</p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <Clock size={16} className="text-amber-600" />
                    <span>2. Review & Seat Allocation</span>
                  </div>
                  <p className="text-[11px] text-amber-700/90">
                    {pendingApplication.status === "Forwarded to Principal" ? "Seat allocated & forwarded to Principal" : "Awaiting route verification & bus seat assignment"}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 opacity-70">
                  <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                    <Lock size={16} className="text-slate-400" />
                    <span>3. Pass Issuance & QR Activation</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Unlocks Digital Pass, Absence Intimation & Cancellation</p>
                </div>
              </div>
            </div>

            {/* Information Notice */}
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-start gap-3 text-xs text-blue-950">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-blue-950">What happens next?</p>
                <p className="text-blue-900/80 leading-relaxed font-normal">
                  The Transport Coordinator is reviewing your route requirements and assigning an optimal bus and seat. As soon as your application is approved, your <strong>Digital Boarding Pass</strong>, <strong>Prior Absence Intimation</strong>, and <strong>Cancellation</strong> options will automatically appear here.
                </p>
              </div>
            </div>

            {/* Withdraw Action */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">Need to make changes to your route or stop?</p>
              <button
                type="button"
                onClick={() => handleWithdrawApplication(pendingApplication.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Ban size={14} /> Withdraw & Re-apply
              </button>
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">

          {/* Card Header with Academic Year Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📋</span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Application Form for Requesting Boarding
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 w-fit">
              {resolvedAcademicYear} • {billingTerm === 'annual' ? 'Full Academic Year' : ('Sem ' + resolvedSemesterNum)}
            </span>
          </div>

          {/* Notice when previous pass has expired / deactivated */}
          {expiredApplications.length > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4.5 flex items-start gap-3.5 text-xs text-amber-950">
              <span className="text-amber-600 font-black text-base shrink-0">⏳</span>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-amber-950 text-sm">Previous Boarding Pass Expired & Deactivated</p>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-black text-[10px] uppercase tracking-wide">
                    Deactivated
                  </span>
                </div>
                <p className="text-amber-900/90 font-normal leading-relaxed">
                  Your previous <strong>{expiredApplications[0]._validity?.validityLabel || expiredApplications[0].billingTermLabel}</strong> pass for <strong>{expiredApplications[0].routeCode}: {expiredApplications[0].routeName} ({expiredApplications[0].stageName})</strong> completed its validity on <strong>{expiredApplications[0]._validity?.validUntilStr || 'recently'}</strong> and has been deactivated. Please submit a new application below to renew your transport service.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setViewingPass(expiredApplications[0])}
                    className="text-xs font-bold text-amber-900 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Deactivated Pass Details</span> →
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmitApplication} className="space-y-6">

            {/* 8 Form Inputs in 4-column responsive grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">

              {/* Field 1: Student ID / Roll No */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Student ID / Roll No <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={studentProfile.studentId}
                    readOnly
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-not-allowed select-none"
                    placeholder="Student Roll / Reg No"
                  />
                </div>
              </div>

              {/* Field 2: Full Name of Student */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Full Name of Student <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentProfile.fullName}
                  readOnly
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-not-allowed"
                  placeholder="Full Name of Student"
                />
              </div>

              {/* Field 3: Department & Year / Class */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Department & Year / Class <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentProfile.deptClass}
                  readOnly
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-not-allowed truncate"
                  placeholder="Department Name"
                />
              </div>

              {/* Field 4: Student Mobile Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Student Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customMobile}
                  onChange={(e) => setCustomMobile(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                  placeholder="Enter Student Mobile Number"
                  required
                />
              </div>

              {/* Field 5: Guardian Emergency Contact */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Emergency Contact <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customGuardian}
                  onChange={(e) => setCustomGuardian(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                  placeholder="Enter Guardian Contact Number"
                  required
                />
              </div>

              {/* Field 6: Select Preferred Transport Route */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Select Preferred Transport Route <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedRouteId}
                    onChange={(e) => {
                      setSelectedRouteId(e.target.value);
                      setSelectedStageId(""); // reset stage when route changes
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 appearance-none pr-8 transition-all"
                    required
                  >
                    <option value="">
                      {routes.length === 0 ? "-- No Transport Routes Configured --" : "-- Choose Transport Route --"}
                    </option>
                    {routes.map(r => {
                      const rCode = r.code || r.routeCode || "";
                      const rName = r.name || r.routeName || "Unnamed Route";
                      const label = rCode ? `${rCode}: ${rName}` : rName;
                      return (
                        <option key={r.id} value={r.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Field 7: Select Boarding Stage / Stop */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Select Boarding Stage / Stop <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    disabled={!selectedRouteId || availableStages.length === 0}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-bold outline-none appearance-none pr-8 transition-all ${!selectedRouteId
                        ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-800 border-slate-200 focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                      }`}
                    required
                  >
                    <option value="">
                      {!selectedRouteId
                        ? "-- First Select a Route --"
                        : availableStages.length === 0
                          ? "-- No Stages Configured for this Route --"
                          : "-- Select Boarding Stage / Stop --"}
                    </option>
                    {availableStages.map(s => {
                      const sName = s.stageName || s.name || "Stop";
                      const pTime = s.morningTime || s.pickupTime || "";
                      const label = pTime ? `${sName} (Pickup: ${pTime})` : sName;
                      return (
                        <option key={s.id} value={s.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Field 8: Billing Term Duration */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Billing Term Duration <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={billingTerm}
                    onChange={(e) => setBillingTerm(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 appearance-none pr-8 transition-all"
                    required
                  >
                    <option value="annual">Full Academic Year (Annual Fee)</option>
                    <option value="semester">Semester Fee (Half Year)</option>
                    <option value="monthly">Monthly Term Fee</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  Note: Day-wise fee counting is not permitted. Minimum unit is 1 Month.
                </p>
              </div>

            </div>

            {/* Calculated Transport Fee Box with Dashed Border */}
            <div className="border-2 border-dashed border-indigo-200 bg-gradient-to-r from-blue-50/40 via-indigo-50/20 to-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-black text-indigo-900 uppercase tracking-wider">
                  Calculated Transport Fee
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedStage
                    ? `Stage: ${selectedStage.stageName} • Timing: Pickup ${selectedStage.pickupTime || '07:45 AM'} / Drop ${selectedStage.dropTime || '05:15 PM'}`
                    : "Select route, stage and term to calculate fee"}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-3xl sm:text-4xl font-black text-[#120c7a] tracking-tight">
                  ₹{calculatedFee.toLocaleString('en-IN')}
                </span>
                {selectedStage && (
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                    Rate Configured • Term: {billingTerm.toUpperCase()}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submittingApply}
                className="w-full sm:w-auto px-6 py-3.5 bg-[#120c7a] hover:bg-blue-900 active:scale-98 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2.5 shadow-md shadow-indigo-900/10 transition-all cursor-pointer"
              >
                {submittingApply ? (
                  <>
                    <span className="animate-spin text-white">⏳</span> Submitting Application...
                  </>
                ) : (
                  <>
                    <span>🚀</span> Submit Application for Approval
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
        )
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY PASSES & STATUS */}
      {/* ========================================================================= */}
      {activeTab === "passes" && (
        <div className="space-y-6">
          {approvedApplications.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-[#120c7a] flex items-center justify-center mx-auto border border-indigo-100">
                <Ticket size={28} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">No Active Boarding Passes</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  You do not have any active approved boarding passes right now.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("apply")}
                className="px-5 py-2.5 bg-[#120c7a] text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 hover:bg-blue-900 transition-all cursor-pointer"
              >
                <PlusCircle size={15} /> Apply for New Pass
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {approvedApplications.map((pass) => {
                const isCancelCompleted = pass.status === "Cancelled" || pass.seatReleased === true || pass.allocatedSeat === "Released";
                const isCancelPending = pass.cancellationPending || pass.cancellationRequested || pass.status === "Cancellation Requested";
                const isApproved = !isCancelCompleted && (
                  pass.status === "Approved" ||
                  pass.status === "Active" ||
                  pass.status === "Sanctioned" ||
                  pass.status === "Issued" ||
                  Boolean(pass.principalApproved) ||
                  isCancelPending
                );

                return (
                  <div
                    key={pass.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5 hover:shadow-md transition-all relative overflow-hidden"
                  >
                    {/* Top status bar */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#120c7a] flex items-center justify-center font-black text-xs border border-indigo-100">
                          <Bus size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{pass.applicationNo || pass.id}</p>
                          <h4 className="text-sm font-black text-slate-900">{pass.routeCode}: {pass.routeName}</h4>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isCancelPending
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : isApproved
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : isCancelCompleted
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        {isCancelPending ? "Cancellation Under Review" : pass.status}
                      </span>
                    </div>

                    {/* Stage & Timing Grid */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/60 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Boarding Stop</p>
                        <p className="font-extrabold text-slate-800 mt-0.5 flex items-center gap-1">
                          <MapPin size={13} className="text-indigo-600 shrink-0" />
                          {pass.stageName}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Daily Pickup</p>
                        <p className="font-extrabold text-slate-800 mt-0.5 flex items-center gap-1">
                          <Clock size={13} className="text-emerald-600 shrink-0" />
                          {pass.pickupTime || "07:45 AM"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Billing Cycle & Validity</p>
                        <p className="font-bold text-slate-700 mt-0.5">{pass._validity?.validityLabel || pass.billingTermLabel || "Annual Fee"}</p>
                        <p className={`text-[10px] font-bold mt-0.5 ${pass._validity?.isExpired ? "text-rose-600" : "text-emerald-600"}`}>
                          {pass._validity?.isExpired
                            ? `Expired on ${pass._validity.validUntilStr}`
                            : `Valid till ${pass._validity?.validUntilStr || '—'} (${pass._validity?.daysRemaining ?? '—'}d left)`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Fee Amount</p>
                        <p className="font-black text-[#120c7a] mt-0.5">₹{(pass.calculatedFee || 0).toLocaleString('en-IN')}</p>
                      </div>
                    </div>

                    {/* Assigned Bus & Driver Info */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Assigned Bus</p>
                        <p className="font-bold text-slate-800">
                          {pass.allocatedBusNumber || pass.assignedBusNumber || (isApproved ? "Bus Assigned" : "Pending Allocation")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Driver Contact</p>
                        <p className="font-bold text-slate-800">
                          {pass.assignedDriverName || (isApproved ? "Driver Assigned" : "Pending Allocation")}
                        </p>
                      </div>
                    </div>

                    {/* Digital Pass View Action */}
                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
                      <p className="text-[11px] text-slate-400 font-medium">
                        Applied on {new Date(pass.appliedAt || Date.now()).toLocaleDateString('en-GB')}
                      </p>
                      {isApproved ? (
                        <button
                          onClick={() => setViewingPass(pass)}
                          className="px-3.5 py-1.5 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          <QrCode size={14} /> View Digital Pass
                        </button>
                      ) : (
                        <button
                          disabled
                          title="Digital pass will be unlocked once your boarding application is approved by the coordinator and Principal"
                          className="px-3 py-1.5 bg-slate-100 text-slate-400 border border-slate-200/80 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed opacity-75"
                        >
                          <Lock size={12} className="text-slate-400" />
                          <span>View Digital Pass (Locked)</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PRIOR ABSENCE INTIMATION (Image 2) */}
      {/* ========================================================================= */}
      {activeTab === "absence" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">

          {/* Header */}
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <span className="text-xl">📢</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Prior Absence Intimation to Driver & Coordinator
            </h2>
          </div>

          {/* Blue Info Callout Banner matching Image 2 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-950">
            <span className="text-amber-500 font-black text-sm shrink-0">⚡</span>
            <div>
              <p className="font-bold text-blue-950 mb-0.5">Why Intimate Prior Absence?</p>
              <p className="text-blue-900/80 font-normal leading-relaxed">
                Intimating your planned absence allows your bus driver to <strong>skip waiting at your stage stop</strong>, eliminating unnecessary idling time and ensuring smooth on-time transit for all fellow students on your route.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmitAbsence} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Field 1: Select Active Approved Boarding Pass */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Select Active Approved Boarding Pass <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={absencePassId}
                    onChange={(e) => setAbsencePassId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 appearance-none pr-8"
                    required
                  >
                    {approvedApplications.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.stageName} ({p.routeCode || 'Route'}) - Bus: {p.allocatedBusNumber || p.assignedBusNumber || "Allocated"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Field 2: Date of Planned Absence */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Date of Planned Absence <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={absenceDate}
                  onChange={(e) => setAbsenceDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>

              {/* Field 3: Target Session */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Target Session <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={absenceSession}
                    onChange={(e) => setAbsenceSession(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 appearance-none pr-8"
                    required
                  >
                    <option value="Morning Pickup">🌅 Morning Pickup Session Only</option>
                    <option value="Evening Drop">🌆 Evening Drop Session Only</option>
                    <option value="Both Sessions">🔄 Both Morning Pickup & Evening Drop</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Field 4: Reason for Absence */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Reason for Absence <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={absenceReason}
                    onChange={(e) => setAbsenceReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 appearance-none pr-8"
                    required
                  >
                    <option value="Personal Leave / Medical Appointment">Personal Leave / Medical Appointment</option>
                    <option value="Sick Leave / Health Issue">Sick Leave / Health Issue</option>
                    <option value="Family Event / Function">Family Event / Function</option>
                    <option value="Academic Competition / On-Duty">Academic Competition / On-Duty</option>
                    <option value="Own Vehicle Arrangement">Own Vehicle Arrangement</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

            </div>

            {/* Orange Button matching Image 2 */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submittingAbsence}
                className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <span>📢</span> Send Absence Intimation to Driver
              </button>
            </div>
          </form>

          {/* Submitted Absence Intimations Log Table */}
          <div className="space-y-3 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-black text-slate-900">Submitted Absence Intimations Log</h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Intimation ID</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Stage Name</th>
                    <th className="px-4 py-3">Absence Date</th>
                    <th className="px-4 py-3">Session</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Intimation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myAbsences.length === 0 ? (
                    // Default sample entry matching Image 2 when no prior absence is in firestore
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5 font-black text-slate-900">INT-2026-001</td>
                      <td className="px-4 py-3.5 font-bold text-slate-800">{studentProfile.fullName || "Student"}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-600">📍 Tech Park Circle</td>
                      <td className="px-4 py-3.5 font-bold text-slate-700">2026-08-14</td>
                      <td className="px-4 py-3.5 font-medium text-slate-600">Morning Pickup</td>
                      <td className="px-4 py-3.5 font-medium text-slate-600">Personal Leave / Medical Appointment</td>
                      <td className="px-4 py-3.5 text-right font-black text-emerald-700">Intimated To Driver</td>
                    </tr>
                  ) : (
                    myAbsences.map(abs => (
                      <tr key={abs.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3.5 font-black text-slate-900">{abs.intimationId}</td>
                        <td className="px-4 py-3.5 font-bold text-slate-800">{abs.studentName}</td>
                        <td className="px-4 py-3.5 font-semibold text-slate-600">📍 {abs.stageName}</td>
                        <td className="px-4 py-3.5 font-bold text-slate-700">{abs.absenceDate}</td>
                        <td className="px-4 py-3.5 font-medium text-slate-600">{abs.session}</td>
                        <td className="px-4 py-3.5 font-medium text-slate-600">{abs.reason}</td>
                        <td className="px-4 py-3.5 text-right font-black text-emerald-700">{abs.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CANCELLATION FORM (Image 3) */}
      {/* ========================================================================= */}
      {activeTab === "cancellation" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">

          {/* Header matching Image 3 */}
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <span className="text-xl">🚫</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Transport Boarding Pass Cancellation Request Form
            </h2>
          </div>

          {/* Yellow Institutional Policy Warning Callout matching Image 3 */}
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4.5 flex items-start gap-3.5 text-xs text-amber-950">
            <span className="text-amber-600 font-black text-base shrink-0">⚠️</span>
            <div>
              <p className="font-extrabold text-amber-950 mb-0.5">Important Institutional Policy:</p>
              <p className="text-amber-900/90 font-normal leading-relaxed">
                Cancellation requires sequential approval from the Transport Coordinator and Principal. As per institutional rules, <strong>cancellations cannot be accepted if there are any open pending payment dues</strong>. All fee dues must be cleared prior to processing seat release.
              </p>
            </div>
          </div>

          {/* Active Pending Cancellation Notice */}
          {activePendingCancellation && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4.5 flex items-start gap-3.5 text-xs text-blue-950">
              <Clock size={18} className="text-blue-600 font-black shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-blue-950 text-sm">Cancellation Request Submitted & Under Review</p>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 rounded-full font-black text-[10px] uppercase tracking-wide">
                    Awaiting Coordinator Verification
                  </span>
                </div>
                <p className="text-blue-900/90 font-normal leading-relaxed">
                  Your cancellation request for <strong>{activePendingCancellation.stageName} ({activePendingCancellation.routeName || 'Transport Route'})</strong> was submitted on {activePendingCancellation.requestedAt ? new Date(activePendingCancellation.requestedAt).toLocaleDateString('en-GB') : 'today'}. Your boarding pass and all transport privileges remain <strong>active</strong> until the Transport Coordinator verifies fee dues and officially approves seat release.
                </p>
                {activePendingCancellation.reason && (
                  <p className="text-[11px] text-blue-800 font-medium pt-0.5">
                    Reason submitted: <em>"{activePendingCancellation.reason}"</em>
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmitCancellation} className="space-y-5">

            {/* Field 1: Select Active Application / Pass to Cancel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Select Active Application / Pass to Cancel <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={cancelPassId}
                  onChange={(e) => setCancelPassId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 appearance-none pr-8"
                  required
                >
                  <option value="">-- Choose Transport Application / Pass --</option>
                  {approvedApplications.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.applicationNo || p.id} • {p.stageName} ({p.routeName}) - Status: {p.status}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Field 2: Reason for Boarding Pass Cancellation */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Reason for Boarding Pass Cancellation <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please state the reason for requesting transport cancellation (e.g., Relocation, Course Completion, Own Transport arrangements)..."
                className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none leading-relaxed"
                required
              />
            </div>

            {/* Red Submit Cancellation Request Button matching Image 3 */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submittingCancel}
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-sm transition-all cursor-pointer"
              >
                {submittingCancel ? "Submitting Request..." : "Submit Cancellation Request"}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIGITAL BOARDING PASS MODAL */}
      {/* ========================================================================= */}
      {viewingPass && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="bg-[#120c7a] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bus size={20} className="text-amber-300" />
                <div>
                  <h3 className="text-sm font-black tracking-tight">Digital Boarding Pass</h3>
                  <p className="text-[10px] text-blue-200">CKCET Student Transport Service</p>
                </div>
              </div>
              <button
                onClick={() => setViewingPass(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Pass Body */}
            {(() => {
              const viewingValidity = viewingPass._validity || getPassValidity(viewingPass);
              return (
                <div className="p-6 space-y-5">
                  {viewingValidity?.isExpired && (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-center text-xs text-rose-800 font-extrabold flex items-center justify-center gap-2">
                      <span>🚫</span>
                      <span>PASS DEACTIVATED • EXPIRED ON {viewingValidity.validUntilStr}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Student Name</p>
                      <p className="text-base font-black text-slate-900">{viewingPass.studentName}</p>
                      <p className="text-xs font-semibold text-slate-500">{viewingPass.regNo}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        viewingValidity?.isExpired
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {viewingValidity?.isExpired ? "Deactivated" : viewingPass.status}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">{viewingPass.academicYear}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Route</p>
                      <p className="font-black text-slate-800">{viewingPass.routeCode}: {viewingPass.routeName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Boarding Stage</p>
                      <p className="font-black text-indigo-700">📍 {viewingPass.stageName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Morning Pickup</p>
                      <p className="font-extrabold text-slate-800">⏰ {viewingPass.pickupTime || "07:45 AM"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Assigned Bus</p>
                      <p className="font-extrabold text-slate-800">🚌 {viewingPass.assignedBusNumber || "Bus 04"}</p>
                    </div>

                    {/* Validity Period Block */}
                    <div className="col-span-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Validity ({viewingValidity?.validityLabel || viewingPass.billingTermLabel || "Annual Pass"})
                        </p>
                        <p className="font-extrabold text-slate-800 mt-0.5">
                          {viewingValidity?.validFromStr || '—'} — {viewingValidity?.validUntilStr || '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                        <p className={`font-black text-xs ${viewingValidity?.isExpired ? "text-rose-600" : "text-emerald-700"}`}>
                          {viewingValidity?.isExpired ? "Expired" : `${viewingValidity?.daysRemaining} days left`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Authentic Scannable QR Code containing Student Register Number */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
                    <div className="relative w-28 h-28 bg-white border border-slate-300 rounded-xl p-1.5 flex items-center justify-center shadow-inner overflow-hidden">
                      {passQrCodeUrl ? (
                        <img
                          src={passQrCodeUrl}
                          alt={`QR code for ${viewingPass.regNo || studentProfile.studentId}`}
                          className={`w-full h-full object-contain ${viewingValidity?.isExpired ? "opacity-25 grayscale" : ""}`}
                        />
                      ) : (
                        <QrCode size={80} className="text-slate-800 animate-pulse" />
                      )}
                      {viewingValidity?.isExpired && (
                        <div className="absolute inset-0 bg-rose-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center text-white text-center p-1">
                          <span className="text-sm font-black">🚫</span>
                          <span className="text-[9px] font-black uppercase tracking-wider leading-tight">DEACTIVATED</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-mono font-black text-slate-900 tracking-wider">
                        {viewingPass.regNo || studentProfile.studentId}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {viewingPass.applicationNo || viewingPass.id}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => window.print()}
                    className="w-full py-2.5 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Printer size={14} /> Print Boarding Pass
                  </button>
                </div>
              );
            })()}

          </div>
        </div>
      )}

    </div>
  );
}
