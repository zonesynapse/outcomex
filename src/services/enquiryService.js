import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, limit, startAfter, where, getCountFromServer, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

const ENQUIRY_ROOT = "enquiries";

const asString = (value) => String(value ?? "").trim();

const asNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export function createEmptyEnquiryForm() {
  return {
    applicationNo: "",
    title: "",
    gender: "",
    studentName: "",
    fatherGuardianName: "",
    motherName: "",
    guardianName: "",
    mobile: "",
    parentMobile: "",
    parentWhatsAppNo: "",
    studentWhatsAppNo: "",
    landline: "",
    emailId: "",
    address: "",
    presentHouseNo: "",
    presentStreet: "",
    presentLocality: "",
    presentCity: "",
    presentAddress: "",
    permanentAddress: "",
    presentPincode: "",
    permanentPincode: "",
    presentDistrict: "",
    permanentDistrict: "",
    presentState: "",
    permanentCity: "",
    permanentState: "",
    presentCountry: "",
    permanentCountry: "",
    parentOccupation: "",
    motherOccupation: "",
    fatherOccupationSector: "",
    motherOccupationSector: "",
    fatherOrganisation: "",
    motherOrganisation: "",
    fatherDesignation: "",
    motherDesignation: "",
    fatherAnnualIncome: "",
    motherAnnualIncome: "",
    familyAnnualIncome: "",
    dateOfBirth: "",
    age: "",
    schoolCollege: "",
    mediumOfInstruction: "",
    religion: "",
    community: "",
    nationality: "Indian",
    caste: "",
    motherTongue: "",
    bloodGroup: "",
    enquiryFor: "",
    examinationPassedAppeared: "",
    programme: "", // Keep programme
    batch: "",
    studentCategory: "",
    academicYear: "",
    seatCategory: "",
    scholarshipDetails: "",
    maritalStatus: "",
    hostellerDayScholar: "",
    transportRequired: "",
    transportRoute: "",
    transportStage: "",
    emsUmsNo: "",
    aadharNo: "",
    qualifyingExamProgrammes: "",
    qualifyingExamInstitute: "",
    qualifyingExamBoardUniversity: "",
    qualifyingExamMonthYear: "",
    qualifyingExamAttempts: "",
    qualifyingExamMarks: "",
    qualifyingExam10thInstitute: "",
    qualifyingExam10thBoard: "",
    qualifyingExam10thMonthYear: "",
    qualifyingExam10thAttempts: "",
    qualifyingExam10thMarks: "",
    qualifyingExam11thInstitute: "",
    qualifyingExam11thBoard: "",
    qualifyingExam11thMonthYear: "",
    qualifyingExam11thAttempts: "",
    qualifyingExam11thMarks: "",
    qualifyingExam12thInstitute: "",
    qualifyingExam12thBoard: "",
    qualifyingExam12thMonthYear: "",
    qualifyingExam12thAttempts: "",
    qualifyingExam12thMarks: "",
    qualifyingExamDipDegInstitute: "",
    qualifyingExamDipDegBoard: "",
    qualifyingExamDipDegMonthYear: "",
    qualifyingExamDipDegAttempts: "",
    qualifyingExamDipDegMarks: "",
    mathsMark: "",
    physicsMark: "",
    chemistryMark: "",
    totalMarks: "",
    cutoff: "",
    eligibility: "",
    quotaAskedFor: "",
    reference: "",
    enquiryDate: new Date().toISOString().slice(0, 10),
    department: "",
    department2: "",
    department3: "",
    status: "Enquiry",
    enquiryAttendedBy: "",
    payments: [{ feeCategory: "", feeAmount: "", paymentMode: "cash", paymentDate: "", upiNumber: "" }]
  };
}

export function calculateTotalMarks(data = {}) {
  const maths = asNumber(data.mathsMark) ?? 0;
  const physics = asNumber(data.physicsMark) ?? 0;
  const chemistry = asNumber(data.chemistryMark) ?? 0;

  if (maths === 0 && physics === 0 && chemistry === 0) return "";

  const total = maths + physics + chemistry;
  return Number.isInteger(total) ? total : Number(total.toFixed(2));
}

