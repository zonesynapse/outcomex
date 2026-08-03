import { useEffect, useState, useMemo, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { X, ChevronDown, Calendar as CalendarIcon, Trash2, Plus, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import StatusBadge from "./StatusBadge";
import {
  calculateCutoffFromMarks,
  createEmptyEnquiryForm,
  getNextApplicationNo
} from "../services/enquiryService";
import { getCommunitiesRealtime } from "../services/configService";
import { getSeatConfigurationsRealtime } from "../services/seatService";
import { fetchPincodeDetails as fetchPincode } from "../services/pincodeService";
import { getScholarshipsRealtime } from "../services/scholarshipService";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { useRegulations } from "../hooks/useRegulations";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, sanitizeKey, formatProgDisplay } from "../lib/utils";
import { uploadBase64, deleteByUrl, userStoragePath } from "../utils/fileUpload";

const STATUS_OPTIONS = ["Enquiry", "Application"];
const EXAM_OPTIONS = ["+2", "Diploma", "UG"];
const MEDIUM_OPTIONS = ["English", "Tamil", "English / Tamil"];
const ELIGIBILITY_OPTIONS = ["Eligible", "Not Eligible"];
const TITLE_OPTIONS = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const GENDER_OPTIONS = ["Male", "Female", "Others"];
const PROGRAMME_OPTIONS = ["B.E / B.Tech", "M.E / M.Tech", "M.B.A", "B.Sc", "M.Sc", "Other"];
const STUDENT_CATEGORY_OPTIONS = ["Regular", "Lateral Entry", "Transfer", "Readmission"];
const YEAR_OPTIONS = ["I Year", "II Year", "III Year", "IV Year", "Year 1", "Year 2", "Year 3", "Year 4"];
const MARITAL_STATUS_OPTIONS = ["Married", "Unmarried"];
const HOSTELLER_OPTIONS = ["Hosteller", "Day scholar"];
const YES_NO_OPTIONS = ["YES", "NO"];
const PAYMENT_MODES = [
  { value: "cash", label: "Hand / Cash" },
  { value: "pay_online", label: "Pay Online" }
];

const isValidMobile = (value) => /^\d{10}$/.test(String(value || "").trim());
const isValidLandline = (value) => /^\d{6,12}$/.test(String(value || "").trim());
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const cleanDigits = (value, limit = 10) => String(value || "").replace(/\D/g, "").slice(0, limit);
const normalizeText = (value) => String(value || "");

const formatDateToDisplay = (isoDate) => {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

const formatDisplayToISO = (displayDate) => {
  if (!displayDate || !displayDate.includes('/')) return displayDate;
  const [d, m, y] = displayDate.split('/');
  return `${y}-${m}-${d}`;
};

const applyDateMask = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

const applyMonthYearMask = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2, 6)}`;
};

const sanitizeMonthYear = (value) => {
  if (!value) return "";
  const parts = value.split("/").filter(Boolean);
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  if (parts.length === 2 && parts[1].length === 4) return value;
  return value;
};

const MONTHS = [
  { value: "01", label: "Jan" },
  { value: "02", label: "Feb" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Apr" },
  { value: "05", label: "May" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Aug" },
  { value: "09", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" }
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 20 }, (_, i) => String(currentYear + 1 - i));

const getMonthFromValue = (val) => {
  if (!val) return "";
  const parts = String(val).split("-");
  if (parts.length >= 2) return parts[1] || "";
  return "";
};

const getYearFromValue = (val) => {
  if (!val) return "";
  const parts = String(val).split("-");
  if (parts.length >= 2) return parts[0] || "";
  return "";
};

export default function AddEnquiryModal({
  open,
  mode = "add",
  initialValues,
  departments = [],
  saving = false,
  onClose,
  onSubmit,
  showReceipt = true
}) {
  const { departments: allDepartments, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const [form, setForm] = useState({ ...createEmptyEnquiryForm(), firstName: "", lastName: "" });
  const [errors, setErrors] = useState({});
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [communityOptions, setCommunityOptions] = useState([]);
  const [quotaOptions, setQuotaOptions] = useState([]);
  const [feeCategoriesOptions, setFeeCategoriesOptions] = useState([]);
  const [scholarships, setScholarships] = useState([]);
  const { getActiveBatches } = useBatches(durations);
  const dobInputRef = useRef(null);
  const enquiryDateInputRef = useRef(null);
  const pendingFilesRef = useRef({});
  const readOnly = mode === "view";

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "fee_categories", "global"), (snapshot) => {
      if (snapshot.exists()) {
        const cats = snapshot.data().categories || [];
        setFeeCategoriesOptions(cats.map(c => typeof c === 'object' && c !== null ? c.name || '' : String(c)).filter(Boolean));
      } else {
        setFeeCategoriesOptions([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = getSeatConfigurationsRealtime((data) => {
      const quotasSet = new Set();
      Object.values(data || {}).forEach((config) => {
        if (config && config.quotas) {
          Object.keys(config.quotas).forEach((qName) => {
            quotasSet.add(qName);
          });
        }
      });
      setQuotaOptions(Array.from(quotasSet));
    }, (err) => console.error("Error loading quotas in AddEnquiryModal:", err));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = getCommunitiesRealtime((data) => {
      setCommunityOptions((data || []).map(c => c.name));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = getScholarshipsRealtime(
      (data) => setScholarships(data || []),
      (err) => console.error("Scholarships fetch error:", err)
    );
    return () => unsub();
  }, []);

  const monthYearToPickerValue = (val) => {
    if (!val) return "";
    const parts = String(val).split("/");
    if (parts.length === 2 && parts[1].length === 4) return `${parts[1]}-${parts[0].padStart(2, "0")}`;
    return val;
  };

  useEffect(() => {
    if (!open) return;

    setForm({
      ...createEmptyEnquiryForm(),
      ...initialValues,
      qualifyingExamMonthYear: monthYearToPickerValue(initialValues?.qualifyingExamMonthYear),
      qualifyingExam10thMonthYear: monthYearToPickerValue(initialValues?.qualifyingExam10thMonthYear),
      qualifyingExam11thMonthYear: monthYearToPickerValue(initialValues?.qualifyingExam11thMonthYear),
      qualifyingExam12thMonthYear: monthYearToPickerValue(initialValues?.qualifyingExam12thMonthYear),
      qualifyingExamDipDegMonthYear: monthYearToPickerValue(initialValues?.qualifyingExamDipDegMonthYear),
      firstName: initialValues?.firstName ?? (initialValues?.studentName?.split(' ')[0] || ""),
      lastName: initialValues?.lastName ?? (initialValues?.studentName?.split(' ').slice(1).join(' ') || ""),
      fatherGuardianName: initialValues?.fatherGuardianName ?? "",
      mobile: initialValues?.mobile ?? "",
      parentMobile: initialValues?.parentMobile ?? "",
      landline: initialValues?.landline ?? "",
      emailId: initialValues?.emailId ?? initialValues?.email ?? "",
      address: initialValues?.address ?? "",
      parentOccupation: initialValues?.parentOccupation ?? "",
      dateOfBirth: initialValues?.dateOfBirth ?? "",
      schoolCollege: initialValues?.schoolCollege ?? "",
      mediumOfInstruction: initialValues?.mediumOfInstruction ?? "",
      community: initialValues?.community ?? "",
      enquiryFor: initialValues?.enquiryFor ?? "",
      examinationPassedAppeared: initialValues?.examinationPassedAppeared ?? "",
      batch: initialValues?.batch ?? "",
      academicYear: initialValues?.academicYear ?? "",
      year: initialValues?.year ?? "",
      mathsMark: initialValues?.mathsMark ?? "",
      physicsMark: initialValues?.physicsMark ?? "",
      chemistryMark: initialValues?.chemistryMark ?? "",
      totalMarks: initialValues?.totalMarks ?? "",
      cutoff: initialValues?.cutoff ?? "",
      eligibility: initialValues?.eligibility ?? "",
      quotaAskedFor: initialValues?.quotaAskedFor ?? "",
      reference: initialValues?.reference ?? "",
      enquiryDate: formatDateToDisplay(initialValues?.enquiryDate ?? new Date().toISOString().slice(0, 10)),
      department: initialValues?.department ?? "",
      department2: initialValues?.department2 ?? "",
      department3: initialValues?.department3 ?? "",
      status: initialValues?.status ?? "Enquiry",
      enquiryAttendedBy: initialValues?.enquiryAttendedBy ?? "",
      payments: Array.isArray(initialValues?.payments) && initialValues.payments.length > 0 
        ? initialValues.payments.map(p => ({...p, paymentDate: formatDateToDisplay(p.paymentDate ?? "")}))
        : [{ feeCategory: initialValues?.feeCategory ?? "", feeAmount: initialValues?.feeAmount ?? "", paymentMode: initialValues?.paymentMode ?? "cash", paymentDate: formatDateToDisplay(initialValues?.paymentDate ?? ""), upiNumber: initialValues?.upiNumber ?? "" }],
      newFields: Array.isArray(initialValues?.newFields) ? initialValues.newFields : [],
      documents: initialValues?.documents ?? {}
    });

    setErrors({});
    setSameAsPresent(false);
  }, [open, initialValues, mode]);

  useEffect(() => {
    if (!open || readOnly) return;

    if (form.status === "Application" || form.status === "Admission") {
      // Auto-fill 12th Institute from School/College if empty
      setForm(prev => {
        if (!prev.qualifyingExam12thInstitute && prev.schoolCollege) {
          return { ...prev, qualifyingExam12thInstitute: prev.schoolCollege };
        }
        return prev;
      });

      if (!form.applicationNo) {
        getNextApplicationNo().then((nextAppNo) => {
          setForm((prev) => {
            if (!prev.applicationNo && (prev.status === "Application" || prev.status === "Admission")) {
              return { ...prev, applicationNo: nextAppNo };
            }
            return prev;
          });
        });
      }
    }
  }, [open, form.status, form.applicationNo, readOnly, form.schoolCollege, form.qualifyingExam12thInstitute]);

  const DOCUMENT_CHECKLIST = [
    { key: "tenthMarkSheet", label: "10th Mark Sheet" },
    { key: "eleventhMarkSheet", label: "11th Mark Sheet" },
    { key: "twelfthMarkSheet", label: "12th Mark Sheet" },
    { key: "diplomaMarkSheet", label: "Diploma Mark Sheet" },
    { key: "provisionalCertificate", label: "Provisional Certificate" },
    { key: "transferCertificate", label: "Transfer Certificate" },
    { key: "aadharCopy", label: "Aadhar Card Copy" },
    { key: "passportPhoto", label: "Passport Photo" }
  ];

  const fileToBase64ForPreview = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  const availableBatches = useMemo(() => {
    if (!form.programme) return [];
    const progKey = formatProgrammeKey(form.programme);
    return getActiveBatches(progKey);
  }, [form.programme, getActiveBatches]);

  const availableAcademicYears = useMemo(() => {
    return getAcademicYears(form.batch);
  }, [form.batch]);

  const getChoice1Options = () => {
    const list = [...departments];
    if (form.department && !list.includes(form.department)) {
      list.push(form.department);
    }
    return list;
  };

  const getChoice2Options = () => {
    const list = [...departments];
    if (form.department2 && !list.includes(form.department2)) {
      list.push(form.department2);
    }
    return list;
  };

  const getChoice3Options = () => {
    const list = [...departments];
    if (form.department3 && !list.includes(form.department3)) {
      list.push(form.department3);
    }
    return list;
  };

  if (!open) return null;

  const title = mode === "edit" ? "Edit Enquiry" : mode === "view" ? "Enquiry Details" : "New Enquiry";
  const calculatedCutoff = calculateCutoffFromMarks(form);
  const displayCutoff = calculatedCutoff !== "" ? calculatedCutoff : form.cutoff;
  const isCutoffRequired = (form.status === "Application" || form.status === "Admission") && form.enquiryFor === "BE / B.Tech";

  const fetchPincodeDetails = async (pincode, isPresent) => {
    const result = await fetchPincode(pincode);
    if (result) {
      setForm((prev) => ({
        ...prev,
        [isPresent ? "presentDistrict" : "permanentDistrict"]: result.district,
        [isPresent ? "presentState" : "permanentState"]: result.state,
        [isPresent ? "presentCountry" : "permanentCountry"]: result.country,
      }));
    }
  };

  const handleSameAsPresent = (checked) => {
    setSameAsPresent(checked);
    if (checked) {
      setForm((prev) => ({
        ...prev,
        permanentPincode: prev.presentPincode,
        permanentDistrict: prev.presentDistrict,
        permanentState: prev.presentState,
        permanentCity: prev.presentCity,
        permanentCountry: prev.presentCountry,
      }));
    }
  };

  const handleChange = (field, value) => {
    let nextValue = ["mobile", "parentMobile", "landline", "mathsMark", "physicsMark", "chemistryMark", "totalMarks"].includes(field)
      ? cleanDigits(value, field === "landline" ? 12 : (field.includes("Mark") || field === "totalMarks" ? 3 : 10))
      : value;

    if (field === "enquiryDate") {
      nextValue = applyDateMask(value);
    }

    setForm((prev) => {
      const updated = { ...prev, [field]: nextValue };
      return updated;
    });

    if (field === "presentPincode" && nextValue.length === 6) {
      fetchPincodeDetails(nextValue, true);
    }
    if (field === "permanentPincode" && nextValue.length === 6) {
      fetchPincodeDetails(nextValue, false);
    }

    if (sameAsPresent && field.startsWith("permanent") && field !== "permanentPincode") {
      setSameAsPresent(false);
    }

    if (field === "programme") {
      setForm((prev) => ({ ...prev, batch: "", academicYear: "" }));
    }
    if (field === "batch") {
      setForm((prev) => ({ ...prev, academicYear: "" }));
    }
    if (field === "academicYear") {
      // No dependent fields to clear for academicYear
    }
  };

  const handlePaymentChange = (index, field, value) => {
    setForm(prev => {
      const payments = Array.isArray(prev.payments) ? [...prev.payments] : [];
      if (!payments[index]) return prev;
      
      let nextValue = value;
      if (field === "paymentDate") {
        nextValue = applyDateMask(value);
      }
      
      payments[index] = { ...payments[index], [field]: nextValue };
      return { ...prev, payments };
    });
  };

  const addPayment = () => {
    setForm(prev => {
      const payments = Array.isArray(prev.payments) ? [...prev.payments] : [];
      payments.push({ feeCategory: "", feeAmount: "", paymentMode: "cash", paymentDate: "", upiNumber: "" });
      return { ...prev, payments };
    });
  };

  const removePayment = (index) => {
    setForm(prev => {
      const payments = Array.isArray(prev.payments) ? prev.payments.filter((_, i) => i !== index) : [];
      return { ...prev, payments };
    });
  };

  const handleDownloadReceipt = (payment, index) => {
    const studentName = form.studentName || "N/A";
    const appNo = form.applicationNo || form.id || "N/A"; 
    const receiptNo = `REC-${Date.now().toString().slice(-6)}-${index+1}`;

    const generatePdf = (img) => {
      const doc = new jsPDF();
      
      const renderReceipt = (startY, title) => {
        let currentY = startY;

        if (img) {
          const imgWidth = img.width;
          const imgHeight = img.height;
          const maxWidth = 180;
          const maxHeight = 30;
          let ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
          let newWidth = imgWidth * ratio;
          let newHeight = imgHeight * ratio;
          let x = (210 - newWidth) / 2;
          
          doc.addImage(img, 'PNG', x, currentY, newWidth, newHeight);
          currentY += newHeight + 10;
        } else {
          currentY += 5;
        }
        
        doc.setFontSize(20);
        doc.setTextColor(18, 12, 122);
        doc.text("Fee Receipt", 105, currentY, { align: "center" });

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`(${title})`, 105, currentY + 6, { align: "center" });

        currentY += 15;

        doc.setFontSize(11);
        doc.setTextColor(50, 50, 50);
        doc.text(`Receipt No: ${receiptNo}`, 14, currentY);
        doc.text(`Date of Payment: ${payment.paymentDate || "N/A"}`, 14, currentY + 8);
        doc.text(`Programme: ${form.programme || "N/A"}`, 14, currentY + 16);
        
        doc.text(`Student Name: ${studentName}`, 120, currentY);
        doc.text(`Application No: ${appNo}`, 120, currentY + 8);
        doc.text(`Department: ${form.department || "N/A"}`, 120, currentY + 16);

        currentY += 26;

        autoTable(doc, {
          startY: currentY,
          head: [["Particulars (Fee Category)", "Amount (Rs)"]],
          body: [
            [payment.feeCategory || "N/A", payment.feeAmount || "0"],
          ],
          foot: [["Total", payment.feeAmount || "0"]],
          theme: "grid",
          headStyles: { fillColor: [18, 12, 122] },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
          margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY || currentY + 10;
        doc.setFontSize(10);
        const modeText = payment.paymentMode === "pay_online" 
          ? `Online (UTR: ${payment.upiNumber || "N/A"})` 
          : "Cash / Hand";
        doc.text(`Payment Mode: ${modeText}`, 14, finalY + 15);
        
        doc.text("Authorized Signatory", 150, finalY + 30);
        doc.line(140, finalY + 25, 190, finalY + 25);
      };

      renderReceipt(15, "Student Copy");
      
      doc.setLineDashPattern([2, 2], 0);
      doc.setDrawColor(200, 200, 200);
      doc.line(10, 148, 200, 148);
      doc.setLineDashPattern([], 0);

      renderReceipt(160, "Accounts Copy");

      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    };

    const img = new Image();
    img.onload = () => generatePdf(img);
    img.onerror = () => generatePdf(null);
    img.src = '/logo.png';
  };

  const handleDownloadConsolidatedReceipt = () => {
    const studentName = form.studentName || "N/A";
    const appNo = form.applicationNo || form.id || "N/A"; 
    const receiptNo = `CREC-${Date.now().toString().slice(-6)}`;
    
    // Only include valid payments that have an amount
    const validPayments = (form.payments || []).filter(p => parseFloat(p.feeAmount) > 0);
    if (validPayments.length === 0) return;

    const generatePdf = (img) => {
      const doc = new jsPDF();
      
      const renderReceipt = (startY, title) => {
        let currentY = startY;

        if (img) {
          const imgWidth = img.width;
          const imgHeight = img.height;
          const maxWidth = 180;
          const maxHeight = 30;
          let ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
          let newWidth = imgWidth * ratio;
          let newHeight = imgHeight * ratio;
          let x = (210 - newWidth) / 2;
          
          doc.addImage(img, 'PNG', x, currentY, newWidth, newHeight);
          currentY += newHeight + 10;
        } else {
          currentY += 5;
        }
        
        doc.setFontSize(20);
        doc.setTextColor(18, 12, 122);
        doc.text("Consolidated Fee Receipt", 105, currentY, { align: "center" });

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`(${title})`, 105, currentY + 6, { align: "center" });

        currentY += 15;

        doc.setFontSize(11);
        doc.setTextColor(50, 50, 50);
        doc.text(`Receipt No: ${receiptNo}`, 14, currentY);
        const lastPaymentDate = validPayments[validPayments.length - 1].paymentDate || "N/A";
        doc.text(`Latest Date: ${lastPaymentDate}`, 14, currentY + 8);
        doc.text(`Programme: ${form.programme || "N/A"}`, 14, currentY + 16);
        
        doc.text(`Student Name: ${studentName}`, 120, currentY);
        doc.text(`Application No: ${appNo}`, 120, currentY + 8);
        doc.text(`Department: ${form.department || "N/A"}`, 120, currentY + 16);

        currentY += 26;

        const tableBody = validPayments.map((p, idx) => [
          `Payment ${idx + 1}: ${p.feeCategory || "N/A"} (${p.paymentDate || "N/A"})`,
          p.feeAmount || "0"
        ]);
        
        const totalAmount = validPayments.reduce((sum, p) => sum + parseFloat(p.feeAmount || 0), 0);

        autoTable(doc, {
          startY: currentY,
          head: [["Particulars", "Amount (Rs)"]],
          body: tableBody,
          foot: [["Total Amount", totalAmount.toString()]],
          theme: "grid",
          headStyles: { fillColor: [18, 12, 122] },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
          margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY || currentY + 10;
        
        doc.setFontSize(10);
        doc.text("Payment Modes Used:", 14, finalY + 10);
        
        const modesMap = {
          "pay_online": "Online",
          "cash": "Cash / Hand"
        };
        
        // Collect unique payment modes
        const unqModes = [...new Set(validPayments.map(p => {
          if (p.paymentMode === "pay_online") {
            return `Online (UTR: ${p.upiNumber || "N/A"})`;
          }
          return "Cash / Hand";
        }))];
        
        unqModes.forEach((modeStr, idx) => {
          doc.text(`- ${modeStr}`, 14, finalY + 16 + (idx * 5));
        });
        
        doc.text("Authorized Signatory", 150, finalY + 30);
        doc.line(140, finalY + 25, 190, finalY + 25);
      };

      renderReceipt(15, "Student Copy");
      
      doc.setLineDashPattern([2, 2], 0);
      doc.setDrawColor(200, 200, 200);
      doc.line(10, 148, 200, 148);
      doc.setLineDashPattern([], 0);

      renderReceipt(160, "Accounts Copy");

      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    };

    const img = new Image();
    img.onload = () => generatePdf(img);
    img.onerror = () => generatePdf(null);
    img.src = '/logo.png';
  };

  const handleFileChange = async (key, file, target) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        [key]: "File exceeds 1MB limit"
      }));
      if (target) {
        target.value = "";
      }
      return;
    }
    setErrors((prev) => {
      const errs = { ...prev };
      delete errs[key];
      return errs;
    });
    try {
      const previewUrl = await fileToBase64ForPreview(file);
      pendingFilesRef.current[key] = file;
      setForm((prev) => ({
        ...prev,
        documents: {
          ...(prev.documents || {}),
          [key]: { name: file.name, type: file.type, data: previewUrl, _pending: true }
        }
      }));
    } catch (e) {
      console.error("File read error:", e);
    }
  };

  const removeDocument = async (key) => {
    const doc = form.documents?.[key];
    if (doc?.url) {
      try { await deleteByUrl(doc.url); } catch (e) { /* ignore */ }
    }
    delete pendingFilesRef.current[key];
    setForm((prev) => {
      const docs = { ...(prev.documents || {}) };
      delete docs[key];
      return { ...prev, documents: docs };
    });
    setErrors((prev) => {
      const errs = { ...prev };
      delete errs[key];
      return errs;
    });
  };

  const handleMonthYearChange = (levelKey, month, year) => {
    if (!month && !year) {
      handleChange(`qualifyingExam${levelKey}MonthYear`, "");
    } else {
      handleChange(`qualifyingExam${levelKey}MonthYear`, `${year || ""}-${month || ""}`);
    }
  };

  const monthYearToStorage = (val) => {
    if (!val) return "";
    const parts = val.split("-");
    if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 2) {
      return `${parts[1]}/${parts[0]}`;
    }
    const slashParts = val.split("/");
    if (slashParts.length === 2 && slashParts[0].length === 2 && slashParts[1].length === 4) {
      return val;
    }
    return "";
  };

  const getApplicationPayload = () => ({
    applicationNo: normalizeText(form.applicationNo).trim(),
    title: normalizeText(form.title).trim(),
    gender: normalizeText(form.gender).trim(),
    motherName: normalizeText(form.motherName).trim(),
    guardianName: normalizeText(form.guardianName).trim(),
    parentWhatsAppNo: cleanDigits(form.parentWhatsAppNo, 10),
    studentWhatsAppNo: cleanDigits(form.studentWhatsAppNo, 10),
    presentHouseNo: normalizeText(form.presentHouseNo).trim(),
    presentStreet: normalizeText(form.presentStreet).trim(),
    presentLocality: normalizeText(form.presentLocality).trim(),
    presentCity: normalizeText(form.presentCity).trim(),
    presentAddress: normalizeText(form.presentAddress).trim(),
    permanentAddress: normalizeText(form.permanentAddress).trim(),
    presentPincode: cleanDigits(form.presentPincode, 6),
    permanentPincode: cleanDigits(form.permanentPincode, 6),
    presentDistrict: normalizeText(form.presentDistrict).trim(),
    permanentDistrict: normalizeText(form.permanentDistrict).trim(),
    presentState: normalizeText(form.presentState).trim(),
    permanentState: normalizeText(form.permanentState).trim(),
    permanentCity: normalizeText(form.permanentCity).trim(),
    presentCountry: normalizeText(form.presentCountry).trim(),
    permanentCountry: normalizeText(form.permanentCountry).trim(),
    motherOccupation: normalizeText(form.motherOccupation).trim(),
    fatherOccupationSector: normalizeText(form.fatherOccupationSector).trim(),
    motherOccupationSector: normalizeText(form.motherOccupationSector).trim(),
    fatherOrganisation: normalizeText(form.fatherOrganisation).trim(),
    motherOrganisation: normalizeText(form.motherOrganisation).trim(),
    fatherDesignation: normalizeText(form.fatherDesignation).trim(),
    motherDesignation: normalizeText(form.motherDesignation).trim(),
    fatherAnnualIncome: normalizeText(form.fatherAnnualIncome).trim(),
    motherAnnualIncome: normalizeText(form.motherAnnualIncome).trim(),
    familyAnnualIncome: normalizeText(form.familyAnnualIncome).trim(),
    age: normalizeText(form.age).trim(),
    religion: normalizeText(form.religion).trim(),
    nationality: normalizeText(form.nationality).trim(),
    caste: normalizeText(form.caste).trim(),
    motherTongue: normalizeText(form.motherTongue).trim(),
    bloodGroup: normalizeText(form.bloodGroup).trim(),
    programme: normalizeText(form.programme).trim(),
    batch: normalizeText(form.batch).trim(),
    academicYear: normalizeText(form.academicYear).trim(),
    year: normalizeText(form.year).trim(),
    studentCategory: normalizeText(form.studentCategory).trim(),
    seatCategory: normalizeText(form.seatCategory).trim(),
    scholarshipDetails: normalizeText(form.scholarshipDetails).trim(),
    maritalStatus: normalizeText(form.maritalStatus).trim(),
    hostellerDayScholar: normalizeText(form.hostellerDayScholar).trim(),
    transportRequired: normalizeText(form.transportRequired).trim(),
    transportRoute: normalizeText(form.transportRoute).trim(),
    transportStage: normalizeText(form.transportStage).trim(),
    emsUmsNo: normalizeText(form.emsUmsNo).trim(),
    aadharNo: normalizeText(form.aadharNo).trim(),
    qualifyingExamProgrammes: normalizeText(form.qualifyingExamProgrammes).trim(),
    qualifyingExamInstitute: normalizeText(form.qualifyingExamInstitute).trim(),
    qualifyingExamBoardUniversity: normalizeText(form.qualifyingExamBoardUniversity).trim(),
    qualifyingExamMonthYear: monthYearToStorage(normalizeText(form.qualifyingExamMonthYear).trim()),
    qualifyingExamAttempts: normalizeText(form.qualifyingExamAttempts).trim(),
    qualifyingExamMarks: normalizeText(form.qualifyingExamMarks).trim(),
    qualifyingExam10thInstitute: normalizeText(form.qualifyingExam10thInstitute).trim(),
    qualifyingExam10thBoard: normalizeText(form.qualifyingExam10thBoard).trim(),
    qualifyingExam10thMonthYear: monthYearToStorage(normalizeText(form.qualifyingExam10thMonthYear).trim()),
    qualifyingExam10thAttempts: normalizeText(form.qualifyingExam10thAttempts).trim(),
    qualifyingExam10thMarks: normalizeText(form.qualifyingExam10thMarks).trim(),
    qualifyingExam11thInstitute: normalizeText(form.qualifyingExam11thInstitute).trim(),
    qualifyingExam11thBoard: normalizeText(form.qualifyingExam11thBoard).trim(),
    qualifyingExam11thMonthYear: monthYearToStorage(normalizeText(form.qualifyingExam11thMonthYear).trim()),
    qualifyingExam11thAttempts: normalizeText(form.qualifyingExam11thAttempts).trim(),
    qualifyingExam11thMarks: normalizeText(form.qualifyingExam11thMarks).trim(),
    qualifyingExam12thInstitute: normalizeText(form.qualifyingExam12thInstitute).trim(),
    qualifyingExam12thBoard: normalizeText(form.qualifyingExam12thBoard).trim(),
    qualifyingExam12thMonthYear: monthYearToStorage(normalizeText(form.qualifyingExam12thMonthYear).trim()),
    qualifyingExam12thAttempts: normalizeText(form.qualifyingExam12thAttempts).trim(),
    qualifyingExam12thMarks: normalizeText(form.qualifyingExam12thMarks).trim(),
    qualifyingExamDipDegInstitute: normalizeText(form.qualifyingExamDipDegInstitute).trim(),
    qualifyingExamDipDegBoard: normalizeText(form.qualifyingExamDipDegBoard).trim(),
    qualifyingExamDipDegMonthYear: monthYearToStorage(normalizeText(form.qualifyingExamDipDegMonthYear).trim()),
    qualifyingExamDipDegAttempts: normalizeText(form.qualifyingExamDipDegAttempts).trim(),
    qualifyingExamDipDegMarks: normalizeText(form.qualifyingExamDipDegMarks).trim()
  });

  const validate = () => {
    const nextErrors = {};

    if (!String(form.firstName || "").trim()) nextErrors.firstName = "First name is required";
    if (!String(form.lastName || "").trim()) nextErrors.lastName = "Last name is required";
    if (!String(form.fatherGuardianName || "").trim()) nextErrors.fatherGuardianName = "Father/guardian name is required";
    if (!String(form.mobile || "").trim()) nextErrors.mobile = "Mobile number is required";
    else if (!isValidMobile(form.mobile)) nextErrors.mobile = "Enter a valid 10-digit mobile number";

    if (form.parentMobile && !isValidMobile(form.parentMobile)) {
      nextErrors.parentMobile = "Enter a valid 10-digit parent mobile number";
    }

    if (form.landline && !isValidLandline(form.landline)) {
      nextErrors.landline = "Enter a valid landline number";
    }

    if (!String(form.emailId || "").trim()) nextErrors.emailId = "Email ID is required";
    else if (!isValidEmail(form.emailId)) nextErrors.emailId = "Enter a valid email address";

    if (form.status === "Application" && !String(form.emsUmsNo || "").trim()) nextErrors.emsUmsNo = "EMIS / UMIS No. is required for Application";
    if (!String(form.schoolCollege || "").trim()) nextErrors.schoolCollege = "School/college name is required";
    if (!String(form.mediumOfInstruction || "").trim()) nextErrors.mediumOfInstruction = "Medium of instruction is required";
    if (!String(form.community || "").trim()) nextErrors.community = "Community is required";
    if (!String(form.enquiryFor || "").trim()) nextErrors.enquiryFor = "Enquiry for is required";
    if (!String(form.examinationPassedAppeared || "").trim()) nextErrors.examinationPassedAppeared = "Examination type is required";
    if (form.status === "Application" || form.status === "Admission") {
      if (!String(form.batch || "").trim()) nextErrors.batch = "Batch selection is required for applications";
      if (!String(form.academicYear || "").trim()) nextErrors.academicYear = "Academic Year selection is required for applications";
    }
    if (!String(form.department || "").trim()) nextErrors.department = "Department interest is required";
    if (!String(form.status || "").trim()) nextErrors.status = "Status is required";
    if (!String(form.enquiryDate || "").trim()) nextErrors.enquiryDate = "Enquiry date is required";

    const dateReg = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (form.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) nextErrors.dateOfBirth = "Enter a valid date";
    if (form.enquiryDate && !dateReg.test(form.enquiryDate)) nextErrors.enquiryDate = "Enter date in DD/MM/YYYY format";

    // Payment validations
    if (form.status === "Application" || form.status === "Admission") {
      if (Array.isArray(form.payments)) {
        form.payments.forEach((payment, index) => {
          const fee = Number(String(payment.feeAmount || "").trim());
          if (!fee || Number.isNaN(fee) || fee <= 0) {
            nextErrors[`payment_${index}_feeAmount`] = `Enter fee amount for payment ${index + 1}`;
          }
          if (!payment.paymentDate) {
            nextErrors[`payment_${index}_paymentDate`] = `Enter payment date for payment ${index + 1}`;
          } else if (!dateReg.test(payment.paymentDate)) {
            nextErrors[`payment_${index}_paymentDate`] = `Enter date in DD/MM/YYYY format for payment ${index + 1}`;
          }
          if (!payment.paymentMode) nextErrors[`payment_${index}_paymentMode`] = `Select payment mode for payment ${index + 1}`;
          if (!payment.feeCategory) nextErrors[`payment_${index}_feeCategory`] = `Select fee category for payment ${index + 1}`;
          if (payment.paymentMode === "pay_online") {
            if (!String(payment.upiNumber || "").trim()) nextErrors[`payment_${index}_upiNumber`] = `Enter UTR Number for online payment ${index + 1}`;
          }
        });
      }
    }

    const hasMarks = [form.mathsMark, form.physicsMark, form.chemistryMark].some((value) => String(value || "").trim() !== "");
    const hasAllMarks = [form.mathsMark, form.physicsMark, form.chemistryMark].every((value) => String(value || "").trim() !== "");

    if (hasMarks && !hasAllMarks) {
      nextErrors.mathsMark = "Enter Maths, Physics and Chemistry marks";
    }

    if (hasAllMarks) {
      ["mathsMark", "physicsMark", "chemistryMark"].forEach((field) => {
        const value = Number(form[field]);
        if (Number.isNaN(value) || value < 0 || value > 100) {
          nextErrors[field] = "Enter a valid mark between 0 and 100";
        }
      });
      if (calculatedCutoff === "") {
        nextErrors.cutoff = "Cutoff could not be calculated";
      }
    } else if (isCutoffRequired && !form.cutoff && mode === "add") {
      nextErrors.cutoff = "Enter Maths, Physics and Chemistry marks to calculate cutoff";
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (readOnly) {
      onClose?.();
      return;
    }

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const uid = initialValues?.enquiryId || `enq_${Date.now()}`;

    const uploadedDocs = { ...(form.documents || {}) };
    await Promise.all(
      Object.entries(uploadedDocs).map(async ([key, doc]) => {
        if (doc?._pending && doc.data) {
          const storagePath = userStoragePath(uid, "enquiry_documents", doc.name || key);
          const downloadUrl = await uploadBase64(storagePath, doc.data);
          uploadedDocs[key] = { name: doc.name, type: doc.type, url: downloadUrl };
        } else if (doc?.data && !doc?.url) {
          const storagePath = userStoragePath(uid, "enquiry_documents", doc.name || key);
          const downloadUrl = await uploadBase64(storagePath, doc.data);
          uploadedDocs[key] = { name: doc.name, type: doc.type, url: downloadUrl };
        }
      })
    );
    pendingFilesRef.current = {};

    await onSubmit?.({
      firstName: normalizeText(form.firstName).trim(),
      lastName: normalizeText(form.lastName).trim(),
      studentName: `${normalizeText(form.firstName).trim()} ${normalizeText(form.lastName).trim()}`,
      fatherGuardianName: normalizeText(form.fatherGuardianName).trim(),
      mobile: cleanDigits(form.mobile, 10),
      parentMobile: cleanDigits(form.parentMobile, 10),
      landline: cleanDigits(form.landline, 12),
      emailId: normalizeText(form.emailId).trim(),
      parentOccupation: normalizeText(form.parentOccupation).trim(),
      dateOfBirth: form.dateOfBirth,
      schoolCollege: normalizeText(form.schoolCollege).trim(),
      mediumOfInstruction: normalizeText(form.mediumOfInstruction).trim(),
      community: normalizeText(form.community).trim(),
      enquiryFor: normalizeText(form.enquiryFor).trim(),
      examinationPassedAppeared: normalizeText(form.examinationPassedAppeared).trim(),
      batch: normalizeText(form.batch).trim(),
      year: normalizeText(form.year).trim(),
      academicYear: normalizeText(form.academicYear).trim(),
      mathsMark: cleanDigits(form.mathsMark, 3),
      physicsMark: cleanDigits(form.physicsMark, 3),
      chemistryMark: cleanDigits(form.chemistryMark, 3),
      totalMarks: cleanDigits(form.totalMarks, 3),
      cutoff: displayCutoff,
      eligibility: normalizeText(form.eligibility).trim(),
      quotaAskedFor: normalizeText(form.quotaAskedFor).trim(),
      reference: normalizeText(form.reference).trim(),
      enquiryDate: formatDisplayToISO(form.enquiryDate),
      department: normalizeText(form.department).trim(),
      department2: normalizeText(form.department2).trim(),
      department3: normalizeText(form.department3).trim(),
      status: normalizeText(form.status).trim(),
      enquiryAttendedBy: normalizeText(form.enquiryAttendedBy).trim(),
      payments: Array.isArray(form.payments) ? form.payments.map(p => ({
        feeCategory: normalizeText(p.feeCategory).trim(),
        feeAmount: Number(String(p.feeAmount || "").trim()) || "",
        paymentMode: normalizeText(p.paymentMode).trim(),
        paymentDate: formatDisplayToISO(p.paymentDate),
        upiNumber: normalizeText(p.upiNumber).trim(),
      })) : [],
      documents: uploadedDocs,
      ...getApplicationPayload()
    });
  };

  const exportPdf = (enq) => {
    const row = (label, key, value) => {
      const display = value === null || value === undefined ? "" : String(value);
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;width:35%;font-weight:600">${label}</td>
          <td style="padding:8px;border:1px solid #ddd">${display}</td>
        </tr>
      `;
    };

    const documentTitle = (enq.status === "Application" || enq.status === "Admission")
      ? `Admission Application - ${enq.applicationNo || "N/A"}`
      : `Admission Enquiry - ${enq.enquiryId || ""}`;

    const generateHtml = (logoDataUrl) => {
      const logoImg = logoDataUrl || "";
      return `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>
          *{margin:0;padding:0}
          body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:10mm 10mm 5mm}
          table{width:100%;border-collapse:collapse;margin-top:6px}
          td{vertical-align:top}
          .title{font-size:16px;font-weight:700;text-align:center;}
          .header{text-align:center;}
          .header img{max-width:150mm;max-height:20mm;object-fit:contain;}
        </style>
      </head>
      <body>
        ${logoImg ? `<div class="header"><img src="${logoImg}" alt="College Logo" /></div>` : ""}
        <div class="title" style="margin-top:${logoImg ? "4px" : "0"}">${documentTitle}</div>
        <table>
          ${row("Application No.","applicationNo", enq.applicationNo)}
          ${row("Title","title", enq.title)}
          ${row("Gender","gender", enq.gender)}
          ${row("Student Name","studentName", enq.studentName)}
          ${row("Father / Guardian","fatherGuardianName", enq.fatherGuardianName)}
          ${row("Mother's Name","motherName", enq.motherName)}
          ${row("Guardian's Name","guardianName", enq.guardianName)}
          ${row("Mobile","mobile", enq.mobile)}
          ${row("Parent Mobile","parentMobile", enq.parentMobile)}
          ${row("Parent WhatsApp No.","parentWhatsAppNo", enq.parentWhatsAppNo)}
          ${row("Student WhatsApp No.","studentWhatsAppNo", enq.studentWhatsAppNo)}
          ${row("Email ID","emailId", enq.emailId)}
          ${row("Address","address", enq.address)}
          ${row("Present Address","presentAddress", enq.presentAddress)}
          ${row("Permanent Address","permanentAddress", enq.permanentAddress)}
          ${row("Present Pincode","presentPincode", enq.presentPincode)}
          ${row("Permanent Pincode","permanentPincode", enq.permanentPincode)}
          ${row("Department","department", enq.department)}
          ${row("Status","status", enq.status)}
          ${row("Programme","programme", enq.programme)}
          ${row("Batch","batch", enq.batch)}
          ${row("Academic Year","academicYear", enq.academicYear)}
          ${row("Student Category","studentCategory", enq.studentCategory)}
          ${row("Seat Category","seatCategory", enq.seatCategory)}
          ${row("Scholarship Details","scholarshipDetails", enq.scholarshipDetails)}
          ${row("Religion","religion", enq.religion)}
          ${row("Community","community", enq.community)}
          ${row("Nationality","nationality", enq.nationality)}
          ${row("Caste","caste", enq.caste)}
          ${row("Mother Tongue","motherTongue", enq.motherTongue)}
          ${row("Blood Group","bloodGroup", enq.bloodGroup)}
          ${row("Marital Status","maritalStatus", enq.maritalStatus)}
          ${row("Enquiry Date","enquiryDate", enq.enquiryDate)}
          ${row("Father Occupation Sector","fatherOccupationSector", enq.fatherOccupationSector)}
          ${row("Father Organisation","fatherOrganisation", enq.fatherOrganisation)}
          ${row("Father Designation","fatherDesignation", enq.fatherDesignation)}
          ${row("Father Annual Income","fatherAnnualIncome", enq.fatherAnnualIncome)}
          ${row("Mother Occupation Sector","motherOccupationSector", enq.motherOccupationSector)}
          ${row("Mother Organisation","motherOrganisation", enq.motherOrganisation)}
          ${row("Mother Designation","motherDesignation", enq.motherDesignation)}
          ${row("Mother Annual Income","motherAnnualIncome", enq.motherAnnualIncome)}
          ${row("Total Annual Income of Family","familyAnnualIncome", enq.familyAnnualIncome)}
          ${row("Hosteller / Day Scholar","hostellerDayScholar", enq.hostellerDayScholar)}
          ${row("Transport Required","transportRequired", enq.transportRequired)}
          ${row("Route","transportRoute", enq.transportRoute)}
          ${row("Stage","transportStage", enq.transportStage)}
          ${row("EMIS / UMIS No.","emsUmsNo", enq.emsUmsNo)}
          ${row("Aadhar No.","aadharNo", enq.aadharNo)}
          ${row("Qualifying Exam Programme","qualifyingExamProgrammes", enq.qualifyingExamProgrammes)}
          ${row("Institute","qualifyingExamInstitute", enq.qualifyingExamInstitute)}
          ${row("Board / University","qualifyingExamBoardUniversity", enq.qualifyingExamBoardUniversity)}
          ${row("Month & Year of Passing","qualifyingExamMonthYear", enq.qualifyingExamMonthYear)}
          ${row("No. of Attempts","qualifyingExamAttempts", enq.qualifyingExamAttempts)}
          ${row("% of Marks","qualifyingExamMarks", enq.qualifyingExamMarks)}
          
          ${enq.qualifyingExam10thInstitute || enq.qualifyingExam10thBoard || enq.qualifyingExam10thMonthYear || enq.qualifyingExam10thAttempts || enq.qualifyingExam10thMarks ? `
          <tr><td colspan="2" style="background:#f4f4f5;font-weight:700;padding:6px 8px;border:1px solid #ddd">10th Std Details</td></tr>
          ${row("Institute","qualifyingExam10thInstitute", enq.qualifyingExam10thInstitute)}
          ${row("Board / University","qualifyingExam10thBoard", enq.qualifyingExam10thBoard)}
          ${row("Month & Year of Passing","qualifyingExam10thMonthYear", enq.qualifyingExam10thMonthYear)}
          ${row("No. of Attempts","qualifyingExam10thAttempts", enq.qualifyingExam10thAttempts)}
          ${row("% of Marks","qualifyingExam10thMarks", enq.qualifyingExam10thMarks)}
          ` : ""}

          ${enq.qualifyingExam11thInstitute || enq.qualifyingExam11thBoard || enq.qualifyingExam11thMonthYear || enq.qualifyingExam11thAttempts || enq.qualifyingExam11thMarks ? `
          <tr><td colspan="2" style="background:#f4f4f5;font-weight:700;padding:6px 8px;border:1px solid #ddd">11th Std Details</td></tr>
          ${row("Institute","qualifyingExam11thInstitute", enq.qualifyingExam11thInstitute)}
          ${row("Board / University","qualifyingExam11thBoard", enq.qualifyingExam11thBoard)}
          ${row("Month & Year of Passing","qualifyingExam11thMonthYear", enq.qualifyingExam11thMonthYear)}
          ${row("No. of Attempts","qualifyingExam11thAttempts", enq.qualifyingExam11thAttempts)}
          ${row("% of Marks","qualifyingExam11thMarks", enq.qualifyingExam11thMarks)}
          ` : ""}

          ${enq.qualifyingExam12thInstitute || enq.qualifyingExam12thBoard || enq.qualifyingExam12thMonthYear || enq.qualifyingExam12thAttempts || enq.qualifyingExam12thMarks ? `
          <tr><td colspan="2" style="background:#f4f4f5;font-weight:700;padding:6px 8px;border:1px solid #ddd">12th Std Details</td></tr>
          ${row("Institute","qualifyingExam12thInstitute", enq.qualifyingExam12thInstitute)}
          ${row("Board / University","qualifyingExam12thBoard", enq.qualifyingExam12thBoard)}
          ${row("Month & Year of Passing","qualifyingExam12thMonthYear", enq.qualifyingExam12thMonthYear)}
          ${row("No. of Attempts","qualifyingExam12thAttempts", enq.qualifyingExam12thAttempts)}
          ${row("% of Marks","qualifyingExam12thMarks", enq.qualifyingExam12thMarks)}
          ` : ""}

          ${enq.qualifyingExamDipDegInstitute || enq.qualifyingExamDipDegBoard || enq.qualifyingExamDipDegMonthYear || enq.qualifyingExamDipDegAttempts || enq.qualifyingExamDipDegMarks ? `
          <tr><td colspan="2" style="background:#f4f4f5;font-weight:700;padding:6px 8px;border:1px solid #ddd">Diploma / Degree Details</td></tr>
          ${row("Institute","qualifyingExamDipDegInstitute", enq.qualifyingExamDipDegInstitute)}
          ${row("Board / University","qualifyingExamDipDegBoard", enq.qualifyingExamDipDegBoard)}
          ${row("Month & Year of Passing","qualifyingExamDipDegMonthYear", enq.qualifyingExamDipDegMonthYear)}
          ${row("No. of Attempts","qualifyingExamDipDegAttempts", enq.qualifyingExamDipDegAttempts)}
          ${row("% of Marks","qualifyingExamDipDegMarks", enq.qualifyingExamDipDegMarks)}
          ` : ""}

          ${row("Maths/P/C Mark","mathsMark", enq.mathsMark)}
          ${row("Physics/Theory Mark","physicsMark", enq.physicsMark)}
          ${row("Chemistry/Lab Mark","chemistryMark", enq.chemistryMark)}
          ${row("Cutoff","cutoff", enq.cutoff)}
          ${(Array.isArray(enq.payments) ? enq.payments : []).map((p, i) => `
            <tr><td colspan="2" style="background:#f4f4f5;font-weight:700;padding:6px 8px;border:1px solid #ddd">Payment ${i + 1}</td></tr>
            ${row("Fee Category","feeCategory", p.feeCategory)}
            ${row("Minimum Fee (₹)","feeAmount", p.feeAmount)}
            ${row("Payment Date","paymentDate", formatDateToDisplay(p.paymentDate))}
            ${row("Payment Mode","paymentMode", p.paymentMode === "pay_online" ? "Online (UTR: " + (p.upiNumber || "") + ")" : "Hand / Cash")}
          `).join("")}
          <tr>
            <td style="padding:8px;border:1px solid #ddd;width:35%;font-weight:600">Documents</td>
            <td style="padding:8px;border:1px solid #ddd">
              ${(enq.documents && Object.keys(enq.documents).length > 0)
                ? Object.entries(enq.documents).map(([key, doc]) => `<div style=\"margin-bottom:4px\"><strong>${key}</strong>: ${doc?.name || "Uploaded"}</div>`).join("")
                : "No documents uploaded"}
            </td>
          </tr>
        </table>
      </body>
      </html>`;
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 600;
      const maxHeight = 100;
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const logoDataUrl = canvas.toDataURL("image/png");

      const html = generateHtml(logoDataUrl);
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch (e) { console.error(e); }
      }, 200);
    };
    img.onerror = () => {
      const html = generateHtml("");
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch (e) { console.error(e); }
      }, 100);
    };
    img.src = '/logo.png';
  };

  const disabledClass = readOnly ? "bg-zinc-50 text-zinc-500" : "bg-white";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-zinc-900">{title}</h3>
                {readOnly ? (
                  <StatusBadge status={form.status} />
                ) : (
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(event) => handleChange("status", event.target.value)}
                      className="appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 pr-8 text-[11px] font-bold text-[#120c7a] outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                    >
                      {Array.from(new Set([...STATUS_OPTIONS, form.status].filter(Boolean))).map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={12} />
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-500">Manage enquiry details in the ERP admissions module.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] overflow-y-auto px-6 py-5">
          <Section title="Applicant Details" description="Basic student and parent information.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Title" error={errors.title} readOnly={readOnly}>
                <select value={form.title} onChange={(event) => handleChange("title", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                  <option value="">Select title</option>
                  {TITLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>

              <Field label="First Name" required error={errors.firstName} readOnly={readOnly}>
                <input
                  value={form.firstName}
                  onChange={(event) => handleChange("firstName", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter first name"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Last Name" required error={errors.lastName} readOnly={readOnly}>
                <input
                  value={form.lastName}
                  onChange={(event) => handleChange("lastName", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter last name"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Father / Guardian's Name" required error={errors.fatherGuardianName} readOnly={readOnly}>
                <input
                  value={form.fatherGuardianName}
                  onChange={(event) => handleChange("fatherGuardianName", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter father/guardian name"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Mobile Number" required error={errors.mobile} readOnly={readOnly}>
                <input
                  value={form.mobile}
                  onChange={(event) => handleChange("mobile", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Student mobile number"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Parent Mobile" error={errors.parentMobile} readOnly={readOnly}>
                <input
                  value={form.parentMobile}
                  onChange={(event) => handleChange("parentMobile", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Optional parent mobile"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Landline Number" error={errors.landline} readOnly={readOnly}>
                <input
                  value={form.landline}
                  onChange={(event) => handleChange("landline", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Optional landline number"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Email ID" required error={errors.emailId} readOnly={readOnly}>
                <input
                  value={form.emailId}
                  onChange={(event) => handleChange("emailId", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter email address"
                  readOnly={readOnly}
                />
              </Field>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 md:p-5">
              <h5 className="mb-4 text-sm font-bold text-zinc-900">Present Address</h5>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="House / Door No." error={errors.presentHouseNo} readOnly={readOnly}>
                  <input value={form.presentHouseNo} onChange={(event) => handleChange("presentHouseNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="House / Door No." readOnly={readOnly} />
                </Field>
                <Field label="Street / Road Name" error={errors.presentStreet} readOnly={readOnly}>
                  <input value={form.presentStreet} onChange={(event) => handleChange("presentStreet", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Street / Road Name" readOnly={readOnly} />
                </Field>
                <Field label="Locality / Village" error={errors.presentLocality} readOnly={readOnly}>
                  <input value={form.presentLocality} onChange={(event) => handleChange("presentLocality", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Locality / Village" readOnly={readOnly} />
                </Field>
                <Field label="City / Town" error={errors.presentCity} readOnly={readOnly}>
                  <input value={form.presentCity} onChange={(event) => handleChange("presentCity", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="City / Town" readOnly={readOnly} />
                </Field>
                <Field label="Present Pincode" error={errors.presentPincode} readOnly={readOnly}>
                  <input value={form.presentPincode} onChange={(event) => handleChange("presentPincode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present pincode" inputMode="numeric" readOnly={readOnly} />
                </Field>
                <Field label="Present District" error={errors.presentDistrict} readOnly={readOnly}>
                  <input value={form.presentDistrict} onChange={(event) => handleChange("presentDistrict", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present district" readOnly={readOnly} />
                </Field>
                <Field label="Present State" error={errors.presentState} readOnly={readOnly}>
                  <input value={form.presentState} onChange={(event) => handleChange("presentState", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present state" readOnly={readOnly} />
                </Field>
                <Field label="Present Country" error={errors.presentCountry} readOnly={readOnly}>
                  <input value={form.presentCountry} onChange={(event) => handleChange("presentCountry", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present country" readOnly={readOnly} />
                </Field>
              </div>
            </div>

            {(form.status === "Application" || form.status === "Admission") && (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h5 className="text-sm font-bold text-zinc-900">Permanent Address</h5>
                  <label className="relative inline-flex items-center gap-3 cursor-pointer group shrink-0">
                    <input
                      type="checkbox"
                      checked={sameAsPresent}
                      onChange={(e) => handleSameAsPresent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-zinc-200 rounded-full peer-checked:bg-[#120c7a] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#120c7a]/20 transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4"></div>
                    <span className="whitespace-nowrap text-sm font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors">Same as Present Address</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Permanent Pincode" error={errors.permanentPincode} readOnly={readOnly}>
                    <input value={form.permanentPincode} onChange={(event) => handleChange("permanentPincode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent pincode" inputMode="numeric" readOnly={readOnly} />
                  </Field>
                  <Field label="Permanent District" error={errors.permanentDistrict} readOnly={readOnly}>
                    <input value={form.permanentDistrict} onChange={(event) => handleChange("permanentDistrict", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent district" readOnly={readOnly} />
                  </Field>
                  <Field label="Permanent State" error={errors.permanentState} readOnly={readOnly}>
                    <input value={form.permanentState} onChange={(event) => handleChange("permanentState", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent state" readOnly={readOnly} />
                  </Field>
                  <Field label="Permanent City / Town" error={errors.permanentCity} readOnly={readOnly}>
                    <input value={form.permanentCity} onChange={(event) => handleChange("permanentCity", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent city / town" readOnly={readOnly} />
                  </Field>
                </div>
              </div>
            )}
          </Section>

          {(form.status === "Application" || form.status === "Admission") && (
            <>
               <Section title="Application Details" description="Fields mapped from the application form images.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Application No." error={errors.applicationNo} readOnly={readOnly}>
                    <input value={form.applicationNo} onChange={(event) => handleChange("applicationNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Auto-generating..." readOnly={readOnly} />
                  </Field>
                  <Field label="Gender" error={errors.gender} readOnly={readOnly}>
                    <select value={form.gender} onChange={(event) => handleChange("gender", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select gender</option>
                      {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Programme" required={form.status !== "Enquiry" && !readOnly} error={errors.programme} readOnly={readOnly}>
                    <select value={form.programme} onChange={(event) => handleChange("programme", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select programme</option>
                      {Object.keys(durations).map((progKey) => (
                        <option key={progKey} value={progKey}>{formatProgrammeKey(progKey)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Batch" required={form.status !== "Enquiry" && !readOnly} error={errors.batch} readOnly={readOnly}>
                    <select value={form.batch} onChange={(event) => handleChange("batch", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select batch</option>
                      {availableBatches.map((b) => (
                        <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Academic Year" required={form.status !== "Enquiry" && !readOnly} error={errors.academicYear} readOnly={readOnly}>
                    <select value={form.academicYear} onChange={(event) => handleChange("academicYear", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly || !form.batch}>
                      <option value="">Select academic year</option>
                      {availableAcademicYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Student Category" error={errors.studentCategory} readOnly={readOnly}>
                    <select value={form.studentCategory} onChange={(event) => handleChange("studentCategory", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select category</option>
                      {STUDENT_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Seat Category" error={errors.quotaAskedFor} readOnly={readOnly}>
                    <select
                      value={form.quotaAskedFor}
                      onChange={(event) => handleChange("quotaAskedFor", event.target.value)}
                      className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                      disabled={readOnly}
                    >
                      <option value="">Select quota</option>
                      {Array.from(new Set([...quotaOptions, form.quotaAskedFor].filter(Boolean))).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Scholarship Details" error={errors.scholarshipDetails} readOnly={readOnly}>
                    <select value={form.scholarshipDetails} onChange={(event) => handleChange("scholarshipDetails", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select scholarship</option>
                      {scholarships.filter((s) => !s.quota || s.quota === form.quotaAskedFor).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </Field>
                  
                  <Field label="Nationality" error={errors.nationality} readOnly={readOnly}><input value={form.nationality} onChange={(event) => handleChange("nationality", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Nationality" readOnly={readOnly} /></Field>
                  <Field label="Religion" error={errors.religion} readOnly={readOnly}>
                    <select value={form.religion} onChange={(event) => handleChange("religion", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select religion</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Muslim">Muslim</option>
                      <option value="Christian">Christian</option>
                      <option value="others">others</option>
                    </select>
                  </Field>
                  <Field label="Caste" error={errors.caste} readOnly={readOnly}><input value={form.caste} onChange={(event) => handleChange("caste", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Caste" readOnly={readOnly} /></Field>
                  <Field label="Community" required error={errors.community} readOnly={readOnly}>
                    <select value={form.community} onChange={(event) => handleChange("community", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select community</option>
                      {communityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Mother Tongue" error={errors.motherTongue} readOnly={readOnly}><input value={form.motherTongue} onChange={(event) => handleChange("motherTongue", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Mother tongue" readOnly={readOnly} /></Field>
                  <Field label="Blood Group" error={errors.bloodGroup} readOnly={readOnly}><input value={form.bloodGroup} onChange={(event) => handleChange("bloodGroup", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Blood group" readOnly={readOnly} /></Field>
                  <Field label="Marital Status" error={errors.maritalStatus} readOnly={readOnly}>
                    <select value={form.maritalStatus} onChange={(event) => handleChange("maritalStatus", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select status</option>
                      {MARITAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Family / Address Details" description="Use the same detail grid shown in the application form images.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Mother's Name" error={errors.motherName} readOnly={readOnly}><input value={form.motherName} onChange={(event) => handleChange("motherName", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Mother's name" readOnly={readOnly} /></Field>
                  <Field label="Guardian's Name" error={errors.guardianName} readOnly={readOnly}><input value={form.guardianName} onChange={(event) => handleChange("guardianName", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Guardian's name" readOnly={readOnly} /></Field>
                  <Field label="Parent WhatsApp No." error={errors.parentWhatsAppNo} readOnly={readOnly}><input value={form.parentWhatsAppNo} onChange={(event) => handleChange("parentWhatsAppNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Parent WhatsApp number" inputMode="numeric" readOnly={readOnly} /></Field>
                  <Field label="Student WhatsApp No." error={errors.studentWhatsAppNo} readOnly={readOnly}><input value={form.studentWhatsAppNo} onChange={(event) => handleChange("studentWhatsAppNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Student WhatsApp number" inputMode="numeric" readOnly={readOnly} /></Field>
                  <Field label="Age" error={errors.age} readOnly={readOnly}><input value={form.age} onChange={(event) => handleChange("age", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Age" readOnly={readOnly} /></Field>
                </div>
              </Section>

              <Section title="Parent Occupation" description="Fields shown in the second page of the application form.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Father Occupation Sector" error={errors.fatherOccupationSector} readOnly={readOnly}><input value={form.fatherOccupationSector} onChange={(event) => handleChange("fatherOccupationSector", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Govt./Pvt./Self employed" readOnly={readOnly} /></Field>
                  <Field label="Father Organisation / Company" error={errors.fatherOrganisation} readOnly={readOnly}><input value={form.fatherOrganisation} onChange={(event) => handleChange("fatherOrganisation", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Father organisation" readOnly={readOnly} /></Field>
                  <Field label="Father Designation" error={errors.fatherDesignation} readOnly={readOnly}><input value={form.fatherDesignation} onChange={(event) => handleChange("fatherDesignation", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Father designation" readOnly={readOnly} /></Field>
                  <Field label="Father Annual Income" error={errors.fatherAnnualIncome} readOnly={readOnly}><input value={form.fatherAnnualIncome} onChange={(event) => handleChange("fatherAnnualIncome", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Father annual income" readOnly={readOnly} /></Field>
                  <Field label="Mother Occupation Sector" error={errors.motherOccupationSector} readOnly={readOnly}><input value={form.motherOccupationSector} onChange={(event) => handleChange("motherOccupationSector", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Govt./Pvt./Self employed" readOnly={readOnly} /></Field>
                  <Field label="Mother Organisation / Company" error={errors.motherOrganisation} readOnly={readOnly}><input value={form.motherOrganisation} onChange={(event) => handleChange("motherOrganisation", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Mother organisation" readOnly={readOnly} /></Field>
                  <Field label="Mother Designation" error={errors.motherDesignation} readOnly={readOnly}><input value={form.motherDesignation} onChange={(event) => handleChange("motherDesignation", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Mother designation" readOnly={readOnly} /></Field>
                  <Field label="Mother Annual Income" error={errors.motherAnnualIncome} readOnly={readOnly}><input value={form.motherAnnualIncome} onChange={(event) => handleChange("motherAnnualIncome", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Mother annual income" readOnly={readOnly} /></Field>
                  <Field label="Total Annual Income of Family" error={errors.familyAnnualIncome} readOnly={readOnly}><input value={form.familyAnnualIncome} onChange={(event) => handleChange("familyAnnualIncome", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Family annual income" readOnly={readOnly} /></Field>
                  <Field label="Hosteller / Day Scholar" error={errors.hostellerDayScholar} readOnly={readOnly}>
                    <select value={form.hostellerDayScholar} onChange={(event) => handleChange("hostellerDayScholar", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select option</option>
                      {HOSTELLER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Transport / Exam Details" description="Transport, EMIS / UMIS and qualifying exam information.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Transport Facilities Required" error={errors.transportRequired} readOnly={readOnly}>
                    <select value={form.transportRequired} onChange={(event) => handleChange("transportRequired", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select YES / NO</option>
                      {YES_NO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Route" error={errors.transportRoute} readOnly={readOnly || form.transportRequired === 'NO'}><input value={form.transportRoute} onChange={(event) => handleChange("transportRoute", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${readOnly || form.transportRequired === 'NO' ? 'bg-zinc-50 text-zinc-500' : 'bg-white'}`} placeholder="Transport route" readOnly={readOnly || form.transportRequired === 'NO'} /></Field>
                  <Field label="Stage" error={errors.transportStage} readOnly={readOnly || form.transportRequired === 'NO'}><input value={form.transportStage} onChange={(event) => handleChange("transportStage", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${readOnly || form.transportRequired === 'NO' ? 'bg-zinc-50 text-zinc-500' : 'bg-white'}`} placeholder="Transport stage" readOnly={readOnly || form.transportRequired === 'NO'} /></Field>
                  <Field label="EMIS / UMIS No." required={form.status === "Application"} error={errors.emsUmsNo} readOnly={readOnly}><input value={form.emsUmsNo} onChange={(event) => handleChange("emsUmsNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="EMIS / UMIS number" readOnly={readOnly} /></Field>
                  <Field label="Aadhar No." error={errors.aadharNo} readOnly={readOnly}><input value={form.aadharNo} onChange={(event) => handleChange("aadharNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Aadhar number" readOnly={readOnly} /></Field>

                  {[
                    { key: "10th", label: "10th Std" },
                    { key: "11th", label: "11th Std" },
                    { key: "12th", label: "12th Std" },
                    { key: "DipDeg", label: "Diploma / Degree" }
                  ].map((level) => (
                    <div key={level.key} className="col-span-full mt-2 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
                      <h5 className="mb-3 text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-2 flex items-center justify-between">
                        <span>{level.label} Details</span>
                        <span className="text-xs font-normal text-zinc-400">Optional</span>
                      </h5>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        <Field label="Institute" error={errors[`qualifyingExam${level.key}Institute`]} readOnly={readOnly}>
                          <input
                            value={form[`qualifyingExam${level.key}Institute`] || ""}
                            onChange={(event) => handleChange(`qualifyingExam${level.key}Institute`, event.target.value)}
                            className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                            placeholder="Institute name"
                            readOnly={readOnly}
                          />
                        </Field>
                        <Field label="Board / University" error={errors[`qualifyingExam${level.key}Board`]} readOnly={readOnly}>
                          <input
                            value={form[`qualifyingExam${level.key}Board`] || ""}
                            onChange={(event) => handleChange(`qualifyingExam${level.key}Board`, event.target.value)}
                            className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                            placeholder="Board / University"
                            readOnly={readOnly}
                          />
                        </Field>
                        <Field label="Month & Year of Passing" error={errors[`qualifyingExam${level.key}MonthYear`]} readOnly={readOnly}>
                          <div className="flex gap-2">
                            <select
                              value={getMonthFromValue(form[`qualifyingExam${level.key}MonthYear`])}
                              onChange={(event) => handleMonthYearChange(level.key, event.target.value, getYearFromValue(form[`qualifyingExam${level.key}MonthYear`]))}
                              className={`w-1/2 rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                              disabled={readOnly}
                            >
                              <option value="">Month</option>
                              {MONTHS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                            <select
                              value={getYearFromValue(form[`qualifyingExam${level.key}MonthYear`])}
                              onChange={(event) => handleMonthYearChange(level.key, getMonthFromValue(form[`qualifyingExam${level.key}MonthYear`]), event.target.value)}
                              className={`w-1/2 rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                              disabled={readOnly}
                            >
                              <option value="">Year</option>
                              {YEARS.map((y) => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </Field>
                        <Field label="No. of Attempts" error={errors[`qualifyingExam${level.key}Attempts`]} readOnly={readOnly}>
                          <input
                            value={form[`qualifyingExam${level.key}Attempts`] || ""}
                            onChange={(event) => handleChange(`qualifyingExam${level.key}Attempts`, event.target.value)}
                            className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                            placeholder="1"
                            readOnly={readOnly}
                          />
                        </Field>
                        <Field label="% of Marks" error={errors[`qualifyingExam${level.key}Marks`]} readOnly={readOnly}>
                          <input
                            value={form[`qualifyingExam${level.key}Marks`] || ""}
                            onChange={(event) => handleChange(`qualifyingExam${level.key}Marks`, event.target.value)}
                            className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                            placeholder="e.g. 85%"
                            readOnly={readOnly}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Checklist / Documents" description="Upload supporting documents (max 1MB each). Files are uploaded to Firebase Storage.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {DOCUMENT_CHECKLIST.map((checkDoc) => {
                    const existing = form.documents && form.documents[checkDoc.key];
                    return (
                      <div key={checkDoc.key} className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-zinc-700">{checkDoc.label}</span>
                          {!readOnly && existing && (
                            <button type="button" onClick={() => removeDocument(checkDoc.key)} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove</button>
                          )}
                        </div>
                        {existing ? (
                          <div className="space-y-2">
                            <a href={existing.url || existing.data} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-[#120c7a] underline">{existing.name}</a>
                            <div className="text-xs text-zinc-500">{existing._pending ? "Pending upload" : "Uploaded to Firebase Storage"}</div>
                            {!readOnly && (
                              <button type="button" onClick={() => removeDocument(checkDoc.key)} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove</button>
                            )}
                          </div>
                        ) : readOnly ? (
                          <div className="text-sm text-zinc-400">Not provided</div>
                        ) : (
                          <div className="space-y-2">
                            <input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileChange(checkDoc.key, e.target.files && e.target.files[0], e.target)} className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#120c7a] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0f0a66]" />
                            {errors[checkDoc.key] && (
                              <p className="text-xs font-medium text-red-600">{errors[checkDoc.key]}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            </>
          )}

          <Section title="Academic Details" description="Capture school, programme, and admission preferences.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Date of Birth" error={errors.dateOfBirth} readOnly={readOnly}>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => handleChange("dateOfBirth", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  readOnly={readOnly}
                />
              </Field>

              <Field label="School / College" required error={errors.schoolCollege} readOnly={readOnly}>
                <input
                  value={form.schoolCollege}
                  onChange={(event) => handleChange("schoolCollege", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter school or college name"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Medium of Instruction" required error={errors.mediumOfInstruction} readOnly={readOnly}>
                <select
                  value={form.mediumOfInstruction}
                  onChange={(event) => handleChange("mediumOfInstruction", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select medium</option>
                  {MEDIUM_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>

              <Field label="Community" required error={errors.community} readOnly={readOnly}>
                <select
                  value={form.community}
                  onChange={(event) => handleChange("community", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select community</option>
                  {communityOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>

              <Field label="Enquiry For" required error={errors.enquiryFor} readOnly={readOnly}>
                <select
                  value={form.enquiryFor}
                  onChange={(event) => handleChange("enquiryFor", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select enquiry type</option>
                  {Object.keys(durations).map((progKey) => (
                    <option key={progKey} value={formatProgDisplay(progKey)}>{formatProgDisplay(progKey)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Examination Passed / Appeared" required error={errors.examinationPassedAppeared} readOnly={readOnly}>
                <select
                  value={form.examinationPassedAppeared}
                  onChange={(event) => handleChange("examinationPassedAppeared", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select exam</option>
                  {EXAM_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>

              <Field label="Department Interest (Choice 1)" required error={errors.department} readOnly={readOnly}>
                <select
                  value={form.department}
                  onChange={(event) => handleChange("department", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select department</option>
                  {getChoice1Options().map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </Field>

              <Field label="Department Interest (Choice 2)" readOnly={readOnly}>
                <select
                  value={form.department2}
                  onChange={(event) => handleChange("department2", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select department</option>
                  {getChoice2Options().map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </Field>

              <Field label="Department Interest (Choice 3)" readOnly={readOnly}>
                <select
                  value={form.department3}
                  onChange={(event) => handleChange("department3", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select department</option>
                  {getChoice3Options().map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </Field>

              <Field label="Reference, if any" error={errors.reference} readOnly={readOnly}>
                <input
                  value={form.reference}
                  onChange={(event) => handleChange("reference", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter reference details"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Enquiry Attended By" error={errors.enquiryAttendedBy} readOnly={readOnly}>
                <input
                  value={form.enquiryAttendedBy}
                  onChange={(event) => handleChange("enquiryAttendedBy", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter staff/faculty name"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Enquiry Date" required error={errors.enquiryDate} readOnly={readOnly}>
                <input
                  type="text"
                  value={form.enquiryDate}
                  onChange={(event) => handleChange("enquiryDate", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="DD/MM/YYYY"
                  readOnly={readOnly}
                />
              </Field>
            </div>
          </Section>

          {form.examinationPassedAppeared === "+2" && (
            <Section title="Marks and Cutoff" description="Enter subject marks and the cutoff is calculated automatically.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Maths/P/C" required={isCutoffRequired && mode !== "view"} error={errors.mathsMark} readOnly={readOnly}>
                <input
                  value={form.mathsMark}
                  onChange={(event) => handleChange("mathsMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Maths/P/C mark"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Physics/Theory" required={isCutoffRequired && mode !== "view"} error={errors.physicsMark} readOnly={readOnly}>
                <input
                  value={form.physicsMark}
                  onChange={(event) => handleChange("physicsMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Physics/Theory mark"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Chemistry/Lab" required={isCutoffRequired && mode !== "view"} error={errors.chemistryMark} readOnly={readOnly}>
                <input
                  value={form.chemistryMark}
                  onChange={(event) => handleChange("chemistryMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Chemistry/Lab mark"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Total Marks" readOnly={readOnly}>
                <input
                  value={form.totalMarks}
                  onChange={(event) => handleChange("totalMarks", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter total marks"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Cutoff" required={isCutoffRequired && mode !== "view"} error={errors.cutoff} readOnly>
                <input
                  value={displayCutoff}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 outline-none"
                  placeholder="Auto-calculated cutoff"
                  readOnly
                />
              </Field>

              <Field label="Eligibility" error={errors.eligibility} readOnly={readOnly}>
                <select
                  value={form.eligibility}
                  onChange={(event) => handleChange("eligibility", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select eligibility</option>
                  {ELIGIBILITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>
          )}

          {(form.status === "Application" || form.status === "Admission") && (
            <Section title="Payment Details" description="Multiple fee payments.">
              {(form.payments || []).map((payment, index) => (
                <div key={index} className="mb-6 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="bg-white px-3 py-1 text-xs font-semibold text-[#120c7a] border border-[#120c7a]/20 rounded-full inline-block shrink-0">
                      Payment {index + 1}
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {showReceipt && payment.feeCategory && payment.feeAmount && (
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(payment, index)}
                          className="flex items-center gap-1.5 bg-white text-[#120c7a] border border-[#120c7a]/20 rounded-full px-3 py-1 hover:bg-[#120c7a]/5 transition-colors text-xs font-semibold"
                          title="Download Receipt"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download Receipt
                        </button>
                      )}
                      {!readOnly && (form.payments.length > 1) && (
                        <button
                          type="button"
                          onClick={() => removePayment(index)}
                          className="bg-white text-red-500 border border-red-200 rounded-full p-1.5 hover:bg-red-50 transition-colors"
                          title="Remove this payment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <Field label="Fee Category" required error={errors[`payment_${index}_feeCategory`]} readOnly={readOnly}>
                      <select value={payment.feeCategory} onChange={(event) => handlePaymentChange(index, "feeCategory", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                        <option value="">Select fee category</option>
                        {feeCategoriesOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Minimum Fee (₹)" required error={errors[`payment_${index}_feeAmount`]} readOnly={readOnly}>
                      <input type="number" value={payment.feeAmount} onChange={(event) => handlePaymentChange(index, "feeAmount", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Enter amount" readOnly={readOnly} />
                    </Field>
                    <Field label="Payment Mode" required error={errors[`payment_${index}_paymentMode`]} readOnly={readOnly}>
                      <select value={payment.paymentMode} onChange={(event) => handlePaymentChange(index, "paymentMode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                        <option value="">Select mode</option>
                        {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Date of Payment" required error={errors[`payment_${index}_paymentDate`]} readOnly={readOnly}>
                      <input type="text" value={payment.paymentDate} onChange={(event) => handlePaymentChange(index, "paymentDate", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="DD/MM/YYYY" readOnly={readOnly} />
                    </Field>
                    {payment.paymentMode === "pay_online" && (
                      <Field label="UTR Number" required={payment.paymentMode === "pay_online"} error={errors[`payment_${index}_upiNumber`]} readOnly={readOnly}>
                        <input value={payment.upiNumber} onChange={(event) => handlePaymentChange(index, "upiNumber", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Enter UTR Number" readOnly={readOnly} />
                      </Field>
                    )}
                  </div>
                </div>
              ))}
              {!readOnly && (
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={addPayment}
                    className="flex items-center gap-2 text-sm font-semibold text-[#120c7a] hover:text-[#211a9c] transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Payment
                  </button>
                  
                  {showReceipt && form.payments && form.payments.length > 1 && form.payments.some(p => parseFloat(p.feeAmount) > 0) && (
                    <button
                      type="button"
                      onClick={handleDownloadConsolidatedReceipt}
                      className="flex items-center gap-2 bg-[#120c7a] hover:bg-[#1a148a] text-white px-4 py-2 rounded-xl shadow-sm transition-all text-sm font-semibold ml-auto"
                    >
                      <Download className="h-4 w-4" />
                      Consolidated Receipt
                    </button>
                  )}
                </div>
              )}
              {showReceipt && readOnly && form.payments && form.payments.length > 1 && form.payments.some(p => parseFloat(p.feeAmount) > 0) && (
                 <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleDownloadConsolidatedReceipt}
                      className="flex items-center gap-2 bg-[#120c7a] hover:bg-[#1a148a] text-white px-4 py-2 rounded-xl shadow-sm transition-all text-sm font-semibold"
                    >
                      <Download className="h-4 w-4" />
                      Consolidated Receipt
                    </button>
                 </div>
              )}
            </Section>
          )}

          {Object.keys(errors).length > 0 && !readOnly && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-bold mb-1">Please fix the following issues before saving:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {Object.entries(errors).map(([key, msg]) => (
                  <li key={key}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            {readOnly && (
              <button
                type="button"
                onClick={() => exportPdf(form)}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                Export PDF
              </button>
            )}
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#120c7a] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#0f0a66] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : mode === "edit" ? "Update Enquiry" : "Create Enquiry"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 md:p-5">
      <div className="mb-4">
        <h4 className="text-base font-bold text-zinc-900">{title}</h4>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, required = false, error = "", readOnly = false, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-zinc-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : readOnly ? <span className="mt-1 block text-xs text-zinc-400">Read only in view mode</span> : null}
    </label>
  );
}
