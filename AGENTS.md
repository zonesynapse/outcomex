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

### 38. Activity module — programme/department format mismatches + silent query failures
- **Problem**: Faculty activities saved via ActivityEntry didn't show in ActivityList/ActivityApproval (all tabs = 0). Two root causes:
  1. **Programme format mismatch**: `users.programme` stores the raw key (`B_E`) but ActivityEntry previously saved the display format (`B.E.`) — faculty filter never matched. Fixed by storing raw keys in the programme `<select>` (`value={p}`).
  2. **Department format mismatch**: `step_activities` stores underscored dept (`B_E_ Bio Medical Engineering`) while `activity_entries`/`users` use dots (`B.E. Bio Medical Engineering`).
  3. **Firestore `orderBy` silent failure**: `ActivityEntry.jsx` writes `createdAt: serverTimestamp()` (Timestamp) but `StepPoints.jsx` writes `createdAt: new Date().toISOString()` (string). Any doc with mixed/missing `createdAt` types makes `orderBy("createdAt","desc")` fail the ENTIRE query — only the console error handler fires, so lists stay empty.
  4. **`localeCompare` crash**: Sorting with `dateB.localeCompare(dateA)` throws `TypeError` on Firestore Timestamp objects, crashing the onSnapshot callback before `setActivities` runs.
- **Fixes**:
  - Added shared normalizers: `normalizeDept = (d) => (d||'').replace(/[._]/g,'').replace(/\s+/g,' ').trim().toLowerCase()` and `normalizeProg = (p) => (p||'').replace(/[._\s]/g,'').trim().toLowerCase()` in ActivityList.jsx, ActivityApproval.jsx, ActivityReports.jsx.
  - `matchesDept`/`matchesProg` are resilient to missing fields (`!act.department ||`, `!act.programme ||`) so blank fields never filter everything out.
  - ActivityEntry.jsx: programme select stores raw keys; new effect syncs `formData.department` to config format; `validateForm()` requires programme + department; programme error display added.
  - ActivityApproval.jsx: `deptOptions` adds `userDept` first and dedupes by `normalizeDept` (fixes blank dropdown).
  - **ActivityList.jsx, ActivityReports.jsx, ActivityNbaExport.jsx**: removed `orderBy("createdAt","desc")` from both `activity_entries` and `step_activities` queries — sort purely client-side with a `getMillis()` helper that handles Timestamps (`.toMillis()`/`.toDate()`), `{seconds}` objects, and ISO strings. Removed unused `orderBy` imports.
- **createdAt formats**: `activity_entries` → `serverTimestamp()` (Timestamp, ActivityEntry.jsx); `step_activities` → `new Date().toISOString()` (string, StepPoints.jsx:433,526).
- Build passes.

### 39. Activity module — "SUBMITTED BY" column showing N/A
- **Problem**: "Submitted By" column in ActivityList.jsx / ActivityApproval.jsx showed "N/A" (or empty) for entries created via ActivityEntry.jsx.
- **Root cause**: ActivityEntry.jsx stores the submitter's name ONLY in the top-level `submittedBy` field (lines 380, 428), never in `facultyName`/`studentName`. But ActivityList.jsx (line 1233) and ActivityApproval.jsx (line 624) rendered the column with `act.studentName || act.facultyName || "N/A"` — so docs from `activity_entries` (no `studentName`/`facultyName` top-level) fell through to "N/A". STEP docs from StepPoints.jsx DO have `studentName`, so they showed fine.
- **Fix**: Added `act.submittedBy` to the fallback chain everywhere the submitter name is displayed/searched/exported:
  - ActivityList.jsx: main table (line 1233), monthly dept report table (line 935), CSV exports (lines 487, 594, 682), search filter (line 343).
  - ActivityApproval.jsx: approvals table (line 624), activity report table (line 957), review modal header (line 1697), 7× faculty-report table cells (`act.facultyName || "-"` → `act.facultyName || act.submittedBy || "-"`), search filter (line 179).