export function calculateCutoffFromMarks(data = {}) {
  const maths = asNumber(data.mathsMark);
  const physics = asNumber(data.physicsMark);
  const chemistry = asNumber(data.chemistryMark);

  if (maths === null && physics === null && chemistry === null) return "";
  if (maths === null || physics === null || chemistry === null) return "";

  const cutoff = maths + physics / 2 + chemistry / 2;
  return Number.isInteger(cutoff) ? cutoff : Number(cutoff.toFixed(2));
}

const normalizeEnquiry = (enquiryId, data = {}) => ({
  enquiryId: data.enquiryId || enquiryId || "",
  studentName: asString(data.studentName),
  firstName: asString(data.firstName),
  lastName: asString(data.lastName),
  fatherGuardianName: asString(data.fatherGuardianName),
  motherName: asString(data.motherName),
  guardianName: asString(data.guardianName),
  applicationNo: asString(data.applicationNo),
  title: asString(data.title),
  gender: asString(data.gender),
  mobile: asString(data.mobile),
  parentMobile: asString(data.parentMobile),
  parentWhatsAppNo: asString(data.parentWhatsAppNo),
  studentWhatsAppNo: asString(data.studentWhatsAppNo),
  landline: asString(data.landline),
  emailId: asString(data.emailId),
  address: asString(data.address),
  presentHouseNo: asString(data.presentHouseNo),
  presentStreet: asString(data.presentStreet),
  presentLocality: asString(data.presentLocality),
  presentCity: asString(data.presentCity),
  presentAddress: asString(data.presentAddress),
  permanentAddress: asString(data.permanentAddress),
  presentPincode: asString(data.presentPincode),
  permanentPincode: asString(data.permanentPincode),
  presentDistrict: asString(data.presentDistrict),
  permanentDistrict: asString(data.permanentDistrict),
  presentState: asString(data.presentState),
  permanentState: asString(data.permanentState),
  permanentCity: asString(data.permanentCity),
  presentCountry: asString(data.presentCountry),
  permanentCountry: asString(data.permanentCountry),
  parentOccupation: asString(data.parentOccupation),
  motherOccupation: asString(data.motherOccupation),
  fatherOccupationSector: asString(data.fatherOccupationSector),
  motherOccupationSector: asString(data.motherOccupationSector),
  fatherOrganisation: asString(data.fatherOrganisation),
  motherOrganisation: asString(data.motherOrganisation),
  fatherDesignation: asString(data.fatherDesignation),
  motherDesignation: asString(data.motherDesignation),
  fatherAnnualIncome: asString(data.fatherAnnualIncome),
  motherAnnualIncome: asString(data.motherAnnualIncome),
  familyAnnualIncome: asString(data.familyAnnualIncome),
  dateOfBirth: asString(data.dateOfBirth),
  age: asString(data.age),
  schoolCollege: asString(data.schoolCollege),
  mediumOfInstruction: asString(data.mediumOfInstruction),
  religion: asString(data.religion),
  community: asString(data.community),
  nationality: asString(data.nationality) || "Indian",
  caste: asString(data.caste),
  motherTongue: asString(data.motherTongue),
  bloodGroup: asString(data.bloodGroup),
  enquiryFor: asString(data.enquiryFor),
  examinationPassedAppeared: asString(data.examinationPassedAppeared),
  programme: asString(data.programme),
  batch: asString(data.batch),
  yearOfAdmission: asString(data.yearOfAdmission),
  studentCategory: asString(data.studentCategory),
  year: asString(data.year),
  academicYear: asString(data.academicYear),
  seatCategory: asString(data.seatCategory),
  scholarshipDetails: asString(data.scholarshipDetails),
  maritalStatus: asString(data.maritalStatus),
  hostellerDayScholar: asString(data.hostellerDayScholar),
  transportRequired: asString(data.transportRequired),
  transportRoute: asString(data.transportRoute),
  transportStage: asString(data.transportStage),
  emsUmsNo: asString(data.emsUmsNo),
  aadharNo: asString(data.aadharNo),
  qualifyingExamProgrammes: asString(data.qualifyingExamProgrammes),
  qualifyingExamInstitute: asString(data.qualifyingExamInstitute),
  qualifyingExamBoardUniversity: asString(data.qualifyingExamBoardUniversity),
  qualifyingExamMonthYear: asString(data.qualifyingExamMonthYear),
  qualifyingExamAttempts: asString(data.qualifyingExamAttempts),
  qualifyingExamMarks: asString(data.qualifyingExamMarks),
  qualifyingExam10thInstitute: asString(data.qualifyingExam10thInstitute),
  qualifyingExam10thBoard: asString(data.qualifyingExam10thBoard),
  qualifyingExam10thMonthYear: asString(data.qualifyingExam10thMonthYear),
  qualifyingExam10thAttempts: asString(data.qualifyingExam10thAttempts),
  qualifyingExam10thMarks: asString(data.qualifyingExam10thMarks),
  qualifyingExam11thInstitute: asString(data.qualifyingExam11thInstitute),
  qualifyingExam11thBoard: asString(data.qualifyingExam11thBoard),
  qualifyingExam11thMonthYear: asString(data.qualifyingExam11thMonthYear),
  qualifyingExam11thAttempts: asString(data.qualifyingExam11thAttempts),
  qualifyingExam11thMarks: asString(data.qualifyingExam11thMarks),
  qualifyingExam12thInstitute: asString(data.qualifyingExam12thInstitute),
  qualifyingExam12thBoard: asString(data.qualifyingExam12thBoard),
  qualifyingExam12thMonthYear: asString(data.qualifyingExam12thMonthYear),
  qualifyingExam12thAttempts: asString(data.qualifyingExam12thAttempts),
  qualifyingExam12thMarks: asString(data.qualifyingExam12thMarks),
  qualifyingExamDipDegInstitute: asString(data.qualifyingExamDipDegInstitute),
  qualifyingExamDipDegBoard: asString(data.qualifyingExamDipDegBoard),
  qualifyingExamDipDegMonthYear: asString(data.qualifyingExamDipDegMonthYear),
  qualifyingExamDipDegAttempts: asString(data.qualifyingExamDipDegAttempts),
  qualifyingExamDipDegMarks: asString(data.qualifyingExamDipDegMarks),
  mathsMark: asString(data.mathsMark),
  physicsMark: asString(data.physicsMark),
  chemistryMark: asString(data.chemistryMark),
  totalMarks: data.totalMarks !== undefined && data.totalMarks !== null && data.totalMarks !== "" ? data.totalMarks : calculateTotalMarks(data) ?? "",
  cutoff: data.cutoff !== undefined && data.cutoff !== null && data.cutoff !== "" ? data.cutoff : calculateCutoffFromMarks(data) ?? "",
  eligibility: asString(data.eligibility),
  quotaAskedFor: asString(data.quotaAskedFor),
  reference: asString(data.reference),
  enquiryDate: asString(data.enquiryDate) || new Date(data.createdAt || Date.now()).toISOString().slice(0, 10),
  department: asString(data.department),
  department2: asString(data.department2),
  department3: asString(data.department3),
  status: asString(data.status) || "Enquiry",
  remarks: asString(data.remarks),
  enquiryAttendedBy: asString(data.enquiryAttendedBy),
  payments: Array.isArray(data.payments) && data.payments.length > 0 ? data.payments : (data.feeAmount || data.feeCategory ? [{
    feeCategory: asString(data.feeCategory),
    feeAmount: data.feeAmount !== undefined && data.feeAmount !== null && data.feeAmount !== "" ? asNumber(data.feeAmount) : "",
    paymentMode: asString(data.paymentMode) || "cash",
    paymentDate: asString(data.paymentDate),
    upiNumber: asString(data.upiNumber)
  }] : [{ feeCategory: "", feeAmount: "", paymentMode: "cash", paymentDate: "", upiNumber: "" }]),
  newFields: Array.isArray(data.newFields) ? data.newFields : [],
  documents: data.documents || {},
  createdAt: data.createdAt || Date.now(),
  updatedAt: data.updatedAt || null
});

