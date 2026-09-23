import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRegulations } from "../../hooks/useRegulations";
import {
  Copy,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  IndianRupee,
  X,
  Send,
  Ban,
  Plus,
  Trash2,
} from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const formatDepartment = (dept, programme) => {
  let raw = (dept || '').trim();
  if (!raw && programme) raw = programme.trim();
  if (!raw) return '—';

  raw = raw
    .replace(/\bB_E_\b/gi, 'B.E.')
    .replace(/\bB_Tech_\b/gi, 'B.Tech.')
    .replace(/\bM_E_\b/gi, 'M.E.')
    .replace(/\bM_Tech_\b/gi, 'M.Tech.')
    .replace(/\bM_B_A_\b/gi, 'M.B.A.')
    .replace(/\bM_C_A_\b/gi, 'M.C.A.')
    .replace(/\bPh_D_\b/gi, 'Ph.D.');

  raw = raw.replace(/([A-Za-z])_([A-Za-z])/g, '$1.$2.');
  raw = raw.replace(/_/g, ' ');
  return raw.replace(/\s+/g, ' ').trim();
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '19-09-2026';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  }
  return dateStr;
};

const extractMarksDocMeta = (d) => {
  if (!d) return {};
  const data = typeof d.data === 'function' ? d.data() : (d || {});
  const m = data._meta || {};
  const qm = data.qpaper_meta || {};
  return {
    programme: data.programme || m.programme || qm.programme || '',
    department: data.department || m.department || qm.department || '',
    batch: data.batch || m.batch || qm.batch || '',
    academicYear: data.academic_year || m.academic_year || qm.academic_year || data.academicYear || '',
    semesterLabel: data.semester_label || qm.semester_label || m.semester_label || data.semester || m.semester || qm.semester || '',
    subject: data.subject || qm.subject || m.subject || '',
    exam: data.exam || m.exam || qm.exam || qm.qpaper_name || '',
    examName: data.exam_name || m.exam_name || qm.exam_name || '',
    isUniversity: Boolean(data.is_university || m.is_university),
    students: data.students || m.students || {}
  };
};

const extractStudentMarkTotal = (s) => {
  if (s == null) return { total: 0, absent: false };
  if (typeof s === 'number') return { total: s, absent: false };
  if (typeof s === 'string') {
    const t = s.trim();
    if (t.toUpperCase() === 'A' || t.toLowerCase() === 'absent') return { total: 0, absent: true };
    const num = Number(t);
    return { total: isNaN(num) ? 0 : num, absent: false };
  }
  const isAbsent = Boolean(
    s.absent === true || s.absent === 'true' || s.isAbsent === true ||
    s.status === 'absent' || String(s.total || '').toUpperCase() === 'A'
  );
  let total = 0;
  for (const k of ['total', 'overall', 'mark', 'marks', 'score']) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '' && String(s[k]).toUpperCase() !== 'A') {
      total = Number(s[k]) || 0;
      break;
    }
  }
  if (total <= 0 && !isAbsent) {
    const coKeys = Object.keys(s).filter(k => /^CO\d+/i.test(k));
    if (coKeys.length > 0) total = coKeys.reduce((a, k) => a + (Number(s[k]) || 0), 0);
  }
  return { total, absent: isAbsent };
};

const isEseExam = (examName, isUniversityFlag) => {
  if (isUniversityFlag) return true;
  const n = String(examName || '').toLowerCase();
  return n.includes('end semester') || n === 'ese' || n.includes('university') || n.includes('semester exam');
};

const STATUS_STYLES = {
  Applied: 'bg-amber-100 text-amber-800 border-amber-200',
  Verified: 'bg-blue-100 text-blue-800 border-blue-200',
  'Payment Confirmed': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Copy Issued': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelled: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

const DEFAULT_ANNA_GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'RA', 'SA', 'AB'];

