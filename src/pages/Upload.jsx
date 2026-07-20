import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { db, storage } from "../firebase"; // Import db for Firestore
import { doc, collection, setDoc, getDoc, onSnapshot, getDocs } from "firebase/firestore"; // Firestore imports
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import Papa from "papaparse";
import { Download, CheckCircle2, Trash2, Check } from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, formatProgrammeKey } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const ADMISSION_FIELDS = [
  'title','firstName','lastName','studentName','fatherGuardianName','motherName',
  'guardianName','gender','dateOfBirth','age','nationality','religion','community',
  'caste','motherTongue','bloodGroup','maritalStatus','aadharNo',
  'mobile','parentMobile','parentWhatsAppNo','studentWhatsAppNo','landline','emailId',
  'address','presentHouseNo','presentStreet','presentLocality','presentCity',
  'presentAddress','presentPincode','presentDistrict','presentState','presentCountry',
  'permanentAddress','permanentCity','permanentPincode','permanentDistrict',
  'permanentState','permanentCountry',
  'parentOccupation','motherOccupation','fatherOccupationSector','motherOccupationSector',
  'fatherOrganisation','motherOrganisation','fatherDesignation','motherDesignation',
  'fatherAnnualIncome','motherAnnualIncome','familyAnnualIncome',
  'schoolCollege','mediumOfInstruction','examinationPassedAppeared','studentCategory',
  'seatCategory','scholarshipDetails','hostellerDayScholar','transportRequired',
  'transportRoute','transportStage','emsUmsNo',
  'qualifyingExamProgrammes','qualifyingExamInstitute','qualifyingExamBoardUniversity',
  'qualifyingExamMonthYear','qualifyingExamAttempts','qualifyingExamMarks',
  'qualifyingExam10thInstitute','qualifyingExam10thBoard','qualifyingExam10thMonthYear',
  'qualifyingExam10thAttempts','qualifyingExam10thMarks',
  'qualifyingExam11thInstitute','qualifyingExam11thBoard','qualifyingExam11thMonthYear',
  'qualifyingExam11thAttempts','qualifyingExam11thMarks',
  'qualifyingExam12thInstitute','qualifyingExam12thBoard','qualifyingExam12thMonthYear',
  'qualifyingExam12thAttempts','qualifyingExam12thMarks',
  'qualifyingExamDipDegInstitute','qualifyingExamDipDegBoard','qualifyingExamDipDegMonthYear',
  'qualifyingExamDipDegAttempts','qualifyingExamDipDegMarks',
  'mathsMark','physicsMark','chemistryMark','totalMarks','cutoff','eligibility',
  'department','department2','department3','quotaAskedFor','reference','enquiryFor',
  'enquiryDate','enquiryAttendedBy','status','applicationNo'
];

