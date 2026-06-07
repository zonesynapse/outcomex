import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
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
  yearOfAdmission: asString(data.yearOfAdmission),
  studentCategory: asString(data.studentCategory),
  year: asString(data.year),
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
}

export async function deleteEnquiry(enquiryId) {
  if (!enquiryId) return;
  await deleteDoc(doc(db, ENQUIRY_ROOT, enquiryId));
}

export async function getEnquiryById(enquiryId) {
  if (!enquiryId) return null;
  const snap = await getDoc(doc(db, ENQUIRY_ROOT, enquiryId));
  if (!snap.exists()) return null;
  return normalizeEnquiry(enquiryId, snap.data());
}
