import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { 
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp 
} from "firebase/firestore";
import { 
  Users, UserPlus, FileText, CheckCircle2, XCircle, Link as LinkIcon, 
  Upload, Copy, Eye, Lock, FileCheck, Layers, BookOpen, AlertCircle, 
  Trash2, RefreshCw, Search, ExternalLink, Sparkles, ArrowLeft, Landmark, Plus, Edit3, Mail
} from "lucide-react";
import Layout from "../../components/Layout";
import { uploadFile } from "../../utils/fileUpload";

import { useDepartments } from "../../hooks/useDepartments";
import { useRegulations } from "../../hooks/useRegulations";
import { useBatches } from "../../hooks/useBatches";
import { formatProgrammeKey, matchRegulation, sanitizeKey, formatDepartmentDisplay } from "../../lib/utils";

export default function CoeDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("users"); // "users" | "patterns" | "assignment" | "submitted"

  // --------------------------------------------------------------------------
  // DYNAMIC HOOKS & METADATA (Matching IAScheduleCreation.jsx)
  // --------------------------------------------------------------------------
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  const formatPublicAccessLink = (rawUrl, assignmentId) => {
    let targetId = assignmentId;
    if (!targetId && rawUrl) {
      const match = rawUrl.match(/assignmentId=([^&]+)/);
      if (match) targetId = match[1];
    }
    if (!targetId) return rawUrl || "";
    const baseUrl = (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))
      ? "https://zonesynapse-ckcet-obe.pages.dev"
      : (typeof window !== "undefined" ? window.location.origin : "https://zonesynapse-ckcet-obe.pages.dev");
    return `${baseUrl}/coe-setter-login?assignmentId=${targetId}`;
  };

  const programmes = useMemo(() => Object.keys(deptMap || {}), [deptMap]);

  // Tab 2 & 3 Filter States
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const [assignBatch, setAssignBatch] = useState("2023-2027");
  const [assignSemester, setAssignSemester] = useState("");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");

  const availableBatches = useMemo(() => {
    const set = new Set(["2021-2025", "2022-2026", "2023-2027", "2024-2028", "2025-2029"]);
    const progsToUse = selectedProgramme ? [selectedProgramme] : programmes;
    progsToUse.forEach(p => {
      getActiveBatches(p).forEach(b => set.add(b));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [selectedProgramme, programmes, getActiveBatches]);

  // AUTO-SELECTED REGULATION BASED ON BATCH & PROGRAMME (READ-ONLY / DISABLED)
  const autoRegulation = useMemo(() => {
    if (!assignBatch) return "";
    const progKey = selectedProgramme ? formatProgrammeKey(selectedProgramme) : (programmes[0] ? formatProgrammeKey(programmes[0]) : "");
    const reg = getRegulationForBatch(progKey, assignBatch);
    return reg || "2021";
  }, [selectedProgramme, assignBatch, programmes, getRegulationForBatch]);

  // --------------------------------------------------------------------------
  // EXACT SUBJECT FETCHING LOGIC MATCHING IAScheduleCreation.jsx
  // --------------------------------------------------------------------------
  const [allSyllabusDocs, setAllSyllabusDocs] = useState([]);
  const [coConfigDocs, setCoConfigDocs] = useState([]);
  const [courseBankDocs, setCourseBankDocs] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  useEffect(() => {
    // 1. Listen to syllabus_data collection
    const unsubSyll = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const data = d.data() || {};
        docs.push({ id: d.id, data });
      });
      setAllSyllabusDocs(docs);
      setLoadingSubjects(false);
    }, () => setAllSyllabusDocs([]));

    // 2. Listen to co_configuration collection
    const unsubCO = onSnapshot(collection(db, "co_configuration"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (data.subjectCode || data.courseCode) {
          docs.push({ id: d.id, ...data });
        }
      });
      setCoConfigDocs(docs);
    }, () => setCoConfigDocs([]));

    // 3. Listen to courses collection
    const unsubCourses = onSnapshot(collection(db, "courses"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (data.code || data.subjectCode || data.courseCode) {
          docs.push({ id: d.id, ...data });
        }
      });
      setCourseBankDocs(docs);
    }, () => setCourseBankDocs([]));

    return () => {
      unsubSyll();
      unsubCO();
      unsubCourses();
    };
  }, []);

  // Compute Subjects matching selected Programme, Batch, Semester, and Auto Regulation
  // Handles course code space removal (e.g., GE 3751 -> GE3751) & Common subject detection across departments
  const fetchedSubjects = useMemo(() => {
    const byCode = {};
    const targetProgKey = selectedProgramme ? formatProgrammeKey(selectedProgramme) : "";
    const activeProgs = selectedProgramme ? [selectedProgramme] : programmes;

    // Helper to sanitize code: GE 3751 -> GE3751
    const cleanCode = (raw) => String(raw || "").replace(/\s+/g, "").toUpperCase();

    // 1. Process syllabus_data (IAScheduleCreation pattern)
    activeProgs.forEach(prog => {
      const pKey = formatProgrammeKey(prog);
      const regForProg = getRegulationForBatch(pKey, assignBatch) || autoRegulation;
      
      allSyllabusDocs.forEach(sDoc => {
        const docIdLower = sDoc.id.toLowerCase();
        // Check if doc matches programme and regulation
        const regMatches = !regForProg || matchRegulation(sDoc.id, regForProg) || docIdLower.includes(regForProg.toLowerCase());
        const progMatches = !targetProgKey || docIdLower.includes(targetProgKey.toLowerCase()) || docIdLower.includes(pKey.toLowerCase());

        if (regMatches || progMatches) {
          const sems = sDoc.data?.semesters || {};
          const docDept = sDoc.data?.department || sDoc.data?.dept || "CSE";
          
          Object.entries(sems).forEach(([semKey, subList]) => {
            if (assignSemester && String(semKey) !== String(assignSemester)) return;
            if (Array.isArray(subList)) {
              subList.forEach(sub => {
                if (!sub || sub.isNonOBE === true) return;
                const rawCode = String(sub.code || sub.subjectCode || sub.courseCode || "").trim();
                const code = cleanCode(rawCode);
                const name = String(sub.name || sub.subjectName || sub.courseName || sub.title || "").trim();
                if (!code) return;

                if (!byCode[code]) {
                  byCode[code] = {
                    id: `${code}_${sDoc.id}`,
                    code,
                    title: name || `Subject ${code}`,
                    department: docDept,
                    departments: [docDept],
                    regulation: regForProg,
                    batch: assignBatch,
                    semester: semKey
                  };
                } else {
                  if (name && (!byCode[code].title || byCode[code].title.startsWith("Subject"))) {
                    byCode[code].title = name;
                  }
                  if (docDept && !byCode[code].departments.includes(docDept)) {
                    byCode[code].departments.push(docDept);
                  }
                }
              });
            }
          });
        }
      });
    });

    // 2. Process co_configuration
    coConfigDocs.forEach(docData => {
      const rawCode = String(docData.subjectCode || docData.courseCode || "").trim();
      const code = cleanCode(rawCode);
      const title = String(docData.subjectTitle || docData.courseName || docData.subjectName || "").trim();
      const sem = String(docData.semester || "1");
      const docDept = docData.department || docData.dept || "CSE";
      
      if (code && !code.includes("_")) {
        if (assignSemester && sem !== String(assignSemester)) return;
        if (!byCode[code]) {
          byCode[code] = {
            id: docData.id,
            code,
            title: title || `Subject ${code}`,
            department: docDept,
            departments: [docDept],
            regulation: docData.regulation || autoRegulation,
            batch: docData.batchYear || docData.batch || assignBatch,
            semester: sem
          };
        } else {
          if (docDept && !byCode[code].departments.includes(docDept)) {
            byCode[code].departments.push(docDept);
          }
        }
      }
    });

    // 3. Process courses
    courseBankDocs.forEach(docData => {
      const rawCode = String(docData.code || docData.subjectCode || docData.courseCode || "").trim();
      const code = cleanCode(rawCode);
      const title = String(docData.name || docData.courseName || docData.title || "").trim();
      const sem = String(docData.semester || "1");
      const docDept = docData.dept || docData.department || "CSE";

      if (code) {
        if (assignSemester && sem !== String(assignSemester)) return;
        if (!byCode[code]) {
          byCode[code] = {
            id: docData.id,
            code,
            title: title || `Course ${code}`,
            department: docDept,
            departments: [docDept],
            regulation: autoRegulation,
            batch: assignBatch,
            semester: sem
          };
        } else {
          if (docDept && !byCode[code].departments.includes(docDept)) {
            byCode[code].departments.push(docDept);
          }
        }
      }
    });

    // Helper to get compact department short code (e.g. CSE, ECE, EEE, MECH, AI&DS)
    const getDeptShortCode = (deptStr) => {
      if (!deptStr) return "";
      const s = String(deptStr).toUpperCase();
      if (s.includes("COMPUTER SCIENCE") || s.includes("CSE")) return "CSE";
      if (s.includes("ARTIFICIAL INTELLIGENCE") || s.includes("AI") || s.includes("DATA SCIENCE")) return "AI&DS";
      if (s.includes("ELECTRONICS AND COMMUNICATION") || s.includes("ECE")) return "ECE";
      if (s.includes("ELECTRICAL AND ELECTRONICS") || s.includes("EEE")) return "EEE";
      if (s.includes("MECHANICAL") || s.includes("MECH")) return "MECH";
      if (s.includes("CIVIL")) return "CIVIL";
      if (s.includes("INFORMATION TECHNOLOGY") || s.includes("IT")) return "IT";
      if (s.includes("BIOMEDICAL") || s.includes("BME")) return "BME";
      if (s.includes("AGRICULTURAL") || s.includes("AGRI")) return "AGRI";
      if (s.includes("CHEMICAL") || s.includes("CHEM")) return "CHEM";
      const formatted = formatDepartmentDisplay(deptStr);
      return formatted.replace(/^(B\.E\.|B\.Tech\.|M\.E\.|M\.Tech\.)\s*/i, "").trim() || String(deptStr);
    };

    // Format common subjects & department lists
    const subjectList = Object.values(byCode).map(s => {
      const depts = s.departments.filter(Boolean);
      const isCommon = depts.length > 1 || depts.includes("Overall") || s.department === "Overall";
      
      const shortDepts = Array.from(new Set(depts.map(getDeptShortCode))).filter(Boolean);
      const deptDisplay = isCommon
        ? (shortDepts.length > 0 ? `COMMON (${shortDepts.join(", ")})` : "COMMON (All Depts)")
        : formatDepartmentDisplay(depts[0] || s.department || "CSE");

      return {
        ...s,
        departments: depts,
        shortDepts,
        isCommon,
        deptDisplay
      };
    });

    // Sort: Common subjects first, then alphabetically by code
    return subjectList.sort((a, b) => {
      if (a.isCommon && !b.isCommon) return -1;
      if (!a.isCommon && b.isCommon) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [allSyllabusDocs, coConfigDocs, courseBankDocs, selectedProgramme, programmes, assignBatch, assignSemester, autoRegulation, getRegulationForBatch]);

  // LIVE SEARCH FILTERED SUBJECTS
  const filteredSubjects = useMemo(() => {
    if (!courseSearchQuery.trim()) return fetchedSubjects;
    const q = courseSearchQuery.toLowerCase().replace(/\s+/g, "").trim();
    return fetchedSubjects.filter(s => 
      s.code.toLowerCase().replace(/\s+/g, "").includes(q) || 
      s.title.toLowerCase().includes(q) ||
      s.department.toLowerCase().includes(q) ||
      s.deptDisplay.toLowerCase().includes(q) ||
      s.departments.some(d => d.toLowerCase().includes(q))
    );
  }, [fetchedSubjects, courseSearchQuery]);

  // --------------------------------------------------------------------------
  // TAB 1: USER MANAGEMENT (EXTERNAL QUESTION PAPER SETTERS)
  // --------------------------------------------------------------------------
  const [setters, setSetters] = useState([]);
  const [loadingSetters, setLoadingSetters] = useState(true);
  const [setterSearch, setSetterSearch] = useState("");

  const [newSetterName, setNewSetterName] = useState("");
  const [newSetterCollege, setNewSetterCollege] = useState("");
  const [newSetterEmail, setNewSetterEmail] = useState("");
  const [newSetterPassword, setNewSetterPassword] = useState("");
  const [creatingSetter, setCreatingSetter] = useState(false);
  const [setterFeedback, setSetterFeedback] = useState({ type: "", message: "" });

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewSetterPassword(pwd);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_external_setters"), (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSetters(list);
      setLoadingSetters(false);
    });
    return () => unsub();
  }, []);

  const handleCreateSetter = async (e) => {
    e.preventDefault();
    if (!newSetterName.trim() || !newSetterCollege.trim() || !newSetterEmail.trim()) {
      setSetterFeedback({ type: "error", message: "Please fill in Setter Name, College Name, and Email." });
      return;
    }

    const pwdToSave = newSetterPassword.trim() || Math.random().toString(36).slice(-8) + "A1!";

    setCreatingSetter(true);
    setSetterFeedback({ type: "", message: "" });
    try {
      const setterId = "setter_" + Date.now();
      await setDoc(doc(db, "coe_external_setters", setterId), {
        name: newSetterName.trim(),
        collegeName: newSetterCollege.trim(),
        email: newSetterEmail.trim().toLowerCase(),
        password: pwdToSave,
        status: "active",
        createdAt: serverTimestamp(),
      });

      setSetterFeedback({ 
        type: "success", 
        message: `External Setter ${newSetterName} created successfully with password: ${pwdToSave}` 
      });

      setNewSetterName("");
      setNewSetterCollege("");
      setNewSetterEmail("");
      setNewSetterPassword("");
    } catch (err) {
      console.error("Error creating external setter:", err);
      setSetterFeedback({ type: "error", message: "Failed to create setter: " + err.message });
    } finally {
      setCreatingSetter(false);
    }
  };

  const handleToggleSetterStatus = async (setter) => {
    const newStatus = setter.status === "active" ? "disabled" : "active";
    try {
      await updateDoc(doc(db, "coe_external_setters", setter.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleDeleteSetter = async (setterId) => {
    if (!window.confirm("Are you sure you want to delete this external setter?")) return;
    try {
      await deleteDoc(doc(db, "coe_external_setters", setterId));
    } catch (err) {
      alert("Failed to delete setter: " + err.message);
    }
  };

  const filteredSetters = useMemo(() => {
    return setters.filter(s => 
      s.name?.toLowerCase().includes(setterSearch.toLowerCase()) ||
      s.collegeName?.toLowerCase().includes(setterSearch.toLowerCase()) ||
      s.email?.toLowerCase().includes(setterSearch.toLowerCase())
    );
  }, [setters, setterSearch]);

  // --------------------------------------------------------------------------
  // TAB 2: ESE QUESTION PATTERN MANAGEMENT (DYNAMIC SECTIONS / PARTS)
  // --------------------------------------------------------------------------
  const [patterns, setPatterns] = useState([]);
  const [coursePatternMap, setCoursePatternMap] = useState({});
  const [loadingPatterns, setLoadingPatterns] = useState(true);

  // Dynamic Pattern Creator Form State
  const [newPatternTitle, setNewPatternTitle] = useState("");
  const [newPatternDuration, setNewPatternDuration] = useState("3 Hours");
  
  const [newPatternSections, setNewPatternSections] = useState([
    { id: "part_a", name: "Part A", count: 10, marksPerQ: 2, choiceType: "compulsory", instructions: "Answer ALL Questions (10 x 2 = 20 Marks)" },
    { id: "part_b", name: "Part B", count: 5, marksPerQ: 13, choiceType: "either_or", instructions: "Answer ALL Questions (Either OR Choice) (5 x 13 = 65 Marks)" }
  ]);

  const [savingPattern, setSavingPattern] = useState(false);
  const [viewPatternDetailsModal, setViewPatternDetailsModal] = useState(null);

  // Multi-course assignment state
  const [selectedPatternForAssign, setSelectedPatternForAssign] = useState("");
  const [selectedCoursesToAssign, setSelectedCoursesToAssign] = useState([]);
  const [assigningPatternToCourses, setAssigningPatternToCourses] = useState(false);

  const calculatedTotalMarks = useMemo(() => {
    return newPatternSections.reduce((sum, sec) => sum + ((sec.count || 0) * (sec.marksPerQ || 0)), 0);
  }, [newPatternSections]);

  const mappedSubjectsForPattern = useMemo(() => {
    if (!viewPatternDetailsModal) return [];
    const targetId = viewPatternDetailsModal.id;
    const mappedCodes = Object.entries(coursePatternMap)
      .filter(([_, patternId]) => patternId === targetId)
      .map(([code]) => code);
    return fetchedSubjects.filter(s => mappedCodes.includes(s.code));
  }, [viewPatternDetailsModal, coursePatternMap, fetchedSubjects]);

  const handleDeletePattern = async (patternId) => {
    if (!window.confirm("Are you sure you want to delete this question paper pattern?")) return;
    try {
      await deleteDoc(doc(db, "coe_patterns", patternId));
      alert("Pattern deleted successfully.");
      if (viewPatternDetailsModal?.id === patternId) {
        setViewPatternDetailsModal(null);
      }
    } catch (err) {
      alert("Failed to delete pattern: " + err.message);
    }
  };

  useEffect(() => {
    const unsubP = onSnapshot(collection(db, "coe_patterns"), (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setPatterns(list);
    });

    const unsubM = onSnapshot(collection(db, "coe_course_patterns"), (snap) => {
      const map = {};
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.subjectCode && data.patternId) {
          map[data.subjectCode] = data.patternId;
        }
      });
      setCoursePatternMap(map);
      setLoadingPatterns(false);
    });

    return () => {
      unsubP();
      unsubM();
    };
  }, []);

  const handleAddSection = () => {
    const nextChar = String.fromCharCode(65 + newPatternSections.length);
    const secId = `part_${nextChar.toLowerCase()}`;
    const secName = `Part ${nextChar}`;
    
    setNewPatternSections([
      ...newPatternSections,
      { 
        id: secId, 
        name: secName, 
        count: 5, 
        marksPerQ: 10, 
        choiceType: "either_or", 
        instructions: `Answer ALL Questions in ${secName}` 
      }
    ]);
  };

  const handleRemoveSection = (indexToRemove) => {
    if (newPatternSections.length <= 1) {
      alert("At least one section / part is required in the pattern.");
      return;
    }
    setNewPatternSections(newPatternSections.filter((_, idx) => idx !== indexToRemove));
  };

  const [editingPatternId, setEditingPatternId] = useState(null);

  const handleEditPattern = (pattern) => {
    setEditingPatternId(pattern.id);
    setNewPatternTitle(pattern.title || "");
    setNewPatternDuration(pattern.duration || "3 Hours");
    setNewPatternSections(pattern.sections || []);
    setViewPatternDetailsModal(null);
    setActiveTab("patterns");
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  const handleCancelEditPattern = () => {
    setEditingPatternId(null);
    setNewPatternTitle("");
    setNewPatternDuration("3 Hours");
    setNewPatternSections([
      { id: "part_a", name: "Part A", count: 10, marksPerQ: 2, choiceType: "compulsory", instructions: "Answer ALL Questions (10 x 2 = 20 Marks)" },
      { id: "part_b", name: "Part B", count: 5, marksPerQ: 13, choiceType: "either_or", instructions: "Answer ALL Questions (Either OR Choice) (5 x 13 = 65 Marks)" }
    ]);
  };

  const handleCreatePattern = async (e) => {
    e.preventDefault();
    if (!newPatternTitle.trim()) {
      alert("Pattern title is required.");
      return;
    }
    if (newPatternSections.length === 0) {
      alert("Please add at least one question section to the pattern.");
      return;
    }

    setSavingPattern(true);
    try {
      const patternId = editingPatternId || ("pattern_" + Date.now());
      const patternData = {
        title: newPatternTitle.trim(),
        duration: newPatternDuration,
        totalMarks: Number(calculatedTotalMarks),
        sections: newPatternSections,
        updatedAt: serverTimestamp(),
        ...(editingPatternId ? {} : { createdAt: serverTimestamp() })
      };

      await setDoc(doc(db, "coe_patterns", patternId), patternData, { merge: true });

      alert(editingPatternId ? "Question Paper Pattern updated successfully!" : "Question Paper Pattern created successfully!");
      handleCancelEditPattern();
    } catch (err) {
      alert("Error saving pattern: " + err.message);
    } finally {
      setSavingPattern(false);
    }
  };

  const handleAssignPatternToSelectedCourses = async () => {
    if (!selectedPatternForAssign) {
      alert("Please select a Question Paper Pattern first.");
      return;
    }
    if (selectedCoursesToAssign.length === 0) {
      alert("Please select at least one course to assign this pattern.");
      return;
    }

    setAssigningPatternToCourses(true);
    try {
      const promises = selectedCoursesToAssign.map(courseCode => {
        const mapDocId = `map_${assignBatch}_${autoRegulation}_${courseCode}`;
        return setDoc(doc(db, "coe_course_patterns", mapDocId), {
          batch: assignBatch,
          regulation: autoRegulation,
          subjectCode: courseCode,
          patternId: selectedPatternForAssign,
          updatedAt: serverTimestamp()
        });
      });

      await Promise.all(promises);
      alert(`Pattern assigned successfully to ${selectedCoursesToAssign.length} course(s)!`);
      setSelectedCoursesToAssign([]);
    } catch (err) {
      alert("Error assigning pattern to courses: " + err.message);
    } finally {
      setAssigningPatternToCourses(false);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 3: SETTER SUBJECT ASSIGNMENT & ORDER COPY LINK GENERATION
  // --------------------------------------------------------------------------
  const [assSubjectCode, setAssSubjectCode] = useState("");
  const [assSetterId, setAssSetterId] = useState("");

  // Order Copy Upload
  const [orderFile, setOrderFile] = useState(null);
  const [orderFileBase64, setOrderFileBase64] = useState("");
  const [orderFileSizeKb, setOrderFileSizeKb] = useState(0);
  const [orderSizeError, setOrderSizeError] = useState("");
  const [uploadingOrder, setUploadingOrder] = useState(false);

  // Link Generation Result
  const [generatedAssignment, setGeneratedAssignment] = useState(null);

  // TAB 3 SUBJECTS FILTER: Show ONLY subjects that have an assigned ESE pattern
  const mappedSubjectsForTab3 = useMemo(() => {
    return filteredSubjects.filter(s => {
      const patternId = coursePatternMap[s.code];
      return Boolean(patternId && patterns.some(p => p.id === patternId));
    });
  }, [filteredSubjects, coursePatternMap, patterns]);

  const selectedSubjectObj = useMemo(() => {
    return mappedSubjectsForTab3.find(s => s.code === assSubjectCode || s.id === assSubjectCode);
  }, [mappedSubjectsForTab3, assSubjectCode]);

  const currentSubjectPatternId = useMemo(() => {
    return coursePatternMap[assSubjectCode];
  }, [coursePatternMap, assSubjectCode]);

  const currentSubjectPatternObj = useMemo(() => {
    return patterns.find(p => p.id === currentSubjectPatternId);
  }, [patterns, currentSubjectPatternId]);

  const handleOrderFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const sizeKb = (file.size / 1024).toFixed(1);
    setOrderFileSizeKb(Number(sizeKb));

    if (file.size > 30 * 1024) {
      setOrderSizeError(`File size is ${sizeKb} KB. Required maximum size is 30 KB! Attempting auto-compression for image...`);
      
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const maxDim = 800;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.4);
            const compSizeKb = (compressedBase64.length * 0.75 / 1024).toFixed(1);
            setOrderFileBase64(compressedBase64);
            setOrderFile(file);
            setOrderFileSizeKb(Number(compSizeKb));

            if (Number(compSizeKb) <= 30) {
              setOrderSizeError("");
            } else {
              setOrderSizeError(`Compressed size is ${compSizeKb} KB. Please select a smaller document (<= 30 KB).`);
            }
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        setOrderFile(null);
        setOrderFileBase64("");
      }
    } else {
      setOrderSizeError("");
      setOrderFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setOrderFileBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAssignmentLink = async () => {
    if (!assSubjectCode) {
      alert("Please select a Course / Subject.");
      return;
    }
    if (!currentSubjectPatternId) {
      alert("Cannot assign setter! Please assign an ESE Question Pattern to this subject first under 'Question Patterns' tab.");
      return;
    }
    if (!assSetterId) {
      alert("Please select an External Question Paper Setter.");
      return;
    }
    if (!orderFileBase64) {
      alert("Please upload the Appointment / Order Copy (<= 30 KB).");
      return;
    }
    if (orderFileSizeKb > 30) {
      alert(`Order Copy size is ${orderFileSizeKb} KB. Maximum allowed size is 30 KB.`);
      return;
    }

    const setterObj = setters.find(s => s.id === assSetterId);
    if (!setterObj) {
      alert("Selected setter record not found.");
      return;
    }

    setUploadingOrder(true);
    try {
      const assignmentId = `coe_assign_${Date.now()}`;
      
      let orderUrl = orderFileBase64;
      try {
        if (orderFile && orderFile.size <= 30 * 1024) {
          orderUrl = await uploadFile(`coe_orders/${assignmentId}_order.png`, orderFile);
        }
      } catch (e) {
        console.warn("Storage upload fallback to Base64:", e);
      }

      const baseUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "https://zonesynapse-ckcet-obe.pages.dev"
        : window.location.origin;
      const generatedUrl = `${baseUrl}/coe-setter-login?assignmentId=${assignmentId}`;

      const assignmentData = {
        id: assignmentId,
        batch: assignBatch,
        regulation: autoRegulation,
        department: selectedSubjectObj?.department || "CSE",
        subjectCode: assSubjectCode,
        subjectTitle: selectedSubjectObj?.title || assSubjectCode,
        patternId: currentSubjectPatternId,
        setterId: setterObj.id,
        setterName: setterObj.name,
        setterCollege: setterObj.collegeName,
        setterEmail: setterObj.email,
        orderCopyUrl: orderUrl,
        orderFileSizeKb: orderFileSizeKb,
        accessLink: generatedUrl,
        status: "assigned",
        acceptanceStatus: null,
        signatureUrl: null,
        submittedPaper: null,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, "coe_setter_assignments", assignmentId), assignmentData);

      setGeneratedAssignment({
        ...assignmentData,
        setterPassword: setterObj.password
      });

      alert("External Setter Assignment created and Link Generated successfully!");
    } catch (err) {
      alert("Failed to generate assignment link: " + err.message);
    } finally {
      setUploadingOrder(false);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 4: SUBMITTED QUESTION PAPERS REVIEW
  // --------------------------------------------------------------------------
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [selectedReviewAssignment, setSelectedReviewAssignment] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_setter_assignments"), (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAssignments(list);
      setLoadingAssignments(false);
    });
    return () => unsub();
  }, []);

  const inputCls = "w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 font-semibold placeholder-zinc-400 focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all cursor-pointer";
  const labelCls = "text-[11px] font-black text-zinc-500 uppercase tracking-wider mb-1 block";

  // --------------------------------------------------------------------------
  // TAB 5: QUESTION SETTER GUIDELINES CONFIGURATION
  // --------------------------------------------------------------------------
  const [guidelines, setGuidelines] = useState([]);
  const [loadingGuidelines, setLoadingGuidelines] = useState(true);
  const [newGuidelineText, setNewGuidelineText] = useState("");
  const [newGuidelineCategory, setNewGuidelineCategory] = useState("Mandatory");
  const [guidelineFeedback, setGuidelineFeedback] = useState({ type: "", message: "" });
  const [savingGuideline, setSavingGuideline] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_qp_guidelines"), (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setGuidelines(list);
      setLoadingGuidelines(false);
    });
    return () => unsub();
  }, []);

  const handleAddGuideline = async (e) => {
    e.preventDefault();
    if (!newGuidelineText.trim()) {
      setGuidelineFeedback({ type: "error", message: "Please enter guideline text." });
      return;
    }

    setSavingGuideline(true);
    setGuidelineFeedback({ type: "", message: "" });
    try {
      const gId = "g_" + Date.now();
      await setDoc(doc(db, "coe_qp_guidelines", gId), {
        text: newGuidelineText.trim(),
        category: newGuidelineCategory,
        order: guidelines.length + 1,
        createdAt: serverTimestamp()
      });
      setGuidelineFeedback({ type: "success", message: "Guideline added successfully!" });
      setNewGuidelineText("");
    } catch (err) {
      console.error("Error adding guideline:", err);
      setGuidelineFeedback({ type: "error", message: "Failed to save guideline." });
    } finally {
      setSavingGuideline(false);
    }
  };

  const handleDeleteGuideline = async (id) => {
    try {
      await deleteDoc(doc(db, "coe_qp_guidelines", id));
      setGuidelineFeedback({ type: "success", message: "Guideline removed." });
    } catch (err) {
      console.error("Error deleting guideline:", err);
    }
  };

  const handleSeedDefaultGuidelines = async () => {
    const defaultList = [
      { text: "Ensure all questions strictly align with the designated Bloom's Taxonomy cognitive levels (K1 to K6).", category: "Mandatory" },
      { text: "Each question must map directly to its corresponding Course Outcome (CO1 to CO5).", category: "CO Mapping" },
      { text: "For Either-OR choice questions (Part B/C), maintain equal difficulty and mark distribution across Option (a) and Option (b).", category: "Format" },
      { text: "Use the built-in CKEditor MathJax tool for mathematical formulas and upload clear vector/image diagrams.", category: "Formatting" },
      { text: "Strictly maintain absolute secrecy and confidentiality of the question paper framed.", category: "Confidential" }
    ];

    setSavingGuideline(true);
    try {
      for (let i = 0; i < defaultList.length; i++) {
        const item = defaultList[i];
        const gId = "g_default_" + (i + 1);
        await setDoc(doc(db, "coe_qp_guidelines", gId), {
          ...item,
          order: i + 1,
          createdAt: serverTimestamp()
        });
      }
      setGuidelineFeedback({ type: "success", message: "Standard ESE Guidelines loaded successfully!" });
    } catch (err) {
      console.error("Error seeding default guidelines:", err);
    } finally {
      setSavingGuideline(false);
    }
  };

  return (
    <Layout title="Controller of Examinations (COE)">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6 font-sans">
        
        {/* Header Banner - Matches Global Application Theme */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-white/5 blur-2xl"></div>
          
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate("/exam-cell")}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer text-white"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Landmark size={28} />
              </div>
              <div>
                <span className="inline-block px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-200 bg-white/10 border border-white/20 rounded-full mb-1">
                  Controller of Examinations
                </span>
                <h1 className="text-2xl md:text-3xl font-black leading-tight text-white">
                  COE ESE Question Paper Management Module
                </h1>
                <p className="text-sm text-blue-100/90 font-medium mt-0.5">
                  Manage external question paper setters, ESE patterns, subject order links & review submitted papers.
                </p>
              </div>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur border border-white/20 px-4 py-2.5 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">Active Setters</span>
                <span className="text-xl font-black text-emerald-300">{setters.filter(s => s.status === "active").length}</span>
              </div>
              <div className="bg-white/10 backdrop-blur border border-white/20 px-4 py-2.5 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">Assignments</span>
                <span className="text-xl font-black text-white">{assignments.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-1.5 shadow-sm mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "users"
                ? "bg-[#120c7a] text-white shadow-md"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>User Management</span>
            <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === "users" ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600"
            }`}>
              {setters.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("patterns")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "patterns"
                ? "bg-[#120c7a] text-white shadow-md"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Question Paper Patterns</span>
            <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === "patterns" ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600"
            }`}>
              {patterns.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("assignment")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "assignment"
                ? "bg-[#120c7a] text-white shadow-md"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            <span>Assign Subject & Order Copy</span>
          </button>

          <button
            onClick={() => setActiveTab("submitted")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "submitted"
                ? "bg-[#120c7a] text-white shadow-md"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <FileCheck className="h-4 w-4" />
            <span>Submitted Question Papers</span>
            <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              {assignments.filter(a => a.status === "submitted").length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("guidelines")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "guidelines"
                ? "bg-[#120c7a] text-white shadow-md"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>QP Guidelines Config</span>
            <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === "guidelines" ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600"
            }`}>
              {guidelines.length}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: USER MANAGEMENT (EXTERNAL QUESTION PAPER SETTERS) */}
        {/* ========================================================================= */}
        {activeTab === "users" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create New External Setter Form */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 h-fit">
              <div className="flex items-center gap-3 mb-5 pb-3 border-b border-zinc-100">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#120c7a]">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#120c7a]">Add External QP Setter</h2>
                  <p className="text-[11px] font-semibold text-zinc-500">Create new external setter credentials</p>
                </div>
              </div>

              {setterFeedback.message && (
                <div className={`p-3 rounded-xl mb-4 text-xs font-bold border flex items-start gap-2 ${
                  setterFeedback.type === "success" 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}>
                  {setterFeedback.type === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />}
                  <div className="break-all">{setterFeedback.message}</div>
                </div>
              )}

              <form onSubmit={handleCreateSetter} className="space-y-4">
                <div>
                  <label className={labelCls}>
                    Setter Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. K. Ramesh"
                    value={newSetterName}
                    onChange={(e) => setNewSetterName(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    External College / Institution Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PSG College of Technology, Coimbatore"
                    value={newSetterCollege}
                    onChange={(e) => setNewSetterCollege(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. ramesh@psgtech.ac.in"
                    value={newSetterEmail}
                    onChange={(e) => setNewSetterEmail(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls}>Generated Password</label>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="text-[11px] font-bold text-[#120c7a] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3 text-amber-500" /> Auto Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter or generate password"
                      value={newSetterPassword}
                      onChange={(e) => setNewSetterPassword(e.target.value)}
                      className={`${inputCls} font-mono text-indigo-900 font-bold bg-zinc-50/50 pr-9`}
                    />
                    <Lock className="h-4 w-4 text-zinc-400 absolute right-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingSetter}
                  className="w-full bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                >
                  {creatingSetter ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Creating Setter Account...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      <span>Generate Credentials & Create User</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* External Setters Table Directory */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-100">
                <div>
                  <h2 className="text-base font-black text-[#120c7a] flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-600" />
                    External Question Paper Setters Directory
                  </h2>
                  <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                    Enable or disable external setter access at any time.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search by name, college, email..."
                    value={setterSearch}
                    onChange={(e) => setSetterSearch(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium placeholder-zinc-400 focus:outline-none focus:border-[#120c7a]"
                  />
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-2.5" />
                </div>
              </div>

              {loadingSetters ? (
                <div className="py-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#120c7a]" />
                  <span className="text-xs font-bold">Loading external setters directory...</span>
                </div>
              ) : filteredSetters.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-zinc-200 rounded-2xl p-6 text-zinc-500">
                  <Users className="h-10 w-10 mx-auto mb-2 text-zinc-400" />
                  <p className="font-extrabold text-zinc-800 text-sm">No External Setters Found</p>
                  <p className="text-xs text-zinc-500 mt-1">Use the form on the left to add a new external question paper setter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 text-zinc-600 uppercase tracking-wider font-black border-b border-zinc-200">
                        <th className="py-3.5 px-4">Setter Details</th>
                        <th className="py-3.5 px-4">College / Institution</th>
                        <th className="py-3.5 px-4">Credentials</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredSetters.map((s) => (
                        <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-zinc-900 text-xs">{s.name}</div>
                            <div className="text-zinc-500 text-[11px] font-medium">{s.email}</div>
                          </td>
                          <td className="py-3.5 px-4 text-zinc-700 font-semibold text-xs">
                            {s.collegeName}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-indigo-900 text-xs bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-200 inline-flex items-center gap-1.5 font-bold">
                              <Lock className="h-3 w-3 text-zinc-500" />
                              <span>{s.password || "••••••••"}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleToggleSetterStatus(s)}
                              className={`px-3 py-1 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                                s.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                              }`}
                            >
                              {s.status === "active" ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Active</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                  <span>Disabled</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleSetterStatus(s)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                  s.status === "active"
                                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                }`}
                              >
                                {s.status === "active" ? "Disable" : "Enable"}
                              </button>

                              <button
                                onClick={() => handleDeleteSetter(s.id)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer"
                                title="Delete Setter"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ESE QUESTION PATTERN CONFIGURATION & MULTI-COURSE ASSIGNMENT */}
        {/* ========================================================================= */}
        {activeTab === "patterns" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dynamic ESE Question Paper Pattern Builder */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-[#120c7a]">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-[#120c7a]">
                        {editingPatternId ? "Edit Question Paper Pattern" : "Create ESE Question Paper Pattern"}
                      </h2>
                      {editingPatternId && (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                          Editing Mode
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-zinc-500">Add any number of custom sections/parts</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {editingPatternId && (
                    <button
                      type="button"
                      onClick={handleCancelEditPattern}
                      className="px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <div className="text-right">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Calculated Marks</span>
                    <span className="text-base font-black text-emerald-700">{calculatedTotalMarks} Marks</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleCreatePattern} className="space-y-4">
                <div>
                  <label className={labelCls}>
                    Pattern Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ESE Autonomous Pattern 100 Marks (Part A + Part B + Part C)"
                    value={newPatternTitle}
                    onChange={(e) => setNewPatternTitle(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Exam Duration</label>
                    <input
                      type="text"
                      value={newPatternDuration}
                      onChange={(e) => setNewPatternDuration(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Total Maximum Marks</label>
                    <input
                      type="number"
                      value={calculatedTotalMarks}
                      readOnly
                      className={`${inputCls} bg-zinc-50 text-emerald-700 font-extrabold cursor-not-allowed`}
                    />
                  </div>
                </div>

                {/* DYNAMIC PATTERN SECTIONS BUILDER */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                      Pattern Question Sections ({newPatternSections.length} Parts)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddSection}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#120c7a] border border-blue-200 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Part / Section</span>
                    </button>
                  </div>

                  {newPatternSections.map((sec, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3 relative group">
                      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sec.name}
                            onChange={(e) => {
                              const updated = [...newPatternSections];
                              updated[idx].name = e.target.value;
                              setNewPatternSections(updated);
                            }}
                            className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-xs font-black text-[#120c7a] w-28"
                            placeholder="Section Name"
                          />
                          <span className="text-[11px] text-zinc-500 font-bold">
                            ({(sec.count || 0) * (sec.marksPerQ || 0)} Marks)
                          </span>
                        </div>

                        {newPatternSections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(idx)}
                            className="p-1 rounded-lg text-rose-600 hover:bg-rose-100 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                            title="Remove Section"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500">No. of Questions</label>
                          <input
                            type="number"
                            min="1"
                            value={sec.count}
                            onChange={(e) => {
                              const updated = [...newPatternSections];
                              updated[idx].count = Number(e.target.value);
                              setNewPatternSections(updated);
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500">Marks per Q</label>
                          <input
                            type="number"
                            min="1"
                            value={sec.marksPerQ}
                            onChange={(e) => {
                              const updated = [...newPatternSections];
                              updated[idx].marksPerQ = Number(e.target.value);
                              setNewPatternSections(updated);
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500">Choice Type</label>
                          <select
                            value={sec.choiceType}
                            onChange={(e) => {
                              const updated = [...newPatternSections];
                              updated[idx].choiceType = e.target.value;
                              setNewPatternSections(updated);
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-zinc-800 font-bold"
                          >
                            <option value="compulsory">Compulsory</option>
                            <option value="either_or">Either-OR (Internal)</option>
                            <option value="any_n">Choice of N</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500">Section Instructions</label>
                        <input
                          type="text"
                          value={sec.instructions}
                          onChange={(e) => {
                            const updated = [...newPatternSections];
                            updated[idx].instructions = e.target.value;
                            setNewPatternSections(updated);
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-xs text-zinc-700 font-semibold"
                          placeholder="e.g. Answer ALL Questions"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={savingPattern}
                  className="w-full bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Layers className="h-4 w-4" />
                  <span>
                    {editingPatternId
                      ? `Update Question Paper Pattern (${calculatedTotalMarks} Marks)`
                      : `Save Question Paper Pattern (${calculatedTotalMarks} Marks)`}
                  </span>
                </button>
              </form>

              {/* Created ESE Question Paper Patterns List */}
              <div className="mt-6 pt-6 border-t border-zinc-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#120c7a]" />
                    <h3 className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                      Created Patterns Directory ({patterns.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold">Click pattern to view details</span>
                </div>

                {patterns.length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-zinc-200 rounded-2xl bg-zinc-50 text-zinc-500 text-xs">
                    No patterns created yet. Create your first pattern above.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {patterns.map((p) => {
                      const mappedCount = Object.values(coursePatternMap).filter(id => id === p.id).length;
                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-2xl border border-zinc-200 bg-white hover:border-[#120c7a]/40 transition-all flex items-center justify-between gap-3 shadow-2xs group"
                        >
                          <div 
                            onClick={() => setViewPatternDetailsModal(p)}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="font-extrabold text-zinc-900 text-xs line-clamp-1 group-hover:text-[#120c7a] transition-colors">
                              {p.title}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {p.totalMarks} Marks
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {p.duration || "3 Hours"}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                {p.sections?.length || 0} Parts
                              </span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                                {mappedCount} Subjects Mapped
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewPatternDetailsModal(p)}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#120c7a] border border-blue-200 text-xs font-black inline-flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                              title="View Pattern Details & Mapped Subjects"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Details</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEditPattern(p)}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black inline-flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                              title="Edit Question Paper Pattern"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeletePattern(p.id)}
                              className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer"
                              title="Delete Pattern"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Assign Pattern to Multiple Courses Grid (Matching IAScheduleCreation filters) */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5 pb-3 border-b border-zinc-100">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#120c7a]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#120c7a]">Assign Pattern to Multiple Courses</h2>
                  <p className="text-[11px] font-semibold text-zinc-500">Filter courses by Programme, Batch & Semester to map pattern</p>
                </div>
              </div>

              <div className="space-y-4 flex-1 flex flex-col">
                {/* Select Pattern */}
                <div>
                  <label className={labelCls}>
                    Select Question Paper Pattern <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedPatternForAssign}
                    onChange={(e) => setSelectedPatternForAssign(e.target.value)}
                    className={inputCls}
                  >
                    {patterns.length === 0 ? (
                      <option value="">-- No ESE Patterns Created Yet (Create one on the left) --</option>
                    ) : (
                      <>
                        <option value="">-- Choose Pattern --</option>
                        {patterns.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.totalMarks} Marks - {p.duration})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* FILTERS MATCHING IAScheduleCreation: Programme, Batch, Semester & Auto Regulation */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Programme</label>
                    <select
                      value={selectedProgramme}
                      onChange={(e) => setSelectedProgramme(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">All Programmes</option>
                      {programmes.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>Batch Year</label>
                    <select
                      value={assignBatch}
                      onChange={(e) => setAssignBatch(e.target.value)}
                      className={inputCls}
                    >
                      {availableBatches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* REGULATION IS AUTO-SELECTED BASED ON BATCH & READ-ONLY (DISABLED) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block">Regulation</label>
                      <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Auto-Selected
                      </span>
                    </div>
                    <input
                      type="text"
                      value={autoRegulation ? `R-${autoRegulation.replace(/^AU\s*-\s*/i, '')}` : "R-2021"}
                      disabled
                      className={`${inputCls} bg-zinc-100 text-zinc-500 font-extrabold cursor-not-allowed border-zinc-300`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Semester</label>
                    <select
                      value={assignSemester}
                      onChange={(e) => setAssignSemester(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">All Semesters</option>
                      {Array.from({ length: 8 }, (_, i) => String(i + 1)).map(sem => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* LIVE COURSE SEARCH BAR */}
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search course by code or title..."
                      value={courseSearchQuery}
                      onChange={(e) => setCourseSearchQuery(e.target.value)}
                      className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-800 font-semibold placeholder-zinc-400 focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 shadow-xs"
                    />
                    <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-3" />
                  </div>
                </div>

                {/* Dynamic Course List Checkboxes */}
                <div className="flex-1 flex flex-col min-h-[220px]">
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelCls}>
                      Select Courses ({selectedCoursesToAssign.length} selected / {filteredSubjects.length} available)
                    </label>
                    {filteredSubjects.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedCoursesToAssign.length === filteredSubjects.length) {
                            setSelectedCoursesToAssign([]);
                          } else {
                            setSelectedCoursesToAssign(filteredSubjects.map(s => s.code));
                          }
                        }}
                        className="text-[11px] font-bold text-[#120c7a] hover:underline cursor-pointer"
                      >
                        {selectedCoursesToAssign.length === filteredSubjects.length ? "Clear All" : "Select All"}
                      </button>
                    )}
                  </div>

                  {loadingSubjects ? (
                    <div className="py-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-[#120c7a]" />
                      <span className="text-xs font-bold">Loading real subjects from Firestore...</span>
                    </div>
                  ) : filteredSubjects.length === 0 ? (
                    <div className="py-12 text-center border border-zinc-200 rounded-2xl bg-zinc-50 text-zinc-500">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                      <p className="font-extrabold text-zinc-800 text-xs">No Matching Subjects Found</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Try changing Programme, Semester or Search query.</p>
                    </div>
                  ) : (
                    <div className="min-h-[360px] max-h-[540px] overflow-y-auto space-y-2.5 p-2 bg-zinc-50 border border-zinc-200 rounded-2xl flex-1">
                      {filteredSubjects.map(subj => {
                        const isSelected = selectedCoursesToAssign.includes(subj.code);
                        const assignedPId = coursePatternMap[subj.code];
                        const assignedP = patterns.find(p => p.id === assignedPId);

                        return (
                          <label
                            key={subj.code}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border text-xs cursor-pointer transition-all gap-3 ${
                              isSelected 
                                ? "bg-blue-50/80 border-[#120c7a] text-zinc-900 shadow-xs" 
                                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100/80"
                            }`}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCoursesToAssign([...selectedCoursesToAssign, subj.code]);
                                  } else {
                                    setSelectedCoursesToAssign(selectedCoursesToAssign.filter(c => c !== subj.code));
                                  }
                                }}
                                className="mt-1 rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a] shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className="font-mono font-black text-[#120c7a] text-xs px-2 py-0.5 rounded bg-blue-100/70 border border-blue-200/80">
                                    {subj.code}
                                  </span>

                                  {subj.isCommon ? (
                                    <span className="text-[10px] font-black text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                                      {subj.deptDisplay}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-extrabold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md">
                                      {subj.department}
                                    </span>
                                  )}

                                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                    Sem {subj.semester}
                                  </span>
                                </div>

                                <div className="text-zinc-900 font-bold text-xs leading-snug break-words mt-1">
                                  {subj.title}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 self-start sm:self-center">
                              {assignedP ? (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-100/90 text-emerald-800 border border-emerald-300 whitespace-nowrap shadow-2xs inline-block">
                                  ✓ {assignedP.title.split("(")[0].trim()}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300/80 whitespace-nowrap inline-block">
                                  No Pattern Mapped
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAssignPatternToSelectedCourses}
                  disabled={assigningPatternToCourses || selectedCoursesToAssign.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50 mt-4"
                >
                  {assigningPatternToCourses ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Mapping Pattern to Courses...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Assign Selected Pattern to {selectedCoursesToAssign.length} Course(s)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SETTER SUBJECT ASSIGNMENT & ORDER COPY LINK GENERATION */}
        {/* ========================================================================= */}
        {activeTab === "assignment" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assignment Configuration Form */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5 pb-3 border-b border-zinc-100">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#120c7a]">
                  <LinkIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#120c7a]">Subject Setter Assignment & Link Generator</h2>
                  <p className="text-[11px] font-semibold text-zinc-500">Assign external setter and generate secure access order link</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Programme, Batch, Semester Filters */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Programme</label>
                    <select
                      value={selectedProgramme}
                      onChange={(e) => setSelectedProgramme(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">All Programmes</option>
                      {programmes.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>Batch Year</label>
                    <select
                      value={assignBatch}
                      onChange={(e) => setAssignBatch(e.target.value)}
                      className={inputCls}
                    >
                      {availableBatches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block">Regulation</label>
                      <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Auto-Selected
                      </span>
                    </div>
                    <input
                      type="text"
                      value={autoRegulation ? `R-${autoRegulation.replace(/^AU\s*-\s*/i, '')}` : "R-2021"}
                      disabled
                      className={`${inputCls} bg-zinc-100 text-zinc-500 font-extrabold cursor-not-allowed border-zinc-300`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Semester</label>
                    <select
                      value={assignSemester}
                      onChange={(e) => setAssignSemester(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">All Semesters</option>
                      {Array.from({ length: 8 }, (_, i) => String(i + 1)).map(sem => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Course Selection with Search (Pattern-Mapped Subjects Only) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls}>
                      Select Subject / Course <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-extrabold text-[#120c7a] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Pattern Mapped Subjects Only
                    </span>
                  </div>
                  <select
                    value={assSubjectCode}
                    onChange={(e) => setAssSubjectCode(e.target.value)}
                    className={inputCls}
                  >
                    {mappedSubjectsForTab3.length === 0 ? (
                      <option value="">-- No Pattern-Mapped Subjects Available for Selected Filter --</option>
                    ) : (
                      <>
                        <option value="">-- Choose Mapped Subject ({mappedSubjectsForTab3.length} available) --</option>
                        {mappedSubjectsForTab3.map(s => (
                          <option key={s.code} value={s.code}>
                            {s.code} - {s.title} ({s.deptDisplay} | Sem {s.semester})
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  {mappedSubjectsForTab3.length === 0 && (
                    <div className="mt-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="font-semibold text-[11px]">
                          No subjects have an ESE Pattern mapped yet for this filter. Map patterns under 'Question Paper Patterns' tab first.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("patterns")}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-all shrink-0 ml-2 cursor-pointer shadow-xs"
                      >
                        Assign Pattern Now
                      </button>
                    </div>
                  )}
                </div>

                {/* Pattern Check Status Banner */}
                {assSubjectCode && (
                  <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between ${
                    currentSubjectPatternObj
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}>
                    <div className="flex items-center gap-2">
                      {currentSubjectPatternObj ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                      <div>
                        {currentSubjectPatternObj ? (
                          <>
                            <span className="font-extrabold text-emerald-900">Pattern Mapped: </span>
                            <span>{currentSubjectPatternObj.title} ({currentSubjectPatternObj.totalMarks} Marks)</span>
                          </>
                        ) : (
                          <>
                            <span className="font-extrabold text-rose-900">No ESE Pattern Mapped! </span>
                            <span>Assign a pattern under 'Question Patterns' tab first.</span>
                          </>
                        )}
                      </div>
                    </div>

                    {currentSubjectPatternObj ? (
                      <button
                        type="button"
                        onClick={() => setViewPatternDetailsModal(currentSubjectPatternObj)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shrink-0 ml-2 cursor-pointer inline-flex items-center gap-1 shadow-xs"
                      >
                        <Eye className="h-3 w-3" />
                        <span>View Details</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTab("patterns")}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all shrink-0 ml-2 cursor-pointer"
                      >
                        Assign Now
                      </button>
                    )}
                  </div>
                )}

                {/* External Setter Picker */}
                <div>
                  <label className={labelCls}>
                    Assign External Question Paper Setter <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={assSetterId}
                    onChange={(e) => setAssSetterId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Choose Active External Setter --</option>
                    {setters.filter(s => s.status === "active").map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.collegeName}) - {s.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Appointment / Order Copy File Upload (<= 30KB) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls}>
                      Upload Appointment / Order Copy <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] font-extrabold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Strict Max Size: 30 KB
                    </span>
                  </div>

                  <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-4 bg-zinc-50 text-center hover:border-[#120c7a] transition-all">
                    <input
                      type="file"
                      id="order-copy-upload"
                      accept="image/*,application/pdf"
                      onChange={handleOrderFileChange}
                      className="hidden"
                    />
                    <label htmlFor="order-copy-upload" className="cursor-pointer flex flex-col items-center justify-center gap-1.5">
                      <Upload className="h-6 w-6 text-[#120c7a]" />
                      <span className="text-xs font-bold text-zinc-800">
                        {orderFile ? orderFile.name : "Click to upload Order Copy (Image/PDF)"}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-500">
                        {orderFileSizeKb > 0 ? `Selected size: ${orderFileSizeKb} KB` : "File must be under 30 KB"}
                      </span>
                    </label>
                  </div>

                  {orderSizeError && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {orderSizeError}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAssignmentLink}
                  disabled={uploadingOrder}
                  className="w-full bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                >
                  {uploadingOrder ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Uploading & Generating Link...</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-4 w-4" />
                      <span>Generate External Setter Order & Access Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Link Generation Output Card */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-zinc-100">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                    <ExternalLink className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[#120c7a]">Generated Setter Access Link & Credentials</h2>
                    <p className="text-[11px] font-semibold text-zinc-500">Copy and dispatch access details to faculty</p>
                  </div>
                </div>

                {generatedAssignment ? (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <span>Link generated successfully! Share the credentials and URL below with the setter.</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3 text-xs font-semibold text-zinc-800">
                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-black tracking-wider">Assigned Subject</span>
                        <span className="font-black text-[#120c7a] text-sm">{generatedAssignment.subjectCode} - {generatedAssignment.subjectTitle}</span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-black tracking-wider">Setter Name & College</span>
                        <span className="font-bold text-zinc-900">{generatedAssignment.setterName} ({generatedAssignment.setterCollege})</span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-black tracking-wider">Setter Login Email</span>
                        <span className="font-mono text-emerald-700 font-bold">{generatedAssignment.setterEmail}</span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-black tracking-wider">Login Password</span>
                        <span className="font-mono text-indigo-900 font-bold">{generatedAssignment.setterPassword || "••••••••"}</span>
                      </div>

                      {/* Public Production URL (For Live Sharing) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-500 text-[10px] uppercase font-black tracking-wider">
                            Public Production Access URL (For External Experts)
                          </span>
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Live Domain
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-zinc-300 font-mono text-[#120c7a] font-bold text-xs break-all select-all flex items-center justify-between gap-2 shadow-2xs">
                          <span className="truncate">
                            https://zonesynapse-ckcet-obe.pages.dev/coe-setter-login?assignmentId={generatedAssignment.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const pubUrl = `https://zonesynapse-ckcet-obe.pages.dev/coe-setter-login?assignmentId=${generatedAssignment.id}`;
                              navigator.clipboard.writeText(pubUrl);
                              alert("Public Production Link copied to clipboard!");
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#120c7a] text-[10px] font-black rounded-lg border border-blue-200 shrink-0 cursor-pointer transition-all"
                          >
                            Copy Public Link
                          </button>
                        </div>
                      </div>

                      {/* Localhost Access URL (For Dev Testing) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-500 text-[10px] uppercase font-black tracking-wider">
                            Localhost Access URL (For Local Testing)
                          </span>
                          <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Local Dev Test
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-zinc-300 font-mono text-amber-900 font-bold text-xs break-all select-all flex items-center justify-between gap-2 shadow-2xs">
                          <span className="truncate">
                            {window.location.origin}/coe-setter-login?assignmentId={generatedAssignment.id}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={`${window.location.origin}/coe-setter-login?assignmentId=${generatedAssignment.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[10px] font-black rounded-lg border border-amber-300 cursor-pointer inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3 text-amber-700" /> Open Local
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const locUrl = `${window.location.origin}/coe-setter-login?assignmentId=${generatedAssignment.id}`;
                                navigator.clipboard.writeText(locUrl);
                                alert("Localhost Testing Link copied to clipboard!");
                              }}
                              className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-black rounded-lg border border-zinc-300 cursor-pointer"
                            >
                              Copy Local
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                        <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-xs">
                          <Mail className="h-4 w-4 text-indigo-700" />
                          <span>Official Email Invitation Draft</span>
                        </div>
                        <span className="text-[10px] font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-300">
                          Ready to Dispatch
                        </span>
                      </div>

                      {/* Email Subject Line */}
                      <div className="bg-white p-2.5 rounded-xl border border-indigo-100 text-xs">
                        <span className="text-zinc-400 text-[10px] uppercase font-black tracking-wider block mb-0.5">Subject:</span>
                        <span className="font-bold text-zinc-900">
                          Appointment Order & Access Link for ESE Question Paper Framing - {generatedAssignment.subjectCode} ({generatedAssignment.subjectTitle})
                        </span>
                      </div>

                      {/* Email Body Preview */}
                      <div className="bg-white p-3 rounded-xl border border-indigo-100 text-[11px] text-zinc-800 font-mono leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-all">
{`Dear Prof. ${generatedAssignment.setterName},

Greetings from C.K. College of Engineering & Technology (Autonomous)!

We are pleased to appoint you as the External Question Paper Setter for the upcoming End Semester Examination (ESE).

📌 ASSIGNMENT DETAILS:
• Subject Code & Name: ${generatedAssignment.subjectCode} - ${generatedAssignment.subjectTitle}
• Institution: ${generatedAssignment.setterCollege || "External Institution"}

🔐 ACCESS PORTAL & CREDENTIALS:
• Access Link: https://zonesynapse-ckcet-obe.pages.dev/coe-setter-login?assignmentId=${generatedAssignment.id}
• User ID / Email: ${generatedAssignment.setterEmail}
• Security Access Key: ${generatedAssignment.setterPassword || "••••••••"}

📋 NEXT STEPS:
1. Click the Access Link above to log in to the COE External Setter Workbench.
2. View and download your Appointment / Subject Order Copy.
3. Complete and submit the Acceptance / Remuneration Form online.
4. Frame and upload the Question Paper adhering to the COE ESE Guidelines & Blooms Taxonomy.

For any technical assistance, please reply to this email or contact the Office of the Controller of Examinations.

Warm Regards,
Office of the Controller of Examinations (COE)
C.K. College of Engineering & Technology, Cuddalore
Website: https://zonesynapse-ckcet-obe.pages.dev`}
                      </div>

                      {/* Email Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const emailText = `Subject: Appointment Order & Access Link for ESE Question Paper Framing - ${generatedAssignment.subjectCode} (${generatedAssignment.subjectTitle})\n\nDear Prof. ${generatedAssignment.setterName},\n\nGreetings from C.K. College of Engineering & Technology (Autonomous)!\n\nWe are pleased to appoint you as the External Question Paper Setter for the upcoming End Semester Examination (ESE).\n\n📌 ASSIGNMENT DETAILS:\n• Subject Code & Name: ${generatedAssignment.subjectCode} - ${generatedAssignment.subjectTitle}\n• Institution: ${generatedAssignment.setterCollege || "External Institution"}\n\n🔐 ACCESS PORTAL & CREDENTIALS:\n• Access Link: https://zonesynapse-ckcet-obe.pages.dev/coe-setter-login?assignmentId=${generatedAssignment.id}\n• User ID / Email: ${generatedAssignment.setterEmail}\n• Security Access Key: ${generatedAssignment.setterPassword || "••••••••"}\n\n📋 NEXT STEPS:\n1. Click the Access Link above to log in to the COE External Setter Workbench.\n2. View and download your Appointment / Subject Order Copy.\n3. Complete and submit the Acceptance / Remuneration Form online.\n4. Frame and upload the Question Paper adhering to the COE ESE Guidelines & Blooms Taxonomy.\n\nWarm Regards,\nOffice of the Controller of Examinations (COE)\nC.K. College of Engineering & Technology, Cuddalore`;
                            navigator.clipboard.writeText(emailText);
                            alert("Official Email Draft copied to clipboard!");
                          }}
                          className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Email Draft</span>
                        </button>

                        <a
                          href={`mailto:${generatedAssignment.setterEmail}?subject=${encodeURIComponent(`Appointment Order & Access Link for ESE Question Paper Framing - ${generatedAssignment.subjectCode} (${generatedAssignment.subjectTitle})`)}&body=${encodeURIComponent(`Dear Prof. ${generatedAssignment.setterName},\n\nGreetings from C.K. College of Engineering & Technology (Autonomous)!\n\nWe are pleased to appoint you as the External Question Paper Setter for the upcoming End Semester Examination (ESE).\n\n📌 ASSIGNMENT DETAILS:\n• Subject Code & Name: ${generatedAssignment.subjectCode} - ${generatedAssignment.subjectTitle}\n• Institution: ${generatedAssignment.setterCollege || "External Institution"}\n\n🔐 ACCESS PORTAL & CREDENTIALS:\n• Access Link: https://zonesynapse-ckcet-obe.pages.dev/coe-setter-login?assignmentId=${generatedAssignment.id}\n• User ID / Email: ${generatedAssignment.setterEmail}\n• Security Access Key: ${generatedAssignment.setterPassword || "••••••••"}\n\n📋 NEXT STEPS:\n1. Click the Access Link above to log in to the COE External Setter Workbench.\n2. View and download your Appointment / Subject Order Copy.\n3. Complete and submit the Acceptance / Remuneration Form online.\n4. Frame and upload the Question Paper adhering to the COE ESE Guidelines & Blooms Taxonomy.\n\nWarm Regards,\nOffice of the Controller of Examinations (COE)\nC.K. College of Engineering & Technology, Cuddalore`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all text-center inline-flex items-center justify-center"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span>Send Email (Mailto)</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
                    <LinkIcon className="h-12 w-12 text-zinc-300" />
                    <div>
                      <p className="font-extrabold text-zinc-700 text-sm">No Link Generated Yet</p>
                      <p className="text-xs font-semibold text-zinc-400 mt-1 max-w-xs mx-auto">
                        Fill in details on the left, upload appointment order (max 30 KB), and click "Generate Link".
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SUBMITTED QUESTION PAPERS REVIEW */}
        {/* ========================================================================= */}
        {activeTab === "submitted" && (
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100">
              <div>
                <h2 className="text-base font-black text-[#120c7a] flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-indigo-600" />
                  Submitted ESE Question Papers
                </h2>
                <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                  Review external setter acceptance status, signatures, order copy, and submitted question papers.
                </p>
              </div>
            </div>

            {loadingAssignments ? (
              <div className="py-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-[#120c7a]" />
                <span className="text-xs font-bold">Loading assignments & submitted papers...</span>
              </div>
            ) : assignments.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-zinc-200 rounded-2xl p-6 text-zinc-500">
                <FileCheck className="h-10 w-10 mx-auto mb-2 text-zinc-400" />
                <p className="font-extrabold text-zinc-800 text-sm">No Assignments Recorded Yet</p>
                <p className="text-xs text-zinc-500 mt-1">Assign subjects to external setters under Tab 3 to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-600 uppercase tracking-wider font-black border-b border-zinc-200">
                      <th className="py-3.5 px-4">Subject & Batch</th>
                      <th className="py-3.5 px-4">External Setter</th>
                      <th className="py-3.5 px-4">Acceptance Status</th>
                      <th className="py-3.5 px-4">Paper Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {assignments.map((ass) => (
                      <tr key={ass.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-[#120c7a] text-xs">{ass.subjectCode}</div>
                          <div className="text-zinc-800 font-semibold text-xs">{ass.subjectTitle}</div>
                          <div className="text-zinc-400 text-[10px] font-bold">Batch: {ass.batch} | R-{ass.regulation}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-zinc-900">{ass.setterName}</div>
                          <div className="text-zinc-500 text-[11px] font-medium">{ass.setterCollege}</div>
                          <div className="text-zinc-400 text-[10px] font-mono">{ass.setterEmail}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          {ass.acceptanceStatus === "Interested" ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Interested & Signed
                            </span>
                          ) : ass.acceptanceStatus === "Not Interested" ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5 text-rose-600" />
                              Not Interested
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                              <RefreshCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                              Pending Acceptance
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {ass.status === "submitted" ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 text-[#120c7a] border border-blue-200 inline-flex items-center gap-1">
                              <FileCheck className="h-3.5 w-3.5 text-[#120c7a]" />
                              Moved to COE
                            </span>
                          ) : (
                            <span className="text-zinc-400 font-bold text-xs">In Progress</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const pubUrl = formatPublicAccessLink(ass.accessLink, ass.id);
                                navigator.clipboard.writeText(pubUrl);
                                alert(`Public Access Link copied to clipboard:\n${pubUrl}`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#120c7a] border border-blue-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all"
                              title="Copy Public Access Link for External Setter"
                            >
                              <Copy className="h-3.5 w-3.5" /> Link
                            </button>

                            {ass.orderCopyUrl && (
                              <a
                                href={ass.orderCopyUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Eye className="h-3.5 w-3.5" /> Order
                              </a>
                            )}

                            {ass.status === "submitted" && (
                              <button
                                onClick={() => setSelectedReviewAssignment(ass)}
                                className="px-3 py-1 rounded-lg bg-[#120c7a] hover:bg-[#0e0a60] text-white text-xs font-extrabold inline-flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" /> Review Paper
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: QUESTION SETTER GUIDELINES CONFIGURATION */}
        {/* ========================================================================= */}
        {activeTab === "guidelines" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Add New Guideline Form */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 h-fit space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-zinc-100">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#120c7a]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#120c7a]">Add New Guideline</h2>
                  <p className="text-xs text-zinc-500 font-semibold">
                    Define rules shown on External Setter Workbench
                  </p>
                </div>
              </div>

              {guidelineFeedback.message && (
                <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  guidelineFeedback.type === "success" 
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200" 
                    : "bg-rose-50 text-rose-900 border border-rose-200"
                }`}>
                  {guidelineFeedback.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  <span>{guidelineFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleAddGuideline} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-zinc-700 uppercase tracking-wider mb-1.5">
                    Guideline Category / Tag
                  </label>
                  <select
                    value={newGuidelineCategory}
                    onChange={(e) => setNewGuidelineCategory(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 font-bold focus:outline-none focus:border-[#120c7a]"
                  >
                    <option value="Mandatory">Mandatory</option>
                    <option value="CO Mapping">CO Mapping</option>
                    <option value="Format">Format & Marks</option>
                    <option value="Formatting">CKEditor / MathJax</option>
                    <option value="Confidential">Confidentiality</option>
                    <option value="General">General Rule</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-zinc-700 uppercase tracking-wider mb-1.5">
                    Guideline Description
                  </label>
                  <textarea
                    rows={4}
                    value={newGuidelineText}
                    onChange={(e) => setNewGuidelineText(e.target.value)}
                    placeholder="Enter clear instruction for external setters..."
                    className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 font-medium focus:outline-none focus:border-[#120c7a]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingGuideline}
                  className="w-full bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                >
                  {savingGuideline ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                  ) : (
                    <Plus className="h-4 w-4 text-amber-300" />
                  )}
                  <span>Save Guideline</span>
                </button>
              </form>

              <div className="pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={handleSeedDefaultGuidelines}
                  disabled={savingGuideline}
                  className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>Load Standard ESE Guidelines</span>
                </button>
              </div>
            </div>

            {/* Right Column: Active Guidelines List */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div>
                  <h2 className="text-base font-black text-[#120c7a]">Configured Question Setting Guidelines</h2>
                  <p className="text-xs text-zinc-500 font-semibold mt-0.5">
                    These rules are displayed live at the top of the External Setter Workbench editor.
                  </p>
                </div>
                <span className="text-xs font-mono bg-blue-50 text-[#120c7a] border border-blue-200 px-3 py-1 rounded-xl font-extrabold">
                  {guidelines.length} Active Rules
                </span>
              </div>

              {loadingGuidelines ? (
                <div className="py-12 text-center text-zinc-400 text-xs font-semibold">
                  Loading guidelines configuration...
                </div>
              ) : guidelines.length === 0 ? (
                <div className="py-12 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 p-8 space-y-3">
                  <BookOpen className="h-10 w-10 text-zinc-300 mx-auto" />
                  <h3 className="font-bold text-zinc-700 text-sm">No Custom Guidelines Configured</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Click &quot;Load Standard ESE Guidelines&quot; on the left to populate standard rules or add custom ones above.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {guidelines.map((g, idx) => (
                    <div key={g.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-start justify-between gap-4 transition-all hover:bg-white hover:shadow-xs">
                      <div className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-[#120c7a] text-white flex items-center justify-center font-black text-[11px] shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="space-y-1">
                          {g.category && (
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 bg-blue-100 px-2 py-0.5 rounded-md inline-block">
                              {g.category}
                            </span>
                          )}
                          <p className="text-xs font-medium text-zinc-800 leading-relaxed font-serif">
                            {g.text}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteGuideline(g.id)}
                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all shrink-0"
                        title="Delete Guideline"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review Submitted Paper Modal */}
        {selectedReviewAssignment && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
              <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50 rounded-t-3xl">
                <div>
                  <h3 className="font-extrabold text-[#120c7a] text-base">
                    Submitted ESE Question Paper - {selectedReviewAssignment.subjectCode}
                  </h3>
                  <p className="text-xs font-semibold text-zinc-500">
                    Set by {selectedReviewAssignment.setterName} ({selectedReviewAssignment.setterCollege})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReviewAssignment(null)}
                  className="p-1.5 rounded-xl bg-zinc-200 text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-800">
                {/* Acceptance Details */}
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-black">Acceptance Status</span>
                    <span className="font-extrabold text-emerald-700 text-sm">Accepted ("Interested")</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-black">Uploaded Signature</span>
                    {selectedReviewAssignment.signatureUrl ? (
                      <img
                        src={selectedReviewAssignment.signatureUrl}
                        alt="Setter Signature"
                        className="h-12 object-contain bg-white rounded-lg p-1 mt-1 border border-zinc-200"
                      />
                    ) : (
                      <span className="text-zinc-400">No signature image uploaded</span>
                    )}
                  </div>
                </div>

                {/* Remuneration Claim Bill Details */}
                {selectedReviewAssignment.claimBillData && (
                  <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs space-y-2">
                    <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                      <span className="font-extrabold text-[#120c7a] uppercase text-[11px] flex items-center gap-1.5">
                        <Landmark className="h-4 w-4 text-amber-700" /> Question Paper Setter Claim Bill & Bank Details
                      </span>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-md">
                        Submitted: {selectedReviewAssignment.claimBillData.submissionDate || "—"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-semibold pt-1">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Account Holder</span>
                        <span className="font-extrabold text-zinc-900">{selectedReviewAssignment.claimBillData.accHolderName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Bank Name</span>
                        <span className="font-bold text-zinc-900">{selectedReviewAssignment.claimBillData.bankName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Branch Name</span>
                        <span className="font-bold text-zinc-900">{selectedReviewAssignment.claimBillData.branchName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Account Number</span>
                        <span className="font-mono font-extrabold text-emerald-800 text-sm tracking-wider">{selectedReviewAssignment.claimBillData.accountNumber || "—"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">IFSC Code</span>
                        <span className="font-mono font-extrabold text-indigo-900 text-sm tracking-wider">{selectedReviewAssignment.claimBillData.ifscCode || "—"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Account Type</span>
                        <span className="font-bold text-zinc-900">{selectedReviewAssignment.claimBillData.accountType || "Savings (SB)"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submitted Questions Content */}
                {selectedReviewAssignment.submittedPaper ? (
                  <div className="p-6 rounded-2xl bg-white text-zinc-900 border border-zinc-200 shadow-sm font-serif space-y-6">
                    <div className="text-center border-b pb-4">
                      <h2 className="font-extrabold text-lg uppercase tracking-wide">End Semester Examination</h2>
                      <h3 className="font-bold text-base">{selectedReviewAssignment.subjectCode} - {selectedReviewAssignment.subjectTitle}</h3>
                      <div className="flex justify-between text-xs mt-2 font-sans font-medium text-zinc-600">
                        <span>Regulation: {selectedReviewAssignment.regulation}</span>
                        <span>Duration: 3 Hours</span>
                        <span>Max Marks: 100</span>
                      </div>
                    </div>

                    {selectedReviewAssignment.submittedPaper.sections?.map((sec) => (
                      <div key={sec.id} className="space-y-3">
                        <h4 className="font-bold border-b pb-1 text-sm font-sans uppercase text-zinc-900">
                          {sec.name} ({sec.instructions})
                        </h4>

                        <div className="space-y-3 text-sm">
                          {sec.questions?.map((q, qIdx) => (
                            <div key={qIdx} className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <span className="font-bold mr-2">{qIdx + 1}.</span>
                                <span>{q.text}</span>
                                {q.optionB && (
                                  <div className="mt-1.5 pl-6 text-xs text-zinc-700 italic">
                                    <span className="font-bold font-sans not-italic block my-1">OR</span>
                                    <span>(b) {q.optionB}</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-right text-xs font-sans text-zinc-600 shrink-0">
                                [{q.marks || 2} Marks]
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-zinc-500">
                    No structured paper data found for this assignment.
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-zinc-100 bg-zinc-50 rounded-b-3xl flex justify-end">
                <button
                  onClick={() => setSelectedReviewAssignment(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold text-xs cursor-pointer shadow-sm"
                >
                  Close Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PATTERN DETAILS & MAPPED SUBJECTS MODAL */}
        {viewPatternDetailsModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-5xl lg:max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
              
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-950 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-white">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-200 block">
                      ESE Question Paper Pattern Details
                    </span>
                    <h2 className="text-lg md:text-xl font-black text-white">
                      {viewPatternDetailsModal.title}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditPattern(viewPatternDetailsModal)}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Pattern</span>
                  </button>

                  <button
                    onClick={() => setViewPatternDetailsModal(null)}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-zinc-50/50">
                
                {/* Key Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 text-center shadow-xs">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Total Marks</span>
                    <span className="text-lg font-black text-emerald-700">{viewPatternDetailsModal.totalMarks} Marks</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 text-center shadow-xs">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Duration</span>
                    <span className="text-lg font-black text-zinc-800">{viewPatternDetailsModal.duration || "3 Hours"}</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 text-center shadow-xs">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Sections / Parts</span>
                    <span className="text-lg font-black text-[#120c7a]">{viewPatternDetailsModal.sections?.length || 0} Parts</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 text-center shadow-xs">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Mapped Courses</span>
                    <span className="text-lg font-black text-purple-700">{mappedSubjectsForPattern.length} Subjects</span>
                  </div>
                </div>

                {/* Section 1: Question Parts Breakdown */}
                <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#120c7a]" />
                      <h3 className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                        Pattern Question Sections ({viewPatternDetailsModal.sections?.length || 0} Parts)
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-zinc-500">Full question structure breakdown</span>
                  </div>

                  <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-blue-50/50 text-[#120c7a] font-black uppercase text-[10px] tracking-wider border-b border-zinc-200">
                          <th className="py-3.5 px-4 whitespace-nowrap">Part / Section</th>
                          <th className="py-3.5 px-4 text-center whitespace-nowrap">No. of Qs</th>
                          <th className="py-3.5 px-4 text-center whitespace-nowrap">Marks / Q</th>
                          <th className="py-3.5 px-4 text-center whitespace-nowrap">Choice Type</th>
                          <th className="py-3.5 px-4 text-center whitespace-nowrap">Section Marks</th>
                          <th className="py-3.5 px-4 min-w-[220px]">Section Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-800">
                        {(viewPatternDetailsModal.sections || []).map((sec, idx) => {
                          const secMarks = (sec.count || 0) * (sec.marksPerQ || 0);
                          const choiceLabel = sec.choiceType === "either_or"
                            ? "Either-OR (Internal)"
                            : sec.choiceType === "any_n"
                            ? "Choice of N"
                            : "Compulsory";

                          return (
                            <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                              <td className="py-3.5 px-4 font-black text-[#120c7a] whitespace-nowrap">
                                {sec.name}
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold whitespace-nowrap">
                                {sec.count} Qs
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold whitespace-nowrap">
                                {sec.marksPerQ} Marks
                              </td>
                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                                  sec.choiceType === "either_or"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}>
                                  {choiceLabel}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center font-black text-emerald-700 whitespace-nowrap">
                                {secMarks} Marks
                              </td>
                              <td className="py-3.5 px-4 text-zinc-700 text-xs font-semibold leading-relaxed min-w-[220px]">
                                {sec.instructions || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: Assigned Subjects List */}
                <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#120c7a]" />
                      <h3 className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                        Assigned Courses / Subjects ({mappedSubjectsForPattern.length})
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-zinc-500">
                      Subjects mapped to this pattern
                    </span>
                  </div>

                  {mappedSubjectsForPattern.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-zinc-200 rounded-2xl p-6 text-zinc-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                      <p className="font-extrabold text-zinc-800 text-xs">No Subjects Assigned Yet</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Use the "Assign Pattern to Multiple Courses" section in the Question Patterns tab to map subjects to this pattern.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-blue-50/50 text-[#120c7a] font-black uppercase text-[10px] tracking-wider border-b border-zinc-200">
                            <th className="py-3.5 px-4 whitespace-nowrap">Course Code</th>
                            <th className="py-3.5 px-4 min-w-[180px]">Course Title</th>
                            <th className="py-3.5 px-4 whitespace-nowrap">Department</th>
                            <th className="py-3.5 px-4 text-center whitespace-nowrap">Semester</th>
                            <th className="py-3.5 px-4 text-right whitespace-nowrap">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-800">
                          {mappedSubjectsForPattern.map((subj) => (
                            <tr key={subj.code} className="hover:bg-blue-50/20 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-black text-[#120c7a] whitespace-nowrap">
                                {subj.code}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-zinc-900 min-w-[180px]">
                                {subj.title}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {subj.isCommon ? (
                                  <span className="text-[10px] font-black text-purple-800 bg-purple-100 border border-purple-300 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shadow-2xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                                    {subj.deptDisplay}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-md whitespace-nowrap">
                                    {subj.department}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold text-indigo-700 whitespace-nowrap">
                                Sem {subj.semester}
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block shadow-2xs">
                                  ✓ Mapped
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-zinc-100 border-t border-zinc-200 flex items-center justify-between">
                <button
                  onClick={() => handleEditPattern(viewPatternDetailsModal)}
                  className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Pattern</span>
                </button>

                <button
                  onClick={() => setViewPatternDetailsModal(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold text-xs transition-all cursor-pointer shadow-md"
                >
                  Close Pattern Details
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
