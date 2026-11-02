import React, { useState, useEffect, useMemo, useCallback } from "react";
import { auth, db, functions } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCachedStudentProfile, setCachedStudentProfile } from "../../lib/studentSession";
import { formatProgDisplay, formatBatchDisplay, isDeptMatch } from "../../lib/utils";
import {
  GraduationCap,
  IndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Receipt,
  Printer,
  RefreshCw,
  Lock,
  Calendar,
  X,
  Info,
  Download,
} from "lucide-react";

export default function StudentEseFee() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [studentData, setStudentData] = useState(() => getCachedStudentProfile());
  const [loading, setLoading] = useState(true);

  // Exam & Settings State
  const [eseSettings, setEseSettings] = useState({
    isOpen: true,
    selectedExamId: "",
    instructions: "",
    fromDate: "",
    toDate: "",
    batchWindows: {},
  });
  const [allExams, setAllExams] = useState([]);
  const [examData, setExamData] = useState(null);
  const [allocatedFee, setAllocatedFee] = useState(null);
  const [feeDocDetails, setFeeDocDetails] = useState(null);

  // Registration & Payment State
  const [existingReg, setExistingReg] = useState(null);
  const [initiatingPay, setInitiatingPay] = useState(false);
  const [verifyingPay, setVerifyingPay] = useState(false);
  const [receiptModal, setReceiptModal] = useState({ open: false, data: null });
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4500);
  };

  // 1. Auth & Student Data Fetch
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          setStudentData(uData);
          setCachedStudentProfile(uData, user.uid);
        }
      } catch (err) {
        console.error("Error fetching user doc:", err);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Candidate Register Number resolution
  const studentReg = useMemo(() => {
    if (!studentData) return "";
    const reg =
      studentData.regNo ||
      studentData.registerNo ||
      studentData.registerNumber ||
      studentData.reg ||
      studentData.admissionNo ||
      studentData.admNo ||
      studentData.rollNo ||
      "";
    return String(reg).trim();
  }, [studentData]);

  // 2. Realtime listener on ESE Exams created in Exam Cell
  useEffect(() => {
    const unsubExams = onSnapshot(
      collection(db, "ese_exams"),
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return tb - ta;
        });
        setAllExams(list);
      },
      (err) => console.warn("ese_exams sync error:", err)
    );
    return () => unsubExams();
  }, []);

  // 3. Realtime listener on ESE Registration Settings
  useEffect(() => {
    const unsubSettings = onSnapshot(
      doc(db, "exam_cell_settings", "ese_registration"),
      async (snap) => {
        if (snap.exists()) {
          const d = snap.data() || {};
          setEseSettings({
            isOpen: d.isOpen !== false,
            selectedExamId: d.selectedExamId || "",
            instructions: d.instructions || "",
            fromDate: d.fromDate || "",
            toDate: d.toDate || "",
            batchWindows: d.batchWindows || {},
          });

          // Fetch exam details if selected
          if (d.selectedExamId) {
            try {
              const examSnap = await getDoc(doc(db, "ese_exams", d.selectedExamId));
              if (examSnap.exists()) {
                setExamData({ id: examSnap.id, ...examSnap.data() });
              }
            } catch (e) {
              console.error("Error fetching exam details:", e);
            }
          }
        }
      },
      (err) => console.error("Error reading ese_registration settings:", err)
    );
    return () => unsubSettings();
  }, []);

  // 4. Resolve Allocated Fee for this Student
  useEffect(() => {
    if (!studentReg) return;

    const unsubFees = onSnapshot(
      collection(db, "ese_student_fees"),
      (snapshot) => {
        let foundFee = null;
        let matchedDoc = null;

        const cleanReg = studentReg.toLowerCase();
        const stdProg = (studentData?.programme || "").toUpperCase();
        const stdBatch = (studentData?.batch || "").trim();
        const stdDept = (studentData?.department || "").trim();

        // Pass 1: Look for exact doc matching this student's register number in fees map
        snapshot.forEach((d) => {
          const data = d.data();
          const feesMap = data.fees || {};

          for (const [k, v] of Object.entries(feesMap)) {
            if (String(k).trim().toLowerCase() === cleanReg && v !== undefined && v !== null && v !== "") {
              foundFee = Number(v);
              matchedDoc = { id: d.id, ...data };
              return;
            }
          }

          if (foundFee === null && Array.isArray(data.students)) {
            const entry = data.students.find(
              (s) => String(s.reg || s.regNo || "").trim().toLowerCase() === cleanReg
            );
            if (entry && entry.fee !== undefined && entry.fee !== null && entry.fee !== "") {
              foundFee = Number(entry.fee);
              matchedDoc = { id: d.id, ...data };
            }
          }
        });

        // Pass 2: Fallback to batch-level doc if available
        if (foundFee !== null) {
          setAllocatedFee(foundFee);
          setFeeDocDetails(matchedDoc);
        } else {
          let classDoc = null;
          snapshot.forEach((d) => {
            const data = d.data();
            if (
              stdBatch &&
              data.batch === stdBatch &&
              (!stdProg || data.programme === stdProg || !data.programme) &&
              (!stdDept || isDeptMatch(data.department, stdDept))
            ) {
              classDoc = { id: d.id, ...data };
            }
          });
          setFeeDocDetails(classDoc);
          setAllocatedFee(null);
        }
      },
      (err) => console.error("Error reading ese_student_fees:", err)
    );

    return () => unsubFees();
  }, [studentReg, studentData]);

  // Dynamic Exam Details Resolution (Created Exam in ExamFormSettingPage.jsx)
  const activeExam = useMemo(() => {
    if (feeDocDetails?.examId) {
      const found = allExams.find((e) => e.id === feeDocDetails.examId);
      if (found) return found;
    }
    if (eseSettings.selectedExamId) {
      const found = allExams.find((e) => e.id === eseSettings.selectedExamId);
      if (found) return found;
    }
    return allExams[0] || examData || null;
  }, [feeDocDetails, eseSettings.selectedExamId, allExams, examData]);

  const resolvedExamName = useMemo(() => {
    return (
      feeDocDetails?.examName ||
      activeExam?.name ||
      examData?.name ||
      "End Semester Autonomous Examination"
    );
  }, [feeDocDetails, activeExam, examData]);

  const resolvedExamSession = useMemo(() => {
    return (
      activeExam?.session ||
      examData?.session ||
      feeDocDetails?.session ||
      ""
    );
  }, [activeExam, examData, feeDocDetails]);

  const resolvedAcademicYear = useMemo(() => {
    return (
      activeExam?.academicYear ||
      examData?.academicYear ||
      feeDocDetails?.academicYear ||
      ""
    );
  }, [activeExam, examData, feeDocDetails]);

  // 5. Listen to Existing Registration & Payment Record for this student
  useEffect(() => {
    if (!currentUser && !studentReg) return;

    const q = query(collection(db, "ese_fee_registrations"));

    const unsubReg = onSnapshot(
      q,
      (snapshot) => {
        let match = null;
        snapshot.forEach((d) => {
          const data = d.data();
          const matches =
            (currentUser?.uid && data.studentUid === currentUser.uid) ||
            (studentReg && String(data.regNo || "").trim().toLowerCase() === studentReg.toLowerCase());

          if (matches) {
            const targetExamId = activeExam?.id || eseSettings.selectedExamId;
            if (targetExamId && data.examId === targetExamId) {
              match = { id: d.id, ...data };
            } else if (!match) {
              match = { id: d.id, ...data };
            }
          }
        });
        setExistingReg(match);
      },
      (err) => console.error("Error reading ese_fee_registrations:", err)
    );

    return () => unsubReg();
  }, [currentUser, studentReg, activeExam?.id, eseSettings.selectedExamId]);

  // Window status evaluate
  const windowStatus = useMemo(() => {
    if (eseSettings.isOpen === false) {
      return { open: false, label: "Registration Closed" };
    }

    const today = new Date().toISOString().slice(0, 10);
    const fromDate =
      feeDocDetails?.fromDate ||
      (feeDocDetails?.id && eseSettings.batchWindows?.[feeDocDetails.id]?.fromDate) ||
      eseSettings.fromDate ||
      "";
    const toDate =
      feeDocDetails?.toDate ||
      (feeDocDetails?.id && eseSettings.batchWindows?.[feeDocDetails.id]?.toDate) ||
      eseSettings.toDate ||
      "";

    if (fromDate && today < fromDate) {
      return {
        open: false,
        label: `Registration Opens on ${fromDate}`,
        fromDate,
        toDate,
      };
    }
    if (toDate && today > toDate) {
      return {
        open: false,
        label: `Registration Closed on ${toDate}`,
        fromDate,
        toDate,
      };
    }
    return {
      open: true,
      label: toDate ? `Open till ${toDate}` : "Registration Open",
      fromDate,
      toDate,
    };
  }, [eseSettings, feeDocDetails]);

  // Payment Verification on Return from Gateway or on Manual Refresh
  const verifyPaymentOnReturn = useCallback(
    async (orderId, targetRegId = null, isManual = false) => {
      if (!orderId) return;
      setVerifyingPay(true);

      const safetyTimer = setTimeout(() => {
        setVerifyingPay(false);
      }, 12000);

      try {
        const verifyFn = httpsCallable(functions, "verifyExamCellPayment");
        const result = await verifyFn({ orderId, appId: targetRegId });
        const data = result.data || {};

        let isSuccess =
          data.success ||
          data.status === "SUCCESS" ||
          ["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(
            (data.hdfcStatus || "").toUpperCase()
          );

        // Fallback: Direct check on exam_cell_payments collection
        if (!isSuccess && orderId) {
          try {
            const payDocSnap = await getDoc(doc(db, "exam_cell_payments", orderId));
            if (payDocSnap.exists()) {
              const pData = payDocSnap.data();
              const hdfcStat = (pData.hdfcStatus || pData.status || "").toUpperCase();
              if (["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(hdfcStat)) {
                isSuccess = true;
              }
            }
          } catch (e) {
            console.error("Direct check on exam_cell_payments error:", e);
          }
        }

        if (isSuccess) {
          const effectiveRegId =
            targetRegId ||
            existingReg?.id ||
            `${activeExam?.id || eseSettings.selectedExamId || "ESE"}_${studentReg || currentUser?.uid}`;

          const receiptNo = `REC-ESE-${orderId}`;
          const paidTimestamp = serverTimestamp();
          const nowIso = new Date().toISOString();
          const nowDateStr = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const nowTimeStr = new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          });

          const updatePayload = {
            orderId,
            paymentStatus: "Paid",
            status: "Paid",
            receiptNo,
            paidAt: paidTimestamp,
            paidAtIso: nowIso,
            paidDate: nowDateStr,
            paidTime: nowTimeStr,
            timestamp: paidTimestamp,
            isoTimestamp: nowIso,
            updatedAt: paidTimestamp,
            examId: activeExam?.id || eseSettings.selectedExamId || "",
            examName: resolvedExamName,
            examSession: resolvedExamSession,
            academicYear: resolvedAcademicYear,
            regNo: studentReg,
            studentName:
              studentData?.displayName ||
              studentData?.studentName ||
              studentData?.name ||
              currentUser?.email ||
              "Student",
            department: studentData?.department || "",
            batch: studentData?.batch || "",
            section: studentData?.section || "A",
            programme: studentData?.programme || "UG",
            feeAmount: Number(allocatedFee || data.amount || 0),
            billAttached: true,
            paymentGateway: "HDFC SmartGateway (Exam Cell Account #76983)",
          };

          try {
            await setDoc(doc(db, "ese_fee_registrations", effectiveRegId), updatePayload, { merge: true });
            // Save dedicated audit payment record for easy query/lookup in Firestore
            await setDoc(doc(db, "ese_fee_payments", orderId), {
              ...updatePayload,
              registrationId: effectiveRegId,
            }, { merge: true });
          } catch (err) {
            console.error("Firestore update error on ese_fee_registrations:", err);
          }

          localStorage.removeItem("ese_pending_payment");

          showToast(
            `ESE Exam Fee Payment Successful! Amount ₹${allocatedFee || data.amount || ""} paid. Receipt generated.`,
            "success"
          );
        } else if (isManual) {
          showToast(`Payment Status: ${data.status || "Pending"}. Order ID: ${orderId}`, "error");
        }
      } catch (err) {
        console.error("Verify exam cell payment error:", err);
        if (isManual) showToast("Payment status check completed.", "info");
      } finally {
        clearTimeout(safetyTimer);
        setVerifyingPay(false);
      }
    },
    [
      allocatedFee,
      existingReg,
      activeExam?.id,
      eseSettings.selectedExamId,
      resolvedExamName,
      resolvedExamSession,
      resolvedAcademicYear,
      studentReg,
      currentUser,
      studentData,
    ]
  );

  // Handle Redirect Return from Gateway (?order_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    if (orderId) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      verifyPaymentOnReturn(orderId, null, true);
    }
  }, [verifyPaymentOnReturn]);

  // Clean Dept Name Helper
  const cleanDeptName = (dept) => {
    if (!dept) return "";
    return dept
      .replace(/B_Tech_/gi, "B.Tech. ")
      .replace(/B_E_/gi, "B.E. ")
      .replace(/M_Tech_/gi, "M.Tech. ")
      .replace(/M_E_/gi, "M.E. ")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Reusable Official A4 PDF Receipt Generator (Exact layout matching Image 1)
  const generateOfficialReceiptPDF = async (receiptData) => {
    const doc = new jsPDF({ orientation: "portrait", format: "a4", unit: "mm" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Outer aesthetic double border
    doc.setDrawColor(18, 12, 122);
    doc.setLineWidth(0.7);
    doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
    doc.setDrawColor(210, 215, 230);
    doc.setLineWidth(0.3);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

    // Load /logo.png as Image for PDF Header
    let yPos = 13;
    try {
      const logoImg = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "/logo.png";
      });
      if (logoImg && logoImg.width > 0) {
        const maxWidth = 160;
        const maxHeight = 22;
        const ratio = Math.min(maxWidth / logoImg.width, maxHeight / logoImg.height);
        const logoWidth = logoImg.width * ratio;
        const logoHeight = logoImg.height * ratio;
        doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 4;
      } else {
        doc.setTextColor(18, 12, 122);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("C.K. COLLEGE OF ENGINEERING AND TECHNOLOGY", pageWidth / 2, yPos + 6, { align: "center" });
        yPos += 14;
      }
    } catch (e) {
      yPos += 14;
    }

    // Title Banner
    doc.setFillColor(18, 12, 122);
    doc.roundedRect(14, yPos, pageWidth - 28, 7.5, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("OFFICIAL END SEMESTER EXAMINATION (ESE) FEE RECEIPT", pageWidth / 2, yPos + 5, { align: "center" });

    const receiptNo = receiptData.receiptNo || `REC-ESE-${receiptData.orderId || "REF"}`;
    const paidDateStr =
      receiptData.paidDate ||
      new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const paidTimeStr =
      receiptData.paidTime ||
      new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    // Metadata Banner Box
    autoTable(doc, {
      startY: yPos + 10,
      margin: { left: 14, right: 14 },
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: 2, textColor: [30, 41, 59] },
      body: [
        [
          { content: `Receipt No: ${receiptNo}`, styles: { fontStyle: "bold", textColor: [18, 12, 122] } },
          { content: `Date & Time: ${paidDateStr} ${paidTimeStr}`, styles: { halign: "right", fontStyle: "bold" } },
        ],
        [
          { content: `Order / Txn ID: ${receiptData.orderId || "-"}`, styles: { fontStyle: "normal" } },
          { content: `Payment Status: SUCCESS / PAID`, styles: { halign: "right", fontStyle: "bold", textColor: [16, 122, 59] } },
        ],
      ],
    });

    let nextY = doc.lastAutoTable.finalY + 3;

    // Student & Examination Details Table
    autoTable(doc, {
      startY: nextY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      head: [["Candidate & Examination Information", "Details"]],
      body: [
        ["Register Number", String(receiptData.regNo || studentReg || "-").toUpperCase()],
        [
          "Candidate Full Name",
          String(
            receiptData.studentName || studentData?.displayName || studentData?.name || "Candidate"
          ).toUpperCase(),
        ],
        [
          "Programme & Department",
          `${formatProgDisplay(studentData?.programme || "UG")} - ${cleanDeptName(studentData?.department) || "General"}`,
        ],
        [
          "Batch & Section",
          `Batch ${formatBatchDisplay(studentData?.batch || "N/A")} | Sec ${studentData?.section || "A"}`,
        ],
        ["Examination Name", String(receiptData.examName || resolvedExamName)],
        [
          "Session & Academic Year",
          `${receiptData.examSession || resolvedExamSession || "Regular / Arrear"} (AY: ${receiptData.academicYear || resolvedAcademicYear || "2026-2027"})`,
        ],
        ["Payment Mode / Gateway", "Online (HDFC SmartGateway)"],
      ],
      columnStyles: {
        0: { cellWidth: 60, fontStyle: "bold", fillColor: [248, 250, 252] },
        1: { cellWidth: "auto" },
      },
    });

    nextY = doc.lastAutoTable.finalY + 4;

    // Fee Breakdown Table
    const feeNum = Number(receiptData.amount || allocatedFee || receiptData.feeAmount || 0);
    autoTable(doc, {
      startY: nextY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
      headStyles: { fillColor: [18, 12, 122], textColor: [255, 255, 255], fontStyle: "bold" },
      head: [["S.No", "Description / Fee Head", "Amount (INR)"]],
      body: [
        ["1", "End Semester Autonomous Examination Registration Fee", `INR ${feeNum.toLocaleString("en-IN")}`],
      ],
      foot: [["", "Total Amount Paid", `INR ${feeNum.toLocaleString("en-IN")}`]],
      footStyles: { fillColor: [241, 245, 249], textColor: [18, 12, 122], fontStyle: "bold", fontSize: 9.5 },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 45, halign: "right", fontStyle: "bold" },
      },
    });

    nextY = doc.lastAutoTable.finalY + 8;

    // Disclaimers & Info
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 110);
    doc.text(
      "• This is an official system-generated computerized payment receipt issued by the Autonomous Examination Cell.",
      14,
      nextY
    );
    doc.text(
      "• Retain this receipt for all future examination references, hall ticket verification, and grade sheet processing.",
      14,
      nextY + 4
    );

    // Signatures Block
    const sigY = pageHeight - 32;
    doc.setDrawColor(180, 185, 200);
    doc.setLineWidth(0.4);
    doc.line(16, sigY, 70, sigY);
    doc.line(pageWidth - 75, sigY, pageWidth - 16, sigY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Accountant / Cashier", 43, sigY + 4.5, { align: "center" });
    doc.text("Controller of Examinations", pageWidth - 45.5, sigY + 4.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 130);
    doc.text("C.K College of Engg. & Tech.", 43, sigY + 8.5, { align: "center" });
    doc.text("Autonomous Examination Cell", pageWidth - 45.5, sigY + 8.5, { align: "center" });

    return doc;
  };

  // Direct A4 PDF Download Handler
  const handleDownloadReceiptPDF = async (receiptData) => {
    try {
      showToast("Generating official examination fee receipt PDF...", "info");
      const doc = await generateOfficialReceiptPDF(receiptData);
      doc.save(`ESE_Fee_Receipt_${studentReg || "Candidate"}_${receiptData.orderId || "Txn"}.pdf`);
      showToast("Official ESE Examination Fee Receipt downloaded successfully!", "success");
    } catch (err) {
      console.error("Download ESE receipt PDF error:", err);
      showToast("Failed to download PDF receipt: " + err.message, "error");
    }
  };

  // Official Receipt Print Preview Handler (Opens exact 1:1 PDF preview with print dialog)
  const handlePrintOfficialReceipt = async (receiptData) => {
    try {
      showToast("Opening official receipt print preview...", "info");
      const doc = await generateOfficialReceiptPDF(receiptData);
      doc.autoPrint();
      const blobUrl = doc.output("bloburl");

      // Open PDF directly in new window with Chrome/Safari PDF print preview
      const printWin = window.open(blobUrl, "_blank");
      if (!printWin || printWin.closed || typeof printWin.closed === "undefined") {
        // Fallback to invisible iframe if pop-up blocker intercepted
        let iframe = document.getElementById("pdf-receipt-print-iframe");
        if (iframe) iframe.remove();
        iframe = document.createElement("iframe");
        iframe.id = "pdf-receipt-print-iframe";
        iframe.style.position = "fixed";
        iframe.style.top = "-9999px";
        iframe.style.left = "-9999px";
        iframe.style.width = "1px";
        iframe.style.height = "1px";
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            } catch (err) {
              console.error("Iframe print error fallback:", err);
              window.print();
            }
          }, 350);
        };
      }
      showToast("Official receipt preview loaded!", "success");
    } catch (err) {
      console.error("Print official receipt error:", err);
      window.print();
    }
  };

  // Initiate Payment
  const handleStartPayment = async () => {
    if (!currentUser || !studentData) {
      showToast("Please login with student credentials to proceed.", "error");
      return;
    }
    if (!studentReg) {
      showToast("Register number is missing in your profile. Please contact Exam Cell.", "error");
      return;
    }
    if (allocatedFee === null || allocatedFee === undefined) {
      showToast("No exam fee has been allocated for your register number yet.", "error");
      return;
    }

    setInitiatingPay(true);
    try {
      const examId = activeExam?.id || eseSettings.selectedExamId || "CURRENT_EXAM";
      const regDocId = `${examId}_${studentReg}`;
      const nowIso = new Date().toISOString();
      const nowDateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      // Pre-create or update registration doc in Firestore with complete timestamps
      await setDoc(
        doc(db, "ese_fee_registrations", regDocId),
        {
          examId,
          examName: resolvedExamName,
          examSession: resolvedExamSession,
          academicYear: resolvedAcademicYear,
          studentUid: currentUser.uid,
          studentName:
            studentData.displayName || studentData.studentName || studentData.name || currentUser.email,
          regNo: studentReg,
          email: currentUser.email || "",
          programme: studentData.programme || "",
          department: studentData.department || "",
          batch: studentData.batch || "",
          section: studentData.section || "A",
          feeAmount: Number(allocatedFee),
          paymentStatus: "Payment Pending",
          status: "Payment Pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdIso: nowIso,
          createdDate: nowDateStr,
          timestamp: serverTimestamp(),
        },
        { merge: true }
      );

      const createSessionFn = httpsCallable(functions, "createExamCellPaymentSession");
      const returnUrl = window.location.origin + window.location.pathname;

      const res = await createSessionFn({
        amount: Number(allocatedFee),
        category: "ESE Exam Fee",
        referenceId: regDocId,
        studentUid: currentUser.uid,
        studentReg: studentReg,
        studentName:
          studentData.displayName || studentData.studentName || studentData.name || currentUser.email,
        studentEmail: currentUser.email || "",
        studentPhone: studentData.phone || studentData.mobile || "9999999999",
        returnUrl: returnUrl,
        notes: {
          examId,
          examName: resolvedExamName,
          department: studentData.department || "",
          batch: studentData.batch || "",
          regNo: studentReg,
        },
      });

      if (res.data?.success && res.data?.paymentUrl) {
        const orderId = res.data.orderId;

        if (orderId) {
          try {
            await setDoc(
              doc(db, "ese_fee_registrations", regDocId),
              {
                orderId: orderId,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            localStorage.setItem(
              "ese_pending_payment",
              JSON.stringify({
                orderId,
                regDocId,
                regNo: studentReg,
                examId,
                feeAmount: allocatedFee,
                timestamp: Date.now(),
              })
            );
          } catch (e) {
            console.error("Error saving pending payment intent:", e);
          }
        }

        window.location.href = res.data.paymentUrl;
        return;
      } else {
        showToast("Gateway response did not contain a valid payment URL.", "error");
      }
    } catch (err) {
      console.error("Initiate ESE payment error:", err);
      showToast("Payment Gateway Error: " + (err.message || "Failed to initiate session"), "error");
    } finally {
      setInitiatingPay(false);
    }
  };

  const isPaid = existingReg?.paymentStatus === "Paid" || existingReg?.status === "Paid";

  const receiptData = useMemo(() => {
    return {
      ...existingReg,
      amount: allocatedFee || existingReg?.feeAmount || 0,
      examName: resolvedExamName,
      examSession: resolvedExamSession,
      academicYear: resolvedAcademicYear,
      studentName:
        studentData?.displayName || studentData?.studentName || studentData?.name || existingReg?.studentName,
      regNo: studentReg || existingReg?.regNo,
    };
  }, [existingReg, allocatedFee, resolvedExamName, resolvedExamSession, resolvedAcademicYear, studentData, studentReg]);

  return (
    <div className="w-full px-3.5 sm:px-6 lg:px-8 py-3 sm:py-5 space-y-3.5 sm:space-y-5 max-w-5xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Toast Notification Positioned safely below 64px Title Bar (top-20) */}
      {toast.show && (
        <div
          className={`fixed top-20 right-4 sm:right-6 z-[9999] max-w-sm sm:max-w-md px-4 py-3 rounded-xl shadow-2xl text-white font-medium text-xs sm:text-sm flex items-start gap-2.5 animate-in slide-in-from-top-3 border border-white/20 backdrop-blur-md ${toast.type === "error"
            ? "bg-rose-600"
            : toast.type === "info"
              ? "bg-blue-600"
              : "bg-emerald-600"
            }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={17} className="shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
          )}
          <span className="leading-snug flex-1 break-words">{toast.message}</span>
          <button
            onClick={() => setToast({ show: false, message: "", type: "success" })}
            className="p-1 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Hero Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c1a40] via-[#120c7a] to-[#281c9d] p-4 sm:p-5 md:p-6 text-white shadow-lg">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 sm:w-64 h-48 sm:h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 sm:w-64 h-48 sm:h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] sm:text-[11px] font-semibold text-indigo-200">
              <GraduationCap size={13} className="text-amber-300 shrink-0" />
              <span>Office of the Controller of Examinations</span>
            </div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white leading-snug">
              End Semester Examination (ESE) Fee
            </h1>
            <p className="text-indigo-200/90 text-xs sm:text-xs max-w-xl leading-relaxed">
              Pay your autonomous semester examination fees securely via HDFC SmartGateway and
              download computerized examination receipts.
            </p>
          </div>

          {/* Window Status Badge */}
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-1.5 shrink-0 pt-2 md:pt-0 border-t border-white/10 md:border-t-0">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[10px] sm:text-[11px] font-bold shadow-sm backdrop-blur-md ${windowStatus.open
                ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
                : "bg-rose-500/20 border-rose-400/40 text-rose-200"
                }`}
            >
              <Clock size={13} className="shrink-0" />
              <span>{windowStatus.label}</span>
            </div>
            {windowStatus.fromDate && windowStatus.toDate && (
              <span className="text-[10px] text-indigo-200/80 font-medium">
                {windowStatus.fromDate} to {windowStatus.toDate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Student & Exam Overview + Fee Action Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-5">
        {/* Left Column: Student & Examination Profile */}
        <div className="lg:col-span-2 space-y-3.5 sm:space-y-4">
          {/* Student Profile Card */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#120c7a] shrink-0" />
                Student Candidate Credentials
              </h3>
              <span className="self-start sm:self-auto px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-[#120c7a] border border-blue-100">
                Autonomous Regular / Arrear
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Register Number
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono tracking-wide break-words block">
                  {studentReg || "Not Available"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Candidate Full Name
                </span>
                <span className="text-xs sm:text-sm font-semibold text-slate-800 break-words block">
                  {studentData?.displayName ||
                    studentData?.studentName ||
                    studentData?.name ||
                    currentUser?.email ||
                    "Student"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Programme & Department
                </span>
                <span className="text-xs font-medium text-slate-700 break-words block leading-snug">
                  {formatProgDisplay(studentData?.programme || "UG")} - {cleanDeptName(studentData?.department) || "General"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Batch & Section
                </span>
                <span className="text-xs font-medium text-slate-700 break-words block">
                  Batch {formatBatchDisplay(studentData?.batch || "N/A")} | Sec {studentData?.section || "A"}
                </span>
              </div>

              {/* Exam Name (Below Programme & Department) */}
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Exam Name
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 break-words block leading-snug">
                  {resolvedExamName}
                </span>
              </div>

              {/* Exam Session & AY (Below Batch & Section) */}
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-0.5">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block">
                  Exam Session & Academic Year
                </span>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-xs font-semibold text-slate-800">
                    {resolvedExamSession || "Regular / Arrear"}
                  </span>
                  {resolvedAcademicYear && (
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 font-mono">
                      AY: {resolvedAcademicYear}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {eseSettings.instructions && (
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 mt-2">
                <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <span className="font-bold block text-[11px]">Instructions from Exam Cell:</span>
                  <p className="whitespace-pre-line text-amber-800/90 text-[11px] leading-relaxed break-words">
                    {eseSettings.instructions}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fee Allocation & Payment Action Card */}
        <div className="space-y-3.5 sm:space-y-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs relative overflow-hidden flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Summary
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${isPaid
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : allocatedFee !== null
                      ? "bg-blue-50 text-[#120c7a] border-blue-200"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                >
                  {isPaid ? "Paid & Confirmed" : allocatedFee !== null ? "Pending Payment" : "Unconfigured"}
                </span>
              </div>

              {/* Amount Display */}
              <div className="text-center py-2.5 px-3 rounded-xl bg-gradient-to-b from-slate-50/80 to-slate-100/60 border border-slate-100 space-y-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                  Examination Fee Payable
                </span>
                {allocatedFee !== null ? (
                  <div className="flex items-baseline justify-center gap-0.5 text-2xl sm:text-3xl font-black text-slate-900 font-mono">
                    <span className="text-base text-slate-500 font-sans">₹</span>
                    <span>{Number(allocatedFee).toLocaleString("en-IN")}</span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-amber-600 py-1">Fee Pending</div>
                )}
                <span className="text-[10px] text-slate-400 block font-medium">
                  Inclusive of Regular / Arrear Exam Registration
                </span>
              </div>

              {/* Action Buttons */}
              {isPaid ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1 text-center">
                    <CheckCircle2 size={18} className="mx-auto text-emerald-600" />
                    <p className="font-bold text-xs">Payment Completed Successfully</p>
                    <div className="text-[10px] text-emerald-800 space-y-0.5">
                      <div>
                        Receipt No: <strong className="font-mono">{existingReg.receiptNo || "Generated"}</strong>
                      </div>
                      {existingReg.orderId && (
                        <div>
                          Order ID: <strong>{existingReg.orderId}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct PDF Download Button */}
                  <button
                    onClick={() => handleDownloadReceiptPDF(receiptData)}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[40px]"
                  >
                    <Download size={14} />
                    <span>Download Receipt (PDF)</span>
                  </button>

                  {/* Print / View Receipt Modal Button */}
                  <button
                    onClick={() => setReceiptModal({ open: true, data: receiptData })}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[36px]"
                  >
                    <Receipt size={14} />
                    <span>View & Print Receipt</span>
                  </button>
                </div>
              ) : allocatedFee !== null ? (
                <div className="space-y-2.5">
                  <button
                    onClick={handleStartPayment}
                    disabled={initiatingPay || !windowStatus.open}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer min-h-[44px] ${initiatingPay || !windowStatus.open
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-[#120c7a] to-[#281c9d] hover:from-[#0c1a40] hover:to-[#120c7a] text-white shadow-indigo-950/20 active:scale-[0.98]"
                      }`}
                  >
                    {initiatingPay ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Connecting to Gateway...</span>
                      </>
                    ) : (
                      <>
                        <IndianRupee size={15} />
                        <span>Pay ESE Exam Fee (₹{Number(allocatedFee).toLocaleString("en-IN")})</span>
                      </>
                    )}
                  </button>

                  {/* Manual Refresh / Verify Status Button */}
                  {existingReg?.orderId && (
                    <button
                      onClick={() => verifyPaymentOnReturn(existingReg.orderId, existingReg.id, true)}
                      disabled={verifyingPay}
                      className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
                    >
                      <RefreshCw size={13} className={verifyingPay ? "animate-spin text-[#120c7a]" : ""} />
                      <span>Check / Refresh Payment Status</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1 text-center">
                  <AlertCircle size={18} className="mx-auto text-amber-600 mb-0.5" />
                  <p className="font-bold text-xs">Fee Allocation Pending</p>
                  <p className="text-[10px] text-amber-800/80 leading-relaxed">
                    The examination fee for register number{" "}
                    <strong className="font-mono">{studentReg}</strong> has not yet been saved in the
                    Exam Cell system. Please check back shortly.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Security Assurance */}
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium text-center">
              <Lock size={12} className="text-emerald-600 shrink-0" />
              <span>256-Bit SSL Encrypted Payment by HDFC Bank</span>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      {receiptModal.open && receiptModal.data && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
          id="receipt-modal-backdrop"
          onClick={() => setReceiptModal({ open: false, data: null })}
        >
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
              body {
                visibility: hidden !important;
                background: white !important;
              }
              #receipt-modal-backdrop {
                position: fixed !important;
                inset: 0 !important;
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                visibility: visible !important;
                overflow: visible !important;
                display: block !important;
                z-index: 9999999 !important;
              }
              #receipt-modal-content {
                max-width: 100% !important;
                max-height: none !important;
                overflow: visible !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                visibility: visible !important;
                background: white !important;
              }
              #printable-receipt {
                visibility: visible !important;
                display: block !important;
                margin: 0 auto !important;
                padding: 10mm 8mm !important;
                border: 2px solid #120c7a !important;
                box-shadow: none !important;
                background: white !important;
                width: 100% !important;
                max-width: 195mm !important;
              }
              #printable-receipt * {
                visibility: visible !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div
            id="receipt-modal-content"
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[94vh] overflow-y-auto shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Actions Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 no-print">
              <div className="flex items-center gap-2 text-[#120c7a] font-bold text-xs sm:text-sm">
                <Receipt size={17} className="shrink-0" />
                <span>Autonomous Exam Fee Official Receipt</span>
              </div>
              <button
                onClick={() => setReceiptModal({ open: false, data: null })}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            {/* Printable Area - Exact Visual Replica of Official A4 Document (Image 1) */}
            <div
              id="printable-receipt"
              className="p-4 sm:p-6 bg-white text-slate-800 space-y-3 sm:space-y-3.5 border-2 border-[#120c7a] rounded-none shadow-sm relative outline outline-1 outline-[#d2d7e6] outline-offset-3"
            >
              {/* College Header with Official Logo Image */}
              <div className="text-center space-y-2 pb-1">
                <img
                  src="/logo.png"
                  alt="C.K. College of Engineering and Technology"
                  className="w-full max-w-[420px] sm:max-w-[480px] h-auto mx-auto object-contain block"
                />
                <div className="bg-[#120c7a] text-white py-1 px-3 rounded-xs text-center font-bold text-[10px] sm:text-[11px] uppercase tracking-wide">
                  OFFICIAL END SEMESTER EXAMINATION (ESE) FEE RECEIPT
                </div>
              </div>

              {/* Receipt & Order Metadata Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] py-1 border-b border-slate-200 gap-1 text-slate-800">
                <div className="space-y-0.5">
                  <div>
                    <span className="font-bold text-[#120c7a]">Receipt No: </span>
                    <span className="font-mono font-bold text-slate-900">
                      {receiptModal.data.receiptNo || `REC-ESE-${receiptModal.data.orderId || "REF"}`}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Order / Txn ID:{" "}
                    <span className="font-mono text-slate-700 font-medium">
                      {receiptModal.data.orderId || "-"}
                    </span>
                  </div>
                </div>
                <div className="text-left sm:text-right space-y-0.5">
                  <div className="font-bold text-slate-800">
                    Date & Time:{" "}
                    <span className="font-semibold text-slate-700">
                      {receiptModal.data.paidDate ||
                        new Date().toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                      {receiptModal.data.paidTime ||
                        new Date().toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-emerald-700">
                    Payment Status: SUCCESS / PAID
                  </div>
                </div>
              </div>

              {/* Candidate & Examination Information Table (Image 1 replica) */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300">
                      <th className="py-1.5 px-3 text-left w-2/5 border-r border-slate-300">
                        Candidate & Examination Information
                      </th>
                      <th className="py-1.5 px-3 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Register Number
                      </td>
                      <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                        {String(receiptModal.data.regNo || studentReg || "-").toUpperCase()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Candidate Full Name
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-slate-900">
                        {String(
                          receiptModal.data.studentName ||
                            studentData?.displayName ||
                            studentData?.name ||
                            "Candidate"
                        ).toUpperCase()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Programme & Department
                      </td>
                      <td className="py-1.5 px-3 text-slate-800">
                        {formatProgDisplay(studentData?.programme || "UG")} -{" "}
                        {cleanDeptName(studentData?.department) || "General"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Batch & Section
                      </td>
                      <td className="py-1.5 px-3 text-slate-800">
                        Batch {formatBatchDisplay(studentData?.batch || "N/A")} | Sec{" "}
                        {studentData?.section || "A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Examination Name
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-slate-900">
                        {String(receiptModal.data.examName || resolvedExamName)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Session & Academic Year
                      </td>
                      <td className="py-1.5 px-3 text-slate-800">
                        {receiptModal.data.examSession || resolvedExamSession || "Regular / Arrear"}{" "}
                        (AY:{" "}
                        {receiptModal.data.academicYear ||
                          resolvedAcademicYear ||
                          "2026-2027"}
                        )
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-bold bg-slate-50 border-r border-slate-300 text-slate-700">
                        Payment Mode / Gateway
                      </td>
                      <td className="py-1.5 px-3 text-slate-800 font-medium">
                        Online (HDFC SmartGateway)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Fee Breakdown Table (Image 1 replica) */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-[#120c7a] text-white font-bold">
                      <th className="py-1.5 px-2 text-center w-12 border-r border-indigo-900">
                        S.No
                      </th>
                      <th className="py-1.5 px-3 text-left border-r border-indigo-900">
                        Description / Fee Head
                      </th>
                      <th className="py-1.5 px-3 text-right w-36">Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 px-2 text-center border-r border-slate-200 font-medium text-slate-600">
                        1
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 text-slate-800">
                        End Semester Autonomous Examination Registration Fee
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        INR{" "}
                        {Number(
                          receiptModal.data.amount || allocatedFee || receiptModal.data.feeAmount || 0
                        ).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                      <td
                        colSpan={2}
                        className="py-2 px-3 text-right border-r border-slate-300 text-[#120c7a] font-bold"
                      >
                        Total Amount Paid
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-sm text-[#120c7a]">
                        INR{" "}
                        {Number(
                          receiptModal.data.amount || allocatedFee || receiptModal.data.feeAmount || 0
                        ).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Disclaimers & Notes (Image 1 replica) */}
              <div className="text-[10px] italic text-slate-500 space-y-0.5 pt-1">
                <p>
                  • This is an official system-generated computerized payment receipt issued by the Autonomous
                  Examination Cell.
                </p>
                <p>
                  • Retain this receipt for all future examination references, hall ticket verification, and
                  grade sheet processing.
                </p>
              </div>

              {/* Dual Official Signature Lines (Image 1 replica) */}
              <div className="pt-8 sm:pt-10 flex items-center justify-between text-xs px-2">
                <div className="text-center w-44 sm:w-48 border-t border-slate-400 pt-1.5">
                  <div className="font-bold text-slate-800 text-[11px]">Accountant / Cashier</div>
                  <div className="text-[9.5px] text-slate-500">C.K College of Engg. & Tech.</div>
                </div>
                <div className="text-center w-48 sm:w-52 border-t border-slate-400 pt-1.5">
                  <div className="font-bold text-slate-800 text-[11px]">
                    Controller of Examinations
                  </div>
                  <div className="text-[9.5px] text-slate-500">
                    Autonomous Examination Cell
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 no-print pt-1">
              <button
                onClick={() => setReceiptModal({ open: false, data: null })}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs cursor-pointer min-h-[38px]"
              >
                Close
              </button>
              <button
                onClick={() => handleDownloadReceiptPDF(receiptModal.data)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer min-h-[38px]"
              >
                <Download size={14} />
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => handlePrintOfficialReceipt(receiptModal.data)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#120c7a] hover:bg-[#0c1a40] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer min-h-[38px]"
              >
                <Printer size={14} />
                <span>Print Official Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