const compareEnquiries = (left, right) => {
  const leftTime = Number(left?.createdAt || 0);
  const rightTime = Number(right?.createdAt || 0);
  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(right?.enquiryId || "").localeCompare(String(left?.enquiryId || ""));
};

const getNextEnquiryId = async () => {
  const year = new Date().getFullYear();
  const queriesSnap = await getDocs(collection(db, ENQUIRY_ROOT));
  let maxSequence = 0;

  if (!queriesSnap.empty) {
    queriesSnap.forEach((docSnap) => {
      const match = String(docSnap.id).match(/^ENQ(\d{4})-(\d{3})$/);
      if (match && Number(match[1]) === year) {
        maxSequence = Math.max(maxSequence, Number(match[2]));
      }
    });
  }

  return `ENQ${year}-${String(maxSequence + 1).padStart(3, "0")}`;
};

export async function getNextApplicationNo() {
  const year = new Date().getFullYear();
  const queriesSnap = await getDocs(collection(db, ENQUIRY_ROOT));
  let maxSequence = 0;

  if (!queriesSnap.empty) {
    queriesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const appNo = String(data.applicationNo || "");
      const match = appNo.match(/^APP(\d{4})-(\d{3,4})$/);
      if (match && Number(match[1]) === year) {
        maxSequence = Math.max(maxSequence, Number(match[2]));
      }
    });
  }

  return `APP${year}-${String(maxSequence + 1).padStart(4, "0")}`;
}

