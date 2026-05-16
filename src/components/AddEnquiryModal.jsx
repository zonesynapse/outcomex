import { useEffect, useState, useMemo } from "react";
import { X, ChevronDown } from "lucide-react";
import StatusBadge from "./StatusBadge";
import {
  calculateCutoffFromMarks,
  createEmptyEnquiryForm
} from "../services/enquiryService";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey } from "../lib/utils";

const STATUS_OPTIONS = ["Enquiry", "Application", "Admission"];
const ENQUIRY_FOR_OPTIONS = ["BE / B.Tech", "LE / ME", "MBA", "Transfer Course"];
const EXAM_OPTIONS = ["+2", "Diploma", "UG"];
const QUOTA_OPTIONS = ["MQ", "Counseling", "FG"];
const MEDIUM_OPTIONS = ["English", "Tamil", "English / Tamil"];
const COMMUNITY_OPTIONS = ["OC", "BC", "MBC", "SC", "ST", "Other"];
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
  { value: "pay_online", label: "Pay Online (UPI)" }
];

const isValidMobile = (value) => /^\d{10}$/.test(String(value || "").trim());
const isValidLandline = (value) => /^\d{6,12}$/.test(String(value || "").trim());
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const cleanDigits = (value, limit = 10) => String(value || "").replace(/\D/g, "").slice(0, limit);
const normalizeText = (value) => String(value || "");

