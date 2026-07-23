import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const sanitizeKey = (v) => String(v ?? '').trim().replace(/[.#$[\]/ ]/g, '_');

/**
 * Fetches all course names from both `syllabus_data` and `courses` collections
 * and returns a department-aware lookup map.
 */
export async function fetchAllCourseNamesMap() {
    const map = {};

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
                        semList.forEach(s => {
                            if (s?.code && s?.name) {
                                const cCode = String(s.code).trim();
                                const cName = String(s.name).trim();
                                if (progKey && deptKey) {
                                    map[`${sanitizeKey(progKey)}_${sanitizeKey(deptKey)}_${cCode}`] = cName;
                                }
                                if (deptKey) {
                                    map[`${sanitizeKey(deptKey)}_${cCode}`] = cName;
                                    const shortDept = deptKey.includes('_') ? deptKey.split('_').pop() : deptKey;
                                    if (shortDept) map[`${sanitizeKey(shortDept)}_${cCode}`] = cName;
                                }
                                if (!map[cCode]) map[cCode] = cName;
                            }
                        });
                    }
                });
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
            const code = docData.code || (d.id.includes('_') ? d.id.split('_').pop() : '');
            const name = docData.name;
            const dept = docData.department ? sanitizeKey(docData.department) : '';
            const prog = docData.programme ? sanitizeKey(docData.programme) : '';

            if (code && name) {
                const cCode = String(code).trim();
                const cName = String(name).trim();
                if (prog && dept) map[`${prog}_${dept}_${cCode}`] = cName;
                if (dept) {
                    map[`${dept}_${cCode}`] = cName;
                    const shortDept = dept.includes('_') ? dept.split('_').pop() : dept;
                    if (shortDept) map[`${shortDept}_${cCode}`] = cName;
                }
                if (!map[cCode]) map[cCode] = cName;
            }

            // Extract from doc.id if formatted like B_Tech_CSE_GE301
            if (d.id.includes('_') && name) {
                const idParts = d.id.split('_');
                const cCode = idParts.pop();
                let progKey = idParts[0];
                let deptStartIdx = 1;
                if (['B', 'M'].includes(idParts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(idParts[1])) {
                    progKey = `${idParts[0]}_${idParts[1]}`;
                    deptStartIdx = 2;
                }
                let deptKey = idParts.slice(deptStartIdx).join('_');
                if (deptKey) {
                    deptKey = sanitizeKey(deptKey);
                    map[`${sanitizeKey(progKey)}_${deptKey}_${cCode}`] = String(name).trim();
                    map[`${deptKey}_${cCode}`] = String(name).trim();
                }
            }

            // Handle nested RTDB structure { [dept]: { [reg]: { [code]: { name: "..." } } } }
            if (!docData.code && !docData.name) {
                Object.entries(docData).forEach(([deptK, deptVal]) => {
                    if (deptVal && typeof deptVal === 'object') {
                        const cleanDeptK = sanitizeKey(deptK);
                        Object.values(deptVal).forEach(regVal => {
                            if (regVal && typeof regVal === 'object') {
                                Object.entries(regVal).forEach(([cCode, cData]) => {
                                    if (cData && cData.name) {
                                        const codeTrim = String(cCode).trim();
                                        const nameTrim = String(cData.name).trim();
                                        map[`${cleanDeptK}_${codeTrim}`] = nameTrim;
                                        if (!map[codeTrim]) map[codeTrim] = nameTrim;
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

    return map;
}

/**
 * Gets the department-specific course name for a given course code.
 */
export function getCourseName(courseMap, code, deptKey, progKey) {
    if (!code || !courseMap) return '';
    const cleanCode = String(code).trim();
    const cleanDept = deptKey ? sanitizeKey(deptKey) : '';
    const shortDept = cleanDept.includes('_') ? cleanDept.split('_').pop() : cleanDept;
    const cleanProg = progKey ? sanitizeKey(progKey) : '';

    // 1. Match prog + full dept + code
    if (cleanProg && cleanDept && courseMap[`${cleanProg}_${cleanDept}_${cleanCode}`]) {
        return courseMap[`${cleanProg}_${cleanDept}_${cleanCode}`];
    }
    // 2. Match prog + short dept + code
    if (cleanProg && shortDept && courseMap[`${cleanProg}_${shortDept}_${cleanCode}`]) {
        return courseMap[`${cleanProg}_${shortDept}_${cleanCode}`];
    }
    // 3. Match full dept + code
    if (cleanDept && courseMap[`${cleanDept}_${cleanCode}`]) {
        return courseMap[`${cleanDept}_${cleanCode}`];
    }
    // 4. Match short dept + code
    if (shortDept && courseMap[`${shortDept}_${cleanCode}`]) {
        return courseMap[`${shortDept}_${cleanCode}`];
    }
    // 5. Match prog + Overall + code
    if (cleanProg && courseMap[`${cleanProg}_Overall_${cleanCode}`]) {
        return courseMap[`${cleanProg}_Overall_${cleanCode}`];
    }
    // 6. Match plain code fallback
    if (courseMap[cleanCode]) {
        return courseMap[cleanCode];
    }

    return '';
}
