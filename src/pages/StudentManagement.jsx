import { useState, useEffect, useMemo, useRef } from "react";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, getDoc, getDocs, query, where, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Search, X, Users, AlertCircle, Eye, Pencil, Save, ToggleLeft, ToggleRight, Loader2, User, Phone, MapPin, BookOpen, Award, Heart, ChevronDown, ChevronRight } from "lucide-react";
import Layout from "../components/Layout";
import { formatProgDisplay, sanitizeKey, formatProgrammeKey } from "../lib/utils";
import { getSeatConfigurationsRealtime } from "../services/seatService";

const displayDept = (v) => {
  if (typeof v !== 'string') return v || '--';
  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
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

const PROFILE_SECTIONS = [
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
    key: 'family', icon: Heart, title: 'Family Details',
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
      { key: 'mobile', label: 'Student Mobile', type: 'text' },
      { key: 'fatherMobile', label: 'Father Mobile', type: 'text' },
      { key: 'motherMobile', label: 'Mother Mobile', type: 'text' },
      { key: 'studentWhatsAppNo', label: 'Student WhatsApp', type: 'text' },
      { key: 'fatherWhatsApp', label: 'Father WhatsApp', type: 'text' },
      { key: 'motherWhatsApp', label: 'Mother WhatsApp', type: 'text' },
    ]
  },
  {
    key: 'address', icon: MapPin, title: 'Address Details',
    fields: [
      { key: 'presentHouseNo', label: 'House No', type: 'text' }, { key: 'presentStreet', label: 'Street', type: 'text' },
      { key: 'presentLocality', label: 'Locality', type: 'text' }, { key: 'presentCity', label: 'City', type: 'text' },
      { key: 'presentPincode', label: 'Pincode', type: 'text' }, { key: 'presentDistrict', label: 'District', type: 'text' },
      { key: 'presentState', label: 'State', type: 'text' }, { key: 'presentCountry', label: 'Country', type: 'text' },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea' }, { key: 'permanentCity', label: 'Permanent City', type: 'text' },
      { key: 'permanentPincode', label: 'Permanent Pincode', type: 'text' }, { key: 'permanentDistrict', label: 'Permanent District', type: 'text' },
      { key: 'permanentState', label: 'Permanent State', type: 'text' }, { key: 'permanentCountry', label: 'Permanent Country', type: 'text' },
      { key: 'hostellerDayScholar', label: 'Hosteller / Day Scholar', type: 'select', options: ['Hosteller', 'Day scholar'] },
      { key: 'transportRequired', label: 'Transport Required', type: 'select', options: ['YES', 'NO'] },
      { key: 'transportRoute', label: 'Transport Route', type: 'text' }, { key: 'transportStage', label: 'Transport Stage', type: 'text' },
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
      { key: 'mathsMark', label: 'Maths/P/C', type: 'text' }, { key: 'physicsMark', label: 'Physics/Theory', type: 'text' },
      { key: 'chemistryMark', label: 'Chemistry/Lab', type: 'text' }, { key: 'totalMarks', label: 'Total Marks', type: 'text' },
      { key: 'cutoff', label: 'Cutoff', type: 'text' },
      { key: 'qualifyingExam10thInstitute', label: '10th Institute', type: 'text' }, { key: 'qualifyingExam10thBoard', label: '10th Board', type: 'text' },
      { key: 'qualifyingExam10thMonthYear', label: '10th Month / Year', type: 'date' }, { key: 'qualifyingExam10thAttempts', label: '10th Attempts', type: 'text' },
      { key: 'qualifyingExam10thMarks', label: '10th Marks', type: 'text' },
      { key: 'qualifyingExam12thInstitute', label: '12th Institute', type: 'text' }, { key: 'qualifyingExam12thBoard', label: '12th Board', type: 'text' },
      { key: 'qualifyingExam12thMonthYear', label: '12th Month / Year', type: 'date' }, { key: 'qualifyingExam12thAttempts', label: '12th Attempts', type: 'text' },
      { key: 'qualifyingExam12thMarks', label: '12th Marks', type: 'text' },
      { key: 'qualifyingExamDipDegInstitute', label: 'Diploma / Degree Institute', type: 'text' }, { key: 'qualifyingExamDipDegBoard', label: 'Diploma / Degree Board', type: 'text' },
      { key: 'qualifyingExamDipDegMonthYear', label: 'Diploma / Degree Month / Year', type: 'text' }, { key: 'qualifyingExamDipDegAttempts', label: 'Diploma / Degree Attempts', type: 'text' },
      { key: 'qualifyingExamDipDegMarks', label: 'Diploma / Degree Marks', type: 'text' },
    ]
  },
];