export default function Upload() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { regulations, getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const [uploadType, setUploadType] = useState("select");
  
  const styles = `
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
    ::-webkit-scrollbar-thumb { background: #120c7a; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #0e0960; }
  `;
  
  // Syllabus Fields
  const [syllabusProgramme, setSyllabusProgramme] = useState("");
  const [syllabusDept, setSyllabusDept] = useState("select");
  const [regulation, setRegulation] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  
  const syllabusDuration = useMemo(() => {
    const progKey = formatProgrammeKey(syllabusProgramme);
    return durations[progKey] || 4;
  }, [syllabusProgramme, durations]);

  const [semestersData, setSemestersData] = useState({});

  const [availableCourses, setAvailableCourses] = useState([]);

  useEffect(() => {
    if (uploadType !== "syllabus" || !syllabusProgramme || syllabusDept === "select" || !regulation) {
      setAvailableCourses([]);
      return;
    }

    const progKey = formatProgrammeKey(syllabusProgramme);

    const unsub = onSnapshot(collection(db, 'courses'), (snap) => {
      const flat = {};
      snap.forEach(d => {
        const docData = d.data();
        const hasDirect = docData?.code || docData?.programme;
        if (hasDirect) {
          flat[d.id] = docData;
        } else {
          Object.entries(docData).forEach(([deptVal, deptCourses]) => {
            if (deptCourses && typeof deptCourses === 'object') {
              Object.entries(deptCourses).forEach(([regVal, regCourses]) => {
                if (regCourses && typeof regCourses === 'object') {
                  Object.entries(regCourses).forEach(([cc, courseData]) => {
                    if (courseData && typeof courseData === 'object') {
                      flat[`${d.id}_${deptVal}_${regVal}_${cc}`] = courseData;
                    }
                  });
                }
              });
            }
          });
        }
      });
      const filtered = Object.entries(flat)
        .filter(([, course]) =>
          course?.programme === progKey &&
          course?.regulation === regulation &&
          (course?.department === syllabusDept || course?.department === "Overall")
        )
        .map(([key, course]) => ({
          key,
          code: course?.code || key,
          name: course?.name || "",
          credits: course?.credits || 0,
          type: course?.type,
          _sourceDept: course?.department || "Overall",
        }));
      setAvailableCourses(filtered);
    });

    return () => unsub();
  }, [uploadType, syllabusProgramme, syllabusDept, regulation]);

  const updateSubjectFromBank = (sem, index, selectedCode) => {
    if (!selectedCode) {
      setSemestersData(prev => {
        const updatedSem = [...prev[sem]];
        updatedSem[index] = { ...updatedSem[index], code: "", name: "", credits: "" };
        return { ...prev, [sem]: updatedSem };
      });
      return;
    }

    const match = availableCourses.find(c => c.code === selectedCode);
    if (match) {
      setSemestersData(prev => {
        const updatedSem = [...prev[sem]];
        updatedSem[index] = {
          ...updatedSem[index],
          code: match.code,
          name: match.name,
          credits: match.credits
        };
        return { ...prev, [sem]: updatedSem };
      });
    }
  };

  useEffect(() => {
    const totalSems = syllabusDuration * 2;
    setSemestersData(prev => {
      const next = { ...prev };
      for (let i = 1; i <= totalSems; i++) {
        if (!next[i]) next[i] = [];
      }
      return next;
    });
  }, [syllabusDuration]);
  
  // Student List Fields
  const [batch, setBatch] = useState("");
  const [studentRegulation, setStudentRegulation] = useState("");
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");

  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});

  const [availableBatches, setAvailableBatches] = useState([]);

  useEffect(() => {
    if (programme) {
      const progKey = formatProgrammeKey(programme);
      setAvailableBatches(getActiveBatches(progKey));
    } else {
      setAvailableBatches([]);
    }
  }, [programme, getActiveBatches]);

  // Fetch student regulation automatically
  useEffect(() => {
    if (batch && programme) {
      const progKey = formatProgrammeKey(programme);
      const reg = getRegulationForBatch(progKey, batch);
      setStudentRegulation(reg || "");
    } else {
      setStudentRegulation("");
    }
  }, [batch, programme, getRegulationForBatch]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  const availableSections = useMemo(() => {
    if (!batch || !department || !programme) return [];
    const progKey = formatProgrammeKey(programme);
    const docId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}`;
    const cfg = sectionConfigs[docId];
    if (!cfg || !cfg.numSections) return [];
    const count = cfg.numSections;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: count }, (_, i) => `Sec-${letters[i]}`);
  }, [batch, department, programme, sectionConfigs]);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [fetchingSyllabus, setFetchingSyllabus] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Fetch existing syllabus data
  useEffect(() => {
    const fetchExistingSyllabus = async () => {
      if (uploadType === "syllabus" && syllabusProgramme && syllabusDept !== "select" && regulation) {
        setFetchingSyllabus(true);
        const progKey = formatProgrammeKey(syllabusProgramme);
        const syllabusDocId = `${progKey}_${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}`;
        const syllabusRef = doc(db, 'syllabus_data', syllabusDocId); // Firestore doc reference
        
        try { // Use getDoc for Firestore
          const snapshot = await getDoc(syllabusRef);
          if (snapshot.exists()) {
            const data = snapshot.data(); // Use .data() for Firestore documents
            setIsUpdating(true);
            if (data.semesters) {
              const totalSems = syllabusDuration * 2;
              const fullSemesters = Object.fromEntries(
                Array.from({ length: totalSems }, (_, i) => {
                  const subjects = (data.semesters[i + 1] || [])
                    .filter(sub => sub != null)
                    .map(sub => ({
                      ...sub,
                      saved: true,
                      isActive: sub.isActive !== undefined ? sub.isActive : true,
                      isElective: sub.isElective !== undefined ? sub.isElective : false
                    }));
                  return [i + 1, subjects];
                })
              );
              setSemestersData(fullSemesters);
              if (data.academic_year) setAcademicYear(data.academic_year);
            }
          } else {
            // Reset if no data exists for this combination
            setIsUpdating(false);
            const totalSems = syllabusDuration * 2;
            setSemestersData(Object.fromEntries(Array.from({ length: totalSems }, (_, i) => [i + 1, []])));
            setAcademicYear("");
          }
        } catch (error) {
          console.error("Error fetching existing syllabus:", error);
        } finally {
          setFetchingSyllabus(false);
        }
      }
    };

    fetchExistingSyllabus();
  }, [uploadType, syllabusProgramme, syllabusDept, regulation, syllabusDuration]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const normalizeExamNo = (value) => {
    if (value === null || value === undefined) return '';
    let s = String(value).trim();
    if (s.endsWith('.0') && s.replace('.', '').match(/^\d+$/)) {
      s = s.slice(0, -2);
    }
    if (s.toLowerCase().includes('e') && !isNaN(Number(s))) {
      try {
        // Convert scientific notation to full string without precision loss if possible
        s = Number(s).toLocaleString('fullwide', { useGrouping: false });
      } catch {
        // ignore
      }
    }
    return s;
  };

  const handleDownloadTemplate = async () => {
    if (!batch || !programme || !department) {
      setMessage({ type: "error", text: "Please select Batch, Programme, and Department before downloading template." });
      return;
    }

    const progKey = formatProgrammeKey(programme);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    const studentDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;
    const studentsRef = doc(db, 'students', studentDocId);

    let existingStudents = [];
    try {
      const snap = await getDoc(studentsRef);
      if (snap.exists()) {
        const data = snap.data();
        existingStudents = Object.entries(data)
          .filter(([key]) => !key.startsWith('_'))
          .map(([key, val]) => ({
            examNo: key,
            name: typeof val === 'object' && val !== null ? (val.name || '') : String(val || '')
          }));
        const order = data._order || data.order;
        if (order && Array.isArray(order)) {
          existingStudents.sort((a, b) => order.indexOf(a.examNo) - order.indexOf(b.examNo));
        } else {
          existingStudents.sort((a, b) => a.examNo.localeCompare(b.examNo));
        }
      }
    } catch (err) {
      console.error("Error fetching existing students:", err);
    }

    const esc = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const allHeaders = ['Exam No', 'Name', ...ADMISSION_FIELDS];
    const headerRow = allHeaders.join(',');

    const dataRows = existingStudents.length > 0
      ? existingStudents.map(s => [esc(s.examNo), esc(s.name), ...ADMISSION_FIELDS.map(() => '')].join(','))
      : [['', '', ...ADMISSION_FIELDS.map(() => '')].join(',')];

    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `students_${batch}_${progKey}_${sanitizeKey(department)}${sectionSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const addSubject = (sem) => {
    setSemestersData(prev => ({
      ...prev,
      [sem]: [...prev[sem], { code: "", name: "", credits: "", isActive: true, isElective: false, saved: false }]
    }));
  };

  const updateSubject = (sem, index, field, value) => {
    setSemestersData(prev => {
      const updatedSem = [...prev[sem]];
      updatedSem[index] = { ...updatedSem[index], [field]: value };
      return { ...prev, [sem]: updatedSem };
    });
  };

  const removeSubject = (sem, index) => {
    const sub = semestersData[sem][index];
    if (sub.saved) {
      alert("Saved subjects cannot be deleted. Use the toggle button to deactivate them instead.");
      return;
    }
    setSemestersData(prev => ({
      ...prev,
      [sem]: prev[sem].filter((_, i) => i !== index)
    }));
  };

  const toggleSubjectStatus = (sem, index) => {
    setSemestersData(prev => {
      const updatedSem = [...prev[sem]];
      updatedSem[index] = { ...updatedSem[index], isActive: !updatedSem[index].isActive };
      return { ...prev, [sem]: updatedSem };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (uploadType === "select") {
      setMessage({ type: "error", text: "Please select an upload type." });
      return;
    }

    if (uploadType === "studentList" && !file) {
      setMessage({ type: "error", text: "Please choose a CSV file for Student List." });
      return;
    }

    setLoading(true);

    try {
      if (uploadType === "studentList") {
        if (!studentRegulation || !batch || !programme || !department) {
          setMessage({ type: "error", text: "Regulation, Batch, Programme Name, and Department are required for Student List." });
          setLoading(false);
          return;
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
          setMessage({ type: "error", text: "Only CSV supported for Student List." });
          setLoading(false);
          return;
        }

        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const rows = results.data;
            const studentsMap = {};
            const studentsData = {};
            
            // Find columns
            const headers = results.meta.fields || [];
            const examCandidates = ['exam no', 'exam_no', 'examno', 'register no', 'register_no', 'register number', 'reg no', 'regno', 'roll no', 'rollno'];
            const nameCandidates = ['name', 'student name', 'student_name', 'student'];
            
            let examKey = headers.find(h => examCandidates.includes(h.toLowerCase().trim()));
            let nameKey = headers.find(h => nameCandidates.includes(h.toLowerCase().trim()));

            // If headers not found, assume first col is exam no, second is name
            if (!examKey && headers.length > 0) examKey = headers[0];
            if (!nameKey && headers.length > 1) nameKey = headers[1];

            if (!examKey || !nameKey) {
              setMessage({ type: "error", text: "Could not detect Exam No and Name columns." });
              setLoading(false);
              return;
            }

            // Detect which admission fields are present as columns
            const presentAdmissionFields = ADMISSION_FIELDS.filter(f => headers.includes(f));

            rows.forEach(row => {
              const examNo = normalizeExamNo(row[examKey]);
              const name = String(row[nameKey] || '').trim();
              if (examNo && name) {
                studentsMap[examNo] = name;
                const extra = {};
                presentAdmissionFields.forEach(f => {
                  const v = row[f];
                  if (v !== undefined && v !== null && String(v).trim() !== '') {
                    extra[f] = String(v).trim();
                  }
                });
                if (Object.keys(extra).length > 0) {
                  studentsData[examNo] = extra;
                }
              }
            });

            if (Object.keys(studentsMap).length === 0) {
              setMessage({ type: "error", text: "No students detected. Ensure the sheet has Exam No and Name columns." });
              setLoading(false);
              return;
            }

            const progKey = formatProgrammeKey(programme);
            const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
            const studentDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;
            const studentsRef = doc(db, 'students', studentDocId); // Firestore doc reference

            // Read existing doc to merge data (preserve students not in CSV)
            const existingSnap = await getDoc(studentsRef);
            const existingData = existingSnap.exists() ? existingSnap.data() : {};

            // Build payload: start with existing data, overwrite with new CSV data
            const payload = { ...existingData };

            // Overwrite/merge student names from CSV
            Object.keys(studentsMap).forEach(reg => {
              payload[reg] = studentsMap[reg];
            });

            // Update _meta with current selection
            const totalCount = Object.keys(payload).filter(k => !k.startsWith('_')).length;
            payload._meta = {
              batch,
              programme_name: programme,
              department,
              section: section || '',
              count: totalCount
            };

            // Merge extra admission fields into _student_data
            if (Object.keys(studentsData).length > 0) {
              const existingStudentData = existingData._student_data || {};
              payload._student_data = { ...existingStudentData, ...studentsData };
            }

            await setDoc(studentsRef, payload); // Use setDoc for Firestore
            setSuccessMessage(`Saved ${Object.keys(studentsMap).length} students to database.`);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
            setFile(null);
            e.target.reset();
            setLoading(false);
          },
          error: (err) => {
            setMessage({ type: "error", text: `CSV parse failed: ${err.message}` });
            setLoading(false);
          }
        });

      } else {
        // Syllabus upload
        if (!syllabusProgramme || syllabusDept === "select" || !regulation) {
          setMessage({ type: "error", text: "Programme, Department, and Regulation are required." });
          setLoading(false);
          return;
        }

        const deptVal = syllabusDept;
        
        let downloadURL = "";
        if (file) {
          // Upload to Firebase Storage
          const fileRef = storageRef(storage, `syllabus/${deptVal}/${file.name}`);
          await uploadBytes(fileRef, file);
          downloadURL = await getDownloadURL(fileRef);
        }

        const progKey = formatProgrammeKey(syllabusProgramme);
        const syllabusDocId = `${progKey}_${sanitizeKey(deptVal)}_${sanitizeKey(regulation)}`;
        const syllabusRef = doc(db, 'syllabus_data', syllabusDocId); // Firestore doc reference
        
        const existingSnapshot = await getDoc(syllabusRef); // Use getDoc for Firestore
        const existingData = existingSnapshot.exists() ? existingSnapshot.data() : null; // Use .data() for Firestore documents
        
        await setDoc(syllabusRef, {
          programme: syllabusProgramme,
          department: deptVal,
          regulation: regulation,
          academic_year: academicYear,
          file_name: file ? file.name : (existingData?.file_name || ""),
          file_url: downloadURL || (existingData?.file_url || ""),
          semesters: semestersData,
          uploaded_at: existingData?.uploaded_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        setSuccessMessage(isUpdating ? "Syllabus updated successfully!" : "Syllabus data saved successfully!");
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        setFile(null);
        // Keep current syllabus selection and data visible after save.
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: `An error occurred: ${error.message}` });
      setLoading(false);
    }
  };

  return (
    <Layout title="Upload Namelist & Syllabus">
      <style>{styles}</style>
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] via-white to-[#f0f0fa] px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        
        {message.text && (
          <div className={`mb-6 p-4 rounded-xl flex items-center justify-between font-medium border ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
            <span className="flex items-center gap-2">
              {message.type === 'error' ? '✗' : '✓'} {message.text}
            </span>
            <button onClick={() => setMessage({ type: "", text: "" })} className="text-lg font-bold leading-none hover:opacity-75">&times;</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-zinc-700 mb-2 uppercase tracking-wide">Upload Type</label>
              <div className="relative">
                <select 
                  className="w-full px-4 py-3 border-2 border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none bg-white transition-all"
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  required
                >
                  <option value="select">Select Upload Type</option>
                  <option value="syllabus">📚 Syllabus</option>
                  <option value="studentList">👥 Student List</option>
                </select>
              </div>
            </div>
          </div>

          {uploadType === "syllabus" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-zinc-50 rounded-lg border border-zinc-200">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Programme Name</label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none"
                    value={syllabusProgramme}
                    onChange={(e) => {
                      setSyllabusProgramme(e.target.value);
                      setSyllabusDept("select");
                    }}
                  >
                    <option value="">Select Programme</option>
                    {Object.keys(PROGRAMME_DEPARTMENTS).map(prog => (
                      <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Department
                  </label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none"
                    value={syllabusDept}
                    onChange={(e) => setSyllabusDept(e.target.value)}
                    disabled={!syllabusProgramme}
                  >
                    <option value="select">Select Department</option>
                    {syllabusProgramme && PROGRAMME_DEPARTMENTS[syllabusProgramme]?.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Regulation</label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none"
                    value={regulation}
                    onChange={(e) => setRegulation(e.target.value)}
                  >
                    <option value="">Select Regulation</option>
                    {regulations.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
                {/* Academic Year input intentionally hidden for Syllabus upload */}
              </div>

              {fetchingSyllabus && (
                <div className="flex items-center justify-center py-8 bg-zinc-50 rounded-lg border border-dashed border-zinc-300">
                  <div className="flex items-center gap-3 text-zinc-500">
                    <div className="w-5 h-5 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium">Loading existing syllabus data...</span>
                  </div>
                </div>
              )}

              {syllabusProgramme && syllabusDept !== "select" && regulation && !fetchingSyllabus && (
                <div className="space-y-6">
                  {Array.from({ length: syllabusDuration * 2 }, (_, i) => i + 1).map(sem => (
                    <div key={sem} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                      <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-800">Semester {sem}</h3>
                        <button
                          type="button"
                          onClick={() => addSubject(sem)}
                          className="px-3 py-1 bg-[#120c7a] text-white text-sm font-medium rounded hover:bg-[#100b6e] transition-colors"
                        >
                          + Add Subject
                        </button>
                      </div>
                      <div className="p-4">
                        {semestersData[sem].length === 0 ? (
                          <p className="text-sm text-zinc-400 italic text-center py-4">No subjects added yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead>
                                <tr className="text-zinc-500 border-b border-zinc-100">
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium">Subject Code</th>
                                  <th className="pb-2 font-medium">Subject Name</th>
                                  <th className="pb-2 font-medium w-24">Credits</th>
                                  <th className="pb-2 font-medium text-center">Elective</th>
                                  <th className="pb-2 font-medium w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {semestersData[sem].map((sub, idx) => (
                                  <tr key={idx} className={!sub.isActive ? "opacity-50" : ""}>
                                    <td className="py-2 pr-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleSubjectStatus(sem, idx)}
                                        className={`group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:ring-offset-2 transition-all duration-200 ${sub.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                                        title={sub.isActive ? "Active" : "Inactive"}
                                      >
                                        <span className="sr-only">Toggle subject status</span>
                                        <span
                                          aria-hidden="true"
                                          className={`pointer-events-none absolute h-full w-full rounded-md bg-transparent transition-all duration-200`}
                                        />
                                        <span
                                          aria-hidden="true"
                                          className={`pointer-events-none flex items-center justify-center h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${sub.isActive ? 'translate-x-2.5' : '-translate-x-2.5'}`}
                                        >
                                          {sub.isActive && <Check className="text-emerald-500" size={10} strokeWidth={4} />}
                                        </span>
                                      </button>
                                    </td>
                                    <td className="py-2 pr-2">
                                      {sub.saved ? (
                                        <input
                                          type="text"
                                          className="w-full px-2 py-1 border border-zinc-200 rounded text-zinc-500 bg-zinc-50 outline-none"
                                          value={sub.code}
                                          disabled
                                        />
                                      ) : (
                                        <select
                                          className="w-full px-2 py-1 border border-zinc-200 rounded focus:ring-1 focus:ring-[#120c7a] outline-none max-w-[200px] truncate"
                                          value={sub.code || ""}
                                          onChange={(e) => updateSubjectFromBank(sem, idx, e.target.value)}
                                        >
                                          <option value="">Select subject</option>
                                          {availableCourses.map(c => (
                                            <option key={`${c._sourceDept}:${c.key}`} value={c.code}>
                                              {c.code} {c.name ? `- ${c.name}` : ''}
                                            </option>
                                          ))}
                                          {sub.code && !availableCourses.find(c => c.code === sub.code) && (
                                            <option value={sub.code}>{sub.code}</option>
                                          )}
                                        </select>
                                      )}
                                    </td>
                                    <td className="py-2 pr-2">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border border-zinc-200 rounded focus:ring-1 focus:ring-[#120c7a] outline-none bg-zinc-50 text-zinc-600"
                                        value={sub.name}
                                        readOnly
                                        placeholder="e.g. Data Structures"
                                        disabled={sub.saved}
                                      />
                                    </td>
                                    <td className="py-2 pr-2">
                                      <input
                                        type="number"
                                        className="w-full px-2 py-1 border border-zinc-200 rounded focus:ring-1 focus:ring-[#120c7a] outline-none bg-zinc-50 text-zinc-600"
                                        value={sub.credits}
                                        readOnly
                                        placeholder="3"
                                        disabled={sub.saved}
                                      />
                                    </td>
                                    <td className="py-2 pr-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={!!sub.isElective}
                                        onChange={(e) => updateSubject(sem, idx, 'isElective', e.target.checked)}
                                        className="w-4 h-4 mx-auto"
                                      />
                                    </td>
                                    <td className="py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => removeSubject(sem, idx)}
                                        className={`transition-colors ${sub.saved ? 'text-zinc-300 cursor-not-allowed' : 'text-red-500 hover:text-red-700'}`}
                                        title={sub.saved ? "Cannot delete saved subjects" : "Remove subject"}
                                        disabled={sub.saved}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {uploadType === "studentList" && (
            <div className="space-y-6 p-6 bg-zinc-50 rounded-lg border border-zinc-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Programme Name*</label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none"
                    value={programme}
                    onChange={(e) => {
                      setProgramme(e.target.value);
                      setDepartment("");
                      setBatch("");
                      setSection("");
                    }}
                  >
                    <option value="">Select Programme</option>
                    {Object.keys(PROGRAMME_DEPARTMENTS).map(prog => (
                      <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Batch*</label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none disabled:opacity-50"
                    value={batch}
                    onChange={(e) => { setBatch(e.target.value); setSection(""); }}
                    disabled={!programme}
                  >
                    <option value="">Select Batch</option>
                    {availableBatches.map(b => (
                      <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Regulation</label>
                  <div className="w-full px-4 py-2 border border-zinc-300 rounded-lg bg-zinc-100 text-zinc-500 font-medium">
                     {studentRegulation || "Regulation not mapped"}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Department*
                  </label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none"
                    value={department}
                    onChange={(e) => { setDepartment(e.target.value); setSection(""); }}
                    disabled={!programme}
                  >
                    <option value="">Select Department</option>
                    {programme && PROGRAMME_DEPARTMENTS[programme]?.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Section</label>
                  <select 
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none disabled:opacity-50"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    disabled={!department || !batch || availableSections.length === 0}
                  >
                    <option value="">{availableSections.length === 0 && department && batch ? "No sections configured" : "Select Section"}</option>
                    {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-sm text-zinc-500">Upload CSV with columns: Exam No, Name + optional admission fields. <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate(); }} className="text-[#120c7a] underline">Download template</a> for full column list.</p>
            </div>
          )}

          {uploadType === "studentList" && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">File</label>
              <input 
                type="file" 
                className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] focus:border-blue-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={handleFileChange}
                accept=".csv"
                required
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  Upload CSV with Exam No, Name + optional admission data columns
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-sm text-[#120c7a] hover:text-[#0a0749] font-medium flex items-center gap-1 transition-colors"
                >
                  <Download size={14} /> Download Template
                </button>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full md:w-auto px-6 py-2.5 bg-[#120c7a] text-white font-medium rounded-lg hover:bg-[#100b6e] focus:ring-4 focus:ring-[#120c7a]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (uploadType === 'studentList' ? 'Uploading...' : 'Saving...') : (uploadType === 'studentList' ? 'Upload' : (isUpdating ? 'Update Syllabus' : 'Save Syllabus'))}
          </button>
        </form>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000]">
          <div className="bg-green-500 p-1 rounded-full">
            <CheckCircle2 size={18} />
          </div>
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}
        </div>
      </div>
    </Layout>
  );
}
