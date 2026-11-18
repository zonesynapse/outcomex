import React from "react";
import { X, Printer, CheckCircle2 } from "lucide-react";
import { formatProgDisplay, formatBatchDisplay, formatDepartmentDisplay } from "../lib/utils";
import { normalizeStandardReceiptNo } from "../utils/feeAllocation";

const cleanDeptName = (dept) => {
  if (!dept) return "";
  return String(dept)
    .replace(/^department\s+of\s+/i, "")
    .replace(/^dept\s+of\s+/i, "")
    .trim();
};

const numberToWordsINR = (num) => {
  if (!num || isNaN(num) || num <= 0) return "Zero Rupees Only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
  const mainPart = Math.floor(num);
  const paisePart = Math.round((num - mainPart) * 100);
  let words = "Rupees " + convert(mainPart);
  if (paisePart > 0) {
    words += " and " + convert(paisePart) + " Paise";
  }
  return words + " Only";
};

export default function OfficialFeeReceiptModal({
  open,
  onClose,
  payment,
  studentData,
}) {
  if (!open || !payment) return null;

  const p = payment;
  const isDueDemand = Boolean(p.isDueDemand);
  const isConsolidated = Boolean(p.isConsolidated);
  const isExamFee = Boolean(
    p.isExamFee ||
    (p.feeHead && String(p.feeHead).toLowerCase().includes("exam")) ||
    (p.accountType === "exam") ||
    String(p.orderId || "").includes("EXAM") ||
    String(p.receiptNo || "").includes("EXAM")
  );

  // Student details resolution
  const resolvedName = (
    p.studentName ||
    studentData?.displayName ||
    studentData?.name ||
    studentData?.studentName ||
    "Candidate"
  ).toUpperCase();

  const resolvedReg = String(
    studentData?.regNo ||
    studentData?.admissionNo ||
    studentData?.rollNo ||
    p.regNo ||
    p.examNumber ||
    "—"
  ).toUpperCase();

  const resolvedProg = studentData?.programme || p.programme || "UG";
  const rawDept = studentData?.department || p.department || "";
  const resolvedDept = rawDept
    ? formatDepartmentDisplay(rawDept, resolvedProg)
    : cleanDeptName(rawDept) || "General Engineering";

  const resolvedBatch =
    studentData?.batch ||
    p.batch ||
    (resolvedReg && resolvedReg.length >= 6 ? `20${resolvedReg.slice(2, 4)}` : "2024-2028");

  const resolvedSection = studentData?.section || p.section || "A";

  let displayAY = p.academicYear || p.rawRecord?.academicYear || "2026-2027";
  if (typeof displayAY === "string" && displayAY.trim().length === 4 && !displayAY.includes("-")) {
    displayAY = `${displayAY.trim()}-${Number(displayAY.trim()) + 1}`;
  }
  const displaySem = p.semester ? `Semester ${p.semester}` : "";

  // Receipt & Transaction resolution
  const isGateway =
    p.isOnline ||
    (p.mode || "").toLowerCase().includes("gateway") ||
    (p.rawMode || "").toLowerCase().includes("gateway") ||
    Boolean(p.hdfcOrderId || p.rawRecord?.hdfcOrderId);

  const isUpi =
    (p.mode || "").toLowerCase() === "upi" ||
    (p.paymentMode || "").toLowerCase() === "upi" ||
    Boolean(p.upiNumber || p.rawRecord?.upiNumber);

  // Resolve UPI reference number properly
  const resolvedUpiRef =
    p.upiNumber ||
    p.refNo ||
    p.rawRecord?.upiNumber ||
    p.rawRecord?.refNo ||
    p.transactionId ||
    p.txnId ||
    p.rawRecord?.transactionId ||
    p.rawRecord?.txnId ||
    p.utr ||
    p.rawRecord?.utr ||
    "";

  const gatewayTxId =
    p.gatewayResponse?.txnId ||
    p.gatewayResponse?.epgTxnId ||
    p.rawRecord?.gatewayResponse?.txnId ||
    p.rawRecord?.gatewayResponse?.epgTxnId ||
    p.orderId ||
    p.rawRecord?.orderId ||
    "";

  let txId = "—";
  if (isDueDemand) {
    txId = p.demandRef || `DEM-${resolvedReg}-${Date.now().toString(36).toUpperCase()}`;
  } else if (isUpi && resolvedUpiRef) {
    txId = resolvedUpiRef;
  } else if (isGateway && gatewayTxId) {
    txId = gatewayTxId;
  } else if (resolvedUpiRef) {
    txId = resolvedUpiRef;
  } else if (gatewayTxId) {
    txId = gatewayTxId;
  } else if (p.remarks && !p.remarks.toLowerCase().includes("admission application")) {
    txId = p.remarks;
  } else if (p.orderId) {
    txId = p.orderId;
  }

  // Clean Order ID for receipt number fallback
  const cleanOrderId = (p.orderId || p.rawRecord?.orderId || "")
    ? String(p.orderId || p.rawRecord?.orderId).replace(/^7698[03]-/, "").replace(/-\d+$/, "")
    : "";

  // Date and Time resolution
  const effectiveDate = (() => {
    const raw = p.paymentDate || p.createdAt || p.verifiedAt || p.paidDate || p.demandDate;
    if (!raw) return new Date();
    if (raw.toDate) return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date() : d;
  })();

  const resolvedReceiptNo = isDueDemand
    ? (p.demandNo || `DEM-${resolvedReg}-${Date.now().toString(36).slice(-4).toUpperCase()}`)
    : normalizeStandardReceiptNo(
        p.receiptNo || p.rawRecord?.receiptNo || cleanOrderId,
        p.academicYear || p.rawRecord?.academicYear || displayAY,
        effectiveDate,
        resolvedReg
      );

  const dateStr = effectiveDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = effectiveDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Items resolution
  const receiptItems = (() => {
    const rawItems = (Array.isArray(p.items) && p.items.length > 0)
      ? p.items
      : (Array.isArray(p.rawRecord?.items) && p.rawRecord.items.length > 0)
        ? p.rawRecord.items
        : (Array.isArray(p.allocations) && p.allocations.length > 0)
          ? p.allocations
          : (Array.isArray(p.rawRecord?.allocations) && p.rawRecord.allocations.length > 0)
            ? p.rawRecord.allocations
            : null;

    if (rawItems && rawItems.length > 0) {
      return rawItems.map((it) => ({
        head: it.head || it.feeHead || "Fee Head",
        amount: Number(it.amount || it.allocatedAmount || it.due || 0),
        academicYear: it.academicYear || displayAY,
        semester: it.semester || p.semester || "All",
      }));
    }

    if (p.feeHead && p.feeHead.includes(" + ")) {
      const parts = p.feeHead.split(" + ").map((h) => h.trim());
      const displayTotal = Number(p.chargedAmount || p.amount || 0);
      return parts.map((h) => ({
        head: h,
        amount: Math.round(displayTotal / parts.length),
        academicYear: displayAY,
        semester: p.semester || "All",
      }));
    }
    return [
      {
        head: p.feeHead || "Semester Fee",
        amount: Number(p.chargedAmount || p.amount || p.totalDue || 0),
        academicYear: displayAY,
        semester: p.semester || "All",
      },
    ];
  })();

  const totalAmount = receiptItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  // Dynamic Voucher Title matching institutional template
  const voucherTitle = isDueDemand
    ? "OFFICIAL SEMESTER FEE DEMAND BILL / STATEMENT"
    : isExamFee
      ? "OFFICIAL END SEMESTER EXAMINATION (ESE) FEE RECEIPT"
      : isConsolidated
        ? "OFFICIAL CONSOLIDATED FEE PAYMENT RECEIPT"
        : "OFFICIAL FEE PAYMENT RECEIPT";

  // Payment mode string
  const paymentModeDisplay = isDueDemand
    ? "Pending Payment (SmartGateway / Institutional Counter)"
    : isGateway
      ? "Online (HDFC SmartGateway)"
      : isUpi
        ? `UPI (Ref: ${resolvedUpiRef || "Verified"})`
        : p.mode
          ? String(p.mode).toUpperCase()
          : "Cash / Counter DD";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[130] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      id="receipt-modal-backdrop"
      onClick={onClose}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #receipt-modal-backdrop,
          #receipt-modal-backdrop * {
            visibility: visible !important;
          }
          #receipt-modal-backdrop {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            display: block !important;
            overflow: visible !important;
            z-index: 9999999 !important;
          }
          #receipt-modal-backdrop > div {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            max-height: none !important;
            background: transparent !important;
            overflow: visible !important;
          }
          #receipt-modal-backdrop > div > div:not(.no-print) {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          #printable-receipt {
            visibility: visible !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            max-width: 190mm !important;
            height: 260mm !important;
            max-height: 260mm !important;
            margin: 0 auto !important;
            padding: 6mm 8mm 5mm 8mm !important;
            box-sizing: border-box !important;
            border: 2px solid #120c7a !important;
            border-radius: 0 !important;
            background: #fff !important;
            page-break-inside: avoid !important;
            page-break-before: avoid !important;
            page-break-after: avoid !important;
            break-inside: avoid !important;
            break-before: avoid !important;
            break-after: avoid !important;
          }
          #printable-receipt * {
            visibility: visible !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] transform animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Toolbar (Screen only) */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between no-print bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm text-[#120c7a] tracking-wide uppercase">
              {isDueDemand ? "Fee Demand Note" : "Official Fee Receipt"}
            </span>
            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-50 text-[#120c7a] border border-indigo-200">
              {resolvedReceiptNo}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 bg-slate-100/50">
          {/* Printable Receipt Container matching golden PDF voucher */}
          <div
            id="printable-receipt"
            className="bg-white text-slate-800 border-2 border-[#120c7a] p-6 sm:p-8 rounded-none mx-auto relative flex flex-col justify-between shadow-lg space-y-3.5"
            style={{ width: "100%", maxWidth: "800px", minHeight: "1020px" }}
          >
            {/* 1. Official College Letterhead (Centered Banner, no duplicate HTML text) */}
            <div className="text-center pb-2 border-b border-slate-300">
              <img
                src="/logo.png"
                alt="CKCET Banner"
                className="h-14 sm:h-16 w-auto max-w-full mx-auto object-contain block"
              />
            </div>

            {/* 2. Navy Ribbon Title Banner */}
            <div className="bg-[#120c7a] text-white py-1.5 px-4 text-center rounded-[2px] font-bold text-xs sm:text-sm tracking-wide uppercase shadow-2xs">
              {voucherTitle}
            </div>

            {/* 3. Metadata Strip (Receipt No, Date & Time, Order ID, Payment Status) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11.5px] text-slate-700 pb-1 border-b border-slate-200">
              <div className="space-y-0.5">
                <div>
                  <span className="font-semibold text-slate-500">
                    {isDueDemand ? "Demand Ref:" : "Receipt No:"}{" "}
                  </span>
                  <strong className="text-[#120c7a] font-mono font-bold text-xs">
                    {resolvedReceiptNo}
                  </strong>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">
                    {isDueDemand
                      ? "Reference ID:"
                      : isUpi
                        ? "UPI UTR / Ref:"
                        : "Order / Txn ID:"}{" "}
                  </span>
                  <span className="font-mono font-semibold text-slate-900">{txId}</span>
                </div>
              </div>

              <div className="sm:text-right space-y-0.5">
                <div>
                  <span className="font-semibold text-slate-500">Date &amp; Time: </span>
                  <strong className="font-mono font-bold text-slate-900 text-xs">
                    {dateStr} {timeStr}
                  </strong>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Payment Status: </span>
                  {isDueDemand ? (
                    <strong className="font-bold text-[#c2410c] uppercase">
                      PENDING / DEMAND NOTE
                    </strong>
                  ) : (
                    <strong className="font-bold text-[#107a3b] uppercase">
                      SUCCESS / PAID
                    </strong>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Candidate & Academic Information (2-Column Grid Table) */}
            <div className="border border-slate-300 rounded-[2px] overflow-hidden">
              <table className="w-full text-[11px] sm:text-[11.5px] border-collapse table-fixed">
                <thead>
                  <tr className="bg-[#f1f5f9] text-[#0f172a] font-bold border-b border-slate-300 text-left">
                    <th className="px-3.5 py-1.5 w-[38%] border-r border-slate-300">
                      Candidate &amp; Academic Information
                    </th>
                    <th className="px-3.5 py-1.5 w-[62%]">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Register Number
                    </td>
                    <td className="px-3.5 py-1.5 font-mono font-bold text-slate-900">
                      {resolvedReg}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Candidate Full Name
                    </td>
                    <td className="px-3.5 py-1.5 font-bold text-slate-900 tracking-wide">
                      {resolvedName}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Programme &amp; Department
                    </td>
                    <td className="px-3.5 py-1.5 font-medium text-slate-800">
                      {formatProgDisplay(resolvedProg)} - {resolvedDept}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Batch &amp; Section
                    </td>
                    <td className="px-3.5 py-1.5 font-medium text-slate-800">
                      Batch {formatBatchDisplay(resolvedBatch)} | Sec {resolvedSection}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Session &amp; Academic Term
                    </td>
                    <td className="px-3.5 py-1.5 font-medium text-slate-800">
                      Academic Year: {displayAY} {displaySem ? `| ${displaySem}` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-1.5 font-bold text-slate-700 bg-slate-50/70 border-r border-slate-300">
                      Payment Mode / Gateway
                    </td>
                    <td className="px-3.5 py-1.5 font-medium text-slate-900">
                      {paymentModeDisplay}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. Fee Particulars Breakdown Table with Solid Navy Header */}
            <div className="border border-slate-300 rounded-[2px] overflow-hidden">
              <table className="w-full text-[11px] sm:text-[11.5px] border-collapse table-fixed">
                <thead>
                  <tr className="bg-[#120c7a] text-white font-bold text-left">
                    <th className="px-3.5 py-2 text-center w-12 border-r border-slate-700">S.No</th>
                    <th className="px-3.5 py-2 border-r border-slate-700">Description / Fee Head</th>
                    <th className="px-3.5 py-2 text-center w-36 border-r border-slate-700">Academic Term</th>
                    <th className="px-3.5 py-2 text-right w-40">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {receiptItems.map((item, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="px-3.5 py-2 text-center font-mono text-slate-500 border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="px-3.5 py-2 font-bold text-slate-900 border-r border-slate-200">
                        {item.head}
                      </td>
                      <td className="px-3.5 py-2 text-center font-medium text-slate-600 border-r border-slate-200 text-[10.5px]">
                        {item.academicYear || displayAY}{item.semester ? ` • Sem ${item.semester}` : ""}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-900">
                        INR {Number(item.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="bg-[#f1f5f9] font-black text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={3} className="px-3.5 py-2 text-right uppercase tracking-wider text-slate-800 border-r border-slate-300">
                      {isDueDemand ? "Total Amount Payable" : "Total Amount Paid"}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono font-black text-xs sm:text-sm text-[#120c7a]">
                      INR {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 6. Amount in Words Box */}
            <div className="bg-slate-50 border border-slate-300 rounded-[2px] px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] sm:text-[11.5px]">
              <div>
                <span className="font-bold text-slate-700">Amount in Words: </span>
                <span className="italic font-semibold text-slate-900">
                  {numberToWordsINR(totalAmount)}
                </span>
              </div>
              <div className="font-mono font-bold text-slate-900 text-right shrink-0">
                INR {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* 7. Important Notes & Disclaimers */}
            <div className="text-[10px] italic text-slate-600 space-y-0.5 pt-1 border-t border-slate-200">
              <p>
                • This is an official system-generated computerized payment receipt issued by C.K. College of Engineering &amp; Technology.
              </p>
              <p>
                • Retain this receipt for all future academic clearance, semester registration, and examination references.
              </p>
              {isExamFee ? (
                <p>• Official Examination Registration approved by the Autonomous Examination Cell.</p>
              ) : (
                <p>• Payments made through official gateways are subject to standard bank settlement and reconciliation norms.</p>
              )}
            </div>

            {/* 8. Signatures Block */}
            <div className="pt-4 sm:pt-5 pb-1 border-t border-slate-800">
              <div className="grid grid-cols-3 items-end text-center">
                {/* Left Signature */}
                <div className="text-left">
                  <div className="w-36 border-b border-slate-400 mb-1"></div>
                  <div className="font-bold text-[10.5px] leading-tight text-slate-800">Accountant / Cashier</div>
                  <div className="text-[9px] leading-tight text-slate-500 mt-0.5">C.K. College of Engg. &amp; Tech.</div>
                </div>

                {/* Center Stamp (Only for paid receipts) */}
                <div className="flex flex-col items-center justify-center">
                  {!isDueDemand && (
                    <div className="w-13 h-13 rounded-full border-2 border-dashed border-emerald-600 p-1 flex flex-col items-center justify-center text-emerald-800 select-none bg-emerald-50/40">
                      <CheckCircle2 size={13} className="text-emerald-700" />
                      <span className="text-[6.5px] font-black uppercase tracking-tight leading-none text-center mt-0.5">
                        PAID &amp; VERIFIED
                      </span>
                      <span className="text-[5.5px] font-bold uppercase text-slate-600 mt-0.5">
                        CKCET ERP
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Signature */}
                <div className="text-right flex flex-col items-end">
                  <div className="w-44 border-b border-slate-400 mb-1"></div>
                  <div className="font-bold text-[10.5px] leading-tight text-[#120c7a]">
                    {isExamFee
                      ? "Controller of Examinations"
                      : "Finance Officer / Accounts Officer"}
                  </div>
                  <div className="text-[9px] leading-tight text-slate-500 mt-0.5">
                    {isExamFee ? "Autonomous Examination Cell" : "Authorized Signatory"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions (Screen only) */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 no-print">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="px-6 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2 shadow-lg shadow-[#120c7a]/20 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>Print Official Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
