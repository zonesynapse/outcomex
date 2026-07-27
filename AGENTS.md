## Summary of Changes

### 1. QPGenerator subjects not showing
- Changed assignmentRef from nested subcollection path to flat key path (`assignments/${batchKey}_${progKey}_${regKey}_${sKey}_${ayKey}_${semKey}`) in `src/pages/QPGenerator.jsx`
- Cleared Vite cache, restarted dev server

### 2. Dashboard section dropdown (student list filtering)
- Added section `<select>` next to Batch dropdown in `src/pages/Dashboard.jsx`
- Added section state, `availableSections`, `section` in data paths
- Listens to `batch_sections` collection for the selected batch; falls back to batch param default

### 3. Dashboard section values not showing
- Fixed `batch_sections` listener and `availableSections` derivation to match the working pattern from CoPoMapping/HODRoleConfig
- Added `section` to `fetchStudents` calls and filtered `studentList` display

### 4. PoAttainment section dropdown
- Added section state (`useState`), `batch_sections` listener, `availableSections` in `src/pages/PoAttainment.jsx`
- Added `section` to data paths: `actions_taken`, `survey_scores`, `attendance_data`

### 5. HODRoleConfig inter-dept request section-aware
- **QP Visibility**: Parses section from doc IDs, sends `section` in payload, saves QP docs with section suffix, displays section in QP uploaded list
- **CO Attainment**: Sends `section` in payload, saves `co_attainment` with section suffix, displays section in CO attainment grid
- **Faculty Cards**: Sends `section` in requests, displays "Section:" badge in faculty info cards
- **Request Display**: Shows "Section:" label in sent requests and "Req Section:" in received requests
- All based on `batch_sections` listener pattern in `src/pages/HODRoleConfig.jsx`

### 6. PoAttainment batch & section wise data read (Current)
- **summarySnap filter**: When section is selected, only mapping_summary docs ending with `_${sanitizeKey(section)}` are included. When section is empty, only docs WITHOUT section suffix (last part numeric = semester) are included — ensuring correct isolation.
- **parts extraction**: `if (section) parts.pop()` discards section suffix from doc ID before extracting `semKey`/`ayKey`.
- **coAttKey construction**: Appends `sectionSuffix` to coAttKey so it reads the section-specific co_attainment doc.

