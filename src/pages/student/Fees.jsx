import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { IndianRupee, AlertCircle, Loader2, Wallet, Receipt, X, CheckCircle2 } from "lucide-react";
import { formatBatchDisplay, formatProgrammeKey } from "../../lib/utils";

export default function Fees() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payModal, setPayModal] = useState({ open: false, feeHead: "", amount: "", mode: "upi" });

  useEffect(() => {
    let unsubUser = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        setStudentData(null);
        return;
      }
      unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          setStudentData(snap.data());
        } else {
          setStudentData(null);
        }
      }, (err) => {
        console.error("User snapshot listen error:", err);
      });
    });
    return () => {
      unsubAuth();
      unsubUser();
    };
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const { programme, department, batch } = studentData;
    if (!programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchData = async () => {
      try {
        const [feeSnap, paySnap] = await Promise.all([
          getDocs(collection(db, "fee_configurations")),
          getDocs(collection(db, "fee_payments")),
        ]);

        const configs = [];
        const normStudentProg = formatProgrammeKey(programme);
        const normStudentDept = (department || "").trim().toLowerCase();
        const normStudentBatch = (batch || "").trim().toLowerCase();

        feeSnap.forEach((d) => {
          const data = d.data();
          const normDataProg = formatProgrammeKey(data.programme);
          const normDataDept = (data.department || "").trim().toLowerCase();
          const normDataBatch = (data.batch || "").trim().toLowerCase();

          const isProgMatch = normDataProg && normDataProg === normStudentProg;
          const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
          const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;

          if (isProgMatch && isDeptMatch && isBatchMatch) {
            configs.push({ id: d.id, ...data });
          }
        });
        setFeeConfigs(configs);

        const payList = [];
        paySnap.forEach((d) => {
          const data = d.data();
          if (data.studentId === auth.currentUser?.uid || data.examNumber === studentData.regNo) {
            payList.push({ id: d.id, ...data });
          }
        });
        payList.sort((a, b) => {
          const da = a.paymentDate?.toDate?.() || new Date(0);
          const db2 = b.paymentDate?.toDate?.() || new Date(0);
          return db2 - da;
        });
        setPayments(payList);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchData();
  }, [studentData]);

  const groupedFeeConfigs = useMemo(() => {
    const sorted = [...feeConfigs].sort((a, b) => {
      const yr = (a.academicYear || '').localeCompare(b.academicYear || '');
      if (yr) return yr;
      const semA = a.semester || 'All';
      const semB = b.semester || 'All';
      return semA.localeCompare(semB);
    });
    const groups = [];
    let currentYear = null;
    let currentSem = null;
    sorted.forEach((cfg) => {
      const year = cfg.academicYear || '—';
      const sem = cfg.semester || 'All';
      if (!currentYear || currentYear.key !== year) {
        currentSem = null;
        currentYear = { key: year, academicYear: year, semGroups: [] };
        groups.push(currentYear);
      }
      if (!currentSem || currentSem.key !== sem) {
        currentSem = { key: sem, semester: sem, rows: [] };
        currentYear.semGroups.push(currentSem);
      }
      currentSem.rows.push(cfg);
    });
    return groups;
  }, [feeConfigs]);

  const totalFee = useMemo(() => {
    return feeConfigs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }, [feeConfigs]);

  const totalPaid = useMemo(() => {
    return payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [payments]);

  const pending = Math.max(0, totalFee - totalPaid);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <IndianRupee size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Fee Details</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {studentData.regNo} &middot; {formatBatchDisplay(studentData.batch)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Fee</p>
          <p className="text-3xl font-black text-[#120c7a] mt-2">{formatCurrency(totalFee)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Paid</p>
          <p className="text-3xl font-black text-emerald-600 mt-2">{formatCurrency(totalPaid)}</p>
        </div>
        <div className={`rounded-2xl shadow-lg border p-6 ${pending > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={14} className={pending > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <span className={pending > 0 ? 'text-red-600' : 'text-emerald-600'}>Pending Dues</span>
          </p>
          <p className={`text-3xl font-black mt-2 ${pending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(pending)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3 flex items-center gap-3">
            <Wallet size={20} className="text-white" />
            <h2 className="text-white font-bold text-lg">Fee Structure</h2>
          </div>
          {feeConfigs.length === 0 ? (
            <div className="py-12 text-center">
              <IndianRupee size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No fee structure configured.</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Academic Year</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Sem</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Fee Head</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedFeeConfigs.flatMap((yearGroup) => {
                    const totalYearRows = yearGroup.semGroups.reduce((s, sg) => s + sg.rows.length + (sg.rows.length > 1 ? 1 : 0), 0);
                    let yearRowIdx = 0;
                    return yearGroup.semGroups.flatMap((semGroup) => {
                      const isFirstYearRow = yearRowIdx === 0;
                      const semTotal = semGroup.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                      const rows = semGroup.rows.map((cfg, idx) => {
                        const tr = (
                          <tr key={cfg.id || idx} className="hover:bg-slate-50 transition-colors">
                            {isFirstYearRow && idx === 0 ? (
                              <td className="px-4 py-3 text-xs font-bold text-slate-600 align-top border border-slate-200" rowSpan={totalYearRows}>{yearGroup.academicYear}</td>
                            ) : null}
                            {idx === 0 ? (
                              <td className="px-4 py-3 text-xs font-bold text-slate-600 align-top border border-slate-200" rowSpan={semGroup.rows.length}>{semGroup.semester}</td>
                            ) : null}
                            <td className="px-4 py-3 text-sm font-bold text-slate-700 border border-slate-200 cursor-pointer hover:text-[#120c7a]" onClick={() => { if (window.confirm(`Want to pay ${formatCurrency(cfg.amount)} for "${cfg.head}"?`)) setPayModal({ open: true, feeHead: cfg.head, amount: String(cfg.amount), mode: "upi" }); }}>{cfg.head || 'Fee'}</td>
                            <td className="px-4 py-3 text-right text-sm font-black text-slate-700 border border-slate-200 cursor-pointer hover:text-[#120c7a]" onClick={() => { if (window.confirm(`Want to pay ${formatCurrency(cfg.amount)} for "${cfg.head}"?`)) setPayModal({ open: true, feeHead: cfg.head, amount: String(cfg.amount), mode: "upi" }); }}>{formatCurrency(cfg.amount)}</td>
                          </tr>
                        );
                        return tr;
                      });
                      if (semGroup.rows.length > 1) {
                        rows.push(
                          <tr key={`sem-total-${yearGroup.key}-${semGroup.key}`} className="bg-blue-50/50">
                            <td className="px-4 py-3 text-[10px] font-bold text-blue-600 text-right border border-slate-200">Sem Total</td>
                            <td className="px-4 py-3 border border-slate-200" />
                            <td className="px-4 py-3 text-right text-xs font-black text-blue-700 border border-slate-200">{formatCurrency(semTotal)}</td>
                          </tr>
                        );
                      }
                      yearRowIdx += semGroup.rows.length;
                      return rows;
                    });
                  })}
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-sm font-black text-slate-800 border border-slate-200">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-[#120c7a] border border-slate-200">{formatCurrency(totalFee)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-[#120c7a] px-6 py-3 flex items-center gap-3">
            <Receipt size={20} className="text-white" />
            <h2 className="text-white font-bold text-lg">Payment History</h2>
          </div>
          {payments.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No payments recorded.</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt No</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Head</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 text-xs font-bold text-slate-600">
                        {p.paymentDate?.toDate ? new Date(p.paymentDate.toDate()).toLocaleDateString('en-IN') : p.paymentDate || '-'}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono font-bold text-slate-700">{p.receiptNo || '-'}</td>
                      <td className="px-3 py-3 text-xs font-bold text-slate-600">{p.feeHead || '-'}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-slate-700">{formatCurrency(p.amount)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {payModal.open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setPayModal({ ...payModal, open: false })}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-800">Pay Fee</h3>
              <button onClick={() => setPayModal({ ...payModal, open: false })} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-zinc-50 rounded-xl">
                <p className="text-xs text-zinc-500">Fee Head</p>
                <p className="text-sm font-bold text-zinc-800 mt-0.5">{payModal.feeHead}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Amount (₹)</label>
                <input type="number" value={payModal.amount} onChange={e => setPayModal({ ...payModal, amount: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Payment Mode</label>
                <select value={payModal.mode} onChange={e => setPayModal({ ...payModal, mode: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
              <button onClick={() => setPayModal({ ...payModal, open: false })} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button>
              <button onClick={() => { setPayModal({ ...payModal, open: false }); alert("Payment gateway not connected"); }}
                className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2 shadow-lg shadow-[#120c7a]/20">
                <CheckCircle2 size={16} /> Pay ₹{Number(payModal.amount).toLocaleString('en-IN')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