export async function addEnquiry(data) {
  const enquiryId = await getNextEnquiryId();
  const payload = normalizeEnquiry(enquiryId, {
    ...data,
    enquiryId,
    createdAt: Date.now()
  });
  // compute newFields for a fresh record: any non-empty value keys
  const excluded = new Set(["createdAt", "updatedAt", "enquiryId", "newFields"]);
  payload.newFields = Object.keys(payload).filter((k) => !excluded.has(k) && payload[k] !== "" && payload[k] !== null && payload[k] !== undefined);

  await setDoc(doc(db, ENQUIRY_ROOT, enquiryId), payload);
  if (payload.status === "Approved" || payload.status === "Admitted") {
    syncEnquiryToApprovedAdmissions(payload).catch((err) => console.warn("Admissions sync error:", err));
  }
  // Sync payments into Fee System (fee_payments & fee_receipts)
  syncEnquiryPaymentsToFeeSystem(payload).catch((err) => console.warn("Fee payments sync error:", err));
  return enquiryId;
}

export function getEnquiriesRealtime(onData, onError) {
  const enquiriesRef = collection(db, ENQUIRY_ROOT);

  return onSnapshot(
    enquiriesRef,
    (snapshot) => {
      const enquiries = snapshot.docs.map((docSnap) => normalizeEnquiry(docSnap.id, docSnap.data()))
                                     .sort(compareEnquiries);

      onData(enquiries);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("Enquiries realtime fetch error:", error);
      }
    }
  );
}

export async function updateEnquiry(enquiryId, updates) {
  if (!enquiryId) return;

  // fetch existing record to compute which fields are newly added
  const existingSnap = await getDoc(doc(db, ENQUIRY_ROOT, enquiryId));
  const existing = existingSnap.exists() ? existingSnap.data() : {};

  const payload = normalizeEnquiry(enquiryId, {
    ...existing,
    ...updates,
    enquiryId,
    updatedAt: Date.now()
  });

  const excluded = new Set(["createdAt", "updatedAt", "enquiryId", "newFields"]);
  const prev = normalizeEnquiry(enquiryId, existing || {});
  const newlyAdded = Object.keys(payload).filter((k) => {
    if (excluded.has(k)) return false;
    const prevVal = prev[k];
    const newVal = payload[k];
    const wasEmpty = prevVal === "" || prevVal === null || prevVal === undefined || prevVal === 0;
    const isNowFilled = newVal !== "" && newVal !== null && newVal !== undefined && newVal !== 0;
    return wasEmpty && isNowFilled;
  });

  payload.newFields = Array.from(new Set([...(Array.isArray(prev.newFields) ? prev.newFields : []), ...newlyAdded]));

  await updateDoc(doc(db, ENQUIRY_ROOT, enquiryId), payload);
  if (payload.status === "Approved" || payload.status === "Admitted") {
    syncEnquiryToApprovedAdmissions(payload).catch((err) => console.warn("Admissions sync error:", err));
  }
  // Sync payments into Fee System (fee_payments & fee_receipts)
  syncEnquiryPaymentsToFeeSystem(payload).catch((err) => console.warn("Fee payments sync error:", err));
}

