import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const sanitizeKey = (v) => String(v ?? '').trim().replace(/[.#$[\]/ ]/g, '_');

let cachedNamesMap = null;

/**
 * Fetches all course names from `syllabus_data`, `courses`, `course_outcomes`, and `course_bank`
 * and returns a department-aware lookup map.
 */
export async function fetchAllCourseNamesMap(forceRefresh = false) {
    if (cachedNamesMap && !forceRefresh) {
        return cachedNamesMap;
    }
    const map = {};

    const extractAndSave = (item, pK, dK) => {
        if (!item || typeof item !== 'object') return;
        const cCode = String(item.code || item.subjectCode || item.courseCode || item.subject_code || item.id || '').trim();
        const cName = String(item.name || item.subjectName || item.courseName || item.subject_name || item.title || item.courseTitle || '').trim();
        if (cCode && cName) {
            // Save generic un-scoped fallback ONLY IF not set yet (so earlier docs aren't overwritten)
            if (!map[cCode]) map[cCode] = cName;
            if (!map[cCode.toUpperCase()]) map[cCode.toUpperCase()] = cName;

            if (dK) {
                const cleanD = sanitizeKey(dK);
                map[`${cleanD}_${cCode}`] = cName;
                map[`${cleanD}_${cCode.toUpperCase()}`] = cName;

                const deptNoProg = cleanD.replace(/^(B_E|B_Tech|M_E|M_Tech|B_Sc|M_Sc|B_C_A|M_C_A|B_B_A|M_B_A|B_Com|M_Com|B_A|M_A|UG|PG)_/i, '');
                if (deptNoProg) {
                    map[`${deptNoProg}_${cCode}`] = cName;
                    map[`${deptNoProg}_${cCode.toUpperCase()}`] = cName;
                }
            }
            if (pK && dK) {
                const cleanP = sanitizeKey(pK);
                const cleanD = sanitizeKey(dK);
                map[`${cleanP}_${cleanD}_${cCode}`] = cName;
                map[`${cleanP}_${cleanD}_${cCode.toUpperCase()}`] = cName;
            }
        }
    };

    // 1. Fetch from syllabus_data
    try {
        const syllSnap = await getDocs(collection(db, 'syllabus_data'));
        syllSnap.forEach(d => {
            const parts = d.id.split('_');
            let progKey = '';
            let deptKey = '';
            if (parts.length >= 3) {
                if (['B', 'M'].includes(parts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(parts[1])) {
                    progKey = `${parts[0]}_${parts[1]}`;
                    deptKey = parts.slice(2, -1).join('_');
                } else {
                    progKey = parts[0];
                    deptKey = parts.slice(1, -1).join('_');
                }
            }
            const data = d.data();
            if (data?.semesters) {
                Object.values(data.semesters).forEach(semList => {
                    if (Array.isArray(semList)) {
                        semList.forEach(s => extractAndSave(s, progKey, deptKey));
                    }
                });
            }
            if (data?.courses && Array.isArray(data.courses)) {
                data.courses.forEach(s => extractAndSave(s, progKey, deptKey));
            }
            if (data?.subjects && Array.isArray(data.subjects)) {
                data.subjects.forEach(s => extractAndSave(s, progKey, deptKey));
            }
        });
    } catch (e) {
        console.error('[courseUtils] Error fetching syllabus_data:', e);
    }

    // 2. Fetch from courses collection
    try {
        const coursesSnap = await getDocs(collection(db, 'courses'));
        coursesSnap.forEach(d => {
            const docData = d.data();
            extractAndSave({ id: d.id, ...docData }, docData.programme, docData.department);

            // Extract from doc.id if formatted like B_Tech_CSE_GE301
            if (d.id.includes('_')) {
                const idParts = d.id.split('_');
                const cCode = idParts.pop();
                let progKey = idParts[0];
                let deptStartIdx = 1;
                if (['B', 'M'].includes(idParts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(idParts[1])) {
                    progKey = `${idParts[0]}_${idParts[1]}`;
                    deptStartIdx = 2;
                }
                let deptKey = idParts.slice(deptStartIdx).join('_');
                const name = docData.name || docData.title || docData.course_name || docData.subject_name;
                if (name) {
                    extractAndSave({ code: cCode, name }, progKey, deptKey);
                }
            }

            // Handle nested structure { [dept]: { [reg]: { [code]: { name: "..." } } } }
            if (!docData.code && !docData.name) {
                Object.entries(docData).forEach(([deptK, deptVal]) => {
                    if (deptVal && typeof deptVal === 'object') {
                        Object.values(deptVal).forEach(regVal => {
                            if (regVal && typeof regVal === 'object') {
                                Object.entries(regVal).forEach(([cCode, cData]) => {
                                    if (cData && typeof cData === 'object') {
                                        extractAndSave({ code: cCode, ...cData }, '', deptK);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    } catch (e) {
        console.error('[courseUtils] Error fetching courses:', e);
    }

    // 3. Fetch from course_outcomes collection
    try {
        const coSnap = await getDocs(collection(db, 'course_outcomes'));
        coSnap.forEach(d => {
            const data = d.data();
            extractAndSave({ id: d.id, ...data }, data.programme, data.department);
        });
    } catch (e) {
        console.error('[courseUtils] Error fetching course_outcomes:', e);
    }

    // 4. Fetch from course_bank collection
    try {
        const cbSnap = await getDocs(collection(db, 'course_bank'));
        cbSnap.forEach(d => {
            const data = d.data();
            extractAndSave({ id: d.id, ...data }, data.programme, data.department);
        });
    } catch (e) {
        console.error('[courseUtils] Error fetching course_bank:', e);
    }

    cachedNamesMap = map;
    return map;
}

/**
 * Gets the department-specific course name for a given course code.
 */
export function getCourseName(courseMap, code, deptKey, progKey) {
    if (!code || !courseMap) return '';
    const cleanCode = String(code).trim();
    const cleanCodeUpper = cleanCode.toUpperCase();

    const cleanDept = deptKey ? sanitizeKey(deptKey) : '';
    const cleanProg = progKey ? sanitizeKey(progKey) : '';
    const deptNoProg = cleanDept ? cleanDept.replace(/^(B_E|B_Tech|M_E|M_Tech|B_Sc|M_Sc|B_C_A|M_C_A|B_B_A|M_B_A|B_Com|M_Com|B_A|M_A|UG|PG)_/i, '') : '';

    // 1. Check department-scoped keys FIRST when department context is available!
    if (cleanProg && cleanDept) {
        if (courseMap[`${cleanProg}_${cleanDept}_${cleanCodeUpper}`]) return courseMap[`${cleanProg}_${cleanDept}_${cleanCodeUpper}`];
        if (courseMap[`${cleanProg}_${cleanDept}_${cleanCode}`]) return courseMap[`${cleanProg}_${cleanDept}_${cleanCode}`];
    }

    if (cleanDept) {
        if (courseMap[`${cleanDept}_${cleanCodeUpper}`]) return courseMap[`${cleanDept}_${cleanCodeUpper}`];
        if (courseMap[`${cleanDept}_${cleanCode}`]) return courseMap[`${cleanDept}_${cleanCode}`];
    }

    if (deptNoProg) {
        if (courseMap[`${deptNoProg}_${cleanCodeUpper}`]) return courseMap[`${deptNoProg}_${cleanCodeUpper}`];
        if (courseMap[`${deptNoProg}_${cleanCode}`]) return courseMap[`${deptNoProg}_${cleanCode}`];
    }

    // 2. Fuzzy department match in keys (e.g. key ends with _EE25C04 and contains dept substring)
    if (cleanDept || deptNoProg) {
        const targetDeptSub = (deptNoProg || cleanDept).toLowerCase();
        const codeSuffix = `_${cleanCodeUpper}`;
        for (const [k, v] of Object.entries(courseMap)) {
            if (k.toUpperCase().endsWith(codeSuffix)) {
                const kLower = k.toLowerCase();
                if (kLower.includes(targetDeptSub) || targetDeptSub.includes(kLower.replace(codeSuffix.toLowerCase(), ''))) {
                    return v;
                }
            }
        }
    }

    // 3. Fallback to generic un-scoped code match ONLY IF department-scoped key doesn't exist
    if (courseMap[cleanCodeUpper]) return courseMap[cleanCodeUpper];
    if (courseMap[cleanCode]) return courseMap[cleanCode];

    return '';
}

