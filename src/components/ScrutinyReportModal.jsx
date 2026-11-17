import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Printer,
  Download,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Building,
  Calendar,
  Save,
  BookOpen,
  UserCheck,
  Award,
  Layers
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../firebase";
import { doc, updateDoc, setDoc } from "firebase/firestore";

export const SCRUTINY_CHECKLIST_ITEMS = [
  { id: 1, text: "Whether the regulations, program, branch, semester, course code and name of the given question paper are verified?" },
  { id: 2, text: "Does the Question paper Align with the Syllabus?" },
  { id: 3, text: "Are the questions clear, unambiguous, and free from errors?" },
  { id: 4, text: "Are the questions mapped to the course outcomes and Bloom's Taxonomy levels?" },
  { id: 5, text: "Do the Questions adhere to the appropriate Bloom's Taxonomy Levels?" },
  { id: 6, text: "Are there any typographical, formatting, superscript, subscript, or numbering errors?" },
  { id: 7, text: "Are all necessary diagrams, formulas, or attachments included and legible?" },
  { id: 8, text: "Is the question paper appropriately balanced in terms of difficulty (easy, moderate, challenging)?" },
  { id: 9, text: "Is the allocated time sufficient to answer all the questions?" },
  { id: 10, text: "Are the choices and instructions (e.g., use of tables, graph sheets, etc.) clear and adequate?" },
  { id: 11, text: "Whether repetition of questions across parts has been avoided?" }
];

export const SCRUTINY_DECLARATION_TEXT =
  "We, the members of the Scrutiny Committee, verify that the above-listed items have been reviewed and the question paper has been approved for final printing and secure storage. We further declare that we will maintain the confidentiality of the question paper and ensure that it will not be leaked or disclosed from our source.";

/**
 * ScrutinyReportModal
 * Renders official CKCET Question Paper Scrutiny Report (Image 1) and Verification Checklist (Image 2)
 * Supports Set A / Set B, inline Action Taken editing for COE, and direct vector PDF generation.
 */
