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
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, sanitizeKey, formatProgDisplay, formatDepartmentDisplay } from "../lib/utils";
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
  if (!isoDate) return "";
  
  if (typeof isoDate === "number" || isoDate instanceof Date) {
    const dObj = new Date(isoDate);
    if (!isNaN(dObj.getTime())) {
      const day = String(dObj.getDate()).padStart(2, "0");
      const month = String(dObj.getMonth() + 1).padStart(2, "0");
      const year = dObj.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }

  const str = String(isoDate).trim();
  if (str.includes("-")) {
    const parts = str.split("T")[0].split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
  }

  return str;
};

const formatDisplayToISO = (displayDate) => {
  if (!displayDate) return "";
  const str = String(displayDate).trim();
  if (!str.includes('/')) return str;
  const [d, m, y] = str.split('/');
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
      mathsMark: initialValues?.mathsMark ?? initialValues?.maths ?? initialValues?.math ?? initialValues?.hscMaths ?? initialValues?.mMark ?? "",
      physicsMark: initialValues?.physicsMark ?? initialValues?.physics ?? initialValues?.hscPhysics ?? initialValues?.pMark ?? "",
      chemistryMark: initialValues?.chemistryMark ?? initialValues?.chemistry ?? initialValues?.hscChemistry ?? initialValues?.cMark ?? "",
      totalMarks: initialValues?.totalMarks ?? initialValues?.total ?? initialValues?.totalMark ?? initialValues?.hscTotal ?? "",
      cutoff: initialValues?.cutoff ?? initialValues?.cutoffMark ?? initialValues?.cutoffMarks ?? "",
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
    const v = (val) => (val !== null && val !== undefined && String(val).trim() !== "" ? String(val).trim() : "-");

    const documentTitle = (enq.status === "Application" || enq.status === "Admission")
      ? `Admission Application - ${enq.applicationNo || enq.enquiryId || "N/A"}`
      : `Admission Enquiry - ${enq.enquiryId || enq.applicationNo || ""}`;

      // Document upload detection helper - strictly checks uploaded document attachments
      const isDocUploaded = (itemKey) => {
        const docs = enq.documents || {};
        const isFilePresent = (val) => {
          if (!val) return false;
          if (typeof val === "object") return Boolean(val.url || val.name || val.base64);
          if (typeof val === "string") return val.trim().length > 0 && !val.includes("N/A");
          return false;
        };

        switch (itemKey) {
          case 'tenth':
            return isFilePresent(docs.tenthMarkSheet) || isFilePresent(docs['10thMarkSheet']);
          case 'eleventh':
            return isFilePresent(docs.eleventhMarkSheet) || isFilePresent(docs['11thMarkSheet']);
          case 'twelfth':
            return isFilePresent(docs.twelfthMarkSheet) || isFilePresent(docs['12thMarkSheet']);
          case 'diplomaSem':
            return isFilePresent(docs.diplomaSemesterMarkSheets) || isFilePresent(docs.diplomaMarkSheet);
          case 'diplomaCons':
            return isFilePresent(docs.diplomaConsolidatedMarkSheet);
          case 'diplomaProv':
            return isFilePresent(docs.diplomaProvisionalCertificate);
          case 'diplomaCert':
            return isFilePresent(docs.diplomaCertificate);
          case 'ugSem':
            return isFilePresent(docs.ugSemesterMarkSheets);
          case 'ugCons':
            return isFilePresent(docs.ugConsolidatedMarkSheet);
          case 'ugProv':
            return isFilePresent(docs.ugProvisionalCertificate);
          case 'ugDegree':
            return isFilePresent(docs.ugDegreeCertificate);
          case 'community':
            return isFilePresent(docs.communityCertificate);
          case 'income':
            return isFilePresent(docs.incomeCertificate);
          case 'nativity':
            return isFilePresent(docs.nativityCertificate);
          case 'transfer':
            return isFilePresent(docs.transferCertificate);
          case 'migration':
            return isFilePresent(docs.migrationCertificate);
          case 'equivalency':
            return isFilePresent(docs.equivalencyCertificate);
          case 'photo':
            return isFilePresent(docs.photo) || isFilePresent(docs.passportPhoto);
          case 'firstGrad':
            return isFilePresent(docs.firstGraduateCertificate);
          case 'jointDecl':
            return isFilePresent(docs.jointDeclarationForm) || isFilePresent(docs.jointDeclarationFormFG);
          case 'aadhar':
            return isFilePresent(docs.aadharCopy) || isFilePresent(docs.aadhaarCopy);
          default:
            return false;
        }
      };

      const checklistItems = [
        { no: 1, name: "10th Mark Sheet", key: "tenth" },
        { no: 2, name: "11th Mark Sheet", key: "eleventh" },
        { no: 3, name: "12th Mark Sheet", key: "twelfth" },
        { no: 4, name: "Diploma Semester Mark Sheets", key: "diplomaSem" },
        { no: 5, name: "Diploma Consolidated Mark Sheet", key: "diplomaCons" },
        { no: 6, name: "Diploma Provisional Certificate", key: "diplomaProv" },
        { no: 7, name: "Diploma Certificate", key: "diplomaCert" },
        { no: 8, name: "UG Semester Mark Sheets", key: "ugSem" },
        { no: 9, name: "UG Consolidated Mark Sheet", key: "ugCons" },
        { no: 10, name: "UG Provisional Certificate", key: "ugProv" },
        { no: 11, name: "UG Degree Certificate", key: "ugDegree" },
        { no: 12, name: "Community Certificate", key: "community" },
        { no: 13, name: "Income Certificate", key: "income" },
        { no: 14, name: "Nativity Certificate", key: "nativity" },
        { no: 15, name: "Transfer Certificate", key: "transfer" },
        { no: 16, name: "Migration Certificate", key: "migration" },
        { no: 17, name: "Equivalency Certificate", key: "equivalency" },
        { no: 18, name: "Passport Size Photograph", key: "photo" },
        { no: 19, name: "First Graduate Certificate", key: "firstGrad" },
        { no: 20, name: "Joint Declaration Form (FG)", key: "jointDecl" },
        { no: 21, name: "Aadhaar Card Copy", key: "aadhar" }
      ];

      const totalSubmittedDocs = checklistItems.filter(item => isDocUploaded(item.key)).length;

      const quotaVal = (enq.seatCategory || enq.quotaAskedFor || enq.quota || "").toLowerCase();
      const isManagement = quotaVal.includes("management") || quotaVal.includes("mq");
      const isGovernment = quotaVal.includes("government") || quotaVal.includes("gq");
      const isScholarship = quotaVal.includes("scholarship");

      const generateHtml = (logoDataUrl) => {
        const logoImg = logoDataUrl || "/logo.png";
        const studentNameDisplay = enq.studentName || [enq.firstName, enq.lastName].filter(Boolean).join(" ") || enq.name || "-";
        const presentAddressDisplay = [enq.presentHouseNo, enq.presentStreet, enq.presentLocality, enq.presentCity].filter(Boolean).join(", ") || enq.presentAddress || enq.address || "-";
        const permanentAddressDisplay = [enq.permanentCity, enq.permanentDistrict, enq.permanentState].filter(Boolean).join(", ") || enq.permanentAddress || "-";

        const mathsVal = enq.mathsMark || enq.maths || enq.math || enq.hscMaths || enq.mMark || "";
        const physicsVal = enq.physicsMark || enq.physics || enq.hscPhysics || enq.pMark || "";
        const chemistryVal = enq.chemistryMark || enq.chemistry || enq.hscChemistry || enq.cMark || "";

        const mNum = parseFloat(mathsVal) || 0;
        const pNum = parseFloat(physicsVal) || 0;
        const cNum = parseFloat(chemistryVal) || 0;

        const calcTotal = (mNum || pNum || cNum) ? (mNum + pNum + cNum) : "";
        const totalVal = enq.totalMarks || enq.totalMark || enq.total || enq.hscTotal || (calcTotal ? String(calcTotal) : "");

        const calcCutoff = (mNum || pNum || cNum) ? (mNum + pNum / 2 + cNum / 2) : "";
        const cutoffVal = enq.cutoff || enq.cutoffMark || enq.cutoffMarks || (calcCutoff ? String(Number(calcCutoff.toFixed(2))) : "");

        return `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; font-size: 9.5px; line-height: 1.25; }
          .page { width: 210mm; height: 297mm; padding: 5mm 10mm 12mm 10mm; margin: 0 auto; position: relative; page-break-after: always; page-break-inside: avoid; background: #fff; overflow: hidden; }
          .page:last-child { page-break-after: avoid; }
          
          /* Top Wave Header Banner */
          .top-banner-bar { height: 10mm; background: #192a56; margin: -5mm -10mm 6mm -10mm; clip-path: ellipse(80% 100% at 50% 0%); }

          .header-table { width: 100%; margin-bottom: 4px; border-collapse: collapse; }
          .header-logo-cell { width: 62%; vertical-align: middle; }
          .header-logo-cell img { max-height: 50px; max-width: 100%; object-fit: contain; }
          
          .header-appl-cell { width: 38%; vertical-align: middle; }
          .appl-for-box { border: 1.5px solid #192a56; border-radius: 10px; background: #f0f4ff; padding: 5px 8px; text-align: center; }
          .appl-for-box .title { font-size: 11px; font-weight: 800; color: #192a56; text-transform: uppercase; letter-spacing: 0.5px; }
          .appl-for-box .subtitle { font-size: 9.5px; font-weight: bold; color: #192a56; margin-top: 2px; }

          .capital-banner { background: #192a56; color: #fff; text-align: center; font-weight: bold; font-size: 9px; padding: 3.5px 0; border-radius: 8px; margin: 5px 0 6px 0; letter-spacing: 0.5px; }
          .appl-no-row { display: flex; justify-content: flex-end; margin-bottom: 5px; }
          .appl-no-box { border: 1.5px solid #192a56; padding: 3px 12px; font-weight: bold; font-size: 10px; color: #192a56; min-width: 220px; text-align: left; background: #fff; }

          /* Main Table Styling */
          table.form-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed; }
          table.form-table td, table.form-table th { border: 1px solid #333; padding: 3.5px 5px; vertical-align: middle; word-wrap: break-word; }
          
          .col-num { width: 24px; text-align: center; font-weight: bold; background: #f8f9fa; font-size: 9px; color: #192a56; }
          .col-label { font-weight: bold; color: #222; width: 31%; font-size: 9px; }
          .col-val-text { font-weight: 600; color: #1a237e; font-size: 9.5px; }

          .photo-cell { width: 105px; padding: 2px !important; text-align: center; vertical-align: middle !important; background: #fff; }
          .photo-inner-box { width: 100px; height: 118px; border: 1.5px solid #192a56; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8px; color: #666; font-weight: bold; background: #fafafa; margin: 0 auto; overflow: hidden; }
          .photo-inner-box img { width: 100%; height: 100%; object-fit: cover; }

          /* Page Footer */
          .page-footer { position: absolute; bottom: 4mm; left: 10mm; right: 10mm; height: 6mm; display: flex; align-items: center; justify-content: space-between; font-size: 8.5px; font-weight: bold; color: #444; border-top: 1px solid #ccc; padding-top: 3px; }
          .page-number-circle { width: 19px; height: 19px; border-radius: 50%; background: #192a56; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 9.5px; }

          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { page-break-after: always; page-break-inside: avoid; margin: 0; padding: 5mm 10mm 12mm 10mm; width: 210mm; height: 297mm; overflow: hidden; }
          }
        </style>
      </head>
      <body>

        <!-- PAGE 1 -->
        <div class="page">
          <div class="top-banner-bar"></div>
          
          <table class="header-table">
            <tr>
              <td class="header-logo-cell">
                ${logoImg ? `<img src="${logoImg}" alt="CKCET Logo" />` : ""}
              </td>
              <td class="header-appl-cell">
                <div class="appl-for-box">
                  <div class="title">APPLICATION FOR</div>
                  <div class="subtitle">${v(enq.programme)} for the AY ${v(enq.academicYear)}</div>
                </div>
              </td>
            </tr>
          </table>

          <div class="capital-banner">(TO BE FILLED IN CAPITAL LETTERS)</div>
          
          <div class="appl-no-row">
            <div class="appl-no-box">Appl.No. &nbsp;&nbsp;<span style="color:#000;font-size:11px;font-weight:bold">${v(enq.applicationNo || enq.enquiryId)}</span></div>
          </div>

          <table class="form-table">
            <tr>
              <td class="col-num">1</td>
              <td class="col-label">Title</td>
              <td class="col-val-text">${v(enq.title)}</td>
              <td rowspan="6" class="photo-cell">
                <div class="photo-inner-box">
                  ${enq.documents?.photo?.url ? `<img src="${enq.documents.photo.url}" alt="Student Photo" />` : "Affix Passport Size Photo"}
                </div>
              </td>
            </tr>
            <tr>
              <td class="col-num">2</td>
              <td class="col-label">Name of the Student <br/><span style="font-size:7.5px;font-weight:normal;color:#555">(As per SSLC mark sheet)</span></td>
              <td class="col-val-text" style="font-size:10px;color:#000;font-weight:bold">${studentNameDisplay}</td>
            </tr>
            <tr>
              <td class="col-num">3</td>
              <td class="col-label">Aadhaar Number</td>
              <td class="col-val-text">${v(enq.aadharNo || enq.aadhaarNo || enq.aadhar)}</td>
            </tr>
            <tr>
              <td class="col-num">4</td>
              <td class="col-label">Date of Birth</td>
              <td class="col-val-text">${v(formatDateToDisplay(enq.dateOfBirth))} ${enq.age ? `(Age: ${v(enq.age)})` : ''}</td>
            </tr>
            <tr>
              <td class="col-num">5</td>
              <td class="col-label">Gender</td>
              <td class="col-val-text">${v(enq.gender)}</td>
            </tr>
            <tr>
              <td class="col-num">6</td>
              <td class="col-label">Programme</td>
              <td class="col-val-text">${v(enq.programme)}</td>
            </tr>
            <tr>
              <td class="col-num">7</td>
              <td class="col-label">Branch Name <br/><span style="font-size:7.5px;font-weight:normal;color:#555">(In case of UG Admission)</span></td>
              <td class="col-val-text" colspan="2">
                Choice (1): <strong>${v(formatDepartmentDisplay(enq.department))}</strong> &nbsp;|&nbsp; 
                (2): <strong>${v(formatDepartmentDisplay(enq.department2))}</strong> &nbsp;|&nbsp; 
                (3): <strong>${v(formatDepartmentDisplay(enq.department3))}</strong>
              </td>
            </tr>
            <tr>
              <td class="col-num">8</td>
              <td class="col-label">Year of Admission</td>
              <td class="col-val-text" colspan="2">${v(enq.academicYear || enq.batch)}</td>
            </tr>
            <tr>
              <td class="col-num">9</td>
              <td class="col-label">Student Category</td>
              <td class="col-val-text" colspan="2">${v(enq.studentCategory || enq.category || 'Regular')}</td>
            </tr>
            <tr>
              <td class="col-num">10</td>
              <td class="col-label">Year</td>
              <td class="col-val-text" colspan="2">${v(enq.year || 'I Year')}</td>
            </tr>
            <tr>
              <td class="col-num">11</td>
              <td class="col-label">Seat Category / Scholarship Details</td>
              <td class="col-val-text" colspan="2">
                ${v(enq.seatCategory || enq.quotaAskedFor || enq.quota)} 
                ${enq.scholarshipDetails || enq.scholarship ? ` | Scholarship: ${v(enq.scholarshipDetails || enq.scholarship)}` : ''}
              </td>
            </tr>
            <tr>
              <td class="col-num">12</td>
              <td class="col-label">Nationality</td>
              <td class="col-val-text" colspan="2">${v(enq.nationality || 'Indian')}</td>
            </tr>
            <tr>
              <td class="col-num">13</td>
              <td class="col-label">Religion</td>
              <td class="col-val-text" colspan="2">${v(enq.religion)}</td>
            </tr>
            <tr>
              <td class="col-num">14</td>
              <td class="col-label">Community</td>
              <td class="col-val-text" colspan="2">${v(enq.community)}</td>
            </tr>
            <tr>
              <td class="col-num">15</td>
              <td class="col-label">Caste</td>
              <td class="col-val-text" colspan="2">${v(enq.caste)}</td>
            </tr>
            <tr>
              <td class="col-num">16</td>
              <td class="col-label">Mother tongue</td>
              <td class="col-val-text" colspan="2">${v(enq.motherTongue)}</td>
            </tr>
            <tr>
              <td class="col-num">17</td>
              <td class="col-label">Blood group</td>
              <td class="col-val-text" colspan="2">${v(enq.bloodGroup)}</td>
            </tr>
            <tr>
              <td class="col-num">18</td>
              <td class="col-label">Personal Marks of Identification</td>
              <td class="col-val-text" colspan="2">
                1. ${v(enq.identificationMark1)} <br/>
                2. ${v(enq.identificationMark2)}
              </td>
            </tr>
            <tr>
              <td class="col-num">19</td>
              <td class="col-label">Medium of Instruction in the School or College last Studied</td>
              <td class="col-val-text" colspan="2">${v(enq.mediumOfInstruction)}</td>
            </tr>
            <tr>
              <td class="col-num">20</td>
              <td class="col-label">Marital Status</td>
              <td class="col-val-text" colspan="2">${v(enq.maritalStatus)}</td>
            </tr>
            <tr>
              <td class="col-num">21</td>
              <td class="col-label">Father's Name <br/><span style="font-size:7.5px;font-weight:normal;color:#555">(As per transfer certificate)</span></td>
              <td class="col-val-text" colspan="2">${v(enq.fatherGuardianName || enq.fatherName)}</td>
            </tr>
            <tr>
              <td class="col-num">22</td>
              <td class="col-label">Mother's Name</td>
              <td class="col-val-text" colspan="2">${v(enq.motherName)}</td>
            </tr>
            <tr>
              <td class="col-num">23</td>
              <td class="col-label">Guardian's Name</td>
              <td class="col-val-text" colspan="2">${v(enq.guardianName)}</td>
            </tr>
          </table>

          <!-- Parent's Occupation Table on Page 1 -->
          <table class="form-table">
            <tr>
              <td class="col-num" rowspan="7">24</td>
              <td class="col-label" style="text-align:center;background:#f0f4ff">Parent's Occupation</td>
              <td style="text-align:center;font-weight:bold;background:#f0f4ff;width:35%">Father</td>
              <td style="text-align:center;font-weight:bold;background:#f0f4ff;width:35%">Mother</td>
            </tr>
            <tr>
              <td class="col-label">Salaried / Self Employed</td>
              <td class="col-val-text">${v(enq.parentOccupation)}</td>
              <td class="col-val-text">${v(enq.motherOccupation)}</td>
            </tr>
            <tr>
              <td class="col-label">Sector (Govt./Pvt.)</td>
              <td class="col-val-text">${v(enq.fatherOccupationSector)}</td>
              <td class="col-val-text">${v(enq.motherOccupationSector)}</td>
            </tr>
            <tr>
              <td class="col-label">Organisation / Company</td>
              <td class="col-val-text">${v(enq.fatherOrganisation)}</td>
              <td class="col-val-text">${v(enq.motherOrganisation)}</td>
            </tr>
            <tr>
              <td class="col-label">Designation</td>
              <td class="col-val-text">${v(enq.fatherDesignation)}</td>
              <td class="col-val-text">${v(enq.motherDesignation)}</td>
            </tr>
            <tr>
              <td class="col-label">Annual Income</td>
              <td class="col-val-text">${v(enq.fatherAnnualIncome)}</td>
              <td class="col-val-text">${v(enq.motherAnnualIncome)}</td>
            </tr>
            <tr>
              <td class="col-label">Total Annual Income of Family</td>
              <td class="col-val-text" colspan="2" style="font-size:10px;color:#192a56"><strong>₹ ${v(enq.familyAnnualIncome)}</strong></td>
            </tr>
          </table>

          <div class="page-footer">
            <div>Form No. AD01/Rev No 00 &nbsp;&nbsp;.</div>
            <div>Effective Date: 01/08/2021</div>
            <div>(P.T.O)</div>
            <div class="page-number-circle">1</div>
          </div>
        </div>

        <!-- PAGE 2 -->
        <div class="page">
          <div class="top-banner-bar"></div>
          <div style="height: 2mm;"></div>

          <table class="form-table">
            <tr>
              <td class="col-num" rowspan="7">25</td>
              <td style="text-align:center;font-weight:bold;background:#192a56;color:#fff;width:48%">Present Address</td>
              <td style="text-align:center;font-weight:bold;background:#192a56;color:#fff;width:48%">Permanent Address</td>
            </tr>
            <tr>
              <td class="col-val-text" style="height:40px;vertical-align:top">${presentAddressDisplay}</td>
              <td class="col-val-text" style="height:40px;vertical-align:top">${permanentAddressDisplay}</td>
            </tr>
            <tr>
              <td>Pincode &nbsp;&nbsp;: <strong>${v(enq.presentPincode)}</strong></td>
              <td>Pincode &nbsp;&nbsp;: <strong>${v(enq.permanentPincode)}</strong></td>
            </tr>
            <tr>
              <td>District &nbsp;&nbsp;: <strong>${v(enq.presentDistrict)}</strong></td>
              <td>District &nbsp;&nbsp;: <strong>${v(enq.permanentDistrict)}</strong></td>
            </tr>
            <tr>
              <td>State &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${v(enq.presentState)}</strong></td>
              <td>State &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${v(enq.permanentState)}</strong></td>
            </tr>
            <tr>
              <td>Country &nbsp;: <strong>${v(enq.presentCountry || 'India')}</strong></td>
              <td>Country &nbsp;: <strong>${v(enq.permanentCountry || 'India')}</strong></td>
            </tr>
            <tr>
              <td>Location of Residence : <strong>${v(enq.locationOfResidence || 'Urban')}</strong></td>
              <td>Location of Residence : <strong>${v(enq.locationOfResidence || 'Urban')}</strong></td>
            </tr>
          </table>

          <table class="form-table">
            <tr>
              <td class="col-num">31</td>
              <td class="col-label">Parent's Mobile No. (Father / Mother)</td>
              <td class="col-val-text">(F) <strong>${v(enq.parentMobile)}</strong> &nbsp;&nbsp;&nbsp; (M) <strong>${v(enq.motherMobile)}</strong></td>
            </tr>
            <tr>
              <td class="col-num">32</td>
              <td class="col-label">Parent's WhatsApp No. (Father / Mother)</td>
              <td class="col-val-text">(F) <strong>${v(enq.parentWhatsAppNo)}</strong></td>
            </tr>
            <tr>
              <td class="col-num">33</td>
              <td class="col-label">Student's Mobile No.</td>
              <td class="col-val-text"><strong>${v(enq.mobile || enq.phone || enq.mobileNo)}</strong></td>
            </tr>
            <tr>
              <td class="col-num">34</td>
              <td class="col-label">Student's WhatsApp No.</td>
              <td class="col-val-text"><strong>${v(enq.studentWhatsAppNo)}</strong></td>
            </tr>
            <tr>
              <td class="col-num">35</td>
              <td class="col-label">Email ID &nbsp;|&nbsp; Hosteller / Day scholar</td>
              <td class="col-val-text">
                Email: <strong>${v(enq.emailId || enq.email)}</strong> &nbsp;|&nbsp; 
                Residence: <strong>${v(enq.hostellerDayScholar)}</strong>
              </td>
            </tr>
            <tr>
              <td class="col-num">36</td>
              <td class="col-label">Transport Facilities Required</td>
              <td class="col-val-text">
                Required: <strong>${v(enq.transportRequired || (enq.transportRoute ? 'YES' : 'NO'))}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; 
                Route: <strong>${v(enq.transportRoute)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; 
                Stage: <strong>${v(enq.transportStage)}</strong>
              </td>
            </tr>
            <tr>
              <td class="col-num">37</td>
              <td class="col-label">EMIS / UMIS No.</td>
              <td class="col-val-text"><strong>${v(enq.emsUmsNo || enq.emisNo || enq.umisNo || enq.emisUmisNo)}</strong></td>
            </tr>
          </table>

          <table class="form-table">
            <tr>
              <td class="col-num" rowspan="6">38</td>
              <td colspan="6" class="col-label" style="background:#f0f4ff">Details of Qualifying Examinations Passed:</td>
            </tr>
            <tr style="text-align:center;font-weight:bold;background:#f8f9fa">
              <td style="width:18%">Programme</td>
              <td style="width:30%">Institute</td>
              <td style="width:20%">Board / University</td>
              <td style="width:14%">Month & Year of Passing</td>
              <td style="width:8%">No. of Attempts</td>
              <td style="width:10%">% of Marks</td>
            </tr>
            <tr>
              <td style="font-weight:bold">10th Std</td>
              <td class="col-val-text">${v(enq.qualifyingExam10thInstitute)}</td>
              <td class="col-val-text">${v(enq.qualifyingExam10thBoard)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam10thMonthYear)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam10thAttempts)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam10thMarks)}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">11th Std</td>
              <td class="col-val-text">${v(enq.qualifyingExam11thInstitute)}</td>
              <td class="col-val-text">${v(enq.qualifyingExam11thBoard)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam11thMonthYear)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam11thAttempts)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam11thMarks)}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">12th Std</td>
              <td class="col-val-text">${v(enq.qualifyingExam12thInstitute || enq.schoolCollege)}</td>
              <td class="col-val-text">${v(enq.qualifyingExam12thBoard)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam12thMonthYear)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam12thAttempts)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExam12thMarks)}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">Diploma / Degree</td>
              <td class="col-val-text">${v(enq.qualifyingExamDipDegInstitute)}</td>
              <td class="col-val-text">${v(enq.qualifyingExamDipDegBoard)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExamDipDegMonthYear)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExamDipDegAttempts)}</td>
              <td class="col-val-text" style="text-align:center">${v(enq.qualifyingExamDipDegMarks)}</td>
            </tr>
          </table>

          <div style="font-weight:bold;font-size:10px;color:#192a56;margin:6px 0 4px">39. Marks in Qualifying Examination for B.E / B.Tech</div>
          <table class="form-table">
            <tr style="text-align:center;font-weight:bold;background:#f8f9fa">
              <td style="width:30%">Subject</td>
              <td style="width:20%">Maximum Marks</td>
              <td style="width:25%">Marks Obtained</td>
              <td style="width:25%">Percentage of Marks</td>
            </tr>
            <tr>
              <td style="font-weight:bold">Maths</td>
              <td style="text-align:center">100</td>
              <td class="col-val-text" style="text-align:center"><strong>${v(mathsVal)}</strong></td>
              <td class="col-val-text" style="text-align:center">${mathsVal ? v(mathsVal) + '%' : '-'}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">Physics</td>
              <td style="text-align:center">100</td>
              <td class="col-val-text" style="text-align:center"><strong>${v(physicsVal)}</strong></td>
              <td class="col-val-text" style="text-align:center">${physicsVal ? v(physicsVal) + '%' : '-'}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">Chemistry</td>
              <td style="text-align:center">100</td>
              <td class="col-val-text" style="text-align:center"><strong>${v(chemistryVal)}</strong></td>
              <td class="col-val-text" style="text-align:center">${chemistryVal ? v(chemistryVal) + '%' : '-'}</td>
            </tr>
            <tr style="background:#f0f4ff">
              <td style="font-weight:bold;color:#192a56">Total Marks & Cutoff</td>
              <td style="text-align:center;font-weight:bold">300</td>
              <td class="col-val-text" style="text-align:center;font-size:10px;color:#192a56"><strong>Total: ${v(totalVal)}</strong></td>
              <td class="col-val-text" style="text-align:center;font-size:10px;color:#192a56"><strong>Cutoff: ${v(cutoffVal)}</strong></td>
            </tr>
          </table>

          ${(Array.isArray(enq.payments) && enq.payments.length > 0) ? `
          <table class="form-table">
            <tr style="background:#f0f4ff;font-weight:bold;text-align:center">
              <td>#</td>
              <td>Fee Category</td>
              <td>Amount (₹)</td>
              <td>Payment Date</td>
              <td>Payment Mode</td>
            </tr>
            ${enq.payments.map((p, i) => `
              <tr>
                <td style="text-align:center;font-weight:bold">${i + 1}</td>
                <td class="col-val-text">${v(p.feeCategory)}</td>
                <td class="col-val-text" style="text-align:right"><strong>₹ ${v(p.feeAmount)}</strong></td>
                <td class="col-val-text" style="text-align:center">${v(formatDateToDisplay(p.paymentDate))}</td>
                <td class="col-val-text">${p.paymentMode === "pay_online" ? "Online (UTR: " + v(p.upiNumber) + ")" : "Hand / Cash"}</td>
              </tr>
            `).join("")}
          </table>
          ` : ''}

          <!-- Signatures Section -->
          <div style="margin-top: 18px; display: flex; justify-content: space-between; padding: 0 15px; font-weight: bold; font-size: 9px; color: #222;">
            <div style="text-align: center; width: 42%;">
              <div style="height: 25px;"></div>
              <div style="border-top: 1px dashed #444; padding-top: 3px;">Signature of the Parent / Guardian</div>
            </div>
            <div style="text-align: center; width: 42%;">
              <div style="height: 25px;"></div>
              <div style="border-top: 1px dashed #444; padding-top: 3px;">Signature of the Candidate</div>
            </div>
          </div>

          <!-- Office Use Box -->
          <div style="margin-top: 14px; border: 1.5px solid #192a56; border-radius: 4px; padding: 6px 10px; position: relative; background: #fafafa; height: 60px;">
            <div style="position: absolute; top: -8px; left: 10px; background: #192a56; color: #fff; padding: 1px 8px; font-size: 8px; font-weight: bold; border-radius: 3px;">
              FOR OFFICE USE
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:9px;color:#333">
              <div>Admitted Department: <strong>${v(formatDepartmentDisplay(enq.department))}</strong></div>
              <div>Quota: <strong>${v(enq.seatCategory || enq.quotaAskedFor)}</strong></div>
              <div>Verification Status: <strong>Verified & Checked</strong></div>
            </div>
          </div>

          <div class="page-footer">
            <div>Form No. AD01/Rev No 00</div>
            <div>Effective Date: 01/08/2021</div>
            <div>(P.T.O)</div>
            <div class="page-number-circle">2</div>
          </div>
        </div>

        <!-- PAGE 3: CHECK LIST & OFFICE USE ONLY -->
        <div class="page">
          <div class="top-banner-bar"></div>
          
          <div style="text-align:center;margin-bottom:4px">
            <span style="background:#192a56;color:#fff;font-weight:bold;font-size:11px;padding:3px 18px;border-radius:4px;letter-spacing:0.5px">CHECK LIST</span>
            <div style="font-size:8px;font-style:italic;color:#444;margin-top:3px">(Please mark the relevant boxes against the items which are enclosed along with the application)</div>
          </div>

          <table class="form-table" style="margin-bottom:6px">
            <thead>
              <tr style="background:#f8f9fa;text-align:center;font-weight:bold;color:#192a56">
                <th style="width:7%;padding:3px 2px">Sl.No.</th>
                <th style="width:48%;text-align:left;padding:3px 6px">Item</th>
                <th style="width:15%;padding:3px 2px">Original</th>
                <th style="width:15%;padding:3px 2px">Photocopy</th>
                <th style="width:15%;padding:3px 2px">Attested Copy</th>
              </tr>
            </thead>
            <tbody>
              ${checklistItems.map(item => {
                const uploaded = isDocUploaded(item.key);
                return `
                  <tr>
                    <td style="text-align:center;font-weight:bold;font-size:8.5px">${item.no}</td>
                    <td style="font-weight:600;color:#222;font-size:8.5px">${item.name}</td>
                    <td style="text-align:center"></td>
                    <td style="text-align:center;font-size:12px;font-weight:bold;color:#192a56">${uploaded ? "✓" : ""}</td>
                    <td style="text-align:center"></td>
                  </tr>
                `;
              }).join("")}
              <tr style="background:#f0f4ff;font-weight:bold">
                <td colspan="2" style="padding:4px 8px;color:#192a56">Total No. of Documents Submitted</td>
                <td colspan="3" style="text-align:center;font-size:11px;color:#192a56"><strong>${totalSubmittedDocs}</strong></td>
              </tr>
            </tbody>
          </table>

          <div style="border-top:1px dashed #192a56;margin:8px 0 6px"></div>
          
          <div style="text-align:center;font-weight:bold;font-size:10px;color:#192a56;letter-spacing:0.5px;margin-bottom:4px">FOR OFFICE USE ONLY</div>

          <div style="display:flex;align-items:center;gap:12px;font-size:9px;font-weight:bold;margin-bottom:6px">
            <span>Quota :</span>
            <span style="border:1px solid #333;padding:2px 8px;background:${isManagement ? '#f0f4ff' : '#fff'}">
              Management [${isManagement ? '✓' : '&nbsp;&nbsp;'}]
            </span>
            <span style="border:1px solid #333;padding:2px 8px;background:${isGovernment ? '#f0f4ff' : '#fff'}">
              Government [${isGovernment ? '✓' : '&nbsp;&nbsp;'}]
            </span>
            <span style="border:1px solid #333;padding:2px 8px;background:${isScholarship ? '#f0f4ff' : '#fff'}">
              Scholarship [${isScholarship ? '✓' : '&nbsp;&nbsp;'}]
            </span>
          </div>

          <table style="width:100%;font-size:8.5px;line-height:1.45;border-collapse:collapse">
            <tr>
              <td style="width:3%;font-weight:bold">1.</td>
              <td style="width:28%;font-weight:bold">Qualifying Examination</td>
              <td style="width:2%">:</td>
              <td><strong>H.Sc. / Diploma / Degree</strong> (${v(enq.programme)})</td>
            </tr>
            <tr>
              <td style="font-weight:bold;vertical-align:top">2.</td>
              <td style="font-weight:bold;vertical-align:top">Marks Obtained</td>
              <td style="vertical-align:top">:</td>
              <td>
                <table class="form-table" style="width:75%;margin:2px 0">
                  <tr style="background:#f8f9fa;font-weight:bold;text-align:center">
                    <td>Maths</td><td>Physics</td><td>Chemistry</td><td>Total</td>
                  </tr>
                  <tr style="text-align:center">
                    <td>${v(mathsVal)}</td>
                    <td>${v(physicsVal)}</td>
                    <td>${v(chemistryVal)}</td>
                    <td><strong>${v(totalVal)}</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font-weight:bold">3.</td>
              <td style="font-weight:bold">Diploma / Degree</td>
              <td>:</td>
              <td>${v(enq.qualifyingExamDipDegBoard)}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">4.</td>
              <td style="font-weight:bold">Percentage of Marks</td>
              <td>:</td>
              <td>Cutoff: <strong>${v(cutoffVal)}</strong></td>
            </tr>
            <tr>
              <td style="font-weight:bold">5.</td>
              <td style="font-weight:bold">Status</td>
              <td>:</td>
              <td><strong>Admitted</strong> / Not Admitted</td>
            </tr>
            <tr>
              <td style="font-weight:bold">6.</td>
              <td style="font-weight:bold">Branch Allotted</td>
              <td>:</td>
              <td style="color:#192a56;font-weight:bold">${v(formatDepartmentDisplay(enq.department))}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">7.</td>
              <td style="font-weight:bold">Date of Admission</td>
              <td>:</td>
              <td>${v(formatDateToDisplay(enq.admissionDate || enq.createdAt || enq.date))}</td>
            </tr>
            <tr>
              <td style="font-weight:bold">8.</td>
              <td style="font-weight:bold">Remarks</td>
              <td>:</td>
              <td>${v(enq.remarks)}</td>
            </tr>
          </table>

          <div style="margin-top:18px;display:flex;justify-content:space-between;padding:0 10px;font-size:9px;font-weight:bold;color:#222">
            <div style="text-align:center;width:28%">
              <div style="height:22px"></div>
              <div style="border-top:1px dashed #444;padding-top:2px">VERIFIED BY</div>
            </div>
            <div style="text-align:center;width:34%">
              <div style="height:22px"></div>
              <div style="border-top:1px dashed #444;padding-top:2px">ADMINISTRATIVE OFFICER</div>
            </div>
            <div style="text-align:center;width:28%">
              <div style="height:22px"></div>
              <div style="border-top:1px dashed #444;padding-top:2px">PRINCIPAL</div>
            </div>
          </div>

          <div class="page-footer">
            <div>Form No. AD01/Rev No.00</div>
            <div>Effective Date: 01/08/2021</div>
            <div>(End of Document)</div>
            <div class="page-number-circle">3</div>
          </div>
        </div>

      </body>
      </html>`;
    };

    try {
      const html = generateHtml("/logo.png");
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => {
          try { win.print(); } catch (e) { console.error("Print error:", e); }
        }, 300);
      } else {
        alert("Popup blocked! Please allow popups for this site to export the PDF.");
      }
    } catch (err) {
      console.error("Export PDF error:", err);
    }
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