export async function deleteEnquiry(enquiryId) {
  if (!enquiryId) return;
  await deleteDoc(doc(db, ENQUIRY_ROOT, enquiryId));
  // Clean up synced fee records if any
  try {
    for (let i = 0; i < 10; i++) {
      const payRef = doc(db, "fee_payments", `enq_pay_${enquiryId}_${i}`);
      const recRef = doc(db, "fee_receipts", `enq_rec_${enquiryId}_${i}`);
      const [pSnap, rSnap] = await Promise.all([getDoc(payRef), getDoc(recRef)]);
      if (pSnap.exists()) await deleteDoc(payRef);
      if (rSnap.exists()) await deleteDoc(recRef);
      if (!pSnap.exists() && !rSnap.exists()) break;
    }
  } catch (err) {
    console.warn("Error deleting synced enquiry fee records:", err);
  }
}

export async function getEnquiryById(enquiryId) {
  if (!enquiryId) return null;
  const snap = await getDoc(doc(db, ENQUIRY_ROOT, enquiryId));
  if (!snap.exists()) return null;
  return normalizeEnquiry(enquiryId, snap.data());
}

export async function getEnquiriesPaginated({ pageSize = 20, startAfterDoc = null }) {
  const enquiriesRef = collection(db, ENQUIRY_ROOT);
  const constraints = [orderBy("createdAt", "desc"), limit(pageSize + 1)];
  if (startAfterDoc) {
    constraints.push(startAfter(startAfterDoc));
  }
  const q = query(enquiriesRef, ...constraints);
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const items = docs.slice(0, pageSize).map((docSnap) => normalizeEnquiry(docSnap.id, docSnap.data()));
  const lastDoc = docs.length > 0 ? docs[Math.min(docs.length, pageSize) - 1] : null;
  return { items, lastDoc, hasMore };
}

export async function getAllEnquiries() {
  const snapshot = await getDocs(collection(db, ENQUIRY_ROOT));
  return snapshot.docs.map((docSnap) => normalizeEnquiry(docSnap.id, docSnap.data())).sort(compareEnquiries);
}

export async function getEnquiriesCount({ statusIn = null } = {}) {
  const constraints = [];
  if (statusIn && statusIn.length > 0) {
    constraints.push(where("status", "in", statusIn));
  }
  const q = constraints.length > 0 ? query(collection(db, ENQUIRY_ROOT), ...constraints) : collection(db, ENQUIRY_ROOT);
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
}

export async function getEnquiriesStats() {
  try {
    const baseRef = collection(db, ENQUIRY_ROOT);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalSnap, todaySnap, newSnap, appSnap, admSnap, approvedSnap] = await Promise.all([
      getCountFromServer(baseRef),
      getCountFromServer(query(baseRef, where("createdAt", ">=", todayStart.getTime()))),
      getCountFromServer(query(baseRef, where("status", "==", "Enquiry"))),
      getCountFromServer(query(baseRef, where("status", "==", "Application"))),
      getCountFromServer(query(baseRef, where("status", "==", "Admission"))),
      getCountFromServer(query(baseRef, where("status", "==", "Approved"))),
    ]);

    return {
      total: totalSnap.data().count,
      today: todaySnap.data().count,
      new: newSnap.data().count,
      application: appSnap.data().count,
      admission: admSnap.data().count,
      approved: approvedSnap.data().count,
    };
  } catch (err) {
    console.warn("Unable to fetch enquiry stats (offline or network connection issue):", err);
    return {
      total: 0,
      today: 0,
      new: 0,
      application: 0,
      admission: 0,
      approved: 0,
    };
  }
}