export default function ScrutinyReportModal({
  report,
  assignment,
  isCoeView = true,
  onClose,
  onReportUpdated
}) {
  const [activeModalTab, setActiveModalTab] = useState("report"); // "report" | "checklist"
  const [activeSet, setActiveSet] = useState("setA"); // "setA" | "setB"
  const [isSavingAction, setIsSavingAction] = useState(false);

  // Local state for editable Action Taken fields (by COE)
  const [actionTakenState, setActionTakenState] = useState({});

  const allocatedScope = report?.allocatedSets || assignment?.allocatedSets || "both";
  const hasTwoSets = Boolean(
    report?.setB?.length > 0 ||
    assignment?.numSets === 2 ||
    assignment?.submittedPaperB
  );
  const allowSetA = allocatedScope === "both" || allocatedScope === "setA";
  const allowSetB = hasTwoSets && (allocatedScope === "both" || allocatedScope === "setB");
  const effectiveSet = (activeSet === "setB" && allowSetB) ? "setB" : (allowSetA ? "setA" : "setB");

  useEffect(() => {
    if (allowSetB && !allowSetA) {
      setActiveSet("setB");
    } else {
      setActiveSet("setA");
    }
  }, [allowSetA, allowSetB]);

  useEffect(() => {
    // Populate actionTaken from report
    const initialActions = {};
    const populateFromList = (list, setKey) => {
      if (!Array.isArray(list)) return;
      list.forEach((item, idx) => {
        const key = `${setKey}_${item.qNo || idx}`;
        initialActions[key] = item.actionTaken || "";
      });
    };
    populateFromList(report?.setA, "setA");
    populateFromList(report?.setB, "setB");
    setActionTakenState(initialActions);
  }, [report]);

  if (!report && !assignment) return null;

  const currentObservations = effectiveSet === "setB" ? (report?.setB || []) : (report?.setA || []);

  const courseCode = report?.subjectCode || assignment?.subjectCode || "—";
  const courseName = report?.subjectTitle || assignment?.subjectTitle || "—";
  const department = report?.department || assignment?.department || "—";
  const programme = assignment?.degree || assignment?.programme || "B.E. / B.Tech";
  const examSession = report?.examSession || assignment?.examSession || "Nov./Dec. 2026";
  const verificationDate = report?.dateOfVerification || (report?.submittedAt ? new Date(report.submittedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"));
  const memberName = report?.memberName || "Scrutiny Committee Member";
  const memberAffiliation = report?.memberAffiliation || "Member, Scrutiny Committee";

  // Group current observations by part
  const groupedObservations = {};
  currentObservations.forEach((obs) => {
    const part = obs.part || "PART – A";
    if (!groupedObservations[part]) groupedObservations[part] = [];
    groupedObservations[part].push(obs);
  });

  const handleActionTakenChange = (setKey, qNoKey, val) => {
    setActionTakenState((prev) => ({
      ...prev,
      [`${setKey}_${qNoKey}`]: val
    }));
  };

  const handleSaveActionTaken = async () => {
    if (!report?.id) return;
    setIsSavingAction(true);
    try {
      // Update observations arrays with new actionTaken values
      const updatedSetA = (report?.setA || []).map((item, idx) => ({
        ...item,
        actionTaken: actionTakenState[`setA_${item.qNo || idx}`] || item.actionTaken || ""
      }));

      const updatedSetB = (report?.setB || []).map((item, idx) => ({
        ...item,
        actionTaken: actionTakenState[`setB_${item.qNo || idx}`] || item.actionTaken || ""
      }));

      const ref = doc(db, "coe_scrutiny_reports", report.id);
      await updateDoc(ref, {
        setA: updatedSetA,
        setB: updatedSetB,
        updatedAt: new Date().toISOString()
      });

      if (onReportUpdated) {
        onReportUpdated({
          ...report,
          setA: updatedSetA,
          setB: updatedSetB
        });
      }
      alert("Action Taken successfully saved to Scrutiny Report!");
    } catch (err) {
      console.error("Error saving action taken:", err);
      alert("Failed to save Action Taken: " + err.message);
    } finally {
      setIsSavingAction(false);
    }
  };

  // ==========================================
  // VECTOR PDF GENERATION (Image 1: Scrutiny Report)
  // ==========================================
  const handleDownloadReportPdf = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let curY = 12;

      // Header Branding
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(18, 12, 122);
      doc.text("C.K. COLLEGE OF ENGINEERING & TECHNOLOGY", pageWidth / 2, curY, { align: "center" });

      curY += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      doc.text("(An Autonomous Institution)", pageWidth / 2, curY, { align: "center" });

      curY += 4;
      doc.setFontSize(7.5);
      doc.text("Jayaram Nagar, Chellangkuppam, Cuddalore–607003, Tamil Nadu, India.", pageWidth / 2, curY, { align: "center" });

      curY += 3.5;
      doc.text("Approved by AICTE, Affiliated to Anna University & Accredited by NAAC with 'A' Grade", pageWidth / 2, curY, { align: "center" });

      curY += 4;
      doc.setDrawColor(18, 12, 122);
      doc.setLineWidth(0.4);
      doc.line(14, curY, pageWidth - 14, curY);

      curY += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text("Office of the Controller of Examinations", pageWidth / 2, curY, { align: "center" });

      curY += 4.5;
      doc.setFontSize(9.5);
      doc.text(`End Semester Examinations – ${examSession}`, pageWidth / 2, curY, { align: "center" });

      curY += 5;
      doc.setFontSize(10);
      doc.text(`QUESTION PAPER SCRUTINY REPORT ${hasTwoSets ? `(${effectiveSet === "setB" ? "SET B" : "SET A"})` : ""}`, pageWidth / 2, curY, { align: "center" });

      curY += 4;

      // Meta Table
      autoTable(doc, {
        startY: curY,
        theme: "grid",
        margin: { left: 14, right: 14 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
        body: [
          [
            { content: "Date", styles: { fontStyle: "bold", fillColor: [245, 245, 250], width: 25 } },
            { content: String(verificationDate), styles: { width: 65 } },
            { content: "Department", styles: { fontStyle: "bold", fillColor: [245, 245, 250], width: 28 } },
            { content: String(department) }
          ],
          [
            { content: "Course Code", styles: { fontStyle: "bold", fillColor: [245, 245, 250] } },
            { content: String(courseCode) },
            { content: "Course Name", styles: { fontStyle: "bold", fillColor: [245, 245, 250] } },
            { content: String(courseName) }
          ]
        ]
      });

      curY = doc.lastAutoTable.finalY + 3;

      // Build Observations Table Rows (Grouped by Part)
      const tableRows = [];

      // Check if there are groups
      const parts = Object.keys(groupedObservations);
      if (parts.length === 0) {
        tableRows.push([
          { content: "All Questions", styles: { fontStyle: "bold", halign: "center" } },
          { content: "No errors identified. All questions verified clear and syllabus-aligned.", styles: { halign: "center" } },
          { content: "—", styles: { halign: "center" } },
          { content: "Approved for Exam", styles: { halign: "center" } }
        ]);
      } else {
        parts.forEach((partName) => {
          // Part Header Banner Row
          tableRows.push([
            {
              content: String(partName).toUpperCase(),
              colSpan: 4,
              styles: {
                fontStyle: "bold",
                halign: "center",
                fillColor: [240, 240, 245],
                textColor: [0, 0, 0],
                fontSize: 8.5
              }
            }
          ]);

          groupedObservations[partName].forEach((item, idx) => {
            const setKey = effectiveSet;
            const qKey = item.qNo || idx;
            const savedAction = actionTakenState[`${setKey}_${qKey}`] || item.actionTaken || "";

            const isCorrect = item.status === "CORRECT" || (!item.observation && !item.suggestedCorrection);

            tableRows.push([
              { content: String(item.qNo || `Q.${idx + 1}`), styles: { fontStyle: "bold", halign: "center", width: 22 } },
              { content: isCorrect ? "Nil / No error identified" : (item.observation || "Nil") },
              { content: isCorrect ? "Nil" : (item.suggestedCorrection || "Nil") },
              { content: savedAction || (isCorrect ? "Approved" : "Rectified in Master QP") }
            ]);
          });
        });
      }

      autoTable(doc, {
        startY: curY,
        theme: "grid",
        margin: { left: 14, right: 14 },
        head: [["Q.No.", "Observation / Error Identified", "Suggested Correction", "Action Taken"]],
        headStyles: {
          fillColor: [230, 230, 238],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.25
        },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2.2,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        columnStyles: {
          0: { cellWidth: 24, halign: "center" },
          1: { cellWidth: 62 },
          2: { cellWidth: 58 },
          3: { cellWidth: 38 }
        },
        body: tableRows
      });

      // Signature Footer Section
      const finalY = doc.lastAutoTable.finalY + 12;
      const checkSpace = finalY + 25 > doc.internal.pageSize.getHeight() - 15;
      if (checkSpace) doc.addPage();
      const sigY = checkSpace ? 25 : finalY;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text("Verified by Scrutiny Committee:", 14, sigY);

      if (report?.memberSignature) {
        try {
          doc.addImage(report.memberSignature, "PNG", 14, sigY + 2, 40, 14);
        } catch (e) { }
      }

      doc.setFont("helvetica", "bold");
      doc.text(String(memberName), 14, sigY + 19);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(memberAffiliation), 14, sigY + 23);

      doc.setFontSize(8.5);
      doc.text("Controller of Examinations", pageWidth - 14, sigY + 19, { align: "right" });
      doc.setFontSize(7.5);
      doc.text("CK College of Engineering & Technology", pageWidth - 14, sigY + 23, { align: "right" });

      doc.save(`Scrutiny_Report_${courseCode}_${effectiveSet.toUpperCase()}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate Scrutiny Report PDF: " + err.message);
    }
  };

  // ==========================================
  // VECTOR PDF GENERATION (Image 2: Verification Checklist)
  // ==========================================
  const handleDownloadChecklistPdf = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let curY = 12;

      // Header Branding
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(18, 12, 122);
      doc.text("C.K. COLLEGE OF ENGINEERING & TECHNOLOGY", pageWidth / 2, curY, { align: "center" });

      curY += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      doc.text("(An Autonomous Institution)", pageWidth / 2, curY, { align: "center" });

      curY += 4;
      doc.setFontSize(7.5);
      doc.text("Jayaram Nagar, Chellangkuppam, Cuddalore–607003, Tamil Nadu, India.", pageWidth / 2, curY, { align: "center" });

      curY += 3.5;
      doc.text("Approved by AICTE, Affiliated to Anna University & Accredited by NAAC with 'A' Grade", pageWidth / 2, curY, { align: "center" });

      curY += 4;
      doc.setDrawColor(18, 12, 122);
      doc.setLineWidth(0.4);
      doc.line(14, curY, pageWidth - 14, curY);

      curY += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text("Office of the Controller of Examinations", pageWidth / 2, curY, { align: "center" });

      curY += 4.5;
      doc.setFontSize(9.5);
      doc.text(`End Semester Examinations ${examSession} – Question Paper Scrutiny Report`, pageWidth / 2, curY, { align: "center" });

      curY += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Course Details:", 14, curY);
      curY += 1.5;

      // Course Details Table
      autoTable(doc, {
        startY: curY,
        theme: "grid",
        margin: { left: 14, right: 14 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
        body: [
          [
            { content: "Programme:", styles: { fontStyle: "bold", fillColor: [245, 245, 250], width: 28 } },
            { content: String(programme), styles: { width: 62 } },
            { content: "Department:", styles: { fontStyle: "bold", fillColor: [245, 245, 250], width: 28 } },
            { content: String(department) }
          ],
          [
            { content: "Course Code:", styles: { fontStyle: "bold", fillColor: [245, 245, 250] } },
            { content: String(courseCode) },
            { content: "Course Name:", styles: { fontStyle: "bold", fillColor: [245, 245, 250] } },
            { content: String(courseName) }
          ]
        ]
      });

      curY = doc.lastAutoTable.finalY + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Verification Checklist:", 14, curY);
      curY += 1.5;

      // 11-point Checklist Table
      const checklistMap = report?.checklist || {};
      const checklistRows = SCRUTINY_CHECKLIST_ITEMS.map((item) => {
        const itemVal = checklistMap[`item_${item.id}`] || checklistMap[item.id] || {};
        const status = itemVal.status || "Yes";
        const comments = itemVal.comments || "Satisfied";
        return [
          { content: String(item.id), styles: { halign: "center", fontStyle: "bold" } },
          { content: item.text },
          { content: status, styles: { halign: "center", fontStyle: "bold" } },
          { content: comments }
        ];
      });

      autoTable(doc, {
        startY: curY,
        theme: "grid",
        margin: { left: 14, right: 14 },
        head: [["Sl.No.", "Description", "Status\nYes / No", "Comments"]],
        headStyles: {
          fillColor: [230, 230, 238],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8,
          lineColor: [0, 0, 0],
          lineWidth: 0.25
        },
        styles: {
          font: "helvetica",
          fontSize: 7.5,
          cellPadding: 1.8,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        columnStyles: {
          0: { cellWidth: 14, halign: "center" },
          1: { cellWidth: 104 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 42 }
        },
        body: checklistRows
      });

      curY = doc.lastAutoTable.finalY + 4;

      // Remarks / Observation
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Remarks / Observation:", 14, curY);
      curY += 3.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const remarksText = report?.remarks?.trim() || "The question paper satisfies all autonomous examination standards, bloom levels and syllabus requirements.";
      const splitRemarks = doc.splitTextToSize(remarksText, pageWidth - 28);
      doc.text(splitRemarks, 14, curY);
      curY += splitRemarks.length * 4 + 3;

      // Declaration Box
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Declaration:", 14, curY);
      curY += 3.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const splitDecl = doc.splitTextToSize(SCRUTINY_DECLARATION_TEXT, pageWidth - 28);
      doc.text(splitDecl, 14, curY);
      curY += splitDecl.length * 3.5 + 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`Date of Verification: ${verificationDate}`, 14, curY);
      curY += 4;

      // Committee Member's Verification Table
      doc.setFontSize(8.5);
      doc.text("Committee Member's Verification:", 14, curY);
      curY += 1.5;

      autoTable(doc, {
        startY: curY,
        theme: "grid",
        margin: { left: 14, right: 14 },
        head: [["Name of the Scrutiny Committee Member", "Affiliation", "Signature"]],
        headStyles: {
          fillColor: [240, 240, 245],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8,
          lineColor: [0, 0, 0],
          lineWidth: 0.25
        },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 4,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        body: [
          [
            { content: String(memberName), styles: { fontStyle: "bold" } },
            { content: String(memberAffiliation) },
            { content: report?.memberSignature ? "Digitally Signed ✓" : "Signed", styles: { halign: "center", fontStyle: "bold" } }
          ]
        ]
      });

      doc.save(`Scrutiny_Checklist_${courseCode}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate Verification Checklist PDF: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-zinc-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Top Navigation Bar */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#120c7a] via-[#1a129e] to-[#0c0852] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <FileCheck2 className="h-5 w-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-amber-400 text-black font-black">
                  {courseCode}
                </span>
                <h2 className="text-sm sm:text-base font-black truncate">
                  {courseName}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {report?.status === "submitted" ? "Scrutiny Completed ✓" : "Draft Scrutiny"}
                </span>
              </div>
              <p className="text-[11px] text-blue-200 truncate mt-0.5 font-medium">
                Autonomous Scrutiny Dossier • Member: <strong>{memberName}</strong> ({memberAffiliation})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeModalTab === "report" ? (
              <button
                type="button"
                onClick={handleDownloadReportPdf}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                title="Download Scrutiny Report matching Image 1 format"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download Report PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadChecklistPdf}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                title="Download Verification Checklist matching Image 2 format"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download Checklist PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sub-Header Tabs & Set Toggles */}
        <div className="px-5 py-3 bg-zinc-100 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModalTab("report")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                activeModalTab === "report"
                  ? "bg-[#120c7a] text-white shadow-xs"
                  : "bg-white text-zinc-700 hover:bg-zinc-200/80 border border-zinc-300"
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>1. Scrutiny Report (Q-Wise)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModalTab("checklist")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                activeModalTab === "checklist"
                  ? "bg-[#120c7a] text-white shadow-xs"
                  : "bg-white text-zinc-700 hover:bg-zinc-200/80 border border-zinc-300"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>2. Verification Checklist (11 Points)</span>
            </button>
          </div>

          {activeModalTab === "report" && (
            <div className="flex items-center gap-2 flex-wrap">
              {hasTwoSets && (
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-300">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase px-2">QP Set:</span>
                  {allowSetA && (
                    <button
                      type="button"
                      onClick={() => setActiveSet("setA")}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        effectiveSet === "setA" ? "bg-[#120c7a] text-white" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      Set A {allocatedScope === "setA" ? "(Allocated)" : ""}
                    </button>
                  )}
                  {allowSetB && (
                    <button
                      type="button"
                      onClick={() => setActiveSet("setB")}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        effectiveSet === "setB" ? "bg-[#120c7a] text-white" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      Set B {allocatedScope === "setB" ? "(Allocated)" : ""}
                    </button>
                  )}
                  {!allowSetA && (
                    <span className="text-[10px] font-bold text-zinc-400 italic px-2">
                      (Set A not allocated)
                    </span>
                  )}
                  {!allowSetB && (
                    <span className="text-[10px] font-bold text-zinc-400 italic px-2">
                      (Set B not allocated)
                    </span>
                  )}
                </div>
              )}

              {/* Scope badge */}
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 border border-zinc-200">
                Scope: {allocatedScope === "setA" ? "Set A Only" : allocatedScope === "setB" ? "Set B Only" : "Both Sets (Set A & B)"}
              </span>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-6">
          
          {/* TAB 1: SCRUTINY REPORT (IMAGE 1 TEMPLATE) */}
          {activeModalTab === "report" && (
            <div className="bg-white rounded-2xl border-2 border-zinc-300 p-6 sm:p-8 shadow-xs space-y-6 font-serif text-zinc-900">
              
              {/* Institutional Header */}
              <div className="text-center space-y-1 pb-4 border-b-2 border-black">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img src="/logo.png" alt="CKCET" className="h-10 w-auto object-contain" />
                </div>
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-black">
                  C.K. College of Engineering &amp; Technology
                </h1>
                <p className="text-xs font-sans font-bold text-zinc-700">
                  (An Autonomous Institution)
                </p>
                <p className="text-[10px] font-sans text-zinc-600">
                  Jayaram Nagar, Chellangkuppam, Cuddalore–607003, Tamil Nadu, India.
                </p>
                <div className="pt-2">
                  <h3 className="font-sans font-bold text-xs uppercase tracking-wide">
                    Office of the Controller of Examinations
                  </h3>
                  <h4 className="font-sans font-semibold text-xs text-zinc-800">
                    End Semester Examinations - {examSession}
                  </h4>
                  <div className="mt-2 inline-block px-4 py-1 bg-zinc-100 border border-black font-sans font-extrabold text-xs tracking-wider uppercase">
                    QUESTION PAPER SCRUTINY REPORT {hasTwoSets ? `(${effectiveSet === "setB" ? "SET B" : "SET A"})` : ""}
                  </div>
                </div>
              </div>

              {/* Course Meta Grid */}
              <div className="border border-black grid grid-cols-1 sm:grid-cols-2 text-xs font-sans">
                <div className="p-2.5 border-b sm:border-b-0 sm:border-r border-black flex items-center justify-between">
                  <span className="font-bold">Date:</span>
                  <span className="font-semibold">{verificationDate}</span>
                </div>
                <div className="p-2.5 flex items-center justify-between">
                  <span className="font-bold">Department:</span>
                  <span className="font-semibold">{department}</span>
                </div>
                <div className="p-2.5 border-t border-black sm:border-r flex items-center justify-between">
                  <span className="font-bold">Course Code:</span>
                  <span className="font-semibold font-mono">{courseCode}</span>
                </div>
                <div className="p-2.5 border-t border-black flex items-center justify-between">
                  <span className="font-bold">Course Name:</span>
                  <span className="font-semibold truncate">{courseName}</span>
                </div>
              </div>

              {/* Notice Banner if COE is reviewing */}
              {isCoeView && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl font-sans text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>COE Action Taken: You can type your administrative resolution into the "Action Taken" column below and click Save.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveActionTaken}
                    disabled={isSavingAction}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSavingAction ? "Saving..." : "Save Action Taken"}</span>
                  </button>
                </div>
              )}

              {/* Q-Wise Observations Table matching Image 1 */}
              <div className="border border-black overflow-x-auto font-sans">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-200/90 text-black font-extrabold border-b border-black text-center">
                      <th className="p-2 border-r border-black w-20">Q.No.</th>
                      <th className="p-2 border-r border-black">Observation / Error Identified</th>
                      <th className="p-2 border-r border-black">Suggested Correction</th>
                      <th className="p-2 w-48 sm:w-60">Action Taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(groupedObservations).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-zinc-500 font-bold italic">
                          No question-by-question observations recorded for this set.
                        </td>
                      </tr>
                    ) : (
                      Object.keys(groupedObservations).map((partName) => (
                        <React.Fragment key={partName}>
                          {/* Part Divider Header */}
                          <tr className="bg-zinc-100 font-extrabold text-zinc-900 border-t border-b border-black">
                            <td colSpan={4} className="p-2 text-center uppercase tracking-wide text-xs">
                              {partName}
                            </td>
                          </tr>

                          {/* Part Question Rows */}
                          {groupedObservations[partName].map((item, idx) => {
                            const setKey = effectiveSet;
                            const qKey = item.qNo || idx;
                            const currentVal = actionTakenState[`${setKey}_${qKey}`] ?? item.actionTaken ?? "";
                            const hasError = item.status === "NEEDS_CORRECTION" || Boolean(item.observation || item.suggestedCorrection);

                            return (
                              <tr key={qKey} className="border-b border-zinc-300 hover:bg-slate-50/70 transition-colors">
                                <td className="p-2 border-r border-black font-bold font-mono text-center align-top">
                                  {item.qNo || `Q.${idx + 1}`}
                                </td>
                                
                                <td className="p-2 border-r border-black align-top font-medium text-zinc-800">
                                  {hasError ? (
                                    <span className="text-rose-900 font-bold">{item.observation || "—"}</span>
                                  ) : (
                                    <span className="text-zinc-400 italic">Nil / No error identified</span>
                                  )}
                                </td>

                                <td className="p-2 border-r border-black align-top font-medium text-zinc-800">
                                  {hasError ? (
                                    <span className="text-indigo-900 font-semibold">{item.suggestedCorrection || "—"}</span>
                                  ) : (
                                    <span className="text-zinc-400 italic">Nil</span>
                                  )}
                                </td>

                                <td className="p-2 align-top">
                                  {isCoeView ? (
                                    <textarea
                                      rows={2}
                                      value={currentVal}
                                      onChange={(e) => handleActionTakenChange(setKey, qKey, e.target.value)}
                                      placeholder="e.g. Rectified in Master QP / Retained"
                                      className="w-full p-1.5 text-xs rounded border border-zinc-300 focus:border-[#120c7a] focus:ring-1 focus:ring-[#120c7a] bg-white font-sans"
                                    />
                                  ) : (
                                    <span className="font-semibold text-zinc-700">
                                      {currentVal || "Pending COE Review"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Scrutiny Member Signatory */}
              <div className="pt-6 border-t border-black flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 font-sans">
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-bold block">Verified by Scrutiny Committee Member:</span>
                  {report?.memberSignature ? (
                    <div className="border border-zinc-200 rounded p-1 bg-white inline-block">
                      <img src={report.memberSignature} alt="Signature" className="h-10 max-w-[150px] object-contain" />
                    </div>
                  ) : (
                    <div className="h-10 text-xs italic text-zinc-400 flex items-center">
                      (Signature on file)
                    </div>
                  )}
                  <p className="font-bold text-xs text-zinc-900">{memberName}</p>
                  <p className="text-[11px] text-zinc-600">{memberAffiliation}</p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <div className="h-10" />
                  <p className="font-bold text-xs text-zinc-900">Controller of Examinations</p>
                  <p className="text-[11px] text-zinc-600">CK College of Engineering &amp; Technology</p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: VERIFICATION CHECKLIST (IMAGE 2 TEMPLATE) */}
          {activeModalTab === "checklist" && (
            <div className="bg-white rounded-2xl border-2 border-zinc-300 p-6 sm:p-8 shadow-xs space-y-6 font-sans text-zinc-900">
              
              {/* Header */}
              <div className="text-center space-y-1 pb-4 border-b-2 border-black font-serif">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img src="/logo.png" alt="CKCET" className="h-10 w-auto object-contain" />
                </div>
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-black">
                  C.K. College of Engineering &amp; Technology
                </h1>
                <p className="text-xs font-sans font-bold text-zinc-700">
                  (An Autonomous Institution)
                </p>
                <div className="pt-2 font-sans">
                  <h3 className="font-bold text-xs uppercase tracking-wide">
                    Office of the Controller of Examinations
                  </h3>
                  <h4 className="font-semibold text-xs text-zinc-800">
                    End Semester Examinations {examSession} – Question Paper Scrutiny Report
                  </h4>
                </div>
              </div>

              {/* Course Details Box matching Image 2 */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-black">Course Details:</h4>
                <div className="border border-black grid grid-cols-1 sm:grid-cols-2 text-xs">
                  <div className="p-2 border-b sm:border-b-0 sm:border-r border-black flex items-center justify-between">
                    <span className="font-bold">Programme:</span>
                    <span className="font-semibold">{programme}</span>
                  </div>
                  <div className="p-2 flex items-center justify-between">
                    <span className="font-bold">Department:</span>
                    <span className="font-semibold">{department}</span>
                  </div>
                  <div className="p-2 border-t border-black sm:border-r flex items-center justify-between">
                    <span className="font-bold">Course Code:</span>
                    <span className="font-semibold font-mono">{courseCode}</span>
                  </div>
                  <div className="p-2 border-t border-black flex items-center justify-between">
                    <span className="font-bold">Course Name:</span>
                    <span className="font-semibold truncate">{courseName}</span>
                  </div>
                </div>
              </div>

              {/* 11-point Verification Checklist Table matching Image 2 */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-black">Verification Checklist:</h4>
                <div className="border border-black overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200/90 text-black font-extrabold border-b border-black text-center">
                        <th className="p-2 border-r border-black w-14">Sl.No.</th>
                        <th className="p-2 border-r border-black text-left">Description</th>
                        <th className="p-2 border-r border-black w-24">Status<br />Yes / No</th>
                        <th className="p-2 w-48 sm:w-60">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCRUTINY_CHECKLIST_ITEMS.map((item) => {
                        const itemVal = report?.checklist?.[`item_${item.id}`] || report?.checklist?.[item.id] || {};
                        const status = itemVal.status || "Yes";
                        const comments = itemVal.comments || "Satisfied";

                        return (
                          <tr key={item.id} className="border-b border-zinc-300 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2 border-r border-black text-center font-bold font-mono align-top">
                              {item.id}
                            </td>
                            <td className="p-2 border-r border-black align-top font-medium text-zinc-900">
                              {item.text}
                            </td>
                            <td className="p-2 border-r border-black text-center align-top font-bold">
                              <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-black ${
                                String(status).toUpperCase() === "YES"
                                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                  : "bg-rose-100 text-rose-900 border border-rose-300"
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="p-2 align-top text-zinc-700 font-medium">
                              {comments || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks / Observation Box */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-black">Remarks / Observation:</h4>
                <div className="p-3 border border-black rounded-lg bg-zinc-50/50 text-xs text-zinc-800 leading-relaxed font-medium min-h-[50px]">
                  {report?.remarks || "All questions align accurately with the autonomous course syllabus, appropriate Bloom's levels, and duration."}
                </div>
              </div>

              {/* Declaration Box matching Image 2 */}
              <div className="space-y-1 p-3.5 border border-zinc-300 rounded-xl bg-zinc-50">
                <h4 className="font-bold text-xs text-black">Declaration:</h4>
                <p className="text-[11px] text-zinc-700 leading-relaxed italic">
                  "{SCRUTINY_DECLARATION_TEXT}"
                </p>
                <div className="pt-2 text-xs font-bold text-zinc-900">
                  Date of Verification: <span className="font-semibold underline ml-1">{verificationDate}</span>
                </div>
              </div>

              {/* Committee Member's Verification Table matching Image 2 */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-black">Committee Member's Verification:</h4>
                <div className="border border-black overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200/90 text-black font-extrabold border-b border-black">
                        <th className="p-2.5 border-r border-black w-1/3">Name of the Scrutiny Committee Member</th>
                        <th className="p-2.5 border-r border-black w-1/3">Affiliation</th>
                        <th className="p-2.5 w-1/3 text-center">Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-3 border-r border-black font-bold align-middle">
                          {memberName}
                        </td>
                        <td className="p-3 border-r border-black font-medium align-middle">
                          {memberAffiliation}
                        </td>
                        <td className="p-3 text-center align-middle">
                          {report?.memberSignature ? (
                            <img src={report.memberSignature} alt="Member Signature" className="h-10 max-w-[150px] mx-auto object-contain" />
                          ) : (
                            <span className="font-mono text-emerald-800 font-extrabold text-[11px] px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                              Digitally Verified &amp; Signed ✓
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-100 border-t border-zinc-300 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-600 font-semibold">
            <Building className="h-4 w-4 text-[#120c7a]" />
            <span>Autonomous Examination Board • Office of the COE</span>
          </div>

          <div className="flex items-center gap-2">
            {activeModalTab === "report" && isCoeView && (
              <button
                type="button"
                onClick={handleSaveActionTaken}
                disabled={isSavingAction}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSavingAction ? "Saving..." : "Save Action Taken"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 font-extrabold text-xs border border-zinc-300 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

