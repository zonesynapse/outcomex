import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Calendar, Loader2, Save, Send, CheckCircle2, AlertTriangle, 
  ChevronRight, ClipboardList, Info, HelpCircle, Sparkles, Plus,
  Printer, Trash2, Eye, ShieldCheck, Clock, BookOpen, Layers
} from "lucide-react";
import Layout from "../components/Layout";
import { useBatches } from "../hooks/useBatches";
import { useRegulations } from "../hooks/useRegulations";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";

const cleanStr = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");

// Convert 24h string ("09:30" or "14:00") to 12h formatted string ("09:30 AM" or "02:00 PM")
const format12Hour = (time24) => {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const formattedH = String(h).padStart(2, '0');
  return `${formattedH}:${mStr || '00'} ${ampm}`;
};

// Derive FN (Forenoon) or AN (Afternoon) from start time hour (< 12 -> FN, >= 12 -> AN)
const deriveSlotFromTime = (startTimeStr) => {
  if (!startTimeStr) return '';
  const [hStr] = startTimeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return '';
  return h < 12 ? 'FN' : 'AN';
};

// Build complete display string e.g. "FN (09:30 AM - 12:30 PM)"
const buildTimeSlotString = (startTimeStr, endTimeStr) => {
  if (!startTimeStr) return '';
  const slot = deriveSlotFromTime(startTimeStr);
  const start12 = format12Hour(startTimeStr);
  const end12 = endTimeStr ? format12Hour(endTimeStr) : '';
  if (end12) {
    return `${slot} (${start12} - ${end12})`;
  }
  return `${slot} (${start12})`;
};

