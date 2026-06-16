import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { db } from "../firebase"; // Import db for Firestore
import { doc, collection, setDoc, onSnapshot, getDoc, getDocs } from "firebase/firestore"; // Firestore imports
import { sanitizeKey, formatProgDisplay } from "../lib/utils";
import { ChevronDown, Trash2 } from "lucide-react";

export default function CreateCourse() {
  const { departments: allDepartments, durations, loading: dLoading } = useDepartments();
  const { regulations, loading: rLoading } = useRegulations();

  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [regulation, setRegulation] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [credits, setCredits] = useState(3);
  const [periods, setPeriods] = useState({ l: 0, t: 0, p: 0 });
  const [courseType, setCourseType] = useState("Program Course");
  const [numCOs, setNumCOs] = useState(0);
  const [coDefs, setCoDefs] = useState([]);
  const [coContents, setCoContents] = useState([]);
  const [coDomains, setCoDomains] = useState([]);
  const [coLevels, setCoLevels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [bloomsDomains, setBloomsDomains] = useState({});
  const [existingCourses, setExistingCourses] = useState([]); // merged list for dropdown
  const [selectedExistingCourseKey, setSelectedExistingCourseKey] = useState("");
  const [availableCourseTypes, setAvailableCourseTypes] = useState(["Program Course"]);

  const deptKey = department || "Overall";
  const regKey = useMemo(() => sanitizeKey(regulation), [regulation]);

  const [periodConfigs, setPeriodConfigs] = useState({});
  useEffect(() => {
    const pRef = collection(db, 'period_configs'); // Firestore collection reference
    const unsub = onSnapshot(pRef, (snap) => { // Use onSnapshot for real-time updates
      const data = {}; // Convert QuerySnapshot to object
      snap.forEach(d => { data[d.id] = d.data(); });
      setPeriodConfigs(data);
    });
    return () => unsub();
  }, []);

  const currentPeriodConfig = useMemo(() => {
    const key = sanitizeKey(regulation);
    return periodConfigs[key] || {
      lecture: { allocate: 1, credit: 1, periods: 15 },
      tutor: { allocate: 1, credit: 1, periods: 15 },
      practical: { allocate: 1, credit: 0.5, periods: 15 }
    };
  }, [periodConfigs, regulation]);

  const calculatedTotalPeriods = useMemo(() => {
    const getP = (v, type) => {
      const cfg = currentPeriodConfig[type];
      return cfg?.allocate ? (Number(v) / cfg.allocate) * (Number(cfg.periods) || 0) : 0;
    };
    return getP(periods.l, 'lecture') + getP(periods.t, 'tutor') + getP(periods.p, 'practical');
  }, [periods, currentPeriodConfig]);

  // Auto-calculate credits
  useEffect(() => {
    if (!regulation || !showCreate) return;
    const getC = (v, type) => {
      const cfg = currentPeriodConfig[type];
      return cfg?.allocate ? (Number(v) / cfg.allocate) * (Number(cfg.credit) || 0) : 0;
    };
    const total = getC(periods.l, 'lecture') + getC(periods.t, 'tutor') + getC(periods.p, 'practical');
    setCredits(total);
  }, [periods, currentPeriodConfig, regulation, showCreate]);

  // Fetch course types based on regulation
  useEffect(() => {
    if (!regKey) {
      setAvailableCourseTypes(["Program Course"]);
      return;
    }
    const typesRef = doc(db, 'course_type_configs', regKey);
    const unsub = onSnapshot(typesRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const types = data?.list || data?.types || Object.values(data).filter(v => typeof v === 'string');
        setAvailableCourseTypes(types.length > 0 ? types : ["Program Course"]);
      } else {
        setAvailableCourseTypes(["Program Course"]);
      }
    });
    return () => unsub();
  }, [regKey]);

  useEffect(() => {
    if (availableCourseTypes.length > 0 && !availableCourseTypes.includes(courseType)) {
      setCourseType(availableCourseTypes[0]);
    }
  }, [availableCourseTypes]);

  // subscribe to Bloom's taxonomy from RTDB
  useEffect(() => {
    const bloomsRef = collection(db, 'blooms_taxonomy'); // Firestore collection reference
    const unsub = onSnapshot(bloomsRef, (snap) => {
      if (!snap.empty) {
        const data = {}; snap.forEach(d => { data[d.id] = d.data(); }); setBloomsDomains(data);
      } else {
        setBloomsDomains({});
      }
    });
    return () => unsub();
  }, []);

  const handleCoChange = (index, value) => {
    setCoDefs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCoContentChange = (index, value) => {
    setCoContents((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCoDomainChange = (index, value) => {
    setCoDomains((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCoLevelChange = (index, value) => {
    setCoLevels((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addCO = () => {
    setCoDefs(prev => [...prev, ""]);
    setCoContents(prev => [...prev, ""]);
    setCoDomains(prev => [...prev, ""]);
    setCoLevels(prev => [...prev, ""]);
  };

  const removeCO = (index) => {
    setCoDefs(prev => prev.filter((_, i) => i !== index));
    setCoContents(prev => prev.filter((_, i) => i !== index));
    setCoDomains(prev => prev.filter((_, i) => i !== index));
    setCoLevels(prev => prev.filter((_, i) => i !== index));
  };

  const getLevelsForDomain = (domainName) => {
    if (!domainName) return [];
    const domain = Object.values(bloomsDomains).find(d => d.name === domainName);
    if (!domain || !Array.isArray(domain.levels)) return [];
    return domain.levels;
  };

  const handleSave = async () => {
    if (!programme || !regulation || !courseCode.trim() || !courseName.trim()) {
      setMessage("Please fill Programme, Regulation, Course code and Course name.");
      return;
    }
    setSaving(true);
    try {
      const progKey = sanitizeKey(programme);
      const sanitizedDept = sanitizeKey(deptKey);
      const courseKey = `${progKey}_${sanitizedDept}_${sanitizeKey(courseCode.trim())}`;
      const payload = {
        code: courseCode.trim(),
        name: courseName.trim(),
        credits: Number(credits) || 0,
        periods: {
          l: Number(periods.l) || 0,
          t: Number(periods.t) || 0,
          p: Number(periods.p) || 0
        },
        type: courseType,
        regulation,
        programme: progKey,
        department: deptKey,
        co: coDefs.map((c, i) => ({ id: `CO${i + 1}`, description: c || "", content: (coContents[i] || ""), domain: (coDomains[i] || ""), level: (coLevels[i] || "") }))
      };

      await setDoc(doc(db, 'courses', courseKey), payload); // Firestore subcollection path

      setMessage("Course saved successfully.");
      setSelectedExistingCourseKey(`${deptKey}:${courseKey}`);
      setShowCreate(false);
      setCourseCode("");
      setCourseName("");
      setCredits(3);
      setPeriods({ l: 0, t: 0, p: 0 });
      setNumCOs(0);
      setCoDefs([]);
      setCoContents([]);
      setCoDomains([]);
      setCoLevels([]);
    } catch (err) {
      console.error(err);
      setMessage("Error saving course.");
    }
    setSaving(false);
    setTimeout(() => setMessage(""), 4000);
  };

  // Fetch existing courses for selected Programme + Department + Regulation.
  useEffect(() => {
      console.log('[COURSES] Effect fired with:', { programme, regulation, department, progKey: sanitizeKey(programme) });
    if (!programme || !regulation) {
      setExistingCourses([]);
      setSelectedExistingCourseKey("");
      return;
    }

    const progKey = sanitizeKey(programme);
    const normalize = (v) => String(v ?? '').replace(/[.#$[\]/ ]/g, '_');

    const unsub = onSnapshot(collection(db, 'courses'), (snap) => {
      console.log('[COURSES] snapshot received, size:', snap.size);
      const data = {};
      snap.forEach(d => {
        const docData = d.data();
        console.log('[COURSES] doc.id:', d.id, '| fields:', Object.keys(docData));
        const hasDirectCourseFields = docData?.code || docData?.programme;
        if (hasDirectCourseFields) {
          data[d.id] = { ...docData, _outerKey: d.id };
        } else {
          // RTDB migration format: { department: { regulation: { courseCode: { ... } } } }
          Object.entries(docData).forEach(([deptValue, deptCourses]) => {
            if (deptCourses && typeof deptCourses === 'object') {
              Object.entries(deptCourses).forEach(([regValue, regCourses]) => {
                if (regCourses && typeof regCourses === 'object') {
                  Object.entries(regCourses).forEach(([courseCode, courseData]) => {
                    if (courseData && typeof courseData === 'object') {
                      const key = `${d.id}_${deptValue}_${regValue}_${courseCode}`;
                      data[key] = courseData;
                    }
                  });
                }
              });
            }
          });
        }
      });
      console.log('[DBG] Total flattened courses:', Object.keys(data).length, '| progKey:', progKey, '| regulation:', regulation, '| department:', department);
      if (Object.keys(data).length > 0) {
        const sample = data[Object.keys(data)[0]];
        console.log('[DBG] Sample course:', { programme: sample.programme, regulation: sample.regulation, department: sample.department, _outerKey: sample._outerKey, keys: Object.keys(sample) });
      }
      const filtered = Object.entries(data)
        .filter(([, course]) => {
          const courseProg = normalize(course?.programme || '');
          const courseReg = normalize(course?.regulation || '');
          const courseDept = normalize(course?.department || '');
          const matchProg = courseProg === progKey;
          const matchReg = courseReg === normalize(regulation);
          const normDept = normalize(department || '');
          const matchDept = department
            ? courseDept === normDept || courseDept === "Overall" || (normDept && courseDept.endsWith("_" + normDept))
            : courseDept === "Overall" || !courseDept;
          return matchProg && matchReg && matchDept;
        })
        .map(([key, course]) => ({
          key,
          code: course?.code || key,
          name: course?.name || "",
          credits: course?.credits,
          type: course?.type,
          periods: course?.periods || { l: 0, t: 0, p: 0 },
          co: Array.isArray(course?.co) ? course.co : [],
          _sourceDept: course?.department || "Overall",
        }));
      setExistingCourses(filtered);
    });

    return () => unsub();
  }, [programme, department, regulation]);

  const loadExistingCourseIntoForm = async (compositeKey) => {
    if (!compositeKey) return;
    let match = existingCourses.find(c => `${c._sourceDept}:${c.key}` === compositeKey);

    // Fallback: always fetch from Firestore to ensure CO data is fresh
    const [, docId] = compositeKey.split(':');
    if (docId) {
      try {
        const snap = await getDoc(doc(db, 'courses', docId));
        if (snap.exists()) {
          const docData = snap.data();
          const co = Array.isArray(docData.co) ? docData.co : [];
          if (co.length > 0 || !match) {
            match = {
              key: docId,
              code: docData.code || docId,
              name: docData.name || "",
              credits: docData.credits,
              type: docData.type,
              periods: docData.periods || { l: 0, t: 0, p: 0 },
              co,
              _sourceDept: docData.department || "Overall",
            };
          }
        }
      } catch (e) {
        console.error('Failed to fetch course directly:', e);
      }
    }
    if (!match) return;

    setShowCreate(true);
    setCourseCode(match.code || "");
    setCourseName(match.name || "");
    setCredits(match.credits ?? 3);
    setPeriods(match.periods || { l: 0, t: 0, p: 0 });
    setCourseType(match.type || "Program Course");

    const cos = Array.isArray(match.co) ? match.co : [];
    setCoDefs(cos.map(co => co?.description || co?.name || ""));
    setCoContents(cos.map(co => co?.content || ""));
    setCoDomains(cos.map(co => co?.domain || ""));
    setCoLevels(cos.map(co => co?.level || ""));
  };

  // Hide the form until a dropdown selection is made, and re-load when existingCourses arrives
  useEffect(() => {
    if (!selectedExistingCourseKey) {
      setShowCreate(false);
      return;
    }
    if (selectedExistingCourseKey === "__new__") return;
    loadExistingCourseIntoForm(selectedExistingCourseKey);
  }, [selectedExistingCourseKey, existingCourses]);

  // Programs are the keys defined in Curriculum (durations / departments), e.g., B_E, B_Tech
  const programmes = Object.keys(durations || allDepartments || {});

  return (
    <Layout title="Course Bank">
      <style>{`
        input[type='number']::-webkit-outer-spin-button,
        input[type='number']::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
      `}</style>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h2 className="text-white font-bold text-sm">New Course Setup</h2>
          </div>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Programme</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={programme}
                    onChange={(e) => {
                      setProgramme(e.target.value);
                      setDepartment("");
                      setSelectedExistingCourseKey("");
                    }}
                  >
                    <option value="">Select Programme</option>
                    {programmes.map((p) => (
                      <option key={p} value={p}>
                        {formatProgDisplay(p)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Department</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setSelectedExistingCourseKey("");
                    }}
                    disabled={!programme}
                  >
                    <option value="">Overall Program</option>
                    {programme && (allDepartments[programme] || []).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Regulation</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={regulation}
                    onChange={(e) => {
                      setRegulation(e.target.value);
                      setSelectedExistingCourseKey("");
                    }}
                  >
                    <option value="">Select Regulation</option>
                    {(regulations || []).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600">Existing Courses (Code - Name)</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50"
                  value={selectedExistingCourseKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedExistingCourseKey(v);
                    if (v === "__new__") {
                      setShowCreate(true);
                      setCourseCode("");
                      setCourseName("");
                      setCredits(3);
                      setCourseType("Program Course");
                      setNumCOs(0);
                      setCoDefs([]);
                      setCoContents([]);
                      setCoDomains([]);
                      setCoLevels([]);
                      return;
                    }
                    if (v) loadExistingCourseIntoForm(v);
                  }}
                  disabled={!programme || !regulation}
                >
                  <option value="">Select Course</option>
                  <option value="__new__" className="text-blue-600 font-bold" style={{ color: '#2563eb', fontWeight: 'bold' }}>+ New Course</option>
                  {existingCourses.map((c) => (
                    <option
                      key={`${c._sourceDept}:${c.key}`}
                      value={`${c._sourceDept}:${c.key}`}
                      title={`${c.code} - ${c.name}`}
                    >
                      {c.code}
                      {c.name ? ` - ${c.name}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
              {programme && regulation && existingCourses.length === 0 && (
                <div className="text-xs text-zinc-500">No courses found for {deptKey} / {regulation}.</div>
              )}
            </div>

          {showCreate && selectedExistingCourseKey && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-600">Course Code</label>
                  <input
                    className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="e.g., CS301"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-bold text-zinc-600">Course Name</label>
                  <input
                    className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Enter course name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-600">Course Type</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                      value={courseType}
                      onChange={(e) => setCourseType(e.target.value)}
                    >
                      {availableCourseTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-600">Number of Periods (L-T-P)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="relative">
                      <input type="number" className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-2 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold text-center text-[#120c7a]" value={periods.l} onChange={(e) => setPeriods({ ...periods, l: e.target.value })} placeholder="L" />
                      <span className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-zinc-400 uppercase tracking-tighter">L</span>
                    </div>
                    <div className="relative">
                      <input type="number" className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-2 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold text-center text-[#120c7a]" value={periods.t} onChange={(e) => setPeriods({ ...periods, t: e.target.value })} placeholder="T" />
                      <span className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-zinc-400 uppercase tracking-tighter">T</span>
                    </div>
                    <div className="relative">
                      <input type="number" className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-2 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold text-center text-[#120c7a]" value={periods.p} onChange={(e) => setPeriods({ ...periods, p: e.target.value })} placeholder="P" />
                      <span className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-zinc-400 uppercase tracking-tighter">P</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-600">Total Periods</label>
                    <input
                      type="number"
                      readOnly
                      className="w-full bg-blue-50/50 border border-zinc-200 rounded-lg px-4 py-2.5 outline-none font-black text-[#120c7a] cursor-not-allowed"
                      value={calculatedTotalPeriods}
                      placeholder="Total"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-600">Credits</label>
                    <input
                      type="number"
                      readOnly
                      className="w-full bg-blue-50/50 border border-zinc-200 rounded-lg px-4 py-2.5 outline-none font-black text-[#120c7a] cursor-not-allowed"
                      value={credits}
                      min={0}
                    />
                  </div>
                </div>
              </div>

              {coDefs.length > 0 && (
                <div className="pt-3">
                  <h3 className="text-sm font-bold text-zinc-700 mb-2">CO Definitions & Content</h3>
                  <div className="space-y-4">
                    {coDefs.map((c, i) => (
                      <div key={i} className="bg-zinc-50 p-5 rounded-xl border border-zinc-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 flex items-center justify-center bg-[#120c7a] text-white rounded-lg font-bold text-xs shadow-sm">CO{i + 1}</span>
                            <h4 className="text-sm font-bold text-zinc-700">Course Outcome</h4>
                          </div>
                          <div>
                            <button
                              type="button"
                              title="Remove CO"
                              onClick={() => removeCO(i)}
                              className="text-zinc-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Definition</label>
                            <textarea
                              className="w-full mt-2 bg-white border border-zinc-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm min-h-[90px]"
                              value={c}
                              onChange={(e) => handleCoChange(i, e.target.value)}
                              rows={3}
                              placeholder="Enter CO definition"
                            />

                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mt-4">Content</label>
                            <textarea
                              className="w-full mt-2 bg-white border border-zinc-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm min-h-[140px]"
                              value={coContents[i] || ""}
                              onChange={(e) => handleCoContentChange(i, e.target.value)}
                              rows={6}
                              placeholder="Topics / subtopics / keywords for this CO"
                            />
                          </div>
                          <div className="w-56 shrink-0">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Domain</label>
                            <div className="relative mt-2">
                              <select
                                className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
                                value={coDomains[i] || ""}
                                onChange={(e) => handleCoDomainChange(i, e.target.value)}
                              >
                                <option value="">Select Domain</option>
                                {Object.values(bloomsDomains).map((d) => (
                                  <option key={d.name} value={d.name}>{d.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                            </div>

                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Level</label>
                            <div className="relative mt-2">
                              <select
                                className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
                                value={coLevels[i] || ""}
                                onChange={(e) => handleCoLevelChange(i, e.target.value)}
                              >
                                <option value="">Select Level</option>
                                {getLevelsForDomain(coDomains[i] || "").map((lvl, idx) => (
                                  <option key={idx} value={lvl.code || lvl.name}>
                                    {(lvl.code ? `${lvl.code} - ` : "") + lvl.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  className="px-4 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white font-bold rounded-lg shadow transition-all"
                  onClick={addCO}
                >
                  + Add CO
                </button>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                <button
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 rounded-lg font-bold transition-all"
                  onClick={() => setShowCreate(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow transition-all"
                  onClick={handleSave}
                  disabled={saving}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save Course'}
                </button>
              </div>
            </div>
          )}

          {message && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm font-medium">
              {message}
            </div>
          )}
        </div>
      </div>
      </div>
    </Layout>
  );
}