export async function syncEnquiryToApprovedAdmissions(enquiryData) {
  try {
    const regNo = enquiryData.applicationNo || enquiryData.enquiryId;
    if (!regNo) return { success: false, reason: "Missing regNo" };
    const name = [enquiryData.firstName, enquiryData.lastName].filter(Boolean).join(" ").trim() || enquiryData.studentName || "-";
    const rawProg = enquiryData.programme || "";
    const isPG = /pg|mba|mca|me|mtech/i.test(rawProg) || /business\s+administration|management/i.test(enquiryData.department || "");
    const progKey = isPG ? "PG" : "UG";
    const department = enquiryData.department || enquiryData.departmentName || "";
    if (!department) return { success: false, reason: "Missing department" };

    // Resolve batch (e.g. 2026-2028 for PG, 2026-2030 for UG)
    let batch = enquiryData.batch || "";
    if (!batch || !batch.includes("-")) {
      const yearMatch = String(enquiryData.enquiryId || enquiryData.applicationNo || enquiryData.enquiryDate || enquiryData.admissionDate || new Date().getFullYear()).match(/\d{4}/);
      const startYear = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
      const duration = progKey === "PG" ? 2 : 4;
      batch = `${startYear}-${startYear + duration}`;
    }

    const cleanBatch = String(batch).replace(/[.#$[\]/]/g, '_');
    const cleanDept = String(department).replace(/[.#$[\]/]/g, '_');
    const studentDocId = `${cleanBatch}_${progKey}_${cleanDept}`;
    const studentRef = doc(db, 'approved_admissions', studentDocId);
    const snap = await getDoc(studentRef);
    const existingData = snap.exists() ? snap.data() : {};
    const order = existingData._order || [];
    if (!order.includes(regNo)) {
      order.push(regNo);
    }
    order.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    const joiningAY = existingData._joiningAY || {};
    const joiningDate = existingData._joiningDate || {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const joinDateStr = enquiryData.admissionDate || enquiryData.enquiryDate || todayStr;

    await setDoc(studentRef, {
      ...existingData,
      [regNo]: name,
      _order: order,
      _meta: {
        ...(existingData._meta || {}),
        department,
        programme: progKey,
        batch
      },
      _joiningAY: { ...joiningAY, [regNo]: enquiryData.academicYear || batch },
      _joiningDate: { ...joiningDate, [regNo]: joinDateStr }
    }, { merge: true });

    return { success: true, docId: studentDocId, regNo };
  } catch (err) {
    console.error("Failed to sync enquiry to approved_admissions:", err);
    return { success: false, error: err };
  }
}

/**
 * Synchronize payments from Admission Enquiries & Applications directly into
 * the college Fee System (fee_payments and fee_receipts collections).
 * This ensures that Application & Admission fee collections reflect immediately
 * in FeeDashboard.jsx and FeeOperations.jsx Reports and Receipts.
 */
export async function syncEnquiryPaymentsToFeeSystem(enquiryData) {
  if (!enquiryData) return { success: false, reason: "No enquiry data" };

  try {
    const enquiryId = enquiryData.enquiryId || enquiryData.id;
    if (!enquiryId) return { success: false, reason: "Missing enquiryId" };

    const rawPayments = Array.isArray(enquiryData.payments) && enquiryData.payments.length > 0
      ? enquiryData.payments
      : (enquiryData.feeAmount ? [{
          feeCategory: enquiryData.feeCategory || "Application Fee",
          feeAmount: enquiryData.feeAmount,
          paymentMode: enquiryData.paymentMode || "cash",
          paymentDate: enquiryData.paymentDate || enquiryData.enquiryDate,
          upiNumber: enquiryData.upiNumber || ""
        }] : []);

    const validPayments = rawPayments.filter(p => {
      const amt = Number(p.feeAmount);
      return !isNaN(amt) && amt > 0;
    });

    const studentName = enquiryData.studentName || `${enquiryData.firstName || ""} ${enquiryData.lastName || ""}`.trim() || "Student";
    const appNo = enquiryData.applicationNo || enquiryId;
    const department = enquiryData.department || enquiryData.departmentName || "—";
    const rawProg = enquiryData.programme || "";
    const isPG = /pg|mba|mca|me|mtech/i.test(rawProg) || /business\s+administration|management/i.test(department);
    const programme = isPG ? "PG" : "UG";

    // Batch & Academic Year derivation
    let batch = enquiryData.batch || "";
    if (!batch || !batch.includes("-")) {
      const yearMatch = String(enquiryId || appNo || enquiryData.enquiryDate || new Date().getFullYear()).match(/\d{4}/);
      const startYear = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
      const duration = isPG ? 2 : 4;
      batch = `${startYear}-${startYear + duration}`;
    }

    const curYear = new Date().getFullYear();
    const curMonth = new Date().getMonth();
    const defAy = curMonth >= 5 ? `${curYear}-${curYear + 1}` : `${curYear - 1}-${curYear}`;
    const academicYear = enquiryData.academicYear || defAy;

    // First, clean up any previous excess synced fee records
    for (let i = validPayments.length; i < 10; i++) {
      const oldPayRef = doc(db, "fee_payments", `enq_pay_${enquiryId}_${i}`);
      const oldRecRef = doc(db, "fee_receipts", `enq_rec_${enquiryId}_${i}`);
      try {
        const [pSnap, rSnap] = await Promise.all([getDoc(oldPayRef), getDoc(oldRecRef)]);
        if (pSnap.exists()) await deleteDoc(oldPayRef);
        if (rSnap.exists()) await deleteDoc(oldRecRef);
        if (!pSnap.exists() && !rSnap.exists()) break;
      } catch (_) {}
    }

    if (validPayments.length === 0) {
      return { success: true, count: 0 };
    }

    for (let index = 0; index < validPayments.length; index++) {
      const p = validPayments[index];
      const amt = Number(p.feeAmount);
      const feeHead = p.feeCategory || (enquiryData.status === "Admission" || enquiryData.status === "Approved" ? "Admission Fee" : "Application Fee");
      const rawMode = String(p.paymentMode || "cash").toLowerCase();
      const resolvedMode = (rawMode === "cash" || rawMode.includes("hand")) ? "cash"
        : (rawMode === "pay_online" || rawMode === "upi" || rawMode === "online" || Boolean(p.upiNumber)) ? "upi"
        : rawMode === "dd" ? "dd"
        : rawMode === "cheque" ? "cheque"
        : "cash";

      const pDate = p.paymentDate || enquiryData.enquiryDate || enquiryData.admissionDate || new Date().toISOString().slice(0, 10);
      const cleanEnqId = String(enquiryId).replace(/[^A-Za-z0-9]/g, '');
      const receiptNo = p.receiptNo || `REC-APP-${cleanEnqId}-${index + 1}`;
      const refNo = p.upiNumber || p.refNo || appNo;

      const payDocId = `enq_pay_${enquiryId}_${index}`;
      const recDocId = `enq_rec_${enquiryId}_${index}`;

      const paymentRecord = {
        uid: enquiryId,
        studentId: enquiryId,
        examNumber: appNo,
        studentName,
        programme,
        department,
        batch,
        amount: amt,
        chargedAmount: amt,
        status: "SUCCESS",
        mode: resolvedMode,
        paymentMode: resolvedMode,
        feeHead,
        academicYear,
        semester: "All",
        remarks: `Admission Application Payment (${feeHead}) - ${appNo}`,
        refNo,
        receiptNo,
        paymentDate: pDate,
        createdAt: Timestamp.now(),
        isApplicationFee: true,
        source: "admission_enquiry",
        enquiryId,
        applicationNo: appNo,
        accountNo: "76980",
        accountName: "College Account #76980"
      };

      const receiptRecord = {
        uid: enquiryId,
        studentId: enquiryId,
        examNumber: appNo,
        studentName,
        programme,
        department,
        batch,
        amount: amt,
        status: "active",
        mode: resolvedMode,
        paymentMode: resolvedMode,
        feeHead,
        academicYear,
        remarks: `Admission Application Payment (${feeHead}) - ${appNo}`,
        refNo,
        receiptNo,
        paymentDate: pDate,
        createdAt: Timestamp.now(),
        isApplicationFee: true,
        source: "admission_enquiry",
        enquiryId,
        applicationNo: appNo,
        reprintCount: 0,
        items: [
          { head: feeHead, amount: amt }
        ],
        accountNo: "76980",
        accountName: "College Account #76980"
      };

      await Promise.all([
        setDoc(doc(db, "fee_payments", payDocId), paymentRecord, { merge: true }),
        setDoc(doc(db, "fee_receipts", recDocId), receiptRecord, { merge: true })
      ]);
    }

    return { success: true, count: validPayments.length };
  } catch (err) {
    console.error("Failed to sync enquiry payment to fee system:", err);
    return { success: false, error: err };
  }
}