export default function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [batchFilter, setBatchFilter] = useState("");

  useEffect(() => {
    let unsubscribeUserData = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeUserData = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserData(snapshot.data());
          }
        });
      } else {
        setUserData(null);
        unsubscribeUserData();
      }
    });

    const fetchStudents = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "Student"));
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ ...d.data(), uid: d.id }));
        all.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setStudents(all);
      } catch (err) {
        console.error("Error fetching students:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();

    return () => {
      unsubscribeAuth();
      unsubscribeUserData();
    };
  }, []);

  const canView = userData?.role === 'Admin' || userData?.role === 'HOD' || user?.email === import.meta.env.VITE_DEFAULT_ADMIN_EMAIL || user?.email === import.meta.env.VITE_MASTER_ADMIN_EMAIL;

  const hodScopedStudents = useMemo(() => {
    if (userData?.role !== 'HOD') return students;
    const hodProgKey = formatProgrammeKey(userData.programme || '');
    const hodDept = userData.department || '';
    return students.filter(s => {
      const sProgKey = formatProgrammeKey(s.programme || '');
      if (sProgKey !== hodProgKey) return false;
      if (!hodDept) return true;
      const raw = s.department || '';
      const progPrefixPattern = /^(B_E|B_Tech|M_E|M_Tech|B_Sc|M_Sc|B_C_A|M_C_A|B_B_A|M_B_A|B_Com|M_Com|B_A|M_A)[_ ]*/i;
      const cleanedSDept = raw.replace(progPrefixPattern, '');
      const sDept = sanitizeKey(cleanedSDept).replace(/[_ ]+/g, ' ').trim().toLowerCase();
      const hDept = sanitizeKey(hodDept).replace(/[_ ]+/g, ' ').trim().toLowerCase();
      return sDept === hDept || sDept.includes(hDept) || hDept.includes(sDept);
    });
  }, [students, userData]);

  const availableBatches = useMemo(() => {
    const set = new Set();
    hodScopedStudents.forEach(s => { if (s.batch) set.add(s.batch); });
    return Array.from(set).sort();
  }, [hodScopedStudents]);

  const filteredStudents = useMemo(() => {
    let list = hodScopedStudents;

    if (batchFilter) {
      list = list.filter(s => s.batch === batchFilter);
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(s =>
      (s.displayName || s.studentName || "").toLowerCase().includes(term) ||
      (s.email || "").toLowerCase().includes(term) ||
      (s.regNo || "").toLowerCase().includes(term)
    );
  }, [hodScopedStudents, searchTerm, batchFilter]);

  const [profileStudent, setProfileStudent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [togglingUid, setTogglingUid] = useState(null);
  const [studentProfileData, setStudentProfileData] = useState({});
  const [editingProfileData, setEditingProfileData] = useState({});
  const [profileStudentDocId, setProfileStudentDocId] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [quotaOptions, setQuotaOptions] = useState([]);
  const profileUnsubRef = useRef(null);
  const editingRef = useRef(false);

  useEffect(() => {
    const unsub = getSeatConfigurationsRealtime((data) => {
      const quotasSet = new Set();
      Object.values(data || {}).forEach((config) => {
        if (config && config.quotas) {
          Object.keys(config.quotas).forEach((qName) => quotasSet.add(qName));
        }
      });
      setQuotaOptions(Array.from(quotasSet));
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!editing) return;
    const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const maths = toNum(editingProfileData.mathsMark);
    const physics = toNum(editingProfileData.physicsMark);
    const chemistry = toNum(editingProfileData.chemistryMark);
    let val = '';
    if (maths !== null && physics !== null && chemistry !== null) {
      const cutoff = maths + physics / 2 + chemistry / 2;
      val = Number.isInteger(cutoff) ? String(cutoff) : String(Number(cutoff.toFixed(2)));
    }
    if (editingProfileData.cutoff !== val) {
      setEditingProfileData(prev => ({ ...prev, cutoff: val }));
    }
  }, [editing, editingProfileData.mathsMark, editingProfileData.physicsMark, editingProfileData.chemistryMark]);

  const toggleAccess = async (student) => {
    setTogglingUid(student.uid);
    const newVal = !student.profileEditAccess;
    try {
      await updateDoc(doc(db, "users", student.uid), { profileEditAccess: newVal });
      setStudents(prev => prev.map(s => s.uid === student.uid ? { ...s, profileEditAccess: newVal } : s));
    } catch (err) { console.error("Toggle error:", err); }
    setTogglingUid(null);
  };

  const openProfile = async (student) => {
    setProfileStudent(student);
    setEditing(false);
    setEditData({});
    setEditingProfileData({});
    setStudentProfileData({});
    setProfileStudentDocId('');
    setExpandedSections({});
    setSameAsPresent(false);
    setLoadingProfile(true);
    if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null; }
    try {
      const reg = student.regNo || '';
      let loaded = false;
      if (reg) {
        const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
        if (idxSnap.exists()) {
          const sDocId = idxSnap.data().studentDocId || '';
          if (sDocId) {
            setProfileStudentDocId(sDocId);
            const sSnap = await getDoc(doc(db, 'students', sDocId));
            if (sSnap.exists()) {
              const extra = sSnap.data()?._student_data?.[reg] || {};
              if (Object.keys(extra).length > 0) {
                setStudentProfileData(extra);
                setEditingProfileData({ ...extra });
                if (extra._sameAsPresent === 'true') setSameAsPresent(true);
                loaded = true;
              }
            }
            profileUnsubRef.current = onSnapshot(doc(db, 'students', sDocId), (snap) => {
              if (!snap.exists()) return;
              const extra = snap.data()?._student_data?.[reg] || {};
              setStudentProfileData(extra);
              if (!editingRef.current) {
                setEditingProfileData({ ...extra });
              }
              if (extra._sameAsPresent === 'true') setSameAsPresent(true);
            });
          }
        }
      }
      if (!loaded && student._profile_data) {
        const pd = student._profile_data;
        const initial = {};
        PROFILE_SECTIONS.forEach(sec => sec.fields.forEach(f => { initial[f.key] = ''; }));
        Object.keys(pd).forEach(k => { if (k in initial) initial[k] = pd[k]; });
        setStudentProfileData(initial);
        setEditingProfileData({ ...initial });
        if (pd._sameAsPresent === 'true') setSameAsPresent(true);
      }
    } catch (err) { console.error('Error loading student data:', err); }
    setLoadingProfile(false);
  };

  const closeProfile = () => {
    if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null; }
    editingRef.current = false;
    setProfileStudent(null);
    setEditing(false);
    setEditData({});
    setEditingProfileData({});
    setProfileStudentDocId('');
    setSameAsPresent(false);
  };

  const startEditing = () => {
    if (!profileStudent) return;
    editingRef.current = true;
    setEditData({
      displayName: profileStudent.displayName || profileStudent.studentName || '',
      email: profileStudent.email || '',
      regNo: profileStudent.regNo || '',
      programme: profileStudent.programme || '',
      department: displayDept(profileStudent.department || ''),
      batch: profileStudent.batch || '',
      mobile: profileStudent.mobile || '',
      address: profileStudent.address || '',
    });
    setEditingProfileData({ ...studentProfileData });
    setEditing(true);
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveEdit = async () => {
    if (!profileStudent) return;
    try {
      await updateDoc(doc(db, "users", profileStudent.uid), editData);
      if (profileStudentDocId && profileStudent.regNo) {
        const extra = {};
        PROFILE_SECTIONS.forEach(sec => sec.fields.forEach(f => {
          const v = editingProfileData[f.key];
          if (v !== undefined && v !== '') extra[f.key] = v;
        }));
        if (sameAsPresent) {
          const copyMap = {
            presentCity: 'permanentCity', presentPincode: 'permanentPincode',
            presentDistrict: 'permanentDistrict', presentState: 'permanentState',
            presentCountry: 'permanentCountry'
          };
          Object.entries(copyMap).forEach(([src, dest]) => {
            if (editingProfileData[src]) extra[dest] = editingProfileData[src];
          });
          extra._sameAsPresent = 'true';
        }
        const studentRef = doc(db, 'students', profileStudentDocId);
        const sSnap = await getDoc(studentRef);
        const existing = sSnap.exists() ? sSnap.data() : {};
        await updateDoc(studentRef, {
          _student_data: {
            ...(existing._student_data || {}),
            [profileStudent.regNo]: { ...(existing._student_data?.[profileStudent.regNo] || {}), ...extra }
          }
        });
        setStudentProfileData({ ...editingProfileData });
      }
      setStudents(prev => prev.map(s => s.uid === profileStudent.uid ? { ...s, ...editData } : s));
      setProfileStudent(prev => ({ ...prev, ...editData }));
      setEditing(false);
      editingRef.current = false;
    } catch (err) { console.error("Save error:", err); }
  };

  if (loading) {
    return (
      <Layout title="Student Management">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  if (!canView) {
    return (
      <Layout title="Student Management">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">You do not have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Student Management">
      <div className="p-4 md:p-8 w-full space-y-6">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="p-3 bg-[#120c7a] rounded-xl text-white shadow-lg shrink-0">
              <Users size={25} />
            </div>
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Search students by name, email, or reg no..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all text-sm shadow-sm"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="py-2.5 px-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all text-sm shadow-sm min-w-[130px]"
            >
              <option value="">All Batches</option>
              {availableBatches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Student Name</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Reg No.</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Programme</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Department</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Batch</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Registered</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap text-center">Profile</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap text-center">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-6 py-8 text-center text-zinc-500">
                        No registered students found.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.uid} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-zinc-800">{s.displayName || s.studentName}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{s.email}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap font-mono">{s.regNo}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{formatProgDisplay(s.programme) || s.programme}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{displayDept(s.department)}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{s.batch}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500 whitespace-nowrap">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => openProfile(s)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-zinc-400 hover:text-indigo-600 transition-colors" title="View Profile">
                            <Eye size={16} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleAccess(s)}
                            disabled={togglingUid === s.uid}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                              s.profileEditAccess
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:bg-zinc-200'
                            }`}
                          >
                            {togglingUid === s.uid ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : s.profileEditAccess ? (
                              <ToggleRight size={14} />
                            ) : (
                              <ToggleLeft size={14} />
                            )}
                            {s.profileEditAccess ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-sm text-zinc-500">
            Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
          </div>
        </div>
        </div>

      {/* ═══ Profile Modal ═══ */}
      {profileStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeProfile} />
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-800 via-indigo-900 to-violet-950 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm md:text-base">{profileStudent.displayName || profileStudent.studentName}</h3>
                  <p className="text-indigo-200 text-[10px] uppercase font-bold tracking-wider">
                    {editing ? 'Editing Mode' : 'View Only'} — {profileStudent.regNo || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <button onClick={startEditing} className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all" title="Edit">
                    <Pencil size={15} />
                  </button>
                ) : (
                  <button onClick={saveEdit} className="p-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-lg transition-all" title="Save">
                    <Save size={15} />
                  </button>
                )}
                <button onClick={closeProfile} className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {loadingProfile ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-indigo-600" />
                  <span className="ml-3 text-sm text-slate-500">Loading profile data...</span>
                </div>
              ) : (
                <>
                  {/* Account Info (editable by admin) */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Information</p>
                    {[
                      { label: 'Name', key: 'displayName', placeholder: 'Student Name' },
                      { label: 'Email', key: 'email', placeholder: 'Email Address' },
                      { label: 'Reg No.', key: 'regNo', placeholder: 'Registration Number' },
                      { label: 'Programme', key: 'programme', placeholder: 'Programme' },
                      { label: 'Department', key: 'department', placeholder: 'Department' },
                      { label: 'Batch', key: 'batch', placeholder: 'Batch' },
                      { label: 'Mobile', key: 'mobile', placeholder: 'Mobile Number' },
                      { label: 'Address', key: 'address', placeholder: 'Address' },
                    ].map(field => (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-0.5">{field.label}</label>
                        {editing ? (
                          <input
                            type="text"
                            value={editData[field.key] || ''}
                            onChange={e => setEditData(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full bg-white border border-indigo-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                          />
                        ) : (
                          <div className="w-full bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700">
                            {field.key === 'programme' ? (formatProgDisplay(profileStudent[field.key]) || profileStudent[field.key] || '—')
                              : field.key === 'department' ? displayDept(profileStudent[field.key])
                              : (profileStudent[field.key] || '—')}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-0.5">Profile Edit Access</label>
                      <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border ${
                        profileStudent.profileEditAccess
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-zinc-50 text-zinc-500 border-zinc-200'
                      }`}>
                        {profileStudent.profileEditAccess ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {profileStudent.profileEditAccess ? 'Enabled — Student can edit profile' : 'Disabled'}
                      </div>
                    </div>
                  </div>

                  {/* Admission Profile Sections */}
                  {PROFILE_SECTIONS.map((section) => {
                    const data = editing ? editingProfileData : studentProfileData;
                    const filledCount = section.fields.filter(f => data[f.key]?.trim()).length;
                    const isExpanded = expandedSections[section.key];
                    const Icon = section.icon;

                    const renderFieldEditInput = (f) => {
                      const val = editingProfileData[f.key] || '';
                      const onChange = (v) => setEditingProfileData(prev => ({ ...prev, [f.key]: v }));
                      const baseCls = "w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all";
                      if (f.key === 'cutoff') {
                        return <input type="text" value={val} readOnly className={`${baseCls} bg-slate-50 text-slate-500 cursor-not-allowed`} placeholder="Auto-calculated" />;
                      }
                      if (f.type === 'select') {
                        const opts = f.key === 'quotaAskedFor' ? quotaOptions : (f.options || []);
                        return (
                          <select value={val} onChange={e => onChange(e.target.value)} className={baseCls}>
                            <option value="">-- Select --</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        );
                      }
                      if (f.type === 'date') return <input type="date" value={val} onChange={e => onChange(e.target.value)} className={baseCls} />;
                      if (f.type === 'textarea') return <textarea value={val} onChange={e => onChange(e.target.value)} className={`${baseCls} min-h-[80px] resize-y`} rows={3} />;
                      return <input type="text" value={val} onChange={e => onChange(e.target.value)} className={baseCls} />;
                    };

                    const renderFieldView = (f) => (
                      <div className="bg-white border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700 min-h-[34px]">
                        {data[f.key] || <span className="text-slate-300">—</span>}
                      </div>
                    );

                    const renderField = (f) => (
                      <div key={f.key}>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{f.label}</label>
                        {editing ? renderFieldEditInput(f) : renderFieldView(f)}
                      </div>
                    );

                    return (
                      <div key={section.key} className="border border-slate-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleSection(section.key)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><Icon size={14} /></div>
                            <span className="text-sm font-semibold text-slate-700">{section.title}</span>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filledCount}/{section.fields.length}</span>
                          </div>
                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/50">
                            {section.key === 'address' ? (
                              <>
                                {section.fields.filter(f => f.key.startsWith('present')).map(f => renderField(f))}
                                <div className="sm:col-span-2 flex items-center gap-3 pt-2 pb-1 border-t border-slate-100">
                                  {editing ? (
                                    <>
                                      <button type="button" onClick={() => setSameAsPresent(!sameAsPresent)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sameAsPresent ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sameAsPresent ? 'translate-x-6' : 'translate-x-1'}`} />
                                      </button>
                                      <span className="text-xs font-semibold text-slate-600">Permanent address is same as present address</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className={`inline-flex h-6 w-11 items-center rounded-full ${data._sameAsPresent === 'true' ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white ${data._sameAsPresent === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                                      </div>
                                      <span className="text-xs font-semibold text-slate-400">Permanent address is same as present address</span>
                                    </>
                                  )}
                                </div>
                                {(!editing || !sameAsPresent) && (
                                  <>
                                    <div className="sm:col-span-2">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Permanent Address</p>
                                    </div>
                                    {section.fields.filter(f => f.key.startsWith('permanent')).map(f => renderField(f))}
                                  </>
                                )}
                                {section.fields.filter(f => ['hostellerDayScholar','transportRequired','transportRoute','transportStage'].includes(f.key)).map(f => renderField(f))}
                              </>
                            ) : section.fields.map(f => renderField(f))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
