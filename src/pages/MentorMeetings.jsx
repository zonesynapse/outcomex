import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, getDocs, onSnapshot, collection, updateDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, getAcademicYears, sanitizeKey, formatDepartmentDisplay } from "../lib/utils";
import { getSeatConfigurationsRealtime } from "../services/seatService";
import {
  listenMentorMeetings, addMentorMeeting, updateMentorMeeting, deleteMentorMeeting,
  listenMentorObservations, addMentorObservation, updateMentorObservation, deleteMentorObservation,
  listenParentInteractions, addParentInteraction, updateParentInteraction, deleteParentInteraction
} from "../services/mentorService";
import {
  Calendar, UserCheck, Phone, Plus, Trash2, Edit, Search, X,
  Users, AlertTriangle, CheckCircle2, Clock, ChevronDown, MessageSquare,
  Pencil, Save, ToggleLeft, ToggleRight, Loader2, User, MapPin, BookOpen, Award, Heart, ChevronRight
} from "lucide-react";

const TABS = [
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "observations", label: "Observations", icon: AlertTriangle },
  { id: "parent", label: "Parent Interactions", icon: Phone },
  { id: "activities", label: "Activities", icon: Award },
  { id: "students", label: "My Students", icon: Users },
];

const MEETING_TYPES = [
  { value: "individual", label: "Individual Mentoring" },
  { value: "group", label: "Group Mentoring" },
  { value: "parent", label: "Parent Meeting" },
  { value: "career", label: "Career Counselling" },
  { value: "placement", label: "Placement Counselling" },
  { value: "wellness", label: "Wellness Counselling" },
];

const OBS_CATEGORIES = [
  { value: "academic", label: "Academic" },
  { value: "attendance", label: "Attendance" },
  { value: "behavior", label: "Behavior" },
  { value: "career", label: "Career" },
  { value: "wellness", label: "Wellness" },
];

