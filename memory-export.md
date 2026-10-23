# ZoneSynapse OutcomeX — Conversation Memory Export

**Project**: OutcomeX — an IPR-based SaaS College ERP developed by *ZoneSynapse* (Outcome-Driven Technology Solutions, Chennai) for its first client, **C. K. College of Engineering & Technology (CKCET)**.

**Workspace root**: `C:\Users\ckcollege\Downloads\OBE\outcomex` (local: `/home/suryaah/Downloads/outcomex`).
**Branch**: `test-firestore`.
**Git status (current)**: untracked files — `"ACADEMIC REGULATIONS 2025).pdf"`, `fix_data.py`, `migrate.py`, `t.env`. `memory-export.md` is newly created by this task.
**Today's date (context)**: Fri Oct 16 2026.

---

## 1. Project Overview

### 1.1 Client & Product
- **Client**: CKCET (AICTE-approved, Anna University affiliated, NAAC 'A' accredited).
- **Product**: ZoneSynapse OutcomeX — full-college operations platform with Outcome-Based Education (OBE) support, attendance, exams, assessment (CIA), fee management, student lifecycle, HR appraisal, exam cell, resource hub, etc.
- **First deployed assets**: deployed to Cloudflare Pages at `https://zonesynapse-ckcet-obe.pages.dev`.

### 1.2 Tech Stack
- **Frontend**: React 19 + Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), react-router-dom v7, react-bootstrap 2.10, Lucide icons, Motion (Framer Motion), Recharts, react-hot-toast, sonner, ckeditor4-react, qrcode, canvas-confetti, uuid, papaparse, jszip. Fonts/Print use jsPDF + jspdf-autotable.
- **Backend**: Firebase Auth/Firestore/Storage + Cloud Functions (`functions/`), `@google/genai`, OpenAI, `firebase-admin`, `firebase-functions` (v2), Razorpay, AWS SES (Nodemailer).
- **Tooling**: ESLint 9, Jest 29 + Testing Library, Babel, Wrangler (Pages deploy). Dev server: `vite --port=3000 --host=0.0.0.0`.
- **Project shape**:
  - Main app `src/` (pages, components, lib, services, hooks, utils).
  - Separate HR portal `hr-portal/` — standalone Vite app reusing logic.
  - Cloud Functions `functions/`.
  - `public/logo.png` — wide banner logo (1206 × 127 px).
  - `hr-portal/src/...` mirrors pages for the HR standalone (AppraisalSettings, Faculty/HOD/NonTeachingAppraisal, HRGrossAnalytics, HRLayout, App, UserManagement).
- **Roles (in Firestore users doc `role`)**: Student, Staff, Faculty, HOD, Academic Coordinator, Principal, HR, Admin (and Master roles). `effectivePermissions` in Layout.jsx exposes a flat `items` list of granted page IDs.

### 1.3 Branch
- Working branch is **`test-firestore`**.
- Recent commits (newest first):
  - `a8c4e5f` — feat: user-configurable tier score ranges, criteria normalization, COE appointment updates
  - `3724d29` — Enhance in-frame document reader action + Google Drive/OneDrive links
  - `51d2dcd` — Fix Microsoft 365 iframe sign-in with multi-engine DocumentEmbedViewer + reader window
  - `58ca8ba` — feat(coe): auto-generate official appointment order copy + 1-set/2-set
  - `88ea481` — HR Dashboard, salary progression dual-charts, multi-institution attitude, exam isolation
  - `7138543` — fix(appraisal): import Clock icon in AppraisalReviews
  - `768dde0` — HR Gross Analytics engine, full-width appraisal layout, attitude draft persistence, coordinator approval for administration staff
  - `886f515` — dynamic attitude evaluation forms on HOD Dashboard + Appraisal Reviews
  - `e1d6fc2` — HOD attitude form questionnaire + Download icon fix in ExamFormSettingPage
  - `c4f84c1` — answer script revaluation module with HDFC payment verification + HOD/Exam Cell workflows
  - `e2fcf6b` — fix: remove Add Subject button from PhotocopyProblem form
  - `b8a57c9` — feat: auto-prefill applied photocopy subjects into photocopy problem discrepancy form

---

## 2. Module / Page Summary

### 2.1 Student Portal (Auth + StudentLayout)
- **Auth / Login** (`src/pages/Auth.jsx`) — Firebase Auth, role-based redirect.
- **Student Dashboard** (`src/pages/student/Dashboard.jsx`) — KPI + salary progression (FacultyDashboard-style dual charts copied to HR portal later).
- **Marks** (`src/pages/student/Marks.jsx`) — exam-wise per subject list; reads directly from `marks` collection written by Mark Entry; dual-ID (admNo/regNo) resolution; `getStudentMarkTotal` derives total from any structure.
- **Attendance** (`src/pages/student/Attendance.jsx`) — subject-wise stats + date-wise table, uses `parseStudentAttendanceVal` + dual-ID lookup.
- **Fees** (`src/pages/student/Fees.jsx`) — fee structure table (AY → Sem → Fee Head → Amount), application-time payments merged (`buildAppPaymentsFromEnquiry`, `appPayments` state, first-year-only via `isFirstYearConfig`), click-to-pay flow, breakdown badges, PDF/CSV friendly columns.
- **Profile** (`src/pages/student/Profile.jsx`), **Timetable** (`src/pages/student/Timetable.jsx` — Class + newly added IA Exam tab, department/batch/AY/semester scoped, only Principal-approved `status === 'Approved'`), **Revaluation**, **Photocopy / PhotocopyProblem**, plus Revaluation Payment (HDFC) and gate checks.
- **ResourceHub (student)** (`src/pages/student/ResourceHub.jsx`).