export default function AddEnquiryModal({
  open,
  mode = "add",
  initialValues,
  departments = [],
  saving = false,
  onClose,
  onSubmit
}) {
  const { departments: allDepartments, durations } = useDepartments();
  const [form, setForm] = useState(createEmptyEnquiryForm());
  const [errors, setErrors] = useState({});
  const { getActiveBatches } = useBatches(durations);

  useEffect(() => {
    if (!open) return;

    setForm({
      ...createEmptyEnquiryForm(),
      ...initialValues,
      studentName: initialValues?.studentName ?? "",
      fatherGuardianName: initialValues?.fatherGuardianName ?? "",
      mobile: initialValues?.mobile ?? "",
      parentMobile: initialValues?.parentMobile ?? "",
      landline: initialValues?.landline ?? "",
      emailId: initialValues?.emailId ?? "",
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
      enquiryDate: initialValues?.enquiryDate ?? new Date().toISOString().slice(0, 10),
      department: initialValues?.department ?? "",
      department2: initialValues?.department2 ?? "",
      department3: initialValues?.department3 ?? "",
      status: initialValues?.status ?? "Enquiry",
      enquiryAttendedBy: initialValues?.enquiryAttendedBy ?? "",
      feeAmount: initialValues?.feeAmount ?? "",
      paymentMode: initialValues?.paymentMode ?? "cash",
      upiNumber: initialValues?.upiNumber ?? "",
      newFields: Array.isArray(initialValues?.newFields) ? initialValues.newFields : [],
      documents: initialValues?.documents ?? {}
    });
    setErrors({});
  }, [open, initialValues, mode]);

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

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result) });
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

  if (!open) return null;

  const readOnly = mode === "view";
  const title = mode === "edit" ? "Edit Enquiry" : mode === "view" ? "Enquiry Details" : "New Enquiry";
  const calculatedCutoff = calculateCutoffFromMarks(form);
  const displayCutoff = calculatedCutoff !== "" ? calculatedCutoff : form.cutoff;

  const handleChange = (field, value) => {
    const nextValue = ["mobile", "parentMobile", "landline", "mathsMark", "physicsMark", "chemistryMark", "totalMarks"].includes(field)
      ? cleanDigits(value, field === "landline" ? 12 : (field.includes("Mark") || field === "totalMarks" ? 3 : 10))
      : value;

    setForm((prev) => ({ ...prev, [field]: nextValue }));

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

  const handleFileChange = async (key, file) => {
    if (!file) return;
    try {
      const encoded = await fileToBase64(file);
      setForm((prev) => ({
        ...prev,
        documents: {
          ...(prev.documents || {}),
          [key]: encoded
        }
      }));
    } catch (e) {
      console.error("File read error:", e);
    }
  };

  const removeDocument = (key) => {
    setForm((prev) => {
      const docs = { ...(prev.documents || {}) };
      delete docs[key];
      return { ...prev, documents: docs };
    });
  };

  const getApplicationPayload = () => ({
    applicationNo: normalizeText(form.applicationNo).trim(),
    title: normalizeText(form.title).trim(),
    gender: normalizeText(form.gender).trim(),
    motherName: normalizeText(form.motherName).trim(),
    guardianName: normalizeText(form.guardianName).trim(),
    parentWhatsAppNo: cleanDigits(form.parentWhatsAppNo, 10),
    studentWhatsAppNo: cleanDigits(form.studentWhatsAppNo, 10),
    presentAddress: normalizeText(form.presentAddress).trim(),
    permanentAddress: normalizeText(form.permanentAddress).trim(),
    presentPincode: cleanDigits(form.presentPincode, 6),
    permanentPincode: cleanDigits(form.permanentPincode, 6),
    presentDistrict: normalizeText(form.presentDistrict).trim(),
    permanentDistrict: normalizeText(form.permanentDistrict).trim(),
    presentState: normalizeText(form.presentState).trim(),
    permanentState: normalizeText(form.permanentState).trim(),
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
    qualifyingExamProgrammes: normalizeText(form.qualifyingExamProgrammes).trim(),
    qualifyingExamInstitute: normalizeText(form.qualifyingExamInstitute).trim(),
    qualifyingExamBoardUniversity: normalizeText(form.qualifyingExamBoardUniversity).trim(),
    qualifyingExamMonthYear: normalizeText(form.qualifyingExamMonthYear).trim(),
    qualifyingExamAttempts: normalizeText(form.qualifyingExamAttempts).trim(),
    qualifyingExamMarks: normalizeText(form.qualifyingExamMarks).trim()
  });

  const validate = () => {
    const nextErrors = {};

    if (!String(form.studentName || "").trim()) nextErrors.studentName = "Student name is required";
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

    if (!String(form.address || "").trim()) nextErrors.address = "Address is required";
    if (!String(form.schoolCollege || "").trim()) nextErrors.schoolCollege = "School/college name is required";
    if (!String(form.mediumOfInstruction || "").trim()) nextErrors.mediumOfInstruction = "Medium of instruction is required";
    if (!String(form.community || "").trim()) nextErrors.community = "Community is required";
    if (!String(form.enquiryFor || "").trim()) nextErrors.enquiryFor = "Enquiry for is required";
    if (!String(form.examinationPassedAppeared || "").trim()) nextErrors.examinationPassedAppeared = "Examination type is required";
    if (!String(form.batch || "").trim()) nextErrors.batch = "Batch is required";
    if (!String(form.academicYear || "").trim()) nextErrors.academicYear = "Academic Year is required";
    if (!String(form.department || "").trim()) nextErrors.department = "Department interest is required";
    if (!String(form.status || "").trim()) nextErrors.status = "Status is required";
    if (!String(form.enquiryDate || "").trim()) nextErrors.enquiryDate = "Enquiry date is required";

    // Payment validations
    if (form.status === "Application") {
      const fee = Number(String(form.feeAmount || "").trim());
      if (!fee || Number.isNaN(fee) || fee <= 0) {
        nextErrors.feeAmount = "Enter the minimum fee amount";
      }

      if (!form.paymentMode) nextErrors.paymentMode = "Select payment mode";
      if (form.paymentMode === "pay_online") {
        if (!String(form.upiNumber || "").trim()) nextErrors.upiNumber = "Enter UPI ID for online payment";
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
    } else if (!form.cutoff && mode === "add") {
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

    await onSubmit?.({
      studentName: normalizeText(form.studentName).trim(),
      fatherGuardianName: normalizeText(form.fatherGuardianName).trim(),
      mobile: cleanDigits(form.mobile, 10),
      parentMobile: cleanDigits(form.parentMobile, 10),
      landline: cleanDigits(form.landline, 12),
      emailId: normalizeText(form.emailId).trim(),
      address: normalizeText(form.address).trim(),
      parentOccupation: normalizeText(form.parentOccupation).trim(),
      dateOfBirth: normalizeText(form.dateOfBirth).trim(),
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
      enquiryDate: normalizeText(form.enquiryDate).trim(),
      department: normalizeText(form.department).trim(),
      department2: normalizeText(form.department2).trim(),
      department3: normalizeText(form.department3).trim(),
      status: normalizeText(form.status).trim(),
      enquiryAttendedBy: normalizeText(form.enquiryAttendedBy).trim(),
      feeAmount: Number(String(form.feeAmount || "").trim()) || "",
      paymentMode: normalizeText(form.paymentMode).trim(),
      upiNumber: normalizeText(form.upiNumber).trim(),
      documents: form.documents || {},
      ...getApplicationPayload()
    });
  };

  const exportPdf = (enq) => {
    const newFields = Array.isArray(enq.newFields) ? enq.newFields : [];

    const row = (label, key, value) => {
      const isNew = newFields.includes(key);
      const display = value === null || value === undefined ? "" : String(value);
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;width:35%;font-weight:600">${label}</td>
          <td style="padding:8px;border:1px solid #ddd">${isNew ? `<span style=\"background:#fffbcc;padding:2px 6px;border-radius:6px;\">NEW</span> ` : ""}${display}</td>
        </tr>
      `;
    };

    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Enquiry ${enq.enquiryId || ""}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:20mm}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          td{vertical-align:top}
          .title{font-size:18px;font-weight:700;margin-bottom:6px}
        </style>
      </head>
      <body>
        <div class="title">Admission Enquiry - ${enq.enquiryId || ""}</div>
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
          ${row("EMS / UMS No.","emsUmsNo", enq.emsUmsNo)}
          ${row("Qualifying Exam Programme","qualifyingExamProgrammes", enq.qualifyingExamProgrammes)}
          ${row("Institute","qualifyingExamInstitute", enq.qualifyingExamInstitute)}
          ${row("Board / University","qualifyingExamBoardUniversity", enq.qualifyingExamBoardUniversity)}
          ${row("Month & Year of Passing","qualifyingExamMonthYear", enq.qualifyingExamMonthYear)}
          ${row("No. of Attempts","qualifyingExamAttempts", enq.qualifyingExamAttempts)}
          ${row("% of Marks","qualifyingExamMarks", enq.qualifyingExamMarks)}
          ${row("Maths Mark","mathsMark", enq.mathsMark)}
          ${row("Physics Mark","physicsMark", enq.physicsMark)}
          ${row("Chemistry Mark","chemistryMark", enq.chemistryMark)}
          ${row("Cutoff","cutoff", enq.cutoff)}
          ${row("Minimum Fee (₹)","feeAmount", enq.feeAmount)}
          ${row("Payment Mode","paymentMode", enq.paymentMode === "pay_online" ? `Online (UPI: ${enq.upiNumber || ""})` : "Hand / Cash")}
          ${row("UPI ID","upiNumber", enq.upiNumber)}
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

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch (e) {
        console.error(e);
      }
    }, 500);
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
                      {STATUS_OPTIONS.map((status) => (
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
              <Field label="Student Name" required error={errors.studentName} readOnly={readOnly}>
                <input
                  value={form.studentName}
                  onChange={(event) => handleChange("studentName", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter student name"
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

              <div className="md:col-span-2 xl:col-span-3">
                <Field label="Address" required error={errors.address} readOnly={readOnly}>
                  <textarea
                    value={form.address}
                    onChange={(event) => handleChange("address", event.target.value)}
                    className={`min-h-24 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                    placeholder="Enter full address"
                    readOnly={readOnly}
                  />
                </Field>
              </div>
            </div>
          </Section>

          {form.status === "Application" && (
            <>
              <Section title="Application Details" description="Fields mapped from the application form images.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Application No." error={errors.applicationNo} readOnly={readOnly}>
                    <input value={form.applicationNo} onChange={(event) => handleChange("applicationNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Application number" readOnly={readOnly} />
                  </Field>
                  <Field label="Title" error={errors.title} readOnly={readOnly}>
                    <select value={form.title} onChange={(event) => handleChange("title", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select title</option>
                      {TITLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Gender" error={errors.gender} readOnly={readOnly}>
                    <select value={form.gender} onChange={(event) => handleChange("gender", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select gender</option>
                      {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Programme" error={errors.programme} readOnly={readOnly}>
                    <select value={form.programme} onChange={(event) => handleChange("programme", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select programme</option>
                      {Object.keys(durations).map((progKey) => (
                        <option key={progKey} value={progKey}>{formatProgrammeKey(progKey)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Batch" error={errors.batch} readOnly={readOnly}>
                    <select value={form.batch} onChange={(event) => handleChange("batch", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select batch</option>
                      {availableBatches.map((b) => (
                        <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Academic Year" error={errors.academicYear} readOnly={readOnly}>
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
                  
                  <Field label="Seat Category / Scholarship Details" error={errors.seatCategory} readOnly={readOnly}><input value={form.seatCategory} onChange={(event) => handleChange("seatCategory", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="e.g. Govt Quota / FG / PMS" readOnly={readOnly} /></Field>
                  <Field label="Scholarship Details" error={errors.scholarshipDetails} readOnly={readOnly}><input value={form.scholarshipDetails} onChange={(event) => handleChange("scholarshipDetails", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Scholarship details" readOnly={readOnly} /></Field>
                  <Field label="Nationality" error={errors.nationality} readOnly={readOnly}><input value={form.nationality} onChange={(event) => handleChange("nationality", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Nationality" readOnly={readOnly} /></Field>
                  <Field label="Religion" error={errors.religion} readOnly={readOnly}><input value={form.religion} onChange={(event) => handleChange("religion", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Religion" readOnly={readOnly} /></Field>
                  <Field label="Caste" error={errors.caste} readOnly={readOnly}><input value={form.caste} onChange={(event) => handleChange("caste", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Caste" readOnly={readOnly} /></Field>
                  <Field label="Community" required error={errors.community} readOnly={readOnly}>
                    <select value={form.community} onChange={(event) => handleChange("community", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select community</option>
                      {COMMUNITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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
                  <Field label="Present Address" error={errors.presentAddress} readOnly={readOnly}><textarea value={form.presentAddress} onChange={(event) => handleChange("presentAddress", event.target.value)} className={`min-h-24 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present address" readOnly={readOnly} /></Field>
                  <Field label="Permanent Address" error={errors.permanentAddress} readOnly={readOnly}><textarea value={form.permanentAddress} onChange={(event) => handleChange("permanentAddress", event.target.value)} className={`min-h-24 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent address" readOnly={readOnly} /></Field>
                  <Field label="Present Pincode" error={errors.presentPincode} readOnly={readOnly}><input value={form.presentPincode} onChange={(event) => handleChange("presentPincode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present pincode" inputMode="numeric" readOnly={readOnly} /></Field>
                  <Field label="Permanent Pincode" error={errors.permanentPincode} readOnly={readOnly}><input value={form.permanentPincode} onChange={(event) => handleChange("permanentPincode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent pincode" inputMode="numeric" readOnly={readOnly} /></Field>
                  <Field label="Present District" error={errors.presentDistrict} readOnly={readOnly}><input value={form.presentDistrict} onChange={(event) => handleChange("presentDistrict", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present district" readOnly={readOnly} /></Field>
                  <Field label="Permanent District" error={errors.permanentDistrict} readOnly={readOnly}><input value={form.permanentDistrict} onChange={(event) => handleChange("permanentDistrict", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent district" readOnly={readOnly} /></Field>
                  <Field label="Present State" error={errors.presentState} readOnly={readOnly}><input value={form.presentState} onChange={(event) => handleChange("presentState", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present state" readOnly={readOnly} /></Field>
                  <Field label="Permanent State" error={errors.permanentState} readOnly={readOnly}><input value={form.permanentState} onChange={(event) => handleChange("permanentState", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent state" readOnly={readOnly} /></Field>
                  <Field label="Present Country" error={errors.presentCountry} readOnly={readOnly}><input value={form.presentCountry} onChange={(event) => handleChange("presentCountry", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Present country" readOnly={readOnly} /></Field>
                  <Field label="Permanent Country" error={errors.permanentCountry} readOnly={readOnly}><input value={form.permanentCountry} onChange={(event) => handleChange("permanentCountry", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Permanent country" readOnly={readOnly} /></Field>
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

              <Section title="Transport / Exam Details" description="Transport, EMS / UMS and qualifying exam information.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Transport Facilities Required" error={errors.transportRequired} readOnly={readOnly}>
                    <select value={form.transportRequired} onChange={(event) => handleChange("transportRequired", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                      <option value="">Select YES / NO</option>
                      {YES_NO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Route" error={errors.transportRoute} readOnly={readOnly || form.transportRequired === 'NO'}><input value={form.transportRoute} onChange={(event) => handleChange("transportRoute", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${readOnly || form.transportRequired === 'NO' ? 'bg-zinc-50 text-zinc-500' : 'bg-white'}`} placeholder="Transport route" readOnly={readOnly || form.transportRequired === 'NO'} /></Field>
                  <Field label="Stage" error={errors.transportStage} readOnly={readOnly || form.transportRequired === 'NO'}><input value={form.transportStage} onChange={(event) => handleChange("transportStage", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${readOnly || form.transportRequired === 'NO' ? 'bg-zinc-50 text-zinc-500' : 'bg-white'}`} placeholder="Transport stage" readOnly={readOnly || form.transportRequired === 'NO'} /></Field>
                  <Field label="EMS / UMS No." error={errors.emsUmsNo} readOnly={readOnly}><input value={form.emsUmsNo} onChange={(event) => handleChange("emsUmsNo", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="EMS / UMS number" readOnly={readOnly} /></Field>
                  <Field label="Qualifying Exam Programme" error={errors.qualifyingExamProgrammes} readOnly={readOnly}><input value={form.qualifyingExamProgrammes} onChange={(event) => handleChange("qualifyingExamProgrammes", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="e.g. 10th Std / Diploma / UG" readOnly={readOnly} /></Field>
                  <Field label="Institute" error={errors.qualifyingExamInstitute} readOnly={readOnly}><input value={form.qualifyingExamInstitute} onChange={(event) => handleChange("qualifyingExamInstitute", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Institute name" readOnly={readOnly} /></Field>
                  <Field label="Board / University" error={errors.qualifyingExamBoardUniversity} readOnly={readOnly}><input value={form.qualifyingExamBoardUniversity} onChange={(event) => handleChange("qualifyingExamBoardUniversity", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Board / University" readOnly={readOnly} /></Field>
                  <Field label="Month & Year of Passing" error={errors.qualifyingExamMonthYear} readOnly={readOnly}><input value={form.qualifyingExamMonthYear} onChange={(event) => handleChange("qualifyingExamMonthYear", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Month & year" readOnly={readOnly} /></Field>
                  <Field label="No. of Attempts" error={errors.qualifyingExamAttempts} readOnly={readOnly}><input value={form.qualifyingExamAttempts} onChange={(event) => handleChange("qualifyingExamAttempts", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Attempts" readOnly={readOnly} /></Field>
                  <Field label="% of Marks" error={errors.qualifyingExamMarks} readOnly={readOnly}><input value={form.qualifyingExamMarks} onChange={(event) => handleChange("qualifyingExamMarks", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Percentage of marks" readOnly={readOnly} /></Field>
                </div>
              </Section>

              <Section title="Checklist / Documents" description="Upload supporting documents. Files are stored as base64 in RTDB.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {DOCUMENT_CHECKLIST.map((doc) => {
                    const existing = form.documents && form.documents[doc.key];
                    return (
                      <div key={doc.key} className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-zinc-700">{doc.label}</span>
                          {!readOnly && existing && (
                            <button type="button" onClick={() => removeDocument(doc.key)} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove</button>
                          )}
                        </div>
                        {existing ? (
                          <div className="space-y-2">
                            <a href={existing.data} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-[#120c7a] underline">{existing.name}</a>
                            <div className="text-xs text-zinc-500">Stored as base64 in RTDB</div>
                            {!readOnly && (
                              <button type="button" onClick={() => removeDocument(doc.key)} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove</button>
                            )}
                          </div>
                        ) : readOnly ? (
                          <div className="text-sm text-zinc-400">Not provided</div>
                        ) : (
                          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileChange(doc.key, e.target.files && e.target.files[0])} className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#120c7a] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0f0a66]" />
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
              <Field label="Parent's Occupation" error={errors.parentOccupation} readOnly={readOnly}>
                <input
                  value={form.parentOccupation}
                  onChange={(event) => handleChange("parentOccupation", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Enter occupation"
                  readOnly={readOnly}
                />
              </Field>

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
                  {COMMUNITY_OPTIONS.map((option) => (
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
                  {ENQUIRY_FOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
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
                  {departments.map((department) => (
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
                  {departments.map((department) => (
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
                  {departments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </Field>

              <Field label="Quota Asked For" error={errors.quotaAskedFor} readOnly={readOnly}>
                <select
                  value={form.quotaAskedFor}
                  onChange={(event) => handleChange("quotaAskedFor", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  disabled={readOnly}
                >
                  <option value="">Select quota</option>
                  {QUOTA_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
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
                  type="date"
                  value={form.enquiryDate}
                  onChange={(event) => handleChange("enquiryDate", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  readOnly={readOnly}
                />
              </Field>
            </div>
          </Section>

          <Section title="Marks and Cutoff" description="Enter subject marks and the cutoff is calculated automatically.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Maths" required={mode !== "view"} error={errors.mathsMark} readOnly={readOnly}>
                <input
                  value={form.mathsMark}
                  onChange={(event) => handleChange("mathsMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Maths mark"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Physics" required={mode !== "view"} error={errors.physicsMark} readOnly={readOnly}>
                <input
                  value={form.physicsMark}
                  onChange={(event) => handleChange("physicsMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Physics mark"
                  inputMode="numeric"
                  readOnly={readOnly}
                />
              </Field>

              <Field label="Chemistry" required={mode !== "view"} error={errors.chemistryMark} readOnly={readOnly}>
                <input
                  value={form.chemistryMark}
                  onChange={(event) => handleChange("chemistryMark", event.target.value)}
                  className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`}
                  placeholder="Chemistry mark"
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

              <Field label="Cutoff" required={mode !== "view"} error={errors.cutoff} readOnly>
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

          {form.status === "Application" && (
            <Section title="Payment" description="Minimum fee and payment method.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Minimum Fee (₹)" required error={errors.feeAmount} readOnly={readOnly}>
                  <input type="number" value={form.feeAmount} onChange={(event) => handleChange("feeAmount", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="Enter minimum fee amount" readOnly={readOnly} />
                </Field>
                <Field label="Payment Mode" required error={errors.paymentMode} readOnly={readOnly}>
                  <select value={form.paymentMode} onChange={(event) => handleChange("paymentMode", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} disabled={readOnly}>
                    <option value="">Select payment mode</option>
                    {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
                {form.paymentMode === "pay_online" && (
                  <Field label="UPI ID" required={form.paymentMode === "pay_online"} error={errors.upiNumber} readOnly={readOnly}>
                    <input value={form.upiNumber} onChange={(event) => handleChange("upiNumber", event.target.value)} className={`w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 ${disabledClass}`} placeholder="e.g. yourupiid@bank" readOnly={readOnly} />
                  </Field>
                )}
              </div>
            </Section>
          )}

          {Object.keys(errors).length > 0 && !readOnly && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Please fix the highlighted fields before saving.
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
