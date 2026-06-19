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
