import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { IndianRupee, AlertCircle, Loader2, Wallet, Receipt, Clock } from "lucide-react";
import { formatBatchDisplay } from "../../lib/utils";

export default function Fees() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const { programme, department, batch } = studentData;
    if (!programme || !department || !batch) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        const [feeSnap, paySnap] = await Promise.all([
          getDocs(collection(db, "fee_configurations")),
          getDocs(collection(db, "fee_payments")),
        ]);

        const configs = [];
        feeSnap.forEach((d) => {
          const data = d.data();
          if (data.programme === programme && data.department === department && data.batch === batch) {
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
          <div className="bg-[#120c7a] px-8 py-5 flex items-center gap-3">
            <Wallet size={20} className="text-white" />
            <h2 className="text-white font-bold text-xl">Fee Structure</h2>
          </div>
          {feeConfigs.length === 0 ? (
            <div className="py-12 text-center">
              <IndianRupee size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No fee structure configured.</p>
            </div>
          ) : (
            <div className="p-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Fee Head</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeConfigs.map((cfg, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{cfg.head || 'Fee'}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-700">{formatCurrency(cfg.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 border-t-2 border-slate-300">
                    <td className="px-4 py-3 text-sm font-black text-slate-800">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-[#120c7a]">{formatCurrency(totalFee)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-emerald-600 px-8 py-5 flex items-center gap-3">
            <Receipt size={20} className="text-white" />
            <h2 className="text-white font-bold text-xl">Payment History</h2>
          </div>
          {payments.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt size={36} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-400">No payments recorded.</p>
            </div>
          ) : (
            <div className="p-6">
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
          )}
        </div>
      </div>
    </div>
  );
}