### 2.2 Faculty
- **FacultyDashboard** (`src/pages/FacultyDashboard.jsx`) — assigned subjects, timetable, missed attendance, question paper list (draft/forwarded/approved/allocated), QP setter task cards, common QP display, 2-day auto-hide for setter cards.
- **QuestionPaperGenerator** (`src/pages/QuestionPaperGenerator.jsx`) + `src/utils/questionPaperUtils.js`, `mathJaxUtils.js`, `qpConverter.js` (`src/pages/QPConverter.jsx`).
- **MarkEntry** (`src/pages/MarkEntry.jsx`) — strict section filter, downloads, exam tab (Allocated & Released only + ESE/internal categories).
- **Attendance** (`src/pages/Attendance.jsx`) — date + period based, "Consider for the period" event attendance, event name, same-date different-period records, cumulative Attended/Total, records_json compression (avoids Firestore 1MB entity limit).
- **Reports** (`src/pages/Reports.jsx`) — consolidation (Total CO1–CO5 column), Overall weighted (Regulation `course_type_weightage` per AY), course type / CO / exam scoped.
- **CoPoMapping** (`src/pages/CoPoMapping.jsx`), **PoAttainment** (`src/pages/PoAttainment.jsx`) — dynamic `configuredCoKeys` from Course Outcomes (no CO1–CO5 hardcode), section-aware keys.
- **MentorMeetings** (`src/pages/MentorMeetings.jsx`) — reads students from `students` collection (not `users`) + `_profile_data` fallback.
- **Activity Entry/List/Settings** (`src/pages/ActivityEntry.jsx`, `ActivityList.jsx`, `ActivitySettings.jsx`, `ActivityReports.jsx`, `ActivityNbaExport.jsx`, `ActivityApproval.jsx`).

### 2.3 HOD
- **HODDashboard** (`src/pages/HODDashboard.jsx`) — faculty detail view, attitude evaluation (18-item HOD questionnaire), student activity approvals, photocopy/revaluation applications with revoke/resubmit workflow, QP approvals, IA consolidation report card, attendance aggregation.
- **HODRoleConfig** (`src/pages/HODRoleConfig.jsx`) — inter-department subject allocation, section-aware QP & CO attainment keys `batchSubjectCodes`, faculty cards, QP status display.

### 2.4 Exam Cell (COE)
- **ExamCellDashboard**, **ExamCellQPReview** (review/approve/allocated/published question papers, dynamic exam date filter).
- **IAScheduleCreation**, **QPSetterAssignment**, **FeeConfigurationPage**, **ExamFormSettingPage** (4 tabs: Photocopy, Revaluation, Review, ESE Registration with date windows).
- **ExamHallSuite** (Seating Allocation, Faculty Duty, Duty Alteration, Hall Reports, Live Dashboard, Room Master, print reports, A4 door notice).
- **Photocopy / PhotocopyProblem / Revaluation** student-side + HOD + Exam Cell review flows with Anna University printable form.

### 2.5 Principal / Admin
- **PrincipalDashboard** (`src/pages/PrincipalDashboard.jsx`) — embeds `PrincipalIAScheduleView` (read-only IA schedule + approve), IA consolidation report, attendance summary, admission master list.
- **PrincipalIAScheduleView** (`src/pages/PrincipalIAScheduleView.jsx`) — read-only schedule view + approval workflow, regulation-aware exam names, batch grouping.
- **AdminRoleConfig** (`src/pages/AdminRoleConfig.jsx`) — page permissions + Dynamic designation management (`designations` collection), real-time `onSnapshot` (replaced paginated `getDocs`), role reassignment.
- **Curriculum** (`src/pages/Curriculum.jsx`) — programme/department management, regulation course types (`course_type_configs`), IA exam weightage per academic year (`course_type_weightage/${regulation}_${acyear}`), CIA config.
- **CIAConfigPage** (`src/pages/components/CIAConfigPage.tsx`) — exam configurations with academic year tagging + category checkboxes.
- **IAScheduleCreation** (`src/pages/IAScheduleCreation.jsx`) — IA exam timetable entry + QP setter assignment + submission windows.

### 2.6 HR Portal (`hr-portal/` + outcomex pages)
- `HRGrossAnalytics` (both `hr-portal/src/pages/` and `src/pages/`) — gross analytics + increment criteria matrix config + salary import (`xlsx`) + historical multi-year template + salary adjustments, 19-column matrix, analytics button/modal; role-restricted to Principal/HR/Admin. `AdminRoleConfig` registered "HR — Gross Analytics".
- `AppraisalSettings.jsx` (`src/pages/` + `hr-portal/src/pages/`) — Form field config (publish versions, sub-fields, dynamic grid tables, visibility, titles, evidence requirements; is editable for HR).
- `FacultyAppraisal.jsx`, `HODAppraisal.jsx`, `NonTeachingAppraisal.jsx`, `TeacherAppraisal.jsx` — dynamic field-based form, published version schema, attitude forms.
- `AppraisalReviews.jsx` — Principal/HOD review with HOD Score/Principal Score, attitude eval modal, blue quote cleanup, 1.1/1.2/1.3 grid rendering, read-only HOD score editable Principal score + total recompute.
- `HRDashboard.jsx`, `Dashboard.jsx`, `Language` etc.

