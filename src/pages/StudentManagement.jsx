import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Search, X, Users, AlertCircle } from "lucide-react";
import Layout from "../components/Layout";
import { formatProgDisplay, sanitizeKey } from "../lib/utils";

const displayDept = (v) => {
  if (typeof v !== 'string') return v || '--';
  const progPrefixMap = [
    { key: 'B_E', display: 'B.E.' }, { key: 'B_Tech', display: 'B.Tech.' },
    { key: 'M_E', display: 'M.E.' }, { key: 'M_Tech', display: 'M.Tech.' },
    { key: 'B_Sc', display: 'B.Sc.' }, { key: 'M_Sc', display: 'M.Sc.' },
    { key: 'B_C_A', display: 'B.C.A.' }, { key: 'M_C_A', display: 'M.C.A.' },
    { key: 'B_B_A', display: 'B.B.A.' }, { key: 'M_B_A', display: 'M.B.A.' },
    { key: 'B_Com', display: 'B.Com.' }, { key: 'M_Com', display: 'M.Com.' },
    { key: 'B_A', display: 'B.A.' }, { key: 'M_A', display: 'M.A.' },
  ];
  let result = v;
  for (const { key, display } of progPrefixMap) {
    const regex = new RegExp(`^${key.replace(/_/g, '[_ ]')}[_ ]*`, 'i');
    if (regex.test(result)) {
      result = result.replace(regex, display + ' ');
      break;
    }
  }
  return result.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export default function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let unsubscribeUserData = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeUserData = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserData(snapshot.data());
          }
        });
      } else {
        setUserData(null);
        unsubscribeUserData();
      }
    });

    const fetchStudents = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "Student"));
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ ...d.data(), uid: d.id }));
        all.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setStudents(all);
      } catch (err) {
        console.error("Error fetching students:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();

    return () => {
      unsubscribeAuth();
      unsubscribeUserData();
    };
  }, []);

  const canView = userData?.role === 'Admin' || userData?.role === 'HOD' || user?.email === import.meta.env.VITE_DEFAULT_ADMIN_EMAIL || user?.email === import.meta.env.VITE_MASTER_ADMIN_EMAIL;

  const filteredStudents = useMemo(() => {
    let list = students;

    // HOD: only see students in their own programme
    if (userData?.role === 'HOD') {
      const hodProg = userData.programme || '';
      const hodDept = userData.department || '';
      list = list.filter(s => {
        const sProg = (s.programme || '').trim();
        // Programme match: exact, or starts with progKey (handles "B_Tech_ Artificial Intelligence...")
        if (sProg !== hodProg && !sProg.startsWith(hodProg + '_') && !sProg.startsWith(hodProg + ' ')) return false;
        if (!hodDept) return true;
        // Strip programme prefix from student's department for comparison
        const raw = s.department || '';
        const cleanedSDept = raw.replace(/^(B_E|B_Tech|M_E|M_Tech|B_Sc|M_Sc|B_C_A|M_C_A|B_B_A|M_B_A|B_Com|M_Com|B_A|M_A)[_ ]*/i, '');
        const sDept = sanitizeKey(cleanedSDept).replace(/[_ ]+/g, ' ').trim().toLowerCase();
        const hDept = sanitizeKey(hodDept).replace(/[_ ]+/g, ' ').trim().toLowerCase();
        return sDept === hDept || sDept.includes(hDept) || hDept.includes(sDept);
      });
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(s =>
      (s.displayName || s.studentName || "").toLowerCase().includes(term) ||
      (s.email || "").toLowerCase().includes(term) ||
      (s.regNo || "").toLowerCase().includes(term)
    );
  }, [students, searchTerm, userData]);

  if (loading) {
    return (
      <Layout title="Student Management">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  if (!canView) {
    return (
      <Layout title="Student Management">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">You do not have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Student Management">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="p-3 bg-[#120c7a] rounded-xl text-white shadow-lg shrink-0">
              <Users size={25} />
            </div>
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Search students by name, email, or reg no..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all text-sm shadow-sm"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Student Name</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Reg No.</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Programme</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Department</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Batch</th>
                    <th className="px-6 py-4 text-sm font-semibold text-zinc-600 whitespace-nowrap">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-zinc-500">
                        No registered students found.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.uid} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-zinc-800">{s.displayName || s.studentName}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{s.email}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap font-mono">{s.regNo}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{formatProgDisplay(s.programme) || s.programme}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{displayDept(s.department)}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">{s.batch}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500 whitespace-nowrap">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-sm text-zinc-500">
            Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </Layout>
  );
}
