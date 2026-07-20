import { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth, functions } from "../../firebase";
import { doc, getDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import {
  IndianRupee, AlertCircle, Loader2, Wallet, Receipt, X, CheckCircle2,
  ArrowRight, ExternalLink, Clock, RefreshCw, Banknote, Copy, Check,
  Ban,
} from "lucide-react";
import { formatBatchDisplay, formatProgrammeKey, sanitizeKey } from "../../lib/utils";

const PAYMENT_STATUS = {
  PENDING: { label: "Pending", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  SUCCESS: { label: "Paid", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  FAILED: { label: "Failed", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

export default function Fees() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payModal, setPayModal] = useState({ open: false, feeHead: "", amount: "", maxAmount: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [seatCategory, setSeatCategory] = useState("");

  const verifyPaymentOnReturn = useCallback(async (orderId) => {
    try {
      const verifyFn = httpsCallable(functions, "verifyPayment");
      const result = await verifyFn({ orderId });
      const data = result.data;
      if (data.success) {
        setToast({ type: "success", message: `Payment of ₹${data.amount?.toLocaleString('en-IN')} completed successfully!` });
      } else {
        setToast({ type: "error", message: `Payment ${data.status.toLowerCase()}. Please try again or contact accounts.` });
      }
    } catch (err) {
      console.error("Verify payment error:", err);
      const msg = err.code === "unavailable"
        ? "Payment verification service is temporarily down. Your payment may still have been processed — please check Payment History."
        : "Could not verify payment status. Check Payment History.";
      setToast({ type: "warning", message: msg });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    if (orderId) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      verifyPaymentOnReturn(orderId);
    }
  }, [verifyPaymentOnReturn]);

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

  // Load seatCategory from _student_data or _profile_data (reactive)
  useEffect(() => {
    if (!studentData) return;
    const reg = studentData.regNo;
    if (!reg) {
      // Fallback: read from _profile_data on users doc
      setSeatCategory(studentData._profile_data?.quotaAskedFor || "");
      return;
    }

    (async () => {
      try {
        const idxSnap = await getDoc(doc(db, 'student_index', sanitizeKey(reg)));
        if (idxSnap.exists()) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await getDoc(doc(db, 'students', sDocId));
            if (sSnap.exists()) {
              const extra = sSnap.data()._student_data?.[reg] || {};
              setSeatCategory(extra.quotaAskedFor || "");
              return;
            }
          }
        }
      } catch (_) {}
      // Fallback: read from _profile_data on users doc
      setSeatCategory(studentData._profile_data?.quotaAskedFor || "");
    })();
  }, [studentData]);

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
        const normStudentDept = (department || "").replace(/[_.\s]/g, '').toLowerCase();
        const normStudentBatch = (batch || "").trim().toLowerCase();

        feeSnap.forEach((d) => {
          const data = d.data();
          const normDataProg = formatProgrammeKey(data.programme);
          const normDataDept = (data.department || "").replace(/[_.\s]/g, '').toLowerCase();
          const normDataBatch = (data.batch || "").trim().toLowerCase();

          const isProgMatch = normDataProg && normDataProg === normStudentProg;
          const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
          const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
          const isQuotaMatch = !seatCategory || !data.quota || data.quota === seatCategory;

          if (isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch) {
            configs.push({ id: d.id, ...data });
          }
        });
        setFeeConfigs(configs);

        const currentUid = auth.currentUser?.uid;
        const payList = [];
        paySnap.forEach((d) => {
          const data = d.data();
          if (data.uid === currentUid) {
            payList.push({ id: d.id, ...data, _docId: d.id });
          }
        });
        payList.sort((a, b) => {
          const da = a.createdAt?.toDate?.() || new Date(0);
          const db2 = b.createdAt?.toDate?.() || new Date(0);
          return db2 - da;
        });
        setPayments(payList);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchData();
  }, [studentData, seatCategory]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

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
    return payments
      .filter((p) => p.status === "SUCCESS")
      .reduce((s, p) => s + (Number(p.chargedAmount || p.amount) || 0), 0);
  }, [payments]);

  const pending = Math.max(0, totalFee - totalPaid);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (ts) => {
    if (!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const handlePayClick = async () => {
    const amount = Number(payModal.amount);
    if (!amount || amount < 1) { setError("Enter a valid amount"); return; }
    if (amount > payModal.maxAmount) { setError(`Cannot pay more than ${formatCurrency(payModal.maxAmount)}`); return; }

    setError("");
    setProcessing(true);
    try {
      const createSession = httpsCallable(functions, "createPaymentSession");
      const returnUrl = `${window.location.origin}/student/fees`;
      const result = await createSession({
        amount,
        feeHead: payModal.feeHead,
        returnUrl,
        phone: studentData?.phone || "",
      });

      const { paymentUrl, orderId } = result.data;
      setPayModal({ ...payModal, open: false });
      window.location.href = paymentUrl;
    } catch (err) {
      console.error("Payment session error:", err);
      const msg = err.code === "unavailable"
        ? "Payment gateway is temporarily down. Please try again in a few minutes."
        : err.code === "unauthenticated"
          ? "Your session has expired. Please log in again."
          : err.message || "Payment could not be initiated. Please try again.";
      setError(msg);
    } finally {
      setProcessing(false);
    }
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
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] max-w-md animate-in slide-in-from-right-2 fade-in duration-300 ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
          "bg-amber-50 border-amber-200 text-amber-800"
        } border-2 rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3`}>
          <div className={`p-1 rounded-full ${
            toast.type === "success" ? "bg-emerald-100" :
            toast.type === "error" ? "bg-red-100" : "bg-amber-100"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} className="text-emerald-600" /> :
             toast.type === "error" ? <Ban size={18} className="text-red-600" /> :
             <AlertCircle size={18} className="text-amber-600" />}
          </div>
          <p className="text-sm font-semibold flex-1">{toast.message}</p>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-black/5 rounded-lg shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Fee</p>
          <p className="text-2xl md:text-3xl font-black text-[#120c7a] mt-2">{formatCurrency(totalFee)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Paid</p>
          <p className="text-2xl md:text-3xl font-black text-emerald-600 mt-2">{formatCurrency(totalPaid)}</p>
        </div>
        <div className={`rounded-2xl shadow-lg border p-6 ${pending > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={14} className={pending > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <span className={pending > 0 ? 'text-red-600' : 'text-emerald-600'}>Pending Dues</span>
          </p>
          <p className={`text-2xl md:text-3xl font-black mt-2 ${pending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
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
                            <td
                              className="px-4 py-3 text-sm font-bold text-slate-700 border border-slate-200 cursor-pointer hover:text-[#120c7a] hover:bg-blue-50/30 transition-all"
                              onClick={() => setPayModal({ open: true, feeHead: cfg.head || 'Fee', amount: String(cfg.amount), maxAmount: Number(cfg.amount) })}
                            >{cfg.head || 'Fee'}</td>
                            <td
                              className="px-4 py-3 text-right text-sm font-black text-slate-700 border border-slate-200 cursor-pointer hover:text-[#120c7a] hover:bg-blue-50/30 transition-all"
                              onClick={() => setPayModal({ open: true, feeHead: cfg.head || 'Fee', amount: String(cfg.amount), maxAmount: Number(cfg.amount) })}
                            >{formatCurrency(cfg.amount)}</td>
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
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt / Order</th>
                    <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Head</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p, i) => {
                    const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.PENDING;
                    return (
                      <tr key={p.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 text-xs font-bold text-slate-600">
                          <span className="block">{formatDate(p.createdAt)}</span>
                          {p.createdAt && <span className="text-[10px] text-slate-400">{formatTime(p.createdAt)}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono font-bold text-slate-700 block">{p.orderId || '-'}</span>
                          {p.gatewayResponse?.rrn && (
                            <span className="text-[10px] text-slate-400 font-mono">RRN: {p.gatewayResponse.rrn}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-600">{p.feeHead || '-'}</td>
                        <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                          {p.status === "SUCCESS"
                            ? formatCurrency(p.chargedAmount || p.amount)
                            : formatCurrency(p.amount)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.status === "PENDING" ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} ${st.border} border inline-flex items-center gap-1`}>
                                <Clock size={10} />
                                {st.label}
                              </span>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} ${st.border} border`}>
                              {st.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {payModal.open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-800">Pay Fee</h3>
              <button
                onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}
                disabled={processing}
                className="p-2 hover:bg-zinc-100 rounded-xl disabled:opacity-30"
              ><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Fee Head</p>
                <p className="text-lg font-black text-zinc-800 mt-1">{payModal.feeHead}</p>
                <div className="mt-3 pt-3 border-t border-blue-100/50">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Amount to Pay</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <IndianRupee size={18} className="text-zinc-700" />
                    <input
                      type="number"
                      min={1}
                      max={payModal.maxAmount}
                      value={payModal.amount}
                      onChange={e => setPayModal({ ...payModal, amount: e.target.value })}
                      disabled={processing}
                      className="w-40 bg-transparent text-3xl font-black text-zinc-800 outline-none disabled:opacity-50"
                    />
                    <span className="text-sm text-zinc-400">/ {formatCurrency(payModal.maxAmount)}</span>
                  </div>
                  {Number(payModal.amount) > payModal.maxAmount && (
                    <p className="text-xs font-bold text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Cannot exceed {formatCurrency(payModal.maxAmount)}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-start gap-2">
                  <Banknote size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-amber-700">HDFC SmartGateway</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Secure payment via HDFC Bank. You will be redirected to the payment page.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-red-700">{error}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
              <button
                onClick={() => { if (!processing) setPayModal({ ...payModal, open: false }); }}
                disabled={processing}
                className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl disabled:opacity-30"
              >Cancel</button>
              <button
                onClick={handlePayClick}
                disabled={processing}
                className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#120c7a]/20 transition-all"
              >
                {processing ? (
                  <><Loader2 size={16} className="animate-spin" /> Processing...</>
                ) : (
                  <><ArrowRight size={16} /> Pay {formatCurrency(Number(payModal.amount) || 0)}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