### 2.7 Other
- **Placement** (`PlacementDashboard`, `PlacementStudents`, `PlacementDrives`, `PlacementReports`...), **Library** (Master, Circulation, Categories, Reports), **Student Management**, **Steps module**, **Inventory**, **Task/mentors**, **Resource hub**, **Notifications** (`users/{uid}/notifications`).

---

## 3. Discussion Topics / Issues & Root Causes (By Date / Topic Order)

### 3.1 QPG HOD programme/department filter (QPG was loading wrong scope for HOD)
- **Problem**: QPG scopes programs/departments wrong for HODs.
- **Root cause**: `userProgramme`/`userDepartment` were NOT fetched from `users` doc for HOD (`only userRole`). `filteredProgrammes` had `if (userRole !== 'Faculty') return true;` (HOD saw all); `filteredDepartments` used `userRole !== 'Faculty'` (HOD saw all). `subject_assignments` listener only ran for Faculty, so `facultyAssignPrefixes` empty for HOD.
- **Fix**: load `userProgramme`/`userDepartment` for all roles, run `subject_assignments` for HOD, scope programs/depts to HOD data.

### 3.2 QP multi-question / assignment text per question + Overall PO/PSO table
- `Assignment texture`, per-question textarea, dynamic count (1-10), marks distribution (last question gets remainder), Overall Mapped PO/PSO table.
- **Issue: Either/Or Q.No auto-increment reset**: after finalization, `handleAddEitherOrQuestion` used `qpQuestions.length + 1` → reset to `1a` instead of continuing (`6a`). Fixed via `qpAvailableQNos` + first unused `normalizeQNo()`.
- Per-question Domain/KL selectors extracted from global `assignmentKL`/`assignmentKLDomain` state added per `assignmentConfig` entry.
- CKEditor substituted for textarea per question (imperative `CKEDITOR.replace` inside wrapper div).
- Project assessment type mirrored Activity.

### 3.3 MarkEntry section data not re-fetching / missing `section` dep
- Subject dropdown empty → because `subject_assignments` doc IDs now include section suffix (`..._3_Sec-A`) and `assignmentCompositeKey` did not include section suffix → not found. Three root causes fixed:
  1. composite key missing section suffix → added.
  2. doc ID parsing with `.split('_')` splits `B_Tech` into `["B","Tech"]` → `idParts[0]="B"` instead of full progKey → regex extraction `/^(.+)_([A-Z]+)_(\d{4}-\d{4})_(\d{4}-\d{4})_(\d+)(?:_(.+))?$/` implemented.
  3. `section` missing from data-loading `useEffect` deps (`src/pages/MarkEntry.jsx:803`) → added.
- Absent column added for Project & Practical (only hidden for Assignment).