export default function Photocopy() {
  const [currentUser, setCurrentUser] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eligibleScripts, setEligibleScripts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [config, setConfig] = useState({ feePerSubject: 400, isOpen: true, instructions: '', fromDate: '', toDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Regulation & Grades State
  const { getRegulationForBatch } = useRegulations();
  const [regulationName, setRegulationName] = useState('');
  const [regulationGrades, setRegulationGrades] = useState(DEFAULT_ANNA_GRADES);

  // Subject Table Rows State (Starts with 1 row, max 5)
  const [subjectRows, setSubjectRows] = useState([
    { id: 1, semesterNo: '1', subjectCode: '', subjectTitle: '', grade: 'U', result: 'Fail', fee: 400 }
  ]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setCurrentUser(user);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  // Photocopy window config & fee from Exam Cell (subscribed in real-time)
  useEffect(() => {
    const unsubConfigs = onSnapshot(collection(db, 'exam_fee_configurations'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));

      const activePhotoConfig = list.find(c =>
        c.status === 'Active' &&
        (c.category === 'Photocopy' || c.category === 'Revaluation & Verification') &&
        (c.fees?.photocopyFee || c.fees?.fee || c.fees?.photocopy)
      );

      if (activePhotoConfig) {
        const feeVal = Number(activePhotoConfig.fees?.photocopyFee) ||
                       Number(activePhotoConfig.fees?.fee) ||
                       Number(activePhotoConfig.fees?.photocopy) || 400;
        setConfig(prev => ({ ...prev, feePerSubject: feeVal }));
      }
    }, () => {});

    const unsubSettings = onSnapshot(doc(db, 'exam_cell_settings', 'photocopy'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        setConfig(prev => ({
          ...prev,
          feePerSubject: d.feePerSubject ? Number(d.feePerSubject) : prev.feePerSubject,
          isOpen: d.isOpen !== false,
          instructions: d.instructions || prev.instructions,
          fromDate: d.fromDate || '',
          toDate: d.toDate || '',
        }));
      }
    }, () => {});

    return () => {
      unsubConfigs();
      unsubSettings();
    };
  }, []);

  // Fetch student regulation & grade configuration dynamically
  useEffect(() => {
    if (!studentData?.programme || !studentData?.batch) return;
    const reg = getRegulationForBatch(studentData.programme, studentData.batch);
    if (reg) {
      setRegulationName(reg);
      const fetchGrades = async () => {
        try {
          const docId = sanitizeKey(reg);
          let snap = await getDoc(doc(db, 'grade_configs', docId));
          if (!snap.exists()) snap = await getDoc(doc(db, 'grade_configs', reg));
          if (snap.exists()) {
            const data = snap.data() || {};
            const list = Array.isArray(data)
              ? data
              : (data.value && Array.isArray(data.value) ? data.value : Object.values(data));
            const parsed = list
              .map(g => (typeof g === 'string' ? g : g.grade))
              .filter(Boolean);
            if (parsed.length > 0) {
              const fullList = [...parsed];
              ['U', 'RA', 'AB', 'SA'].forEach(fg => {
                if (!fullList.includes(fg)) fullList.push(fg);
              });
              setRegulationGrades(fullList);
            }
          }
        } catch (err) {
          console.error('Error fetching regulation grades:', err);
        }
      };
      fetchGrades();
    }
  }, [studentData, getRegulationForBatch]);

  // Eligible answer scripts from marks
  useEffect(() => {
    if (!studentData) return;
    const { regNo, programme, department, batch } = studentData;
    if (!regNo && !studentData.reg && !studentData.admNo && !studentData.admissionNo) {
      setLoading(false);
      return;
    }

    const fetchScripts = async () => {
      try {
        let canonicalId = null;
        if (regNo || studentData.reg) {
          try {
            const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(regNo || studentData.reg)));
            if (idxSnap.exists()) canonicalId = idxSnap.data().canonicalId || idxSnap.data().admissionNo || null;
          } catch (_) {}
        }
        const candidateKeys = new Set([
          regNo, studentData.reg, studentData.admNo, studentData.admissionNo,
          studentData.rollNo, studentData.uid, canonicalId
        ].filter(Boolean).map(k => String(k).trim().toUpperCase()));

        const normPunct = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetProgNorm = normPunct(programme);
        const targetDeptNorm = normPunct(department);
        const targetBatchNorm = normPunct(batch);

        const snapshot = await getDocs(collection(db, 'marks'));
        const found = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() || {};
          const meta = extractMarksDocMeta(docSnap);
          const studentsMap = data.students || meta.students || {};
          let studentMarks = null;
          for (const k of Object.keys(studentsMap)) {
            if (candidateKeys.has(String(k).trim().toUpperCase())) { studentMarks = studentsMap[k]; break; }
          }
          if (!studentMarks) continue;
          if (meta.programme && targetProgNorm && normPunct(meta.programme) !== targetProgNorm) continue;
          if (meta.department && targetDeptNorm && normPunct(meta.department) !== targetDeptNorm) continue;
          if (meta.batch && targetBatchNorm && normPunct(meta.batch) !== targetBatchNorm) continue;

          const examLabel = meta.examName || meta.exam || 'End Semester Exam';
          if (!isEseExam(examLabel, meta.isUniversity)) continue;

          const { total, absent } = extractStudentMarkTotal(studentMarks);
          found.push({
            docId: docSnap.id,
            subject: meta.subject || 'Subject',
            subjectCode: data.subjectCode || meta.subjectCode || meta.code || '',
            exam: examLabel,
            academicYear: meta.academicYear || '',
            semester: meta.semesterLabel || '',
            totalScored: total,
            isAbsent: absent,
          });
        }
        const seen = new Set();
        setEligibleScripts(found.filter(r => {
          const k = `${r.subject}__${r.exam}__${r.docId}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }));
      } catch (err) { console.error('Fetch photocopy scripts error:', err); }
      setLoading(false);
    };
    fetchScripts();
  }, [studentData]);

  // Real-time student applications
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'photocopy_applications'), where('studentUid', '==', currentUser.uid));
    const unsub = onSnapshot(q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const at = a.appliedAt?.toMillis ? a.appliedAt.toMillis() : new Date(a.appliedAt || 0).getTime();
          const bt = b.appliedAt?.toMillis ? b.appliedAt.toMillis() : new Date(b.appliedAt || 0).getTime();
          return bt - at;
        });
        setApplications(list);
      },
      () => {
        onSnapshot(collection(db, 'photocopy_applications'), (snap) => {
          const list = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => a.studentUid === currentUser.uid);
          setApplications(list);
        });
      }
    );
    return () => unsub();
  }, [currentUser]);

  const windowStatus = useMemo(() => {
    if (!config.isOpen) return { open: false, label: 'Applications Closed' };
    const today = new Date().toISOString().slice(0, 10);
    if (config.fromDate && today < config.fromDate)
      return { open: false, label: `Opens on ${config.fromDate}` };
    if (config.toDate && today > config.toDate)
      return { open: false, label: 'Application Window Closed' };
    if (config.fromDate || config.toDate)
      return { open: true, label: `Open till ${config.toDate || '—'}` };
    return { open: true, label: 'Applications Open' };
  }, [config.isOpen, config.fromDate, config.toDate]);

  // Subject Table Handlers (+ Add Row, Remove Row, Update Field)
  const handleAddSubjectRow = () => {
    if (subjectRows.length >= 5) {
      showToast('Maximum 5 subjects allowed per application.', 'error');
      return;
    }
    const nextSem = String(subjectRows.length + 1);
    const pricePerRow = Number(config.feePerSubject) || 400;
    setSubjectRows(prev => [
      ...prev,
      {
        id: Date.now(),
        semesterNo: nextSem,
        subjectCode: '',
        subjectTitle: '',
        grade: 'U',
        result: 'Fail',
        fee: pricePerRow
      }
    ]);
  };

  const handleRemoveSubjectRow = (index) => {
    if (subjectRows.length <= 1) return;
    setSubjectRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubjectRowChange = (index, field, value) => {
    setSubjectRows(prev => {
      const updated = [...prev];
      let val = value;
      if (field === 'subjectCode' || field === 'subjectTitle') {
        val = String(value || '').toUpperCase();
      }
      const currentRow = { ...updated[index], [field]: val };

      if (field === 'selectedScriptId') {
        const script = eligibleScripts.find(s => s.docId === value || s.subject === value);
        if (script) {
          currentRow.semesterNo = script.semester || String(index + 1);
          currentRow.subjectCode = String(script.subjectCode || '').toUpperCase();
          currentRow.subjectTitle = String(script.subject || '').toUpperCase();
          if (script.isAbsent) {
            currentRow.grade = 'AB';
            currentRow.result = 'Fail';
          }
        }
      }
      updated[index] = currentRow;
      return updated;
    });
  };

  // Dynamic Total Fee
  const totalApplicationFee = useMemo(() => {
    const pricePerRow = Number(config.feePerSubject) || 400;
    return subjectRows.length * pricePerRow;
  }, [subjectRows, config.feePerSubject]);

  // Submit photocopy application
  const handleSubmitApplication = async () => {
    if (!currentUser || !studentData) return;
    if (!windowStatus.open) {
      showToast(`Photocopy applications are currently closed (${windowStatus.label}).`, 'error');
      return;
    }

    const hasEmpty = subjectRows.some(r => !r.subjectTitle.trim() && !r.subjectCode.trim());
    if (hasEmpty) {
      showToast('Please fill in or select the subject code & title for all rows.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const regNoVal = studentData.regNo || studentData.reg || studentData.admNo || studentData.admissionNo || '';
      const pricePerRow = Number(config.feePerSubject) || 400;

      await addDoc(collection(db, 'photocopy_applications'), {
        studentUid: currentUser.uid,
        studentName: studentData.name || studentData.studentName || currentUser.email,
        regNo: regNoVal,
        email: currentUser.email || '',
        programme: studentData.programme || '',
        department: studentData.department || '',
        batch: studentData.batch || '',
        regulation: regulationName || '',
        subjects: subjectRows.map(r => ({
          semesterNo: r.semesterNo || '',
          subjectCode: r.subjectCode || '',
          subjectTitle: r.subjectTitle || '',
          grade: r.grade || 'U',
          result: r.result || 'Fail',
          fee: pricePerRow,
        })),
        subjectCount: subjectRows.length,
        feeAmount: totalApplicationFee,
        paymentStatus: 'Pending',
        status: 'Applied',
        appliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showToast(`Photocopy application submitted for ${subjectRows.length} subject(s)! Pay ₹${totalApplicationFee} at the Exam Cell counter.`, 'success');
      // Reset back to 1 row
      setSubjectRows([
        { id: Date.now(), semesterNo: '1', subjectCode: '', subjectTitle: '', grade: 'U', result: 'Fail', fee: pricePerRow }
      ]);
    } catch (err) {
      console.error('Submit application error:', err);
      showToast('Failed to submit application: ' + err.message, 'error');
    }
    setSubmitting(false);
  };

  const handleCancel = async (app) => {
    if (!window.confirm(`Cancel photocopy application?`)) return;
    setActioningId(app.id);
    try {
      await updateDoc(doc(db, 'photocopy_applications', app.id), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
      showToast('Application cancelled.', 'success');
    } catch (err) {
      console.error('Cancel photocopy error:', err);
      showToast('Failed to cancel: ' + err.message, 'error');
    }
    setActioningId(null);
  };

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-20 text-center border border-slate-100">
          <Loader2 size={48} className="mx-auto text-[#120c7a] animate-spin mb-4" />
          <p className="text-lg font-bold text-slate-400">Loading photocopy services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-xl ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page header card */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#120c7a] px-4 md:px-8 py-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Copy size={20} /> Answer Script Photocopy Application
            </h2>
            <p className="text-blue-200 text-[11px] mt-0.5">
              Exam Cell • Apply for End Semester answer script copies • ₹{config.feePerSubject || 400} per subject
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${windowStatus.open ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'}`}>
              {windowStatus.label}
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 text-white flex items-center gap-1">
              <IndianRupee size={11} />{config.feePerSubject || 400} / Subject
            </span>
          </div>
        </div>
        {(config.instructions || !windowStatus.open) && (
          <div className="px-4 md:px-8 py-3 bg-slate-50/60 border-b border-slate-100 flex items-start gap-2">
            <AlertCircle size={14} className={`shrink-0 mt-0.5 ${windowStatus.open ? 'text-blue-600' : 'text-rose-500'}`} />
            <p className="text-xs font-medium text-slate-600">
              {!windowStatus.open
                ? `Photocopy applications are currently closed (${windowStatus.label}). Please contact the Exam Cell for the schedule.`
                : config.instructions}
            </p>
          </div>
        )}
      </div>

      {/* Official Instructions & Candidate Details Form Card */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 p-6 md:p-8 space-y-6">
        {/* Instruction to Candidates */}
        <div>
          <h3 className="text-center text-lg md:text-xl font-black text-slate-900 underline uppercase tracking-wide mb-4">
            INSTRUCTION TO CANDIDATES
          </h3>
          <ol className="list-decimal list-inside space-y-2.5 text-xs md:text-sm font-semibold text-slate-700 leading-relaxed bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80">
            <li>
              Fee for Photocopy is <span className="font-bold text-[#120c7a]">Rs.{config.feePerSubject || 400}/-</span> per answer script and should be paid at the College only.
            </li>
            <li>
              Application for Photocopy must be submitted to the Principal of the concerned College on or before <span className="font-bold text-slate-900">{formatDisplayDate(config.toDate)}</span>.
            </li>
            <li>
              There is no provision for applying photocopy of Practical/Project examination Papers.
            </li>
            <li>
              Incomplete/defective application will be rejected and the fee will neither be refunded nor adjusted towards any fee due to the College.
            </li>
            <li>
              No application will be accepted beyond the due date prescribed.
            </li>
          </ol>
        </div>

        {/* Auto-fetched Candidate Details Form Table */}
        <div className="border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Candidate Details (Auto-Fetched)</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">Verified Profile</span>
          </div>
          <table className="w-full text-xs md:text-sm border-collapse">
            <tbody className="divide-y divide-slate-300">
              <tr className="hover:bg-slate-50/50">
                <td className="w-12 px-4 py-3 font-bold text-slate-500 border-r border-slate-300 text-center">1.</td>
                <td className="w-56 px-4 py-3 font-bold text-slate-800 border-r border-slate-300">Name</td>
                <td className="px-4 py-3 font-extrabold text-[#120c7a]">
                  {studentData?.name || studentData?.studentName || currentUser?.displayName || 'Loading...'}
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="w-12 px-4 py-3 font-bold text-slate-500 border-r border-slate-300 text-center">2.</td>
                <td className="w-56 px-4 py-3 font-bold text-slate-800 border-r border-slate-300">Register Number</td>
                <td className="px-4 py-3 font-extrabold text-slate-900 font-mono">
                  {studentData?.regNo || studentData?.reg || studentData?.admNo || studentData?.rollNo || 'Loading...'}
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="w-12 px-4 py-3 font-bold text-slate-500 border-r border-slate-300 text-center">3.</td>
                <td className="w-56 px-4 py-3 font-bold text-slate-800 border-r border-slate-300">Department</td>
                <td className="px-4 py-3 font-extrabold text-slate-800">
                  {formatDepartment(studentData?.department, studentData?.programme)}
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="w-12 px-4 py-3 font-bold text-slate-500 border-r border-slate-300 text-center">4.</td>
                <td className="w-56 px-4 py-3 font-bold text-slate-800 border-r border-slate-300">Month & Year of Examination</td>
                <td className="px-4 py-3 font-bold text-slate-900">
                  APR/MAY 2026
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Eligible Answer Scripts & Dynamic Application Table */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
        <div className="bg-[#120c7a] px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Copy size={20} /> Eligible Answer Scripts & Subject Details
            </h2>
            <p className="text-blue-200 text-[11px] mt-0.5">
              Add up to 5 subjects for photocopy {regulationName ? `(Regulation: ${regulationName})` : ''}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 text-white">
            ₹{config.feePerSubject || 400} / Subject
          </span>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          <div className="overflow-x-auto border border-slate-300 rounded-2xl shadow-sm">
            <table className="w-full text-xs md:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white font-black text-center text-xs uppercase tracking-wider">
                  <th className="px-3 py-3 w-28 border-r border-slate-700">Semester No.</th>
                  <th className="px-3 py-3 w-40 border-r border-slate-700">Subject Code</th>
                  <th className="px-3 py-3 border-r border-slate-700 text-left">Subject Title</th>
                  <th className="px-3 py-3 w-36 border-r border-slate-700">Grade</th>
                  <th className="px-3 py-3 w-36 border-r border-slate-700">Result</th>
                  <th className="px-3 py-3 w-28 border-r border-slate-700">Price (₹)</th>
                  <th className="px-3 py-3 w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {subjectRows.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-slate-50 transition-colors">
                    {/* Semester No */}
                    <td className="px-3 py-2.5 text-center font-bold border-r border-slate-200">
                      <div className="flex items-center gap-1 justify-center">
                        <span className="font-bold text-slate-500">{idx + 1}.</span>
                        <input
                          type="text"
                          value={row.semesterNo}
                          onChange={(e) => handleSubjectRowChange(idx, 'semesterNo', e.target.value)}
                          placeholder="Sem"
                          className="w-12 text-center bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </td>

                    {/* Subject Code */}
                    <td className="px-3 py-2.5 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.subjectCode}
                        onChange={(e) => handleSubjectRowChange(idx, 'subjectCode', e.target.value)}
                        placeholder="e.g. GE3751"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                      />
                    </td>

                    {/* Subject Title */}
                    <td className="px-3 py-2.5 border-r border-slate-200">
                      {eligibleScripts.length > 0 ? (
                        <div className="space-y-1">
                          <select
                            onChange={(e) => handleSubjectRowChange(idx, 'selectedScriptId', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none mb-1"
                          >
                            <option value="">-- Choose Published Script or Type Below --</option>
                            {eligibleScripts.map((s, i) => (
                              <option key={i} value={s.docId}>
                                {s.subjectCode ? `[${s.subjectCode}] ` : ''}{s.subject} ({s.exam})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={row.subjectTitle}
                            onChange={(e) => handleSubjectRowChange(idx, 'subjectTitle', e.target.value.toUpperCase())}
                            placeholder="Or type custom subject title..."
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={row.subjectTitle}
                          onChange={(e) => handleSubjectRowChange(idx, 'subjectTitle', e.target.value.toUpperCase())}
                          placeholder="Enter Subject Title..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                        />
                      )}
                    </td>

                    {/* Grade (Regulation Matched Dropdown) */}
                    <td className="px-3 py-2.5 border-r border-slate-200 text-center">
                      <select
                        value={row.grade}
                        onChange={(e) => handleSubjectRowChange(idx, 'grade', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-extrabold text-[#120c7a] focus:ring-2 focus:ring-blue-500 outline-none text-center cursor-pointer"
                      >
                        {regulationGrades.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Result (Pass / Fail Dropdown) */}
                    <td className="px-3 py-2.5 border-r border-slate-200 text-center">
                      <select
                        value={row.result}
                        onChange={(e) => handleSubjectRowChange(idx, 'result', e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1.5 text-xs font-black text-center outline-none cursor-pointer ${
                          row.result === 'Pass'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-rose-50 text-rose-700 border-rose-300'
                        }`}
                      >
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                      </select>
                    </td>

                    {/* Price / Fee */}
                    <td className="px-3 py-2.5 text-center font-extrabold text-slate-900 border-r border-slate-200">
                      ₹{config.feePerSubject || 400}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2.5 text-center">
                      {subjectRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSubjectRow(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove subject row"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer controls: Add Row, Total Fee summary, Submit button */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddSubjectRow}
                disabled={subjectRows.length >= 5}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] hover:opacity-90 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                <Plus size={15} /> Add Row ({subjectRows.length}/5)
              </button>
              {subjectRows.length >= 5 && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  Maximum 5 rows reached
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-slate-100 border border-slate-300 px-4 py-2 rounded-xl flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 uppercase">Total Fee:</span>
                <span className="text-base font-black text-[#120c7a]">₹{totalApplicationFee}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitApplication}
                disabled={submitting || !windowStatus.open}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Submit Application
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* My applications */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#120c7a] px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-white font-bold text-lg">My Applications</h2>
            <p className="text-blue-200 text-[11px] mt-0.5">Track photocopy status from the Exam Cell</p>
          </div>
        </div>
        {applications.length === 0 ? (
          <p className="text-sm font-bold text-slate-400 text-center p-8">No photocopy applications submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 md:px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject(s)</th>
                  <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Fee</th>
                  <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment</th>
                  <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 md:px-6 py-3">
                      {Array.isArray(a.subjects) && a.subjects.length > 0 ? (
                        <div className="space-y-1">
                          {a.subjects.map((sub, idx) => (
                            <div key={idx} className="text-xs font-bold text-slate-700">
                              <span className="text-slate-400 mr-1">Sem {sub.semesterNo || (idx + 1)}:</span>
                              {sub.subjectCode ? <span className="font-mono text-slate-900 mr-1.5">[{sub.subjectCode}]</span> : null}
                              <span>{sub.subjectTitle}</span>
                              <span className="ml-2 text-[11px] font-black text-[#120c7a] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                Grade: {sub.grade || '—'}
                              </span>
                              <span className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded border ${sub.result === 'Pass' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                {sub.result || 'Fail'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-slate-700">{a.subject}</span>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-center"><span className="text-sm font-bold text-slate-600">₹{a.feeAmount ?? config.feePerSubject}</span></td>
                    <td className="px-4 md:px-6 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${a.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                        {a.paymentStatus || 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${STATUS_STYLES[a.status] || STATUS_STYLES.Applied}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 text-center">
                      {a.status === 'Applied' ? (
                        <button
                          onClick={() => handleCancel(a)}
                          disabled={actioningId === a.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          {actioningId === a.id ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Cancel
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 md:px-8 py-4 text-[11px] text-slate-400 font-medium flex items-center gap-1.5 border-t border-slate-100">
          <Clock size={12} /> Pay the fee at the Exam Cell counter. The issued copy can be collected as per the status above.
        </p>
      </div>
    </div>
  );
}
