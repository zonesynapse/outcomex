import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs, query, where, documentId } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarCheck2, AlertCircle, Loader2, Check, X } from "lucide-react";
import {
  calculateStudentAttendanceOverview,
  cleanStudentId,
  extractSubjectCodeFromDocId,
  isDeptMatch,
  getAcademicYears
} from "../../lib/utils";
import {
  getCachedStudentProfile,
  setCachedStudentProfile,
  getCachedStudentIndex,
  fetchScopedAttendanceDocs,
  fetchScopedTimetableDocs,
  fetchScopedAssignmentDocs,
  fetchTargetedFacultyNames,
  getCachedSyllabus,
  getCachedRegulation
} from "../../lib/studentSession";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getPercentColor = (p) => {
  if (p >= 85) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (p >= 75) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-red-600 bg-red-50 border-red-200";
};

const getPercentBarColor = (p) => {
  if (p >= 85) return "bg-emerald-500";
  if (p >= 75) return "bg-yellow-500";
  return "bg-red-500";
};

export default function Attendance() {
  const [studentData, setStudentData] = useState(() => getCachedStudentProfile());
  const [loading, setLoading] = useState(true);
  const [subjectWise, setSubjectWise] = useState([]);
  const [dateWiseRows, setDateWiseRows] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [overallPercentage, setOverallPercentage] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalPresent, setTotalPresent] = useState(0);
  const [totalOd, setTotalOd] = useState(0);

  useEffect(() => {
    const cached = getCachedStudentProfile();
    if (cached) {
      setStudentData(cached);
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const uData = snap.data();
          setStudentData(uData);
          setCachedStudentProfile(user.uid, uData);
        }
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const { regNo, programme, department, batch } = studentData;
    if (!regNo || !programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchAttendance = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);

        const batchPrefix = `${progKey}_${deptKey}_${batchKey}`;

        // 1. Resolve student's section from student_index with session caching
        let studentSection = studentData.section || studentData.sec || '';
        let canonicalId = null;
        if (regNo || studentData.reg) {
          try {
            const idxData = await getCachedStudentIndex(db, regNo || studentData.reg);
            if (idxData) {
              canonicalId = idxData.canonicalId || idxData.admissionNo || null;
              if (idxData.studentDocId) {
                const secMatch = idxData.studentDocId.match(/_(Sec-[A-Za-z0-9]+)/i);
                if (secMatch) studentSection = secMatch[1];
              }
            }
          } catch {
            // ignore
          }
        }

        // 2. High-performance Scoped Queries (Fetches ONLY this student's department batch docs)
        const [allAttSnap, regulation, assignSnap, studentsSnap, timetableSnap] = await Promise.all([
          fetchScopedAttendanceDocs(db, { progKey, deptKey, batchKey }),
          getCachedRegulation(db, progKey, batch),
          fetchScopedAssignmentDocs(db, { progKey, deptKey, batchKey }),
          getDoc(doc(db, "students", `${batchKey}_${progKey}_${deptKey}`)).catch(() => null),
          fetchScopedTimetableDocs(db, { progKey, deptKey, batchKey }),
        ]);

        const joiningDate = studentData.joiningDate ||
          studentData._joiningDate ||
          studentsSnap?.data()?._joiningDate?.[regNo] ||
          (studentData.admissionNo ? studentsSnap?.data()?._joiningDate?.[studentData.admissionNo] : '') ||
          '';

        let subjectNames = {};
        if (regulation) {
          const syllabus = await getCachedSyllabus(db, progKey, deptKey, regulation);
          if (syllabus) {
            Object.values(syllabus.semesters || {}).forEach(semList => {
              if (Array.isArray(semList)) semList.forEach(s => { if (s?.code) subjectNames[s.code] = s.name; });
            });
          }
        }

        const studentIds = [regNo, studentData.admissionNo, studentData.admNo, studentData.id, studentData.reg, canonicalId]
          .filter(Boolean)
          .map(x => String(x).trim());

        // Extract student aliases from students document so admissionNo/rollNo from earlier months match
        if (studentsSnap?.exists()) {
          const sData = studentsSnap.data();
          const targetClean = cleanStudentId(regNo || canonicalId || studentData.admissionNo);
          Object.entries(sData).forEach(([k, v]) => {
            if (k.startsWith('_') || !v) return;
            const kClean = cleanStudentId(k);
            let vObj = typeof v === 'object' ? v : {};
            const vReg = cleanStudentId(vObj.regNo || vObj.reg || vObj.registerNo);
            const vAdm = cleanStudentId(vObj.admissionNo || vObj.admNo);
            if (kClean === targetClean || vReg === targetClean || vAdm === targetClean) {
              if (k) studentIds.push(String(k).trim());
              if (vObj.regNo) studentIds.push(String(vObj.regNo).trim());
              if (vObj.admissionNo) studentIds.push(String(vObj.admissionNo).trim());
              if (vObj.admNo) studentIds.push(String(vObj.admNo).trim());
              if (vObj.rollNo) studentIds.push(String(vObj.rollNo).trim());
            }
          });
        }

        // Filter attendance docs for this student's batch and department
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const batchNorm = norm(batch);
        const batchYearMatch = String(batch).match(/\d{4}\s*[-_]\s*\d{2,4}/);
        const bYear = batchYearMatch ? norm(batchYearMatch[0]) : '';
        const bStartYear = String(batch).match(/\b(20\d{2})\b/)?.[1] || '';
        const matchedAttDocs = allAttSnap.docs.filter(docSnap => {
          const id = docSnap.id;
          const idNorm = norm(id);
          const hasBatch = idNorm.includes(batchNorm) || (bYear && idNorm.includes(bYear)) || (bStartYear && idNorm.includes(bStartYear));
          if (!hasBatch) return false;

          const dData = docSnap.data();
          const docDept = dData._meta?.department || dData.department || '';
          const hasDept = !department ||
            (batchPrefix && id.startsWith(batchPrefix)) ||
            isDeptMatch(id, department) ||
            (docDept && isDeptMatch(docDept, department));

          return hasDept;
        });

        // Determine student's active semester and academic year
        let activeSem = String(studentData.semester || studentData.sem || studentData.currentSemester || '').match(/\d+/)?.[0] || '';
        let activeAy = '';

        if (!activeSem && batch) {
          const years = getAcademicYears(batch);
          if (years.length > 0) {
            const currentYear = new Date().getFullYear();
            const month = new Date().getMonth();
            const isOddSem = month >= 6;
            const foundAy = years.find((y) => {
              const [start] = y.split('-').map(Number);
              if (isOddSem) return start === currentYear;
              return start + 1 === currentYear;
            }) || years[years.length - 1];
            if (foundAy) {
              activeAy = foundAy;
              const ayIndex = years.indexOf(foundAy);
              if (ayIndex >= 0) {
                activeSem = String(ayIndex * 2 + (isOddSem ? 1 : 2));
              }
            }
          }
        }

        // Cross-check active semester from actual attendance documents
        let maxAttSem = 0;
        let detectedAttAy = '';
        matchedAttDocs.forEach(d => {
          const parts = d.id.split('_');
          const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
          if (batchIdx >= 0 && batchIdx + 2 < parts.length) {
            const ay = parts[batchIdx + 1];
            const sem = String(parts[batchIdx + 2]).match(/\d+/)?.[0];
            if (sem) {
              const sNum = parseInt(sem, 10);
              if (sNum > maxAttSem) {
                maxAttSem = sNum;
                detectedAttAy = ay;
              }
            }
          }
        });
        if (maxAttSem > 0) {
          activeSem = String(maxAttSem);
          if (detectedAttAy) activeAy = detectedAttAy;
        }

        const batchStartYear = String(batch || '').match(/(19|20)\d{2}/)?.[0] || '';
        const batchNormStr = String(batch || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sectionNorm = (studentSection || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const facultyUidMap = {};
        const timetableFacultyMap = {};

        // 1. Direct Timetable Allocations: Extract faculty assigned in Timetable Creation
        if (timetableSnap && timetableSnap.forEach) {
          timetableSnap.forEach(d => {
            const dId = d.id;
            const matchDept = isDeptMatch(dId, department) || (d.data()?.department && isDeptMatch(d.data().department, department));
            const matchBatch = dId.includes(batchKey) || dId.includes(sanitizeKey(batch)) || (batchStartYear && dId.includes(batchStartYear));
            if (!matchDept || !matchBatch) return;

            const idNoSec = dId.replace(/_(sec|section)[-_]?[a-z0-9]*$/i, '');
            const parts = idNoSec.split('_');
            const dSem = parts.length > 0 ? (String(parts[parts.length - 1]).match(/\d+/)?.[0] || '') : '';
            if (activeSem && dSem && dSem !== String(activeSem)) return;

            const dData = d.data() || {};
            // If allocatedSubjects array was stored by TimetableCreation
            if (Array.isArray(dData.allocatedSubjects)) {
              dData.allocatedSubjects.forEach(s => {
                if (s?.code) {
                  if (s.facultyName && s.facultyName !== '—') {
                    timetableFacultyMap[s.code] = s.facultyName;
                  }
                  if (s.facultyUid) {
                    facultyUidMap[s.code] = s.facultyUid;
                  }
                }
              });
            }
            // Template subjects
            if (Array.isArray(dData.subjects)) {
              dData.subjects.forEach(s => {
                const code = s.code || s.acronym || '';
                const fName = s.faculty || s.facultyName || '';
                if (code && fName && fName !== '—' && !timetableFacultyMap[code]) {
                  timetableFacultyMap[code] = fName;
                }
              });
            }
          });
        }

        // 2. Filter subject_assignments specifically for THIS student's Department, Batch, and Section
        const candidateAssignDocs = [];
        assignSnap.forEach(d => {
          const dId = d.id;
          const dData = d.data() || {};
          const dDept = dData.department || dData._meta?.department || '';

          // 1. Batch check
          const matchBatch = dId.includes(batchKey) || 
            dId.includes(sanitizeKey(batch)) || 
            (batchStartYear && dId.includes(batchStartYear)) ||
            (batchNormStr && dId.toLowerCase().replace(/[^a-z0-9]/g, '').includes(batchNormStr));
          if (!matchBatch) return;

          // 2. Department check: MUST match student's department!
          // 2. Department check: MUST match student's department!
          // NEVER allow an assignment doc from another department (e.g. EEE or CSE) to match an ECE student!
          if (dDept && !isDeptMatch(dDept, department)) return;
          if (!isDeptMatch(dId, department)) return;

          // Extract doc semester and academic year
          const idNoSec = dId.replace(/_(sec|section)[-_]?[a-z0-9]*$/i, '');
          const parts = idNoSec.split('_');
          const docSem = parts.length > 0 ? (String(parts[parts.length - 1]).match(/\d+/)?.[0] || '') : '';
          const docAy = parts.length > 1 ? (String(parts[parts.length - 2]).match(/\d{4}[-_]\d{2,4}/)?.[0] || '') : '';

          let score = 0;

          // Exact department score boost:
          const normDoc = norm(dId);
          const normTarget = norm(department);
          if (normDoc.includes(normTarget) || normTarget.includes(normDoc)) {
            score += 200;
          }

          // 3. Strict Semester scoring (Crucial: prevents older semesters like Sem 1-4 from overwriting Sem 7)
          if (activeSem && docSem) {
            if (docSem === activeSem) {
              score += 150;
            } else {
              score -= 100;
            }
          } else if (docSem) {
            score += (parseInt(docSem, 10) || 1) * 15;
          }

          // 4. Academic year scoring
          if (activeAy && docAy) {
            if (docAy.includes(activeAy) || activeAy.includes(docAy)) {
              score += 50;
            } else {
              score -= 20;
            }
          }

          // 5. Section scoring:
          // +50 if it specifically matches student's section (e.g. Sec-A)
          // +20 if it is a general unsectioned doc
          // -30 if it is for a different section
          const docHasSec = /_(sec|section)[-_]?[a-z0-9]+/i.test(dId);
          if (sectionNorm && docHasSec) {
            const secMatch = dId.match(/_(sec|section)[-_]?([a-z0-9]+)/i);
            const docSec = secMatch ? secMatch[2].toLowerCase() : '';
            if (docSec === sectionNorm || sectionNorm.includes(docSec) || docSec.includes(sectionNorm)) {
              score += 50;
            } else {
              score -= 30;
            }
          } else if (!docHasSec) {
            score += 20;
          }

          if (progKey && dId.startsWith(progKey)) {
            score += 10;
          }

          candidateAssignDocs.push({ id: dId, data: dData, score });
        });

        // Sort candidate docs so the active semester and section matching doc is processed first
        candidateAssignDocs.sort((a, b) => b.score - a.score);

        if (candidateAssignDocs.length > 0) {
          candidateAssignDocs.forEach(({ data }) => {
            Object.entries(data).forEach(([uid, codes]) => {
              if (uid.startsWith('_') || !Array.isArray(codes)) return;
              codes.forEach(code => {
                if (code && !facultyUidMap[code]) {
                  facultyUidMap[code] = uid;
                }
              });
            });
          });
        } else {
          // Fail-safe fallback within same batch if department format differs
          assignSnap.forEach(d => {
            const dId = d.id;
            const matchBatch = dId.includes(batchKey) || dId.includes(sanitizeKey(batch));
            if (!matchBatch) return;
            const data = d.data();
            Object.entries(data).forEach(([uid, codes]) => {
              if (uid.startsWith('_') || !Array.isArray(codes)) return;
              codes.forEach(code => { if (!facultyUidMap[code]) facultyUidMap[code] = uid; });
            });
          });
        }

        const facultyUidsToFetch = Object.values(facultyUidMap).filter(Boolean);
        const facultyNames = await fetchTargetedFacultyNames(db, facultyUidsToFetch);

        // Pre-fetch course enrolment documents to verify elective enrollments accurately
        const uniqueEnrolKeys = new Set();
        matchedAttDocs.forEach((docSnap) => {
          const id = docSnap.id;
          const subjectCode = extractSubjectCodeFromDocId(id);
          const parts = id.split('_');
          const batchIdx = parts.findIndex(p => /^\d{4}-\d{4}$/.test(p));
          if (batchIdx < 0 || batchIdx + 2 >= parts.length) return;
          const bKey = parts[batchIdx];
          const ayKey = parts[batchIdx + 1];
          const semNum = parts[batchIdx + 2];
          const enrolKey = `${progKey}_${deptKey}_${sanitizeKey(bKey)}_${sanitizeKey(ayKey)}_${semNum}_${sanitizeKey(subjectCode)}`;
          uniqueEnrolKeys.add(enrolKey);
        });

        const enrolMap = {};
        await Promise.all([...uniqueEnrolKeys].map(async (ek) => {
          try {
            const eSnap = await getDoc(doc(db, 'course_enrolments', ek));
            if (eSnap.exists()) {
              const eData = eSnap.data();
              enrolMap[ek] = new Set(Object.keys(eData).filter(k => eData[k]).map(cleanStudentId));
            }
          } catch {
            // enrollment doc may not exist
          }
        }));

        const overview = calculateStudentAttendanceOverview({
          attDocs: matchedAttDocs,
          enrolMap,
          studentIds,
          studentSection,
          joiningDate,
          facultyUidMap,
          facultyNames,
          timetableFacultyMap,
          subjectNames,
          maxPeriodsPerDay: 8
        });

        setSubjectWise(overview.subjects);
        setDateWiseRows(overview.dateWiseRows);
        setTotalClasses(overview.totalClasses);
        setTotalPresent(overview.totalPresent);
        setTotalOd(overview.totalOd);
        setOverallPercentage(overview.overallPercentage);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [studentData]);

  const dates = [...new Set(dateWiseRows.map(r => r.date))].sort((a, b) => b.localeCompare(a));

  const getDateStats = (date) => {
    const rows = dateWiseRows.filter(r => r.date === date);
    const validRows = rows.filter(r => r.status !== '-');
    const present = validRows.filter(r => r.present).length;
    const od = validRows.filter(r => r.status === 'OD').length;
    const nonOd = Math.max(0, validRows.length - od);
    return {
      total: Math.min(validRows.length, 8),
      present: Math.min(present, 8),
      od,
      nonOd: Math.min(nonOd, 8),
      pct: nonOd > 0 ? (present / nonOd) * 100 : (od > 0 ? 100 : 0)
    };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin text-[#120c7a]" size={42} />
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading attendance records...</p>
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 w-full space-y-8 font-sans">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Subjects</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{subjectWise.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Overall Attendance</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">
            {subjectWise.length > 0 ? overallPercentage.toFixed(2) : 'N/A'}%
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Classes</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{totalClasses}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Attended</p>
          <p className="text-3xl font-black text-emerald-600 mt-2">{totalPresent}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">OD</p>
          <p className="text-3xl font-black text-blue-600 mt-2">{totalOd || 0}</p>
        </div>
      </div>

      {/* Subject-wise Summary */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#120c7a] px-4 md:px-8 py-5">
          <h2 className="text-white font-bold text-xl">Subject-wise Attendance</h2>
        </div>
        {subjectWise.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <CalendarCheck2 size={48} className="text-slate-200" />
            <p className="text-slate-400 font-medium italic">No attendance records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 md:px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                  <th className="px-4 md:px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Faculty</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-blue-500 uppercase tracking-widest">OD</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">%</th>
                  <th className="px-4 md:px-8 py-4 text-center text-[11px] font-black text-blue-400 uppercase tracking-widest">OD%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectWise.map((rec, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 md:px-8 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700 font-mono">{rec.subjectCode}</span>
                        {rec.subjectName && <span className="text-[11px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]" title={rec.subjectName}>{rec.subjectName}</span>}
                      </div>
                    </td>
                    <td className="px-4 md:px-8 py-4">
                      <span className="text-xs font-semibold text-slate-500">{rec.facultyName || '—'}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.totalClasses}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-slate-600">{rec.attended}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-blue-600">{rec.odCount}</span>
                    </td>
                    <td className="px-4 md:px-8 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                          <div
                            className={`h-full transition-all duration-1000 ${getPercentBarColor(rec.percentage)}`}
                            style={{ width: `${Math.min(rec.percentage, 100)}%` }}
                          />
                        </div>
                        <span className={`text-sm font-black min-w-[60px] px-3 py-1 rounded-full border ${getPercentColor(rec.percentage)}`}>
                          {rec.percentage.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 md:px-8 py-4 text-center">
                      <span className="text-sm font-bold text-blue-500">{rec.odPercentage.toFixed(2)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Date-wise Attendance */}
      {dateWiseRows.length > 0 && (
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-4 md:px-8 py-5">
            <h2 className="text-white font-bold text-xl">Date-wise Attendance</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {dates.map((date) => {
              const stats = getDateStats(date);
              const isExpanded = expandedDate === date;
              const dayRows = dateWiseRows.filter(r => r.date === date);
              return (
                <div key={date}>
                  <button
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                    className="w-full flex items-center justify-between px-4 md:px-8 py-4 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2 md:gap-4">
                      <span className="text-sm font-bold text-slate-700">{formatDate(date)}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getPercentColor(stats.pct)}`}>
                        {stats.present}/{stats.nonOd} periods &middot; {stats.pct.toFixed(0)}%
                      </span>
                      {stats.od > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50">
                          {stats.od} OD
                        </span>
                      )}
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-4 md:px-8 pb-4">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50/80">
                              <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                              <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Faculty</th>
                              <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Period</th>
                              <th className="px-4 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dayRows.map((row, i) => (
                              <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-4 py-2">
                                  <div className="flex flex-col">
                                    {row.isEvent ? (
                                      <>
                                        <span className="text-sm font-bold text-slate-700 font-mono">-</span>
                                        <span className="text-[10px] text-amber-600 font-medium truncate max-w-[180px]">{row.subjectName || 'Event'}</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm font-bold text-slate-700 font-mono">{row.subject}</span>
                                        {row.subjectName && <span className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">{row.subjectName}</span>}
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="text-xs font-semibold text-slate-500">{row.facultyName || '—'}</span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className="text-sm font-bold text-slate-600">P{row.period}</span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {row.status === 'OD' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                                      <CalendarCheck2 size={12} /> OD
                                    </span>
                                  ) : row.status === '-' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                                      —
                                    </span>
                                  ) : row.present ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                                      <Check size={12} /> Present
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                                      <X size={12} /> Absent
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
