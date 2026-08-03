import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { 
  Calendar, Loader2, Save, Play, XCircle, Settings, Plus, Trash2, Edit2,
  Sparkles, CheckCircle2, AlertTriangle, Clock, ShieldAlert, X, Lock
} from "lucide-react";
import Layout from "../components/Layout";

const DEFAULT_CRITERIA = {
  part1: [
    { id: "p1_s1", sNo: 1, kra: "Pass Percentage", particulars: "Practicals/ Projects Handled", maxMarks: 5, type: "practical_pass", rules: [{ min: 95, max: 100, rating: 1, marks: 5 }, { min: 0, max: 94.99, rating: 0, marks: 0 }] },
    { id: "p1_s2", sNo: 2, kra: "Pass Percentage", particulars: "Theory Subjects Handled", maxMarks: 40, type: "theory_pass", rules: [{ min: 91, max: 100, rating: 5, marks: 40 }, { min: 81, max: 90.99, rating: 4, marks: 32 }, { min: 71, max: 80.99, rating: 3, marks: 24 }, { min: 61, max: 70.99, rating: 2, marks: 16 }, { min: 51, max: 60.99, rating: 1, marks: 8 }, { min: 0, max: 50.99, rating: 0, marks: 0 }] },
    { id: "p1_s3", sNo: 3, kra: "Students Feedback", particulars: "Based on the evaluation of feedback received from the students", maxMarks: 5, type: "student_feedback", rules: [{ min: 91, max: 100, rating: 5, marks: 5 }, { min: 81, max: 90.99, rating: 4, marks: 4 }, { min: 71, max: 80.99, rating: 3, marks: 3 }, { min: 61, max: 70.99, rating: 2, marks: 2 }, { min: 51, max: 60.99, rating: 1, marks: 1 }, { min: 0, max: 50.99, rating: 0, marks: 0 }] }
  ],
  part2: [
    { id: "p2_1a", sNo: "1a", kra: "Investing in Yourself", particulars: "Completion of Online Courses with its Outcome (Two course)", maxMarks: 5, type: "online_courses", targetCount: 2, marksPerUnit: 2.5 },
    { id: "p2_1b", sNo: "1b", kra: "Investing in Yourself", particulars: "Publication of Research Papers/Patents in reputed Journal/ International Conference (One Paper)", maxMarks: 5, type: "publications", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_1c", sNo: "1c", kra: "Investing in Yourself", particulars: "Participation in Workshops, Conferences, FDP's, STTP's, Seminars and Special Programs, if any (Two Workshop)", maxMarks: 5, type: "workshops", targetCount: 2, marksPerUnit: 2.5 },
    { id: "p2_1d", sNo: "1d", kra: "Investing in Yourself", particulars: "Improvements in Qualification (Ph.D) / Interaction with Outside World (One program)", maxMarks: 5, type: "qualification_upgrade", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_2a", sNo: "2a", kra: "Contribution for the Development of the Department / Institution", particulars: "Organizing Workshops / Conferences / Seminars / Guest Lectures / Symposium / Special Programs, if any (Two program)", maxMarks: 5, type: "organizing_events", targetCount: 2, marksPerUnit: 2.5 },
    { id: "p2_2b", sNo: "2b", kra: "Contribution for the Development of the Department / Institution", particulars: "Contribution towards Submission of Funding Proposal / Testing and Consultancy (One Proposal / Testing / Consultancy)", maxMarks: 5, type: "funding_proposals", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_2c", sNo: "2c", kra: "Contribution for the Development of the Department / Institution", particulars: "Involvement in Placement Activities / Department Development / Student Welfare / Mentoring / Counseling / Special efforts, if any", maxMarks: 5, type: "placement_mentoring", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_2d", sNo: "2d", kra: "Contribution for the Development of the Department / Institution", particulars: "Contribution towards ISO / NAAC / NBA / Lab Development / R&D / EDC / SIC / Alumni / IIPC / Sports / NSS / Special efforts as a Class Advisor / Academic Coordinator / Faculty", maxMarks: 5, type: "accreditation_rd", targetCount: 1, marksPerUnit: 5 },
    { id: "p2_2f", sNo: "2f", kra: "Contribution for the Development of the Department / Institution", particulars: "Contribution towards Admission (Minimum of 5 admission)", maxMarks: 10, type: "admissions", targetCount: 5, marksPerUnit: 2 }
  ]
};

const defaultFields = [
  // Tab 1: Profile & Workload
  { id: "sec_profile_details", title: "1.1 Basic Profile Details", description: "Faculty Name, Designation, Department, Qualifications, DOB, Date of Joining CKCET etc.", type: "section_profile_details", tabId: 1, tabName: "Profile & Workload", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_name", title: "Faculty Name", description: "Full name of the faculty member.", type: "text", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_dob", title: "Date of Birth", description: "Date of birth.", type: "date", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_age", title: "Age", description: "Current age of the faculty member.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_designation", title: "Designation", description: "Current designation / role.", type: "text", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_department", title: "Department", description: "Assigned academic department.", type: "text", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_subjectSpecialization", title: "Subject Specialization", description: "Specialized core subjects.", type: "text", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_dojCollege", title: "Date of Joining CKCET", description: "Date when joined CKCET.", type: "date", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_dojPresentPost", title: "DOJ Present Post", description: "Date of joining present designation.", type: "date", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },
  { id: "f_academicQualification", title: "Academic Qualification", description: "Highest academic degree completed.", type: "text", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_details" },

  { id: "sec_profile_experience", title: "1.2 Teaching & Industrial Experience Details", description: "Record of previous experience at other colleges or in corporate industry.", type: "section_profile_experience", tabId: 1, tabName: "Profile & Workload", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_teachingCKCET", title: "Teaching at CKCET (Yrs)", description: "Experience years in CKCET.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_experience" },
  { id: "f_teachingElsewhere", title: "Teaching Elsewhere (Yrs)", description: "Experience years in other colleges.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_experience" },
  { id: "f_industrial", title: "Industrial Experience (Yrs)", description: "Experience years in corporate industry.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_experience" },

  { id: "sec_profile_workload", title: "1.3 Weekly Workload Grid", description: "Hours assigned per week for Odd/Even semester theory and lab sessions.", type: "section_profile_workload", tabId: 1, tabName: "Profile & Workload", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_oddTheory", title: "Odd Sem Theory Hours", description: "Odd semester weekly theory workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },
  { id: "f_oddPractical", title: "Odd Practical/Project Hours", description: "Odd semester weekly lab/project workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },
  { id: "f_oddTotal", title: "Odd Total Hours", description: "Odd semester total workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },
  { id: "f_evenTheory", title: "Even Sem Theory Hours", description: "Even semester weekly theory workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },
  { id: "f_evenPractical", title: "Even Practical/Project Hours", description: "Even semester weekly lab/project workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },
  { id: "f_evenTotal", title: "Even Total Hours", description: "Even semester total workload.", type: "number", tabId: 1, tabName: "Profile & Workload", visible: true, parentId: "sec_profile_workload" },

  // Tab 2: Subjects & Results
  { id: "sec_subjects_results", title: "2.1 Subjects Handled & Exam Pass Targets", description: "Tabular evaluation of result percentages and student feedback targets.", type: "section_subjects_results", tabId: 2, tabName: "Subjects & Results", visible: true, evidenceRequired: false, evidenceMandatory: false },

  // Tab 3: Academic Development
  { id: "sec_academic_nptel", title: "3.1 NPTEL Certifications Completed", description: "Certification details and credits earned via SWAYAM/NPTEL portals.", type: "section_academic_nptel", tabId: 3, tabName: "Academic Development", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "sec_academic_fdp", title: "3.2 FDP / Seminars Organized & Attended", description: "List of faculty development programs, seminars, workshops participated.", type: "section_academic_fdp", tabId: 3, tabName: "Academic Development", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "sec_academic_journals", title: "3.3 Journal Publications", description: "Details of research publications in indexed journals.", type: "section_academic_journals", tabId: 3, tabName: "Academic Development", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "sec_academic_books", title: "3.4 Book & Chapter Publications", description: "Chapters or books written and published with ISBN.", type: "section_academic_books", tabId: 3, tabName: "Academic Development", visible: true, evidenceRequired: false, evidenceMandatory: false },

  // Tab 4: Contributions
  { id: "sec_roles_department", title: "4.1 Department & College Level Roles", description: "Responsibilities held like Lab Coordinator, Placement Coordinator, etc.", type: "section_roles_department", tabId: 4, tabName: "Contributions", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_resultImprovementHOD", title: "Result Improvement & Maintenance (HOD)", description: "For HODs: Actions taken to maintain and improve results.", type: "textarea", tabId: 4, tabName: "Contributions", visible: true, parentId: "sec_roles_department" },
  { id: "f_deptAdministrationHOD", title: "Department Administration & Planning (HOD)", description: "For HODs: Contribution to department planning/admin.", type: "textarea", tabId: 4, tabName: "Contributions", visible: true, parentId: "sec_roles_department" },
  { id: "f_otherRolesContribution", title: "Other Role / Contribution Description", description: "Other administrative roles or institutional contributions.", type: "textarea", tabId: 4, tabName: "Contributions", visible: true, parentId: "sec_roles_department" },
  { id: "sec_professional_memberships", title: "4.2 Professional Body Memberships", description: "Memberships in technical bodies like ISTE, IEEE, CSI, ACM, etc.", type: "section_professional_memberships", tabId: 4, tabName: "Contributions", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "sec_awards_honors", title: "4.3 Awards & Recognitions", description: "Prizes, honors, and professional recognition received.", type: "section_awards_honors", tabId: 4, tabName: "Contributions", visible: true, evidenceRequired: false, evidenceMandatory: false },

  // Tab 5: Library & Leaves
  { id: "sec_library_usage", title: "5.1 Library Books & Journals Referenced", description: "Audit of resources, text books, and digital library systems utilized.", type: "section_library_usage", tabId: 5, tabName: "Library & Leaves", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_libraryUsage", title: "Library Books & Journals Referenced", description: "Details of books, journals referenced.", type: "textarea", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_library_usage" },
  { id: "f_libraryPurpose", title: "Purpose of library visit", description: "Research, teaching preparation, etc.", type: "text", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_library_usage" },

  { id: "sec_leave_summary", title: "5.2 Leave & Absence Summary", description: "Casual, medical, study leaves and duty leave records.", type: "section_leave_summary", tabId: 5, tabName: "Library & Leaves", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_accomplishAssignment", title: "Conducted assignment in time?", description: "Yes/No response for assignment scheduling.", type: "text", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_applyLeaveInAdvance", title: "Applied leave in advance?", description: "Yes/No response for leave planning.", type: "text", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_consumeClLastMonth", title: "Consume CL last month?", description: "Yes/No response for last month CL.", type: "text", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_leaveCl", title: "Casual Leaves Availed", description: "Number of casual leaves taken.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_leaveCoff", title: "C-OFF Leaves Availed", description: "Number of compensatory off days.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_leaveLop", title: "LOP Leaves Availed", description: "Number of loss of pay leaves taken.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_odUniversity", title: "OD (University) Availed", description: "Duty leave days for university work.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_odOthers", title: "OD (Others) Availed", description: "Duty leave days for external work.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },
  { id: "f_odInstitution", title: "OD (Institution) Availed", description: "Duty leave days for institutional work.", type: "number", tabId: 5, tabName: "Library & Leaves", visible: true, parentId: "sec_leave_summary" },

  // Tab 6: Relations & Targets
  { id: "sec_interpersonal_relations", title: "6.1 Interpersonal Relations Rating", description: "Relations evaluation with students, peer faculty, and supervisors.", type: "section_interpersonal_relations", tabId: 6, tabName: "Relations & Targets", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_relationStudents", title: "Interpersonal Relation: Students", description: "Feedback/rating on student relationships.", type: "text", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_interpersonal_relations" },
  { id: "f_relationColleagues", title: "Interpersonal Relation: Colleagues", description: "Feedback/rating on peer relationships.", type: "text", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_interpersonal_relations" },
  { id: "f_relationSuperiors", title: "Interpersonal Relation: Superiors", description: "Feedback/rating on relationship with management.", type: "text", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_interpersonal_relations" },
  { id: "f_relationDepartment", title: "Interpersonal Relation: Department", description: "Feedback/rating on department-level involvement.", type: "text", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_interpersonal_relations" },

  { id: "sec_targets_next_sem", title: "6.2 Future Targets & Action Strategy", description: "Self targets set for publications, pass rate, and feedback next term.", type: "section_targets_next_sem", tabId: 6, tabName: "Relations & Targets", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_targetsNextSemester", title: "Targets set for Next Semester", description: "Details of academic and professional goals.", type: "textarea", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_targets_next_sem" },
  { id: "f_targetsStrategy", title: "Strategy for Achieving Targets", description: "Plan of action to reach goals.", type: "textarea", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_targets_next_sem" },

  { id: "sec_self_analysis", title: "6.3 Strengths & Weaknesses self-analysis", description: "Self analysis points detailing strengths and weaknesses.", type: "section_self_analysis", tabId: 6, tabName: "Relations & Targets", visible: true, evidenceRequired: false, evidenceMandatory: false },
  { id: "f_selfAnalysisStrengths", title: "Self-Analysis: Strengths List", description: "Key strength areas.", type: "textarea", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_self_analysis" },
  { id: "f_selfAnalysisWeaknesses", title: "Self-Analysis: Weaknesses List", description: "Key weakness areas.", type: "textarea", tabId: 6, tabName: "Relations & Targets", visible: true, parentId: "sec_self_analysis" }
];

export default function AppraisalSettings() {
  const [activeTab, setActiveTab] = useState("schedule"); // schedule or criteria
  const [toast, setToast] = useState(null);

  // --- Schedule Tab States ---
  const [academicYear, setAcademicYear] = useState("2024-2025");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [timeStatus, setTimeStatus] = useState({ label: "Closed", color: "red" });
  const [countdownText, setCountdownText] = useState("");

  // --- Criteria Tab States ---
  const [criteria, setCriteria] = useState({ part1: [], part2: [] });
  const [criteriaLoading, setCriteriaLoading] = useState(true);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activePart, setActivePart] = useState("part1"); // part1 or part2
  const [editingItem, setEditingItem] = useState(null);

  // --- Dynamic Form Config States ---
  const [customFields, setCustomFields] = useState([]);
  const [formConfigLoading, setFormConfigLoading] = useState(true);
  const [savingFormConfig, setSavingFormConfig] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);

  // --- Listen to Dynamic Fields Config ---
  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "form_fields");
    const unsub = onSnapshot(docRef, (snap) => {
      let fields = [];
      if (snap.exists()) {
        fields = snap.data().fields || [];
      }
      
      const existingIds = new Set(fields.map(f => f.id));
      const missingDefaults = defaultFields.filter(f => !existingIds.has(f.id));
      if (missingDefaults.length > 0) {
        const merged = [...fields, ...missingDefaults];
        setCustomFields(merged);
        setDoc(docRef, { fields: merged }).catch(err => console.error("Error seeding config:", err));
      } else {
        setCustomFields(fields);
      }
      setFormConfigLoading(false);
    }, (err) => {
      console.error("Error loading dynamic fields config:", err);
      setFormConfigLoading(false);
    });
    return unsub;
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Listen to Schedule Config ---
  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "schedule");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAcademicYear(data.academicYear || "2024-2025");
        setOpenTime(data.openTime || "");
        setCloseTime(data.closeTime || "");
        setIsActive(data.isActive || false);
      }
      setScheduleLoading(false);
    }, (err) => {
      console.error("Error reading schedule config:", err);
      setScheduleLoading(false);
    });
    return unsub;
  }, []);

  // --- Listen to Criteria Config ---
  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "criteria");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setCriteria(snap.data());
      } else {
        // Seed default values
        setDoc(docRef, DEFAULT_CRITERIA).then(() => setCriteria(DEFAULT_CRITERIA));
      }
      setCriteriaLoading(false);
    }, (err) => {
      console.error("Error loading criteria config:", err);
      setCriteriaLoading(false);
    });
    return unsub;
  }, []);

  // --- Compute Live Status Badge ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActive) {
        setTimeStatus({ label: "Deactivated", color: "red" });
        setCountdownText("Appraisal portal is manually disabled.");
        return;
      }

      const now = new Date().getTime();
      const start = openTime ? new Date(openTime).getTime() : null;
      const end = closeTime ? new Date(closeTime).getTime() : null;

      if (start && now < start) {
        setTimeStatus({ label: "Scheduled / Pending", color: "amber" });
        const diff = start - now;
        setCountdownText(`Opens in ${formatTimeDiff(diff)}`);
      } else if (end && now > end) {
        setTimeStatus({ label: "Expired / Closed", color: "red" });
        setCountdownText("Portal has reached its closing deadline.");
      } else if (start && end && now >= start && now <= end) {
        setTimeStatus({ label: "Active & Open", color: "green" });
        const diff = end - now;
        setCountdownText(`Closes in ${formatTimeDiff(diff)}`);
      } else {
        setTimeStatus({ label: "Active & Open", color: "green" });
        setCountdownText("Portal is open indefinitely (no dates set).");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, openTime, closeTime]);

  const formatTimeDiff = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${mins % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${mins % 60}m ${secs % 60}s`;
    }
    return `${mins}m ${secs % 60}s`;
  };

  // --- Actions: Schedule Tab ---
  const handlePostAppraisalRequest = async () => {
    if (openTime && closeTime && new Date(openTime) >= new Date(closeTime)) {
      showToast("Portal close date & time must be strictly after the open date & time.", "error");
      return;
    }

    setSavingSchedule(true);
    try {
      const docRef = doc(db, "appraisal_config", "schedule");
      await setDoc(docRef, {
        academicYear,
        openTime,
        closeTime,
        isActive: true,
        postedAt: new Date().toISOString()
      }, { merge: true });
      showToast("Appraisal request posted and scheduled successfully!", "success");
    } catch (err) {
      console.error("Error saving appraisal schedule:", err);
      showToast("Failed to save appraisal settings.", "error");
    }
    setSavingSchedule(false);
  };

  const handleDeactivatePortal = async () => {
    setSavingSchedule(true);
    try {
      const docRef = doc(db, "appraisal_config", "schedule");
      await setDoc(docRef, {
        isActive: false,
        deactivatedAt: new Date().toISOString()
      }, { merge: true });
      showToast("Appraisal request portal deactivated manually.", "success");
    } catch (err) {
      console.error("Error deactivating appraisal schedule:", err);
      showToast("Failed to deactivate appraisal settings.", "error");
    }
    setSavingSchedule(false);
  };

  // --- Actions: Criteria Tab ---
  const handleSaveCriteria = async (updatedCriteria) => {
    setSavingCriteria(true);
    try {
      const docRef = doc(db, "appraisal_config", "criteria");
      await setDoc(docRef, updatedCriteria);
      setCriteria(updatedCriteria);
      showToast("Appraisal criteria configuration successfully saved!", "success");
    } catch (err) {
      console.error("Error saving appraisal criteria:", err);
      showToast("Failed to save criteria configuration.", "error");
    }
    setSavingCriteria(false);
  };

  const handleEditItem = (part, item) => {
    setActivePart(part);
    if (item) {
      setEditingItem({ ...item });
    } else {
      if (part === "part1") {
        setEditingItem({
          id: "p1_" + Math.random().toString(36).substr(2, 9),
          sNo: "",
          kra: "",
          particulars: "",
          maxMarks: 5,
          type: "custom",
          rules: [{ min: 0, max: 100, rating: 1, marks: 5 }]
        });
      } else {
        setEditingItem({
          id: "p2_" + Math.random().toString(36).substr(2, 9),
          sNo: "",
          kra: "",
          particulars: "",
          maxMarks: 5,
          type: "online_courses",
          targetCount: 1,
          marksPerUnit: 5
        });
      }
    }
    setEditModalOpen(true);
  };

  const handleSaveModalItem = () => {
    const list = [...criteria[activePart]];
    const idx = list.findIndex(x => x.id === editingItem.id);
    if (idx > -1) {
      list[idx] = editingItem;
    } else {
      list.push(editingItem);
    }
    const updated = { ...criteria, [activePart]: list };
    handleSaveCriteria(updated);
    setEditModalOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (part, id) => {
    if (!window.confirm("Are you sure you want to delete this criterion?")) return;
    const updatedList = criteria[part].filter(x => x.id !== id);
    const updated = { ...criteria, [part]: updatedList };
    handleSaveCriteria(updated);
  };

  const handleEditPart1RuleChange = (ruleIdx, field, val) => {
    const updatedRules = [...editingItem.rules];
    updatedRules[ruleIdx][field] = parseFloat(val) || 0;
    setEditingItem({ ...editingItem, rules: updatedRules });
  };

  const handleAddRule = () => {
    const updatedRules = [...(editingItem.rules || [])];
    updatedRules.push({ min: 0, max: 100, rating: 1, marks: 5 });
    setEditingItem({ ...editingItem, rules: updatedRules });
  };

  const handleRemoveRule = (ruleIdx) => {
    const updatedRules = (editingItem.rules || []).filter((_, idx) => idx !== ruleIdx);
    setEditingItem({ ...editingItem, rules: updatedRules });
  };

  // --- Dynamic Form Control Helpers ---
  const handleSaveFormConfig = async (newFields) => {
    setSavingFormConfig(true);
    try {
      await setDoc(doc(db, "appraisal_config", "form_fields"), { fields: newFields });
      showToast("Appraisal Form Configuration Saved!", "success");
    } catch (error) {
      console.error("Error saving form config:", error);
      showToast("Failed to save form config", "error");
    }
    setSavingFormConfig(false);
  };

  const handleAddField = () => {
    setEditingField({
      id: `field_${Date.now()}`,
      title: "",
      description: "",
      type: "text",
      tabId: 7,
      tabName: "Evidences & Disclosures",
      visible: true,
      evidenceRequired: true,
      evidenceMandatory: false
    });
    setFormModalOpen(true);
  };

  const handleEditField = (field) => {
    setEditingField({ 
      tabId: 7,
      tabName: "Evidences & Disclosures",
      visible: true,
      ...field 
    });
    setFormModalOpen(true);
  };

  const handleDeleteField = (fieldId) => {
    if (fieldId.startsWith("sec_")) {
      showToast("Built-in appraisal sections cannot be deleted, but you can hide them.", "error");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this form field? Faculty data for this field will be hidden.")) return;
    const updated = customFields.filter(f => f.id !== fieldId);
    handleSaveFormConfig(updated);
  };

  const handleSaveFieldModal = () => {
    if (!editingField.title.trim()) {
      showToast("Please enter a field title", "error");
      return;
    }
    let updated;
    const exists = customFields.some(f => f.id === editingField.id);
    if (exists) {
      updated = customFields.map(f => f.id === editingField.id ? editingField : f);
    } else {
      updated = [...customFields, editingField];
    }
    handleSaveFormConfig(updated);
    setFormModalOpen(false);
    setEditingField(null);
  };

  const groupedFields = useMemo(() => {
    const groups = {};
    const tabsList = [
      { id: 1, name: "1. Profile & Workload" },
      { id: 2, name: "2. Subjects & Results" },
      { id: 3, name: "3. Academic Development" },
      { id: 4, name: "4. Contributions" },
      { id: 5, name: "5. Library & Leaves" },
      { id: 6, name: "6. Relations & Targets" },
      { id: 7, name: "7. Evidences & Disclosures" }
    ];
    
    tabsList.forEach(t => {
      groups[t.id] = {
        name: t.name,
        fields: []
      };
    });
    
    customFields.forEach(f => {
      const tId = f.tabId || 7;
      if (!groups[tId]) {
        groups[tId] = {
          name: f.tabName || `Tab ${tId}`,
          fields: []
        };
      }
      groups[tId].fields.push(f);
    });
    
    return Object.entries(groups).sort(([a], [b]) => parseInt(a) - parseInt(b));
  }, [customFields]);

  return (
    <Layout>
      {/* Toast Notification Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg text-xs font-bold ${
            toast.type === "success" 
              ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
              : "bg-red-50 border-red-250 text-red-800"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        
        {/* Banner Hero */}
        <div className="bg-gradient-to-br from-[#120c7a] via-[#1b11a4] to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black tracking-widest uppercase w-fit">
              <Sparkles size={12} className="text-amber-400" /> HR Appraisal System
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-serif">Appraisal Settings Control Panel</h1>
            <p className="text-indigo-200 text-xs md:text-sm">Manage portal visibility schedule, submission windows, and dynamic performance validation criteria points.</p>
          </div>
        </div>

        {/* Setting Tabs */}
        <div className="flex border-b border-zinc-200 mb-8 overflow-x-auto gap-4 no-scrollbar">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`pb-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "schedule"
                ? "border-[#120c7a] text-[#120c7a]"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            Portal Scheduling & Access
          </button>
          <button
            onClick={() => setActiveTab("criteria")}
            className={`pb-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "criteria"
                ? "border-[#120c7a] text-[#120c7a]"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            Performance Evaluation Criteria
          </button>
          <button
            onClick={() => setActiveTab("form")}
            className={`pb-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "form"
                ? "border-[#120c7a] text-[#120c7a]"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            Appraisal Form Fields Builder
          </button>
        </div>

        {/* Loading Spinner */}
        {((activeTab === "schedule" && scheduleLoading) || (activeTab === "criteria" && criteriaLoading) || (activeTab === "form" && formConfigLoading)) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
            <Loader2 className="animate-spin text-indigo-700" size={32} />
            <span className="text-xs font-bold uppercase tracking-wider">Loading settings details...</span>
          </div>
        ) : (
          <div className="animate-fadeIn">
            
            {/* ═══ TAB 1: SCHEDULE & ACCESS CONTROL ═══ */}
            {activeTab === "schedule" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-6">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider pb-3 border-b border-zinc-100 flex items-center gap-2">
                      <Calendar size={16} className="text-indigo-600" /> Portal Open & Close Window
                    </h2>

                    <div className="space-y-4 text-xs">
                      {/* Academic Year */}
                      <div className="space-y-1.5">
                        <label className="block font-bold text-zinc-500 uppercase tracking-wider">Active Academic Year</label>
                        <select
                          value={academicYear}
                          onChange={(e) => setAcademicYear(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                        >
                          <option value="2024-2025">2024-2025</option>
                          <option value="2025-2026">2025-2026</option>
                          <option value="2026-2027">2026-2027</option>
                        </select>
                      </div>

                      {/* Timestamps */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block font-bold text-zinc-500 uppercase tracking-wider">Open Date & Time</label>
                          <input
                            type="datetime-local"
                            value={openTime}
                            onChange={(e) => setOpenTime(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-bold text-zinc-500 uppercase tracking-wider">Closing Deadline</label>
                          <input
                            type="datetime-local"
                            value={closeTime}
                            onChange={(e) => setCloseTime(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-zinc-100">
                      <button
                        onClick={handlePostAppraisalRequest}
                        disabled={savingSchedule}
                        className="flex-1 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-150 disabled:opacity-50 cursor-pointer"
                      >
                        {savingSchedule ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        Post Appraisal Request
                      </button>
                      <button
                        onClick={handleDeactivatePortal}
                        disabled={savingSchedule || !isActive}
                        className="px-5 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                      >
                        <XCircle size={14} />
                        Deactivate Portal
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Status View */}
                <div className="space-y-6">
                  <div className="bg-zinc-50 rounded-3xl border border-zinc-200 p-6 space-y-5">
                    <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={14} className="text-zinc-500" /> Live Visibility Status
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Portal State:</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                          timeStatus.color === "green" 
                            ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
                            : timeStatus.color === "amber"
                            ? "bg-amber-50 border-amber-250 text-amber-800"
                            : "bg-red-50 border-red-250 text-red-800"
                        }`}>
                          {timeStatus.label}
                        </span>
                      </div>

                      <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm text-center">
                        <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1">Time Remaining / Status</span>
                        <p className="text-sm font-black text-slate-800">{countdownText}</p>
                      </div>

                      <div className="flex items-start gap-2 bg-indigo-50/30 border border-indigo-150 p-4 rounded-2xl text-[11px] text-slate-700 font-medium">
                        <ShieldAlert size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                        <p>
                          When state is **Active**, the Appraisal Request item automatically shows in the Faculty sidebar. 
                          Outside dates or when deactivated, it disappears from sidebar and blocks access.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ═══ TAB 2: CRITERIA CONFIGURATION ═══ */}
            {activeTab === "criteria" && (
              <div className="space-y-8">
                
                {/* Part 1 Table */}
                <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                        Part One Criteria Rules (Academic & Feedback Pass Targets)
                      </h2>
                      <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Define sliding scale performance validation marks for theory, practicals, and student feedback averages.</p>
                    </div>
                    <button
                      onClick={() => handleEditItem("part1", null)}
                      className="px-4 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-150 cursor-pointer"
                    >
                      <Plus size={14} /> Add Criterion
                    </button>
                  </div>

                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                        <th className="p-4 w-12 text-center">S.No</th>
                        <th className="p-4">KRA</th>
                        <th className="p-4">Particulars Details</th>
                        <th className="p-4 w-28 text-center">Max Marks</th>
                        <th className="p-4 w-32">Rule Slots</th>
                        <th className="p-4 w-24 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {criteria.part1.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="p-4 text-center font-bold text-slate-500">{item.sNo}</td>
                          <td className="p-4 font-bold text-slate-700">{item.kra}</td>
                          <td className="p-4 font-medium text-zinc-650">{item.particulars}</td>
                          <td className="p-4 text-center font-black text-indigo-700 text-sm">{item.maxMarks}</td>
                          <td className="p-4">
                            <span className="inline-block px-2.5 py-1 rounded bg-indigo-50 border border-indigo-100 text-[#120c7a] font-bold text-[10px] uppercase">
                              {item.rules?.length || 0} Slots Configured
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditItem("part1", item)}
                                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] rounded-xl transition-all cursor-pointer"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem("part1", item.id)}
                                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Part 2 Table */}
                <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                        Part Two Criteria Rules (Self & Department Contributions)
                      </h2>
                      <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Configure unit limits, targeted minimums, and weight per unit for academic growth and departmental work.</p>
                    </div>
                    <button
                      onClick={() => handleEditItem("part2", null)}
                      className="px-4 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-150 cursor-pointer"
                    >
                      <Plus size={14} /> Add Criterion
                    </button>
                  </div>

                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                        <th className="p-4 w-12 text-center">S.No</th>
                        <th className="p-4">KRA</th>
                        <th className="p-4">Particulars Details</th>
                        <th className="p-4 w-28 text-center">Max Marks</th>
                        <th className="p-4 w-24 text-center">Target</th>
                        <th className="p-4 w-24 text-center">Points/Unit</th>
                        <th className="p-4 w-24 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {criteria.part2.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="p-4 text-center font-bold text-slate-500">{item.sNo}</td>
                          <td className="p-4 font-bold text-slate-700">{item.kra}</td>
                          <td className="p-4 font-medium text-zinc-650">{item.particulars}</td>
                          <td className="p-4 text-center font-black text-indigo-700 text-sm">{item.maxMarks}</td>
                          <td className="p-4 text-center font-bold text-zinc-600">{item.targetCount} units</td>
                          <td className="p-4 text-center font-bold text-emerald-700">{item.marksPerUnit} pts</td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditItem("part2", item)}
                                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] rounded-xl transition-all cursor-pointer"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem("part2", item.id)}
                                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* ═══ TAB 3: DYNAMIC FORM FIELDS CONFIGURATION ═══ */}
            {activeTab === "form" && (
              <div className="space-y-6 animate-fadeIn">
                <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-black text-slate-805 uppercase tracking-wider">
                        Dynamic Form Fields & Evidences Configurator
                      </h2>
                      <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                        Build custom fields/questions for the self-appraisal form. Set whether evidence files must be attached by the faculty.
                      </p>
                    </div>
                    <button
                      onClick={handleAddField}
                      className="px-4 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-150 cursor-pointer self-start sm:self-center"
                    >
                      <Plus size={14} /> Add Form Field
                    </button>
                  </div>

                  {customFields.length === 0 ? (
                    <div className="border border-dashed border-zinc-200 rounded-2xl py-12 text-center text-zinc-400 space-y-2">
                      <Settings className="mx-auto text-zinc-300" size={32} />
                      <p className="text-xs font-bold uppercase tracking-wider">No Custom Appraisal Fields Added Yet</p>
                      <p className="text-[10px] text-zinc-400 font-medium max-w-sm mx-auto">
                        Click the button above to add custom inputs/topics for faculty self appraisal documents.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-zinc-150 rounded-2xl">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-250 text-zinc-500 font-bold">
                            <th className="p-4">Field Title / Label</th>
                            <th className="p-4">Description</th>
                            <th className="p-4 w-24 text-center">Type</th>
                            <th className="p-4 w-24 text-center">Status</th>
                            <th className="p-4 w-28 text-center">Evidence Req.</th>
                            <th className="p-4 w-24 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-700">
                          {groupedFields.map(([tabId, group]) => {
                            if (group.fields.length === 0) return null;
                            return (
                              <React.Fragment key={tabId}>
                                <tr className="bg-slate-100/60 border-y border-zinc-200">
                                  <td colSpan={6} className="px-4 py-2 font-black text-slate-800 uppercase tracking-wider text-[10px]">
                                    {group.name}
                                  </td>
                                </tr>
                                {group.fields.map((field) => {
                                  const isDefault = field.id.startsWith("sec_") || field.id.startsWith("f_");
                                  const isSubField = !!field.parentId;
                                  return (
                                    <tr key={field.id} className="hover:bg-zinc-50/40">
                                      <td className="p-4 space-y-1">
                                        <div className="flex items-center gap-2" style={{ paddingLeft: isSubField ? "20px" : "0" }}>
                                          {isSubField && <span className="text-zinc-400 font-black mr-0.5">↳</span>}
                                          <span className="font-bold text-slate-805">{field.title}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                            isDefault 
                                              ? "bg-green-50 text-green-700 border border-green-150" 
                                              : "bg-blue-50 text-blue-700 border border-blue-150"
                                          }`}>
                                            {isDefault ? (isSubField ? "Sub-Field" : "Default Section") : "Custom"}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-4 font-medium text-zinc-450">{field.description || "-"}</td>
                                      <td className="p-4 text-center text-zinc-500 font-mono text-[9px] uppercase">
                                        {field.type.replace("section_", "grid ").replace("_", " ")}
                                      </td>
                                      <td className="p-4 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                          field.visible !== false 
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-150" 
                                            : "bg-rose-50 text-rose-700 border border-rose-150"
                                        }`}>
                                          {field.visible !== false ? "Visible" : "Hidden"}
                                        </span>
                                      </td>
                                      <td className="p-4 text-center space-y-1">
                                        {field.evidenceRequired ? (
                                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                            field.evidenceMandatory 
                                              ? "bg-red-50 border border-red-100 text-red-700" 
                                              : "bg-indigo-50 border border-indigo-100 text-indigo-700"
                                          }`}>
                                            {field.evidenceMandatory ? "Mandatory" : "Optional"}
                                          </span>
                                        ) : (
                                          <span className="text-zinc-400 font-medium text-[9px]">-</span>
                                        )}
                                      </td>
                                      <td className="p-4">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            onClick={() => handleEditField(field)}
                                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] rounded-lg transition-colors cursor-pointer"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          {!isDefault ? (
                                            <button
                                              onClick={() => handleDeleteField(field.id)}
                                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          ) : (
                                            <span className="w-[28px] inline-block" />
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* ═══ Dynamic Form Field Add/Edit Modal ═══ */}
      {formModalOpen && editingField && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-805">
            <div className="bg-[#120c7a] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-yellow-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  {editingField.id?.startsWith("sec_") 
                    ? "Edit Built-in Form Section" 
                    : editingField.id?.startsWith("f_")
                      ? "Edit Built-in Form Field"
                      : customFields.some(f => f.id === editingField.id) 
                        ? "Edit Custom Form Field" 
                        : "Create Custom Form Field"
                  }
                </h3>
              </div>
              <button 
                onClick={() => { setFormModalOpen(false); setEditingField(null); }} 
                className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-zinc-500 uppercase tracking-wider block">Field Title / Label</label>
                <input 
                  type="text" 
                  value={editingField.title}
                  onChange={(e) => setEditingField({ ...editingField, title: e.target.value })}
                  placeholder="e.g. NPTEL Course Certifications" 
                  className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-zinc-500 uppercase tracking-wider block">Description / Instruction</label>
                <textarea 
                  value={editingField.description}
                  onChange={(e) => setEditingField({ ...editingField, description: e.target.value })}
                  placeholder="e.g. Enter details and upload your completion certificate." 
                  className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600 h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-zinc-500 uppercase tracking-wider block">Tab Category</label>
                  {editingField.id?.startsWith("sec_") || editingField.id?.startsWith("f_") ? (
                    <div className="w-full rounded-xl border border-zinc-150 bg-zinc-50 p-2.5 font-bold text-zinc-400 flex items-center gap-2 cursor-not-allowed select-none">
                      <Lock size={13} className="text-zinc-400 flex-shrink-0" />
                      <span>
                        {
                          {
                            1: "1. Profile & Workload",
                            2: "2. Subjects & Results",
                            3: "3. Academic Development",
                            4: "4. Contributions",
                            5: "5. Library & Leaves",
                            6: "6. Relations & Targets",
                            7: "7. Evidences & Disclosures"
                          }[editingField.tabId || 7]
                        }
                      </span>
                    </div>
                  ) : (
                    <select 
                      value={editingField.tabId || 7} 
                      onChange={(e) => {
                        const tId = parseInt(e.target.value);
                        const names = {
                          1: "Profile & Workload",
                          2: "Subjects & Results",
                          3: "Academic Development",
                          4: "Contributions",
                          5: "Library & Leaves",
                          6: "Relations & Targets",
                          7: "Evidences & Disclosures"
                        };
                        setEditingField({ ...editingField, tabId: tId, tabName: names[tId] });
                      }}
                      className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold text-zinc-700 bg-white focus:outline-none"
                    >
                      <option value="1">1. Profile & Workload</option>
                      <option value="2">2. Subjects & Results</option>
                      <option value="3">3. Academic Development</option>
                      <option value="4">4. Contributions</option>
                      <option value="5">5. Library & Leaves</option>
                      <option value="6">6. Relations & Targets</option>
                      <option value="7">7. Evidences & Disclosures</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-zinc-500 uppercase tracking-wider block">Input Type</label>
                  {editingField.id?.startsWith("sec_") || editingField.id?.startsWith("f_") ? (
                    <div className="w-full rounded-xl border border-zinc-150 bg-zinc-50 p-2.5 font-bold text-zinc-400 flex items-center gap-2 cursor-not-allowed select-none">
                      <Lock size={13} className="text-zinc-400 flex-shrink-0" />
                      <span>Built-in {editingField.id?.startsWith("sec_") ? "Section" : "Field"}</span>
                    </div>
                  ) : (
                    <select 
                      value={editingField.type} 
                      onChange={(e) => setEditingField({ ...editingField, type: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold text-zinc-700 bg-white focus:outline-none"
                    >
                      <option value="text">Text Box</option>
                      <option value="textarea">Large Text Area</option>
                      <option value="number">Number Input</option>
                      <option value="date">Date Picker</option>
                      <option value="file_only">File Upload Only</option>
                    </select>
                  )}
                </div>
              </div>

              {(editingField.id?.startsWith("sec_") || editingField.id?.startsWith("f_")) && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
                  <Lock size={14} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-indigo-950 font-bold leading-normal uppercase">
                    Tab category & input type are locked for built-in elements to preserve system form layout and evaluation integrity.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-4">
                  <label className="relative inline-flex items-center cursor-pointer gap-2 select-none">
                    <input 
                      type="checkbox" 
                      checked={editingField.visible !== false}
                      onChange={(e) => setEditingField({ ...editingField, visible: e.target.checked })}
                      className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-bold text-zinc-650 text-[10px] uppercase">Section Visible to Faculty?</span>
                  </label>
                </div>

                <div className="space-y-4">
                  <label className="relative inline-flex items-center cursor-pointer gap-2 select-none">
                    <input 
                      type="checkbox" 
                      checked={editingField.evidenceRequired}
                      onChange={(e) => setEditingField({ ...editingField, evidenceRequired: e.target.checked })}
                      className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-bold text-zinc-650 text-[10px] uppercase">Evidence Required?</span>
                  </label>

                  {editingField.evidenceRequired && (
                    <div className="space-y-4 mt-2 block">
                      <label className="relative inline-flex items-center cursor-pointer gap-2 select-none block">
                        <input 
                          type="checkbox" 
                          checked={editingField.evidenceMandatory}
                          onChange={(e) => setEditingField({ ...editingField, evidenceMandatory: e.target.checked })}
                          className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-zinc-650 text-[10px] uppercase">Upload Mandatory?</span>
                      </label>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-500 uppercase tracking-wider block text-[10px]">Max File Size Limit (1 KB to 300 KB)</label>
                        <input 
                          type="number"
                          min="1"
                          max="300"
                          value={editingField.maxSizeKb || 300}
                          onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (isNaN(val)) val = 300;
                            setEditingField({ ...editingField, maxSizeKb: val });
                          }}
                          onBlur={(e) => {
                            let val = parseInt(e.target.value);
                            if (isNaN(val) || val < 1) val = 1;
                            if (val > 300) val = 300;
                            setEditingField({ ...editingField, maxSizeKb: val });
                          }}
                          className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold text-zinc-700 bg-white focus:outline-none"
                        />
                        <p className="text-[9px] text-zinc-400 font-semibold uppercase mt-0.5">Configures the maximum allowed file size in kilobytes.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 border-t border-zinc-150 p-4 flex justify-end gap-3">
              <button
                onClick={() => { setFormModalOpen(false); setEditingField(null); }}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-650 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFieldModal}
                disabled={savingFormConfig}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Save size={12} /> Save Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal Overlay */}
      {editModalOpen && editingItem && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            
            <div className="bg-[#120c7a] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-yellow-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  {editingItem.particulars ? "Modify Performance Criterion" : "Add Performance Criterion"}
                </h3>
              </div>
              <button 
                onClick={() => { setEditModalOpen(false); setEditingItem(null); }} 
                className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-500 uppercase tracking-wider">S.No Label</label>
                  <input
                    type="text"
                    value={editingItem.sNo}
                    onChange={(e) => setEditingItem({ ...editingItem, sNo: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600"
                    placeholder="e.g. 1a or 3"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-zinc-500 uppercase tracking-wider">Maximum Marks Cap</label>
                  <input
                    type="number"
                    value={editingItem.maxMarks}
                    onChange={(e) => setEditingItem({ ...editingItem, maxMarks: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-500 uppercase tracking-wider">KRA (Category Heading)</label>
                <input
                  type="text"
                  value={editingItem.kra}
                  onChange={(e) => setEditingItem({ ...editingItem, kra: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600"
                  placeholder="e.g. Academic Performance or Contributions"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-500 uppercase tracking-wider">Particulars Description</label>
                <textarea
                  value={editingItem.particulars}
                  onChange={(e) => setEditingItem({ ...editingItem, particulars: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 p-2.5 font-semibold text-zinc-700 focus:outline-none focus:border-indigo-600 h-20"
                  placeholder="Describe evaluation detail rules..."
                />
              </div>

              {activePart === "part1" && (
                <div className="space-y-1">
                  <label className="font-bold text-zinc-500 uppercase tracking-wider">Type Mapping</label>
                  <select
                    value={editingItem.type || "custom"}
                    onChange={(e) => setEditingItem({ ...editingItem, type: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold text-zinc-700 bg-white"
                  >
                    <option value="theory_pass">Theory Pass Percentage</option>
                    <option value="practical_pass">Practical Pass Percentage</option>
                    <option value="student_feedback">Student Feedback Rating</option>
                    <option value="custom">Other / Manual Evaluation</option>
                  </select>
                </div>
              )}

              {/* Conditional parameters based on Tab Part */}
              {activePart === "part1" ? (
                <div className="space-y-4 pt-3 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 uppercase tracking-wide">Sliding Scale Performance Points</span>
                    <button
                      onClick={handleAddRule}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} /> Add Slot
                    </button>
                  </div>

                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {(editingItem.rules || []).map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-zinc-50 border border-zinc-150 p-3 rounded-2xl">
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-zinc-400 uppercase">Min %</span>
                            <input
                              type="number"
                              step="0.01"
                              value={rule.min}
                              onChange={(e) => handleEditPart1RuleChange(idx, "min", e.target.value)}
                              className="w-full bg-white rounded-lg border border-zinc-200 p-1.5 text-center font-bold"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-zinc-400 uppercase">Max %</span>
                            <input
                              type="number"
                              step="0.01"
                              value={rule.max}
                              onChange={(e) => handleEditPart1RuleChange(idx, "max", e.target.value)}
                              className="w-full bg-white rounded-lg border border-zinc-200 p-1.5 text-center font-bold"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-zinc-400 uppercase">Allocated Marks</span>
                            <input
                              type="number"
                              value={rule.marks}
                              onChange={(e) => handleEditPart1RuleChange(idx, "marks", e.target.value)}
                              className="w-full bg-white rounded-lg border border-zinc-200 p-1.5 text-center font-bold"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveRule(idx)}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer mt-3"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-3 border-t border-zinc-100">
                  <span className="font-black text-slate-800 uppercase tracking-wide block">Part 2 Unit Calibration Settings</span>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="font-bold text-zinc-500 uppercase tracking-wider">Unit Mapping Code</label>
                      <select
                        value={editingItem.type}
                        onChange={(e) => setEditingItem({ ...editingItem, type: e.target.value })}
                        className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold text-zinc-700 bg-white"
                      >
                        <option value="online_courses">Online Courses (MOOC)</option>
                        <option value="publications">Research Papers</option>
                        <option value="workshops">FDP / Workshops</option>
                        <option value="qualification_upgrade">Qualification Ph.D</option>
                        <option value="organizing_events">Organizing Event</option>
                        <option value="funding_proposals">Funding Proposal</option>
                        <option value="placement_mentoring">Placement / Mentoring</option>
                        <option value="accreditation_rd">Lab / ISO / NBA Portfolios</option>
                        <option value="admissions">Admission Contribution</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-zinc-500 uppercase tracking-wider">Target Units Count</label>
                      <input
                        type="number"
                        value={editingItem.targetCount}
                        onChange={(e) => setEditingItem({ ...editingItem, targetCount: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-zinc-500 uppercase tracking-wider">Marks Allotment / Unit</label>
                      <input
                        type="number"
                        step="0.5"
                        value={editingItem.marksPerUnit}
                        onChange={(e) => setEditingItem({ ...editingItem, marksPerUnit: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-zinc-200 p-2.5 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div className="bg-zinc-50 border-t border-zinc-150 p-4 flex justify-end gap-3">
              <button
                onClick={() => { setEditModalOpen(false); setEditingItem(null); }}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModalItem}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Save size={12} /> Save Criterion
              </button>
            </div>

          </div>
        </div>
      )}

    </Layout>
  );
}
