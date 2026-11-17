import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Save,
  Users,
  Coins,
  Receipt,
  FileCheck2,
  BadgePercent,
  Sparkles,
  Lock,
  Layers,
  ArrowDownRight,
} from "lucide-react";
import {
  collection,
  writeBatch,
  doc,
  Timestamp,
} from "firebase/firestore";
import { getScholarshipsRealtime } from "../services/scholarshipService";

export default function DirectScholarshipSettlementModal({
  isOpen,
  onClose,
  students = [],
  allAvailableBatches = [],
  feeConfigs = [],
  semesterConfigs = [],
  openingDues = [],
  payments = [],
  feeHeads = [],
  showToast,
  db,
}) {
  if (!isOpen) return null;

  // Real-time Database Scholarships from SeatManagement.jsx
  const [dbScholarships, setDbScholarships] = useState([]);
  const [selectedSchemeId, setSelectedSchemeId] = useState("");

  useEffect(() => {
    const unsub = getScholarshipsRealtime(
      (data) => {
        const list = data || [];
        setDbScholarships(list);
        if (list.length > 0 && !selectedSchemeId) {
          setSelectedSchemeId(list[0].id);
        }
      },
      (err) => console.error("Error fetching scholarships:", err)
    );
    return () => unsub();
  }, [selectedSchemeId]);

  // Selected Batch
  const [selectedBatch, setSelectedBatch] = useState(() => allAvailableBatches[0] || "2026-2030");

  // Sync batch default when allAvailableBatches changes
  useEffect(() => {
    if (!selectedBatch && allAvailableBatches.length > 0) {
      setSelectedBatch(allAvailableBatches[0]);
    }
  }, [allAvailableBatches, selectedBatch]);

  // Helper to test batch match
  const isBatchMatch = (b1, b2) => {
    if (!b1 || !b2) return false;
    const s1 = String(b1).trim().toLowerCase();
    const s2 = String(b2).trim().toLowerCase();
    if (s1 === s2) return true;
    const n1 = s1.replace(/[^a-z0-9]/g, '');
    const n2 = s2.replace(/[^a-z0-9]/g, '');
    if (n1 === n2 || (n1 && n2 && (n1.includes(n2) || n2.includes(n1)))) return true;
    const m1 = s1.match(/\d{4}\s*[-_]\s*\d{2,4}/);
    const m2 = s2.match(/\d{4}\s*[-_]\s*\d{2,4}/);
    if (m1 && m2) {
      const normYear = (yStr) => {
        const parts = yStr.split(/[-_]/);
        const y1 = parts[0].trim();
        let y2 = parts[1].trim();
        if (y2.length === 2) y2 = '20' + y2;
        return `${y1}-${y2}`;
      };
      return normYear(m1[0]) === normYear(m2[0]);
    }
    return false;
  };

  // 1. Dynamic Academic Years based on chosen Batch
  const batchAcademicYears = useMemo(() => {
    const list = [];
    const match = String(selectedBatch || "").match(/(\d{4})\s*[-_]\s*(\d{4}|\d{2})/);
    if (match) {
      const startYr = parseInt(match[1], 10);
      let endYr = parseInt(match[2], 10);
      if (endYr < 100) endYr = 2000 + endYr;
      const totalYears = Math.min(6, Math.max(1, endYr - startYr));
      for (let y = 0; y < totalYears; y++) {
        const y1 = startYr + y;
        const y2 = y1 + 1;
        list.push(`${y1}-${y2}`);
      }
    }
    // Also include any academic years configured in feeConfigs for this batch
    feeConfigs.forEach(f => {
      if (isBatchMatch(f.batch, selectedBatch) && f.academicYear) {
        if (!list.includes(f.academicYear)) list.push(f.academicYear);
      }
    });
    if (list.length === 0) {
      list.push("2026-2027", "2025-2026", "2024-2025");
    }
    return list;
  }, [selectedBatch, feeConfigs]);

  const [selectedAcademicYear, setSelectedAcademicYear] = useState(() => batchAcademicYears[0] || "2026-2027");

  // Keep academic year in sync when batch changes
  useEffect(() => {
    if (batchAcademicYears.length > 0 && !batchAcademicYears.includes(selectedAcademicYear)) {
      setSelectedAcademicYear(batchAcademicYears[0]);
    }
  }, [batchAcademicYears, selectedAcademicYear]);

  // 2. Fee Heads configured strictly for this selected batch
  const batchFeeHeads = useMemo(() => {
    const set = new Set();
    feeConfigs.forEach(f => {
      if (isBatchMatch(f.batch, selectedBatch)) {
        const h = f.feeHead || f.head;
        if (h) set.add(h);
      }
    });
    if (set.size === 0) {
      (feeHeads.length ? feeHeads : ["Tuition Fee", "Other Fee", "Admission Fee", "Caution Deposit"]).forEach(h => {
        const name = typeof h === "string" ? h : h.name;
        if (name) set.add(name);
      });
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
      if (a.toLowerCase().includes("tuition")) return -1;
      if (b.toLowerCase().includes("tuition")) return 1;
      return a.localeCompare(b);
    });
    return arr;
  }, [selectedBatch, feeConfigs, feeHeads]);

  // Primary Fee Head
  const [selectedFeeHead, setSelectedFeeHead] = useState("Tuition Fee");
  // Fallback / Overflow Fee Head
  const [fallbackFeeHead, setFallbackFeeHead] = useState("NONE");

  // Sync fee heads when batch changes
  useEffect(() => {
    if (batchFeeHeads.length > 0 && !batchFeeHeads.includes(selectedFeeHead)) {
      setSelectedFeeHead(batchFeeHeads[0]);
    }
    // Default fallback head to "Other Fee" if available and different from primary
    if (fallbackFeeHead === "NONE" || fallbackFeeHead === selectedFeeHead) {
      const otherHead = batchFeeHeads.find(h => h.toLowerCase().includes("other") && h !== selectedFeeHead);
      if (otherHead) setFallbackFeeHead(otherHead);
    }
  }, [batchFeeHeads, selectedFeeHead, fallbackFeeHead]);

  // Fixed Settlement Mode (locked to 1st option only)
  const lockedSettlementMode = "Govt NEFT / RTGS Treasury Transfer";

  // Bank reference and date
  const [neftRef, setNeftRef] = useState("");
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [perStudentAmount, setPerStudentAmount] = useState("25000");

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [filterView, setFilterView] = useState("ALL"); // "ALL" | "ELIGIBLE" | "SELECTED"

  // Student selection map: regNo -> { selected: boolean, customAmount: number }
  const [selectedStudentsMap, setSelectedStudentsMap] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active Scholarship Object
  const currentScholarship = useMemo(() => {
    return dbScholarships.find(s => s.id === selectedSchemeId) || null;
  }, [dbScholarships, selectedSchemeId]);

  // When selected scholarship changes, auto-tune default amount
  useEffect(() => {
    if (currentScholarship) {
      const name = (currentScholarship.name || "").toLowerCase();
      if (name.includes("first graduate") || name.includes("fg")) {
        setPerStudentAmount("25000");
      } else if (name.includes("pmss") || name.includes("sc/st") || name.includes("7.5")) {
        setPerStudentAmount("50000");
      }
    }
  }, [currentScholarship]);

  // Filter students belonging to this batch
  const batchStudents = useMemo(() => {
    return students.filter(s => isBatchMatch(s.batch, selectedBatch));
  }, [students, selectedBatch]);

  // Distinct departments in this batch
  const availableDepts = useMemo(() => {
    const set = new Set();
    batchStudents.forEach(s => {
      if (s.department) set.add(s.department);
    });
    return Array.from(set).sort();
  }, [batchStudents]);

  // Helper to check student eligibility tag
  const checkEligibility = (student) => {
    if (!currentScholarship) return true;
    const schName = (currentScholarship.name || "").toLowerCase();
    const schQuota = (currentScholarship.quota || "").toLowerCase();

    const extra = student._profile_data || {};
    const quotaStr = String(student.quota || extra.quotaAskedFor || extra.seatCategory || "").toLowerCase();
    const commStr = String(extra.community || student.community || "").toUpperCase();

    // 1. First Graduate
    if (schName.includes("first graduate") || schName.includes("fg") || schQuota.includes("fg")) {
      return quotaStr.includes("fg") || extra.firstGraduate === true || Boolean(extra.firstGraduateCertificate);
    }
    // 2. PMSS / SC / ST
    if (schName.includes("pmss") || schName.includes("sc/st") || schQuota.includes("sc")) {
      return ["SC", "ST", "SCA", "SCC"].some(c => commStr.includes(c)) || quotaStr.includes("pmss");
    }
    // 3. 7.5% Govt School
    if (schName.includes("7.5") || schQuota.includes("7.5")) {
      return quotaStr.includes("7.5") || quotaStr.includes("govt school");
    }
    // 4. BC / MBC
    if (schName.includes("bc") || schName.includes("mbc")) {
      return ["BC", "MBC", "DNC"].some(c => commStr.includes(c));
    }
    // 5. Match by quota string directly
    if (schQuota && quotaStr.includes(schQuota)) {
      return true;
    }
    return false;
  };

  // Helper to calculate exact dues for Primary & Fallback Fee Heads
  const getStudentDuesBreakdown = (student) => {
    const reg = (student.regNo || "").trim().toLowerCase();
    const studentUid = (student.uid || student.id || "").toLowerCase();

    const calculateDueForHead = (headName) => {
      if (!headName || headName === "NONE") return 0;
      const headNorm = headName.trim().toLowerCase();

      // 1. Configured fee
      let configuredAmt = 0;
      const matchingConfigs = feeConfigs.filter(f => {
        const bMatch = isBatchMatch(f.batch, selectedBatch);
        const hMatch = String(f.feeHead || f.head || "").trim().toLowerCase() === headNorm;
        const ayMatch = !selectedAcademicYear || String(f.academicYear || "").trim().toLowerCase() === selectedAcademicYear.trim().toLowerCase();
        return bMatch && hMatch && ayMatch;
      });

      if (matchingConfigs.length > 0) {
        configuredAmt = Number(matchingConfigs[0].amount) || 0;
      } else {
        configuredAmt = headNorm.includes("tuition") ? 50000 : 10000;
      }

      // Plus any opening dues for this student and head
      openingDues.forEach(od => {
        const odReg = String(od.regNo || "").trim().toLowerCase();
        const odHead = String(od.head || "").trim().toLowerCase();
        const odAy = String(od.academicYear || "").trim().toLowerCase();
        if ((odReg === reg) && odHead === headNorm && (!selectedAcademicYear || odAy === selectedAcademicYear.trim().toLowerCase())) {
          configuredAmt += (Number(od.amount) || 0);
        }
      });

      // 2. Previous payments for this head
      let paidAmt = 0;
      payments.forEach(p => {
        const pReg = String(p.examNumber || p.regNo || "").trim().toLowerCase();
        const pUid = String(p.uid || p.studentId || "").trim().toLowerCase();
        const isStudent = (reg && pReg === reg) || (studentUid && pUid === studentUid);
        if (!isStudent) return;

        const pHead = String(p.feeHead || "").trim().toLowerCase();
        const pAy = String(p.academicYear || "").trim().toLowerCase();
        const isSuccess = p.status === "active" || p.status === "SUCCESS" || !p.status;
        if (isSuccess && pHead === headNorm && (!selectedAcademicYear || pAy === selectedAcademicYear.trim().toLowerCase())) {
          paidAmt += (Number(p.amount) || 0);
        }
      });

      return Math.max(0, configuredAmt - paidAmt);
    };

    const primaryDue = calculateDueForHead(selectedFeeHead);
    const fallbackDue = fallbackFeeHead !== "NONE" ? calculateDueForHead(fallbackFeeHead) : 0;
    const totalDue = primaryDue + fallbackDue;

    return { primaryDue, fallbackDue, totalDue };
  };

  // Evaluated student list with eligibility & financial details
  const enrichedStudents = useMemo(() => {
    return batchStudents.map(s => {
      const isEligible = checkEligibility(s);
      const { primaryDue, fallbackDue, totalDue } = getStudentDuesBreakdown(s);
      const selection = selectedStudentsMap[s.regNo];
      const isSelected = selection !== undefined ? selection.selected : false;
      const customAmount = selection?.amount !== undefined ? selection.amount : Number(perStudentAmount) || 0;

      // Waterfall Settlement Logic
      const primarySettled = Math.min(customAmount, primaryDue);
      const remainingForFallback = Math.max(0, customAmount - primarySettled);
      const fallbackSettled = fallbackFeeHead !== "NONE" ? Math.min(remainingForFallback, fallbackDue) : 0;
      const netDueAfter = Math.max(0, (primaryDue - primarySettled) + (fallbackDue - fallbackSettled));

      return {
        ...s,
        isEligible,
        primaryDue,
        fallbackDue,
        totalDue,
        isSelected,
        customAmount,
        primarySettled,
        fallbackSettled,
        netDueAfter
      };
    });
  }, [batchStudents, currentScholarship, selectedFeeHead, fallbackFeeHead, selectedAcademicYear, perStudentAmount, selectedStudentsMap, payments, feeConfigs, openingDues]);

  // Filtered students for table view
  const visibleStudents = useMemo(() => {
    return enrichedStudents.filter(s => {
      if (selectedDept !== "ALL" && s.department !== selectedDept) return false;
      if (filterView === "ELIGIBLE" && !s.isEligible) return false;
      if (filterView === "SELECTED" && !s.isSelected) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (s.studentName || "").toLowerCase().includes(q) ||
          (s.regNo || "").toLowerCase().includes(q) ||
          (s.department || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [enrichedStudents, selectedDept, filterView, searchQuery]);

  // Selected students calculation
  const selectedList = useMemo(() => {
    return enrichedStudents.filter(s => s.isSelected);
  }, [enrichedStudents]);

  const totalSettlementAmount = useMemo(() => {
    return selectedList.reduce((sum, s) => sum + (Number(s.customAmount) || 0), 0);
  }, [selectedList]);

  // Toggle individual student
  const handleToggleStudent = (regNo, defaultAmt) => {
    setSelectedStudentsMap(prev => {
      const current = prev[regNo];
      const nextSelected = current ? !current.selected : true;
      return {
        ...prev,
        [regNo]: {
          selected: nextSelected,
          amount: current?.amount !== undefined ? current.amount : (Number(perStudentAmount) || defaultAmt || 0)
        }
      };
    });
  };

  // Change individual student amount
  const handleStudentAmountChange = (regNo, val) => {
    const num = Math.max(0, Number(val) || 0);
    setSelectedStudentsMap(prev => ({
      ...prev,
      [regNo]: {
        selected: prev[regNo]?.selected ?? true,
        amount: num
      }
    }));
  };

  // Select all visible students
  const handleSelectAllVisible = () => {
    const amt = Number(perStudentAmount) || 0;
    setSelectedStudentsMap(prev => {
      const next = { ...prev };
      visibleStudents.forEach(s => {
        next[s.regNo] = { selected: true, amount: next[s.regNo]?.amount ?? amt };
      });
      return next;
    });
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedStudentsMap({});
  };

  // Auto-Select only eligible students in batch
  const handleSelectEligibleOnly = () => {
    const amt = Number(perStudentAmount) || 0;
    const next = {};
    enrichedStudents.forEach(s => {
      if (s.isEligible) {
        next[s.regNo] = { selected: true, amount: amt };
      }
    });
    setSelectedStudentsMap(next);
  };

  // Apply per-student amount to all currently selected students
  const handleApplyPerStudentAmtToAll = () => {
    const amt = Number(perStudentAmount) || 0;
    setSelectedStudentsMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(reg => {
        if (next[reg].selected) {
          next[reg].amount = amt;
        }
      });
      return next;
    });
    showToast(`Updated settlement amount to ₹${amt.toLocaleString()} for all selected candidates!`);
  };

  // Execute Direct Scholarship Settlement with Waterfall Split
  const handleExecuteSettlement = async () => {
    if (selectedList.length === 0) {
      showToast("Please select at least one student for scholarship settlement", "error");
      return;
    }
    if (!neftRef.trim()) {
      showToast("Please enter the Government Sanction / NEFT UTR Reference Number", "error");
      return;
    }
    if (totalSettlementAmount <= 0) {
      showToast("Total settlement amount must be greater than ₹0", "error");
      return;
    }

    const schemeName = currentScholarship?.name || "Government Scholarship";

    const confirmMsg = `Are you sure you want to execute Direct Scholarship Settlement of ₹${totalSettlementAmount.toLocaleString()} for ${selectedList.length} students via NEFT Ref: ${neftRef.trim()}?`;
    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      const batchId = `SCHOL-${Date.now().toString(36).toUpperCase()}`;
      const nowTimestamp = Timestamp.now();
      const chunkSize = 350;

      // Prepare records for fee_payments, fee_receipts, and fee_concessions
      const operations = [];

      selectedList.forEach(s => {
        const studentTotalAmount = Number(s.customAmount) || 0;
        if (studentTotalAmount <= 0) return;

        const regNo = s.regNo;
        const studentUid = s.uid || s.id || "";
        const cleanStudentName = s.displayName || s.studentName || s.name || "Student";
        const receiptNo = `REC-SCHOL-${selectedAcademicYear.slice(0, 4)}-${regNo.slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        // Waterfall allocation: Primary + Fallback
        const pSettled = s.primarySettled || 0;
        const fSettled = s.fallbackSettled || 0;

        const receiptItems = [];

        // 1. Payment doc for Primary Fee Head
        if (pSettled > 0) {
          receiptItems.push({ head: selectedFeeHead, amount: pSettled });
          operations.push({
            collectionName: "fee_payments",
            data: {
              uid: studentUid,
              studentId: studentUid,
              examNumber: regNo,
              mode: "neft",
              settlementMode: lockedSettlementMode,
              amount: pSettled,
              status: "active",
              feeHead: selectedFeeHead,
              academicYear: selectedAcademicYear,
              semester: "All",
              remarks: `Govt Scholarship: ${schemeName} (Ref: ${neftRef.trim()})`,
              refNo: neftRef.trim(),
              receiptNo,
              paymentDate: settlementDate,
              createdAt: nowTimestamp,
              isScholarship: true,
              scholarshipScheme: schemeName,
              settlementBatchId: batchId
            }
          });
        }

        // 2. Payment doc for Fallback Fee Head (if any overflow settled)
        if (fSettled > 0 && fallbackFeeHead !== "NONE") {
          receiptItems.push({ head: fallbackFeeHead, amount: fSettled });
          operations.push({
            collectionName: "fee_payments",
            data: {
              uid: studentUid,
              studentId: studentUid,
              examNumber: regNo,
              mode: "neft",
              settlementMode: lockedSettlementMode,
              amount: fSettled,
              status: "active",
              feeHead: fallbackFeeHead,
              academicYear: selectedAcademicYear,
              semester: "All",
              remarks: `Govt Scholarship (Overflow): ${schemeName} (Ref: ${neftRef.trim()})`,
              refNo: neftRef.trim(),
              receiptNo,
              paymentDate: settlementDate,
              createdAt: nowTimestamp,
              isScholarship: true,
              scholarshipScheme: schemeName,
              settlementBatchId: batchId
            }
          });
        }

        // Fallback safety if dues were 0 (advance grant)
        if (receiptItems.length === 0) {
          receiptItems.push({ head: selectedFeeHead, amount: studentTotalAmount });
          operations.push({
            collectionName: "fee_payments",
            data: {
              uid: studentUid,
              studentId: studentUid,
              examNumber: regNo,
              mode: "neft",
              settlementMode: lockedSettlementMode,
              amount: studentTotalAmount,
              status: "active",
              feeHead: selectedFeeHead,
              academicYear: selectedAcademicYear,
              semester: "All",
              remarks: `Govt Scholarship: ${schemeName} (Ref: ${neftRef.trim()})`,
              refNo: neftRef.trim(),
              receiptNo,
              paymentDate: settlementDate,
              createdAt: nowTimestamp,
              isScholarship: true,
              scholarshipScheme: schemeName,
              settlementBatchId: batchId
            }
          });
        }

        // 3. Consolidated Receipt doc
        operations.push({
          collectionName: "fee_receipts",
          data: {
            uid: studentUid,
            studentId: studentUid,
            examNumber: regNo,
            studentName: cleanStudentName,
            programme: s.programme || "UG",
            department: s.department || "",
            batch: s.batch || selectedBatch,
            amount: studentTotalAmount,
            status: "active",
            mode: "neft",
            settlementMode: lockedSettlementMode,
            feeHead: selectedFeeHead,
            academicYear: selectedAcademicYear,
            remarks: `Govt Subsidy / Scholarship Credit: ${schemeName} (Ref: ${neftRef.trim()})`,
            refNo: neftRef.trim(),
            receiptNo,
            paymentDate: settlementDate,
            createdAt: nowTimestamp,
            isScholarship: true,
            scholarshipScheme: schemeName,
            settlementBatchId: batchId,
            reprintCount: 0,
            items: receiptItems
          }
        });

        // 4. Concession Record
        operations.push({
          collectionName: "fee_concessions",
          data: {
            studentId: studentUid,
            studentName: cleanStudentName,
            examNumber: regNo,
            type: schemeName,
            amount: studentTotalAmount,
            academicYear: selectedAcademicYear,
            feeHead: selectedFeeHead,
            fallbackHead: fallbackFeeHead !== "NONE" ? fallbackFeeHead : null,
            paymentMode: lockedSettlementMode,
            refNo: neftRef.trim(),
            status: "approved",
            appliedAt: nowTimestamp,
            createdAt: nowTimestamp,
            settlementBatchId: batchId,
            remarks: `Direct Govt Settlement via ${lockedSettlementMode} (Ref: ${neftRef.trim()})`
          }
        });
      });

      // Write in batches of chunkSize
      for (let i = 0; i < operations.length; i += chunkSize) {
        const chunk = operations.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(op => {
          const docRef = doc(collection(db, op.collectionName));
          batch.set(docRef, op.data);
        });
        await batch.commit();
      }

      showToast(`Successfully settled ₹${totalSettlementAmount.toLocaleString()} for ${selectedList.length} students via NEFT UTR ${neftRef.trim()}!`);
      setSelectedStudentsMap({});
      onClose();
    } catch (err) {
      console.error("Direct scholarship settlement error:", err);
      showToast("Settlement failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 lg:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl xl:max-w-7xl max-h-[94vh] overflow-hidden flex flex-col border border-zinc-100 transform animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#120c7a] via-indigo-900 to-slate-900 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Landmark size={20} className="text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  Direct Government Scholarship Settlement
                </h3>
                <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider">
                  Bulk Credit
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Bulk credit & negotiate government subsidies (FG, PMSS, 7.5% Quota) directly into student accounts via Bank NEFT / UTR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {/* Section 1: Settlement & Bank Credit Header Inputs */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h4 className="text-xs font-black uppercase text-zinc-700 tracking-wider flex items-center gap-2">
                <Coins size={16} className="text-amber-600" />
                1. Government Bank Credit & Scheme Parameters
              </h4>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                Official Bank UTR Linked
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. Scheme from SeatManagement.jsx */}
              <div className="lg:col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Scholarship Scheme (from Seat Management)
                </label>
                <select
                  value={selectedSchemeId}
                  onChange={e => setSelectedSchemeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                >
                  {dbScholarships.length === 0 ? (
                    <option value="">No scholarships configured in Seat Management</option>
                  ) : (
                    dbScholarships.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.quota ? `(${s.quota})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* 2. Student Batch */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Student Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={e => setSelectedBatch(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                >
                  {allAvailableBatches.map(b => (
                    <option key={b} value={b}>
                      Batch: {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Academic Year (Strictly Batch-based Dropdown) */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Academic Year (Batch-based)
                </label>
                <select
                  value={selectedAcademicYear}
                  onChange={e => setSelectedAcademicYear(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                >
                  {batchAcademicYears.map(ay => (
                    <option key={ay} value={ay}>
                      AY: {ay}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Primary Fee Head to Deduct (Strictly filtered by Batch) */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Primary Fee Head to Deduct
                </label>
                <select
                  value={selectedFeeHead}
                  onChange={e => setSelectedFeeHead(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                >
                  {batchFeeHeads.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Fallback Fee Head (Waterfall Allocation for Student partial dues) */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1 flex items-center justify-between">
                  <span>Fallback Fee Head (Overflow)</span>
                  <span className="text-[9px] text-amber-600 font-bold">Auto-Cascade</span>
                </label>
                <select
                  value={fallbackFeeHead}
                  onChange={e => setFallbackFeeHead(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-amber-50/40 border border-amber-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-300 transition-all"
                >
                  <option value="NONE">None (Primary Head Only)</option>
                  {batchFeeHeads
                    .filter(h => h !== selectedFeeHead)
                    .map(h => (
                      <option key={h} value={h}>
                        {h} (Fallback Overflow)
                      </option>
                    ))}
                </select>
              </div>

              {/* 6. Settlement Payment Mode (Locked to 1st option only) */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1 flex items-center justify-between">
                  <span>Settlement Payment Mode</span>
                  <span className="text-[9px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Lock size={10} /> Locked
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={lockedSettlementMode}
                    className="w-full px-3.5 py-2.5 bg-zinc-100/90 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 cursor-not-allowed select-none"
                  />
                </div>
              </div>

              {/* 7. NEFT UTR / Sanction Order No */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Bank NEFT / UTR / Order No <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SBIN202611048821"
                  value={neftRef}
                  onChange={e => setNeftRef(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-amber-50/50 border border-amber-300 rounded-xl text-xs font-mono font-bold text-amber-950 outline-none focus:ring-2 focus:ring-amber-300 transition-all"
                />
              </div>

              {/* 8. Settlement Date */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Credit / Settlement Date
                </label>
                <input
                  type="date"
                  value={settlementDate}
                  onChange={e => setSettlementDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                />
              </div>

              {/* 9. Per Student Settlement Amount */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Settlement Amount / Student (₹)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={perStudentAmount}
                    onChange={e => setPerStudentAmount(e.target.value)}
                    placeholder="25000"
                    className="w-full px-3.5 py-2.5 bg-emerald-50/60 border border-emerald-300 rounded-xl text-xs font-mono font-bold text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-300 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPerStudentAmtToAll}
                    title="Apply this amount to all selected candidates"
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all shadow-xs"
                  >
                    Apply to Selected
                  </button>
                </div>
              </div>

              {/* Help tip on Waterfall fallback */}
              {fallbackFeeHead !== "NONE" && (
                <div className="sm:col-span-2 lg:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-amber-900">
                  <ArrowDownRight size={16} className="text-amber-700 shrink-0" />
                  <span>
                    <b>Smart Waterfall Active:</b> If a candidate's <b>{selectedFeeHead}</b> due is less than the scholarship grant, remaining credit automatically settles their <b>{fallbackFeeHead}</b> due!
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Student Namelist & Settlement Table */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black uppercase text-zinc-700 tracking-wider flex items-center gap-2">
                  <Users size={16} className="text-indigo-600" />
                  2. Student Candidates in Batch {selectedBatch} ({visibleStudents.length} candidates)
                </h4>
                <p className="text-[11px] text-zinc-400 font-medium">
                  Select candidates who received this government credit and review their updated dues
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectEligibleOnly}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={13} className="text-amber-600" />
                  <span>Select Eligible Only</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Select All ({visibleStudents.length})
                </button>

                {selectedList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-zinc-100">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by student name, register no, department..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Department */}
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="ALL">All Departments ({availableDepts.length})</option>
                {availableDepts.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {/* View filter pills */}
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFilterView("ALL")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    filterView === "ALL" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  All ({enrichedStudents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterView("ELIGIBLE")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    filterView === "ELIGIBLE" ? "bg-white text-amber-800 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  Eligible Only ({enrichedStudents.filter(s => s.isEligible).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterView("SELECTED")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    filterView === "SELECTED" ? "bg-white text-emerald-800 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  Selected ({selectedList.length})
                </button>
              </div>
            </div>

            {/* Candidate Settlement Table */}
            <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto max-h-[46vh]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase text-[9px] font-bold sticky top-0 border-b border-zinc-200 z-10">
                    <tr>
                      <th className="px-3.5 py-2.5 text-center w-10">
                        <input
                          type="checkbox"
                          checked={visibleStudents.length > 0 && visibleStudents.every(s => s.isSelected)}
                          onChange={e => {
                            if (e.target.checked) handleSelectAllVisible();
                            else handleDeselectAll();
                          }}
                          className="w-4 h-4 rounded text-indigo-700 cursor-pointer accent-[#120c7a]"
                        />
                      </th>
                      <th className="px-3.5 py-2.5">S.No</th>
                      <th className="px-3.5 py-2.5">Reg No</th>
                      <th className="px-3.5 py-2.5">Student Name</th>
                      <th className="px-3.5 py-2.5">Department</th>
                      <th className="px-3.5 py-2.5">Quota / Category</th>
                      <th className="px-3.5 py-2.5 text-right">Current Dues (₹)</th>
                      <th className="px-3.5 py-2.5 text-right w-36">Scholarship Grant (₹)</th>
                      <th className="px-3.5 py-2.5 text-center">Settlement Split</th>
                      <th className="px-3.5 py-2.5 text-right">Net Due After</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {visibleStudents.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-zinc-400 text-xs">
                          No student candidates found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      visibleStudents.map((s, idx) => (
                        <tr
                          key={s.regNo || idx}
                          onClick={() => handleToggleStudent(s.regNo, s.customAmount)}
                          className={`cursor-pointer transition-colors ${
                            s.isSelected ? "bg-indigo-50/40 hover:bg-indigo-50/70" : "hover:bg-zinc-50"
                          }`}
                        >
                          <td
                            className="px-3.5 py-2.5 text-center"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={s.isSelected}
                              onChange={() => handleToggleStudent(s.regNo, s.customAmount)}
                              className="w-4 h-4 rounded text-indigo-700 cursor-pointer accent-[#120c7a]"
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-zinc-400 font-mono">{idx + 1}</td>
                          <td className="px-3.5 py-2.5 font-mono font-bold text-[#120c7a] whitespace-nowrap">
                            {s.regNo}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-zinc-800 whitespace-nowrap">
                            {s.displayName || s.studentName || s.name}
                          </td>
                          <td className="px-3.5 py-2.5 text-zinc-600 font-medium whitespace-nowrap">
                            {s.department || "—"}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            {s.isEligible ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md font-bold text-[10px] flex items-center gap-1 w-fit">
                                <Sparkles size={11} className="text-emerald-600" />
                                <span>Eligible</span>
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-[11px] font-medium">
                                {s.quota || s._profile_data?.seatCategory || s._profile_data?.community || "Standard"}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono">
                            <span className="font-bold text-zinc-700">₹{s.primaryDue.toLocaleString()}</span>
                            {s.fallbackDue > 0 && fallbackFeeHead !== "NONE" && (
                              <span className="text-[10px] text-zinc-400 block">
                                + ₹{s.fallbackDue.toLocaleString()} ({fallbackFeeHead.slice(0, 5)})
                              </span>
                            )}
                          </td>
                          <td
                            className="px-3.5 py-2 text-right"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              disabled={!s.isSelected}
                              value={s.customAmount}
                              onChange={e => handleStudentAmountChange(s.regNo, e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-right font-mono font-bold text-xs outline-none transition-all ${
                                s.isSelected
                                  ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 focus:ring-2 focus:ring-emerald-300"
                                  : "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
                              }`}
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                            {s.isSelected ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 rounded font-mono text-[10px] font-bold">
                                  {selectedFeeHead.slice(0, 7)}: ₹{s.primarySettled.toLocaleString()}
                                </span>
                                {s.fallbackSettled > 0 && fallbackFeeHead !== "NONE" && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-mono text-[10px] font-bold">
                                    {fallbackFeeHead.slice(0, 5)}: ₹{s.fallbackSettled.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black whitespace-nowrap font-mono text-zinc-900">
                            {s.isSelected ? (
                              <span className={s.netDueAfter === 0 ? "text-emerald-600 font-extrabold" : "text-amber-800"}>
                                ₹{s.netDueAfter.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                            {s.isSelected ? (
                              <span className="px-2 py-0.5 bg-indigo-100 text-[#120c7a] rounded-full text-[10px] font-bold">
                                Ready to Settle
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-[10px]">Unselected</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Sticky Bottom Footer */}
        <div className="px-6 py-4 bg-white border-t border-zinc-200 flex flex-wrap items-center justify-between gap-4 shadow-md">
          {/* Summary KPIs */}
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Selected Candidates</p>
              <p className="text-lg font-black text-[#120c7a]">
                {selectedList.length} <span className="text-xs font-bold text-zinc-500">Students</span>
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Total Scholarship Settlement</p>
              <p className="text-lg font-black text-emerald-600 font-mono">
                ₹{totalSettlementAmount.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Heads & Ref No</p>
              <p className="text-xs font-bold text-zinc-700">
                {selectedFeeHead}
                {fallbackFeeHead !== "NONE" && ` ➔ ${fallbackFeeHead}`} •{" "}
                {neftRef ? (
                  <span className="font-mono text-indigo-900 font-extrabold">{neftRef}</span>
                ) : (
                  <span className="text-rose-500">No UTR Entered</span>
                )}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSubmitting || selectedList.length === 0 || !neftRef.trim()}
              onClick={handleExecuteSettlement}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Processing Settlement...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>
                    Settle & Credit ₹{totalSettlementAmount.toLocaleString()} ({selectedList.length} Students)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