const SEVERITY_OPTIONS = [
  { value: "green", label: "Green — Healthy", color: "bg-green-100 border-green-300 text-green-800" },
  { value: "yellow", label: "Yellow — Needs Attention", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
  { value: "red", label: "Red — Immediate Intervention", color: "bg-red-100 border-red-300 text-red-800" },
];

const INTERACTION_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

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

export default function MentorMeetings() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [activeTab, setActiveTab] = useState("meetings");
  const [allocatedStudents, setAllocatedStudents] = useState([]);
  const [allocationLoading, setAllocationLoading] = useState(true);

  // States for student profile view/edit
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
  const usersDocIdRef = useRef('');
  const editingRef = useRef(false);

  const [meetings, setMeetings] = useState([]);
  const [observations, setObservations] = useState([]);
  const [parentInteractions, setParentInteractions] = useState([]);
  const [mentorActivities, setMentorActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [reviewActivity, setReviewActivity] = useState(null);
  const [actComment, setActComment] = useState("");
  const [actingOnActivity, setActingOnActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState("all");
 
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterType, setFilterType] = useState("");
 
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
 
  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  }, []);
 
  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);
 
  // 1. Listen to mentor allocations to find student regs for this mentor
  useEffect(() => {
    if (!user) return;
    setAllocationLoading(true);

    const unsubAlloc = onSnapshot(collection(db, "mentor_allocations"), (allocSnap) => {
      const activeRegs = new Set();
      allocSnap.forEach(docSnap => {
        const data = docSnap.data();
        const studs = data.students || {};
        Object.entries(studs).forEach(([reg, info]) => {
          if (info.mentorUid === user.uid) {
            activeRegs.add(reg);
          }
        });
      });

      if (activeRegs.size === 0) {
        setAllocatedStudents([]);
        setAllocationLoading(false);
        return;
      }

      const unsubStudents = onSnapshot(collection(db, "students"), (studentsSnap) => {
        const list = [];
        const seen = new Set();
        studentsSnap.forEach(docSnap => {
          const data = docSnap.data();
          // Parse doc ID for fallback context
          const docIdParts = docSnap.id.match(/^(.+)_(\d{4}-\d{4})_(\d{4}-\d{4})_(\d+)(?:_(.+))?$/);
          Object.entries(data).forEach(([key, val]) => {
            if (key.startsWith('_')) return;
            if (!activeRegs.has(key)) return;
            if (seen.has(key)) return;
            seen.add(key);
            const name = typeof val === 'object' && val !== null ? (val.name || '') : String(val || '');
            const meta = data._meta || {};
            list.push({
              regNo: key, displayName: name, studentName: name, uid: key,
              sourceDocId: docSnap.id,
              programme: meta.programme || (docIdParts ? docIdParts[1] : ''),
              department: meta.department || '',
              batch: meta.batch || (docIdParts ? docIdParts[2] : ''),
              academicYear: meta.academicYear || (docIdParts ? docIdParts[3] : ''),
              semester: meta.semester || (docIdParts ? docIdParts[4] : ''),
              section: meta.section || (docIdParts ? docIdParts[5] || '' : ''),
            });
          });
        });
        list.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setAllocatedStudents(list);
        setAllocationLoading(false);
      }, (err) => {
        console.error("Error listening to students:", err);
        setAllocationLoading(false);
      });

      return () => unsubStudents();
    }, (err) => {
      console.error("Error listening to allocations:", err);
      setAllocationLoading(false);
    });

    return () => unsubAlloc();
  }, [user]);

  // 2. Quota config loader
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

  // 3. Cutoff calculator
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

  // Helper functions for student profile view/edit
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
      usersDocIdRef.current = '';

      // Enrich student with user data (email, mobile, programme, department)
      if (reg) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('regNo', '==', reg), where('role', '==', 'Student')));
        if (!usersSnap.empty) {
          const uDoc = usersSnap.docs[0];
          const uData = uDoc.data();
          usersDocIdRef.current = uDoc.id;
          setProfileStudent(prev => ({
            ...prev,
            email: uData.email || prev.email || '',
            mobile: uData.mobile || uData.phoneNumber || prev.mobile || '',
            programme: uData.programme || prev.programme || '',
            department: uData.department || prev.department || '',
            batch: uData.batch || prev.batch || '',
          }));
        }
      }

      if (reg) {
        const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
        if (idxSnap.exists()) {
          const sDocId = idxSnap.data().studentDocId || '';
          if (sDocId) {
            setProfileStudentDocId(sDocId);
            const sSnap = await getDoc(doc(db, 'students', sDocId));
            if (sSnap.exists()) {
              const sData = sSnap.data();
              const extra = sData._student_data?.[reg] || {};
              if (Object.keys(extra).length > 0) {
                setStudentProfileData(extra);
                setEditingProfileData({ ...extra });
                if (extra._sameAsPresent === 'true') setSameAsPresent(true);
                loaded = true;
              }
              if (sData._meta) {
                setProfileStudent(prev => ({
                  ...prev,
                  programme: prev.programme || sData._meta.programme || '',
                  department: prev.department || sData._meta.department || '',
                  batch: prev.batch || sData._meta.batch || '',
                }));
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
      if (!loaded && student.sourceDocId) {
        const sSnap = await getDoc(doc(db, 'students', student.sourceDocId));
        if (sSnap.exists()) {
          const sData = sSnap.data();
          const extra = sData._student_data?.[reg] || {};
          if (Object.keys(extra).length > 0) {
            setProfileStudentDocId(student.sourceDocId);
            setStudentProfileData(extra);
            setEditingProfileData({ ...extra });
            if (extra._sameAsPresent === 'true') setSameAsPresent(true);
            loaded = true;
            profileUnsubRef.current = onSnapshot(doc(db, 'students', student.sourceDocId), (snap) => {
              if (!snap.exists()) return;
              const extra2 = snap.data()?._student_data?.[reg] || {};
              setStudentProfileData(extra2);
              if (!editingRef.current) setEditingProfileData({ ...extra2 });
              if (extra2._sameAsPresent === 'true') setSameAsPresent(true);
            });
          }
          if (!loaded && sData._meta) {
            setProfileStudent(prev => ({
              ...prev,
              programme: prev.programme || sData._meta.programme || '',
              department: prev.department || sData._meta.department || '',
              batch: prev.batch || sData._meta.batch || '',
            }));
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
        loaded = true;
      }
    } catch (err) { console.error('Error loading student data:', err); }
    setLoadingProfile(false);
  };

  const closeProfile = () => {
    if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null; }
    usersDocIdRef.current = '';
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
      if (usersDocIdRef.current) {
        await updateDoc(doc(db, "users", usersDocIdRef.current), editData);
      }
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
      setAllocatedStudents(prev => prev.map(s => s.uid === profileStudent.uid ? { ...s, ...editData } : s));
      setProfileStudent(prev => ({ ...prev, ...editData }));
      setEditing(false);
      editingRef.current = false;
      showToast("Profile updated successfully");
    } catch (err) { console.error("Save error:", err); showToast("Failed to save profile: " + err.message, "error"); }
  };

  // Meetings listener
  useEffect(() => {
    if (!user) { setMeetings([]); return; }
    const filters = { mentorUid: user.uid };
    if (filterType) filters.type = filterType;
    const unsub = listenMentorMeetings(filters, setMeetings);
    return () => unsub();
  }, [user, filterType]);

  // Observations listener
  useEffect(() => {
    if (!user) { setObservations([]); return; }
    const filters = { mentorUid: user.uid };
    if (filterSeverity) filters.severity = filterSeverity;
    const unsub = listenMentorObservations(filters, setObservations);
    return () => unsub();
  }, [user, filterSeverity]);

  // Parent interactions listener
  useEffect(() => {
    if (!user) { setParentInteractions([]); return; }
    const filters = { mentorUid: user.uid };
    const unsub = listenParentInteractions(filters, setParentInteractions);
    return () => unsub();
  }, [user]);

  // Student activity entries assigned to this mentor (student activities)
  useEffect(() => {
    if (!user) { setMentorActivities([]); setActivitiesLoading(false); return; }
    setActivitiesLoading(true);
    const unsub = onSnapshot(collection(db, "activity_entries"), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.mentorUid === user.uid && (data.activityCode || '').startsWith('A')) {
          list.push({ id: d.id, ...data });
        }
      });
      const getMillis = (d) => {
        if (!d) return 0;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        if (d.seconds) return d.seconds * 1000;
        const p = Date.parse(d);
        return isNaN(p) ? 0 : p;
      };
      list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
      setMentorActivities(list);
      setActivitiesLoading(false);
    }, (err) => {
      console.error("Error loading mentor activities:", err);
      setActivitiesLoading(false);
    });
    return () => unsub();
  }, [user]);

  const approveActivity = async () => {
    if (!reviewActivity) return;
    setActingOnActivity(true);
    try {
      await updateDoc(doc(db, "activity_entries", reviewActivity.id), {
        status: "Pending",
        mentorApproved: true,
        mentorUid: user.uid,
        mentorName: userData.facultyName || userData.name || "",
        mentorReviewedAt: new Date().toISOString(),
        mentorComment: actComment || "",
        updatedAt: new Date().toISOString()
      });
      showToast("Activity approved — now forwarded for departmental review");
      setReviewActivity(null);
      setActComment("");
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    } finally {
      setActingOnActivity(false);
    }
  };

  const rejectActivity = async (status = "Rejected") => {
    if (!reviewActivity) return;
    if (!actComment.trim() && status === "Rejected") {
      showToast("Please provide a reason for rejection", "error");
      return;
    }
    setActingOnActivity(true);
    try {
      await updateDoc(doc(db, "activity_entries", reviewActivity.id), {
        status,
        mentorApproved: false,
        mentorUid: user.uid,
        mentorName: userData.facultyName || userData.name || "",
        mentorReviewedAt: new Date().toISOString(),
        mentorComment: actComment || "",
        updatedAt: new Date().toISOString()
      });
      showToast(status === "Rejected" ? "Activity rejected" : "Activity returned to student");
      setReviewActivity(null);
      setActComment("");
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    } finally {
      setActingOnActivity(false);
    }
  };

  const filteredMentorActivities = useMemo(() => {
    const list = mentorActivities.filter(a => {
      if (activityFilter === "all") return true;
      return (a.status || "Draft") === activityFilter;
    });
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(a =>
      (a.submittedBy || "").toLowerCase().includes(term) ||
      (a.activityName || a.title || "").toLowerCase().includes(term) ||
      (a.activityCode || "").toLowerCase().includes(term)
    );
  }, [mentorActivities, activityFilter, searchTerm]);

  const getEmptyForm = () => {
    if (activeTab === "meetings") return { type: "individual", studentReg: "", date: new Date().toISOString().split('T')[0], topic: "", notes: "", actionItems: "", status: "planned" };
    if (activeTab === "observations") return { studentReg: "", category: "academic", severity: "green", date: new Date().toISOString().split('T')[0], notes: "" };
    return { studentReg: "", parentName: "", parentMobile: "", interactionType: "call", date: new Date().toISOString().split('T')[0], notes: "", followUp: "" };
  };

  const handleOpenForm = (item = null) => {
    if (item) {
      setEditItem(item);
      setFormData({ ...item });
    } else {
      setEditItem(null);
      setFormData(getEmptyForm());
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditItem(null);
    setFormData({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const student = allocatedStudents.find(s => s.regNo === formData.studentReg);
      const baseData = {
        mentorUid: user.uid,
        mentorName: userData.facultyName || userData.name || '',
        programme: student?.programme || '',
        department: student?.department || '',
        batch: student?.batch || '',
        academicYear: student?.academicYear || '',
        semester: student?.semester || '',
        section: student?.section || '',
        studentReg: formData.studentReg,
        studentName: student?.displayName || student?.studentName || '',
      };

      if (activeTab === "meetings") {
        const payload = { ...baseData, type: formData.type, date: formData.date, topic: formData.topic, notes: formData.notes, actionItems: formData.actionItems, status: formData.status };
        if (editItem) await updateMentorMeeting(editItem.id, payload);
        else await addMentorMeeting(payload);
      } else if (activeTab === "observations") {
        const payload = { ...baseData, category: formData.category, severity: formData.severity, date: formData.date, notes: formData.notes };
        if (editItem) await updateMentorObservation(editItem.id, payload);
        else await addMentorObservation(payload);
      } else {
        const payload = { ...baseData, parentName: formData.parentName, parentMobile: formData.parentMobile, interactionType: formData.interactionType, date: formData.date, notes: formData.notes, followUp: formData.followUp };
        if (editItem) await updateParentInteraction(editItem.id, payload);
        else await addParentInteraction(payload);
      }
      showToast(editItem ? "Updated successfully" : "Created successfully");
      handleCloseForm();
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      if (activeTab === "meetings") await deleteMentorMeeting(id);
      else if (activeTab === "observations") await deleteMentorObservation(id);
      else await deleteParentInteraction(id);
      showToast("Deleted successfully");
    } catch (err) {
      showToast("Failed: " + err.message, "error");
    }
  };

  const filteredData = useMemo(() => {
    const data = activeTab === "meetings" ? meetings : activeTab === "observations" ? observations : parentInteractions;
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(d => (d.studentReg || '').toLowerCase().includes(term) || (d.studentName || '').toLowerCase().includes(term) || (d.topic || '').toLowerCase().includes(term) || (d.notes || '').toLowerCase().includes(term));
  }, [activeTab, meetings, observations, parentInteractions, searchTerm]);

  if (loading) {
    return (
      <Layout title="Mentor Activities">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#120c7a]/30 border-t-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mentor Activities">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.message}
        </div>
      )}
      {/* Tabs & Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-white rounded-2xl border border-zinc-200 shadow-sm p-1.5 w-fit min-w-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowForm(false); setSearchTerm(""); }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-[#120c7a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all text-sm font-medium shadow-sm"
            />
          </div>
          {activeTab !== "students" && activeTab !== "activities" && (
            <button onClick={() => handleOpenForm()}
              className="flex items-center gap-2 bg-[#120c7a] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0e0960] shadow-lg shadow-[#120c7a]/25 whitespace-nowrap shrink-0">
              <Plus className="h-4 w-4" /> New Entry
            </button>
          )}
        </div>
      </div>
        {activeTab === "meetings" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pb-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-1">Type:</span>
            {MEETING_TYPES.map(t => (
              <button key={t.value} onClick={() => setFilterType(filterType === t.value ? "" : t.value)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${filterType === t.value ? 'bg-[#120c7a] text-white border-[#120c7a] shadow-sm' : 'bg-white text-zinc-600 border-zinc-200 hover:border-[#120c7a] hover:text-[#120c7a]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === "observations" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pb-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-1">Severity:</span>
            {SEVERITY_OPTIONS.map(s => (
              <button key={s.value} onClick={() => setFilterSeverity(filterSeverity === s.value ? "" : s.value)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${filterSeverity === s.value ? s.color + ' border-current shadow-sm' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

      {/* Data List */}
      <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
        {activeTab === "students" ? (
          <div className="overflow-x-auto">
            {allocationLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="animate-spin text-[#120c7a]" size={28} />
                <span className="text-sm font-semibold text-zinc-400">Loading allocated students...</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Register Number</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Programme & Department</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Batch & Section</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Mobile / Email</th>
                    <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allocatedStudents.filter(s => {
                    if (!searchTerm.trim()) return true;
                    const term = searchTerm.toLowerCase();
                    return (s.regNo || "").toLowerCase().includes(term) || 
                           (s.displayName || s.studentName || "").toLowerCase().includes(term) ||
                           (s.email || "").toLowerCase().includes(term);
                  }).map(student => (
                    <tr key={student.uid} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#120c7a]">{student.regNo || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-800">{student.displayName || student.studentName || "—"}</td>
                      <td className="px-4 py-3 text-xs text-zinc-600">
                        <div>{formatProgDisplay(student.programme)}</div>
                        <div className="text-[10px] text-zinc-400">{displayDept(student.department)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600">
                        <div>{formatBatchDisplay(student.batch)}</div>
                        {student.section && <div className="text-[10px] font-bold text-zinc-500">{student.section}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        <div>{student.mobile || "—"}</div>
                        <div className="text-[10px] font-mono">{student.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => openProfile(student)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#120c7a]/10 text-[#120c7a] text-xs font-bold rounded-lg hover:bg-[#120c7a]/20 transition-all font-sans"
                        >
                          <Pencil size={12} />
                          <span>Update Profile</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {allocatedStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-zinc-400 font-medium">
                        No students allocated to you.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : activeTab === "activities" ? (
          <div className="p-4 md:p-6">
            {activitiesLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="animate-spin text-[#120c7a]" size={28} />
                <span className="text-sm font-semibold text-zinc-400">Loading student activities...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-1">Status:</span>
                  {["Mentor_Pending", "Pending", "HOD_Pending", "Approved", "Returned", "Rejected", "all"].map(s => (
                    <button key={s} onClick={() => setActivityFilter(activityFilter === s ? "" : s)}
                      className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${activityFilter === s ? 'bg-[#120c7a] text-white border-[#120c7a] shadow-sm' : 'bg-white text-zinc-600 border-zinc-200 hover:border-[#120c7a] hover:text-[#120c7a]'}`}>
                      {s === "all" ? "All" : s.replace("_", " ")}
                    </button>
                  ))}
                </div>
                {filteredMentorActivities.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 font-medium">No activities found for the selected filter.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Submitted By</th>
                          <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Activity</th>
                          <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                          <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Points</th>
                          <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                          <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMentorActivities.map(act => {
                          const status = act.status || "Draft";
                          return (
                            <tr key={act.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="font-semibold text-zinc-800 text-xs">{act.submittedBy || act.studentName || "—"}</span>
                                {act.regNo && <span className="block font-mono text-[10px] text-zinc-400">{act.regNo}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-xs">
                                <div className="font-semibold text-[#120c7a]">{act.activityCode}</div>
                                <div className="text-zinc-600">{act.activityName || act.title || "—"}</div>
                              </td>
                              <td className="px-4 py-2.5 text-xs whitespace-nowrap">{act.date || act.fromDate || "—"}</td>
                              <td className="px-4 py-2.5 text-xs font-bold">{act.points || act.totalPoints || "—"}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold ${status === "Mentor_Pending" ? "bg-amber-100 text-amber-700" : status === "Pending" ? "bg-blue-100 text-blue-700" : status === "HOD_Pending" ? "bg-violet-100 text-violet-700" : status === "Approved" ? "bg-emerald-100 text-emerald-700" : status === "Rejected" ? "bg-red-100 text-red-700" : status === "Returned" ? "bg-orange-100 text-orange-700" : "bg-zinc-100 text-zinc-600"}`}>
                                  {status.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => { setReviewActivity(act); setActComment(""); }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#120c7a]/10 text-[#120c7a] text-xs font-bold rounded-lg hover:bg-[#120c7a]/20 transition-all"
                                >
                                  <Eye size={12} />
                                  {status === "Mentor_Pending" ? "Review" : "View"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                  {activeTab === "meetings" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Type</th>}
                  {activeTab === "meetings" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Topic</th>}
                  {activeTab === "observations" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Category</th>}
                  {activeTab === "observations" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Severity</th>}
                  {activeTab === "parent" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Parent</th>}
                  {activeTab === "parent" && <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Mode</th>}
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Notes</th>
                  <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(item => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{item.date}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-semibold">{item.studentReg}</span>
                      <span className="text-zinc-500 ml-1 text-xs">— {item.studentName}</span>
                    </td>
                    {activeTab === "meetings" && (
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold">
                          {MEETING_TYPES.find(t => t.value === item.type)?.label || item.type}
                        </span>
                      </td>
                    )}
                    {activeTab === "meetings" && <td className="px-4 py-2.5 text-xs">{item.topic}</td>}
                    {activeTab === "observations" && (
                      <td className="px-4 py-2.5">
                          <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 font-semibold">
                            {OBS_CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                        </span>
                      </td>
                    )}
                    {activeTab === "observations" && (
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${SEVERITY_OPTIONS.find(s => s.value === item.severity)?.color || ''}`}>
                          {item.severity?.toUpperCase()}
                        </span>
                      </td>
                    )}
                    {activeTab === "parent" && <td className="px-4 py-2.5 text-xs">{item.parentName}</td>}
                    {activeTab === "parent" && (
                      <td className="px-4 py-2.5">
                          <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 font-semibold">
                            {INTERACTION_TYPES.find(t => t.value === item.interactionType)?.label || item.interactionType}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{item.notes}</td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleOpenForm(item)} className="p-1 text-blue-500 hover:text-blue-700">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 text-red-500 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-16 text-center">
                    <div className="inline-flex p-3 rounded-2xl bg-slate-50 mb-4">
                      <Calendar className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No entries found</p>
                    <p className="text-xs text-slate-400 mt-1">Create a new entry to get started.</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-zinc-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-lg">{editItem ? 'Edit' : 'New'} {activeTab === 'meetings' ? 'Meeting' : activeTab === 'observations' ? 'Observation' : 'Parent Interaction'}</h3>
              <button onClick={handleCloseForm} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Student */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Student *</label>
                <select value={formData.studentReg || ''} onChange={e => setFormData(p => ({ ...p, studentReg: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Student</option>
                  {allocatedStudents.map(s => <option key={s.regNo} value={s.regNo}>{s.regNo} — {s.displayName || s.studentName}</option>)}
                </select>
              </div>

              {/* Meeting fields */}
              {activeTab === "meetings" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Meeting Type *</label>
                      <select value={formData.type || 'individual'} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Topic *</label>
                    <input type="text" value={formData.topic || ''} onChange={e => setFormData(p => ({ ...p, topic: e.target.value }))}
                      placeholder="e.g. Academic performance review" className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
                    <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Meeting notes..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Action Items</label>
                    <textarea rows={2} value={formData.actionItems || ''} onChange={e => setFormData(p => ({ ...p, actionItems: e.target.value }))}
                      placeholder="Follow-up tasks..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Status</label>
                    <select value={formData.status || 'planned'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                      <option value="planned">Planned</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </>
              )}

              {/* Observation fields */}
              {activeTab === "observations" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Category *</label>
                      <select value={formData.category || 'academic'} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {OBS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Severity *</label>
                    <div className="flex gap-2">
                      {SEVERITY_OPTIONS.map(s => (
                          <button key={s.value} type="button" onClick={() => setFormData(p => ({ ...p, severity: s.value }))}
                              className={`flex-1 text-xs px-3 py-2.5 rounded-xl font-semibold border-2 transition-all ${(formData.severity || 'green') === s.value ? s.color + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes *</label>
                    <textarea rows={4} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Describe your observation..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                </>
              )}

              {/* Parent interaction fields */}
              {activeTab === "parent" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Parent Name *</label>
                      <input type="text" value={formData.parentName || ''} onChange={e => setFormData(p => ({ ...p, parentName: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Parent Mobile *</label>
                      <input type="text" value={formData.parentMobile || ''} onChange={e => setFormData(p => ({ ...p, parentMobile: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Interaction Type *</label>
                      <select value={formData.interactionType || 'call'} onChange={e => setFormData(p => ({ ...p, interactionType: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                        {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Date *</label>
                      <input type="date" value={formData.date || ''} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
                    <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Discussion notes..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Follow-up Required</label>
                    <input type="text" value={formData.followUp || ''} onChange={e => setFormData(p => ({ ...p, followUp: e.target.value }))}
                      placeholder="Follow-up details..." className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={handleCloseForm} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={!formData.studentReg || saving}
                className="px-4 py-2 text-sm font-bold bg-[#120c7a] text-white rounded-lg hover:bg-[#0e0960] disabled:opacity-50">
                {saving ? 'Saving...' : editItem ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
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
            <div className="p-6 space-y-3 overflow-y-auto flex-1 bg-white">
              {loadingProfile ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-indigo-600" />
                  <span className="ml-3 text-sm text-slate-500">Loading profile data...</span>
                </div>
              ) : (
                <>
                  {/* Account Info */}
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
                    ].map(field => (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-0.5">{field.label}</label>
                        {editing ? (
                          <input
                            type="text"
                            value={editData[field.key] || ''}
                            onChange={e => setEditData(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full bg-white border border-indigo-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-sans"
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
                      const baseCls = "w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-sans";
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

      {/* Student Activity Review Modal */}
      {reviewActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 sticky top-0 bg-white z-10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Review Student Activity</h3>
                <p className="text-xs text-zinc-400 font-medium">{reviewActivity.activityCode} • {reviewActivity.activityName || reviewActivity.title}</p>
              </div>
              <button onClick={() => setReviewActivity(null)} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={18} className="text-zinc-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Submitted By</span>
                  <span className="font-semibold text-slate-800">{reviewActivity.submittedBy || reviewActivity.studentName || "—"}</span>
                  {reviewActivity.regNo && <span className="block font-mono text-[10px] text-zinc-400">{reviewActivity.regNo}</span>}
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Date</span>
                  <span className="font-semibold text-slate-800">{reviewActivity.date || reviewActivity.fromDate || "—"}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Points</span>
                  <span className="font-semibold text-slate-800">{reviewActivity.points || reviewActivity.totalPoints || "—"}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Department / Batch</span>
                  <span className="font-semibold text-slate-800">{formatDepartmentDisplay(reviewActivity.department, reviewActivity.programme) || "—"} / {formatBatchDisplay(reviewActivity.batch) || reviewActivity.batch || "—"}</span>
                </div>
              </div>

              {reviewActivity.comments && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">Student Notes</span>
                  <p className="text-blue-800 font-medium whitespace-pre-line">{reviewActivity.comments}</p>
                </div>
              )}

              {Array.isArray(reviewActivity.evidenceFiles) && reviewActivity.evidenceFiles.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Attached Evidence</span>
                  <div className="space-y-2">
                    {reviewActivity.evidenceFiles.map((file, fIdx) => {
                      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) || (file.type && file.type.startsWith('image/'));
                      const isPDF = /\.pdf$/i.test(file.name) || (file.type && file.type === 'application/pdf');
                      return (
                        <div key={fIdx} className="rounded-xl border border-slate-200 overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${isPDF ? 'bg-red-100 text-red-600' : isImage ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                              {isPDF ? 'PDF' : isImage ? 'IMG' : 'FILE'}
                            </span>
                            <span className="text-xs font-semibold text-zinc-700 truncate flex-1">{file.name}</span>
                            {file.url && (
                              <a href={file.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#120c7a] font-bold shrink-0">Open</a>
                            )}
                          </div>
                          {file.url && isImage && (
                            <div className="bg-slate-50 p-2 flex justify-center">
                              <img src={file.url} alt={file.name} className="max-h-48 max-w-full object-contain rounded-lg" referrerPolicy="no-referrer" />
                            </div>
                          )}
                          {file.url && isPDF && (
                            <iframe src={file.url} title={file.name} className="w-full h-64 border-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {reviewActivity.status === "Mentor_Pending" ? "Comment (optional for approval)" : "Comment"}
                </label>
                <textarea
                  rows={2}
                  value={actComment}
                  onChange={e => setActComment(e.target.value)}
                  placeholder="Feedback for the student..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-[#120c7a]/20"
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-100">
                {(reviewActivity.status === "Mentor_Pending") && (
                  <>
                    <button onClick={() => rejectActivity("Rejected")} disabled={actingOnActivity}
                      className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition-all cursor-pointer disabled:opacity-50">
                      Reject
                    </button>
                    <button onClick={() => rejectActivity("Returned")} disabled={actingOnActivity}
                      className="px-4 py-2 bg-orange-50 text-orange-600 text-xs font-bold rounded-lg hover:bg-orange-100 transition-all cursor-pointer disabled:opacity-50">
                      Return for Correction
                    </button>
                    <button onClick={approveActivity} disabled={actingOnActivity}
                      className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-all cursor-pointer disabled:opacity-50">
                      {actingOnActivity ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="inline h-3.5 w-3.5" />} Approve
                    </button>
                  </>
                )}
                {(reviewActivity.status !== "Mentor_Pending") && (
                  <button onClick={() => setReviewActivity(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all cursor-pointer">
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
