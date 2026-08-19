import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, onSnapshot, query, where } from "firebase/firestore";
import { User, GraduationCap, Mail, Calendar, Edit3, Check, Upload, Loader2, X, ChevronDown, ChevronRight, Save, Phone, MapPin, BookOpen, Users, Heart, Award, Globe, Hash, Camera } from "lucide-react";
import { formatProgDisplay, sanitizeKey } from "../../lib/utils";
import { getSeatConfigurationsRealtime } from "../../services/seatService";
import { uploadBase64, userStoragePath, deleteByUrl } from "../../utils/fileUpload";

const SECTIONS = [
  {
    key: 'personal', icon: User, title: 'Personal Information',
    fields: [
      { key: 'title', label: 'Title', type: 'select', options: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'] },
      { key: 'firstName', label: 'First Name', type: 'text' },
      { key: 'lastName', label: 'Last Name', type: 'text' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Others'] },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
      { key: 'nationality', label: 'Nationality', type: 'text' },
      { key: 'religion', label: 'Religion', type: 'select', options: ['Hindu', 'Muslim', 'Christian', 'Others'] },
      { key: 'community', label: 'Community', type: 'select', options: ['OC', 'BC', 'MBC', 'SC', 'ST', 'SCA', 'Others'] },
      { key: 'caste', label: 'Caste', type: 'text' },
      { key: 'motherTongue', label: 'Mother Tongue', type: 'text' },
      { key: 'bloodGroup', label: 'Blood Group', type: 'text' },
      { key: 'maritalStatus', label: 'Marital Status', type: 'select', options: ['Married', 'Unmarried'] },
      { key: 'aadharNo', label: 'Aadhaar Number', type: 'text' },
      { key: 'emailId', label: 'Email ID', type: 'text' },
    ]
  },
  {
    key: 'family', icon: Users, title: 'Family Details',
    fields: [
      { key: 'fatherGuardianName', label: 'Father / Guardian Name', type: 'text' },
      { key: 'motherName', label: 'Mother Name', type: 'text' },
      { key: 'guardianName', label: 'Guardian Name', type: 'text' },
      { key: 'fatherOccupationSector', label: 'Father Occupation Sector', type: 'select', options: ['Govt.', 'Pvt.', 'Self employed'] },
      { key: 'fatherOrganisation', label: 'Father Organisation', type: 'text' },
      { key: 'fatherDesignation', label: 'Father Designation', type: 'text' },
      { key: 'fatherAnnualIncome', label: 'Father Annual Income', type: 'text' },
      { key: 'motherOccupationSector', label: 'Mother Occupation Sector', type: 'select', options: ['Govt.', 'Pvt.', 'Self employed', 'Home Maker'] },
      { key: 'motherOrganisation', label: 'Mother Organisation', type: 'text' },
      { key: 'motherDesignation', label: 'Mother Designation', type: 'text' },
      { key: 'motherAnnualIncome', label: 'Mother Annual Income', type: 'text' },
      { key: 'familyAnnualIncome', label: 'Family Annual Income', type: 'text' },
    ]
  },
  {
    key: 'contact', icon: Phone, title: 'Contact Details',
    fields: [
      { key: 'mobile', label: 'Student Mobile Number', type: 'text' },
      { key: 'fatherMobile', label: 'Father Mobile Number', type: 'text' },
      { key: 'motherMobile', label: 'Mother Mobile Number', type: 'text' },
      { key: 'studentWhatsAppNo', label: 'Student WhatsApp Number', type: 'text' },
      { key: 'fatherWhatsApp', label: 'Father WhatsApp Number', type: 'text' },
      { key: 'motherWhatsApp', label: 'Mother WhatsApp Number', type: 'text' },
    ]
  },
  {
    key: 'address', icon: MapPin, title: 'Address Details',
    fields: [
      { key: 'presentHouseNo', label: 'Present House No', type: 'text' },
      { key: 'presentStreet', label: 'Present Street', type: 'text' },
      { key: 'presentLocality', label: 'Present Locality', type: 'text' },
      { key: 'presentCity', label: 'Present City', type: 'text' },
      { key: 'presentPincode', label: 'Present Pincode', type: 'text' },
      { key: 'presentDistrict', label: 'Present District', type: 'text' },
      { key: 'presentState', label: 'Present State', type: 'text' },
      { key: 'presentCountry', label: 'Present Country', type: 'text' },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea' },
      { key: 'permanentCity', label: 'Permanent City', type: 'text' },
      { key: 'permanentPincode', label: 'Permanent Pincode', type: 'text' },
      { key: 'permanentDistrict', label: 'Permanent District', type: 'text' },
      { key: 'permanentState', label: 'Permanent State', type: 'text' },
      { key: 'permanentCountry', label: 'Permanent Country', type: 'text' },
      { key: 'hostellerDayScholar', label: 'Hosteller / Day Scholar', type: 'select', options: ['Hosteller', 'Day scholar'] },
      { key: 'transportRequired', label: 'Transport Required', type: 'select', options: ['YES', 'NO'] },
      { key: 'transportRoute', label: 'Transport Route', type: 'text' },
      { key: 'transportStage', label: 'Transport Stage', type: 'text' },
    ]
  },
  {
    key: 'academic', icon: BookOpen, title: 'Academic Details',
    fields: [
      { key: 'schoolCollege', label: 'Previous School / College', type: 'text' },
      { key: 'mediumOfInstruction', label: 'Medium of Instruction', type: 'select', options: ['English', 'Tamil', 'English & Tamil'] },
      { key: 'examinationPassedAppeared', label: 'Examination Passed / Appeared', type: 'select', options: ['+2', 'Diploma', 'UG'] },
      { key: 'studentCategory', label: 'Student Category', type: 'select', options: ['Regular', 'Lateral Entry', 'Transfer', 'Readmission'] },
      { key: 'quotaAskedFor', label: 'Seat Category', type: 'select' },
      { key: 'scholarshipDetails', label: 'Scholarship Details', type: 'text' },
      { key: 'emsUmsNo', label: 'EMIS / UMIS Number', type: 'text' },
    ]
  },
  {
    key: 'qualifying', icon: Award, title: 'Qualifying Exam Marks',
    fields: [
      { key: 'mathsMark', label: 'Maths/P/C', type: 'text' },
      { key: 'physicsMark', label: 'Physics/Theory', type: 'text' },
      { key: 'chemistryMark', label: 'Chemistry/Lab', type: 'text' },
      { key: 'totalMarks', label: 'Total Marks', type: 'text' },
      { key: 'cutoff', label: 'Cutoff', type: 'text' },
      { key: 'qualifyingExam10thInstitute', label: '10th Institute', type: 'text' },
      { key: 'qualifyingExam10thBoard', label: '10th Board', type: 'text' },
      { key: 'qualifyingExam10thMonthYear', label: '10th Month / Year', type: 'date' },
      { key: 'qualifyingExam10thAttempts', label: '10th Attempts', type: 'text' },
      { key: 'qualifyingExam10thMarks', label: '10th Marks', type: 'text' },
      { key: 'qualifyingExam12thInstitute', label: '12th Institute', type: 'text' },
      { key: 'qualifyingExam12thBoard', label: '12th Board', type: 'text' },
      { key: 'qualifyingExam12thMonthYear', label: '12th Month / Year', type: 'date' },
      { key: 'qualifyingExam12thAttempts', label: '12th Attempts', type: 'text' },
      { key: 'qualifyingExam12thMarks', label: '12th Marks', type: 'text' },
      { key: 'qualifyingExamDipDegInstitute', label: 'Diploma / Degree Institute', type: 'text' },
      { key: 'qualifyingExamDipDegBoard', label: 'Diploma / Degree Board', type: 'text' },
      { key: 'qualifyingExamDipDegMonthYear', label: 'Diploma / Degree Month / Year', type: 'text' },
      { key: 'qualifyingExamDipDegAttempts', label: 'Diploma / Degree Attempts', type: 'text' },
      { key: 'qualifyingExamDipDegMarks', label: 'Diploma / Degree Marks', type: 'text' },
    ]
  }
];

const inputClass = "w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none text-sm bg-white transition-all";
const selectClass = "w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none text-sm bg-white transition-all";

const mapEnquiryToProfileFields = (enq) => {
  if (!enq || typeof enq !== 'object') return {};
  const mapped = {};

  const getVal = (...keys) => {
    for (const k of keys) {
      if (enq[k] !== undefined && enq[k] !== null && String(enq[k]).trim() !== "") {
        return String(enq[k]).trim();
      }
    }
    return "";
  };

  // Personal Information
  if (getVal("title")) mapped.title = getVal("title");
  if (getVal("firstName")) mapped.firstName = getVal("firstName");
  if (getVal("lastName")) mapped.lastName = getVal("lastName");
  if (!mapped.firstName && getVal("studentName")) {
    const parts = getVal("studentName").split(" ");
    mapped.firstName = parts[0] || "";
    mapped.lastName = parts.slice(1).join(" ") || "";
  }
  if (getVal("gender")) mapped.gender = getVal("gender");
  if (getVal("dateOfBirth")) mapped.dateOfBirth = getVal("dateOfBirth");
  if (getVal("nationality")) mapped.nationality = getVal("nationality");
  if (getVal("religion")) mapped.religion = getVal("religion");
  if (getVal("community")) mapped.community = getVal("community");
  if (getVal("caste")) mapped.caste = getVal("caste");
  if (getVal("motherTongue")) mapped.motherTongue = getVal("motherTongue");
  if (getVal("bloodGroup")) mapped.bloodGroup = getVal("bloodGroup");
  if (getVal("maritalStatus")) mapped.maritalStatus = getVal("maritalStatus");
  if (getVal("aadharNo", "aadhaarNo")) mapped.aadharNo = getVal("aadharNo", "aadhaarNo");
  if (getVal("emailId", "email")) mapped.emailId = getVal("emailId", "email");

  // Family Details
  if (getVal("fatherGuardianName", "fatherName", "parentName")) mapped.fatherGuardianName = getVal("fatherGuardianName", "fatherName", "parentName");
  if (getVal("motherName")) mapped.motherName = getVal("motherName");
  if (getVal("guardianName")) mapped.guardianName = getVal("guardianName");
  if (getVal("fatherOccupationSector", "parentOccupation", "fatherOccupation")) mapped.fatherOccupationSector = getVal("fatherOccupationSector", "parentOccupation", "fatherOccupation");
  if (getVal("fatherOrganisation", "parentOrganisation")) mapped.fatherOrganisation = getVal("fatherOrganisation", "parentOrganisation");
  if (getVal("fatherDesignation", "parentDesignation")) mapped.fatherDesignation = getVal("fatherDesignation", "parentDesignation");
  if (getVal("fatherAnnualIncome", "parentAnnualIncome")) mapped.fatherAnnualIncome = getVal("fatherAnnualIncome", "parentAnnualIncome");
  if (getVal("motherOccupationSector", "motherOccupation")) mapped.motherOccupationSector = getVal("motherOccupationSector", "motherOccupation");
  if (getVal("motherOrganisation")) mapped.motherOrganisation = getVal("motherOrganisation");
  if (getVal("motherDesignation")) mapped.motherDesignation = getVal("motherDesignation");
  if (getVal("motherAnnualIncome")) mapped.motherAnnualIncome = getVal("motherAnnualIncome");
  if (getVal("familyAnnualIncome")) mapped.familyAnnualIncome = getVal("familyAnnualIncome");

  // Contact Details
  if (getVal("mobile", "studentMobile")) mapped.mobile = getVal("mobile", "studentMobile");
  if (getVal("fatherMobile", "parentMobile")) mapped.fatherMobile = getVal("fatherMobile", "parentMobile");
  if (getVal("motherMobile")) mapped.motherMobile = getVal("motherMobile");
  if (getVal("studentWhatsAppNo")) mapped.studentWhatsAppNo = getVal("studentWhatsAppNo");
  if (getVal("fatherWhatsApp", "parentWhatsAppNo")) mapped.fatherWhatsApp = getVal("fatherWhatsApp", "parentWhatsAppNo");
  if (getVal("motherWhatsApp")) mapped.motherWhatsApp = getVal("motherWhatsApp");

  // Address Details
  if (getVal("presentHouseNo")) mapped.presentHouseNo = getVal("presentHouseNo");
  if (getVal("presentStreet")) mapped.presentStreet = getVal("presentStreet");
  if (getVal("presentLocality")) mapped.presentLocality = getVal("presentLocality");
  if (getVal("presentCity", "address")) mapped.presentCity = getVal("presentCity", "address");
  if (getVal("presentPincode")) mapped.presentPincode = getVal("presentPincode");
  if (getVal("presentDistrict")) mapped.presentDistrict = getVal("presentDistrict");
  if (getVal("presentState")) mapped.presentState = getVal("presentState");
  if (getVal("presentCountry")) mapped.presentCountry = getVal("presentCountry");

  if (getVal("permanentAddress", "address")) mapped.permanentAddress = getVal("permanentAddress", "address");
  if (getVal("permanentCity")) mapped.permanentCity = getVal("permanentCity");
  if (getVal("permanentPincode")) mapped.permanentPincode = getVal("permanentPincode");
  if (getVal("permanentDistrict")) mapped.permanentDistrict = getVal("permanentDistrict");
  if (getVal("permanentState")) mapped.permanentState = getVal("permanentState");
  if (getVal("permanentCountry")) mapped.permanentCountry = getVal("permanentCountry");

  if (getVal("hostellerDayScholar")) mapped.hostellerDayScholar = getVal("hostellerDayScholar");
  if (getVal("transportRequired")) mapped.transportRequired = getVal("transportRequired");
  if (getVal("transportRoute")) mapped.transportRoute = getVal("transportRoute");
  if (getVal("transportStage")) mapped.transportStage = getVal("transportStage");

  // Academic Details
  if (getVal("schoolCollege", "qualifyingExamInstitute")) mapped.schoolCollege = getVal("schoolCollege", "qualifyingExamInstitute");
  if (getVal("mediumOfInstruction")) mapped.mediumOfInstruction = getVal("mediumOfInstruction");
  if (getVal("examinationPassedAppeared")) mapped.examinationPassedAppeared = getVal("examinationPassedAppeared");
  if (getVal("studentCategory")) mapped.studentCategory = getVal("studentCategory");
  if (getVal("quotaAskedFor", "seatCategory")) mapped.quotaAskedFor = getVal("quotaAskedFor", "seatCategory");
  if (getVal("scholarshipDetails")) mapped.scholarshipDetails = getVal("scholarshipDetails");
  if (getVal("emsUmsNo")) mapped.emsUmsNo = getVal("emsUmsNo");

  // Qualifying Exam Marks
  if (getVal("mathsMark")) mapped.mathsMark = getVal("mathsMark");
  if (getVal("physicsMark")) mapped.physicsMark = getVal("physicsMark");
  if (getVal("chemistryMark")) mapped.chemistryMark = getVal("chemistryMark");
  if (getVal("totalMarks")) mapped.totalMarks = getVal("totalMarks");
  if (getVal("cutoff")) mapped.cutoff = getVal("cutoff");

  if (getVal("qualifyingExam10thInstitute")) mapped.qualifyingExam10thInstitute = getVal("qualifyingExam10thInstitute");
  if (getVal("qualifyingExam10thBoard")) mapped.qualifyingExam10thBoard = getVal("qualifyingExam10thBoard");
  if (getVal("qualifyingExam10thMonthYear")) mapped.qualifyingExam10thMonthYear = getVal("qualifyingExam10thMonthYear");
  if (getVal("qualifyingExam10thAttempts")) mapped.qualifyingExam10thAttempts = getVal("qualifyingExam10thAttempts");
  if (getVal("qualifyingExam10thMarks")) mapped.qualifyingExam10thMarks = getVal("qualifyingExam10thMarks");

  if (getVal("qualifyingExam12thInstitute")) mapped.qualifyingExam12thInstitute = getVal("qualifyingExam12thInstitute");
  if (getVal("qualifyingExam12thBoard")) mapped.qualifyingExam12thBoard = getVal("qualifyingExam12thBoard");
  if (getVal("qualifyingExam12thMonthYear")) mapped.qualifyingExam12thMonthYear = getVal("qualifyingExam12thMonthYear");
  if (getVal("qualifyingExam12thAttempts")) mapped.qualifyingExam12thAttempts = getVal("qualifyingExam12thAttempts");
  if (getVal("qualifyingExam12thMarks")) mapped.qualifyingExam12thMarks = getVal("qualifyingExam12thMarks");

  if (getVal("qualifyingExamDipDegInstitute")) mapped.qualifyingExamDipDegInstitute = getVal("qualifyingExamDipDegInstitute");
  if (getVal("qualifyingExamDipDegBoard")) mapped.qualifyingExamDipDegBoard = getVal("qualifyingExamDipDegBoard");
  if (getVal("qualifyingExamDipDegMonthYear")) mapped.qualifyingExamDipDegMonthYear = getVal("qualifyingExamDipDegMonthYear");
  if (getVal("qualifyingExamDipDegAttempts")) mapped.qualifyingExamDipDegAttempts = getVal("qualifyingExamDipDegAttempts");
  if (getVal("qualifyingExamDipDegMarks")) mapped.qualifyingExamDipDegMarks = getVal("qualifyingExamDipDegMarks");

  return mapped;
};

export default function StudentProfile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [editSig, setEditSig] = useState(false);
  const [sigUrl, setSigUrl] = useState("");
  const fileRef = useRef(null);
  const photoFileRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [studentDocId, setStudentDocId] = useState("");
  const [regNo, setRegNo] = useState("");
  const [formData, setFormData] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [quotaOptions, setQuotaOptions] = useState([]);

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
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const maths = toNum(formData.mathsMark);
    const physics = toNum(formData.physicsMark);
    const chemistry = toNum(formData.chemistryMark);
    let val = '';
    if (maths !== null && physics !== null && chemistry !== null) {
      const cutoff = maths + physics / 2 + chemistry / 2;
      val = Number.isInteger(cutoff) ? String(cutoff) : String(Number(cutoff.toFixed(2)));
    }
    if (formData.cutoff !== val) {
      setFormData(prev => ({ ...prev, cutoff: val }));
    }
  }, [formData.mathsMark, formData.physicsMark, formData.chemistryMark]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const uData = snap.data();
            setUserData(uData);

            const reg = uData.regNo || '';
            setRegNo(reg);

            // Resolve studentDocId from student_index
            let sDocId = '';
            if (reg) {
              const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
              if (idxSnap.exists()) {
                sDocId = idxSnap.data().studentDocId || '';
              }

              // Fallback: scan students collection to find the doc containing this student
              if (!sDocId) {
                try {
                  const studentsSnap = await getDocs(collection(db, 'students'));
                  for (const d of studentsSnap.docs) {
                    const sData = d.data();
                    if (sData._order?.includes(reg) || sData[reg]) {
                      sDocId = d.id;
                      break;
                    }
                  }
                } catch (_) {}
              }
            }
            setStudentDocId(sDocId);

            // Load existing _student_data or _profile_data if available
            const initial = {};
            SECTIONS.forEach(sec => sec.fields.forEach(f => { initial[f.key] = ''; }));

            // 1. Pre-fill from enquiries (Admission Application Data)
            try {
              const candidateKeys = new Set([
                reg, uData.applicationNo, uData.enquiryId, uData.admissionNo,
                uData.examNumber, uData.email, uData.mobile, user.email, user.uid
              ].filter(Boolean));

              for (const k of candidateKeys) {
                const strKey = String(k).trim();
                const qArr = [
                  query(collection(db, "enquiries"), where("applicationNo", "==", strKey)),
                  query(collection(db, "enquiries"), where("enquiryId", "==", strKey)),
                  query(collection(db, "enquiries"), where("regNo", "==", strKey)),
                  query(collection(db, "enquiries"), where("emailId", "==", strKey)),
                  query(collection(db, "enquiries"), where("mobile", "==", strKey))
                ];
                for (const q of qArr) {
                  const enqSnap = await getDocs(q);
                  if (!enqSnap.empty) {
                    const enqMapped = mapEnquiryToProfileFields(enqSnap.docs[0].data());
                    Object.entries(enqMapped).forEach(([fk, fv]) => {
                      if (fv && (!initial[fk] || !initial[fk].trim())) initial[fk] = fv;
                    });
                    break;
                  }
                }
              }
            } catch (enqErr) { console.warn("Enquiry prefill error:", enqErr); }

            // 2. Override with saved student/profile data if edited by user/staff
            if (sDocId && reg) {
              try {
                const sSnap = await getDoc(doc(db, 'students', sDocId));
                if (sSnap.exists()) {
                  const sData = sSnap.data();
                  const extra = sData._student_data?.[reg] || {};
                  Object.keys(extra).forEach(k => {
                    if (k in initial && extra[k]) initial[k] = extra[k];
                  });
                  if (extra._sameAsPresent === 'true') setSameAsPresent(true);
                }
              } catch (_) {}
            } else if (uData._profile_data) {
              Object.keys(uData._profile_data).forEach(k => {
                if (k in initial && uData._profile_data[k]) initial[k] = uData._profile_data[k];
              });
              if (uData._profile_data._sameAsPresent === 'true') setSameAsPresent(true);
            }

            // 3. Fallback contact info from users doc
            if (uData.email && !initial.emailId) initial.emailId = uData.email;
            if (uData.studentName && (!initial.firstName || !initial.lastName)) {
              const parts = uData.studentName.split(' ');
              if (!initial.firstName) initial.firstName = parts[0] || '';
              if (!initial.lastName) initial.lastName = parts.slice(1).join(' ') || '';
            }

            setFormData(initial);
          }
        } catch (err) { console.error(err); }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Real-time listener for admission enquiry changes
  useEffect(() => {
    if (!userData) return;
    const candidateKeys = Array.from(new Set([
      userData.regNo, userData.applicationNo, userData.enquiryId, userData.admissionNo,
      userData.examNumber, userData.email, userData.emailId, auth.currentUser?.email,
      userData.mobile, userData.parentMobile
    ].filter(Boolean))).map(v => String(v).trim());

    if (candidateKeys.length === 0) return;

    const unsubs = [];
    const handleEnqSnap = (snap) => {
      snap.forEach(d => {
        if (!d.exists()) return;
        const enqMapped = mapEnquiryToProfileFields(d.data());
        setFormData(prev => {
          const nextData = { ...prev };
          let changed = false;
          Object.entries(enqMapped).forEach(([fk, fv]) => {
            if (fv && (!nextData[fk] || !String(nextData[fk]).trim())) {
              nextData[fk] = fv;
              changed = true;
            }
          });
          return changed ? nextData : prev;
        });
      });
    };

    candidateKeys.forEach(k => {
      unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("applicationNo", "==", k)), handleEnqSnap, () => {}));
      unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("enquiryId", "==", k)), handleEnqSnap, () => {}));
      unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("regNo", "==", k)), handleEnqSnap, () => {}));
    });
    if (userData.email || auth.currentUser?.email) {
      const email = (userData.email || auth.currentUser?.email).trim();
      unsubs.push(onSnapshot(query(collection(db, "enquiries"), where("emailId", "==", email)), handleEnqSnap, () => {}));
    }

    return () => unsubs.forEach(fn => fn());
  }, [userData]);

  useEffect(() => {
    if (!studentDocId || !regNo) return;
    const unsub = onSnapshot(doc(db, 'students', studentDocId), (snap) => {
      if (!snap.exists()) return;
      const extra = snap.data()?._student_data?.[regNo] || {};
      setFormData(prev => {
        const updated = { ...prev };
        Object.keys(extra).forEach(k => {
          if (k in updated) updated[k] = extra[k];
        });
        return updated;
      });
      if (extra._sameAsPresent === 'true') setSameAsPresent(true);
    });
    return () => unsub();
  }, [studentDocId, regNo]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSigUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 51200) { showToast("Max 50KB", "error"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setSigUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveSig = async () => {
    if (!auth.currentUser) return;
    let urlToSave = sigUrl;
    const isNewUpload = sigUrl && sigUrl.startsWith('data:');
    if (isNewUpload) {
      const oldSig = userData?.signatureUrl;
      if (oldSig && oldSig.startsWith('http')) {
        await deleteByUrl(oldSig).catch(() => {});
      }
      const storagePath = userStoragePath(auth.currentUser.uid, 'signatures', 'signature.png');
      urlToSave = await uploadBase64(storagePath, sigUrl);
    }
    await setDoc(doc(db, "users", auth.currentUser.uid), { signatureUrl: urlToSave }, { merge: true });
    setUserData(prev => ({ ...prev, signatureUrl: urlToSave }));
    setEditSig(false);
    showToast("Signature saved");
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20480) { showToast("Photo must be under 20KB", "error"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      setPhotoPreview(dataUrl);
      setPhotoUploading(true);
      try {
        const storagePath = userStoragePath(auth.currentUser.uid, 'profile_photos', 'profile.jpg');
        const url = await uploadBase64(storagePath, dataUrl);
        const oldPhoto = userData?.photoURL;
        if (oldPhoto && oldPhoto.startsWith('http') && oldPhoto !== url) {
          await deleteByUrl(oldPhoto).catch(() => {});
        }
        await setDoc(doc(db, "users", auth.currentUser.uid), { photoURL: url }, { merge: true });
        setUserData(prev => ({ ...prev, photoURL: url }));
        setPhotoPreview("");
        showToast("Profile photo updated!");
      } catch (err) {
        console.error("Photo upload error:", err);
        setPhotoPreview("");
        showToast("Failed to upload photo", "error");
      } finally {
        setPhotoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const countFilled = (section) => {
    return section.fields.filter(f => formData[f.key]?.trim()).length;
  };

  const handleSave = async () => {
    if (!auth.currentUser || !userData) return;
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;

      // Save contact info to users doc
      const userUpdates = {};
      if (formData.mobile) userUpdates.mobile = formData.mobile;
      if (formData.emailId) userUpdates.email = formData.emailId;
      if (formData.firstName || formData.lastName) {
        const fn = formData.firstName || userData.studentName?.split(' ')[0] || '';
        const ln = formData.lastName || userData.studentName?.split(' ').slice(1).join(' ') || '';
        userUpdates.studentName = [fn, ln].filter(Boolean).join(' ').trim();
      }
      if (Object.keys(userUpdates).length > 0) {
        await updateDoc(doc(db, 'users', uid), userUpdates);
        setUserData(prev => ({ ...prev, ...userUpdates }));
      }

      // Build extra data: only non-empty non-default fields
      const extra = {};
      SECTIONS.forEach(sec => {
        sec.fields.forEach(f => {
          const v = formData[f.key];
          if (v && v.trim()) extra[f.key] = v.trim();
        });
      });

      // If "same as present address" is on, copy present → permanent
      if (sameAsPresent) {
        const copyMap = {
          presentCity: 'permanentCity', presentPincode: 'permanentPincode',
          presentDistrict: 'permanentDistrict', presentState: 'permanentState',
          presentCountry: 'permanentCountry'
        };
        Object.entries(copyMap).forEach(([src, dest]) => {
          if (formData[src]?.trim()) extra[dest] = formData[src].trim();
        });
        const addrParts = [
          formData.presentHouseNo, formData.presentStreet, formData.presentLocality,
          formData.presentCity, formData.presentPincode, formData.presentDistrict,
          formData.presentState, formData.presentCountry
        ].filter(Boolean);
        if (addrParts.length > 0) extra.permanentAddress = addrParts.join(', ');
        extra._sameAsPresent = 'true';
      }

      // Save to students doc if available, otherwise to users doc
      if (studentDocId && regNo) {
        const studentRef = doc(db, 'students', studentDocId);
        const snap = await getDoc(studentRef);
        const existing = snap.exists() ? snap.data() : {};

        await setDoc(studentRef, {
          ...existing,
          _student_data: {
            ...(existing._student_data || {}),
            [regNo]: { ...(existing._student_data?.[regNo] || {}), ...extra }
          }
        }, { merge: true });
      }

      // Always persist _profile_data to users doc for quick reference
      await setDoc(doc(db, 'users', uid), { _profile_data: extra }, { merge: true });

      // Also sync updates back to matching enquiry doc if present
      try {
        const syncKeys = Array.from(new Set([
          regNo, userData.applicationNo, userData.enquiryId, userData.admissionNo,
          userData.email, userData.mobile, auth.currentUser?.email
        ].filter(Boolean))).map(v => String(v).trim());

        for (const k of syncKeys) {
          const qArr = [
            query(collection(db, "enquiries"), where("applicationNo", "==", k)),
            query(collection(db, "enquiries"), where("enquiryId", "==", k)),
            query(collection(db, "enquiries"), where("regNo", "==", k))
          ];
          for (const q of qArr) {
            const enqSnap = await getDocs(q);
            if (!enqSnap.empty) {
              await updateDoc(doc(db, "enquiries", enqSnap.docs[0].id), extra);
              break;
            }
          }
        }
      } catch (syncErr) { console.warn("Enquiry sync save error:", syncErr); }

      showToast("Profile data saved successfully!");
    } catch (err) {
      console.error("Save error:", err);
      showToast("Failed to save: " + err.message, "error");
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#120c7a]" size={40} /></div>
  );

  if (!userData) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">Please login.</div>
  );

  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
  const displayDept = (v) => {
    if (typeof v !== 'string') return v || '--';
    let result = v;
    for (const { key, display } of progPrefixMap) {
      const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
      if (regex.test(result)) {
        result = result.replace(regex, display + ' ');
        break;
      }
    }
    return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  };

  const canEdit = userData.profileEditAccess === true;

  const sectionFromDoc = (studentDocId.split('_').find(p => p.startsWith('Sec-')) || '').replace('Sec-', '');
  const sectionDisplay = userData.section || sectionFromDoc || '';

  const infoRows = [
    { label: "Register Number", value: userData.regNo, icon: GraduationCap },
    { label: "Student Name", value: userData.studentName, icon: User },
    { label: "Programme", value: formatProgDisplay(userData.programme), icon: GraduationCap },
    { label: "Department", value: displayDept(userData.department), icon: GraduationCap },
    { label: "Section", value: sectionDisplay, icon: Users },
    { label: "Batch", value: userData.batch, icon: Calendar },
    { label: "Email", value: userData.email, icon: Mail },
  ];

  const filledCount = SECTIONS.reduce((sum, sec) => sum + countFilled(sec), 0);
  const totalFields = SECTIONS.reduce((sum, sec) => sum + sec.fields.length, 0);

  const fieldInput = (f) => {
    const val = formData[f.key] || '';
    if (!canEdit) {
      return (
        <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
          <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{f.label}</label>
          <div className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-600 bg-zinc-50 min-h-[38px]">{val || <span className="text-zinc-300">—</span>}</div>
        </div>
      );
    }
    return (
      <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
        <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{f.label}</label>
        {f.key === 'cutoff' ? (
          <input type="text" value={val} readOnly className={`${inputClass} bg-zinc-50 text-zinc-500 cursor-not-allowed`} placeholder="Auto-calculated" />
        ) : f.type === 'select' ? (
          <select value={val} onChange={e => handleFieldChange(f.key, e.target.value)} className={selectClass}>
            {f.key === 'quotaAskedFor' ? null : <option value="">-- Select --</option>}
            {(f.key === 'quotaAskedFor' ? quotaOptions : f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.type === 'textarea' ? (
          <textarea value={val} onChange={e => handleFieldChange(f.key, e.target.value)} className={`${inputClass} min-h-[80px] resize-y`} rows={3} />
        ) : f.type === 'date' ? (
          <input type="date" value={val} onChange={e => handleFieldChange(f.key, e.target.value)} className={inputClass} />
        ) : (
          <input type="text" value={val} onChange={e => handleFieldChange(f.key, e.target.value)} className={inputClass} placeholder={`Enter ${f.label.toLowerCase()}`} />
        )}
      </div>
    );
  };

  const addressFields = (fields) => {
    const present = fields.filter(f => f.key.startsWith('present'));
    const transport = fields.filter(f => ['hostellerDayScholar','transportRequired','transportRoute','transportStage'].includes(f.key));
    if (!canEdit) {
      return (
        <>
          {present.map(f => fieldInput(f))}
          <div className="sm:col-span-2 flex items-center gap-3 pt-2 pb-1 border-t border-zinc-100">
            <div className="inline-flex h-6 w-11 items-center rounded-full bg-zinc-200"><span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" /></div>
            <span className="text-xs font-semibold text-zinc-400">Permanent address is same as present address</span>
          </div>
          <div className="sm:col-span-2"><p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Permanent Address</p></div>
          {fields.filter(f => f.key.startsWith('permanent')).map(f => fieldInput(f))}
          {transport.map(f => fieldInput(f))}
        </>
      );
    }
    return (
      <>
        {present.map(f => fieldInput(f))}
        <div className="sm:col-span-2 flex items-center gap-3 pt-2 pb-1 border-t border-zinc-100">
          <button
            type="button"
            onClick={() => setSameAsPresent(!sameAsPresent)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sameAsPresent ? 'bg-[#120c7a]' : 'bg-zinc-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sameAsPresent ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-xs font-semibold text-zinc-600">Permanent address is same as present address</span>
        </div>
        {sameAsPresent ? null : (
          <>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Permanent Address</p>
            </div>
            {fields.filter(f => f.key.startsWith('permanent')).map(f => fieldInput(f))}
          </>
        )}
        {transport.map(f => fieldInput(f))}
      </>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl text-white font-semibold text-sm animate-in fade-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-600' : 'bg-slate-900'}`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] rounded-2xl p-5 md:p-8 text-white mb-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30 overflow-hidden">
              {(photoPreview || userData.photoURL) ? (
                <img src={photoPreview || userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">
                  {userData.studentName?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'S'}
                </span>
              )}
            </div>
            <>
              <button
                type="button"
                onClick={() => photoFileRef.current?.click()}
                disabled={photoUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white text-[#120c7a] flex items-center justify-center shadow-md border border-zinc-200 hover:bg-zinc-50 transition-all disabled:opacity-50"
                title="Upload Profile Photo (max 20KB)"
              >
                {photoUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              </button>
              <input type="file" accept="image/*" className="hidden" ref={photoFileRef} onChange={handlePhotoChange} />
            </>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{userData.studentName}</h1>
            <p className="text-blue-200 text-sm mt-1">{userData.regNo}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
            <Check size={14} className="text-green-300" />
            <span className="text-xs font-medium">{filledCount}/{totalFields} fields filled</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
          <h2 className="text-base font-bold text-zinc-700 mb-4 flex items-center gap-2">
            <User size={18} className="text-[#120c7a]" /> Personal Details
          </h2>
          <div className="space-y-4">
            {infoRows.map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center">
                  <row.icon size={14} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{row.label}</p>
                  <p className="text-sm font-semibold text-zinc-700 truncate">{row.value || '--'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
          <h2 className="text-base font-bold text-zinc-700 mb-4 flex items-center gap-2">
            <Edit3 size={18} className="text-[#120c7a]" /> Digital Signature
          </h2>
          {editSig && canEdit ? (
            <div className="space-y-3">
              <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={handleSigUpload} />
              <div onClick={() => fileRef.current.click()} className="border-2 border-dashed border-zinc-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#120c7a]/40 hover:bg-[#120c7a]/5 transition-all">
                {sigUrl || userData.signatureUrl ? (
                  <img src={sigUrl || userData.signatureUrl} alt="Signature" className="max-h-16 object-contain" />
                ) : (
                  <div className="text-zinc-400 flex flex-col items-center">
                    <Upload size={24} />
                    <span className="text-xs font-medium mt-1">Upload Signature</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 italic">Max 50KB, PNG with transparent background</p>
              <div className="flex gap-2">
                <button onClick={handleSaveSig} className="flex-1 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-lg hover:bg-[#0e095e] transition-colors flex items-center justify-center gap-1">
                  <Check size={14} /> Save
                </button>
                <button onClick={() => { setEditSig(false); setSigUrl(""); }} className="flex-1 py-2 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center min-h-[80px] border border-zinc-100">
                {userData.signatureUrl ? (
                  <img src={userData.signatureUrl} alt="Signature" className="max-h-14 object-contain" />
                ) : (
                  <p className="text-xs text-zinc-400 italic">No signature uploaded</p>
                )}
              </div>
              {canEdit && (
                <button onClick={() => { setEditSig(true); setSigUrl(userData.signatureUrl || ""); }} className="w-full py-2 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1">
                  <Edit3 size={14} /> Update Signature
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {SECTIONS.map(section => {
          const isOpen = expandedSections[section.key] !== false;
          const filled = countFilled(section);
          return (
            <div key={section.key} className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#120c7a]/10 flex items-center justify-center">
                    <section.icon size={16} className="text-[#120c7a]" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-zinc-700">{section.title}</h3>
                    <p className="text-[10px] text-zinc-400 font-medium">{filled}/{section.fields.length} fields</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-16 md:w-24 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${(filled / section.fields.length) * 100}%` }}
                    />
                  </div>
                  {isOpen ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 md:px-5 pb-5 border-t border-zinc-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    {section.key === 'address'
                      ? addressFields(section.fields)
                      : section.fields.map(f => fieldInput(f))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-[#120c7a] text-white font-bold rounded-xl hover:bg-[#0e095e] focus:ring-4 focus:ring-[#120c7a]/30 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-400 mt-4">
        {studentDocId ? 'Data is stored securely in your student profile' : 'Data saved — will be synced to your permanent profile when section is allotted'}
      </p>
    </div>
  );
}