### 7. HOD filtering reverted to show all programmes/departments + own-subjects-only
- **What changed**: Removed `userProgramme`/`userDepartment`-based HOD filter from Reports.jsx, CoPoMapping.jsx, PoAttainment.jsx
- **Why**: HODs manage inter-department subject allocation in HODRoleConfig. If a CSE HOD allocated an ECE subject, they need the ECE department to appear in the dropdown so they can access CO-PO data for that subject. Same for cross-programme allocations. Showing all programmes/departments is safer than a restrictive filter.
- **Subject filter**: HOD in CoPoMapping now shows only subjects allocated to their own UID (not all faculty's subjects) when selecting a department. Admin/Principal still see all allocated subjects.
- **Cleaned up**: Removed unused `userProgramme`/`userDepartment` state vars and their setter calls from all three files.

### 8. QP storage refactoring (removed subcollection `versions`) — COMPLETED
- **Goal**: Remove dual storage (parent doc summary + subcollection full payload) → single parent doc with full payload
- **Changes in `src/pages/QuestionPaperGenerator.jsx`**:
  - `handleSaveAssignment`: writes full `payload` to `generated_qps/{key}.[qpId]` (no subcollection)
  - `handleSaveQuestionPaper`: writes full `payload` to `generated_qps/{key}.[qpDocId]` (no subcollection)
  - `checkExisting` (auto-load): reads `snapshot.data()?.[existingQpId]` from parent doc
  - `loadSavedPaper` (edit mode): reads `snapshot.data()?.[editId]` from parent doc
  - Fixed `qpDocId` → `qpId` variable name mismatch in `handleSaveAssignment` (line 2450 vs 2487)
  - Fixed brace mismatch from removed `if (snapshot.exists())` wrapper
- **Changes in `src/pages/MarkEntry.jsx`**:
  - `allQPs` listener: changed from subcollection `getDocs(collection('versions'))` → flat `Object.entries(docData)` iteration over parent doc fields
  - `fetchQP`: reads `parts`/`assignment_config` from `match` directly (full payload in parent doc)
  - All filtering (subjects, exams) unchanged — works on same payload fields present in summary
- **Changes in `src/pages/HODDashboard.jsx`**:
  - Modal reads `fullQPForModal` from `selectedQP` directly (no subcollection read)
  - `handleRecorrect`/`handleApproveByHOD` write to parent doc only
- **Changes in `src/pages/Dashboard.jsx`**:
  - Listing reads from parent doc fields only; removed `getDocs` import
- **Bug fix**: Subject dropdown empty in MarkEntry
  - **Root cause 1** (line 409): `assignmentCompositeKey` didn't include `section` suffix, so `subject_assignments` doc lookup failed when docs were created with section suffix (`B_Tech_CSE_2024-2027_2024-2025_3_Sec-A`). Added `sectionSuffix` to the key.
  - **Root cause 2** (line 75-84): `d.id.split('_')` extraction was wrong for programme keys with underscores (`B_Tech` → split to `["B","Tech"]`, `idParts[0]` returned `"B"` instead of `"B_Tech"`). Replaced with regex `/^(.+)_([A-Z]+)_(\d{4}-\d{4})_(\d{4}-\d{4})_(\d+)(?:_(.+))?$/` that correctly extracts progKey, deptKey, batch, ay, sem, and optional section.
  - **Root cause 3** (line 454): `section` was missing from the `useEffect` dependency array, so subject filter didn't re-run when section changed. Added `section`.
- **Current issue**: (`allQPs` listener may still fail silently — keep `console.log` check if subjects/exams still don't show)

### 9. Either/Or Q.No auto-increment fix
- **Problem**: After finalizing Either/Or QP, clicking Add Question used `qpQuestions.length + 1` which reset to `1a` instead of continuing sequentially after `5b` → `6a`.
- **Fix**: `handleAddEitherOrQuestion` (line 182) now uses `qbAvailableQNos` (expected Q.Nos from parts config) and finds the *first unused* Q.No via `normalizeQNo()`, instead of counting `qpQuestions.length`.
- `normalizeQNo` strips parentheses and normalizes e.g. `1(a)` → `1a`.

### 10. Assignment multi-question support (textarea per question)
- Added "Questions" dropdown (1–10) in QuestionPaperGenerator.jsx replacing the fixed "1 Question" label.
- `handleGenerateParts` creates N entries in `assignmentConfig` array with distributed marks for the last question (remainder).
- Each question card renders: per-question marks input, textarea, CO mappings with PI selectors.
- All validation loops (`handleSaveAssignment`, `handleFinalizeQuestions`, `handleGenerateTable`, `getCurrentStructureTotalMarks`, forward-QP) now sum/validate across all N questions.
- Added "Overall Mapped PO / PSO" table in both `questionPaperUtils.js` and the local `getQuestionPaperHTML` in `QuestionPaperGenerator.jsx`.

### 11. Per-question Domain & KL selectors for Assignment
- Removed global `assignmentKL`/`assignmentKLDomain` state and their header dropdowns from the Assignment UI section.
- Added `kl` (default `'L1'`) and `kldomain` (default first domain key) fields to each `assignmentConfig` entry in `handleGenerateParts`.
- Per-question Domain/KL dropdowns rendered inside each question card above the textarea, updating individual `assignmentConfig[qIdx]` entries.
- HTML rendering (`getQuestionPaperHTML`) updated: header no longer shows global domain; per-question KL shown as `q.kl` in table.
- All save payloads (`handleFinalizeQuestions`, `handleSaveAssignment` × 2, forward-QP) now write `assignment_kl: ''` and `assignment_kl_domain: ''` — per-question data lives inside `assignment_config`.
- Dead state declarations `assignmentKL`/`setAssignmentKL`/`assignmentKLDomain`/`setAssignmentKLDomain` removed.

### 12. Fixed all remaining stale references to assignmentKL/assignmentKLDomain
- After the per-question refactor, 6 stale references remained (cleanup effect, save payloads) — replaced with empties or correct states.

### 13. Per-question CKEditor for assignment questions (replaces textarea)
- Replaced `<textarea>` with a `<div>` wrapper (`editorWrapper_{qIdx}`) per question card.
- Added `useEffect` (keyed on `assignmentConfig.length`, `showParts`, `assessmentType`) that imperatively creates `<textarea>` inside wrapper and calls `CKEDITOR.replace()` for each question.
- On `instanceReady`, sets editor content from `assignmentConfig[qIdx].question`.
- On `change`, syncs content back to state via functional `setAssignmentConfig` update — avoids stale closures.
- On effect re-run (e.g., question count changes), destroys old instances and recreates.

### 14. "Project" assessment type in QuestionPaperGenerator (mirrors Activity)
- Added "Project" option to assessment type `<select>` dropdown.
- `isAssignmentOrProject` helper (`useMemo`) covers both `'Assignment'` and `'Project'`.
- `filteredExams` 3-way filter: `'Assignment'` → `config.isAssignment`, `'Project'` → `config.isProject`, other → `!config.isAssignment && !config.isProject`.
- `displayedBatches` filter updated to check `config.isProject` when assessmentType is 'Project'.
- All `assessmentType === 'Assignment'` checks replaced with `isAssignmentOrProject` in:
  - `handleGenerateParts`, `handleGenerateTable`, `handleFinalizeQuestions`, `handleSaveAssignment` (both variants), `handleSaveQuestionPaper`, `getCurrentStructureTotalMarks`, `calculatePoMarks`, `savedPoMarks`, `activePoMarks`, `displayedBatches`, CKEditor effect, payload `assignment_config` writes, AI prompt structure, Questions/Parts label, and assignment config card rendering.
- `getQuestionPaperHTML` shows "Project" header text when `assessment_type === 'Project'`.
- `deriveCOSummaryFromQp` handles `qp.assessment_type === 'Project'`.
- Parts-loading `useEffect` early-returns when `isAssignmentOrProject` is true.
- All existing "Exam" and "Activity" functionality unchanged.

### 15. MarkEntry.jsx section filter not re-fetching data
- `section` was missing from the data-loading `useEffect` dependency array at `src/pages/MarkEntry.jsx:803`
- Changing section didn't re-fetch students or marks — the section filter appeared non-functional
- **Fix**: Added `section` to the dependency array

---

## Summary of Changes (Student Module — Dual-ID Lookup & Marks)

### Goal
- Enable dual-ID lookup for students (admission number + register number) across the system
- Show marks entered by faculty exam-wise per subject in student Marks.jsx
- Make student module pages mobile-responsive

### Constraints & Preferences
- Previous batch data (keyed by regNo) must remain completely untouched
- No re-upload of existing namelists or migration of existing marks data
- Admission flow (Principal approval → HOD section assign → students collection) stays unchanged
- MarkEntry.jsx saves marks to both `marks/{docId}` and `co_attainment/{docId}/exams/{examId}` — student Marks.jsx must read correctly from these
- Students primarily access via mobile — all student pages must be responsive

### Done
- Added "Total" column to consolidation view table in Reports.jsx (sums CO1–CO5 per student and per average)
- Created `student_index/{admissionNo}` individual doc written when HOD assigns section (HODDashboard.jsx)
- Created `student_section_index/{studentDocId}` bulk-lookup doc for section-level mapping (HODDashboard.jsx)
- MarkEntry.jsx: student loading enriched with regNo from `student_section_index` (read once per section); CSV upload fallback maps regNo → admissionNo for matching; regNo displayed in green parentheses; template/excel download uses regNo when available
- EnquiryTable.jsx: edit button condition removed entirely — now shown for ALL statuses (no restrictions)
- FeeOperations.jsx: fixed swapped Sem and Fee Head columns in Fee Structure table body
- Student Fees.jsx: Fee Structure now shows Academic Year | Sem | Fee Head | Amount columns with grouping (like FeeOperations.jsx), table borders added, Amount header center-aligned
- Student Fees.jsx: added click-to-pay flow — clicking fee head or amount opens confirm → modal with amount + payment mode → "Payment gateway not connected" alert
- StudentLayout.jsx: sidebar now shows college logo image instead of GraduationCap icon (matches faculty Layout.jsx)
- Student pages mobile responsive: added `overflow-x-auto` to both tables in Fees.jsx; added `md:px-8` / `md:p-8` to Dashboard.jsx and Profile.jsx outer containers
- Upload.jsx old data (keyed by regNo) shows in Register Number column only — Admission Number column hidden until data exists
- New admission flow data shows Admission Number column — Register Number column hidden until regNo is assigned
- **Student Marks.jsx**: Rewritten to read from `marks` collection directly — fetches marks per exam per subject entered by faculty in MarkEntry.jsx. Groups by subject, shows exam-wise table with mark types (CO Wise, Overall, Assignment, Internal) each rendered with appropriate detail (CO scores, grade, question-level marks, Part A/B/C). Handles absences, sorting, loading/empty states. (`src/pages/student/Marks.jsx`)

### In Progress
*(none)*

### Blocked
- RegNo assignment page (future) — needs to be built to map admissionNo → regNo and update both `student_index` and `student_section_index`

### Key Decisions
- `student_index/{admissionNo}` stores `{ canonicalId, admissionNo, regNo: "", name, studentDocId, batch }` — one doc per admission number
- `student_section_index/{studentDocId}` stores all students in a section as fields `{ admissionNo: { admissionNo, regNo, name } }` — single doc per section for efficient bulk lookup
- When regNo is assigned later, a second `student_index/{regNo}` doc will be created pointing to the same `canonicalId`, plus `student_section_index` updated with the regNo value
- MarkEntry direct string-match fallback: `const targetReg = newMarksData[regno] ? regno : (sectionIndexLookup[regno] || regno)` — tries exact key first, then index
- Reports.jsx column visibility: `showAdmNoCol = students.some(s => s.admNo)` and `showRegNoCol = students.some(s => s.regNo)` — column headers and cells only render when at least one student has a value
- For old Upload.jsx data: `admNo=""` (Admission Number column hidden), `regNo=student.reg` (key treated as register number)
- For new admission data: `admNo=student.reg` (Admission Number column shown), `regNo` from index or empty (Register Number column hidden until assigned)
- Stats cards in AdmissionEnquiries are computed by `getEnquiriesStats()` which runs Firestore `getCountFromServer` queries on the `status` field — changing a student's status automatically reverses the counts

### 16. QPG HOD programme/department filter fix
- **Problem**: `filteredProgrammes` and `filteredDepartments` only filtered for `Faculty` role — HOD saw all programmes/departments
- **Root cause 1**: `userProgramme`/`userDepartment` were not fetched from the `users` doc for HOD (only `userRole` was)
- **Root cause 2**: `filteredProgrammes` had `if (userRole !== 'Faculty') return true;` — HOD passed through unchecked
- **Root cause 3**: `filteredDepartments` used `userRole !== 'Faculty'` — HOD got all departments
- **Root cause 4**: `subject_assignments` listener only ran for `Faculty`, so `facultyAssignPrefixes` was empty for HOD
- **Fixes**:
  - Added `userProgramme`/`userDepartment` state variables and loaded them for all roles (line 55-56, 397-398)
  - Extended `subject_assignments` listener to also run for `HOD` role (line 400)
  - `filteredProgrammes` (line 846-851): HOD sees their own `userProgramme` + programmes from `derivedProgs`
  - `filteredDepartments` (line 894-903): HOD sees all depts of their own programme, otherwise filtered by `derivedDepts`

### Next Steps
1. Build RegNo assignment page (admin uploads admissionNo → regNo mapping CSV, updates both indexes)
2. Update MarkEntry.jsx to add a search input that queries `student_index` for dual-ID lookup

### Relevant Files
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/HODDashboard.jsx`: Section assign handler writes `student_index/{s.reg}` and `student_section_index/{secDocId}` (lines 783-804)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/MarkEntry.jsx`: Student loading enrichment (line 749-763), CSV upload fallback (line 167-184), regNo display in table, template/excel download uses regNo, saves to `marks` and `co_attainment` collections
- `/Users/ckcollege/Downloads/OBE/outcomex/src/components/EnquiryTable.jsx`: Edit button shown for all statuses (no condition)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/FeeOperations.jsx`: Fee Structure table column order fixed (Sem before Fee Head)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/student/Fees.jsx`: Fee Structure grouped by Academic Year → Sem, table with borders, click-to-pay modal, overflow-x-auto on both tables
- `/Users/ckcollege/Downloads/OBE/outcomex/src/components/student/StudentLayout.jsx`: Sidebar shows college logo image (same as faculty sidebar)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/student/Marks.jsx`: Reads from `marks` collection — shows marks exam-wise per subject from faculty MarkEntry data
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/student/Dashboard.jsx`: Added `md:px-8` responsive padding
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/student/Profile.jsx`: Added `md:px-8`, `md:p-8` responsive padding
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/AdmissionConfirmation.jsx`: "Principal Approval Required" section replaced with "Waiting for Principal Approval" message + Back to List only (lines 1033-1046)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/Reports.jsx`: Student loading enriched with `admNo` + `regNo` (lines 722-787); conditional column visibility (showAdmNoCol/showRegNoCol computed at line 66); all tables and CSV download updated
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/Upload.jsx`: Unchanged — old CSV uploads use Exam No as the key, which Reports.jsx now treats as register number (no admission number)
- `/Users/ckcollege/Downloads/OBE/outcomex/src/pages/PrincipalDashboard.jsx`: Has Admit/Reject buttons — correct location for these actions
- `/Users/ckcollege/Downloads/OBE/outcomex/src/services/enquiryService.js`: `getEnquiriesStats()` at line 421 — queries `getCountFromServer` for each status, stats reverse automatically when status changes

### 24. FacultyDashboard assigned subjects not showing (flat doc ID parsing)
- **Problem**: `assignedGroups` computation in `src/pages/FacultyDashboard.jsx` used nested `Object.entries` iteration (expecting `{ deptKey: { batchKey: { ... } } }` subcollection-style nesting), but HODRoleConfig saves with flat composite doc IDs (`B_Tech_CSE_2024-2027_2024-2025_3`) and flat data (`{ uid: [codes] }`). The nested iteration never finds the current faculty's UID, so assigned subjects appear empty.
- **Fix**: Replaced nested iteration with flat doc ID parsing (same approach as HODRoleConfig's `allAssignments` listener) — splits composite key by `_`, extracts progKey (handling multi-part), dept, batch, ay, sem, optional section, then checks `doc.data()[currentUid]` directly.

### 25. PaymentEntries facultyCode field added
- Added `facultyCode` input field next to faculty name in both New Entry and Bulk Entry member rows in `src/pages/PaymentEntries.jsx`
- Added `facultyCode` to `memberCash` helper, initial states, addMember/addCard defaults, save payloads, reset states, CSV export, and expanded member view
- Added `facultyCode` to `memberCash` in `src/pages/PaymentReports.jsx` for reports/claim form display
- ClaimFormModal shows faculty code in "Faculty Code & College" field (both inline and print HTML)

### 18. Reports.jsx: dynamic CO keys from COConfiguration + assignment-based access
- **CO Max Marks + Consolidation**: Added `configuredCoKeys` state + `useEffect` to fetch `course_outcomes` doc for actual CO count. `consolidationCoKeys` useMemo prefers configured keys, falls back to `consolidationData.maxMarks` keys, never hardcodes CO1-CO5.
- **Removed all CO1-CO5 fallbacks** from `maxMarks` default (now `{}`), table header, student cells, total cell, CO Average row.
- **Layout.jsx**: Renamed "Examinations" sidebar label → "COE".
- **Assignment-based view access**: Reports.jsx, CoPoMapping.jsx, Dashboard.jsx — removed `if (userData.role === 'Faculty')` guard around `subject_assignments` listener. Now ALL roles populate `assignedProgs`/`assignedDepts`.
- `filteredProgrammes`/`filteredDepartments` now check `assignedProgs.length > 0` instead of `userRole === 'Faculty'`.
- **QP/subject filter** changed from `userRole !== 'Faculty' || userAssignments.includes(...)` → `userAssignments.length === 0 || userAssignments.includes(...)` in Reports.jsx, Dashboard.jsx, CoPoMapping.jsx (all occurrences).
- CO Max Marks grid changed to `auto-fit, minmax(130px)` for responsive card sizing; header left-aligned.

### 19. QP Converter — client-side DOCX conversion tool
- **Created `src/utils/qpConverter.js`** — full port of Python Flask `app.py` to browser JS:
  - `parseDocx(file)` — unzips DOCX with JSZip, parses `word/document.xml` via DOMParser, extracts metadata (semester, department, subject, regulation) and question tables (Part A: Q.No/Question/Unit/KL/CO; Part B: Q.No/Question/Marks/Unit/KL/CO with OR rows).
  - `generateDocx(data)` — fetches template from `/question_paper_template.docx`, modifies `document.xml` (paragraph fills, table cell fills, font application), re-zips, returns Blob.
  - **EndSem format detection**: regex-based extraction of semester (ordinal + "Semester"), department (via DEPT_MAP normalization), subject code+name, regulation.
  - **IAT format detection**: label-value matching from table cells (degree/branch, course code, year/semester, etc.).
  - Font: `Century Schoolbook` 12pt applied to all runs.
- **Created `src/pages/QPConverter.jsx`** — full UI:
  - Drag-and-drop/click upload zone for `.docx` files.
  - 3-step indicator: Upload → Preview → Download.
  - Preview panel: metadata chips (semester, dept, subject, format) + Part A/B question tables.
  - Output format selector (DOCX download or PDF via browser print dialog).
  - Download button, New File reset, loading/error states.
  - Info card noting client-only processing (no server upload).
- **Route**: `/qp-converter` in App.tsx (under COE parent group).
- **Sidebar**: "Question Paper Converter" added to `allPossibleItems` and to the COE module `itemIds` in Layout.jsx.
- **Template**: `public/question_paper_template.docx` copied from zonesynapse.

### 20. AdminRoleConfig ALL_PAGES includes QPConverter
- **Problem**: Admin couldn't see QPConverter page in Role Config because `ALL_PAGES` didn't include `qp-converter`.
- **Fix**: Added `'qp-converter'` to `ALL_PAGES` array in `src/pages/AdminRoleConfig.jsx`.

### 21. Attendance.jsx report preview shows daily records + section filter + cumulative flow
- **Report table preview** (Attendance.jsx): Added daily record columns (P/OD/A) per date between summary columns and student rows — preview now matches PDF output.
- **AdminRoleConfig ALL_PAGES**: Added `'attendance'` to `ALL_PAGES`.
- **Attendance.jsx section support**: Added section dropdown (`batch_sections` listener), `section` in record keys (`att_${batchKey}_${progKey}_${deptKey}_${ayKey}_${semKey}_${subjectKey}_${section}`), `section` in CSVs (template generation uses section-suffixed doc IDs for `subject_assignments` lookup), and `section` in report filtering.
- **Attendance flow**: Total Classes auto-increments on first save for a period (based on `recordKeysSet` absence). "Attended" is computed as `totalClasses - absentList.length` (read-only cumulative). Percentage computed from `(attended / totalClasses) * 100`.
- **Same-date different-period support**: Period is mandatory before save. Record keys use `date_P{period}` compound key (e.g., `2025-03-15_P2`). Records editor finds existing entries by date, and per-period entries are added/updated independently.
- **Default periods**: When no timetable is configured, periods 1–8 are used by default.
- **Edit mode**: When editing an existing record, `currentEditRecord` tracks which record is being edited. No auto-increment or auto-advance during edit. Save updates the existing record in both state and Firestore.
- **Record deletion**: Delete button per record row removes only that specific date+period entry from state and Firestore.
- **Navy blue header**: Changed `handleSaveAttendance` header card to navy gradient (`from-blue-800 via-blue-900 to-indigo-950`) for "Attendance Entry".
- **Removed subtitle**: Removed the subject/period/classes subtitle line from the attendance entry header.
- **Total classes read-only**: The "Total Classes" input is now `readOnly` with `tabIndex={-1}`, auto-incremented when a new period's first record is saved (no manual edit).
- **Multi-period report filter fix**: `handleGenerateReport` date filter now extracts the date part from compound keys (`2025-03-15_P2` → `2025-03-15`) before comparing with `fromDate`/`toDate`. Previously compound keys on the boundary date were excluded because `"2025-03-15_P2" > "2025-03-15"` in string comparison.
- **PDF export improvements**: `handleExportReport` is now async; subject JSON parsed into readable format (Subject: CEC340 - Computer Networks | Batch: 2023-2027 | Semester: 6 | Section: Sec-A); college logo (`public/logo.png`) fetched as base64 and added to first page; portrait default with landscape only when >10 columns; column widths tuned for Total/Attended/Absent/% headers to prevent wrapping; `startY` dynamically placed after logo. PDF opens in new tab via `doc.output('dataurlnewwindow')` for preview before download.

### 22. Reports.jsx: exam dropdown — section filter + "Overall" weighted calculation
- **Section-based exam filter**: Added `section` to the `marksDocKey` (marks doc ID); only exams with existing marks data for the selected section appear in the exam dropdown (prevents showing stale exams from other sections).
- **Missing dep fix**: Added `enteredInternalExams`, `enteredInternalExamIds` to data-loading `useEffect` dependency array — was missing, causing intermittent stale data or errors.
- **"Overall" exam option — REWORKED (Jul 3)**: Added "Overall (Weighted)" as an extra option in the exam `<select>`. When selected, reads `course_type_weightage` doc to get weighted exam percentages, calculates `SUM(marks * weight)/SUM(maxMarks * weight) * 100` per student. Falls back to equal-weight average if no weightage doc found. Displays overall percentage. **Later reworked**: The option now shows a table with all exams belonging to the subject's course type, grouped by category (Written Test, Activity, etc.), showing scored/max, percentage, and weighted contribution per exam per student. (`src/pages/Reports.jsx`)
- **Course type badge**: Shows badge (Theory/Lab/Project/etc.) next to subject dropdown based on `course_type` from `subject_assignments`. (`src/pages/Reports.jsx`)
- **Cleaned up**: Removed leftover `window._debugOverall` debug assignment. (`src/pages/Reports.jsx`)

### 23. CoPoMapping.jsx: CO display from course_outcomes only
- **Problem**: CO table headers showed hardcoded CO1–CO5 even when course had fewer COs (e.g., CO1–CO3 only).
- **Fix**: Replaced static `['CO1','CO2','CO3','CO4','CO5']` with `configuredCoKeys` fetched from `course_outcomes` doc — only configured COs are displayed in the table. (`src/pages/CoPoMapping.jsx`)

### 24. MarkEntry.jsx: Absent column for Project & Practical types
- **Problem**: `showAbsentColumn` was `false` for Practical (and Assignment) — Project/Practical faculty couldn't mark students as absent.
- **Fix**: Changed `showAbsentColumn` from `markType !== 'Assignment' && markType !== 'Practical'` to `markType !== 'Assignment'` — absent column now shows for Project, Practical, CO Wise, Overall, and all other mark types. (`src/pages/MarkEntry.jsx:805`)

### 26. Academic Calendar — Semester Configuration + FacultyDashboard active semester filter
- **Goal**: Integrate Academic Calendar events into FacultyDashboard timetable (holidays in red with reason); add semester configuration in AcademicCalendar to drive which semester's data shows in FacultyDashboard
- **AcademicCalendar.jsx** (`src/pages/AcademicCalendar.jsx`):
  - Added `semester_config` collection read/write UI: inline form with Programme/Batch/Odd-Even/StartDate/EndDate fields, real-time computed preview of academic year + semester number
  - List view with edit/delete buttons for existing configs
  - Uses `useDepartments()` for programme dropdown, `getRecentBatches()` for batch dropdown
  - Computation: Odd (Jul-Dec) → `academicYear = startYear-startYear+1`; Even (Jan-Jun) → `(startYear-1)-startYear`
  - `semesterNumber = (yearNumber-1)*2+1` for Odd, `(yearNumber-1)*2+2` for Even
  - Only visible to Admin role
- **FacultyDashboard.jsx** (`src/pages/FacultyDashboard.jsx`):
  - Added `semesterConfigs` state + `onSnapshot` listener on `semester_config` collection
  - Added `activeSemesters` useMemo: finds configs where `today >= startDate && today <= endDate`
  - Added `visibleGroups` useMemo: filters `assignedGroups` to matching `programme + batch + semesterNumber`
  - When no semester configs exist (empty array), ALL assigned groups are shown (backward compatible)
  - Timetable fetching, assigned subjects display, stats, and timetableGroups all use `visibleGroups`
  - QP context filtering (`isInAssignedContext`) still uses full `assignedGroups` list (all semesters)
  - No changes needed for `_` -> `u` or `\t` -> `t` or other unicode characters

### 27. PrincipalDashboard Attendance quick action — department-wise absentee modal
- **Problem**: Clicking Attendance in Quick Actions navigated to `/attendance` page instead of showing a summary.
- **Fix**: Changed Attendance action from `href: "/attendance"` to `onClick: "attendanceModal"`. Quick action button rendering checks for `onClick` first (calls `openAttendanceModal()`), falls back to `navigate(href)`.
- **Data flow**: `openAttendanceModal()` fetches ALL attendance docs via `getDocs(collection(db, 'attendance'))`, builds a `nameMap` from `approvedAdmissionsDocs` + `studentsList`, then for each attendance doc: parses dept from doc ID (progKey=2 segments, dept=segments between progKey and batch), filters to active batches only, checks each record for today's date, collects students with `hours === 0 || false`.
- **Modal UI**: Date picker (defaults to today), department selector chips with absent counts, "All" view shows per-dept lists, single-dept view shows expanded grid. Each student card shows avatar initial, name, and regNo. Loading spinner and "No Absences Found" empty state.
- **Doc ID parsing**: Attendance doc ID format is `{progKey}_{deptKey}_{batch}_{ay}_{sem}_{subjectCode}[_Sec-{section}]`. progKey is always 2 segments (e.g., `B_E`, `B_Tech`), so deptKey = `parts.slice(2, batchIdx).join('_')` where `batchIdx` is the index of `YYYY-YYYY`. This handles multi-word dept keys like `Computer_Science`.
- **Active batch filter**: Only active semester batches are included (same as student strength).

### 28. Activity Module — NBA/NAAC Compliance Activity Management System
- **Source**: CKCET_Activity_Registry.xlsx (53 activities), OutcomeX_Activity_Module_DeveloperBrief.docx, OutcomeX_Activity_Compliance_Design_Document.docx
- **Structure**: Part A (21 Student Activities), Part B (9 Department Activities), Part C (13 Faculty Activities) — each with NBA/NAAC/NIRF criterion mapping, evidence requirements, and approval workflow
- **Files created**:
  - `src/data/activityRegistry.js` — Complete activity registry with fields, validation, evidence specs, multi-row support
  - `src/pages/ActivityList.jsx` — Tabbed list (Student/Faculty/Dept), filters (batch, dept, section, status, activity code, search), stats cards, review modal with evidence preview, approve/reject/return actions, CSV export
  - `src/pages/ActivityEntry.jsx` — Dynamic form per activity type, multi-row for internships/MOOCs/publications, evidence upload (PDF/JPG/PNG, 10MB, max 5), draft save & submit for approval, auto-fills user profile
- **Firestore collections**: `activity_entries` (parent table), `notifications` (approval alerts)
- **Routing**: `/activities` (list), `/activities/:code/new` (new entry), `/activities/:code/edit/:id` (edit)
- **Layout integration**: New "Activity" module in sidebar with 6 items: Student Activities, Faculty Activities, Department Activities, Approval Queue, Monthly Reports, NBA Export
- **Approval workflow**: Faculty submits → HOD reviews (approve/reject/return with comments) → auto-notification → IQAC consolidation
- **NBA/NAAC mapping**: Each activity tagged with criterion codes (C1–C9, NAAC 1.1–7.2) for auto-extraction in reports
- **Follows STEP module patterns**: Real-time listeners, role-based filters, status tabs, evidence preview, gradient headers, pixel-perfect Tailwind UI

### 29. Lateral Entry — Joining AY filtering for MarkEntry/Attendance
- **Problem**: Lateral entry students admitted mid-batch (e.g., joining batch 2024-2028 in AY 2025-2026) appeared in MarkEntry/Attendance for ALL academic years of their batch, including past years (AY 2024-2025) where they hadn't yet joined.
- **Fix**: Store `_joiningAY` (academic year of joining) per student in the `students` doc and filter it in MarkEntry/Attendance — lateral entry students only show from their joining AY onwards.
- **Storage** (`_joiningAY: { regNo: academicYear }`):
  - `PrincipalDashboard.jsx` `addStudentToNamelist` (line 313): Store `app.academicYear` per student in `approved_admissions._joiningAY`
  - `AdmissionConfirmation.jsx` `addStudentToNamelist` (line 263): Store `data.academicYear` per student in `students._joiningAY`
  - `HODDashboard.jsx` section assignment (line 1445): Copy `_joiningAY` from `approved_admissions` to the `students` doc when assigning section
- **Display filtering**:
  - `MarkEntry.jsx` (line 821): After loading student list, filter out students whose `_joiningAY[reg]` > selected `academicYear`
  - `Attendance.jsx` (line 540): Same filter applied when building `masterListObj` from the `students` doc
- **Backward compatibility**: Students without `_joiningAY` (existing data) are always shown (unfiltered)

### 30. Principal → HOD section allotment not showing approved students
- **Problem**: After Principal clicks "Admit" in PrincipalDashboard, the student didn't appear in HODDashboard's Section Allotment popup.
- **Root cause 1** (PrincipalDashboard.jsx): `addStudentToNamelist` never stored `_meta.department` in the `approved_admissions` doc — HODDashboard's primary matching path (line 201-204) used `data._meta.department` but it was undefined.
- **Root cause 2** (HODDashboard.jsx): The fallback doc ID parsing used only `parts[last]` (last segment) to match the department, which fails for multi-word dept names like "Computer_Science_and_Engineering" where `lastPart = "Engineering"` doesn't match `hodNorm = "computerscienceandengineering"`.
- **Fixes**:
  - `PrincipalDashboard.jsx` `addStudentToNamelist` (line 313): Added `_meta: { ...(existingData._meta || {}), department: app.department }` to the approved_admissions doc
  - `HODDashboard.jsx` approved_admissions listener (line 207-213): Replaced `lastPart` matching with full composite string match after batch — `normComposite.includes(hodNorm) || hodNorm.includes(normComposite)` — which correctly matches multi-segment dept keys

### 31. Attendance/MarkEntry enrollment-based student filtering
- **Problem**: Both pages showed ALL uploaded students regardless of whether they're enrolled in the subject's `course_enrolments` doc. MarkEntry had a broken attempt (wrong collection name `course_enrollments` with double `l` and wrong doc ID format).
- **Fixes**:
  - `MarkEntry.jsx` (line 834-837): Fixed collection name `course_enrollments` → `course_enrolments` (single `l`), removed `sectionSuffix` from doc ID, used `sanitizeKey(subject)` instead of raw `subject` — doc ID now matches CourseEnrolment's save format exactly.
  - `MarkEntry.jsx` (line 943): Fixed collection name `course_enrollments` → `course_enrolments` in `toggleStudentEnrollment`.
  - `Attendance.jsx` (line 487-507): Added enrollment filter block after fetching `masterList` — reads `course_enrolments/{progKey}_{deptKey}_{batchKey}_{yearKey}_{semNum}_{subjectKey}`, preserves `_meta`/`_order`/`_joiningAY`, keeps only enrolled students. Falls back to showing all students if enrollment doc doesn't exist (backward compatible).
  - `Dashboard.jsx` (line 675-689): Added enrollment filter in `onSnapshot` callback for "consolidation"/"log-report" modules — reads `course_enrolments` doc, filters student list before setting state. Added `selectedSubject`, `semester`, `academicYear` to dep array.
  - `Reports.jsx` (line 1098-1112): Added enrollment filter inside async IIFE for "consolidation"/"internal"/"log-report" modules — reads `course_enrolments` doc, filters student list after regNo enrichment. Added `selectedSubject`, `semester`, `academicYear` to dep array.

### 31b. CourseEnrolment auto-select user programme/department
- **Problem**: Faculty/HOD had to manually select programme and department each time.
- **Fix**: Added `onAuthStateChanged` listener that fetches `users/{uid}` doc and auto-sets programme+department for non-Admin users. Made both dropdowns `disabled` with `cursor-not-allowed` when user-locked. Admin users (no userProgramme) can still freely change.

### 32. AdminRoleConfig role/department/approve not reflecting in real-time
- **Problem**: `loadUsersPage` used `getDocs` (one-time fetch) with cursor-based pagination. After mutations (role change, department change, approve), calling `refreshPage()` didn't reliably show the update — required full browser refresh.
- **Root cause**: Paginated `getDocs` with `startAfter` cursors meant the re-fetched page might exclude the updated document due to cursor position. Additionally, the `getCountFromServer` call showed stale totals.
- **Fix**: Replaced `loadUsersPage`/`getDocs` with `onSnapshot` real-time listener on the `users` collection. All non-student users are now stored in `users` state and filtered/sorted/paginated client-side via `useMemo`. Removed `pageCursors`, `hasMore`, `totalUserCount` state vars, and all `refreshPage()` calls. Removed unused Firestore imports (`orderBy`, `limit`, `startAfter`, `getCountFromServer`).

### 33. "Consider for the period" (Event) checkbox in Attendance.jsx
- **Goal**: Allow faculty to mark attendance for events (sports, workshop, guest lecture) without counting toward the subject's attendance stats.
- **What changed**:
  - **Attendance.jsx**: Added `isEventAttendance` (checkbox) and `eventName` (text input) state. When checkbox checked: topicTaught/teachingAid/teachingMethodology fields hidden, event name input shown, validation for topic/teaching fields skipped. Save logic stores `isEvent: true`, `eventName` in the record, sets topic/teaching fields to "". `cumulativeAttended` skips event records. `handleSubjectChange` resets event state. Auto-load effect restores event state when loading existing event records.
  - **student/Attendance.jsx**: `rawEntries` now includes `isEvent`/`eventName`. Subject-wise stats skip event entries (not counted in overall%). Date-wise rows show event name as subject name and "-" as code, with faculty name who marked attendance.
  - **FacultyDashboard.jsx** (`facultyAttendanceRows`): Event records show "- (Event)" as code and event name as subject name in the Attendance Status table.
   - **HODDashboard.jsx** (`attendanceWithPeriods`): Event records show "-" with "(Event)" badge as subject code and event name in amber styling in the Attendance Status table. All three row-push locations updated to pass `isEvent` flag.

### 34. FeeOperations.jsx rewrite — `users` collection + date filter + Excel export
- **Problem**: FeeOperations showed a static UI with hardcoded/placeholder data. Student dropdown loaded from `placement_students` (wrong collection).
- **Fixes**:
  - Student dropdown now loads from `users` collection where `role === 'Student'`, filtered by programme/department/batch
  - Fee computation reads `fee_structure` doc per programme and computes actual amount from year/sem fields
  - Department display format cleaned (prog prefix removed, e.g., "Computer_Science_Engineering" → "CSE")
  - Added date-range filter (from/to) with reset button
  - Added Excel export (XLSX) via SheetJS with student name, regNo, amount, paid status, fee date columns
  - Fee records stored per-student under `fees/{programmeKey}_{deptKey}_{batchKey}_{yearKey}_{semKey}` with `studentData.{regNo}` field
  - Paid toggle writes `{ paid: bool, paidDate: ISO, feeHead, amount }` per student

### 35. ActivityReports.jsx — Edit button for Draft entries + navigation fix
- **Problem**: ActivityReports had no way to edit draft entries. Users had to delete and re-create.
- **Fix**:
  - Added Edit button (pencil icon) for Draft status entries in the activity table
  - Button navigates to `/activities/{activityCode}/edit/{docId}` which maps to ActivityEntry edit route
  - `ActivityEntry.jsx` now extracts `id` from URL params and loads existing data in `useEffect` for editing

### 36. MentorMeetings.jsx — student data source fix (users → students collection)
- **Problem**: "My Students" tab loaded student list from `users` collection (filtered by `role === 'Student'`) and matched by `regNo` to allocation regs. But for new admission flow data, the student's `regNo` in `users` is empty (register number isn't assigned yet) — they're identified by admission number in the `students` collection. This caused allocated students to not appear.
- **Fix**: Changed student loading from `users` collection to `students` collection — iterates over `students` docs and matches field keys against `activeRegs` from `mentor_allocations`. Student objects built with `regNo: key`, `uid: key`, `programme/dept/batch/ay/sem/section` from `_meta` or doc ID parsing.

### 37. MentorMeetings.jsx — profile data fallback when `student_index` missing
- **Problem**: After switching to `students` collection, `openProfile` used `student_index` lookup for profile data. For OLD upload data, `student_index` doesn't exist (created only during HOD section assignment, which was a later feature). StudentManagement.jsx had `_profile_data` fallback (from `users` collection) but MentorMeetings student objects (from `students` collection) lack `_profile_data` — profile showed empty.
- **Fix**:
  - Added `sourceDocId: docSnap.id` to each student object during list building (tracks which `students` doc the student came from)
  - In `openProfile`, added fallback after `student_index` fails: reads `_student_data[reg]` directly from `students/{sourceDocId}` with real-time listener
  - Existing `_profile_data` fallback kept as last-resort