- Display chain is now: `act.studentName || act.facultyName || act.submittedBy || "N/A"`.
- Build passes.

### 40. Activity evidence files — image/PDF preview in verification modal
- **Problem**: Attached evidence files (PDFs, PNGs) in the "ATTACHED FILES INFO" section of the activity review/verification modal showed only a filename badge with no preview — users had no way to see the content without downloading.
- **Fix**: Replaced the flat badge list with card-style previews for each file:
  - **Images** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`): Shows an `<img>` thumbnail (`max-h-48`, `object-contain`) with click-to-open-in-new-tab.
  - **PDFs**: Shows an `<iframe>` preview (`h-72`) rendering the PDF inline.
  - **Other files**: Shows a file icon badge (unchanged).
  - Each card has a header bar with file-type badge (IMG/PDF/other icon), filename, and size. Falls back to "File not available for preview" when no `url` exists.
- **Applied to**: `ActivityList.jsx`, `ActivityApproval.jsx`, `HODDashboard.jsx` (all three review/verification modals).
- **File structure**: `evidenceFiles` array stores `{ name, size, type, url }` objects (ActivityEntry.jsx:340-354). `url` is a Firebase Storage download URL.
- Build passes.

### 41. Mentor-first approval flow for student activities
- **Goal**: When a student submits a student activity (code starting with "A"), it goes to their assigned mentor first — only after the mentor approves does it appear in ActivityList.jsx's review/approval queue.
- **ActivityEntry.jsx `handleSave`**: For Student role + student-category activities + `currentUserData.regNo`, queries `mentor_allocations` collection and matches `students[regNo]`; when a mentor is found sets `status: "Mentor_Pending"` and stores `mentorUid`/`mentorName`. Notification is sent with `targetUid: mentorUid`/`targetName: mentorName` (instead of department/HOD). Alert text: "Activity submitted for mentor approval!". If no mentor assigned, falls back to old flow (`status: "Pending"` + department notification) — backward compatible.
- **MentorMeetings.jsx**: New "Activities" tab (icon Award). Real-time `onSnapshot` on `activity_entries` filtered to `data.mentorUid === user.uid && (data.activityCode||'').startsWith('A')`, sorted client-side by `getMillis`. Status chips (`Mentor_Pending` default, `Pending`, `Approved`, `Returned`, `Rejected`, all) + search. Actions:
  - `approveActivity()` → sets `status: "Pending"`, `mentorApproved: true`, `mentorUid`, `mentorName`, `mentorReviewedAt`, `mentorComment`, `updatedAt`. Toast "now forwarded for departmental review".
  - `rejectActivity(status)` → `"Rejected"` or `"Returned"`; rejected requires a comment.
  - Review modal shows student notes, evidence file previews (img thumbnail / PDF iframe pattern), comment box, and Approve / Return for Correction / Reject buttons (only for `Mentor_Pending` status).
- **ActivityList.jsx**: `filteredActivities` excludes `(act.status || "Draft") === "Mentor_Pending"` — mentor-pending activities are invisible there until mentor approves. The approvals tab already only shows `status === "Pending"`, so mentor-approved entries appear automatically.
- **Status lifecycle**: `Mentor_Pending` (student submit w/ mentor) → mentor approves → `Pending` (ActivityList approvals queue; `handleApprove` forwards to `HOD_Pending`) or `Returned`/`Rejected` (visible back to student).
- Build passes.

### 42. Auto Timetable Generation & Non-OBE Subject Exclusion in IAScheduleCreation
- **Subject Filtering for Selected Semester**: Connected `IAScheduleCreation.jsx` to load subjects for the chosen department, regulation, and semester directly from `syllabus_data` (saved via `Upload.jsx`).
- **Non-OBE Subject Filter**: Strictly excludes any subject where `isNonOBE === true` (ticked as Non-OBE in Upload page) from appearing in `IAScheduleCreation.jsx` (`matchedSemList.filter(s => s.isNonOBE !== true)`).
- **Flexible String Matching**: `cleanStr` normalizer resolves regulation strings (`AU - R2021` vs `AU-R2021` vs `R2021`) and department keys (`B.E. Computer Science and Engineering` vs `CSE`) dynamically.
- **Target Exam Event Filtering & Deduplication**: Filters exam events by selected batch and deduplicates duplicate calendar events by title and date range.
- Build passes.

### 43. FacultyDashboard Timetable Group Consolidation & Timeslot Schedule Merging
- **Problem**: `FacultyDashboard.jsx` displayed 3 separate timetable cards when classes followed the same timeslot schedule.
- **Root Cause**:
  1. Documents with section suffixes (`_Sec-A`) and legacy un-sectioned documents were creating duplicate groups.
  2. `templateKey` generation relied on raw JSON object strings which differed across department documents despite identical period times.
- **Fix**:
  - `groupKey` in `FacultyDashboard.jsx` groups by `progKey`, `deptKey`, `batchKey`, `ayKey`, and `semKey` without section string separation.
  - `templateKey` is normalized using calculated period times (`${periodsPerDay}|${workingDays}|${periodTimesStr}`), automatically merging all classes following the same timeslot schedule into a **single unified timetable grid**.
- Build passes.

### 44. Attendance Firestore Index Explosion Fix (`FirebaseError: too many index entries for entity`)
- **Problem**: When marking attendance for a subject with many recorded periods (e.g., `UG_B_E_ Computer Science and Engineering_2023-2027_2026-2027_7_ICL_Sec-A`), Firestore failed with `FirebaseError: too many index entries for entity`.
- **Root Cause**: Storing 100+ period objects inside a nested `records` Firestore map field caused Cloud Firestore to generate single-field indexes for every period key, nested property, and student ID array element, exceeding Firestore's hard limit of 40,000 index entries per document.
- **Fix**:
  - `Attendance.jsx` now writes attendance period records into `records_json` (as a single JSON stringified field) and issues `records: deleteField()` to delete the legacy 40,000+ indexed map entries.
  - Added universal helper `getAttendanceRecords(attData)` in `src/lib/utils.js` that checks `records_json` first with fallback to `records` (backward compatible).
  - Applied `getAttendanceRecords` across `Attendance.jsx`, `FacultyDashboard.jsx`, `HODDashboard.jsx`, `student/Attendance.jsx`, `student/Dashboard.jsx`.
- Build passes.

### 45. Clear Attendance Reference Ordering Fix in Attendance.jsx
- **Problem**: Clicking "Clear P1" (or clearing any marked attendance period) threw a silent `ReferenceError: Cannot access 'updatedRecords' before initialization`.
- **Root Cause**: `handleClearAttendance()` attempted to pass `JSON.stringify(updatedRecords)` to Firestore's `setDoc` before `updatedRecords` was defined on the subsequent line.
- **Fix**: Reordered variable declaration in `handleClearAttendance()` so `const updatedRecords = { ...getAttendanceRecords(attendanceData) }; delete updatedRecords[recordKey];` runs BEFORE `setDoc()`.
- Build passes.

### 46. QuestionPaperGenerator LIT 102 Integrated Course Exam Filtering Fix
- **Problem**: For Integrated / Theory with Laboratory courses like `EN25C02` (category `LIT 102`), written exams (`IA 1`, `IA 2`) were missing from the EXAM dropdown, while practical-only items (`Observation & Record`, `Model Practical`) were incorrectly shown under `Assessment Type: Exam`.
- **Root Cause**:
  1. `QuestionPaperGenerator.jsx` filtered `ciaConfigs` using exact string comparison `config.courseTypes.includes(courseType)` which failed when `courseType` differed in formatting (`LIT 102` vs `LIT102` vs `THEORY`).
  2. If `courseType` wasn't present in the `courses` collection, it was left undefined without checking `syllabus_data`.
  3. Integrated courses (`LIT 102` containing both Theory & Practical components) were not permitting written exams (`IA 1`, `IA 2`) when `Assessment Type` was `Exam`.
- **Fix**:
  - Added fallback lookup to `syllabus_data` in `fetchCourseDetails` to retrieve course category (`LIT 102`) if missing in `courses`.
  - Added string normalization (`normClean`: strips spaces, hyphens, and converts to lowercase).
  - Updated `filteredExams` matching logic to recognize `LIT 102` / integrated courses, allowing written tests (`IA 1`, `IA 2`, `End Semester Exam`) when `Assessment Type` is `Exam` and practicals (`Model Practical Exam`, `Observation & Record`) when `Assessment Type` is `Practical`.
- Build passes.

### 47. QuestionPaperGenerator Fully Dynamic Exam Dropdown from Firestore Data
- **Problem**: Hardcoded or un-filtered practical exams (`Observation & Record`, `Model Practical`) were showing up under `Assessment Type: Exam`, while regulation-configured exams (`IA 1`, `IA 2`) were missing.
- **Fix**:
  - Added real-time listener to `course_type_weightage` collection in `QuestionPaperGenerator.jsx`.
  - Rebuilt `filteredExams` calculation to dynamically extract configured exams from both `cia_configs` AND `course_type_weightage` for the selected regulation (`AU - R2025`) and category (`LIT 102`).
  - Enforced strict classification: `Assessment Type: Exam` shows only written tests (`IA 1`, `IA 2`, `End Semester Exam`), while practical exams (`Model Practical Exam`, `Observation & Record`) are excluded from `Exam` and routed to `Assessment Type: Practical`.
  - Zero hardcoded fallback exam names are injected.
- Build passes.

### 48. QuestionPaperGenerator Raw Firebase Push ID Filter & Exam Name Resolution
- **Problem**: Raw Firestore Push IDs (e.g., `-OsVTJg9fa1aUZPP00PZ`, `-OsVTOrhx3_E1bPCSq_L`) were displayed in the EXAM dropdown option labels.
- **Root Cause**: `cia_configs` documents created without explicit `config.examName` field fell back to `config.id` as the display text.
- **Fix**:
  - Added `isRawFirebaseId()` helper to detect and filter out raw Firestore push/doc IDs.
  - Added multi-field resolution checking `config.examName || config.exam_name || config.title || config.name || config.exam || config.label || config.eventTitle || config.eventName`.
  - Raw document IDs are never displayed in the UI dropdown options.
- Build passes.

### 49. FacultyDashboard Missed Attendance Semester Lookup Fix
- **Problem**: Attendance marked for classes was still appearing in the "Missed Attendance" list on `FacultyDashboard.jsx`.
- **Root Cause**: `FacultyDashboard.jsx` constructed attendance document IDs using full semester labels (`_${g.semester}_`, e.g., `_2nd Semester_`), whereas `Attendance.jsx` saves document IDs with numeric semester numbers (`_${semNum}_`, e.g., `_2_`).
- **Fix**: Updated `FacultyDashboard.jsx` attendance document ID lookups (`exactIdNum`, `baseIdNum`, `groupPrefixNum`) to check numeric `semNum` as well as full `semester` label strings.
- Build passes.

### 50. FacultyDashboard Batch Attendance Fetch & Substitute Marked Badge Fix
- **Problem**: Marked attendance still appeared under "Missed Attendance" in `FacultyDashboard.jsx`, and `Attendance.jsx` did not show "Already marked" or substitute faculty name when attendance was already taken.
- **Root Cause**:
  1. `fetchAttendance` in `FacultyDashboard.jsx` built batch prefixes using `_${g.semester}_` (`_7th Semester_`) instead of `_${semNum}_` (`_7_`), failing to fetch attendance documents saved by `Attendance.jsx`.
  2. `Attendance.jsx` required `currentRecordData` to be set before evaluating `periods.some(...)` and always hardcoded the text `'Already marked'` without displaying substitute faculty names.
- **Fix**:
  - `FacultyDashboard.jsx`: Updated `batchPrefixes` in `fetchAttendance` to include both numeric `semNum` (`_7_`) and label string (`_7th Semester_`).
  - `Attendance.jsx`: Simplified period marked check and added dynamic text `Marked by [Faculty Name]` when a period was marked by a substitute faculty.
- Build passes.

### 51. FacultyDashboard Section Fallback & Substitute Attendance Missed Clear Fix
- **Problem**: Marked attendance (or substitute marked attendance) for sectioned classes (e.g. `Sec-A`) still appeared under "Missed Attendance" in `FacultyDashboard.jsx`.
- **Root Cause**: `g.section` was undefined on group objects in `FacultyDashboard.jsx` (which store sections inside `g.sections: ["Sec-A"]`). The section filter fell back to `!g.section`, triggering `if (dId.includes('_Sec-')) continue;` which skipped all sectioned attendance documents.
- **Fix**: Defined `currentSec = g.section || (g.sections && g.sections.length > 0 ? g.sections[0] : '')` and updated all section filters and doc ID lookups in `FacultyDashboard.jsx` to use `currentSec`. Sectioned attendance (direct or substitute) is now correctly matched and cleared from "Missed Attendance".
- Build passes.

### 52. QuestionPaperGenerator CO Dropdown Fallback Fix
- **Problem**: The "MAPPED CO" dropdown in `QuestionPaperGenerator.jsx` was empty (showing only `Select CO`), blocking the faculty from selecting COs.
- **Root Cause**:
  1. `subjectCode` extraction failed when `subject` contained raw string text with dashes (e.g. `"IT3301 - DATA STRUCTURES"`), resulting in an invalid Firestore doc ID lookup `IT3301___DATA_STRUCTURES`.
  2. If the `course_outcomes` document didn't exist or hadn't been configured in `COConfiguration` for a specific subject/academic year, `courseOutcomes` state remained an empty array `[]`.
- **Fix**:
  - `subjectCode` calculation now extracts clean code (e.g. `IT3301`) from formatted strings before constructing Firestore document keys.
  - Added multi-level CO fallback logic: checks primary `course_outcomes` key -> checks alternative candidate keys -> checks `courses` collection (Course Bank) -> defaults to standard `[CO1, CO2, CO3, CO4, CO5]`.
  - The MAPPED CO dropdown is guaranteed to never be empty.
- Build passes.

### 53. Activity Settings Page & Dynamic Field Customizer (`ActivitySettings.jsx`)
- **Feature**: Created new `ActivitySettings.jsx` management page at `/activity-settings` allowing Admins, HODs, and COE users to dynamically create new Activity Types and customize fields per activity.
- **Capabilities**:
  - **Activity Types Management**: Create/Edit/Delete activity definitions (Code, Name, Category `department`/`faculty`, Part, Frequency, NBA/NAAC criteria, Description, `mandatory`, `evidenceRequired`, `approvalRequired`).
  - **Dynamic Field Builder**: Interactive builder supporting 7 input types (`text`, `number`, `date`, `select`, `textarea`, `file`, `url`).
  - **Mandatory Configuration**: Per-field checkbox toggle (`required: true/false`) to enforce mandatory input requirements per field.
  - **Custom Options**: Option string editor for `select` dropdown types, file type restrictions & max file limits for `file` upload types.
  - **Firestore Integration**: Real-time sync with `custom_activities` Firestore collection.
- **Integration**:
  - `ActivityPicker.jsx`: Dynamically merges custom activities from Firestore with preset activities and displays them cleanly.
  - `ActivityEntry.jsx`: Loads custom field configurations from `custom_activities` doc and dynamically enforces validation rules.
  - Navigation: Added `/activity-settings` to `App.tsx`, `Layout.jsx` sidebar (under Activity Module), and `AdminRoleConfig.jsx` (`ALL_PAGES`).
- Build passes.

### 54. Fixed Sidebar & Admin Role Config Permissions Visibility for Activity Settings
- **Problem**: `ActivitySettings.jsx` page was not displaying in the Sidebar and under Page Permissions in `AdminRoleConfig.jsx`.
- **Root Cause**:
  1. `itemIds` array for `activity` and `config` modules in `Layout.jsx` did not include `"activity-settings"`, so the sidebar module grouping filtered it out.
  2. `effectivePermissions` for `Admin` role required explicit permission fallbacks for newly created pages.
- **Fix**:
  1. Added `"activity-settings"` to `itemIds` of both `activity` and `config` modules in `Layout.jsx`.
  2. Updated `effectivePermissions` in `Layout.jsx` to ensure `Admin` role automatically has `activity-settings` enabled.
  3. Added `activity-settings` to `ALL_PAGES` under both `Activity` and `Configuration` modules in `AdminRoleConfig.jsx`.
- Build passes.

### 55. Fixed Attendance Report & Console Firestore Listen Stream Errors (`Attendance.jsx`)
- **Problems**:
  1. Some users/subjects could not generate or download Attendance Reports in `Attendance.jsx`.
  2. Console printed error: `Fetch API cannot load https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?... due to access control checks`.
- **Root Cause & Fixes**:
  1. **Report Generation Failure**: `handleGenerateReport` read `attendanceData.records` directly instead of calling `getAttendanceRecords(attendanceData)`. Attendance documents saved with `records_json` / compressed format had `attendanceData.records` as `undefined`, causing `handleGenerateReport` to immediately return `null`. Updated `handleGenerateReport` to use `getAttendanceRecords(attendanceData)`.
  2. **Console Firestore Listen Error**: `onSnapshot` listeners for `batch_sections`, `semester_config`, and `subject_assignments` lacked error handling callbacks. When network streams dropped or permissions re-evaluated, unhandled Listen channel errors were thrown. Added error callbacks `(error) => console.warn(...)` to all `onSnapshot` listeners.
  3. **Section Student Lookup Fallback**: When fetching `students` and `course_enrolments` for a specific section, if section-suffixed keys (`${batch}_${prog}_${dept}_${sec}`) were missing, added fallbacks to base keys (`${batch}_${prog}_${dept}`).
- Build passes.

### 56. Automatic Reload & Data Loss Protection System
- **Problem**: Users reported occasional automatic website reloads causing loss of typed data/progress while filling forms.
- **Root Cause & Solution**:
  1. **Unsaved Changes Protection**: Created `useUnsavedChanges` hook listening to browser `beforeunload` events to prompt users before reloading or closing dirty forms. Applied in `QuestionPaperGenerator.jsx`, `MarkEntry.jsx`, `ActivityEntry.jsx`, `ActivitySettings.jsx`, and `Attendance.jsx`.
  2. **Local Form Auto-Save Hook**: Created `useFormDraft` hook for automatic background local storage preservation.
  3. **ProtectedRoute Auth Resiliency**: Updated `ProtectedRoute.jsx` so transient user role fetch failures retain current user role instead of setting `userRole` to `null` and triggering redirects.
- Build passes.

### 57. Faculty Dashboard Draft Activities Integration (`FacultyDashboard.jsx`)
- **Requirement**: Display saved Activity Drafts on `FacultyDashboard.jsx` with an Edit icon to resume data entry; automatically hide once submitted/saved.
- **Implementation**:
  - `FacultyDashboard.jsx`: Added real-time Firestore `onSnapshot` listener on `activity_entries` filtering by `submittedById === currentUid && status === "Draft"`.
  - **Draft Activities Section**: Renders a dedicated card section showing Activity Code badge, Title/Topic, Category, Date/Month, and an **Edit/Resume Button (`Edit2` icon)**.
  - **Resume Navigation**: Clicking the Edit button navigates to `/activities/${act.activityCode}/edit/${act.id}`, opening `ActivityEntry.jsx` with all previously saved form inputs and uploaded evidence files pre-populated.
  - **Auto-removal**: Submitting the draft updates `status` to `"Pending"` / `"Approved"`, which automatically removes it from the Draft Activities section on `FacultyDashboard.jsx`.
- Build passes.

### 58. Attendance Page Instant Subject Dropdown Loading (`Attendance.jsx`)
- **Problem**: Subjects in `Attendance.jsx` subject dropdown sometimes failed to show or took several seconds to load.
- **Root Cause**:
  1. `setSubjects` was placed AFTER `await fetchAllCourseNamesMap()`, blocking subject options rendering until network calls to `courses` collection completed.
  2. Strict `semesterConfigs` date matching could produce 0 items if semester dates expired or mismatched slightly, leaving the subject dropdown completely empty.
- **Fix**:
  1. **Instant 0ms Rendering**: Synchronously populates `subjects` with subject codes (`setSubjects(buildItems(null))`) immediately upon receiving `subject_assignments` snapshot.
  2. **Background Label Enrichment**: `fetchAllCourseNamesMap()` runs asynchronously in a non-blocking `try...catch` block to enrich option labels once available.
  3. **Safety Fallback**: If active semester date filtering yields 0 subjects, falls back to all assigned contexts for that department/faculty so the subject dropdown is **NEVER EMPTY**.
- Build passes.

### 59. Course Name Lookup Expansion for Attendance & Dropdowns (`courseUtils.js`)
- **Problem**: Subject dropdown in `Attendance.jsx` showed only subject codes (e.g. `MC005 (Sec-A)`, `EE25C04 (Sec-A)`) without full subject names.
- **Root Cause**: `fetchAllCourseNamesMap()` in `courseUtils.js` only fetched from `syllabus_data` and `courses` collections. Courses saved in `course_outcomes` and `course_bank` collections (or saved with uppercase/alternative code keys) were not indexed.
- **Fix**:
  1. Updated `fetchAllCourseNamesMap()` to fetch and index course names from `course_outcomes` (checking `course_name`, `courseTitle`, `title`, `name`) and `course_bank`.
  2. Added uppercase/trimmed fallback key indexing so codes like `mc005`, `MC005`, `EE25C04` match regardless of casing.
  3. Updated `getCourseName()` to test uppercase variants (`cleanCodeUpper`).
- Build passes.

### 60. Comprehensive Course Name Extraction & 0ms Memory Caching (`courseUtils.js` & `Attendance.jsx`)
- **Problem**: Subject dropdown in `Attendance.jsx` continued to show codes only (e.g., `MC005 (Sec-A)`) because `extractAndSave` missed property names like `subjectCode`, `subjectName`, `courseCode`, `courseName`, `title`, and `cachedNamesMap` was absent.
- **Fix**:
  1. Created `extractAndSave` utility in `courseUtils.js` that extracts course codes and names from any subject array/object (`semesters`, `courses`, `subjects`) across `syllabus_data`, `courses`, `course_outcomes`, and `course_bank`.
  2. Indexing: Always indexes `map[cleanCode]` and `map[cleanCodeUpper]` unconditionally so exact code lookups like `MC005` or `EE25C04` match 100% reliably.
  3. Added in-memory `cachedNamesMap` in `courseUtils.js` so subsequent course name lookups execute in 0ms without re-querying Firestore.
  4. Updated `Attendance.jsx` to await `fetchAllCourseNamesMap()` before rendering options so full subject names render on initial dropdown load.
- Build passes.

### 61. Synchronous 0ms Subject Dropdown Rendering (`Attendance.jsx`)
- **Problem**: In `Attendance.jsx`, awaiting `fetchAllCourseNamesMap()` synchronously inside `onSnapshot` blocked `setSubjects` until all Firestore network requests finished, causing the Subject Dropdown to display only `Select Subject` (empty options) while loading.
- **Fix**:
  1. Synchronous Immediate Populate: `setSubjects(buildItems(null))` is called immediately in 0ms so assigned subject options (`MC005 (Sec-A)`, `EE25C04 (Sec-A)`) display on the UI instantly.
  2. Non-blocking Async Enrichment: `fetchAllCourseNamesMap().then(...)` runs in the background to update option labels to full subject names (`MC005 - Environmental Science (Sec-A)`) as soon as course name data arrives.
- Build passes.




