### 3.4 QP storage refactoring — removed `versions` subcollection
- **Issue**: Dual-storage anti-pattern (parent doc summary + `versions` subcollection) causing stale reads. Edited all four pages to use single parent doc (`generated_qps/{compositeKey}.{qpId}` writing full payload).
- `hod_dashboard`, `dashboard` no subcollection reads.
- `subject_assignments` keys now include section suffix (rolled into #3.3).

### 3.5 FacultyDashboard assigned subjects empty (flat doc IDs)
- `assignedGroups` was using nested iteration (expecting `{dept:{batch:{...}}}`), but HODRoleConfig writes flat keys. Replaced with flat-doc parsing.

### 3.6 Chrome/Firefox Listen channel / CORS errors in Firestore
- `onSnapshot` Listen/channel errors. Fixed by `initializeFirestore(app, {experimentalAutoDetectLongPolling:true})` in `firebase.ts`, plus error callbacks added to `batch_sections`, `semester_config`, `subject_assignments` listeners in `Attendance.jsx`. Also removed stray `console` spam.

### 3.7 Attendance 1MB index explosion & restructure
- **Root cause**: Keeping ~100+ student doubles inside nested `students` map created >40K index entries → query allowed only 40K, write failed.
- **Fix**: store whole period record as single `records_json` JSON string; `getAttendanceRecords(attData)` utility reads both `records_json`, `records`, and legacy top-level `students`.
- Also handled arrays, alternate ID casing (`2026-07-10_P3` / `p3` / `_3`), dual-ID lookup (admission number ↔ register number), default `P` on marked periods when no student records saved. Result: `100% attendance` / 23 attended classes now correct for student portal, faculty, HOD.
- Cumulative reported count earlier showed 8 instead of 23; fixed by parsing with `parseStudentAttendanceVal`.

### 3.8 MarkEntry performance: instant subject dropdown + two-step fetch
- `Attendance.jsx`: subjects populated instantly (`buildItems(null)`) and labels enriched asynchronously; semester config date filter safety fallback.
- `courseUtils.js`: expand `fetchAllCourseNamesMap()` to query `course_outcomes`, `course_bank`, `courses`, `syllabus_data`, plus uppercase/trim indexing; in-memory cache.

### 3.9 Academic Calendar & semester_config integration
- `AcademicCalendar.jsx`: `semester_config` CRUD with live computation (Odd → academicYear `startYr-startYr+1`; Even → `(startYr-1)-startYr`; semesterNumber formula). Visible only to Admin.
- `FacultyDashboard.jsx`: `visibleGroups` filtered by `semester_config` window; backward-compatible if none configured.
- IAScheduleCreation schedule windows driven by `academic_calendar_events` (`type === 'Exam'`), event dropdown + derived working-date date picker; save to `exam_schedules` + approval in PrincipalIAScheduleView.

### 3.10 Activity module (NBA/NAAC compliance)
- New collections `activity_entries`, `step_activities`, `notifications`; registry-driven dynamic forms; mentoring-first approval flow (Mentor_Pending → Pending (dept queue) → HOD_Pending etc.)
- Fixed: programme format `B.E.` vs `B_E` raw key (store raw key in select value); department normalizer `replace(/[._]/g,' ')`; `orderBy("createdAt")` crashes because `activity_entries` uses Firestore Timestamp while `step_activities` uses ISO string → switched to client-side sort by `getMillis()`.
- Evidence file previews (image/PDF iframe) in all 3 review modals.
- Activity picker merges `custom_activities` collection.
- Multiple variety (integer sort for array, etc.)

### 3.11 ResourceHub module — FCFS campus resource allocation
- Pages dashboard/manage/booking/mybookings/approvals/student; conflict detection; revocation reason mandatory prompt; ordered by FCFS `createdAt` (not auto-features).

### 3.12 HOD user management real-time — AdminRoleConfig + Layout
- `loadUsersPage` paginated `getDocs` replaced with `onSnapshot` real-time listener + client-side filter + pagination; `effectivePermissions` auto-assigns `activity-settings` to Admin role; sidebar item `activity-settings` added under activity + config modules.

### 3.13 Lateral entry joining-AY gating
- Add `_joiningAY` to `approved_admissions` and `students` docs mappings (PrincipalDashboard, AdmissionConfirmation, HODDashboard section assign). MarkEntry + Attendance filter students whose _joiningAY > selected Academic Year.

### 3.14 Principal → HOD section allotment not showing approved students
- Root: `_meta.department` never stored in approved_admissions; `_lastPart` mismatch for multi-segment dept keys like `Computer_Science_and_Engineering`.
- Fixed: `addStudentToNamelist` stores `_meta.department`; approved-listener composite-match on full normalized composite instead of last segment.

### 3.15 Enrollment-based student filtering (MarkEntry/Attendance/Reports/Dashboard)
- Reads `course_enrolments` doc; keeps enrolled only; falls back to all students if not present. Fixed collection name typo `course_enrollments` → `course_enrolments`; section doc suffix corrected.

### 3.16 Fee management (FeeOperations + student/Fees)
- Office: load from `users` + programme/dept/batch; fee from `fee_structure` doc computed by year/sem; date filter; Excel export with XLSX.
- student/Fees: AY→Sem grouping table; application-time payment scoping via `isFirstYearConfig` and `normHead` alias normalization (avoid e.g. Tuition double-charge); click-to-pay → alert "Payment gateway not connected".
- `CONSORTIUM` vs `Application Fee` mismatch → normalized head.
- First-semester-only `app payment applied` logic.
- Receipt dept converted via `formatDepartmentDisplay(dept, prog)` (`B.E. Civil Engineering`).
- `(student/Fees.jsx)` imports `formatDepartmentDisplay` and uses it for Receipt → "Department : B.E. Civil Engineering".
- Pending: real HDFC payment sync (`fee_payments` office→student via `uid`/`status='SUCCESS'`, `fee_payments` student→office via `studentId/examNumber`, `fee_payments.uid` capture + `fee_receipts`).

### 3.17 Question Paper Generator category/exam matching (lots)
- Subject course type detection from name (`LABORATORY`, `LAB`, `PRACTICAL`, `WORKSHOP` → `Laboratory`) and CourseBank `type` field.
- Strict category isolation: `availableCategories` from `course_type_weightage._category_config` for subject's course type only. `exam_weightage` per AY; specific AY + fallback. Fallback default categories per type (Theory → WRITTEN TEST/ACTIVITY/INDIRECT/ESE; etc.).
- `doesExamMatchCategory` direct CIA checkbox flag mapping (isAssignment/isActivity → Activity/Assignment, isPractical→Practical, isProject→Project, isIndirectAssessment→Indirect, isUniversity→ESE, none→Written Test).
- Unconditional category check (no bypass even explicitly configured `exam_weightage` IDs), name-match fallback when push IDs used as keys.
- Mutual exclusion: activity vs assignment etc. Later suppressed temporary ESE + Indirect Assessment from dropdown per user request.
- JSON subject title sanitization (parse `{"code":"MA25C05"...}`).
- Course outcomes multi-source fallback; when missing, fallback text "Understand and apply concepts of {subject}".
- KL/CO/PI strict validation (`/^(KL\s*|L)?[1-6]$/i` etc.) to avoid table-text corruption.
- Nested table preservation in questions (do not strip tables/paragraphs).
- LaTeX MathJax rendering: global script (TeX-AMS-MML_HTMLorMML), delimiters `\(`/`\)` + `\[`/\`\]`, wrapping `.math-tex` wrapper via ckeditor mathjax plugin, typeset with delays, CSS `table-layout: fixed`, `%` col-widths, orphan part headers (`break-after: avoid`) binding.
- QP storage: single parent doc; composite keys; `setSuffix` keys (`_Set_N`) for multi-set support.
- Registration by regulation/batch per semester: `displayedBatches` filter by course type config.

### 3.18 Multi-set overwrite bug (set keying)
- `qpSet` initialized from URL `set` param; auto-load uses effective set from URL; state reset effect reacts on `qpSet`; always pass `&set=Set N`, URL params `&examId` & `&examName`.
- QP setter task cards: task `progKey`/`department` resolve via name-map + code-to-canonical map of `courses` collection, dual-ID matching for set counts.
- QP setter task cards only count written test papers (`isWrittenTestQp`), pull from `qp_setter_assignments` live listener, only show when `hasExamDate`.
- Auto-selection: single option auto-select across dropdowns section→subject (section from URL or `subject_assignments` fallback).
- 2-day auto-hide setter cards after `toDate`.

### 3.19 IAScheduleCreation auto subject selection & centralization
- Subject list loaded from `syllabus_data` per dept/reg/sem; non-OBE excluded via `isNonOBE !== true`; flexible fuzzy reg/dept matching.
- Common vs department grouped rows; 7 columns (department, course code, course name, handling faculty, QP setter dropdown, set count, submission window), auto-selects setter when only 1 handling faculty.
- Exam event driven by `academic_calendar_events`; exam date picker restricted to working dates from event window; per-subject start/end time, auto FN/AN badge, bulk apply for dates/timing/sets.
- Save to `qp_setter_assignments/${batchKey}_${academicYearKey}_${semester}`; writes `assignments[code]`; notify `notifications`.
- Central cross-dept aggregation; common courses appear once.
- Fixed missing handlers for `BM3301`/`BM3352`: canonical code resolution via `getCanonicalCode` + multi-key handler lookup (rawNorm + canonicalNorm + fuzzy substring + start-year batch match + `extractStartYear` supporting `25_Batch`, `25 Batch (2025-29)`, `2025-2029`).
- Fixed stale assignment data wiped due to destructive useEffect on `[selectedExamId,semester]` — removed it + always include saved examDate in select.
- Fixed duplicate Exam Event dropdown via title+date-range dedupe + `getFormattedExamTitle` (regulation name replacement).
- Date normalization for mixed formats (`DD/MM/YYYY` etc.).
- Fixed subject code pill (reg-specific `EC3342` instead of stale CS code) via `courseBankNameMap`.
- Fixed course type pill from `course_type_configs` instead of subject name `LIT102` text.
- Fixed programme-department scoping (no leakage across B.Tech/M.E.).
- Fixed batch-semester validity (e.g. avoid `23 Batch Sem 3` bogus card), PG support (2 vs 4 years).
- PG batch duration check, `parseSyllabusDocId`, `syllabus_data` extraction moved from doc ID to data fields.
- PDF export 1-page layout, 4-signature block, no header overlap.
- Principal approve selector: match multiple assignment key variants (rawKey, rawCode, code, normCodeKey), exactly resolve `approved`.
- Principal Dashboard embedding: `embedded` prop in `IAScheduleCreation`; later replaced with read-only `PrincipalIAScheduleView`.
- Report/PDF use 12-hour time + FN/AN session badge.

### 3.20 HOD schedule approval duplicate keys / "shows previous set content" etc.
- All approvals `status: "Pending Principal Approval"` → Principal approve updates `status:"Approved"`, `as.approved=true`. Student IA tab only shows Approved schedules inside `qp_setter_assignments`.
- `_joiningAY` data explains why lateral entry students only appear in current/newer years.
- PrincipalDashboard Attendance quick action — modal fetches all `attendance` docs, builds `nameMap` from approvedAdmissions + students, parses dept from doc ID after batch Key (`parts.slice(2, batchIdx)` for progKey 2 segments), only active batches.

### 3.21 Admission Enquiry Quota (MQ vs GQ)
- Real-time + async `enquiries` lookup by multiple IDs (`applicationNo`, `enquiryId`, `regNo`, `examNumber`, `emailId`, `mobile`, `uid`).
- `getQuota` looks at many possible fields; `normalizeQuotaStr`/`isQuotaApplicable` so MQ vs GQ match accurately.
- Exact-match dedup (`isQuotaMatchExact`) so MQ gets ₹35,000 instead of GQ ₹15,000 for `Other Fee`, and GQ-specific fields not mixed.
- Alias: CONSORTIUM FEE ↔ Application Fee (to consume admission fee payment).
- `semPaid` capped at `headAmt` per head so over-payments don't distort cumulative.
- Quota shown on student profile; app payment sync across Enrollment Module and Fee portal (office + student) via concurrent listeners.

### 3.22 AdmissionConfirmation
- Reduced name/subject lists; added view action → `/admissions/confirm/{enquiryId}`; eliminated "Principal Approval Required" dead modal.
- `getAllEnquiries()` used for full exports; "Export Admitted PDF" button with page-wide fetch.
- Fixed portrait A4 PDF: logo drawn full usable width (182mm), 7 columns summing 180mm, header/footer, file `AdmittedStudentsList_YYYYMMDD.pdf`.
- Department format "B.E. Civil Engineering" via `formatDepartmentDisplay`.
- Tight cluster of class membership pages (Group/Section).
- `course_bank` mapping renamed subject to reg-specific `EC3342`.

### 3.23 Issues discovered during memory export gathering (read-only investigation)
- IAScheduleCreation common subject same QP setter displayed twice. Likely cause: in `handleAssignmentChange` writing to `assignments`, it maps only current `assignments` state with `assignments.map` and on `handleSaveAssignments` calls `saveAssignments` with atomic update keyed by `code`; but object key collision should unify keys by `normCodeKey`. Suspected culprit: object-literal key spread where same code variants (code string differ) each produce separate row keys plus auto-select assigning across row map. Need finish fix.
- Upload.jsx course code doesn't reflect latest (CourseBank edit) — `updateSubjectFromBank` uses `c.code === selectedCode`; if syllabus document stored older code and CourseBank updated, blank. Or `availableCourses` memo fetches `courses` where `programme===progKey, department===syllabusDept||'Overall', regulation`. If department key mismatch (e.g., "Overall" vs actual), list is incomplete; plus course code input is `disabled` when a stored code exists, so a code change does not refresh. Needs fix.
- VS Code pull error not yet investigated (`git status` shows only untracked files; no merge conflict present in working tree).

### 3.24 Student Report/MarkEntry portal
- MarkEntry shows enrolled students only; CSV generation uses application no→register mapping; `loadStudents` shows `regNo` priority; Batch/percentage course fills safe.
- Reports consolidated with `Total` column (sum CO1-5), dynamic `configuredCoKeys`, exam filter reads section-specific mark doc (`marksDocKey` with section suffix), "Overall" weighted using `course_type_weightage` grouped by category and weighted percentile display.
- MarkEntry absentee column only not for Assignment.

### 3.25 Reports RC/EE sidebar / layout
- Reports is realigned to full-width (main content container `w-full px-4 md:px-8` instead of max-w-7xl). Dynamic columns: show Admission No OR Register when either has value; CSV download sync.
- CoPoMapping/PoAttainment likewise full-width, `configuredCoKeys`, HOD only shows their own role's subjects (admin/any see all).
- IPR export page added.

### 3.26 PDF export layout notes (large lesson)
- Logo is a wide banner (`1206 × 127`). Must draw `logoW = pageWidth - margin*2`, compute height via ratio.
- Portrait preferred when ≤10-12 cols. use `doc.output('bloburl')` to preview first.
- For CO Survey style full-width tables, avoid trailing empty rows.
- Footer format: `"CKCET — Admitted Students List"` left, `"Page N"` right; date + count before footer.
- Must ensure column total widths ≤ usable width (`182mm` for portrait A4 with 14mm margin each side).
- Avoid full height (>270mm) rendering by chunking pages with `autoTable`.

---

## 4. Decisions Taken (Approach + Rationale)

1. **Single-source QP storage** — moved from parent-doc-summary + `versions` subcollection to **single parent doc**. Why: stale reads/summary drift; subcollection fetch required extra round trips; editing/versioning felt split. Risk mitigated by atomic `{merge:false?}` payload writes (we use normal `setDoc` with payload merged inside) & backward-compatible field reads.
2. **Faculty mark `filter`: treat ENROLLED not ALL students**. Why: "same-name but not enrolled" was polluting mark sheets; Course Enrolment already defines audience.
3. **Lateral Entry gating by `_joiningAY`** rather than migration: existing data has no joining year → treated as "always show" (backward compatible).
4. **Attendance compression via `records_json`** rather than deleting legacy field: safe on-write transition with `deleteField()` migration on next save; reads handle both via `getAttendanceRecords`. Why: no cold migrations, no permission surface expand.
5. **Academic Calendar-driven IA schedule instead of hardcoded** — exam-w schedule now syncs from `academic_calendar_events` + `exam_schedules`; roset resolves FN/AN via start time.
6. **Regulation/Batch-aware CIA config and Course weightage instead of global** — added AY-specific keys + default fallback. Why: saves old data untouched, allows selective overrides.
7. **`onSnapshot` > `getDocs` for AdminRoleConfig** — eliminated stale pagination cursor + total counts. Why: real-time mutations.
8. **Sidebar module grouping + `allPossibleItems` allow-list** — every new page must be added BOTH to `ALL_PAGES` AND to `allPossibleItems` AND module `itemIds`. This three-file sync was a repeated point of failure.
9. **Authority flow** — IA timetables: Exam Cell/HOD drafts Status `Pending Principal Approval`, only Principal approves and updates `assignments[code].approved = true`; Student tab reads its own dept/batch AY and only gets the `Approved` schedules.
10. **Activity approval mentor-first** (Mentor_Pending then department queue) — safe fallback if no mentor assigned (reverts to Pending+dept notification).
11. **PDF portrait preferred over landscape** when width budget allows; logo draws full usable width, col-widths ≤ 182mm.
12. **Receipt department via `formatDepartmentDisplay` (stripping `B_E_` prefixes)** instead of raw value, for brand safety.
13. **Excel/in-memory complete lists over Firestore pagination** for exports — pagination only for dashboard UI; export functions fetch full collection via `getAllEnquiries`/`onSnapshot`-merge.
14. **Subject code in Upload reflects Course Bank (canonical mapping)** — update `updateSubjectFromBank` / `selectedCode` handling to use canonical mapping so CourseBank edits propagate; pending final fix.

### 4.1 Recent pending decisions still under discussion
- IAScheduleCreation common-subject QP setter **duplicated** — need pinpoint whether `normCodeKey`/`handleAssignmentChange` writes duplicate per department or just display duplicate. Decision pending: **deduplicate display by common code + skip assignment wipe on code collision**.
- Upload course code patch — likely fix in `availableCourses` + normalizing raw `c.code` with `sanitizeKey` comparison and re-binding `selectedCode` when bank changes. Pending implement/verify.
- Fees — real-time `fee_payments` multi-key sync:
  - Office → student: `handleRecordPayment` already must stamp `uid: selectedStudent.id` and `status:'SUCCESS'`; need verify doc.
  - unify `fee_payments` data shape for `FeeOperations` vs `student/Fees`; pending test.
- IAScheduleCreation course type pill — repair fallback; live course regs map priority selection depending on AY.

---

## 5. Pending / Next Steps

1. **Create `memory-export.md`** at `outcomex` repo root and post full content in chat. (Being performed by this task.)
2. **IAScheduleCreation** — common-subject QP setter duplicated: implement single display + ensure assignment replace for same norm code; verify `handleAssignmentChange` atomic merge.
3. **Upload.jsx course code not reflecting** — update `availableCourses` matching + `selectedCode` updates when CourseBank changes; mark code field `disabled` only if unchanged.
4. **Fees.jsx first-year scoping confirmation** — user verify online payment does not double count; check `appPayments.map` + `isFirstYearConfig`.
5. **Admitted Students PDF visual check** — portrait A4, banner logo, column width, total A4 bounds; "Confirm?" with user.
6. **VS Code pull error investigation** — gather text output; repo currently clean/untracked; likely `git merge/rebase` state, git stash vs list. Run `git status`, `git fsck`, inspect `.git/index`.
7. **Activity `createdAt` format unification** (`step_activities` ISO string vs `activity_entries` Timestamp) — currently client-side sorted.
8. Build **RegNo assignment page** (admin uploads admissionNo→register mapping, updates both `student_index/{regNo}` & `student_section_index`).
9. MarkEntry search input to query `student_index` for dual-ID lookup.
10. Wire real HDFC gateway (createPaymentSession/verifyPayment/paymentCallback) end-to-end verified by actual sandbox capture.
11. Verify `course_bank` mismatch repair holds across departments; confirm `CourseBank` edit propagates UI in Upload and QPG.
12. Confirm Course Bank loading from Firestore rules (`course_bank`) on production environment.

---

## 6. Important Code Patterns / Firestore Collections / Doc-ID Formats

### 6.1 Firestore Collections
- `users` — `{ uid, name, email, role, programme, department, batch, status, _profile_data, _student_data, ... }`
- `student_index/{key}` — dual-ID mapping, `{ canonicalId, admissionNo, regNo, name, studentDocId, batch, section }`.
- `student_section_index/{studentDocId}` — per-section map of `{ admissionNo: { admissionNo, regNo, name } }`.
- `syllabus_data/{docId}` — subjects + semesters; key typically `${progKey}_${deptKey}_${regKey}` or `${progKey}_${deptKey}_${batchKey}`.
- `course_bank`, `courses`, `course_outcomes`, `course_outcomes/{code}_{deg}_{dept}_{year}_{sem}`, `course_type_weightage/${regulation}_${academicYear}`, `course_type_configs/${regulation}`.
- `subject_assignments/{compositeKey}` — flat composite: `${progKey}_${deptKey}_${batchKey}_${academicYearKey}_${semKey}(_Sec-X)`.
- `qp_setter_assignments/{batchKey}_{academicYearKey}_{semester}` — `{ assignments: { [code]: { code, name, departments, setterUid, setterName, numSets, fromDate, toDate, examDate, startTime, endTime, slot, approved } }, status, principalApprovedBy/At, principalApproved }`.
- `generated_qps/{compositeKey}.{qpId}` — single parent doc holding full payload (`parts`, `assignment_config`, `exam`, `subject`, `qp_html`, signatures,...).
- `enquiries/{id}` — admission records `status` (Padding/... statuses), `payments` array, `_meta.programme/_meta.department/_meta.batch`.
- `approved_admissions/{id}` — admitted students.
- `students/{id}` — merged with `_meta`, `_joiningAY`, `_student_data`.
- `activity_entries`, `step_activities`, `notifications`, `resource_requests`, `photocopy_applications`, `revaluation_applications`, `approved_admissions`, `students`, `approved_admissions`, `enquiries`, `fee_payments`, `fee_receipts`, `fees/{programmeKey}_{deptKey}_{batchKey}_{yearKey}_{semKey}`, `fee_structure/{programmeKey}_{...}`.
- `batch_sections/{batchKey}_{progKey}_{deptKey}_${semi cleanup?}` store `{ Sec-A: [...] }`.
- `academic_calendar_events` (type=Exam), `academic_calendar` general holidays, `semester_config` (programme/batch/oddEven/start/end/academicYear/semesterNumber).
- `activity_entries`, `step_activities`, `records_json`, `co_attainment/{docId}/exams/{examId}`, `mapping_summary`, `po_attainment`.
- `appraisal_config/{gross_salaries, increment_criteria, schedule, gross_salaries.historicalYears}`, appraisal collections `faculty_appraisals`, `hod_appraisals`, `non_teaching_appraisals`, `teacher_appraisals`.

### 6.2 Critical Doc-ID Formats
- Programme key: `formatProgrammeKey` (e.g. `B_Tech`, `B_E`, `M_E`, `UG`, `PG`).
- Department key: sanitized dept string: `B_E_ Bio Medical Engineering` → `Computer Science and Engineering` after stripping `B_E_`.
- Batch string cleaned: `25 Batch (2025-29)` → `2025-2029` via `sanitizeKey`; start-year extraction via `extractStartYear` supporting underscores (`25_Batch`).
- Academic year formats: `2025-2026`, `2025-26` (normalized via `normalizeAy`), fallback `s startYR-startYr+1`; 2-year PG vs 4-year UG batch duration.
- Composite subject key: `${progKey}_${deptKey}_${batch}_${academicYear}_${semester}(_Sec-X)` (assign).
- Generated QP key: `${sanitizeKey(exam)}${setSuffix}` composite for parent document, where `setSuffix = _Set_N`, nested field `[qpDocId]`.
- Section suffix `_${sanitizeKey(section)}` (e.g. `_Sec-A`).
- Composite student doc id (`approved_admissions`/`students`): `${batch}_${progKey}_${deptKey}(_${section})`.
- `student_index` key is admission number (or later reg no).

### 6.3 Code Patterns (MUST Follow)
- **1. Includes raw `uid` in queue keys**: `\`batchKey_progKey_regKey_${sKey}_${ayKey}_${semKey}\`` where `sKey` is subject key (course code).
- **2. Real-time for admin**: `onSnapshot(query(collection, ...))` + client-side filter; NOT `getDocs`.
- **3. Only one `in_progress` status at any time in todo tracking.**
- **4. Roles**: Layout filters menu based on `effectivePermissions`; `storeMasterOrAdmin` check in Layout. New pages **must** be added to ALL three: `AdminRoleConfig.ALL_PAGES`, `Layout.allPossibleItems`, module `itemIds` (else blank sidebar).
- **5. Always read before edit**: tooling rule to read file first (unless new).
- **6. use funcs not `firebase-admin` on client side**: imported only in `functions/`.
- **7. Multi-key Firestore reads**: use both `onSnapshot` for live and async merge for derived lists; filter by normalized `cleanStr` (remove non-alnum, uppercase).
- **8. `_joiningAY` pattern**: guaranteed for lateral entry; keep existing fallback none (undefined → always shown).
- **9. `default export` safety for VS Code type**: `const students = {...}` vs let in `utils.js`.
- **10. Firestore env in `firebase.ts`** uses `experimentalAutoDetectLongPolling`.
- **11. Attendance saving**: `records_json` serialization to bypass 1MB entity index limit; always `deleteField()` leftover `records`. Use `getAttendanceRecords` AND `parseStudentAttendanceVal` for all reads.
- **12. Universal app payments synced only for first academic year config (`isFirstYearConfig`)**, using `normHead` for alias matching.
- **13. Reading doc before add/update**: helper UTIL `getAssignmentForCode(code, next)` uses `normCodeKey` phases.
- **14. Batch matching**: `extractStartYear` logic — always extract four/two digit start.
- **15. `_joiningAY` and doc id regex**: parse via named-group regex to avoid underscore split.
- **16. PDF print standardized**: header (logo wide), two/three/four column footer, footer `Page X`, avoid >270mm; `doc.output('bloburl')`.
- **17. Navigation state safety**: Don't use default for undefined; `qpSet` initialize from URL.
- **18. CKEditor**: check status 'ready' before insert; destroy on component unmount when set count changes; `typesetMath` with delays.
- **19. Math macros**: wrap LaTeX in `<span class="math-tex">...</span>` before render.
- **20. Quality Validate meta**: `isValCO`, `isValKL`, `isValPI` regex forms for metadata safety.

### 6.4 Key Query Patterns in `src/lib/utils.js`
- `formatDepartmentDisplay(dept, prog)` — used for UI
- `formatProgrammeKey` / `formatProgDisplay` / `normalizeAy` / `normalizeBatch` / `sanitizeKey` / `extractStartYear` etc.
- `getRegulationForBatch(programme, batch)` — AY-aware regulation resolver.
- `parseSyllabusDocId`, `parseStudentDocId` & similar.
- `isMasterOrAdmin()` returns boolean.

---

## Conclusion
- Top notes: 12-items pending verification, 2 pending named fixes (IAScheduleCreation common QP setter duplicate; Upload course-code update). User wants **one-file + subsequent chat confirmation**, which this file delivers. All remaining implementation to follow.
- Build command for verification: `cd /home/suryaah/Downloads/outcomex && npx vite build` (passes, only auto-chunking warnings).
- Next immediate suggestions: fix IASchedule + upload code, validate Fees live payment once, verify Admitted PDF once, investigate VS Code pull error (working tree reportedly clean — likely stash/index state).

---
*End of memory-export.md — generated via opencode conversation export.*