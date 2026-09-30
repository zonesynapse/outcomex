import React, { useState, useMemo, useEffect } from "react";
import { X, Printer, FileText, Download, Filter, Loader2, Users } from "lucide-react";
import { formatDepartmentDisplay } from "../lib/utils";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const isPaymentSuccess = (app) => {
  if (app.paymentStatus === "Paid" || app.billAttached === true || !!app.electronicBill) return true;
  if (["Payment Confirmed", "Submitted to HOD", "Recommended by HOD", "Copy Issued", "Closed"].includes(app.status)) return true;
  return false;
};

const getBranchCode = (deptName, dynamicMap = {}) => {
  if (!deptName) return "100";
  const raw = String(deptName).trim();
  const lower = raw.toLowerCase();

  if (dynamicMap[lower]) return dynamicMap[lower];

  const formatted = formatDepartmentDisplay(raw).toLowerCase();
  if (dynamicMap[formatted]) return dynamicMap[formatted];

  // Dynamic substring search against Firestore department metadata from Curriculum.jsx
  for (const [key, code] of Object.entries(dynamicMap)) {
    if (key && (lower.includes(key) || key.includes(lower) || formatted.includes(key) || key.includes(formatted))) {
      return code;
    }
  }

  const numMatch = raw.match(/\b(\d{3,4})\b/);
  if (numMatch) return numMatch[1];

  return "100";
};