export default function IAScheduleCreation() {
  const navigate = useNavigate();
  const { getActiveBatches } = useBatches();
  const { getRegulationForBatch } = useRegulations();

  // --- Profile / Auth States ---
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  // --- Selection States ---
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");

  // --- Loaded Configuration & Calendar Data ---
  const [examEvents, setExamEvents] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState([]);
  const [holidayDates, setHolidayDates] = useState([]);
  const [syllabusSubjects, setSyllabusSubjects] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [customSubjects, setCustomSubjects] = useState([]);
  const [timetable, setTimetable] = useState({}); // maps subjectCode -> { date, timeSlot }
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Authenticate and read user department & role
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setCurrentUserData(data);
            setUserRole(data.role || "");
            setUserProgramme(data.programme || "");
            setUserDepartment(data.department || "");
          }
        } catch (err) {
          console.error("Error loading user profile info:", err);
        }
      }
      setLoadingUser(false);
    });
    return unsubscribeAuth;
  }, []);

  // 2. Fetch Academic Calendar events (Exams & Holidays) & CIA Configs
  useEffect(() => {
    const eventsRef = collection(db, "academic_calendar_events");
    const unsubEvents = onSnapshot(eventsRef, (snap) => {
      const exams = [];
      const hDays = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.type === "Exam") {
          exams.push({ id: d.id, ...data });
        } else if (data.type === "Holiday") {
          if (data.fromDate && data.toDate) {
            let cur = new Date(data.fromDate);
            const end = new Date(data.toDate);
            while (cur <= end) {
              hDays.push(cur.toISOString().split("T")[0]);
              cur.setDate(cur.getDate() + 1);
            }
          } else if (data.eventDate) {
            hDays.push(data.eventDate);
          }
        }
      });
      exams.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
      setExamEvents(exams);
      setHolidayDates(hDays);
    }, (err) => {
      console.error("Error loading academic calendar events:", err);
    });

    const unsubCia = onSnapshot(collection(db, "cia_configs"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setCiaConfigs(list);
    }, (err) => {
      console.error("Error loading cia_configs:", err);
    });

    return () => {
      unsubEvents();
      unsubCia();
    };
  }, []);

  // 3. Derived Academic Options
  const progKey = useMemo(() => formatProgrammeKey(userProgramme), [userProgramme]);
  const deptKey = useMemo(() => sanitizeKey(userDepartment), [userDepartment]);

  const batchOptions = useMemo(() => {
    if (!progKey) return [];
    return getActiveBatches(progKey);
  }, [progKey, getActiveBatches]);

  const academicYearOptions = useMemo(() => {
    return batch ? getAcademicYears(batch) : [];
  }, [batch]);

  const semesterOptions = useMemo(() => {
    if (!batch || !academicYear) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    return [String(yearIndex * 2 + 1), String(yearIndex * 2 + 2)];
  }, [batch, academicYear]);

  const regulation = useMemo(() => {
    if (batch && userProgramme) {
      return getRegulationForBatch(progKey, batch) || "";
    }
    return "";
  }, [batch, userProgramme, progKey, getRegulationForBatch]);

  // 4. Robust Syllabus Matching from Upload Page data for Selected Regulation & Semester
  // Filter out any subject tagged as Non-OBE (isNonOBE === true) in Upload page
  useEffect(() => {
    if (!semester || !userDepartment || !regulation) {
      setSyllabusSubjects([]);
      return;
    }

    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      let matchedSemList = null;
      const targetRegClean = cleanStr(regulation);
      const targetDeptClean = cleanStr(userDepartment);

      snap.forEach((docSnap) => {
        const docIdClean = cleanStr(docSnap.id);
        const data = docSnap.data() || {};
        const dataRegClean = cleanStr(data.regulation);
        const dataDeptClean = cleanStr(data.department);

        // 1. Match Regulation flexibly
        const isRegMatch = !targetRegClean || 
                            dataRegClean.includes(targetRegClean) ||
                            targetRegClean.includes(dataRegClean) ||
                            docIdClean.includes(targetRegClean) ||
                            (targetRegClean.includes("2021") && (dataRegClean.includes("2021") || docIdClean.includes("2021"))) ||
                            (targetRegClean.includes("2017") && (dataRegClean.includes("2017") || docIdClean.includes("2017")));

        // 2. Match Department flexibly
        const isDeptMatch = !targetDeptClean ||
                            dataDeptClean.includes(targetDeptClean) ||
                            targetDeptClean.includes(dataDeptClean) ||
                            docIdClean.includes(targetDeptClean) ||
                            (targetDeptClean.includes("computer") && (docIdClean.includes("cse") || dataDeptClean.includes("cse"))) ||
                            (targetDeptClean.includes("biomedical") && (docIdClean.includes("bm") || dataDeptClean.includes("bm"))) ||
                            (targetDeptClean.includes("cse") && (docIdClean.includes("computer") || dataDeptClean.includes("computer")));

        if (isRegMatch && isDeptMatch && data.semesters) {
          const semList = data.semesters[semester] || data.semesters[String(semester)] || data.semesters[Number(semester)];
          if (Array.isArray(semList) && semList.length > 0) {
            matchedSemList = semList;
          }
        }
      });

      if (matchedSemList) {
        const subjects = matchedSemList
          // Exclude null subjects, inactive subjects, and Non-OBE tagged subjects (isNonOBE === true)
          .filter((s) => s != null && s.code && s.isActive !== false && s.isNonOBE !== true)
          .map((s) => ({ code: s.code, name: s.name || s.code, source: "Syllabus" }));
        setSyllabusSubjects(subjects);
      } else {
        setSyllabusSubjects([]);
      }
    }, (err) => {
      console.error("Error matching syllabus_data from Upload page:", err);
      setSyllabusSubjects([]);
    });

    return unsub;
  }, [userDepartment, regulation, semester]);

  // Fetch allocated subjects from subject_assignments as fallback if syllabus data is not yet in Firestore
  useEffect(() => {
    if (!batch || !semester || !userDepartment) {
      setAssignedSubjects([]);
      return;
    }
    const cleanBatch = cleanStr(batch);
    const cleanSem = String(semester);

    const unsub = onSnapshot(collection(db, "subject_assignments"), (snap) => {
      const list = [];
      const seenCodes = new Set();

      snap.forEach((docSnap) => {
        const docIdClean = cleanStr(docSnap.id);
        const matchBatch = docIdClean.includes(cleanBatch) || docIdClean.includes(cleanBatch.slice(0, 4));
        const matchSem = docIdClean.endsWith(cleanSem) || docIdClean.includes(`_${cleanSem}_`) || docIdClean.includes(`_${cleanSem}`);

        if (!matchBatch || !matchSem) return;

        const data = docSnap.data() || {};
        Object.values(data).forEach((val) => {
          if (Array.isArray(val)) {
            val.forEach((code) => {
              if (typeof code === "string" && code.trim() && !seenCodes.has(code.trim())) {
                seenCodes.add(code.trim());
                list.push({ code: code.trim(), name: code.trim(), source: "Allocated" });
              }
            });
          } else if (typeof val === "object" && val !== null && val.isNonOBE !== true) {
            const code = val.code || val.subjectCode;
            if (code && !seenCodes.has(code)) {
              seenCodes.add(code);
              list.push({ code, name: val.name || val.subjectName || code, source: "Allocated" });
            }
          }
        });
      });

      setAssignedSubjects(list);
    }, (err) => {
      console.warn("Error listening to subject_assignments:", err);
      setAssignedSubjects([]);
    });

    return unsub;
  }, [batch, semester, userDepartment]);

  // Listen to saved exam schedules
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "exam_schedules"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setSavedSchedules(list);
    });
    return unsub;
  }, []);

  // Reset timetable state when selection dropdowns update
  useEffect(() => {
    setTimetable({});
    setCustomSubjects([]);
  }, [batch, academicYear, semester, selectedExamId]);

  // 5. Target Exam Event Filtering & Deduplication
  const filteredExamEvents = useMemo(() => {
    if (examEvents.length === 0) return [];

    const cBatch = cleanStr(batch);

    // Filter matching events
    const matching = examEvents.filter((ev) => {
      // 1. If event has explicit batch field, check if it matches current batch
      if (ev.batch) {
        const eb = cleanStr(ev.batch);
        if (cBatch && eb && !eb.includes(cBatch) && !cBatch.includes(eb)) return false;
      }
      if (ev.batches && Array.isArray(ev.batches) && ev.batches.length > 0) {
        const ebs = ev.batches.map(b => cleanStr(b));
        if (cBatch && !ebs.some(b => b.includes(cBatch) || cBatch.includes(b))) return false;
      }

      // 2. If CIA config linked, check if CIA batch matches
      if (ev.ciaId && ciaConfigs.length > 0) {
        const cia = ciaConfigs.find(c => c.id === ev.ciaId);
        if (cia && cia.batch) {
          const cb = cleanStr(cia.batch);
          if (cBatch && cb && !cb.includes(cBatch) && !cBatch.includes(cb)) return false;
        }
      }

      return true;
    });

    // Deduplicate events by title + date range so identical duplicate options are eliminated
    const uniqueMap = new Map();
    matching.forEach((ev) => {
      const key = `${cleanStr(ev.title)}_${ev.fromDate || ''}_${ev.toDate || ''}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, ev);
      }
    });

    return Array.from(uniqueMap.values());
  }, [examEvents, ciaConfigs, batch]);

  // Auto-select first target exam event if current selection is invalid
  useEffect(() => {
    if (filteredExamEvents.length > 0) {
      const exists = filteredExamEvents.some(e => e.id === selectedExamId);
      if (!exists) {
        setSelectedExamId(filteredExamEvents[0].id);
      }
    } else {
      setSelectedExamId("");
    }
  }, [filteredExamEvents, selectedExamId]);

  // Selected Exam Event object
  const selectedExam = useMemo(() => {
    return filteredExamEvents.find(e => e.id === selectedExamId) || null;
  }, [selectedExamId, filteredExamEvents]);

  const holidaySet = useMemo(() => new Set(holidayDates), [holidayDates]);

  // Working dates excluding Sundays and Academic Calendar holidays
  const availableDates = useMemo(() => {
    if (!selectedExam || !selectedExam.fromDate || !selectedExam.toDate) return [];
    const dates = [];
    const start = new Date(selectedExam.fromDate);
    const end = new Date(selectedExam.toDate);
    
    let count = 0;
    while (start <= end && count < 60) {
      const dStr = start.toISOString().split("T")[0];
      const isSunday = start.getDay() === 0;
      const isHoliday = holidaySet.has(dStr);

      if (!isSunday && !isHoliday) {
        dates.push(dStr);
      }
      start.setDate(start.getDate() + 1);
      count++;
    }
    return dates;
  }, [selectedExam, holidaySet]);

  // Strictly filtered subjects ONLY for the selected semester (excluding Non-OBE subjects)
  const effectiveSubjects = useMemo(() => {
    const map = new Map();

    // 1. From exact Syllabus document for this semester (uploaded via Upload page)
    syllabusSubjects.forEach(s => map.set(s.code, s));

    // 2. From exact Allocated Subjects for this semester (if syllabus doc is empty)
    if (map.size === 0) {
      assignedSubjects.forEach(s => {
        if (!map.has(s.code)) map.set(s.code, s);
      });
    }

    // 3. Custom User Added Subjects
    customSubjects.forEach(s => {
      map.set(s.code, { code: s.code, name: s.name, source: "Custom", isCustom: true });
    });

    return Array.from(map.values());
  }, [syllabusSubjects, assignedSubjects, customSubjects]);

  // 6. Auto-Generate Timetable logic
  const handleAutoGenerate = () => {
    if (effectiveSubjects.length === 0) {
      showToast("No subjects found for Semester " + semester + ". Click 'Add Custom Subject' to add subjects.", "error");
      return;
    }

    if (availableDates.length === 0) {
      showToast("No valid working days available in the selected exam period (check Academic Calendar for dates).", "error");
      return;
    }

    const newTable = {};
    effectiveSubjects.forEach((sub, idx) => {
      const dateIdx = idx % availableDates.length;
      const isSecondPass = Math.floor(idx / availableDates.length) >= 1;
      const startTime = isSecondPass ? "14:00" : "10:00";
      const endTime = isSecondPass ? "17:00" : "13:00";
      const timeSlot = buildTimeSlotString(startTime, endTime);

      newTable[sub.code] = {
        date: availableDates[dateIdx],
        startTime,
        endTime,
        slot: isSecondPass ? "AN" : "FN",
        timeSlot
      };
    });

    setTimetable(newTable);
    showToast(`Successfully auto-generated timetable for ${effectiveSubjects.length} subjects!`, "success");
  };

  const handleAddCustomSubject = () => {
    const code = prompt("Enter Subject Code (e.g. CS3551):");
    if (!code || !code.trim()) return;
    const name = prompt("Enter Subject Name (e.g. Cloud Computing Lab):") || code;
    const cleanCode = code.trim().toUpperCase();

    setCustomSubjects(prev => {
      if (prev.some(s => s.code === cleanCode)) return prev;
      return [...prev, { code: cleanCode, name: name.trim(), isCustom: true }];
    });
    showToast(`Added custom subject: ${cleanCode}`, "success");
  };

  const handleRemoveCustomSubject = (code) => {
    setCustomSubjects(prev => prev.filter(s => s.code !== code));
    setTimetable(prev => {
      const copy = { ...prev };
      delete copy[code];
      return copy;
    });
  };

  const handleUpdateRow = (subjectCode, field, val) => {
    setTimetable(prev => {
      const current = prev[subjectCode] || { date: "", startTime: "", endTime: "", timeSlot: "" };
      const updated = { ...current, [field]: val };
      if (field === 'startTime' || field === 'endTime') {
        const start = field === 'startTime' ? val : current.startTime;
        const end = field === 'endTime' ? val : current.endTime;
        updated.slot = deriveSlotFromTime(start);
        updated.timeSlot = buildTimeSlotString(start, end);
      }
      return {
        ...prev,
        [subjectCode]: updated
      };
    });
  };

  const handleForwardToHOD = async () => {
    if (!userProgramme || !userDepartment || !batch || !academicYear || !semester || !selectedExam) {
      showToast("Please select Programme, Department, Batch, Academic Year, Semester, and Target Exam Event.", "error");
      return;
    }

    if (effectiveSubjects.length === 0) {
      showToast("No subjects available for Semester " + semester, "error");
      return;
    }

    const scheduledSubjects = Object.keys(timetable).filter(
      (code) => timetable[code]?.date && (timetable[code]?.timeSlot || timetable[code]?.startTime)
    );

    if (scheduledSubjects.length === 0) {
      showToast("Please select date and set start/end times for at least one subject.", "error");
      return;
    }

    setSaving(true);
    try {
      const examNameSanitized = sanitizeKey(selectedExam.title);
      const compositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semester}_${examNameSanitized}`;
      
      const timetableList = effectiveSubjects
        .filter(sub => timetable[sub.code]?.date)
        .map(sub => ({
          subjectCode: sub.code,
          subjectName: sub.name,
          date: timetable[sub.code].date,
          startTime: timetable[sub.code].startTime || "",
          endTime: timetable[sub.code].endTime || "",
          slot: timetable[sub.code].slot || deriveSlotFromTime(timetable[sub.code].startTime || ""),
          timeSlot: timetable[sub.code].timeSlot || buildTimeSlotString(timetable[sub.code].startTime || "", timetable[sub.code].endTime || "")
        }));

      const schedulePayload = {
        programme: userProgramme,
        department: userDepartment,
        batch,
        academicYear,
        semester,
        examName: selectedExam.title,
        status: userRole === "HOD" || userRole === "COE" || userRole === "Admin" ? "approved" : "pending_hod",
        submittedBy: auth.currentUser?.email || "Faculty",
        submittedAt: new Date().toISOString(),
        timetable: timetableList
      };

      await setDoc(doc(db, "exam_schedules", compositeKey), schedulePayload);
      showToast("Exam schedule successfully saved and submitted to HOD!", "success");
      setTimetable({});
      setTimeout(() => {
        navigate("/hod-dashboard");
      }, 800);
    } catch (err) {
      console.error("Failed to forward exam schedule:", err);
      showToast("Failed to save and forward exam schedule.", "error");
    }
    setSaving(false);
  };

  const handleApproveSchedule = async (scheduleId) => {
    try {
      await updateDoc(doc(db, "exam_schedules", scheduleId), {
        status: "approved",
        approvedBy: auth.currentUser?.email || "HOD",
        approvedAt: new Date().toISOString()
      });
      showToast("Exam schedule approved successfully!", "success");
    } catch (err) {
      console.error("Error approving schedule:", err);
      showToast("Failed to approve schedule.", "error");
    }
  };

  // Print/Export Timetable layout
  const handlePrintTimetable = () => {
    if (!selectedExam || effectiveSubjects.length === 0) {
      showToast("Select an exam event and configure timetable before printing.", "error");
      return;
    }

    const rows = effectiveSubjects
      .filter(s => timetable[s.code]?.date)
      .sort((a, b) => new Date(timetable[a.code].date) - new Date(timetable[b.code].date))
      .map((s, idx) => {
        const dObj = new Date(timetable[s.code].date);
        const dateStr = dObj.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
        const dayStr = dObj.toLocaleDateString("en-IN", { weekday: "long" });
        return `
          <tr>
            <td style="text-align:center">${idx + 1}</td>
            <td style="text-align:center">${dateStr} (${dayStr})</td>
            <td style="text-align:center">${timetable[s.code].timeSlot}</td>
            <td style="font-weight:bold;text-align:center">${s.code}</td>
            <td>${s.name}</td>
          </tr>
        `;
      }).join('');

    const generateHtml = (logoDataUrl) => {
      const logoImg = logoDataUrl || "";
      return `
      <!doctype html>
      <html>
      <head>
        <title>Exam Timetable - ${selectedExam.title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #120c7a; padding-bottom: 10px; margin-bottom: 15px; }
          .header img { max-width: 150mm; max-height: 25mm; object-fit: contain; }
          .header h2 { margin: 0; color: #120c7a; font-size: 18px; }
          .header p { margin: 3px 0; font-size: 12px; color: #444; }
          .meta { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 15px; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 8px; }
          th { background-color: #f0f4ff; color: #120c7a; font-weight: bold; }
          .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; }
          .sig-box { text-align: center; width: 40%; border-top: 1px dashed #333; padding-top: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoImg ? `<img src="${logoImg}" alt="College Logo" />` : ""}
          <p><strong>EXAMINATION TIMETABLE - ${selectedExam.title.toUpperCase()}</strong></p>
        </div>
        <div class="meta">
          <div><strong>Programme:</strong> ${userProgramme}</div>
          <div><strong>Department:</strong> ${userDepartment}</div>
          <div><strong>Batch:</strong> ${formatBatchDisplay(batch)}</div>
          <div><strong>Semester:</strong> ${semester} (${academicYear})</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 6%">Sl.No</th>
              <th style="width: 25%">Date & Day</th>
              <th style="width: 25%">Time Slot</th>
              <th style="width: 15%">Subject Code</th>
              <th>Subject Name</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="text-align:center">No scheduled subjects</td></tr>'}
          </tbody>
        </table>
        <div class="footer">
          <div class="sig-box">HOD / Department Coordinator</div>
          <div class="sig-box">Controller of Examinations / Principal</div>
        </div>
      </body>
      </html>
    `;
    };

    const openPrintWindow = (html) => {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { try { win.print(); } catch (e) {} }, 300);
      }
    };

    // Load logo as base64 for reliable rendering in the print window
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 600;
      const maxHeight = 120;
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        openPrintWindow(generateHtml(canvas.toDataURL("image/png")));
      } catch (e) {
        openPrintWindow(generateHtml(""));
      }
    };
    img.onerror = () => openPrintWindow(generateHtml(""));
    img.src = "/logo.png";
  };

  if (loadingUser) {
    return (
      <Layout title="Exam Schedule Creator">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-zinc-400">
          <Loader2 className="animate-spin text-indigo-700" size={32} />
          <span className="text-xs font-bold uppercase tracking-wider">Verifying user permissions...</span>
        </div>
      </Layout>
    );
  }

  const currentMatchSchedules = savedSchedules.filter(s => 
    s.department === userDepartment &&
    s.programme === userProgramme &&
    (!batch || s.batch === batch) &&
    (!semester || s.semester === semester)
  );

  return (
    <Layout title="Exam Schedule Creator">
      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg text-xs font-bold ${
            toast.type === "success" 
              ? "bg-emerald-50 border-emerald-300 text-emerald-800" 
              : "bg-red-50 border-red-300 text-red-800"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        
        {/* Dynamic Selectors Card */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 mb-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Calendar className="text-indigo-600" size={20} />
                Exam Timetable Generator
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Generate and schedule exam dates automatically using dates configured in the Academic Calendar.
              </p>
            </div>
            {regulation && (
              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-xs font-bold">
                Regulation {regulation}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-zinc-100">
            {/* Auto Selected Programme */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-zinc-400 uppercase tracking-wider">Programme</label>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 font-semibold text-zinc-700">
                {userProgramme ? formatProgDisplay(userProgramme) : "Not Configured"}
              </div>
            </div>
            {/* Auto Selected Department */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-zinc-400 uppercase tracking-wider">Department</label>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 font-semibold text-zinc-700">
                {userDepartment || "Not Configured"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Batch</label>
              <select
                value={batch}
                onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); setSelectedExamId(""); }}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white"
              >
                <option value="">Select Batch</option>
                {batchOptions.map((b) => (
                  <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Academic Year</label>
              <select
                value={academicYear}
                disabled={!batch}
                onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); setSelectedExamId(""); }}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">Select Academic Year</option>
                {academicYearOptions.map((ay) => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Semester</label>
              <select
                value={semester}
                disabled={!academicYear}
                onChange={(e) => { setSemester(e.target.value); setSelectedExamId(""); }}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">Select Semester</option>
                {semesterOptions.map((sem) => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>

            {/* Exam Dropdown filtered specifically by Batch / Semester */}
            <div className="space-y-1.5 sm:col-span-3 lg:col-span-1">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Target Exam Event</label>
              <select
                value={selectedExamId}
                disabled={filteredExamEvents.length === 0}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">
                  {filteredExamEvents.length === 0 ? "No Exams For Selected Batch" : "Select Exam Event"}
                </option>
                {filteredExamEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.fromDate} to {ev.toDate})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timetable Configuration Block */}
        {!selectedExam ? (
          <div className="bg-zinc-50 rounded-3xl border border-zinc-200 border-dashed p-10 text-center text-zinc-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30 text-indigo-700" />
            <p className="text-xs font-bold uppercase tracking-wider">Select filters and target exam event above to configure exam schedule.</p>
            {filteredExamEvents.length === 0 && (
              <p className="text-[11px] text-amber-600 font-semibold mt-2">
                * No exam events found for {batch ? formatBatchDisplay(batch) : "selected batch"} in Academic Calendar. Please configure Exam dates in Academic Calendar.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Control Bar: Auto Generate, Add Custom Subject, Print */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoGenerate}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Sparkles size={16} />
                  Auto Generate Timetable
                </button>

                <button
                  type="button"
                  onClick={handleAddCustomSubject}
                  className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  <Plus size={15} />
                  Add Custom Subject
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 font-medium">
                  Working Dates: <strong className="text-indigo-700">{availableDates.length} days</strong> (excl. Sundays & Holidays)
                </span>

                <button
                  type="button"
                  onClick={handlePrintTimetable}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  <Printer size={15} />
                  Print / Export
                </button>
              </div>
            </div>

            {effectiveSubjects.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center text-amber-800 text-xs font-medium flex items-center justify-center gap-2">
                <Info size={16} />
                <span>No subjects uploaded for Semester {semester} in Upload page ({regulation}). Click "Add Custom Subject" above to add subjects manually.</span>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={16} className="text-indigo-600" /> Timetable Layout for {selectedExam.title} (Semester {semester})
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                      Dates exclude Sundays and Holidays set in Academic Calendar ({selectedExam.fromDate} to {selectedExam.toDate}).
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-[#120c7a] uppercase tracking-wider w-fit">
                    {effectiveSubjects.length} Subjects Total
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                        <th className="p-4 w-12">#</th>
                        <th className="p-4">Subject Code & Name</th>
                        <th className="p-4 w-32">Source</th>
                        <th className="p-4 w-48">Exam Date</th>
                        <th className="p-4 min-w-[300px]">Exam Time & Slot (Clock Picker)</th>
                        <th className="p-4 w-16 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {effectiveSubjects.map((sub, idx) => {
                        const rowData = timetable[sub.code] || { date: "", startTime: "", endTime: "", slot: "", timeSlot: "" };
                        return (
                          <tr key={sub.code} className="hover:bg-zinc-50/30 transition-colors">
                            <td className="p-4 font-bold text-zinc-400">{idx + 1}</td>
                            <td className="p-4">
                              <span className="block font-bold text-slate-850">{sub.code}</span>
                              <span className="block text-[10px] text-zinc-400 font-medium mt-0.5">{sub.name}</span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold ${
                                sub.source === 'Syllabus' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                sub.source === 'Allocated' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {sub.source}
                              </span>
                            </td>
                            <td className="p-4">
                              <select
                                value={rowData.date}
                                onChange={(e) => handleUpdateRow(sub.code, "date", e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white"
                              >
                                <option value="">Select Date</option>
                                {availableDates.map(dateStr => (
                                  <option key={dateStr} value={dateStr}>
                                    {new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" })}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Start:</span>
                                  <input
                                    type="time"
                                    value={rowData.startTime || ""}
                                    onChange={(e) => handleUpdateRow(sub.code, "startTime", e.target.value)}
                                    className="rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white text-xs focus:border-indigo-600 focus:outline-none cursor-pointer"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">End:</span>
                                  <input
                                    type="time"
                                    value={rowData.endTime || ""}
                                    onChange={(e) => handleUpdateRow(sub.code, "endTime", e.target.value)}
                                    className="rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white text-xs focus:border-indigo-600 focus:outline-none cursor-pointer"
                                  />
                                </div>

                                {rowData.startTime ? (
                                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold shadow-xs ${
                                    deriveSlotFromTime(rowData.startTime) === 'FN'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                  }`}>
                                    {deriveSlotFromTime(rowData.startTime)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-400 italic">Select Time</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              {sub.isCustom ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCustomSubject(sub.code)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50"
                                  title="Remove custom subject"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Forward Row */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-500 font-medium">
                * Click <strong>Forward to HOD</strong> to submit schedule for approval.
              </span>

              <button
                onClick={handleForwardToHOD}
                disabled={saving || effectiveSubjects.length === 0}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-150 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving timetable...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    {userRole === "HOD" || userRole === "COE" || userRole === "Admin" ? "Save & Approve Timetable" : "Forward to HOD"}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Existing / Saved Exam Schedules History */}
        {currentMatchSchedules.length > 0 && (
          <div className="mt-12 bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" />
              Saved Exam Schedules History
            </h3>
            
            <div className="divide-y divide-zinc-100">
              {currentMatchSchedules.map((sch) => (
                <div key={sch.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-zinc-800">{sch.examName}</span>
                    <span className="text-zinc-400 ml-2">
                      ({sch.batch} | Sem {sch.semester} | {sch.academicYear})
                    </span>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Submitted by {sch.submittedBy} on {new Date(sch.submittedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                      sch.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {sch.status === 'approved' ? 'Approved' : 'Pending HOD Approval'}
                    </span>

                    {(userRole === "HOD" || userRole === "COE" || userRole === "Admin") && sch.status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => handleApproveSchedule(sch.id)}
                        className="inline-flex items-center gap-1 bg-emerald-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                      >
                        <ShieldCheck size={14} /> Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
