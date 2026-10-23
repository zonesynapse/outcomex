import React, { useState, useEffect, useRef } from "react";
import { Printer, X, ShieldCheck, Download, RefreshCw, FileText, CheckCircle2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db, auth } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

/**
 * Reusable Appointment Order Copy Modal matching the official CKCET COE Autonomous format.
 * Features:
 * - Beautiful, spacious Single-Page A4 Layout (perfect typography, line-heights and spacing).
 * - Direct vector A4 PDF Generation using jsPDF + autoTable (guaranteed 1 page, zero stuffiness).
 * - High-resolution PDF Preview modal with dedicated Download & Print options.
 * - Single primary button in modal header, clean single Close in footer.
 * - Clean document layout with official letterhead, tables, and signature placed above the signatory name.
 */
export default function AppointmentOrderCopyModal({ assignment, onClose }) {
  const printRef = useRef(null);
  const sigImgRef = useRef(null);

  // PDF Preview & Generation States
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);

  // Dynamic Signature Fallback (one-time safe fetch, no real-time stream subscription)
  const [fallbackSignature, setFallbackSignature] = useState("");
  const [fallbackSignatoryName, setFallbackSignatoryName] = useState("Dr. N. Kamalakannan");
  const [fallbackSignatoryTitle, setFallbackSignatoryTitle] = useState("Controller of Examinations");

  useEffect(() => {
    // Only attempt quiet one-time read if an authenticated staff user is logged in
    if (!auth.currentUser) return;

    let isMounted = true;
    (async () => {
      try {
        // Priority 1: Check active logged-in user profile directly
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userSnap.exists() && isMounted) {
          const ud = userSnap.data();
          const uSig = ud.signatureUrl || ud.signature || ud.coeSignatureUrl;
          if (uSig) setFallbackSignature(uSig);
          if (ud.displayName || ud.name) setFallbackSignatoryName(ud.displayName || ud.name);
          if (ud.designation) setFallbackSignatoryTitle(ud.designation);
          return;
        }

        // Priority 2: Check institutional COE settings
        const snap = await getDoc(doc(db, "coe_settings", "official_signature"));
        if (snap.exists() && isMounted) {
          const d = snap.data();
          if (d.signatureUrl) setFallbackSignature(d.signatureUrl);
          if (d.signatoryName) setFallbackSignatoryName(d.signatoryName);
          if (d.signatoryTitle) setFallbackSignatoryTitle(d.signatoryTitle);
        }
      } catch (e) {
        // Silently ignore if rules restrict read for external setters
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [assignment]);

  if (!assignment) return null;

  const setterName = assignment.setterName || "External Setter";
  const examSession = assignment.examSession || "Nov./Dec. 2026";
  const numSets = Number(assignment.numSets) || 1;
  const deadline = assignment.submissionDeadline
    ? (new Date(assignment.submissionDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
    : "Within 10 Days";

  const subjectCode = assignment.subjectCode || "—";
  const subjectTitle = assignment.subjectTitle || "—";

  // Dynamic Common Department Resolution
  const [resolvedCommonDept, setResolvedCommonDept] = useState(null);

  useEffect(() => {
    if (!assignment) return;

    // 1. Direct check from assignment / orderCopyData
    const existing = assignment.orderCopyData?.department || assignment.department || assignment.deptDisplay || "";
    if (existing.toUpperCase().includes("COMMON")) {
      setResolvedCommonDept(existing);
      return;
    }

    // 2. Check if array of departments is provided
    const depts = assignment.departments || assignment.orderCopyData?.departments || assignment.commonDepartments;
    if (Array.isArray(depts) && depts.length > 1) {
      setResolvedCommonDept(`COMMON (${depts.join(", ")})`);
      return;
    }

    // 3. Query courses collection for common subject mappings
    const code = assignment.subjectCode;
    if (!code || code === "—") return;

    let isMounted = true;
    (async () => {
      try {
        const found = new Set();
        const getShort = (str) => {
          if (!str) return "";
          const s = String(str).toUpperCase().trim();
          if (s.includes("BIOMEDICAL") || s.includes("BIO MEDICAL") || s.includes("BME")) return "Bio Medical Engineering";
          if (s.includes("ROBOTICS")) return "Robotics and Automation";
          if (s.includes("COMPUTER SCIENCE") || s.includes("CSE")) return "CSE";
          if (s.includes("ARTIFICIAL INTELLIGENCE") || s.includes("AI&DS") || s.includes("AIDS")) return "AI&DS";
          if (s.includes("ELECTRONICS AND COMMUNICATION") || s.includes("ECE")) return "ECE";
          if (s.includes("ELECTRICAL AND ELECTRONICS") || s.includes("EEE")) return "EEE";
          if (s.includes("MECHANICAL") || s.includes("MECH")) return "MECH";
          if (s.includes("CIVIL")) return "CIVIL";
          if (s.includes("INFORMATION TECHNOLOGY") || s.includes("IT")) return "IT";
          return str;
        };

        const q = query(collection(db, "courses"), where("code", "==", code));
        const snap = await getDocs(q);
        snap.forEach(d => {
          const dData = d.data();
          if (dData.dept) found.add(getShort(dData.dept));
          if (dData.department) found.add(getShort(dData.department));
          if (Array.isArray(dData.departments)) dData.departments.forEach(dept => found.add(getShort(dept)));
        });

        if (found.size > 1 && isMounted) {
          setResolvedCommonDept(`COMMON (${Array.from(found).join(", ")})`);
        }
      } catch (err) {
        // Silently skip
      }
    })();

    return () => { isMounted = false; };
  }, [assignment, subjectCode]);

  const formatDept = (d) => {
    if (!d) return "";
    const clean = String(d).trim();
    if (clean.toUpperCase().startsWith("COMMON")) return clean;
    const map = {
      CSE: "Computer Science and Engineering",
      IT: "Information Technology",
      ECE: "Electronics & Communication Engineering",
      EEE: "Electrical & Electronics Engineering",
      MECH: "Mechanical Engineering",
      CIVIL: "Civil Engineering",
      AIDS: "Artificial Intelligence & Data Science",
      MBA: "Master of Business Administration",
      MCA: "Master of Computer Applications",
      SNH: "Science & Humanities"
    };
    return map[clean.toUpperCase()] || clean;
  };

  const rawDept = resolvedCommonDept ||
    assignment.deptDisplay ||
    assignment.orderCopyData?.department ||
    assignment.department ||
    assignment.dept ||
    "";

  const department = rawDept.toUpperCase().includes("COMMON")
    ? rawDept
    : (formatDept(rawDept) ||
      (assignment.subjectCode?.startsWith("IT") ? "Information Technology" :
        assignment.subjectCode?.startsWith("CS") ? "Computer Science and Engineering" :
          assignment.subjectCode?.startsWith("EC") ? "Electronics & Communication Engineering" :
            assignment.subjectCode?.startsWith("EE") ? "Electrical & Electronics Engineering" :
              assignment.subjectCode?.startsWith("ME") ? "Mechanical Engineering" :
                assignment.subjectCode?.startsWith("BA") ? "Management Studies" :
                  "Engineering & Technology"));

  const rawProg = assignment.orderCopyData?.programme || assignment.programme || "";
  const programme = (rawProg === "B.E." || rawProg === "B.Tech." || !rawProg) ? "UG" : rawProg;

  const regulation = assignment.regulation || "AU - R2021";
  const semester = assignment.semester || "III";
  const duration = assignment.duration || assignment.submittedPaper?.duration || "3 Hours";
  const maxMarks = assignment.maxMarks || assignment.submittedPaper?.maxMarks || 100;

  // Resolved Signatory Details - Official institutional appointment order is strictly signed by the Controller of Examinations
  const coeName = assignment.orderCopyData?.coeName || assignment.coeName || fallbackSignatoryName || "Dr. N. Kamalakannan";
  const coeTitle = "Controller of Examinations";
  const coeCollege = assignment.orderCopyData?.coeCollege || "C.K. College of Engineering & Technology";
  const coeLocation = assignment.orderCopyData?.coeLocation || "Cuddalore – 607 003";
  const coeContact = assignment.orderCopyData?.coeContact || "94884 93434";

  // Resolved Digital Signature
  const resolvedCoeSignature = assignment.orderCopyData?.coeSignatureBase64 ||
    assignment.orderCopyData?.coeSignatureUrl ||
    assignment.coeSignatureBase64 ||
    assignment.coeSignatureUrl ||
    fallbackSignature ||
    null;

  /**
   * Safe image URL resolver:
   * - Data URLs are preserved as-is.
   * - Localhost: uses /fb-storage-proxy for local development.
   * - Production: preserves original public URL so standard <img> tags load cleanly without CORS restrictions.
   */
  const toSafeImageUrl = (url) => {
    if (!url || typeof url !== "string") return null;
    if (url.startsWith("data:")) return url;
    const isLocalhost = typeof window !== "undefined" && (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
    if (isLocalhost && url.startsWith("https://firebasestorage.googleapis.com")) {
      return url.replace("https://firebasestorage.googleapis.com", "/fb-storage-proxy");
    }
    return url;
  };

  const [sigBase64, setSigBase64] = useState(null);

  /**
   * Universal helper to convert any image URL to a clean Base64 data URL.
   * Supports:
   * 1. Direct Base64 data URLs (instant return).
   * 2. Local dev proxy (/fb-storage-proxy) on localhost.
   * 3. Cloudflare-backed global image proxy (wsrv.nl / weserv.nl) with Access-Control-Allow-Origin: *
   *    which converts remote Firebase Storage images into clean Base64 on production without CORS errors.
   * 4. Direct fetch fallback.
   * 5. Canvas fallback.
   */
  const loadImageBase64 = async (url) => {
    if (!url) return null;
    if (typeof url === "string" && url.startsWith("data:")) return url;

    const convertBlobToBase64 = (blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    const isLocalhost = typeof window !== "undefined" && (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );

    // 1. If running on localhost with Vite proxy, use /fb-storage-proxy
    if (isLocalhost && typeof url === "string" && url.startsWith("https://firebasestorage.googleapis.com")) {
      try {
        const localProxyUrl = url.replace("https://firebasestorage.googleapis.com", "/fb-storage-proxy");
        const resp = await fetch(localProxyUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const base64 = await convertBlobToBase64(blob);
          if (base64 && typeof base64 === "string" && base64.startsWith("data:image")) return base64;
        }
      } catch (proxyErr) {
        // Fall through
      }
    }

    // 2. High-performance CORS-free edge image loader via wsrv.nl (sends Access-Control-Allow-Origin: *)
    if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
      try {
        const corsProxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
        const resp = await fetch(corsProxyUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const base64 = await convertBlobToBase64(blob);
          if (base64 && typeof base64 === "string" && base64.startsWith("data:image")) return base64;
        }
      } catch (wsrvErr) {
        // Try secondary weserv endpoint
        try {
          const secondaryProxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=png`;
          const resp2 = await fetch(secondaryProxyUrl);
          if (resp2.ok) {
            const blob2 = await resp2.blob();
            const base64_2 = await convertBlobToBase64(blob2);
            if (base64_2 && typeof base64_2 === "string" && base64_2.startsWith("data:image")) return base64_2;
          }
        } catch (secondaryErr) {
          // Fall through
        }
      }
    }

    // 3. Direct fetch attempt with CORS
    try {
      const resp = await fetch(url, { mode: "cors" });
      if (resp.ok) {
        const blob = await resp.blob();
        const base64 = await convertBlobToBase64(blob);
        if (base64 && typeof base64 === "string" && base64.startsWith("data:image")) return base64;
      }
    } catch (directErr) {
      // Fall through
    }

    // 4. Fallback via Image element canvas
    try {
      const base64 = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || 300;
            canvas.height = img.naturalHeight || 100;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (base64 && typeof base64 === "string" && base64.startsWith("data:image")) return base64;
    } catch {
      return null;
    }

    return null;
  };

  // Preload signature as Base64 on mount so it renders immediately on screen
  // and is ready for instantaneous single-page PDF generation without lag
  useEffect(() => {
    let isMounted = true;
    if (!resolvedCoeSignature) return;

    if (resolvedCoeSignature.startsWith("data:")) {
      setSigBase64(resolvedCoeSignature);
      return;
    }

    (async () => {
      const b64 = await loadImageBase64(resolvedCoeSignature);
      if (b64 && isMounted) {
        setSigBase64(b64);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [resolvedCoeSignature]);

  /**
   * Professional Document Creator: Directly builds a spacious, dignified, single-page A4 PDF
   * using jsPDF vector engine with AutoTable and embedded digital signature.
   * Fills the A4 canvas gracefully with clear typography, comfortable line-heights, and zero stuffiness.
   */
  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2); // 182mm
      let currentY = 10;

      // 1. Institutional Banner Logo - Centered with high clarity
      const logoData = await loadImageBase64("/logo.png");
      if (logoData) {
        try {
          const logoWidth = 158;
          const logoHeight = 22;
          const logoX = (pageWidth - logoWidth) / 2;
          doc.addImage(logoData, "PNG", logoX, currentY, logoWidth, logoHeight, undefined, "FAST");
          currentY += logoHeight + 2;
        } catch (e) {
          currentY += 6;
        }
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(18, 12, 122);
        doc.text("C.K. COLLEGE OF ENGINEERING & TECHNOLOGY", pageWidth / 2, currentY + 5, { align: "center" });
        currentY += 10;
      }

      // 2. Sub-Header Rule & Office of COE Title
      doc.setDrawColor(18, 12, 122);
      doc.setLineWidth(0.6);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 4;

      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.setTextColor(18, 12, 122);
      doc.text("OFFICE OF THE CONTROLLER OF EXAMINATIONS", pageWidth / 2, currentY, { align: "center" });
      currentY += 5.5;

      // 3. Salutation & Greetings
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Dear Prof. ${setterName},`, margin, currentY);
      currentY += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text("Good Day! Greetings from C.K. College of Engineering & Technology, Cuddalore!", margin, currentY);
      currentY += 4.5;

      // 4. Subject Line
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(18, 12, 122);
      const subjectText = `Sub: End Semester Examinations – ${examSession} – Appointment of Question Paper Setter – Reg.`;
      doc.text(subjectText, margin, currentY);
      currentY += 5;

      // 5. Appointment Intro Paragraph
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.setTextColor(30, 41, 59);
      const introText = `I am, by direction, to inform you that you have been appointed as a Question Paper Setter for the End Semester Theory Examinations to be held in ${examSession}, under the Autonomous Scheme of C.K. College of Engineering & Technology, for the subject mentioned below. You are requested to kindly set the question paper as per the prescribed format, syllabus, regulations and examination requirements.`;
      const splitIntro = doc.splitTextToSize(introText, contentWidth);
      doc.text(splitIntro, margin, currentY);
      currentY += (splitIntro.length * 3.8) + 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.text("The details of the question paper assignment are as follows:", margin, currentY);
      currentY += 3.5;

      // 6. Table 1: Question Paper Details
      const isDeptLong = department.length > 35;
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Programme", "Department", "Regulations", "Semester", "Duration", "Max. Marks"]],
        body: [[programme, department, regulation, semester, duration, String(maxMarks)]],
        theme: "grid",
        styles: {
          fontSize: 8.5,
          cellPadding: 2.2,
          textColor: [15, 23, 42],
          lineColor: [30, 41, 59],
          lineWidth: 0.25,
          halign: "center",
          valign: "middle"
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          fontSize: 8.5
        },
        columnStyles: {
          0: { cellWidth: 20, halign: "center" },
          1: { cellWidth: 80, halign: "left", fontStyle: "bold", fontSize: isDeptLong ? 7.2 : 8.5 },
          2: { cellWidth: 24, halign: "center" },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 20, halign: "center", fontStyle: "bold" },
          5: { cellWidth: 20, halign: "center", fontStyle: "bold" }
        }
      });
      currentY = doc.lastAutoTable.finalY + 3.8;

      // 7. Table 2: Subject Details
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Subject Code", "Subject Name", "No. of Question Papers", "Last Date for Submission"]],
        body: [[
          subjectCode,
          subjectTitle,
          numSets === 2 ? "2 (Set A & Set B)" : "1 (Set A)",
          deadline
        ]],
        theme: "grid",
        styles: {
          fontSize: 8.5,
          cellPadding: 2.2,
          textColor: [15, 23, 42],
          lineColor: [30, 41, 59],
          lineWidth: 0.25,
          halign: "center",
          valign: "middle"
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          fontSize: 8.5
        },
        columnStyles: {
          0: { cellWidth: 28, halign: "center", fontStyle: "bold", textColor: [18, 12, 122] },
          1: { cellWidth: 80, halign: "left", fontStyle: "bold" },
          2: { cellWidth: 38, halign: "center", fontStyle: "bold" },
          3: { cellWidth: 36, halign: "center", fontStyle: "bold", textColor: [185, 28, 28] }
        }
      });
      currentY = doc.lastAutoTable.finalY + 4;

      // 8. Guidelines & Confidentiality Terms
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      const p1 = `A copy of the syllabus, question paper pattern and necessary instructions will also be available through the portal for your reference. The question paper shall be submitted only through the Digital QP Setting Portal on or before ${deadline}.`;
      const splitP1 = doc.splitTextToSize(p1, contentWidth);
      doc.text(splitP1, margin, currentY, { lineHeightFactor: 1.35 });
      currentY += (splitP1.length * 3.8) + 2.5;

      const p2 = "If any of your relatives are appearing for the above examination, you are requested to kindly decline the assignment and inform the Controller of Examinations immediately.";
      const splitP2 = doc.splitTextToSize(p2, contentWidth);
      doc.text(splitP2, margin, currentY, { lineHeightFactor: 1.35 });
      currentY += (splitP2.length * 3.8) + 3;

      // Remuneration Highlight Box
      const remunText = "The remuneration for setting two Question Papers (Set A & Set B) is Rs. 3,000/-, while the remuneration for setting a single Question Paper (either Set A or Set B) is Rs. 2,000/-.";
      const splitRemun = doc.splitTextToSize(remunText, contentWidth - 8);
      const remunBoxH = (splitRemun.length * 4.0) + 4.5;
      doc.setFillColor(254, 252, 232);
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, currentY, contentWidth, remunBoxH, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 53, 15);
      doc.text(splitRemun, margin + 4, currentY + 3.8, { lineHeightFactor: 1.3 });
      currentY += remunBoxH + 3.5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const confText = "The appointment, login credentials, question paper contents and all related information shall be treated as STRICTLY CONFIDENTIAL.";
      const splitConf = doc.splitTextToSize(confText, contentWidth);
      doc.text(splitConf, margin, currentY, { lineHeightFactor: 1.35 });
      currentY += (splitConf.length * 3.8) + 2.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const closingText = "We sincerely appreciate your valuable academic contribution and look forward to your cooperation and timely submission of the question paper through the new digital platform.";
      const splitClosing = doc.splitTextToSize(closingText, contentWidth);
      doc.text(splitClosing, margin, currentY, { lineHeightFactor: 1.35 });
      currentY += (splitClosing.length * 3.8) + 4;

      // 9. Digital Signature Block (Positioned gracefully on the bottom right)
      const sigBlockHeight = 44;
      const maxAllowedY = pageHeight - margin - sigBlockHeight;
      currentY = Math.max(currentY, Math.min(currentY + 6, maxAllowedY));

      const sigBlockX = pageWidth - margin;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text("With regards,", sigBlockX, currentY, { align: "right" });
      currentY += 1.5;

      // Embed Digital Signature Image directly above the name
      if (resolvedCoeSignature || sigBase64) {
        try {
          const sigData = sigBase64 || await loadImageBase64(resolvedCoeSignature);
          if (sigData) {
            const sigW = 38;
            const sigH = 13;
            const sigX = sigBlockX - sigW;
            const format = sigData.includes("image/jpeg") || sigData.includes("image/jpg") ? "JPEG" : "PNG";
            doc.addImage(sigData, format, sigX, currentY, sigW, sigH, undefined, "FAST");
            currentY += sigH + 1.5;
          } else {
            currentY += 10;
          }
        } catch (sigErr) {
          console.warn("Could not embed signature in PDF:", sigErr);
          currentY += 10;
        }
      } else {
        currentY += 10;
      }

      // Signatory Details
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(coeName, sigBlockX, currentY, { align: "right" });
      currentY += 4.2;

      // Controller of Examinations in bold institutional blue
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(18, 12, 122);
      doc.text(coeTitle, sigBlockX, currentY, { align: "right" });
      currentY += 3.8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(coeCollege, sigBlockX, currentY, { align: "right" });
      currentY += 3.4;

      doc.text(coeLocation, sigBlockX, currentY, { align: "right" });
      currentY += 3.4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.setTextColor(30, 41, 59);
      doc.text(`Contact: ${coeContact}`, sigBlockX, currentY, { align: "right" });

      // Guarantee single page - if any accidental page break occurred, remove it
      while (doc.getNumberOfPages() > 1) {
        doc.deletePage(doc.getNumberOfPages());
      }

      // Build Blob and launch dedicated high-resolution single-page Preview Modal
      const blob = doc.output("blob");
      const blobUrl = URL.createObjectURL(blob);

      setPdfDoc(doc);
      setPdfBlobUrl(blobUrl);
      setShowPdfPreview(true);
    } catch (err) {
      console.error("Vector PDF generation error:", err);
      alert("Failed to prepare PDF. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfDoc) return;
    const cleanSubject = String(subjectCode || "QP").replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanSetter = String(setterName || "Faculty").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    pdfDoc.save(`Appointment_Order_${cleanSubject}_${cleanSetter}.pdf`);
  };

  /**
   * Prints ONLY the generated single-page PDF document via a hidden iframe,
   * completely avoiding background page and 12-page empty browser print dialogs.
   */
  const handlePrintPdf = () => {
    if (!pdfBlobUrl) return;
    const printIframe = document.createElement("iframe");
    printIframe.style.position = "fixed";
    printIframe.style.right = "0";
    printIframe.style.bottom = "0";
    printIframe.style.width = "0";
    printIframe.style.height = "0";
    printIframe.style.border = "none";
    printIframe.src = pdfBlobUrl;
    document.body.appendChild(printIframe);

    printIframe.onload = () => {
      try {
        printIframe.contentWindow?.focus();
        printIframe.contentWindow?.print();
      } catch (e) {
        console.warn("Iframe print error:", e);
      }
      setTimeout(() => {
        try {
          document.body.removeChild(printIframe);
        } catch (e) { }
      }, 2000);
    };
  };

  return (
    <>
      {/* Main Appointment Order Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">

          {/* Top Modal Controls (Single Primary Button in Header) */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-black tracking-wide">Official Appointment Order</h3>
                <p className="text-[11px] text-slate-300 font-semibold">
                  Autonomous Theory Examinations • {examSession}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isGeneratingPdf ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Preparing PDF...</span>
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" />
                    <span>Print / Save PDF</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Document Preview Body - Beautiful, spacious layout */}
          <div
            id="printable-appointment-order"
            ref={printRef}
            className="overflow-y-auto p-6 sm:p-12 text-slate-900 bg-white space-y-6 font-sans select-text leading-relaxed"
          >

            {/* Institutional Header Banner: Centered Logo with Office of the Controller of Examinations */}
            <div className="border-b-2 border-slate-900 pb-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-full flex justify-center items-center">
                <img
                  src="/logo.png"
                  alt="CKCET Logo Banner"
                  className="w-full max-w-2xl sm:max-w-3xl h-auto max-h-24 sm:max-h-28 object-contain mx-auto"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
              <div className="text-center pt-0.5">
                <h5 className="text-xs sm:text-sm font-black uppercase text-[#120c7a] tracking-wider font-serif">
                  Office of the Controller of Examinations
                </h5>
              </div>
            </div>

            {/* Salutation */}
            <div className="space-y-1 pt-1">
              <p className="text-sm sm:text-base font-bold text-slate-900">
                Dear Prof. <span className="underline font-extrabold text-[#120c7a]">{setterName}</span>,
              </p>
              <p className="text-xs sm:text-sm font-semibold text-slate-800">
                Good Day!
              </p>
            </div>

            {/* Greetings & Subject */}
            <div className="space-y-1.5">
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                Greetings from C.K. College of Engineering & Technology, Cuddalore!
              </p>
              <p className="text-xs sm:text-sm font-extrabold text-[#120c7a] leading-relaxed">
                Sub: End Semester Examinations – {examSession} – Appointment of Question Paper Setter – Reg.
              </p>
            </div>

            {/* Introduction Paragraph */}
            <p className="text-xs sm:text-[13px] leading-relaxed text-slate-800 text-justify">
              I am, by direction, to inform you that you have been appointed as a <strong>Question Paper Setter</strong> for the <strong>End Semester Theory Examinations to be held in {examSession}</strong>, under the Autonomous Scheme of <strong>C.K. College of Engineering & Technology</strong>, for the subject mentioned below. You are requested to kindly set the question paper as per the prescribed format, syllabus, regulations and examination requirements.
            </p>

            <p className="text-xs sm:text-[13px] font-bold text-slate-900">
              The details of the question paper assignment are as follows:
            </p>

            {/* Table 1: Question Paper Details */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#120c7a]">
                Question Paper Details
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-sm">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-extrabold border-b border-slate-800">
                      <th className="p-2 border-r border-slate-800">Programme</th>
                      <th className="p-2 border-r border-slate-800">Department</th>
                      <th className="p-2 border-r border-slate-800">Regulations</th>
                      <th className="p-2 border-r border-slate-800">Semester</th>
                      <th className="p-2 border-r border-slate-800">Duration</th>
                      <th className="p-2">Max. Marks</th>
                    </tr>
                  </thead>
                  <tbody className="font-semibold text-slate-800 text-xs">
                    <tr className="divide-x divide-slate-800">
                      <td className="p-2">{programme}</td>
                      <td className="p-2 font-bold text-left">{department}</td>
                      <td className="p-2">{regulation}</td>
                      <td className="p-2">{semester}</td>
                      <td className="p-2 font-bold">{duration}</td>
                      <td className="p-2 font-bold">{maxMarks}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Subject Details */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#120c7a]">
                Subject Details
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-sm">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-extrabold border-b border-slate-800">
                      <th className="p-2 border-r border-slate-800">Subject Code</th>
                      <th className="p-2 border-r border-slate-800">Subject Name</th>
                      <th className="p-2 border-r border-slate-800">No. of Question Papers</th>
                      <th className="p-2">Last Date for Submission</th>
                    </tr>
                  </thead>
                  <tbody className="font-semibold text-slate-800 text-xs">
                    <tr className="divide-x divide-slate-800">
                      <td className="p-2 font-mono font-bold text-[#120c7a]">{subjectCode}</td>
                      <td className="p-2 text-left font-bold">{subjectTitle}</td>
                      <td className="p-2">
                        <span className="inline-block px-2.5 py-0.5 rounded font-black text-xs bg-amber-100 text-amber-950">
                          {numSets} {numSets === 2 ? "(Set A & Set B)" : "(Set A)"}
                        </span>
                      </td>
                      <td className="p-2 font-bold text-rose-700">{deadline}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instructions and Guidelines */}
            <div className="space-y-3 text-xs sm:text-[13px] leading-relaxed text-slate-800 text-justify">
              <p>
                A copy of the <strong>syllabus, question paper pattern and necessary instructions</strong> will also be available through the portal for your reference. The question paper shall be submitted <strong>only through the Digital QP Setting Portal</strong> on or before <strong className="underline text-[#120c7a]">{deadline}</strong>.
              </p>

              <p>
                If any of your <strong>relatives are appearing for the above examination</strong>, you are requested to kindly <strong>decline the assignment</strong> and inform the Controller of Examinations immediately.
              </p>

              <p className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 font-medium">
                The remuneration for setting <strong>two Question Papers (Set A & Set B) is Rs. 3,000/-</strong>, while the remuneration for setting <strong>a single Question Paper (either Set A or Set B) is Rs. 2,000/-</strong>.
              </p>

              <p>
                The appointment, login credentials, question paper contents and all related information shall be treated as <strong>STRICTLY CONFIDENTIAL</strong>.
              </p>

              <p>
                We sincerely appreciate your valuable academic contribution and look forward to your <strong>cooperation and timely submission</strong> of the question paper through the new digital platform.
              </p>
            </div>

            {/* Signature Block - Right Aligned with Signature Perfectly Placed Above Signatory Name */}
            <div className="pt-4 border-t border-slate-200 flex justify-end text-xs sm:text-sm">
              <div className="flex flex-col items-end text-right space-y-0.5 min-w-[240px]">
                <p className="font-semibold text-slate-700 text-xs sm:text-sm mb-1">With regards,</p>

                {/* Digital Signature placed perfectly above the name */}
                <div className="h-16 flex items-center justify-end py-1">
                  {(sigBase64 || resolvedCoeSignature) ? (
                    <img
                      ref={sigImgRef}
                      src={sigBase64 || resolvedCoeSignature}
                      alt="Controller of Examinations Signature"
                      className="h-14 sm:h-16 w-auto max-w-[200px] object-contain mix-blend-multiply"
                      onError={(e) => {
                        if (resolvedCoeSignature && !e.currentTarget.src.includes("wsrv.nl")) {
                          e.currentTarget.src = `https://wsrv.nl/?url=${encodeURIComponent(resolvedCoeSignature)}&output=png`;
                        }
                      }}
                    />
                  ) : (
                    <div className="h-12 border-b border-dashed border-slate-300 w-36 flex items-end justify-center">
                      <span className="text-[10px] text-slate-400 italic">(Digital Signature)</span>
                    </div>
                  )}
                </div>

                <p className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">{coeName}</p>
                <p className="font-bold text-[#120c7a] text-xs sm:text-sm leading-tight">{coeTitle}</p>
                <p className="text-xs text-slate-600 leading-tight">{coeCollege}</p>
                <p className="text-xs text-slate-600 leading-tight">{coeLocation}</p>
                <p className="text-xs font-bold text-slate-800 leading-tight">Contact: {coeContact}</p>
              </div>
            </div>
          </div>

          {/* Modal Footer - Single Clean Close Button */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-zinc-200 flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Official Autonomous Examination Wing • CKCET</span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </div>

      {/* DEDICATED HIGH-RESOLUTION SINGLE-PAGE PDF PREVIEW & DOWNLOAD MODAL */}
      {showPdfPreview && pdfBlobUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
          <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[94vh] animate-in fade-in zoom-in-95 duration-200">

            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-400 text-slate-950 font-black">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-wide flex items-center gap-2">
                    <span>Official Appointment Order PDF Preview</span>
                    {/* <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      A4 Single Page
                    </span> */}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    {subjectCode} • {subjectTitle} • Prof. {setterName}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print Document</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Close PDF Preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Embedded Single-Page PDF Viewer */}
            <div className="flex-1 w-full bg-slate-100 p-2 sm:p-4 overflow-hidden flex items-center justify-center">
              <iframe
                src={`${pdfBlobUrl}#view=Fit&toolbar=0&navpanes=0`}
                title="Appointment Order PDF"
                className="w-full h-full rounded-2xl border border-slate-300 shadow-inner bg-white"
              />
            </div>

            {/* Bottom Info Bar */}
            <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-semibold shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Single-page format with official Controller of Examinations digital signature & autonomous letterhead.</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="text-[#120c7a] hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> Save Copy to Computer
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