const loadImage = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export default function AnnaUniversityFeeReportModal({ isOpen, onClose, applications = [] }) {
  const [statusFilter, setStatusFilter] = useState("PAID_ONLY");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [dynamicDeptCodes, setDynamicDeptCodes] = useState({});
  const [showMultipleAppsModal, setShowMultipleAppsModal] = useState(false);

  // Fetch department codes directly from Curriculum.jsx collections (department_metadata & programme_departments)
  useEffect(() => {
    let map1 = {};
    let map2 = {};

    const updateCombinedMap = () => {
      setDynamicDeptCodes({ ...map1, ...map2 });
    };

    const unsubProg = onSnapshot(collection(db, "programme_departments"), (snapshot) => {
      const codeMap = {};
      snapshot.forEach((d) => {
        const docData = d.data() || {};
        let depts = [];
        if (Array.isArray(docData.departments)) {
          depts = docData.departments;
        } else if (typeof docData.departments === "object" && docData.departments !== null) {
          depts = Object.values(docData.departments);
        }

        depts.forEach((item) => {
          if (typeof item === "string") {
            const match = item.match(/^(\d{3,4})\s*[-:]\s*(.+)$/);
            if (match) {
              const code = match[1].trim();
              const name = match[2].trim();
              codeMap[name.toLowerCase()] = code;
              codeMap[formatDepartmentDisplay(name).toLowerCase()] = code;
            } else {
              const numMatch = item.match(/\b(\d{3,4})\b/);
              if (numMatch) {
                const code = numMatch[1];
                const cleanName = item.replace(numMatch[0], "").replace(/[-:]/g, "").trim();
                if (cleanName) {
                  codeMap[cleanName.toLowerCase()] = code;
                  codeMap[formatDepartmentDisplay(cleanName).toLowerCase()] = code;
                }
              }
            }
          }
        });
      });
      map1 = codeMap;
      updateCombinedMap();
    });

    const unsubMeta = onSnapshot(collection(db, "department_metadata"), (snapshot) => {
      const codeMap = {};
      snapshot.forEach((d) => {
        const docData = d.data() || {};
        Object.entries(docData).forEach(([deptName, deptCode]) => {
          if (deptName && deptCode) {
            const codeStr = String(deptCode).trim();
            const nameStr = String(deptName).trim();
            codeMap[nameStr.toLowerCase()] = codeStr;
            codeMap[formatDepartmentDisplay(nameStr).toLowerCase()] = codeStr;
          }
        });
      });
      map2 = codeMap;
      updateCombinedMap();
    });

    return () => {
      unsubProg();
      unsubMeta();
    };
  }, []);

  // Filter & Group Applications Department-wise (Strict Payment Success Only)
  const { groupedData, totalDepts, totalApplications, totalStudents, totalSubjects, totalGrandFee } = useMemo(() => {
    // Only include payment successful applications
    let paidApps = (applications || []).filter(isPaymentSuccess);

    if (statusFilter !== "ALL" && statusFilter !== "PAID_ONLY") {
      paidApps = paidApps.filter((a) => (a.status || "Payment Pending") === statusFilter);
    }

    const groups = {};

    paidApps.forEach((app) => {
      const rawDept = app.department || app.dept || "General";
      const deptName = formatDepartmentDisplay(rawDept, app.programme) || rawDept || "General";
      const branchCode = getBranchCode(deptName, dynamicDeptCodes);

      if (!groups[deptName]) {
        groups[deptName] = {
          deptName,
          branchCode,
          studentsMap: {},
        };
      }

      const regNo = (app.regNo || app.registerNo || "—").trim();
      const studentName = (app.studentName || app.name || "STUDENT").trim().toUpperCase();
      const subjectsCount = Array.isArray(app.subjects) && app.subjects.length > 0 ? app.subjects.length : (app.subjectCount || 1);
      const fee = Number(app.feeAmount) || (subjectsCount * 350);

      if (!groups[deptName].studentsMap[regNo]) {
        groups[deptName].studentsMap[regNo] = {
          regNo,
          name: studentName,
          subjectCount: subjectsCount,
          fee: fee,
        };
      } else {
        groups[deptName].studentsMap[regNo].subjectCount += subjectsCount;
        groups[deptName].studentsMap[regNo].fee += fee;
      }
    });

    const deptList = Object.values(groups).map((group) => {
      const students = Object.values(group.studentsMap).sort((a, b) =>
        a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: "base" })
      );
      const subtotalStudents = students.length;
      const subtotalSubjects = students.reduce((sum, s) => sum + s.subjectCount, 0);
      const subtotalFee = students.reduce((sum, s) => sum + s.fee, 0);

      return {
        ...group,
        students,
        subtotalStudents,
        subtotalSubjects,
        subtotalFee,
      };
    });

    deptList.sort((a, b) => a.branchCode.localeCompare(b.branchCode, undefined, { numeric: true }));

    const grandStudents = deptList.reduce((sum, d) => sum + d.subtotalStudents, 0);
    const grandSubjects = deptList.reduce((sum, d) => sum + d.subtotalSubjects, 0);
    const grandFee = deptList.reduce((sum, d) => sum + d.subtotalFee, 0);

    return {
      groupedData: deptList,
      totalDepts: deptList.length,
      totalApplications: paidApps.length,
      totalStudents: grandStudents,
      totalSubjects: grandSubjects,
      totalGrandFee: grandFee,
    };
  }, [applications, statusFilter, dynamicDeptCodes]);

  const paidCount = useMemo(() => (applications || []).filter(isPaymentSuccess).length, [applications]);

  const multipleAppsStudents = useMemo(() => {
    let paidApps = (applications || []).filter(isPaymentSuccess);
    if (statusFilter !== "ALL" && statusFilter !== "PAID_ONLY") {
      paidApps = paidApps.filter((a) => (a.status || "Payment Pending") === statusFilter);
    }

    const map = {};
    paidApps.forEach((app) => {
      const regNo = (app.regNo || app.registerNo || "—").trim();
      const studentName = (app.studentName || app.name || "STUDENT").trim().toUpperCase();
      const deptName = formatDepartmentDisplay(app.department || app.dept || "General", app.programme);
      if (!map[regNo]) {
        map[regNo] = {
          regNo,
          studentName,
          deptName,
          applications: [],
          totalSubjects: 0,
          totalFee: 0,
        };
      }
      const subjects = Array.isArray(app.subjects) && app.subjects.length > 0 ? app.subjects : [];
      const subjectsCount = subjects.length || (app.subjectCount || 1);
      const fee = Number(app.feeAmount) || (subjectsCount * 350);

      map[regNo].applications.push({
        id: app.id,
        appliedAt: app.appliedAt,
        status: app.status,
        paymentStatus: app.paymentStatus,
        receiptNo: app.electronicBill?.receiptNo || app.transactionId || app.orderId || "PAID",
        subjectsCount,
        subjects,
        fee,
      });
      map[regNo].totalSubjects += subjectsCount;
      map[regNo].totalFee += fee;
    });

    return Object.values(map)
      .filter((item) => item.applications.length > 1)
      .sort((a, b) => b.applications.length - a.applications.length || a.regNo.localeCompare(b.regNo));
  }, [applications, statusFilter]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    setDownloadingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const dateStr = new Date().toLocaleDateString("en-IN");

      let yPos = 10;

      // Render logo banner image at top center of PDF
      const logoImg = await loadImage("/logo.png");
      if (logoImg) {
        const imgWidth = 115;
        const imgHeight = (logoImg.height / logoImg.width) * imgWidth;
        const xPos = (210 - imgWidth) / 2;
        doc.addImage(logoImg, "PNG", xPos, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 4;
      } else {
        yPos += 4;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("OFFICE OF THE CONTROLLER OF EXAMINATIONS", 105, yPos, { align: "center" });
      yPos += 5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Abstract of Photocopies required & Fees Collected", 105, yPos, { align: "center" });
      yPos += 5;
      doc.text("APRIL / MAY END SEMESTER EXAMINATION 2025-26", 105, yPos, { align: "center" });
      yPos += 7;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Inst Code & Name : 4207 - C.K. COLLEGE OF ENGINEERING & TECHNOLOGY", 14, yPos);
      yPos += 3;
      doc.setLineWidth(0.4);
      doc.line(14, yPos, 196, yPos);
      yPos += 6;

      groupedData.forEach((dept) => {
        if (yPos > 240) {
          doc.addPage();
          yPos = 14;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(128, 0, 0);
        doc.text(`Branch Code / Name : ${dept.branchCode} : ${dept.deptName}`, 14, yPos);
        doc.text(`University : AUC`, 196, yPos, { align: "right" });
        doc.setTextColor(0, 0, 0);
        yPos += 3;

        const tableBody = dept.students.map((s) => [
          s.regNo,
          s.name,
          String(s.subjectCount),
          `${s.fee.toFixed(2)}`,
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Register No.", "Name of the Student", "No. of Subjects", "Fees in Rs."]],
          body: tableBody,
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 1.5, textColor: [20, 20, 20] },
          headStyles: { fontStyle: "bold", fillColor: [245, 245, 245], textColor: [0, 0, 0] },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 90 },
            2: { cellWidth: 30, halign: "center" },
            3: { cellWidth: 26, halign: "right" },
          },
          margin: { left: 14, right: 14 },
        });

        yPos = doc.lastAutoTable.finalY + 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(`No. of Students : ${dept.subtotalStudents}`, 14, yPos);
        doc.text(`No. of Subjects : ${dept.subtotalSubjects}`, 105, yPos, { align: "center" });
        doc.text(`Total : ${dept.subtotalFee.toFixed(2)}`, 196, yPos, { align: "right" });

        yPos += 3;
        doc.setLineDashPattern([1, 1], 0);
        doc.line(14, yPos, 196, yPos);
        doc.setLineDashPattern([], 0);
        yPos += 7;
      });

      if (yPos > 240) {
        doc.addPage();
        yPos = 14;
      }

      doc.setFillColor(245, 245, 250);
      doc.rect(14, yPos, 182, 32, "F");
      doc.rect(14, yPos, 182, 32, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("GRAND TOTAL SUMMARY", 105, yPos + 6, { align: "center" });
      doc.setFontSize(9);
      doc.text(`Total Departments : ${totalDepts}`, 20, yPos + 14);
      doc.text(`Total Applications : ${totalApplications}`, 20, yPos + 21);
      doc.text(`Unique Students : ${totalStudents}`, 105, yPos + 14, { align: "center" });
      doc.text(`Grand Total Subjects : ${totalSubjects}`, 105, yPos + 21, { align: "center" });
      doc.text(`Grand Total Fees : Rs. ${totalGrandFee.toFixed(2)}`, 196, yPos + 21, { align: "right" });

      doc.save(`Photocopy_Fee_Report_${dateStr.replace(/\//g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[300] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .fee-report-printable-area, .fee-report-printable-area * {
            visibility: visible !important;
            font-family: 'Times New Roman', Times, serif !important;
          }
          .fee-report-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Modal Control Header (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Photocopy Fee Collection Report</h3>
              <p className="text-[11px] text-slate-400 font-medium">Department-wise Abstract of Photocopies & Fees Collected (Paid Applications)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <Filter size={13} className="text-amber-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="PAID_ONLY" className="bg-slate-800 text-white">Payment Successful Only ({paidCount})</option>
                <option value="Payment Confirmed" className="bg-slate-800 text-white">Payment Confirmed</option>
                <option value="Recommended by HOD" className="bg-slate-800 text-white">Recommended by HOD</option>
                <option value="Submitted to HOD" className="bg-slate-800 text-white">Submitted to HOD</option>
                <option value="Copy Issued" className="bg-slate-800 text-white">Copy Issued</option>
              </select>
            </div>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} /> Print Report
            </button>

            <button
              onClick={handleExportPDF}
              disabled={downloadingPdf}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div
          className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white text-slate-900 fee-report-printable-area"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {/* Official Report Header */}
          <div className="text-center relative pb-3 border-b-2 border-slate-900 mb-4">
            <div className="flex items-start justify-between">
              <div className="w-full text-center px-8">
                <img
                  src="/logo.png"
                  alt="CK College of Engineering & Technology"
                  className="max-h-16 w-auto object-contain mx-auto mb-2"
                />
                <h3 className="text-sm font-bold tracking-wider uppercase text-black leading-tight">
                  OFFICE OF THE CONTROLLER OF EXAMINATIONS
                </h3>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  Abstract of Photocopies required & Fees Collected
                </p>
                <p className="text-xs font-bold text-slate-900 tracking-wider uppercase">
                  APRIL / MAY END SEMESTER EXAMINATION 2025-26
                </p>
              </div>
              <div className="absolute right-0 top-0 border-2 border-black px-3 py-1 font-black text-xl text-black">
                PC
              </div>
            </div>
            <div className="text-left font-bold text-xs text-slate-900 mt-3 pt-1 border-t border-slate-300 flex justify-between items-center">
              <span>Inst Code & Name : 4207 - C.K. COLLEGE OF ENGINEERING & TECHNOLOGY</span>
              <span className="no-print font-normal text-[11px] text-slate-500">
                Filtered: Payment Successful Applications ({totalStudents} Students)
              </span>
            </div>
          </div>

          {/* Department-wise Sections */}
          {groupedData.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <FileText size={36} className="mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="text-sm font-bold text-slate-600">No Payment Successful Applications Found</p>
              <p className="text-xs text-slate-400">When students complete photocopy fee payments, they will appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedData.map((dept) => (
                <div key={dept.deptName} className="space-y-2 page-break-inside-avoid">
                  {/* Department Bar */}
                  <div className="flex items-center justify-between text-xs font-bold text-red-900 border-b border-red-900 pb-1">
                    <span>
                      Branch Code / Name : <span className="font-extrabold">{dept.branchCode}</span> : <span className="uppercase">{dept.deptName}</span>
                    </span>
                    <span>University : AUC</span>
                  </div>

                  {/* Student Table */}
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 text-left font-bold text-slate-900">
                        <th className="py-1.5 w-40">Register No.</th>
                        <th className="py-1.5">Name of the Student</th>
                        <th className="py-1.5 text-center w-32">No. of Subjects</th>
                        <th className="py-1.5 text-right w-28">Fees in Rs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dept.students.map((student) => (
                        <tr key={student.regNo} className="hover:bg-slate-50">
                          <td className="py-1 font-bold text-slate-900">{student.regNo}</td>
                          <td className="py-1 font-semibold uppercase text-slate-800">{student.name}</td>
                          <td className="py-1 text-center font-bold text-slate-900">{student.subjectCount}</td>
                          <td className="py-1 text-right font-bold text-slate-900">{student.fee.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Subtotal Bar */}
                  <div className="border-y border-dashed border-slate-900 py-1.5 text-xs font-bold text-slate-900 flex items-center justify-between px-1 bg-slate-50/50">
                    <span>No. of Students :{dept.subtotalStudents}</span>
                    <span>No. of Subjects :{dept.subtotalSubjects}</span>
                    <span>Total :{dept.subtotalFee.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              {/* Overall Grand Total Summary Box */}
              <div className="pt-6">
                <div className="border-2 border-slate-900 bg-slate-50 p-4 rounded-xl space-y-3">
                  <div className="text-center border-b border-slate-400 pb-2">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                      GRAND TOTAL SUMMARY
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Depts</span>
                      <span className="text-base font-black text-slate-900">{totalDepts}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Applications</span>
                      <span className="text-base font-black text-blue-700">{totalApplications}</span>
                    </div>
                    <div 
                      onClick={() => multipleAppsStudents.length > 0 && setShowMultipleAppsModal(true)}
                      className={`bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm transition-all ${
                        multipleAppsStudents.length > 0 ? "cursor-pointer hover:border-indigo-400 hover:shadow-md bg-indigo-50/20" : ""
                      }`}
                      title={multipleAppsStudents.length > 0 ? "Click to view students with multiple submissions" : "Unique registered students"}
                    >
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Unique Students</span>
                      <span className="text-base font-black text-indigo-700 flex items-center justify-center gap-1">
                        {totalStudents}
                        {multipleAppsStudents.length > 0 && (
                          <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md no-print">
                            {multipleAppsStudents.length} Multi
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Grand Total Subjects</span>
                      <span className="text-base font-black text-purple-700">{totalSubjects}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Grand Total Fees</span>
                      <span className="text-base font-black text-emerald-700">₹{totalGrandFee.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Report Footer Note */}
              <div className="pt-4 flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-200">
                <span>Date Generated: {new Date().toLocaleDateString("en-IN")}</span>
                <span>OFFICE OF THE CONTROLLER OF EXAMINATIONS - COE REPORT</span>
                <span>Page 1 / 1</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Students with Multiple Applications Modal */}
      {showMultipleAppsModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 no-print">
            {/* Header */}
            <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-800 text-indigo-200">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Students with Multiple Photocopy Applications ({multipleAppsStudents.length})</h3>
                  <p className="text-xs text-indigo-200">
                    Total {totalApplications} forms were submitted by {totalStudents} unique students ({totalApplications - totalStudents} multi-submission forms)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMultipleAppsModal(false)}
                className="p-1.5 text-indigo-300 hover:text-white hover:bg-indigo-800 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* List Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50">
              {multipleAppsStudents.map((stu, idx) => (
                <div key={stu.regNo} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">{idx + 1}. {stu.studentName}</span>
                        <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-200">
                          {stu.applications.length} Applications Submitted
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        Reg No: <span className="font-mono text-slate-800 font-bold">{stu.regNo}</span> &nbsp;|&nbsp; Dept: {stu.deptName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-purple-700">{stu.totalSubjects} Total Subject(s)</p>
                      <p className="text-xs font-black text-emerald-700">₹{stu.totalFee.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Individual Applications */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Submitted Application Forms:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {stu.applications.map((appItem, aIdx) => (
                        <div key={appItem.id || aIdx} className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-700">
                            <span>Form #{aIdx + 1}</span>
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {appItem.paymentStatus || appItem.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Receipt: <span className="font-mono font-semibold text-slate-700">{appItem.receiptNo}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Subjects ({appItem.subjectsCount}): {Array.isArray(appItem.subjects) ? appItem.subjects.map(s => s.code || s.subjectCode).filter(Boolean).join(", ") : "-"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Applied: {appItem.appliedAt ? new Date(appItem.appliedAt).toLocaleDateString("en-IN") : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
