import { useState, useEffect, useMemo } from "react";
import { CKEditor } from 'ckeditor4-react';
import { rtdb, auth } from "../firebase"; // Ensure auth is imported
import { ref, set, get, onValue } from "firebase/database";
import { 
  ChevronDown, 
  Download, 
  FileText, 
  CheckCircle2,
  LayoutDashboard,
  Settings,
  Plus
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey } from "../lib/utils";

const SEMESTER_MAPPING = {
  0: ["1st Semester", "2nd Semester"],
  1: ["3rd Semester", "4th Semester"],
  2: ["5th Semester", "6th Semester"],
  3: ["7th Semester", "8th Semester"]
};

const getSemesters = (academicYear, batch) => {
  if (!academicYear || !batch) return [];
  const [batchStart] = batch.split("-").map(Number);
  const [yearStart] = academicYear.split("-").map(Number);
  const yearIndex = yearStart - batchStart;
  return SEMESTER_MAPPING[yearIndex] || [];
};

const deriveSemesterNumber = (label) => {
  if (!label) return '';
  const m = String(label).match(/(\d+)/);
  return m ? m[1] : '';
};

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function QuestionPaper() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  // Selection States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [exam, setExam] = useState("");
  const [customExam, setCustomExam] = useState("");
  const [numParts, setNumParts] = useState("");

  // Parts Configuration State
  const [partsConfig, setPartsConfig] = useState([]);
  const [showParts, setShowParts] = useState(false);

  // Editor State
  const [editorData, setEditorData] = useState("");

  // UI States
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  useEffect(() => {
    const configsRef = ref(rtdb, 'cia_configs');
    const unsubscribe = onValue(configsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const configsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setCiaConfigs(configsArray);
      } else {
        setCiaConfigs([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const filteredExams = useMemo(() => {
    if (!programme || !department || !batch || !academicYear || !semester) return [];
    
    const semNum = deriveSemesterNumber(semester);
    
    return ciaConfigs.filter(config => 
      config.program === programme &&
      (config.department === department || !config.department) &&
      (!config.batch || config.batch === batch) &&
      (!config.academicYear || config.academicYear === academicYear) &&
      (!config.semester || String(config.semester) === semNum)
    );
  }, [ciaConfigs, programme, department, batch, academicYear, semester]);

  useEffect(() => {
    if (exam && exam !== 'custom') {
      const selectedConfig = ciaConfigs.find(c => c.id === exam);
      if (selectedConfig) {
        setNumParts(String(selectedConfig.numParts || selectedConfig.parts?.length || 0));
        if (selectedConfig.parts && selectedConfig.parts.length > 0) {
          setPartsConfig(selectedConfig.parts.map((p, i) => ({
            name: p.name || `Part ${String.fromCharCode(65 + i)}`,
            numQuestions: p.numberOfQuestions || 0,
            marksPerQuestion: p.marksPerQuestion || 0,
            isEitherOr: p.hasInternalChoice || false
          })));
        }
      }
    }
  }, [exam, ciaConfigs]);

  useEffect(() => {
    if (batch) {
      setAcademicYears(getAcademicYears(batch));
      setAcademicYear("");
    } else {
      setAcademicYears([]);
    }
  }, [batch]);

  useEffect(() => {
    if (batch && academicYear) {
      setSemesters(getSemesters(academicYear, batch));
      setSemester("");
    } else {
      setSemesters([]);
    }
  }, [batch, academicYear]);

  // Fetch Subjects from Syllabus and Filter by Assignments
  useEffect(() => {
    const fetchSubjects = async () => {
      const progKey = formatProgrammeKey(programme);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!programme || !department || !regulation || !semester || !batch || !academicYear) {
        setSubjects([]);
        return;
      }

      const deptKey = sanitizeKey(department);
      const regKey = sanitizeKey(regulation);
      const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
      const semNum = deriveSemesterNumber(semester);

      if (!semNum) return;

      try {
        // 1. Fetch Syllabus Subjects
        const syllabusRef = ref(rtdb, `syllabus_data/${syllabusKey}`);
        const snapshot = await get(syllabusRef);
        const data = snapshot.val();
        let fetchedSubjects = [];
        
        if (data && data.semesters && data.semesters[semNum]) {
          fetchedSubjects = data.semesters[semNum]
            .filter(s => s != null && s.isActive !== false)
            .map(s => ({
            value: s.code,
            text: `${s.code} - ${s.name}`
          }));
        }

        // 2. Fetch Assignments for current user
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setSubjects([]);
          return;
        }

        // Admin can see all subjects
        const adminEmail = import.meta.env.VITE_DEFAULT_ADMIN_EMAIL || "obe@ckcet.edu.in";
        if (currentUser.email === adminEmail) {
          setSubjects(fetchedSubjects);
          return;
        }

        const assignmentPath = `subject_assignments/${progKey}/${deptKey}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semNum}`;
        const assignmentRef = ref(rtdb, assignmentPath);
        const assignmentSnap = await get(assignmentRef);
        
        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.val();
          const userAssignments = assignments[currentUser.uid] || [];
          
          // Filter syllabus subjects by user assignments
          const filteredSubjects = fetchedSubjects.filter(s => userAssignments.includes(s.value));
          setSubjects(filteredSubjects);
        } else {
          setSubjects([]);
        }

      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
      }
    };

    fetchSubjects();
  }, [programme, department, batch, academicYear, semester, getRegulationForBatch]);

  // Handle Parts Generation
  const handleGenerateParts = () => {
    if (!numParts) return;
    const n = parseInt(numParts);
    const newParts = [];
    for (let i = 1; i <= n; i++) {
      newParts.push({
        id: i,
        letter: String.fromCharCode(64 + i),
        numQuestions: i === 1 ? 10 : 5,
        marksPerQuestion: i === 1 ? 2 : 16
      });
    }
    setPartsConfig(newParts);
    setShowParts(true);
  };

  const updatePart = (id, field, value) => {
    setPartsConfig(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // Generate Table Logic
  const generateTables = async () => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject || !exam || !numParts) {
      alert("Please fill all required fields.");
      return;
    }

    const semNum = deriveSemesterNumber(semester);
    const yearMapping = { 1: "I", 2: "I", 3: "II", 4: "II", 5: "III", 6: "III", 7: "IV", 8: "IV" };
    const semMapping = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII" };
    const yearSemester = `${yearMapping[semNum] || '-'} / ${semMapping[semNum] || '-'}`;

    const isDCAI = exam === 'DCA-I';
    const isDCAII = exam === 'DCA-II';
    const isDCAIII = exam === 'DCA-III';

    let overallTotal = 0;
    const partsForPayload = [];

    partsConfig.forEach(p => {
      overallTotal += p.numQuestions * p.marksPerQuestion;
    });

    // Reset global counter for the actual generation
    let globalQCounter = 1;

    let combinedContent = `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.3;">
        <tr>
          <td style="text-align: left; padding: 4px;">CO Assessment - Direct Assessment Tool - Descriptive Continuous Assessment (DCA)</td>
          <td style="text-align: right; padding: 4px;">
            <div style="border: 1px solid black; padding: 6px; font-weight: bold; font-size: 11px; display: inline-block;">EXAMINATION CELL</div>
          </td>
        </tr>
      </table>
      <table cellspacing="0" style="border-collapse:collapse; font-size:11px; height:80px; width:100%">
        <tbody>
          <tr>
            <td style="text-align:center; width:100%"><img alt="logo" class="logo-img" src="https://i.postimg.cc/QdgcKs7s/ckcet-logo.png" style="width:100%; height:auto; display:block;" /></td>
          </tr>
        </tbody>
      </table>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;" border="1">
        <tr>
          <td><strong>Internal Assessment Test</strong></td>
          <td colspan="3">${exam === 'custom' ? customExam : (ciaConfigs.find(c => c.id === exam)?.examName || exam)}</td>
          <td><strong>Academic Year</strong></td>
          <td>${academicYear}</td>
        </tr>
        <tr>
          <td><strong>Subject Code / Subject Title</strong></td>
          <td colspan="5">${typeof subject === 'object' ? subject.text : subject}</td>
        </tr>
        <tr>
          <td><strong>Year / Semester</strong></td>
          <td>${yearSemester}</td>
          <td><strong>Department</strong></td>
          <td>${department}</td>
          <td><strong>Common for</strong></td>
          <td>-</td>
        </tr>
        <tr>
          <td><strong>Max Mark</strong></td>
          <td>${overallTotal}</td>
          <td><strong>Duration</strong></td>
          <td>180 min</td>
          <td><strong>Date</strong></td>
          <td>${new Date().toLocaleDateString()}</td>
        </tr>
        <tr>
          <td><strong>Reg. No.</strong></td>
          <td colspan="5"></td>
        </tr>
      </table>
    `;

    partsConfig.forEach(p => {
      const partLetter = p.letter;
      const marksPerQuestion = p.marksPerQuestion;
      const numQuestions = p.numQuestions;

      combinedContent += `
        <table style="width: 100%; border-collapse: collapse; font-weight: bold; font-size: 16px; margin-top: 15px; margin-bottom: 6px; border: 1px solid black;">
          <tr>
            <td style="width: 50%; padding: 6px; border: none;">Part ${partLetter}</td>
            <td style="width: 50%; padding: 6px; border: none; text-align: right;">${numQuestions} &times; ${marksPerQuestion} = ${numQuestions * marksPerQuestion} Marks</td>
          </tr>
        </table>
        <table border="1" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr>
              <th style="width: 10%;">Q. No.</th>
              <th style="width: 70%;">Question(s)</th>
              <th style="width: 10%;">KL</th>
              <th style="width: 10%;">CO</th>
            </tr>
          </thead>
          <tbody>
      `;

      const qs = [];
      for (let j = 0; j < numQuestions; j++) {
        if (partLetter !== "A") {
          // Either/Or style for Part B, C, etc.
          combinedContent += `
            <tr>
              <td style="text-align: center; vertical-align: middle;">${globalQCounter}(a)</td>
              <td contenteditable="true" style="padding: 10px; min-height: 40px;">Enter question ${globalQCounter}(a) here...</td>
              <td contenteditable="true" style="text-align: center;">L3</td>
              <td contenteditable="true" style="text-align: center;">CO${j + 1}</td>
            </tr>
            <tr>
              <td></td>
              <td style="text-align: center; padding: 4px;"><strong>(Or)</strong></td>
              <td></td>
              <td></td>
            </tr>
            <tr>
              <td style="text-align: center; vertical-align: middle;">${globalQCounter}(b)</td>
              <td contenteditable="true" style="padding: 10px; min-height: 40px;">Enter question ${globalQCounter}(b) here...</td>
              <td contenteditable="true" style="text-align: center;">L3</td>
              <td contenteditable="true" style="text-align: center;">CO${j + 1}</td>
            </tr>
          `;
          qs.push({ qno: `${globalQCounter}(a)`, sub: "a", either_or: true, marks: marksPerQuestion });
          qs.push({ qno: `${globalQCounter}(b)`, sub: "b", either_or: true, marks: marksPerQuestion });
        } else {
          // Direct style for Part A
          combinedContent += `
            <tr>
              <td style="text-align: center; vertical-align: middle;">${globalQCounter}</td>
              <td contenteditable="true" style="padding: 10px; min-height: 40px;">Enter question ${globalQCounter} here...</td>
              <td contenteditable="true" style="text-align: center;">L2</td>
              <td contenteditable="true" style="text-align: center;">CO${j + 1}</td>
            </tr>
          `;
          qs.push({ qno: `${globalQCounter}`, either_or: false, marks: marksPerQuestion });
        }
        globalQCounter++;
      }

      combinedContent += `</tbody></table>`;
      partsForPayload.push({
        part: partLetter,
        num_questions: numQuestions,
        marks_per_question: marksPerQuestion,
        questions: qs
      });
    });

    combinedContent += `
      <h3 style="margin-top: 20px;">Details of Subject Outcomes</h3>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Subject Outcome Code</th>
            <th>Description</th>
            <th>Tick the CO's covered in this QP</th>
            <th>Weightage of marks allotted to each CO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CCS341.1</td>
            <td>Design data warehouse architecture for various problems</td>
            <td style="text-align: center;">${isDCAI || isDCAIII ? '✓' : ''}</td>
            <td></td>
          </tr>
          <tr>
            <td>CCS341.2</td>
            <td>Apply the OLAP Technology</td>
            <td style="text-align: center;">${isDCAI || isDCAIII ? '✓' : ''}</td>
            <td></td>
          </tr>
          <tr>
            <td>CCS341.3</td>
            <td>Analyze the partitioning strategy</td>
            <td style="text-align: center;">${isDCAII || isDCAIII ? '✓' : ''}</td>
            <td></td>
          </tr>
          <tr>
            <td>CCS341.4</td>
            <td>Critically analyze the differentiation of various schema for given problem</td>
            <td style="text-align: center;">${isDCAII || isDCAIII ? '✓' : ''}</td>
            <td></td>
          </tr>
          <tr>
            <td>CCS341.5</td>
            <td>Frame roles of process manager & system manager</td>
            <td style="text-align: center;">${isDCAIII ? '✓' : ''}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <table style="width: 100%; border-collapse: collapse; margin-top: 40px;">
        <tr>
          <td style="text-align: center; border: none; padding-top: 40px;">HOD Signature</td>
          <td style="text-align: center; border: none; padding-top: 40px;">Academic Coordinator</td>
          <td style="text-align: center; border: none; padding-top: 40px;">Principal</td>
        </tr>
      </table>
    `;

    setEditorData(combinedContent);

    // Save to Firebase
    try {
      const selectedConfig = ciaConfigs.find(c => c.id === exam);
      const qpName = exam === 'custom' ? customExam : (selectedConfig ? selectedConfig.examName : exam);
      const subCode = typeof subject === 'object' ? subject.value : subject;
      const subText = typeof subject === 'object' ? subject.text : '';
      const subName = subText.includes(' - ') ? subText.split(' - ')[1] : '';

      const marksKey = [programme, department, academicYear, subCode, qpName]
        .map(sanitizeKey)
        .join('_');

      const payload = {
        qpaper_name: qpName,
        department,
        programme,
        batch,
        subject: subCode,
        subject_name: subName,
        academic_year: academicYear,
        semester: semNum,
        parts: partsForPayload,
        total_marks: overallTotal,
        saved_at: new Date().toISOString()
      };

      await set(ref(rtdb, `generated_qps/${marksKey}`), payload);
      setSuccessMessage("Question Paper Saved!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save Error:", error);
      alert("Failed to save question paper metadata.");
    }
  };

  // Download Logic
  const downloadDocx = () => {
    if (!editorData) return;

    const wordHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #333; padding: 6px; text-align: center; }
          th { background-color: #f2f2f2; }
          .logo-img { width: 100%; height: auto; display: block; }
        </style>
      </head>
      <body>
        ${editorData}
        <div style="margin-top: 20px; font-size: 9pt;">
          <strong>Knowledge Level (KL):</strong> L1-Remember, L2-Understand, L3-Apply, L4-Analyze, L5-Evaluate, L6-Create
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordHTML], { type: 'application/msword' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `QuestionPaper_${subject}_${exam}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Question Paper Generator</h1>
            <p className="text-slate-500 text-sm mt-1">Configure and generate professional question papers</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={downloadDocx}
              disabled={!editorData}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <Download size={18} />
              Download Word
            </button>
            <button 
              onClick={generateTables}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-white font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
            >
              <FileText size={18} />
              Generate Paper
            </button>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Programme */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Programme</label>
              <div className="relative">
                <select 
                  value={programme}
                  onChange={(e) => { setProgramme(e.target.value); setDepartment(""); }}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                >
                  <option value="">Select Programme</option>
                  <option value="B.E.">B.E.</option>
                  <option value="B.Tech.">B.Tech</option>
                  <option value="M.E.">M.E.</option>
                  <option value="M.Tech.">M.Tech</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Department */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department</label>
              <div className="relative">
                <select 
                  value={department}
                  disabled={!programme}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium disabled:opacity-50"
                >
                  <option value="">Select Department</option>
                  {programme && PROGRAMME_DEPARTMENTS[formatProgrammeKey(programme)]?.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Batch */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Batch</label>
              <div className="relative">
                <select 
                  value={batch}
                  onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                >
                  <option value="">Select Batch</option>
                  {batches.map(b => (
                    <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Academic Year */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Academic Year</label>
              <div className="relative">
                <select 
                  value={academicYear}
                  disabled={!batch}
                  onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); }}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                >
                  <option value="">Select Year</option>
                  {academicYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Semester */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Semester</label>
              <div className="relative">
                <select 
                  value={semester}
                  disabled={!academicYear}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium disabled:opacity-50"
                >
                  <option value="">Select Semester</option>
                  {semesters.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</label>
              <div className="relative">
                <select 
                  value={typeof subject === 'object' ? subject.value : subject}
                  onChange={(e) => {
                    const val = e.target.value;
                    const fullObj = subjects.find(s => s.value === val);
                    setSubject(fullObj || val);
                  }}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => (
                    <option key={s.value} value={s.value}>
                      {s.text}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Exam */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Exam</label>
              <div className="relative">
                <select 
                  value={exam}
                  onChange={(e) => setExam(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                >
                  <option value="">Select Exam</option>
                  {filteredExams.map(e => (
                    <option key={e.id} value={e.id}>{e.examName}</option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Number of Parts */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Number of Parts</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select 
                    value={numParts}
                    onChange={(e) => setNumParts(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                  >
                    <option value="">Select Parts</option>
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                </div>
                <button 
                  onClick={handleGenerateParts}
                  className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
                  title="Configure Parts"
                >
                  <Settings size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Custom Exam Input */}
          {exam === 'custom' && (
            <div className="mt-4 max-w-md">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custom Exam Name</label>
              <input 
                type="text"
                value={customExam}
                onChange={(e) => setCustomExam(e.target.value)}
                placeholder="Enter exam name..."
                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
              />
            </div>
          )}
        </div>

        {/* Parts Configuration */}
        {showParts && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <LayoutDashboard size={20} className="text-blue-600" />
                Parts Configuration
              </h2>
              <button 
                onClick={generateTables}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-white text-sm font-semibold hover:bg-blue-700 transition-all shadow-md"
              >
                <Plus size={16} />
                Apply to Template
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {partsConfig.map(p => (
                <div key={p.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                  <h3 className="font-bold text-slate-700">Part {p.letter}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Questions</label>
                      <input 
                        type="number"
                        value={p.numQuestions}
                        onChange={(e) => updatePart(p.id, 'numQuestions', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marks/Q</label>
                      <select 
                        value={p.marksPerQuestion}
                        onChange={(e) => updatePart(p.id, 'marksPerQuestion', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      >
                        <option value="2">2 Marks</option>
                        <option value="13">13 Marks</option>
                        <option value="15">15 Marks</option>
                        <option value="16">16 Marks</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editor Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-bold text-slate-700">Question Paper Editor</h2>
            <div className="text-xs text-slate-400 font-mono">A4 Page Layout</div>
          </div>
          <div className="p-6 flex justify-center bg-slate-200/50 min-h-[800px]">
            <div className="bg-white shadow-2xl w-[210mm] min-h-[297mm] p-0">
              <CKEditor
                data={editorData}
                onChange={(evt) => setEditorData(evt.editor.getData())}
                config={{
                  height: '297mm',
                  width: '210mm',
                  versionCheck: false,
                  bodyClass: 'a4-body',
                  extraPlugins: 'image,table,justify,font,colorbutton',
                  toolbar: [
                    { name: 'clipboard', items: ['Cut', 'Copy', 'Paste', 'Undo', 'Redo'] },
                    { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript'] },
                    { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock'] },
                    { name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'SpecialChar'] },
                    { name: 'styles', items: ['Styles', 'Format', 'Font', 'FontSize'] },
                    { name: 'colors', items: ['TextColor', 'BGColor'] },
                    { name: 'tools', items: ['Maximize'] }
                  ],
                  contentsCss: [
                    'https://cdn.ckeditor.com/4.20.1/full-all/contents.css',
                    'body { font-family: "Times New Roman", Times, serif; font-size: 11pt; padding: 20mm; }' +
                    'table { width: 100%; border-collapse: collapse; }' +
                    'td, th { border: 1px solid #333; padding: 4px; }' +
                    'img { max-width: 100%; height: auto; }'
                  ]
                }}
              />
            </div>
          </div>
        </div>

        {/* Success Toast */}
        {showSuccess && (
          <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 z-50">
            <div className="bg-green-500 p-1 rounded-full">
              <CheckCircle2 size={18} />
            </div>
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
