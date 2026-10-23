import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../../firebase";
import { signInAnonymously } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, query, where, serverTimestamp
} from "firebase/firestore";
import {
  Lock, Eye, EyeOff, CheckCircle2, XCircle, FileText, Upload, Sparkles, AlertCircle,
  Send, Edit3, BookOpen, Layers, RefreshCw, ChevronRight, Landmark, X, Printer,
  ShieldCheck, Award, FileCheck, Building2, Check, ArrowLeft, ArrowRight, Info, HelpCircle,
  ClipboardCheck, Mail, Camera, ExternalLink, Split, BookmarkCheck, Save,
  AlertTriangle, BarChart3, Cpu, Zap, SlidersHorizontal, ArrowUpRight, ShieldAlert, LogOut,
  Package, Table as TableIcon, LineChart, BookMarked, Grid, FileCode2, ChevronDown, ChevronUp
} from "lucide-react";
import { getEmbeddableDocumentUrl } from "../../utils/documentEmbedUtils";
import DocumentEmbedViewer from "../../components/DocumentEmbedViewer";
import MathTemplateToolbar from "../../components/MathTemplateToolbar";
import AppointmentOrderCopyModal from "../../components/AppointmentOrderCopyModal";
import {
  DEFAULT_PERMITTED_MATERIALS,
  hasAnyPermittedMaterial,
  formatPermittedMaterialsNotice,
  getPermittedMaterialsList
} from "../../utils/permittedMaterialsUtils";

const ROMAN_LABELS = ["i)", "ii)", "iii)", "iv)", "v)", "vi)", "vii)", "viii)"];
const getRomanLabel = (idx) => ROMAN_LABELS[idx] || `${idx + 1})`;

const createDefaultSubParts = (count, totalMarks) => {
  const parts = [];
  const target = Number(totalMarks) || 16;
  const baseMark = Math.floor(target / count);
  const remainder = target - (baseMark * count);

  for (let i = 0; i < count; i++) {
    const mark = (i === count - 1) ? (baseMark + remainder) : baseMark;
    parts.push({
      id: `sub_${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      label: getRomanLabel(i),
      text: "",
      marks: mark
    });
  }
  return parts;
};

const getSubPartsSum = (subParts) => {
  if (!Array.isArray(subParts)) return 0;
  return subParts.reduce((sum, sp) => sum + (Number(sp.marks) || 0), 0);
};

const getSubPartsValidationMsg = (subParts, targetMarks, qLabel) => {
  if (!Array.isArray(subParts) || subParts.length === 0) return null;
  const currentSum = getSubPartsSum(subParts);
  const target = Number(targetMarks) || 0;

  if (currentSum !== target) {
    const diff = Math.abs(target - currentSum);
    if (currentSum < target) {
      return `Correct mark ku question set panunga: Total allocated marks sum to ${currentSum} marks instead of ${target} marks for Question ${qLabel} (${diff} marks short). Please adjust sub-part marks to total ${target}.`;
    } else {
      return `Correct mark ku question set panunga: Total allocated marks sum to ${currentSum} marks which exceeds question total of ${target} marks for Question ${qLabel} (by ${diff} marks). Please adjust sub-part marks to total ${target}.`;
    }
  }
  return null;
};

// Helper: Check if question HTML or text is empty or blank
export const isQuestionTextEmpty = (html) => {
  if (!html || typeof html !== "string") return true;
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return stripped.length === 0;
};

// Helper: Check question completion status and identify exact missing fields
export const getQuestionMissingStatus = (q) => {
  if (!q) return { isComplete: false, missingReasons: ["Question not initialized"] };
  const missing = [];

  // 1. Check Option A / Main Question
  if (q.isSplit) {
    if (!q.subParts || q.subParts.length === 0) {
      missing.push("Sub-parts are missing");
    } else {
      q.subParts.forEach((sp, idx) => {
        const lbl = sp.label || `(${idx + 1})`;
        if (isQuestionTextEmpty(sp.text)) {
          missing.push(`Sub-part ${lbl} text is empty`);
        }
        if (!sp.marks || Number(sp.marks) <= 0) {
          missing.push(`Sub-part ${lbl} marks not allocated`);
        }
      });
    }
  } else {
    if (isQuestionTextEmpty(q.text)) {
      missing.push(q.optionB !== undefined ? "Option (a) text is empty" : "Question text is empty");
    }
  }

  // 2. Check Option B if this is an either-or choice question
  if (q.optionB !== undefined) {
    if (q.isSplitOptionB) {
      if (!q.subPartsOptionB || q.subPartsOptionB.length === 0) {
        missing.push("Option (b) sub-parts are missing");
      } else {
        q.subPartsOptionB.forEach((sp, idx) => {
          const lbl = sp.label || `(${idx + 1})`;
          if (isQuestionTextEmpty(sp.text)) {
            missing.push(`Option (b) Sub-part ${lbl} text is empty`);
          }
          if (!sp.marks || Number(sp.marks) <= 0) {
            missing.push(`Option (b) Sub-part ${lbl} marks not allocated`);
          }
        });
      }
    } else {
      if (isQuestionTextEmpty(q.optionB)) {
        missing.push("Option (b) text is empty");
      }
    }
  }

  // 3. Check Marks
  if (!q.marks || Number(q.marks) <= 0) {
    missing.push("Marks not assigned");
  }

  return {
    isComplete: missing.length === 0,
    missingReasons: missing
  };
};

// Helper: Get comprehensive summary of all questions and missed questions in a paper
export const getPaperMissingQuestions = (paper, paperLabel = "Set A") => {
  if (!paper || !Array.isArray(paper.sections)) {
    return { totalQuestions: 0, completedCount: 0, missedQuestions: [], isAllComplete: false };
  }

  let totalQuestions = 0;
  let completedCount = 0;
  const missedQuestions = [];

  paper.sections.forEach((sec, secIdx) => {
    (sec.questions || []).forEach((q, qIdx) => {
      totalQuestions += 1;
      const status = getQuestionMissingStatus(q);
      if (status.isComplete) {
        completedCount += 1;
      } else {
        missedQuestions.push({
          paperLabel,
          sectionName: sec.name || `Section ${secIdx + 1}`,
          secIdx,
          qIdx,
          qNo: q.qNo,
          cardId: `question-card-${q.qNo}`,
          isChoice: q.optionB !== undefined,
          missingReasons: status.missingReasons
        });
      }
    });
  });

  return {
    totalQuestions,
    completedCount,
    missedQuestions,
    isAllComplete: totalQuestions > 0 && missedQuestions.length === 0
  };
};

const optimizeBase64Image = (base64Str, maxTargetKB = 30) => {
  return new Promise((resolve) => {
    if (!base64Str || typeof base64Str !== 'string') return resolve(base64Str);
    const sizeInKB = Math.round((base64Str.length * 3) / 4) / 1024;
    if (sizeInKB <= maxTargetKB) {
      return resolve(base64Str);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      const maxDim = 600;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(80, width);
      canvas.height = Math.max(80, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let quality = 0.70;
      let compressed = canvas.toDataURL('image/jpeg', quality);
      let compSizeKB = Math.round((compressed.length * 3) / 4) / 1024;

      while (compSizeKB > maxTargetKB && quality > 0.20) {
        quality -= 0.10;
        compressed = canvas.toDataURL('image/jpeg', quality);
        compSizeKB = Math.round((compressed.length * 3) / 4) / 1024;
      }

      resolve(compressed.length < base64Str.length ? compressed : base64Str);
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};

const optimizeHtmlImages = async (html) => {
  if (!html || typeof html !== 'string') return html;
  const imgRegex = /src=["'](data:image\/[^"']+)["']/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) return html;

  let updatedHtml = html;
  for (const m of matches) {
    const rawSrc = m[1];
    const optSrc = await optimizeBase64Image(rawSrc, 30);
    if (optSrc !== rawSrc) {
      updatedHtml = updatedHtml.replace(rawSrc, optSrc);
    }
  }
  return updatedHtml;
};

// Global loader promise to guarantee CKEditor is injected only once across all editors
let ckEditorLoadingPromise = null;
const loadCKEditorScript = () => {
  if (window.CKEDITOR) return Promise.resolve(window.CKEDITOR);
  if (ckEditorLoadingPromise) return ckEditorLoadingPromise;

  ckEditorLoadingPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="ckeditor.js"]');
    if (existing) {
      if (window.CKEDITOR) {
        resolve(window.CKEDITOR);
      } else {
        existing.addEventListener('load', () => resolve(window.CKEDITOR));
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.CKEDITOR) {
        window.CKEDITOR.config.versionCheck = false;
        window.CKEDITOR.config.font_defaultLabel = 'Times New Roman';
        window.CKEDITOR.config.fontSize_defaultLabel = '12pt';
        window.CKEDITOR.config.removePlugins = 'exportpdf';
      }
      resolve(window.CKEDITOR);
    };
    document.body.appendChild(script);
  });
  return ckEditorLoadingPromise;
};

// Reusable CKEditor component for rich question paper text editing with live draft sync
function QuestionCKEditor({ id, value, onChange, placeholder }) {
  const containerRef = useRef(null);
  const editorInstanceRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedValueRef = useRef(value || "");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 1. Initialize CKEditor on mount or ID change
  useEffect(() => {
    let active = true;

    loadCKEditorScript().then((CK) => {
      if (!CK || !active || !containerRef.current) return;

      if (CK.instances && CK.instances[id]) {
        try { CK.instances[id].destroy(true); } catch (e) { }
      }

      containerRef.current.innerHTML = "";
      const textarea = document.createElement("textarea");
      textarea.id = id;
      textarea.value = value || "";
      containerRef.current.appendChild(textarea);

      const editor = CK.replace(id, {
        height: 140,
        removePlugins: 'elementspath,exportpdf',
        resize_enabled: false,
        extraPlugins: 'uploadimage,mathjax',
        mathJaxLib: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
        toolbar: [
          { name: 'document', items: ['Source'] },
          { name: 'clipboard', items: ['Cut', 'Copy', 'Paste', 'Undo', 'Redo'] },
          { name: 'editing', items: ['Find', 'Replace', 'SelectAll'] },
          { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript', '-', 'RemoveFormat'] },
          { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'Blockquote', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock'] },
          { name: 'links', items: ['Link', 'Unlink'] },
          { name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'SpecialChar', 'Mathjax'] },
          { name: 'styles', items: ['Styles', 'Format', 'Font', 'FontSize'] },
          { name: 'colors', items: ['TextColor', 'BGColor'] },
          { name: 'tools', items: ['Maximize'] }
        ],
        contentsStyle: `body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; padding: 6px; } p { margin: 0 0 4px 0; } img { max-width: 100%; height: auto; }`
      });

      editorInstanceRef.current = editor;

      editor.on('instanceReady', () => {
        try {
          if (value !== undefined && value !== null && value !== "") {
            editor.setData(value);
            lastEmittedValueRef.current = value;
          }
        } catch (e) { }
      });

      const handleSyncChange = () => {
        try {
          const rawData = editor.getData();
          lastEmittedValueRef.current = rawData;
          if (onChangeRef.current) {
            onChangeRef.current(rawData);
          }
        } catch (e) { }
      };

      editor.on('change', handleSyncChange);
      editor.on('blur', handleSyncChange);
      editor.on('key', () => {
        setTimeout(handleSyncChange, 50);
      });
    });

    return () => {
      active = false;
      if (window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances[id]) {
        try {
          window.CKEDITOR.instances[id].destroy(true);
        } catch (e) { }
      }
      editorInstanceRef.current = null;
    };
  }, [id]);

  // 2. React to external value changes (e.g. when drafts load from Firestore or localStorage)
  useEffect(() => {
    const editor = editorInstanceRef.current || (window.CKEDITOR?.instances && window.CKEDITOR.instances[id]);
    if (!editor) return;
    try {
      if (editor.status === 'ready') {
        const cur = editor.getData();
        const incoming = value || "";

        // If incoming matches what this editor just typed/emitted or matches current editor content, skip
        if (incoming === lastEmittedValueRef.current || incoming.trim() === (cur || "").trim()) {
          return;
        }

        // CRITICAL GUARD: If editor currently has text typed by user, never overwrite with empty string
        if (cur && cur.trim().length > 0 && incoming.trim().length === 0) {
          return;
        }

        // If editor is currently focused by user, never interrupt typing
        if (editor.focusManager && editor.focusManager.hasFocus) {
          return;
        }

        editor.setData(incoming);
        lastEmittedValueRef.current = incoming;
      }
    } catch (e) { }
  }, [value, id]);

  return (
    <div className="w-full rounded-xl overflow-hidden border border-zinc-200 bg-white">
      <MathTemplateToolbar editorId={id} />
      <div ref={containerRef} />
    </div>
  );
}

// Scrapes and updates all live text directly from active window.CKEDITOR.instances
const syncAllCkEditorsToPaper = (paper, setKey) => {
  if (!paper || !paper.sections || !window.CKEDITOR || !window.CKEDITOR.instances) return paper;
  const updated = JSON.parse(JSON.stringify(paper));

  updated.sections?.forEach((sec, secIdx) => {
    sec.questions?.forEach((q, qIdx) => {
      // 1. Main Question Text
      const mainId = `sec_${setKey}_${secIdx}_q_${qIdx}_main`;
      if (window.CKEDITOR.instances[mainId]) {
        try {
          const liveData = window.CKEDITOR.instances[mainId].getData();
          if (liveData !== undefined) q.text = liveData;
        } catch (e) { }
      }

      // 2. Sub-parts for Option A
      if (Array.isArray(q.subParts)) {
        q.subParts.forEach((sp, subIdx) => {
          const subId = `sec_${setKey}_${secIdx}_q_${qIdx}_sub_${subIdx}`;
          if (window.CKEDITOR.instances[subId]) {
            try {
              const liveData = window.CKEDITOR.instances[subId].getData();
              if (liveData !== undefined) sp.text = liveData;
            } catch (e) { }
          }
        });
      }

      // 3. Option B Main Text
      const optBMainId = `sec_${setKey}_${secIdx}_q_${qIdx}_optB_main`;
      if (window.CKEDITOR.instances[optBMainId]) {
        try {
          const liveData = window.CKEDITOR.instances[optBMainId].getData();
          if (liveData !== undefined) q.optionB = liveData;
        } catch (e) { }
      }

      // 4. Option B Sub-parts
      if (Array.isArray(q.subPartsOptionB)) {
        q.subPartsOptionB.forEach((sp, subIdx) => {
          const optBSubId = `sec_${setKey}_${secIdx}_q_${qIdx}_optB_sub_${subIdx}`;
          if (window.CKEDITOR.instances[optBSubId]) {
            try {
              const liveData = window.CKEDITOR.instances[optBSubId].getData();
              if (liveData !== undefined) sp.text = liveData;
            } catch (e) { }
          }
        });
      }
    });
  });

  return updated;
};

// Helper to recursively remove undefined properties before saving objects to Firestore
const removeUndefinedFields = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedFields);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedFields(value);
    }
  }
  return cleaned;
};

// Helper to strip HTML tags and decode common entities for AI comparison
export const stripHtmlForAi = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<img[^>]*>/gi, " [Image] ")
    .replace(/<\/p>/gi, " ")
    .replace(/<br\s*[\/]?>/gi, " ")
    .replace(/<\/div>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ordm;/gi, "°")
    .replace(/&deg;/gi, "°")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&times;/gi, "x")
    .replace(/&divide;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
};

// AI Question Extraction Helper for Cross-Set Permutation Comparison
const extractQuestionListForAi = (paper) => {
  const list = [];
  (paper?.sections || []).forEach((sec) => {
    const secName = String(sec.name || sec.title || "Section");
    (sec.questions || []).forEach((q) => {
      const isEitherOr = q.optionB !== undefined;
      const baseLabel = isEitherOr ? `${q.qNo}(a)` : `${q.qNo}`;

      // Option A / Main Question
      if (q.isSplit && Array.isArray(q.subParts) && q.subParts.length > 0) {
        q.subParts.forEach((sp, idx) => {
          const subLabel = String(sp.label || sp.subPartLabel || `(${String.fromCharCode(105 + idx)})`);
          const textContent = stripHtmlForAi(sp.text);
          if (textContent) {
            list.push({
              qNo: String(`Q.${baseLabel} ${subLabel}`),
              rawQNo: String(q.qNo ?? ""),
              part: secName,
              subdivision: subLabel,
              text: textContent,
              marks: String(sp.marks ?? ""),
              co: String(sp.co ?? ""),
              bloom: String(sp.blooms || sp.bloom || "")
            });
          }
        });
      } else if (q.text && stripHtmlForAi(q.text)) {
        list.push({
          qNo: String(`Q.${baseLabel}`),
          rawQNo: String(q.qNo ?? ""),
          part: secName,
          subdivision: "",
          text: stripHtmlForAi(q.text),
          marks: String(q.marks ?? ""),
          co: String(q.co ?? ""),
          bloom: String(q.blooms || q.bloom || "")
        });
      }

      // Option B (if Either / Or)
      if (isEitherOr) {
        const baseLabelB = `${q.qNo}(b)`;
        if (q.isSplitOptionB && Array.isArray(q.subPartsOptionB) && q.subPartsOptionB.length > 0) {
          q.subPartsOptionB.forEach((sp, idx) => {
            const subLabel = String(sp.label || sp.subPartLabel || `(${String.fromCharCode(105 + idx)})`);
            const textContent = stripHtmlForAi(sp.text);
            if (textContent) {
              list.push({
                qNo: String(`Q.${baseLabelB} ${subLabel}`),
                rawQNo: String(q.qNo ?? ""),
                part: secName,
                subdivision: subLabel,
                text: textContent,
                marks: String(sp.marks ?? ""),
                co: String(sp.co ?? ""),
                bloom: String(sp.blooms || sp.bloom || "")
              });
            }
          });
        } else if (q.optionB && stripHtmlForAi(q.optionB)) {
          list.push({
            qNo: String(`Q.${baseLabelB}`),
            rawQNo: String(q.qNo ?? ""),
            part: secName,
            subdivision: "",
            text: stripHtmlForAi(q.optionB),
            marks: String(q.marks ?? ""),
            co: String(q.co ?? ""),
            bloom: String(q.blooms || q.bloom || "")
          });
        }
      }
    });
  });
  return list;
};

// Academic Question Stop-words and Question Prompt Stems for Hybrid Semantic Calibration
const AI_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'of', 'up', 'down', 'in', 'out', 'on',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just',
  'don', 'should', 'now', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'having', 'do', 'does', 'did', 'doing', 'how', 'why', 'where', 'you', 'your',
  'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'he', 'him', 'his', 'she',
  'her', 'i', 'me', 'my', 'define', 'explain', 'describe', 'discuss', 'illustrate',
  'state', 'write', 'short', 'notes', 'briefly', 'calculate', 'derive',
  'give', 'examples', 'example', 'suitable', 'neat', 'diagram', 'sketch', 'differentiate',
  'between', 'compare', 'contrast', 'list', 'out', 'mention'
]);

const getContentWords = (text) => {
  if (!text || typeof text !== "string") return new Set();
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(words.filter((w) => !AI_STOP_WORDS.has(w) && w.length > 2));
};

const calibrateMatchScore = (rawScore, textA, textB) => {
  const wordsA = getContentWords(textA);
  const wordsB = getContentWords(textB);

  let score = rawScore;

  if (wordsA.size === 0 || wordsB.size === 0) {
    // Both or one question consists purely of generic stop words (e.g. "how are you?" vs "where are you?")
    const allWordsA = new Set((textA || "").toLowerCase().match(/[a-z0-9]+/g) || []);
    const allWordsB = new Set((textB || "").toLowerCase().match(/[a-z0-9]+/g) || []);
    const union = new Set([...allWordsA, ...allWordsB]);
    let interCount = 0;
    allWordsA.forEach((w) => { if (allWordsB.has(w)) interCount++; });
    const jaccard = union.size > 0 ? interCount / union.size : 0;
    // Heavily dampen if no domain content keywords exist and questions differ in intent
    score = rawScore * (0.35 + 0.65 * jaccard);
  } else {
    const union = new Set([...wordsA, ...wordsB]);
    let interCount = 0;
    wordsA.forEach((w) => { if (wordsB.has(w)) interCount++; });
    const jaccard = union.size > 0 ? interCount / union.size : 0;

    if (jaccard === 0) {
      // 0% domain keyword overlap (e.g. "What is Stack?" vs "What is Queue?")
      score = rawScore * 0.45;
    } else {
      score = (rawScore * 0.70) + (jaccard * 0.30 * rawScore);
    }
  }

  // Subtract baseline noise floor (~0.20) and normalize [0.20, 1.0] -> [0.0, 1.0]
  const calibrated = Math.max(0.0, (score - 0.20) / 0.80);
  return Math.min(100.0, Math.round(calibrated * 1000) / 10);
};

export const calibrateAiSimilarityResult = (rawResult) => {
  if (!rawResult || !Array.isArray(rawResult.detailedMatches)) return rawResult;

  // Detect if result was generated by Qwen / LLM semantic reasoning engine
  const isQwenEngine = Boolean(
    rawResult.ai_backend ||
    rawResult.model?.toLowerCase().includes("qwen") ||
    rawResult.engine?.toLowerCase().includes("qwen") ||
    rawResult.detailedMatches.some((m) =>
      (m.scoreType && m.scoreType.toLowerCase().includes("qwen")) ||
      (m.scoreType && m.scoreType.toLowerCase().includes("semantic")) ||
      m.aiReason
    )
  );

  let duplicateCount = 0;
  let warningCount = 0;
  let peakSimilarity = 0.0;
  const filteredMatches = [];

  rawResult.detailedMatches.forEach((m) => {
    let calibratedPercent = 0.0;

    if (isQwenEngine) {
      // Qwen LLM already performed deep semantic reasoning across questions
      const rawScore = typeof m.similarityPercent === "number"
        ? m.similarityPercent
        : (typeof m.similarityScore === "number" ? m.similarityScore * 100 : 0);
      calibratedPercent = Math.min(100.0, Math.max(0.0, Math.round(rawScore * 10) / 10));
    } else {
      // Legacy embedding vector model: apply stop-word Jaccard dampening
      const rawScore = typeof m.similarityScore === "number"
        ? m.similarityScore
        : (typeof m.similarityPercent === "number" ? m.similarityPercent / 100 : 0);
      calibratedPercent = calibrateMatchScore(rawScore, m.matched_setA_text || "", m.setB_text || "");
    }

    if (calibratedPercent > peakSimilarity) {
      peakSimilarity = calibratedPercent;
    }

    // Strict 90% threshold rule: only show and flag questions with >= 90% similarity
    if (calibratedPercent >= 90.0) {
      duplicateCount++;
      filteredMatches.push({
        ...m,
        similarityScore: Math.round(calibratedPercent) / 100,
        similarityPercent: calibratedPercent,
        level: "HIGH_DUPLICATE",
        similarityDecision: "YES"
      });
    }
    // Questions < 90% are considered 0% / unique and omitted from duplicates list
  });

  filteredMatches.sort((a, b) => b.similarityPercent - a.similarityPercent);

  // Strict Overall Lock Rule:
  // - If 0 questions >= 70%: overall similarity MUST be 0.0% (< 25%), status PASSED
  // - If >= 1 question >= 70%: overall similarity MUST exceed 25.0% (e.g. >= 26.0%), status NEEDS_REVISION
  let overallPercent = 0.0;
  if (duplicateCount > 0) {
    const rawOverall = typeof rawResult.overallSimilarityPercent === "number"
      ? rawResult.overallSimilarityPercent
      : peakSimilarity;
    overallPercent = Math.max(26.0, Math.round(rawOverall * 10) / 10);
  } else {
    overallPercent = 0.0;
  }

  return {
    ...rawResult,
    _isCalibrated: true,
    overallSimilarityPercent: overallPercent,
    maxSimilarityFound: duplicateCount > 0 ? peakSimilarity : 0.0,
    duplicateCount,
    warningCount,
    status: duplicateCount > 0 ? "NEEDS_REVISION" : "PASSED",
    detailedMatches: filteredMatches
  };
};

const DEFAULT_AI_SIMILARITY_ENDPOINT = import.meta.env.VITE_AI_SIMILARITY_ENDPOINT || "https://win-su2jpc4vpir.tail079af1.ts.net/api/check-similarity";

export default function ExternalSetterWorkbench() {
  const location = useLocation();

  // Extract assignmentId from URL query param
  const queryParams = new URLSearchParams(location.search);
  const urlAssignmentId = queryParams.get("assignmentId");

  // Authentication state
  const [authenticatedSetter, setAuthenticatedSetter] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Assignment details
  const [activeAssignmentId, setActiveAssignmentId] = useState(urlAssignmentId || "");
  const [assignment, setAssignment] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // AI Question Paper Similarity Engine State
  const [isComparingAi, setIsComparingAi] = useState(false);
  const [aiSimilarityResult, setAiSimilarityResult] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiModalFilter, setAiModalFilter] = useState("all"); // "all" | "high" | "moderate" | "unique"

  // Track elapsed seconds during AI analysis
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval = null;
    if (isComparingAi) {
      setAiElapsedSeconds(0);
      interval = setInterval(() => {
        setAiElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setAiElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isComparingAi]);

  // Automatically calibrate any uncalibrated or cached AI similarity result in state
  useEffect(() => {
    if (aiSimilarityResult && !aiSimilarityResult._isCalibrated) {
      const calibrated = calibrateAiSimilarityResult(aiSimilarityResult);
      setAiSimilarityResult(calibrated);
    }
  }, [aiSimilarityResult]);

  // Attempt lightweight anonymous auth in background if enabled in Firebase Console
  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) => {
        if (err?.code !== "auth/admin-restricted-operation" && err?.code !== "auth/operation-not-allowed") {
          console.warn("Anonymous auth note:", err?.message || err);
        }
      });
    }
  }, []);

  // Synchronize activeAssignmentId from URL query param
  useEffect(() => {
    if (urlAssignmentId) {
      setActiveAssignmentId(urlAssignmentId);
    }
  }, [urlAssignmentId]);

  // Automatic assignment discovery when authenticatedSetter is logged in without urlAssignmentId in URL
  useEffect(() => {
    if (activeAssignmentId || !authenticatedSetter?.email) return;

    const resolveSetterAssignment = async () => {
      try {
        setLoadingAssignment(true);
        const q = query(
          collection(db, "coe_setter_assignments"),
          where("setterEmail", "==", authenticatedSetter.email.toLowerCase().trim())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const active = docs.find((d) => d.status !== "declined") || docs[0];
          if (active) setActiveAssignmentId(active.id);
        } else if (authenticatedSetter.id) {
          const q2 = query(
            collection(db, "coe_setter_assignments"),
            where("setterId", "==", authenticatedSetter.id)
          );
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            setActiveAssignmentId(snap2.docs[0].id);
          }
        }
      } catch (err) {
        console.warn("Error discovering setter assignment:", err);
      } finally {
        setLoadingAssignment(false);
      }
    };

    resolveSetterAssignment();
  }, [authenticatedSetter, activeAssignmentId]);

  // Active Exam Session fallback from coe_exam_sessions
  const [activeExamSessionName, setActiveExamSessionName] = useState("Nov./Dec. 2026");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_exam_sessions"), (snap) => {
      snap.forEach(d => {
        const data = d.data();
        if (data.isCurrent && data.sessionName) {
          setActiveExamSessionName(data.sessionName);
        }
      });
    }, (err) => {
      console.warn("coe_exam_sessions listener note:", err?.message || err);
    });
    return () => unsub();
  }, []);

  const effectiveExamSession = useMemo(() => {
    return assignment?.examSession || activeExamSessionName || "Nov./Dec. 2026";
  }, [assignment?.examSession, activeExamSessionName]);

  // Acceptance Form State
  const [interestStatus, setInterestStatus] = useState("Interested");
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [uploadingSig, setUploadingSig] = useState(false);
  const [acceptanceSubmitted, setAcceptanceSubmitted] = useState(false);

  // Modal & Drawer States
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSyllabusDrawer, setShowSyllabusDrawer] = useState(false);
  const [showQbDrawer, setShowQbDrawer] = useState(false);
  const [showGuidelinesDrawer, setShowGuidelinesDrawer] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // Docked Side-by-Side Reference Panel in Editor Mode: "guidelines" | "syllabus" | "qb" | null
  // Defaults to "guidelines" so external setters first review institutional question setting guidelines
  const [editorRefPanel, setEditorRefPanel] = useState("guidelines");

  // Fetch Session Guidelines PDF Document from Firestore coe_session_guidelines_doc
  const [sessionGuidelinesPdf, setSessionGuidelinesPdf] = useState(null);

  useEffect(() => {
    if (!effectiveExamSession) return;
    const sanitizeKey = (str) => String(str || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const docId = sanitizeKey(effectiveExamSession);
    const unsub = onSnapshot(doc(db, "coe_session_guidelines_doc", docId), (docSnap) => {
      if (docSnap.exists()) {
        setSessionGuidelinesPdf(docSnap.data());
      } else {
        setSessionGuidelinesPdf(null);
      }
    }, (err) => {
      console.warn("coe_session_guidelines_doc listener note:", err?.message || err);
    });
    return () => unsub();
  }, [effectiveExamSession]);

  // Question Paper Setting Checklist Items (Matching COE Official Document)
  const CHECKLIST_ITEMS = useMemo(() => [
    { id: "format", text: "Whether the question paper is prepared as per the prescribed format?" },
    { id: "details", text: "Whether the regulations, program, branch, semester, course code and name of the given question paper are verified?" },
    { id: "syllabus", text: "Whether the question paper is set strictly within the syllabus?" },
    { id: "blooms", text: "Whether the question paper is set in accordance with Revised Bloom's Taxonomy?" },
    { id: "mapping", text: "Whether the K-Level and CO mapping are indicated against each question?" },
    { id: "klevel_range", text: "Whether the mapped KL levels are within the KL1 to KL4?" },
    { id: "grammar", text: "Whether grammar, spellings and sentence formations are checked?" },
    { id: "units_symbols", text: "Whether units, symbols and diagrams are correctly used?" },
    { id: "databooks", text: "Whether the usage of permitted data books / charts / tables / graph sheets, if any, is indicated?" },
    { id: "repetition", text: "Whether repetition of questions across parts has been avoided?" }
  ], []);

  const [checklistResponsesA, setChecklistResponsesA] = useState({});
  const [checklistResponsesB, setChecklistResponsesB] = useState({});
  const [examMonthYear, setExamMonthYear] = useState("Nov./Dec. 2026");

  useEffect(() => {
    if (effectiveExamSession) {
      setExamMonthYear(effectiveExamSession);
    }
  }, [effectiveExamSession]);

  // Claim Bill Modal & Form States
  const [showClaimBillModal, setShowClaimBillModal] = useState(false);
  const [claimBillStep, setClaimBillStep] = useState("form"); // "form" | "verify"

  const [claimBillData, setClaimBillData] = useState({
    setterName: "",
    designation: "Professor",
    departmentInstitution: "",
    mobileNumber: "",
    emailId: "",
    accHolderName: "",
    bankName: "",
    branchName: "",
    accountNumber: "",
    ifscCode: "",
    accountType: "Savings (SB)"
  });

  // Auto pre-fill Claim Bill data when assignment / setter is loaded
  useEffect(() => {
    if (assignment || authenticatedSetter) {
      setClaimBillData(prev => ({
        ...prev,
        setterName: authenticatedSetter?.name || assignment?.setterName || prev.setterName,
        designation: authenticatedSetter?.designation || "Professor",
        departmentInstitution: authenticatedSetter?.collegeName || assignment?.setterCollege || prev.departmentInstitution,
        mobileNumber: authenticatedSetter?.phone || prev.mobileNumber,
        emailId: authenticatedSetter?.email || assignment?.setterEmail || prev.emailId,
        accHolderName: authenticatedSetter?.name || assignment?.setterName || prev.accHolderName
      }));
    }
  }, [assignment, authenticatedSetter]);

  // View state: "acceptance" | "editor" | "preview"
  const [viewState, setViewState] = useState("acceptance");

  // Syllabus state
  const [syllabusData, setSyllabusData] = useState(null);

  // Assigned Question Paper Pattern from Firestore coe_patterns
  const [assignedPattern, setAssignedPattern] = useState(null);

  // Bloom's Knowledge Levels (strictly K1 to K5 as per Autonomous Examination regulations)
  const DEFAULT_BLOOMS_K1_K5 = [
    { code: "K1", name: "Remember" },
    { code: "K2", name: "Understand" },
    { code: "K3", name: "Apply" },
    { code: "K4", name: "Analyze" },
    { code: "K5", name: "Evaluate" }
  ];
  const [bloomsLevels, setBloomsLevels] = useState(DEFAULT_BLOOMS_K1_K5);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "blooms_taxonomy"), (snap) => {
      const levelList = [];
      snap.forEach(d => {
        const data = d.data();
        if (Array.isArray(data.levels)) {
          data.levels.forEach(lvl => {
            if (lvl && (lvl.code || lvl.name)) {
              levelList.push({
                code: lvl.code || lvl.name,
                name: lvl.name || lvl.code
              });
            }
          });
        }
      });

      if (levelList.length > 0) {
        const allowedK = new Set(["K1", "K2", "K3", "K4", "K5"]);
        const unique = [];
        const seen = new Set();
        levelList.forEach(l => {
          const codeUpper = String(l.code || "").toUpperCase().trim();
          if (allowedK.has(codeUpper) && !seen.has(codeUpper)) {
            seen.add(codeUpper);
            unique.push({ code: codeUpper, name: l.name || codeUpper });
          }
        });
        if (unique.length > 0) {
          unique.sort((a, b) => a.code.localeCompare(b.code));
          setBloomsLevels(unique);
        } else {
          setBloomsLevels(DEFAULT_BLOOMS_K1_K5);
        }
      }
    }, (err) => {
      console.warn("blooms_taxonomy listener note:", err?.message || err);
    });

    return () => unsub();
  }, []);

  // Fetch Question Paper Guidelines from Firestore coe_qp_guidelines
  const [qpGuidelines, setQpGuidelines] = useState([]);
  const [showGuidelinesCollapse, setShowGuidelinesCollapse] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_qp_guidelines"), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.text) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setQpGuidelines(list);
    }, (err) => {
      console.warn("coe_qp_guidelines listener note:", err?.message || err);
    });
    return () => unsub();
  }, []);

  // Dual Question Paper Sets State (Set A & Set B)
  const [activeSet, setActiveSet] = useState("setA"); // "setA" | "setB"

  // Dynamic Question Paper Data (Loaded from pattern document in Firestore)
  const [qpData, setQpData] = useState({
    title: "",
    duration: "3 Hours",
    maxMarks: 100,
    sections: []
  });

  const [qpDataB, setQpDataB] = useState({
    title: "",
    duration: "3 Hours",
    maxMarks: 100,
    sections: []
  });

  const isSetB = activeSet === "setB";
  const currentQp = isSetB ? qpDataB : qpData;
  const setCurrentQp = isSetB ? setQpDataB : setQpData;

  const isNumSetsTwo = Number(assignment?.numSets) === 2;

  // Track if Set B was edited after the last draft save
  const [isSetBModifiedSinceDraft, setIsSetBModifiedSinceDraft] = useState(false);
  const markSetBModified = () => {
    if (activeSet === "setB" || isSetB) {
      setIsSetBModifiedSinceDraft(true);
    }
  };

  // Permitted Examination Materials - Individual state for Set A and Set B
  const [permittedMaterialsA, setPermittedMaterialsA] = useState(DEFAULT_PERMITTED_MATERIALS);
  const [permittedMaterialsB, setPermittedMaterialsB] = useState(DEFAULT_PERMITTED_MATERIALS);

  // Active set's permitted materials
  const currentPermittedMaterials = isSetB ? permittedMaterialsB : permittedMaterialsA;
  const setCurrentPermittedMaterials = isSetB ? setPermittedMaterialsB : setPermittedMaterialsA;
  const permittedMaterials = currentPermittedMaterials;

  const handleUpdatePermittedMaterials = (updater) => {
    const isTargetSetB = activeSet === "setB" || isSetB;
    const targetSetter = isTargetSetB ? setPermittedMaterialsB : setPermittedMaterialsA;

    targetSetter((prev) => {
      const current = prev || DEFAULT_PERMITTED_MATERIALS;
      const updates = typeof updater === "function" ? updater(current) : updater;

      // Determine next enabled state:
      // If caller explicitly passed enabled: boolean (master toggle button), respect it.
      // Otherwise, keep current enabled state (defaults to true if active).
      let nextEnabled = updates.enabled !== undefined ? updates.enabled : (current?.enabled ?? true);

      // Failsafe: If any category is being turned on (allowed === true), guarantee master toggle stays enabled
      if (
        updates.tables?.allowed ||
        updates.charts?.allowed ||
        updates.dataBooks?.allowed ||
        updates.drawingSheets?.allowed ||
        updates.graphSheets?.allowed ||
        updates.codeBooks?.allowed
      ) {
        nextEnabled = true;
      }

      return {
        ...current,
        ...updates,
        enabled: nextEnabled
      };
    });

    if (isTargetSetB) {
      setIsSetBModifiedSinceDraft(true);
    }
  };

  const isChecklistCompleteA = useMemo(() => {
    return CHECKLIST_ITEMS.every(item => checklistResponsesA[item.id] === "YES");
  }, [CHECKLIST_ITEMS, checklistResponsesA]);

  const isChecklistCompleteB = useMemo(() => {
    return CHECKLIST_ITEMS.every(item => checklistResponsesB[item.id] === "YES");
  }, [CHECKLIST_ITEMS, checklistResponsesB]);

  const verifiedCountA = useMemo(() => {
    return CHECKLIST_ITEMS.filter(item => checklistResponsesA[item.id] === "YES").length;
  }, [CHECKLIST_ITEMS, checklistResponsesA]);

  const verifiedCountB = useMemo(() => {
    return CHECKLIST_ITEMS.filter(item => checklistResponsesB[item.id] === "YES").length;
  }, [CHECKLIST_ITEMS, checklistResponsesB]);

  // Contextual checklist for the active tab (Set A vs Set B)
  const isChecklistComplete = isSetB ? isChecklistCompleteB : isChecklistCompleteA;
  const verifiedCount = isSetB ? verifiedCountB : verifiedCountA;
  const checklistResponses = isSetB ? checklistResponsesB : checklistResponsesA;
  const setChecklistResponses = isSetB ? setChecklistResponsesB : setChecklistResponsesA;

  // Real-time reactive tracking of missed / incomplete questions in Set A, Set B, and currently active set
  const paperStatusA = useMemo(() => {
    return getPaperMissingQuestions(qpData, "Set A");
  }, [qpData]);

  const paperStatusB = useMemo(() => {
    if (!isNumSetsTwo) return null;
    return getPaperMissingQuestions(qpDataB, "Set B");
  }, [qpDataB, isNumSetsTwo]);

  const paperStatus = useMemo(() => {
    return isSetB ? (paperStatusB || getPaperMissingQuestions(currentQp, "Set B")) : paperStatusA;
  }, [isSetB, paperStatusB, paperStatusA, currentQp]);

  // Smooth scroll and visual pulse for jumped questions
  const scrollToQuestion = (qNo) => {
    if (!qNo) return;
    const el = document.getElementById(`question-card-${qNo}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-4", "ring-amber-400", "shadow-xl");
      setTimeout(() => {
        el.classList.remove("ring-4", "ring-amber-400", "shadow-xl");
      }, 3500);
    }
  };

  // Whether all required sets have their checklists verified
  const areAllSetsChecklistComplete = isNumSetsTwo
    ? (isChecklistCompleteA && isChecklistCompleteB)
    : isChecklistCompleteA;

  // AI Cross-Set Similarity Guard: Overlap > 25.0% strictly locks the "Move to COE" forwarding option
  const isSimilarityOver25 = useMemo(() => {
    if (!isNumSetsTwo || !aiSimilarityResult) return false;
    const percent = Number(aiSimilarityResult.overallSimilarityPercent || 0);
    return percent > 25.0;
  }, [isNumSetsTwo, aiSimilarityResult]);

  const hasHighAiDuplicates = useMemo(() => {
    if (!isNumSetsTwo || !aiSimilarityResult) return false;
    return Number(aiSimilarityResult.duplicateCount || 0) > 0;
  }, [isNumSetsTwo, aiSimilarityResult]);

  const [submittingToCoe, setSubmittingToCoe] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState("");
  const [draftToast, setDraftToast] = useState(null);

  // Unified submission state: true if freshly submitted or already stored in Firestore
  const isSubmitted = Boolean(submittedSuccess || assignment?.status === "submitted");
  const isClaimBillReadOnly = Boolean(isSubmitted || claimBillStep === "verify");

  // 1. Fetch Assignment Document & Pattern Data dynamically from Firestore
  useEffect(() => {
    if (!activeAssignmentId) {
      setLoadingAssignment(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "coe_setter_assignments", activeAssignmentId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAssignment({ id: snap.id, ...data });

        const isPaperSubmitted = data.status === "submitted" || !!data.paperSubmittedAt;
        const isAccepted = data.acceptanceStatus === "Interested" || data.status === "accepted" || !!data.signatureUrl;

        if (data.acceptanceStatus) {
          setInterestStatus(data.acceptanceStatus);
        }
        if (data.signatureUrl) {
          setSignatureUrl(data.signatureUrl);
        }
        if (isAccepted) {
          setAcceptanceSubmitted(true);
        }

        if (data.checklistResponsesA) {
          setChecklistResponsesA(data.checklistResponsesA);
        } else if (data.draftChecklistA) {
          setChecklistResponsesA(data.draftChecklistA);
        } else if (data.checklistResponses) {
          setChecklistResponsesA(data.checklistResponses);
        }

        if (data.checklistResponsesB) {
          setChecklistResponsesB(data.checklistResponsesB);
        } else if (data.draftChecklistB) {
          setChecklistResponsesB(data.draftChecklistB);
        }

        if (data.draftLastSavedTime) {
          setLastDraftSavedAt(data.draftLastSavedTime);
        }

        if (data.claimBillData) {
          setClaimBillData((prev) => ({ ...prev, ...data.claimBillData }));
        }

        if (data.aiSimilarityResult) {
          setAiSimilarityResult(calibrateAiSimilarityResult(data.aiSimilarityResult));
        } else if (activeAssignmentId) {
          try {
            const cachedAi = localStorage.getItem(`coe_qp_ai_sim_${activeAssignmentId}`);
            if (cachedAi) setAiSimilarityResult(calibrateAiSimilarityResult(JSON.parse(cachedAi)));
          } catch (e) { }
        }

        // Automatic smart view routing upon login/reload:
        // 1. If question paper is already submitted, lock workbench directly to "preview"
        // 2. Else if acceptance form is already submitted, advance directly to "editor"
        //    (Never ask for acceptance or signature again!)
        if (data.status === "submitted") {
          setSubmittedSuccess(true);
          setViewState("preview");
        } else if (isAccepted) {
          setViewState((prev) => (prev === "acceptance" ? "editor" : prev));
        }

        // Prioritize loading existing saved draft or submitted paper
        let paperToLoadA = data.draftPaperA || data.draftPaper || data.submittedPaperA || data.submittedPaper;
        let paperToLoadB = data.draftPaperB || data.submittedPaperB;

        let hasLoadedA = Boolean(paperToLoadA && paperToLoadA.sections?.length > 0);
        let hasLoadedB = Boolean(paperToLoadB && paperToLoadB.sections?.length > 0);

        if (hasLoadedA) {
          setQpData(paperToLoadA);
        }
        if (hasLoadedB) {
          setQpDataB(paperToLoadB);
        }

        // Load Permitted Materials if already configured in assignment or papers (Individual for Set A & Set B)
        const loadedMaterialsA = data.permittedMaterialsA || paperToLoadA?.permittedMaterials || data.permittedMaterials;
        if (loadedMaterialsA) {
          setPermittedMaterialsA({
            ...DEFAULT_PERMITTED_MATERIALS,
            ...loadedMaterialsA,
            tables: { ...DEFAULT_PERMITTED_MATERIALS.tables, ...(loadedMaterialsA.tables || {}) },
            charts: { ...DEFAULT_PERMITTED_MATERIALS.charts, ...(loadedMaterialsA.charts || {}) },
            dataBooks: { ...DEFAULT_PERMITTED_MATERIALS.dataBooks, ...(loadedMaterialsA.dataBooks || {}) },
            drawingSheets: { ...DEFAULT_PERMITTED_MATERIALS.drawingSheets, ...(loadedMaterialsA.drawingSheets || {}) },
            graphSheets: { ...DEFAULT_PERMITTED_MATERIALS.graphSheets, ...(loadedMaterialsA.graphSheets || {}) },
            codeBooks: { ...DEFAULT_PERMITTED_MATERIALS.codeBooks, ...(loadedMaterialsA.codeBooks || {}) },
          });
        }

        const loadedMaterialsB = data.permittedMaterialsB || paperToLoadB?.permittedMaterials;
        if (loadedMaterialsB) {
          setPermittedMaterialsB({
            ...DEFAULT_PERMITTED_MATERIALS,
            ...loadedMaterialsB,
            tables: { ...DEFAULT_PERMITTED_MATERIALS.tables, ...(loadedMaterialsB.tables || {}) },
            charts: { ...DEFAULT_PERMITTED_MATERIALS.charts, ...(loadedMaterialsB.charts || {}) },
            dataBooks: { ...DEFAULT_PERMITTED_MATERIALS.dataBooks, ...(loadedMaterialsB.dataBooks || {}) },
            drawingSheets: { ...DEFAULT_PERMITTED_MATERIALS.drawingSheets, ...(loadedMaterialsB.drawingSheets || {}) },
            graphSheets: { ...DEFAULT_PERMITTED_MATERIALS.graphSheets, ...(loadedMaterialsB.graphSheets || {}) },
            codeBooks: { ...DEFAULT_PERMITTED_MATERIALS.codeBooks, ...(loadedMaterialsB.codeBooks || {}) },
          });
        }

        // Local browser storage fail-safe backup check if Firestore document hasn't loaded draft yet
        if (!hasLoadedA || !hasLoadedB) {
          try {
            const localDraftStr = localStorage.getItem(`coe_qp_draft_${activeAssignmentId}`);
            if (localDraftStr) {
              const localParsed = JSON.parse(localDraftStr);
              if (!hasLoadedA && localParsed.paperA && localParsed.paperA.sections?.length > 0) {
                paperToLoadA = localParsed.paperA;
                setQpData(localParsed.paperA);
                hasLoadedA = true;
              }
              if (!hasLoadedB && localParsed.paperB && localParsed.paperB.sections?.length > 0) {
                paperToLoadB = localParsed.paperB;
                setQpDataB(localParsed.paperB);
                hasLoadedB = true;
              }
              if (localParsed.checklistA) setChecklistResponsesA(localParsed.checklistA);
              if (localParsed.checklistB) setChecklistResponsesB(localParsed.checklistB);
              if (localParsed.permittedMaterialsA) {
                setPermittedMaterialsA(localParsed.permittedMaterialsA);
              } else if (localParsed.permittedMaterials && !data.permittedMaterialsA && !data.permittedMaterials) {
                setPermittedMaterialsA(localParsed.permittedMaterials);
              }
              if (localParsed.permittedMaterialsB) {
                setPermittedMaterialsB(localParsed.permittedMaterialsB);
              }
              if (localParsed.timeStr) setLastDraftSavedAt(localParsed.timeStr);
            }
          } catch (e) { }
        }

        const isTwoSets = Number(data.numSets) === 2;
        const needsPatternA = !hasLoadedA;
        const needsPatternB = isTwoSets && !hasLoadedB;

        if (data.patternId) {
          // Fetch assigned pattern document dynamically from coe_patterns
          try {
            const patSnap = await getDoc(doc(db, "coe_patterns", data.patternId));
            if (patSnap.exists()) {
              const patData = patSnap.data();
              setAssignedPattern(patData);

              const createSectionsForSet = () => {
                let currentQNo = 1;
                return (patData.sections || []).map((sec, secIdx) => {
                  const count = Number(sec.count) || 5;
                  const marksPerQ = Number(sec.marksPerQ) || 2;
                  const allowSubparts = sec.allowSubparts !== undefined ? Boolean(sec.allowSubparts) : (marksPerQ >= 10);
                  const qConfigs = Array.isArray(sec.questionConfig) ? sec.questionConfig : [];

                  const questions = Array.from({ length: count }, (_, i) => {
                    const qNo = currentQNo++;
                    const cfg = qConfigs[i];
                    const qObj = {
                      qNo,
                      text: "",
                      marks: cfg?.marks !== undefined ? Number(cfg.marks) : marksPerQ,
                      blooms: "K1",
                      co: cfg?.co || `CO${(i % 5) + 1}`,
                      pi: `1.1.${(i % 3) + 1}`,
                      isSplit: false
                    };
                    if (sec.choiceType === "either_or") {
                      qObj.optionB = "";
                      qObj.isSplitOptionB = false;
                    }
                    return qObj;
                  });

                  return {
                    id: sec.id || `section_${secIdx}`,
                    name: sec.name || `Section ${secIdx + 1}`,
                    instructions: sec.instructions || `Answer ALL Questions in ${sec.name}`,
                    allowSubparts,
                    questions
                  };
                });
              };

              const syncSectionsWithPattern = (sections) => {
                if (!Array.isArray(sections)) return sections;
                return sections.map((sec, secIdx) => {
                  const patSec = patData.sections?.[secIdx] || (patData.sections || []).find(s => s.id === sec.id || s.name === sec.name);
                  const allowSubparts = patSec ? (patSec.allowSubparts !== undefined ? Boolean(patSec.allowSubparts) : (patSec.marksPerQ >= 10)) : (sec.allowSubparts ?? false);
                  const qConfigs = Array.isArray(patSec?.questionConfig) ? patSec.questionConfig : [];

                  const syncedQuestions = (sec.questions || []).map((q, qIdx) => {
                    const cfg = qConfigs[qIdx];
                    const lockedCo = cfg?.co || q.co || `CO${(qIdx % 5) + 1}`;
                    const lockedMarks = cfg?.marks !== undefined ? Number(cfg.marks) : (patSec?.marksPerQ || q.marks || 2);
                    // Ensure default blooms level is K1 for any unconfigured or legacy-formula question
                    const legacySynthetic = `K${(qIdx % 5) + 1}`;
                    const isLegacyDefault = (!q.text || q.text.trim() === "" || q.text === "<p></p>") && q.blooms === legacySynthetic;
                    const bloomsToUse = isLegacyDefault ? "K1" : (q.blooms || "K1");

                    return {
                      ...q,
                      co: lockedCo,
                      marks: lockedMarks,
                      blooms: bloomsToUse,
                      // If subparts disabled for this section, collapse split
                      isSplit: allowSubparts ? q.isSplit : false,
                      isSplitOptionB: allowSubparts ? q.isSplitOptionB : false
                    };
                  });

                  return {
                    ...sec,
                    allowSubparts,
                    questions: syncedQuestions
                  };
                });
              };

              if (needsPatternA) {
                setQpData({
                  title: patData.title || `ESE Question Paper - ${data.subjectCode} (Set A)`,
                  duration: patData.duration || "3 Hours",
                  maxMarks: patData.totalMarks || 100,
                  sections: createSectionsForSet()
                });
              } else {
                // Ensure existing draft Set A is synchronized with locked CO, marks, and allowSubparts
                setQpData((prev) => prev ? { ...prev, sections: syncSectionsWithPattern(prev.sections) } : prev);
              }

              if (needsPatternB) {
                setQpDataB({
                  title: patData.title || `ESE Question Paper - ${data.subjectCode} (Set B)`,
                  duration: patData.duration || "3 Hours",
                  maxMarks: patData.totalMarks || 100,
                  sections: createSectionsForSet()
                });
              } else if (isTwoSets) {
                // Ensure existing draft Set B is synchronized with locked CO, marks, and allowSubparts
                setQpDataB((prev) => prev ? { ...prev, sections: syncSectionsWithPattern(prev.sections) } : prev);
              }
            }
          } catch (e) {
            console.error("Error fetching pattern document:", e);
          }
        }
      } else {
        setAssignment(null);
      }
      setLoadingAssignment(false);
    }, (err) => {
      console.warn("coe_setter_assignments listener note:", err?.message || err);
      setLoadingAssignment(false);
    });

    return () => unsub();
  }, [activeAssignmentId]);

  // Strict Guard: Once submitted, setter can NEVER leave the completion screen or navigate back
  useEffect(() => {
    if (isSubmitted) {
      if (viewState !== "preview") {
        setViewState("preview");
      }
      // Trap browser back button so the setter cannot navigate back to editor or previous screens
      window.history.pushState(null, "", window.location.href);
      const handlePopState = () => {
        window.history.pushState(null, "", window.location.href);
      };
      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }
  }, [isSubmitted, viewState]);

  // 2. Fetch Syllabus for Assigned Subject dynamically from Firestore
  useEffect(() => {
    if (!assignment?.subjectCode) return;

    const fetchSyllabus = async () => {
      try {
        const rawCode = assignment.subjectCode;
        const rawTitle = assignment.subjectTitle || "";
        const cleanTargetCode = String(rawCode).replace(/[^A-Za-z0-9]/g, "").toUpperCase();

        let foundUnits = null;
        let foundCos = null;

        // 1st Check: `courses` collection (Course Bank & syllabus documents)
        try {
          const coursesSnap = await getDocs(collection(db, "courses"));
          coursesSnap.forEach(d => {
            if (foundUnits) return;
            const data = d.data();
            const docCode = String(data.code || data.subjectCode || data.courseCode || d.id).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
            if (docCode && (docCode.includes(cleanTargetCode) || cleanTargetCode.includes(docCode))) {
              if (Array.isArray(data.units) && data.units.length > 0) {
                foundUnits = data.units.map((u, idx) => ({
                  unit: u.unit || idx + 1,
                  title: u.title || u.name || `Unit ${idx + 1}`,
                  topics: u.topics || u.content || (typeof u === "string" ? u : "")
                }));
              }
              if (Array.isArray(data.co) && data.co.length > 0) {
                foundCos = data.co;
              }
            }
          });
        } catch (e) {
          console.warn("Course Bank read note:", e?.message || e);
        }

        // 2nd Check: `co_configuration` collection
        if (!foundUnits) {
          try {
            const coConfigSnap = await getDocs(collection(db, "co_configuration"));
            coConfigSnap.forEach(d => {
              if (foundUnits) return;
              const data = d.data();
              const docCode = String(data.subjectCode || data.courseCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
              if (docCode && (docCode.includes(cleanTargetCode) || cleanTargetCode.includes(docCode))) {
                if (Array.isArray(data.units) && data.units.length > 0) {
                  foundUnits = data.units.map((u, idx) => ({
                    unit: u.unit || idx + 1,
                    title: u.title || u.name || `Unit ${idx + 1}`,
                    topics: u.topics || u.content || (typeof u === "string" ? u : "")
                  }));
                }
                if (Array.isArray(data.coData) && data.coData.length > 0) {
                  foundCos = data.coData;
                }
              }
            });
          } catch (e) {
            console.error("Error checking co_configuration collection:", e);
          }
        }

        // 3rd Check: `syllabus_data` collection
        if (!foundUnits) {
          try {
            const syllSnap = await getDocs(collection(db, "syllabus_data"));
            syllSnap.forEach(d => {
              if (foundUnits) return;
              const data = d.data();
              const sems = data.semesters || {};
              Object.values(sems).forEach(semObj => {
                const subList = semObj.subjects || semObj || [];
                if (Array.isArray(subList)) {
                  subList.forEach(s => {
                    const sCode = String(s.code || s.subjectCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                    if (sCode && sCode === cleanTargetCode) {
                      if (Array.isArray(s.units) && s.units.length > 0) {
                        foundUnits = s.units.map((u, idx) => ({
                          unit: u.unit || idx + 1,
                          title: u.title || u.name || `Unit ${idx + 1}`,
                          topics: u.topics || u.content || (typeof u === "string" ? u : "")
                        }));
                      }
                    }
                  });
                }
              });
            });
          } catch (e) {
            console.error("Error checking syllabus_data collection:", e);
          }
        }

        // If found in Firestore:
        if (foundUnits && foundUnits.length > 0) {
          setSyllabusData({
            subjectCode: rawCode,
            subjectTitle: rawTitle,
            units: foundUnits,
            cos: foundCos
          });
          return;
        }

        // If no syllabus units found in Firestore collections:
        setSyllabusData(null);
      } catch (err) {
        console.error("Error resolving syllabus:", err);
        setSyllabusData(null);
      }
    };

    fetchSyllabus();
  }, [assignment]);

  // 3. Handle Setter Authentication
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please enter both Email and Password.");
      return;
    }

    setAuthenticating(true);
    setLoginError("");

    const inputEmail = loginEmail.trim().toLowerCase();
    const inputPassword = loginPassword.trim();

    try {
      // Ensure auth session is ready if anonymous sign-in is available
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (_) { }
      }

      let matchedSetter = null;
      const targetAssId = activeAssignmentId || urlAssignmentId;

      // Method 1: Verify directly against active assignment document (Most secure & direct)
      if (targetAssId) {
        try {
          const assSnap = await getDoc(doc(db, "coe_setter_assignments", targetAssId));
          if (assSnap.exists()) {
            const assData = assSnap.data();
            const assEmail = (assData.setterEmail || "").trim().toLowerCase();
            const assPassword = (assData.setterPassword || "").trim();

            if (assEmail === inputEmail) {
              if (assPassword && assPassword === inputPassword) {
                matchedSetter = {
                  id: assData.setterId || "setter_" + Date.now(),
                  name: assData.setterName || "External Setter",
                  collegeName: assData.setterCollege || "",
                  email: assEmail,
                  phone: assData.setterPhone || "",
                  status: "active"
                };
              } else if (!assPassword && assData.setterId) {
                // Legacy assignment without setterPassword: probe setter doc directly
                try {
                  const sDoc = await getDoc(doc(db, "coe_external_setters", assData.setterId));
                  if (sDoc.exists() && (sDoc.data().password || "").trim() === inputPassword) {
                    matchedSetter = { id: sDoc.id, ...sDoc.data() };
                  }
                } catch (e) {
                  console.warn("Direct setter doc read fallback note:", e);
                }
              }
            }
          }
        } catch (assErr) {
          console.warn("Assignment doc verify note:", assErr);
        }
      }

      // Method 2: Lookup assignment by setterEmail in coe_setter_assignments
      if (!matchedSetter) {
        try {
          const qAss = query(
            collection(db, "coe_setter_assignments"),
            where("setterEmail", "==", inputEmail)
          );
          const snapAss = await getDocs(qAss);
          if (!snapAss.empty) {
            snapAss.forEach((d) => {
              const data = d.data();
              if ((data.setterPassword || "").trim() === inputPassword) {
                matchedSetter = {
                  id: data.setterId || d.id,
                  name: data.setterName || "External Setter",
                  collegeName: data.setterCollege || "",
                  email: inputEmail,
                  phone: data.setterPhone || "",
                  status: "active"
                };
                if (!activeAssignmentId) {
                  setActiveAssignmentId(d.id);
                }
              }
            });
          }
        } catch (assQueryErr) {
          console.warn("Query coe_setter_assignments note:", assQueryErr);
        }
      }

      // Method 3: Query master coe_external_setters collection
      if (!matchedSetter) {
        try {
          const q = query(
            collection(db, "coe_external_setters"),
            where("email", "==", inputEmail)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            snap.forEach((d) => {
              const data = d.data();
              if ((data.password || "").trim() === inputPassword) {
                matchedSetter = { id: d.id, ...data };
              }
            });
          }
        } catch (setterErr) {
          console.warn("Query coe_external_setters note:", setterErr);
        }
      }

      if (!matchedSetter) {
        setLoginError("Invalid Email or Password. Please verify credentials sent in the COE official invitation email.");
        setAuthenticating(false);
        return;
      }

      if (matchedSetter.status === "disabled") {
        setLoginError("Your account has been disabled by the Controller of Examinations.");
        setAuthenticating(false);
        return;
      }

      setAuthenticatedSetter(matchedSetter);
    } catch (err) {
      console.error("Login error:", err);
      if (err.message?.includes("Missing or insufficient permissions") || err.code === "permission-denied") {
        setLoginError("Access permission denied by database security rules. Please ensure you opened the full link from your COE email.");
      } else {
        setLoginError("Login failed: " + err.message);
      }
    } finally {
      setAuthenticating(false);
    }
  };

  // 4. Handle Signature Upload (Strict 30KB Limit)
  const handleSignatureFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Strict 30KB limit check (30 * 1024 = 30,720 bytes)
    const MAX_SIZE_BYTES = 30 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const fileSizeKB = (file.size / 1024).toFixed(1);
      alert(`Signature file size (${fileSizeKB} KB) exceeds the maximum allowed limit of 30 KB. Please select a smaller file (Max 30 KB).`);
      e.target.value = ""; // Reset input selection
      return;
    }

    setSignatureFile(file);
    setUploadingSig(true);

    try {
      // Direct Base64 conversion (instant, offline-capable, zero permission errors)
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
      setSignatureUrl(base64Data);
    } catch (err) {
      console.error("Signature processing error:", err);
      alert("Failed to process signature file: " + err.message);
    } finally {
      setUploadingSig(false);
    }
  };

  // 5. Submit Acceptance Form
  const handleSubmitAcceptance = async () => {
    const targetAssignmentId = assignment?.id || activeAssignmentId || urlAssignmentId;
    if (!targetAssignmentId) {
      alert("Assignment record not found. Please ensure you are logged in with the official link sent by COE.");
      return;
    }

    if (interestStatus === "Interested" && !signatureUrl) {
      alert("Please upload your digital signature before accepting.");
      return;
    }

    setUploadingSig(true);
    try {
      const acceptancePayload = removeUndefinedFields({
        acceptanceStatus: interestStatus,
        signatureUrl: signatureUrl || null,
        status: interestStatus === "Interested" ? "accepted" : "declined",
        updatedAt: serverTimestamp()
      });

      await setDoc(doc(db, "coe_setter_assignments", targetAssignmentId), acceptancePayload, { merge: true });

      setAssignment((prev) => ({
        ...(prev || {}),
        ...acceptancePayload,
        id: targetAssignmentId
      }));

      setAcceptanceSubmitted(true);
      if (interestStatus === "Interested") {
        alert("Acceptance form submitted successfully! Proceeding to Question Paper Editor.");
        setViewState("editor");
      } else {
        alert("Your response ('Not Interested') has been communicated to the Controller of Examinations.");
      }
    } catch (err) {
      alert("Failed to submit acceptance form: " + err.message);
    } finally {
      setUploadingSig(false);
    }
  };

  // 5.5 AI Similarity Engine Cross-Comparison
  const handleRunAiSimilarityCheck = async (forceOpenModal = true) => {
    setIsComparingAi(true);
    try {
      // 0. Automatically ensure all latest editor buffers are saved to draft first
      await handleSaveDraft(false);
      setIsSetBModifiedSinceDraft(false);

      // 1. Force sync all live CKEditor buffers into paper states
      const syncedPaperA = syncAllCkEditorsToPaper(qpData, "setA");
      const syncedPaperB = syncAllCkEditorsToPaper(qpDataB, "setB");

      if (!syncedPaperA?.sections?.length || !syncedPaperB?.sections?.length) {
        setIsComparingAi(false);
        alert("Please ensure both Question Paper Set A and Set B have sections and questions before running AI comparison.");
        return null;
      }

      const setAQuestions = extractQuestionListForAi(syncedPaperA);
      const setBQuestions = extractQuestionListForAi(syncedPaperB);

      if (setAQuestions.length < 1 || setBQuestions.length < 1) {
        setIsComparingAi(false);
        alert("Both Set A and Set B must have at least 1 question with content to perform AI semantic comparison.");
        return null;
      }
      let endpoint = DEFAULT_AI_SIMILARITY_ENDPOINT;
      if (assignment?.aiSimilarityEndpoint && assignment.aiSimilarityEndpoint.startsWith("http") && !assignment.aiSimilarityEndpoint.includes("trycloudflare.com")) {
        endpoint = assignment.aiSimilarityEndpoint;
      }

      const requestPayload = {
        subjectCode: String(assignment?.subjectCode || ""),
        subjectTitle: String(assignment?.subjectTitle || ""),
        examSession: String(assignment?.examSession || ""),
        setA: setAQuestions,
        setB: setBQuestions,
        duplicateThreshold: 0.90,
        warningThreshold: 0.80
      };

      console.log("[AI Similarity] Starting semantic cross-comparison via:", endpoint, {
        setA_questions: setAQuestions.length,
        setB_questions: setBQuestions.length
      });

      let rawResult = null;
      let usedJobsApi = false;

      // 1. Try asynchronous /api/jobs queue endpoint first (prevents proxy 60s idle socket timeouts)
      const baseUrl = endpoint.replace(/\/api\/check-similarity\/?$/, "").replace(/\/+$/, "");
      const jobsEndpoint = `${baseUrl}/api/jobs`;

      try {
        console.log("[AI Similarity] Checking async jobs API at:", jobsEndpoint);
        const jobInitRes = await fetch(jobsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        });

        if (jobInitRes.ok) {
          const jobInitData = await jobInitRes.json();
          if (jobInitData?.jobId) {
            usedJobsApi = true;
            const pollUrl = `${baseUrl}/api/job/${jobInitData.jobId}`;
            console.log("[AI Similarity] Async job registered:", jobInitData.jobId, "polling:", pollUrl);

            // Poll every 3 seconds for up to 180 seconds
            const maxPollAttempts = 60;
            for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              try {
                const pollRes = await fetch(pollUrl);
                if (pollRes.ok) {
                  const pollData = await pollRes.json();
                  if (pollData?.status === "COMPLETED" && pollData.result) {
                    rawResult = pollData.result;
                    console.log("[AI Similarity] Async job completed successfully in attempt:", attempt);
                    break;
                  } else if (pollData?.status === "FAILED") {
                    throw new Error(pollData.error || "AI Similarity Job failed on server");
                  }
                }
              } catch (pollErr) {
                console.warn("[AI Similarity] Polling attempt error:", pollErr);
              }
            }

            if (!rawResult) {
              throw new Error("AI Similarity analysis timed out after 3 minutes. Please try again.");
            }
          }
        }
      } catch (jobsErr) {
        console.warn("[AI Similarity] Async jobs endpoint skipped or failed, falling back to direct endpoint:", jobsErr);
      }

      // 2. Fallback to synchronous POST if jobs API was not available
      if (!rawResult && !usedJobsApi) {
        console.log("[AI Similarity] Falling back to direct synchronous POST:", endpoint);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          let errDetail = "";
          try {
            const errJson = await response.json();
            if (errJson?.detail) {
              errDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
            }
          } catch (e) { }
          throw new Error(`AI Similarity Server responded with HTTP status ${response.status}${errDetail ? ` (${errDetail})` : ""}`);
        }

        rawResult = await response.json();
      }

      const result = calibrateAiSimilarityResult(rawResult);
      setAiSimilarityResult(result);

      // Cache locally and persist to Firestore
      const targetAssignmentId = assignment?.id || activeAssignmentId || urlAssignmentId;
      if (targetAssignmentId) {
        try {
          localStorage.setItem(`coe_qp_ai_sim_${targetAssignmentId}`, JSON.stringify(result));
          await setDoc(doc(db, "coe_setter_assignments", targetAssignmentId), {
            aiSimilarityResult: result,
            aiCheckedAt: new Date().toISOString()
          }, { merge: true });
        } catch (cacheErr) {
          console.warn("Could not persist AI similarity to Firestore cache:", cacheErr);
        }
      }

      if (forceOpenModal) {
        setShowAiModal(true);
      }
      return result;
    } catch (err) {
      console.error("AI Similarity Check error:", err);
      alert(`AI Similarity Server Note: ${err.message}. Please verify the Windows AI Server is running.`);
      return null;
    } finally {
      setIsComparingAi(false);
    }
  };

  const handleJumpToEditQuestion = (setBQuestionLabel) => {
    setShowAiModal(false);
    handleSwitchSet("setB");
    setViewState("editor");

    // Extract raw question number from label like "Q.11(a) (i)" -> "11"
    const match = String(setBQuestionLabel || "").match(/\d+/);
    const targetQNo = match ? match[0] : null;

    setTimeout(() => {
      let targetEl = null;
      if (targetQNo) {
        targetEl = document.getElementById(`question-card-${targetQNo}`);
      }
      if (!targetEl) {
        targetEl = document.querySelector('[id^="question-card-"]');
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.add("ring-4", "ring-amber-400", "bg-amber-50/70");
        setTimeout(() => {
          targetEl.classList.remove("ring-4", "ring-amber-400", "bg-amber-50/70");
        }, 3500);
      }
    }, 350);
  };

  const displayedAiMatches = useMemo(() => {
    return aiSimilarityResult?.detailedMatches || [];
  }, [aiSimilarityResult]);

  // 6. Click "Move to COE" -> Validate Checklists for all sets -> Check AI Similarity if 2 sets -> Open Claim Bill Form Modal
  const handleMoveToCoe = async () => {
    if (!validateAllSplitQuestions()) return;

    // Direct buffer sync to ensure all active CKEditors have committed their latest text
    const syncedPaperA = isSetB ? qpData : syncAllCkEditorsToPaper(qpData, "setA");
    const syncedPaperB = isSetB ? syncAllCkEditorsToPaper(qpDataB, "setB") : qpDataB;

    // Strict Missed Questions Guard for Set A
    const aMissing = getPaperMissingQuestions(syncedPaperA, "Set A");
    if (!aMissing.isAllComplete) {
      const missedNos = aMissing.missedQuestions.map(m => `Q.${m.qNo}`).join(", ");
      alert(`Submission to COE is Locked!\n\nQuestion Paper Set A has ${aMissing.missedQuestions.length} missed/incomplete question(s): ${missedNos}.\n\nPlease ensure all questions, sub-parts, and choices in Set A are fully filled before forwarding to COE.`);
      setActiveSet("setA");
      setViewState("editor");
      setTimeout(() => scrollToQuestion(aMissing.missedQuestions[0]?.qNo), 300);
      return;
    }

    if (isNumSetsTwo) {
      // Strict Missed Questions Guard for Set B
      const bMissing = getPaperMissingQuestions(syncedPaperB, "Set B");
      if (!bMissing.isAllComplete) {
        const missedNos = bMissing.missedQuestions.map(m => `Q.${m.qNo}`).join(", ");
        alert(`Submission to COE is Locked!\n\nQuestion Paper Set B has ${bMissing.missedQuestions.length} missed/incomplete question(s): ${missedNos}.\n\nPlease ensure all questions, sub-parts, and choices in Set B are fully filled before forwarding to COE.`);
        setActiveSet("setB");
        setViewState("editor");
        setTimeout(() => scrollToQuestion(bMissing.missedQuestions[0]?.qNo), 300);
        return;
      }

      if (!isChecklistCompleteA) {
        alert("Please complete the 12-point Question Paper Setting Verification Checklist for Set A before submitting to COE.");
        setActiveSet("setA");
        setShowChecklistModal(true);
        return;
      }
      if (!isChecklistCompleteB) {
        alert("Please complete the 12-point Question Paper Setting Verification Checklist for Set B before submitting to COE.");
        setActiveSet("setB");
        setShowChecklistModal(true);
        return;
      }

      // Automated AI Similarity Check for 2 Sets (Max 25% Duplicate Limit)
      let currentAiResult = aiSimilarityResult;
      if (!currentAiResult) {
        currentAiResult = await handleRunAiSimilarityCheck(false);
      }

      if (currentAiResult) {
        if (Number(currentAiResult.overallSimilarityPercent) > 25.0) {
          setShowAiModal(true);
          alert(`Submission to COE is Locked\n\nOverall similarity between Set A and Set B is ${currentAiResult.overallSimilarityPercent}%, which exceeds the autonomous examination limit of 25.0%.\n\nAutonomous regulations require Question Paper Set A and Set B to be mutually distinct and independent assessments.\n\nPlease review and revise the duplicate question(s) in Set B before forwarding to the Controller of Examinations.`);
          return;
        }
        if (Number(currentAiResult.duplicateCount) > 0) {
          setShowAiModal(true);
          alert(`Submission to COE is Locked\n\nFound ${currentAiResult.duplicateCount} duplicate question(s) with high conceptual similarity (≥ 90%).\n\nPlease reframe or replace these questions in Set B before forwarding to the Controller of Examinations.`);
          return;
        }
      }
    } else {
      if (!isChecklistCompleteA) {
        alert("Please complete all 12 items of the Question Paper Setting Verification Checklist before submitting to COE.");
        setShowChecklistModal(true);
        return;
      }
    }

    setClaimBillStep("form");
    setShowClaimBillModal(true);
  };

  // 6.1 Sub-part Split Question & Question Data Handlers (Operates on Active Set)
  const handleToggleSplitQuestion = (secIdx, qIdx, isOptB, shouldSplit) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      const q = updated.sections[secIdx].questions[qIdx];
      const totalMarks = q.marks || (isOptB ? 16 : 16);

      if (!isOptB) {
        q.isSplit = shouldSplit;
        if (shouldSplit && (!q.subParts || q.subParts.length === 0)) {
          q.subCount = 2;
          q.subParts = createDefaultSubParts(2, totalMarks);
        }
      } else {
        q.isSplitOptionB = shouldSplit;
        if (shouldSplit && (!q.subPartsOptionB || q.subPartsOptionB.length === 0)) {
          q.subCountOptionB = 2;
          q.subPartsOptionB = createDefaultSubParts(2, totalMarks);
        }
      }
      return updated;
    });
  };

  const handleChangeSubCount = (secIdx, qIdx, isOptB, newCount) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      const q = updated.sections[secIdx].questions[qIdx];
      const totalMarks = q.marks || 16;
      const partsKey = isOptB ? "subPartsOptionB" : "subParts";
      const countKey = isOptB ? "subCountOptionB" : "subCount";

      q[countKey] = newCount;
      q[partsKey] = createDefaultSubParts(newCount, totalMarks);
      return updated;
    });
  };

  const handleUpdateSubPartMark = (secIdx, qIdx, isOptB, subIdx, val) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      const q = updated.sections[secIdx].questions[qIdx];
      const totalMarks = q.marks || 16;
      const partsKey = isOptB ? "subPartsOptionB" : "subParts";
      const parts = [...(q[partsKey] || [])];

      if (parts.length === 0) return prevQp;

      parts[subIdx] = { ...parts[subIdx], marks: Number(val) || 0 };

      // Smart auto-fill for last part if editing an earlier part
      if (subIdx !== parts.length - 1 && parts.length > 1) {
        let sumOther = 0;
        for (let i = 0; i < parts.length - 1; i++) {
          sumOther += Number(parts[i].marks) || 0;
        }
        const rem = totalMarks - sumOther;
        if (rem >= 0) {
          parts[parts.length - 1] = { ...parts[parts.length - 1], marks: rem };
        }
      }

      q[partsKey] = parts;
      return updated;
    });
  };

  const handleUpdateSubPartText = (secIdx, qIdx, isOptB, subIdx, val) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      const q = updated.sections[secIdx].questions[qIdx];
      const partsKey = isOptB ? "subPartsOptionB" : "subParts";
      const parts = [...(q[partsKey] || [])];

      if (parts[subIdx]) {
        parts[subIdx] = { ...parts[subIdx], text: val };
      }
      q[partsKey] = parts;
      return updated;
    });
  };

  const handleUpdateQuestionText = (secIdx, qIdx, val) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      updated.sections[secIdx].questions[qIdx].text = val;
      return updated;
    });
  };

  const handleUpdateOptionBText = (secIdx, qIdx, val) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      updated.sections[secIdx].questions[qIdx].optionB = val;
      return updated;
    });
  };

  const handleUpdateQuestionMeta = (secIdx, qIdx, field, val) => {
    markSetBModified();
    setCurrentQp((prevQp) => {
      if (!prevQp?.sections?.[secIdx]?.questions?.[qIdx]) return prevQp;
      const updated = JSON.parse(JSON.stringify(prevQp));
      updated.sections[secIdx].questions[qIdx][field] = val;
      return updated;
    });
  };

  const validateSplitQuestionsForPaper = (paper, label = "Set A") => {
    for (let secIdx = 0; secIdx < (paper?.sections || []).length; secIdx++) {
      const sec = paper.sections[secIdx];
      for (let qIdx = 0; qIdx < (sec.questions || []).length; qIdx++) {
        const q = sec.questions[qIdx];
        const qNoLabel = `${q.qNo}${q.optionB !== undefined ? '(a)' : ''}`;

        if (q.isSplit) {
          const msg = getSubPartsValidationMsg(q.subParts, q.marks || 16, `${label} Q.${qNoLabel}`);
          if (msg) {
            alert(msg);
            return false;
          }
        }
        if (q.optionB !== undefined && q.isSplitOptionB) {
          const msgOptB = getSubPartsValidationMsg(q.subPartsOptionB, q.marks || 16, `${label} Q.${q.qNo}(b)`);
          if (msgOptB) {
            alert(msgOptB);
            return false;
          }
        }
      }
    }
    return true;
  };

  const validateAllSplitQuestions = () => {
    if (!validateSplitQuestionsForPaper(qpData, "Set A")) return false;
    if (Number(assignment?.numSets) === 2 && qpDataB?.sections?.length > 0) {
      if (!validateSplitQuestionsForPaper(qpDataB, "Set B")) return false;
    }
    return true;
  };

  // Switch active set with automatic CKEditor state synchronization
  const handleSwitchSet = (targetSet) => {
    if (targetSet === activeSet) return;
    if (activeSet === "setA") {
      setQpData((prevA) => syncAllCkEditorsToPaper(prevA, "setA"));
    } else {
      setQpDataB((prevB) => syncAllCkEditorsToPaper(prevB, "setB"));
    }
    setActiveSet(targetSet);
  };

  // 6b. Save Progress as Draft (Enables question paper setting in multiple relaxed sessions)
  const handleSaveDraft = async (showToast = true) => {
    const targetAssignmentId = assignment?.id || activeAssignmentId || urlAssignmentId;
    if (!targetAssignmentId) {
      if (showToast) alert("Assignment identifier not found. Please reload or check the link provided by COE.");
      return;
    }

    setIsSavingDraft(true);
    try {
      // 1. Force real-time sync from ALL active CKEditor instances directly into paper state
      const syncedPaperA = isSetB ? qpData : syncAllCkEditorsToPaper(qpData, "setA");
      const syncedPaperB = isSetB ? syncAllCkEditorsToPaper(qpDataB, "setB") : qpDataB;

      setQpData(syncedPaperA);
      if (syncedPaperB) setQpDataB(syncedPaperB);

      const numSetsToSave = Number(assignment?.numSets) || 1;
      const sanitizedPermittedMaterialsA = removeUndefinedFields(permittedMaterialsA);
      const sanitizedPermittedMaterialsB = removeUndefinedFields(permittedMaterialsB);
      const sanitizedPaperA = removeUndefinedFields({
        ...syncedPaperA,
        permittedMaterials: sanitizedPermittedMaterialsA
      });
      const sanitizedPaperB = numSetsToSave === 2 && syncedPaperB ? removeUndefinedFields({
        ...syncedPaperB,
        permittedMaterials: sanitizedPermittedMaterialsB
      }) : null;
      const sanitizedChecklistA = removeUndefinedFields(checklistResponsesA);
      const sanitizedChecklistB = numSetsToSave === 2 ? removeUndefinedFields(checklistResponsesB) : null;

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const isoStr = now.toISOString();

      const draftPayload = {
        draftPaper: sanitizedPaperA,
        draftPaperA: sanitizedPaperA,
        draftChecklistA: sanitizedChecklistA,
        permittedMaterials: sanitizedPermittedMaterialsA,
        permittedMaterialsA: sanitizedPermittedMaterialsA,
        permittedMaterialsB: sanitizedPermittedMaterialsB,
        draftSavedAt: isoStr,
        draftLastSavedTime: timeStr,
        draftSavedBy: authenticatedSetter?.email || assignment?.setterEmail || "",
        updatedAt: serverTimestamp()
      };

      if (sanitizedPaperB) {
        draftPayload.draftPaperB = sanitizedPaperB;
        draftPayload.draftChecklistB = sanitizedChecklistB;
      }

      if (aiSimilarityResult) {
        draftPayload.aiSimilarityResult = removeUndefinedFields(aiSimilarityResult);
      }

      await setDoc(doc(db, "coe_setter_assignments", targetAssignmentId), draftPayload, { merge: true });

      // Save local backup to localStorage as a safety net
      try {
        localStorage.setItem(`coe_qp_draft_${targetAssignmentId}`, JSON.stringify({
          paperA: sanitizedPaperA,
          paperB: sanitizedPaperB,
          checklistA: sanitizedChecklistA,
          checklistB: sanitizedChecklistB,
          permittedMaterials: sanitizedPermittedMaterialsA,
          permittedMaterialsA: sanitizedPermittedMaterialsA,
          permittedMaterialsB: sanitizedPermittedMaterialsB,
          timeStr,
          savedAt: isoStr
        }));
      } catch (e) { }

      setAssignment((prev) => ({
        ...(prev || {}),
        ...draftPayload
      }));

      setLastDraftSavedAt(timeStr);
      setIsSetBModifiedSinceDraft(false);

      if (showToast) {
        setDraftToast(`Question paper draft saved successfully at ${timeStr}! You can take a break, log out safely, and resume setting your paper anytime.`);
        setTimeout(() => setDraftToast(null), 6000);
      }
    } catch (err) {
      console.error("Draft save error:", err);
      if (showToast) alert("Failed to save draft: " + err.message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Keyboard shortcut (Ctrl+S / Cmd+S) to quickly save draft while typing
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (viewState === "editor" && !isSubmitted) {
          handleSaveDraft(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewState, isSubmitted, qpData, qpDataB, checklistResponsesA, checklistResponsesB, assignment?.id, activeAssignmentId]);

  // 7. Validate & Proceed to 1-time Claim Verification step
  const handleVerifyClaimDetails = (e) => {
    if (e) e.preventDefault();
    if (!claimBillData.setterName || !claimBillData.bankName || !claimBillData.accountNumber || !claimBillData.ifscCode) {
      alert("Please fill in all required bank remittance details (Bank Name, Account Number, IFSC Code) before proceeding.");
      return;
    }
    setClaimBillStep("verify");
  };

  // 8. Final Submit to COE (Save Question Paper(s), Checklist & Claim Bill to Firestore)
  const handleFinalSubmitToCoe = async () => {
    setSubmittingToCoe(true);
    try {
      const targetAssignmentId = assignment?.id || activeAssignmentId || urlAssignmentId;
      if (!targetAssignmentId) {
        throw new Error("Assignment identifier not found. Please reload or use the link provided by COE.");
      }

      const syncedPaperA = isSetB ? qpData : syncAllCkEditorsToPaper(qpData, "setA");
      const syncedPaperB = isSetB ? syncAllCkEditorsToPaper(qpDataB, "setB") : qpDataB;

      const numSetsToSubmit = Number(assignment?.numSets) || 1;
      const sanitizedPermittedMaterialsA = removeUndefinedFields(permittedMaterialsA);
      const sanitizedPermittedMaterialsB = removeUndefinedFields(permittedMaterialsB);
      const sanitizedPaperA = removeUndefinedFields({
        ...syncedPaperA,
        permittedMaterials: sanitizedPermittedMaterialsA
      });
      const sanitizedPaperB = numSetsToSubmit === 2 && syncedPaperB ? removeUndefinedFields({
        ...syncedPaperB,
        permittedMaterials: sanitizedPermittedMaterialsB
      }) : null;
      const sanitizedChecklistA = removeUndefinedFields(checklistResponsesA);
      const sanitizedChecklistB = numSetsToSubmit === 2 ? removeUndefinedFields(checklistResponsesB) : null;
      const remuneration = numSetsToSubmit === 2 ? 3000 : 2000;
      const sanitizedClaimBill = removeUndefinedFields({
        ...claimBillData,
        setterName: authenticatedSetter?.name || assignment?.setterName || claimBillData.setterName || "",
        departmentInstitution: authenticatedSetter?.collegeName || assignment?.setterCollege || claimBillData.departmentInstitution || "",
        emailId: authenticatedSetter?.email || assignment?.setterEmail || claimBillData.emailId || "",
        accHolderName: claimBillData.accHolderName || authenticatedSetter?.name || assignment?.setterName || "",
        subjectCode: assignment?.subjectCode || "",
        subjectTitle: assignment?.subjectTitle || "",
        numSets: numSetsToSubmit,
        remunerationAmount: remuneration,
        submissionDate: new Date().toLocaleDateString("en-IN")
      });

      const updatePayload = {
        status: "submitted",
        paperSubmittedAt: new Date().toISOString(),
        submittedPaper: sanitizedPaperA,
        submittedPaperA: sanitizedPaperA,
        checklistVerified: true,
        checklistResponses: sanitizedChecklistA,
        checklistResponsesA: sanitizedChecklistA,
        permittedMaterials: sanitizedPermittedMaterialsA,
        permittedMaterialsA: sanitizedPermittedMaterialsA,
        permittedMaterialsB: sanitizedPermittedMaterialsB,
        examMonthYear: examMonthYear || assignment?.examSession || "",
        claimBillData: sanitizedClaimBill,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (sanitizedPaperB) {
        updatePayload.submittedPaperB = sanitizedPaperB;
        updatePayload.checklistResponsesB = sanitizedChecklistB;
      }

      if (aiSimilarityResult) {
        updatePayload.aiSimilarityResult = removeUndefinedFields(aiSimilarityResult);
      }

      await setDoc(doc(db, "coe_setter_assignments", targetAssignmentId), updatePayload, { merge: true });

      setAssignment((prev) => ({
        ...(prev || {}),
        ...updatePayload,
        id: targetAssignmentId
      }));

      setShowClaimBillModal(false);
      setSubmittedSuccess(true);
      setViewState("preview");
      alert("Question Paper(s), Verification Checklist and Remuneration Claim Bill submitted successfully to COE!");
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit question paper: " + err.message);
    } finally {
      setSubmittingToCoe(false);
    }
  };

  // Calculate workflow step index
  const activeStep = useMemo(() => {
    if (submittedSuccess || assignment?.status === "submitted") return 4;
    if (viewState === "preview") return 4;
    if (viewState === "editor") return 3;
    if (acceptanceSubmitted) return 2;
    return 1;
  }, [viewState, acceptanceSubmitted, submittedSuccess, assignment]);

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // RENDER: LOGIN SCREEN (If not authenticated)
  // -------------------------------------------------------------------------
  if (!authenticatedSetter) {
    return (
      <div className="min-h-screen relative font-sans text-slate-800 flex flex-col justify-between overflow-x-hidden bg-slate-900">
        {/* Full-width Actual Campus Photo Background with subtle 15-25% translucent overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: `url('/ckcet_campus.png')` }}
        >
          {/* Subtle translucent overlay (15–25%) ensuring campus buildings, sky, and greenery remain clearly visible */}
          <div className="absolute inset-0 bg-white/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/15 via-transparent to-slate-900/20" />
        </div>

        {/* TOP INSTITUTIONAL BRANDING HEADER */}
        <header className="relative z-20 shrink-0 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 sm:px-8 lg:px-12 py-2.5 sm:py-3 shadow-xs w-full">
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">

            {/* Left: Clean CKCET Banner Logo and College Details */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-10 sm:h-12 lg:h-14 shrink-0 flex items-center">
                <img
                  src="/logo.png"
                  alt="CKCET Logo"
                  className="h-full w-auto max-w-[260px] sm:max-w-[440px] lg:max-w-[620px] object-contain"
                />
              </div>
            </div>

            {/* Right: Office of Controller of Examinations + Portal Badge */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="hidden lg:flex flex-col items-end text-right">
                <span className="text-xs sm:text-sm font-black text-[#120c7a] uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  OFFICE OF THE CONTROLLER OF EXAMINATIONS
                </span>
                <span className="text-[11px] sm:text-xs text-slate-500 font-semibold mt-0.5 whitespace-nowrap">
                  End Semester Examinations {effectiveExamSession || "Nov. / Dec. 2026"}
                </span>
              </div>
              <div className="h-8 sm:h-10 w-px bg-slate-200/80 hidden lg:block" />
              <div className="px-3.5 sm:px-4 py-2 rounded-xl bg-blue-50/90 border border-blue-200/90 text-[#120c7a] text-xs sm:text-sm font-black flex items-center gap-2 shadow-2xs whitespace-nowrap">
                <Landmark className="h-4 w-4 text-[#120c7a] shrink-0" />
                <span className="hidden sm:inline">ESE - QP Setter Portal</span>
                <span className="sm:hidden text-[11px]">Setter Portal</span>
              </div>
            </div>

          </div>
        </header>

        {/* HERO + LOGIN CONTAINER */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:px-6 md:px-8 lg:px-12 w-full my-auto">
          <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

            {/* LEFT COLUMN: HERO CONTENT (UPPER-MIDDLE AREA, HORIZONTALLY CENTERED) */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center text-center">
              <div
                className="w-full max-w-[760px] rounded-[20px] px-6 py-7 sm:px-8 sm:py-8 shadow-xs flex flex-col items-center text-center space-y-5"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.35)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  border: "1px solid rgba(255, 255, 255, 0.55)"
                }}
              >
                {/* Small, Elegant Pill */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-blue-200/90 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#101943]" />
                  <span className="text-[11px] sm:text-xs font-black tracking-widest text-[#101943] uppercase">
                    CONFIDENTIAL QUESTION SETTER WORKBENCH
                  </span>
                </div>

                {/* Main Heading: "Next-Gen Autonomous Examination & Question Portal" */}
                <h1
                  className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold leading-[1.18] tracking-tight text-center"
                  style={{
                    textShadow: "0 1px 2px rgba(255, 255, 255, 0.95)"
                  }}
                >
                  <span className="text-[#101943] block">Next-Gen Autonomous Examination</span>
                  <span className="text-[#234FE8] block mt-1.5 font-extrabold">
                    & Question Portal
                  </span>
                </h1>

                {/* Description directly below heading */}
                <p
                  className="text-base sm:text-lg lg:text-[19px] font-semibold leading-[1.5] text-[#172554] text-center max-w-[720px] mx-auto"
                  style={{
                    textShadow: "0 1px 2px rgba(255, 255, 255, 0.95)"
                  }}
                >
                  A first-of-its-kind digital initiative of <strong className="font-extrabold text-[#101943]">CKCET</strong>, enabling secure, seamless and expert-driven <strong className="font-extrabold text-[#101943]">Question Paper Setting</strong> for Autonomous End Semester Examinations.
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: REFINED LOGIN CARD (360-400px width on desktop) */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end w-full">
              <div className="w-full max-w-[390px] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-[22px] p-6 sm:p-8 shadow-xl shadow-slate-950/10 space-y-5">

                {/* Card Header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center h-12 w-12 bg-[#120c7a] rounded-xl text-white shadow-md mx-auto mb-1">
                    <Lock className="h-6 w-6 text-amber-400" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight font-serif">
                    QP Setter Sign In
                  </h2>
                  <p className="text-slate-500 text-xs font-semibold max-w-xs mx-auto">
                    Sign in using the official credentials provided in your COE invitation.
                  </p>
                </div>

                {/* Error Banner */}
                {loginError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2.5 shadow-2xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="text-xs font-extrabold text-slate-700 tracking-wider flex items-center gap-1.5 mb-1.5 uppercase">
                      <Mail className="h-3.5 w-3.5 text-[#120c7a]" />
                      REGISTERED EMAIL ADDRESS
                    </label>
                    <input
                      type="email"
                      autoComplete="username email"
                      placeholder="professor@iitm.ac.in / name@institution.edu"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/15 transition-all shadow-inner"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-extrabold text-slate-700 tracking-wider flex items-center gap-1.5 uppercase">
                        <Lock className="h-3.5 w-3.5 text-[#120c7a]" />
                        SECURE ACCESS PASSWORD
                      </label>
                      <span className="text-[10px] font-black text-[#120c7a] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/80 uppercase">
                        COE ISSUED
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Enter password sent in official invitation"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-900 font-semibold placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/15 transition-all shadow-inner"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authenticating}
                    className="w-full bg-[#120c7a] hover:bg-[#0d0961] text-white font-black py-3 px-5 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {authenticating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                        <span>Verifying COE Credentials...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4 text-amber-400" />
                        <span>Log In to Setter Workbench</span>
                        <ChevronRight className="h-4 w-4 text-amber-400" />
                      </>
                    )}
                  </button>
                </form>

                {/* Card Security Footer */}
                <div className="pt-3.5 border-t border-slate-100 text-center space-y-1">
                  <p className="text-[11px] text-slate-500 font-semibold flex items-center justify-center gap-1.5">
                    <Lock className="h-3 w-3 text-[#120c7a]" />
                    Strictly Confidential · Authorized Personnel Only
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    C.K. College of Engineering & Technology · COE Division
                  </p>
                </div>

              </div>
            </div>

          </div>
        </main>

        {/* SLIM INSTITUTIONAL FOOTER */}
        <footer className="relative z-20 shrink-0 border-t border-slate-200/80 bg-white/90 backdrop-blur-md px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 font-semibold gap-2">
          <span>© 2026 C.K. College of Engineering & Technology. All rights reserved.</span>
          <span>Designed for End Semester Examinations ({effectiveExamSession || "Nov. / Dec. 2026"}) Autonomous Framing</span>
        </footer>
      </div>
    );
  }

  // Direct Isolated Single-Page A4 Print Function for Claim Bill
  const handlePrintClaimBill = () => {
    const isTwoSets = Number(assignment?.numSets) === 2;
    const subDate = assignment?.paperSubmittedAt
      ? new Date(assignment.paperSubmittedAt).toLocaleDateString("en-IN")
      : new Date().toLocaleDateString("en-IN");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Question Paper Setter Claim Bill - ${assignment?.subjectCode || "COE"}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 12mm 8mm 12mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #18181b;
              font-size: 11px;
              line-height: 1.25;
            }
            .header-container {
              text-align: center;
              padding-bottom: 5px;
              margin-bottom: 8px;
              border-bottom: 1px solid #d4d4d8;
            }
            .logo-img {
              height: 48px;
              max-width: 460px;
              width: auto;
              object-fit: contain;
              display: block;
              margin: 0 auto 4px;
            }
            .sub-title {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: #27272a;
              margin: 0 0 2px;
            }
            .main-title {
              font-size: 13px;
              font-weight: 900;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: #120c7a;
              margin: 0;
            }
            .section-title {
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              color: #120c7a;
              margin: 7px 0 3px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 5px;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            td {
              border: 1px solid #18181b;
              padding: 3.5px 7px;
              font-size: 11px;
              vertical-align: middle;
            }
            .label-cell {
              width: 40%;
              font-weight: 700;
              background-color: #f4f4f5;
            }
            .val-cell {
              font-weight: 600;
            }
            .total-row {
              background-color: #fef3c7;
              font-weight: 900;
            }
            .total-amount {
              color: #065f46;
              font-size: 12px;
              font-weight: 900;
            }
            .footer-sig-block {
              margin-top: 10px;
              padding-top: 6px;
              border-top: 1px solid #d4d4d8;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .sig-img {
              height: 36px;
              object-fit: contain;
              display: block;
              margin: 2px 0;
            }
            .badge-verified {
              display: inline-block;
              font-size: 10px;
              font-weight: 800;
              color: #065f46;
              background: #d1fae5;
              padding: 2px 6px;
              border-radius: 4px;
              border: 1px solid #6ee7b7;
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <img class="logo-img" src="/logo.png" alt="CKCET" />
            <div class="sub-title">Office of the Controller of Examinations</div>
            <div class="main-title">QUESTION PAPER SETTER – CLAIM BILL</div>
          </div>

          <div class="section-title">I. SETTER & EXAMINATION DETAILS</div>
          <table>
            <tr><td class="label-cell">Name of the Paper Setter:</td><td class="val-cell"><strong>${claimBillData.setterName || ""}</strong></td></tr>
            <tr><td class="label-cell">Designation:</td><td class="val-cell">${claimBillData.designation || ""}</td></tr>
            <tr><td class="label-cell">Department & Institution:</td><td class="val-cell">${claimBillData.departmentInstitution || ""}</td></tr>
            <tr><td class="label-cell">Mobile Number:</td><td class="val-cell">${claimBillData.mobileNumber || ""}</td></tr>
            <tr><td class="label-cell">Email ID:</td><td class="val-cell">${claimBillData.emailId || ""}</td></tr>
            <tr><td class="label-cell">Subject Code and Name:</td><td class="val-cell" style="color:#120c7a;font-weight:800;">${assignment?.subjectCode || ""} - ${assignment?.subjectTitle || ""}</td></tr>
            <tr><td class="label-cell">Examination (Month & Year):</td><td class="val-cell"><strong>${examMonthYear || effectiveExamSession || ""}</strong></td></tr>
            <tr><td class="label-cell">Date of Submission of QP:</td><td class="val-cell">${subDate}</td></tr>
          </table>

          <div class="section-title">II. BANK ACCOUNT DETAILS FOR REMITTANCE</div>
          <table>
            <tr><td class="label-cell">Account Holder Name:</td><td class="val-cell"><strong>${claimBillData.accHolderName || ""}</strong></td></tr>
            <tr><td class="label-cell">Bank Name:</td><td class="val-cell"><strong>${claimBillData.bankName || ""}</strong></td></tr>
            <tr><td class="label-cell">Branch Name:</td><td class="val-cell">${claimBillData.branchName || ""}</td></tr>
            <tr><td class="label-cell">Account Number:</td><td class="val-cell" style="font-family:monospace;font-weight:800;letter-spacing:1px;color:#065f46;">${claimBillData.accountNumber || ""}</td></tr>
            <tr><td class="label-cell">IFSC Code:</td><td class="val-cell" style="font-family:monospace;font-weight:800;letter-spacing:1px;color:#312e81;">${claimBillData.ifscCode || ""}</td></tr>
            <tr><td class="label-cell">Account Type (SB / CA):</td><td class="val-cell">${claimBillData.accountType || "Savings (SB)"}</td></tr>
          </table>

          <div class="section-title">III. REMUNERATION CLAIM CALCULATION</div>
          <table>
            <tr><td class="label-cell">No. of Question Paper Sets:</td><td class="val-cell" style="font-weight:800;color:#120c7a;">${isTwoSets ? "2 Sets (Set A & Set B)" : "1 Set (Set A)"}</td></tr>
            <tr><td class="label-cell">Remuneration Rate:</td><td class="val-cell">${isTwoSets ? "Rs. 3,000/- (for setting two Question Papers: Set A & Set B)" : "Rs. 2,000/- (for setting a single Question Paper: Set A)"}</td></tr>
            <tr class="total-row"><td class="label-cell" style="background:#fef3c7;font-weight:900;">Total Remuneration Claim Payable:</td><td class="total-amount">₹${isTwoSets ? "3,000" : "2,000"} /-</td></tr>
          </table>

          <div class="footer-sig-block">
            <div>
              <div style="font-weight:bold;margin-bottom:2px;">Paper Setter Signature:</div>
              ${signatureUrl ? `<img class="sig-img" src="${signatureUrl}" alt="Signature" />` : `<div style="font-style:italic;color:#71717a;margin:4px 0;">Digitally Verified & Signed</div>`}
              <div style="font-size:11px;font-weight:600;color:#3f3f46;">${claimBillData.setterName || ""}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;font-weight:600;color:#71717a;margin-bottom:4px;">
                Date: ${subDate}
              </div>
              <span class="badge-verified">
                ${isSubmitted ? "Transmitted to COE ✓" : "Pending Final Submission"}
              </span>
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    // Small delay ensuring images/fonts are decoded before invoking native print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print claim bill error:", err);
      } finally {
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch (e) {}
        }, 3000);
      }
    }, 250);
  };

  // Reusable Question Paper Print/Preview Layout Document
  const renderPrintablePaper = (paper, setLabel = "") => {
    if (!paper) return null;
    return (
      <div className="bg-white text-zinc-900 rounded-2xl p-8 sm:p-12 font-serif space-y-6 w-full max-w-7xl mx-auto border border-zinc-300 print:border-none print:p-0 print:shadow-none print:m-0 print:w-full">
        <div className="text-center border-b pb-4">
          <div className="flex justify-center mb-3">
            <img src="/logo.png" alt="CKCET Logo" className="h-12 sm:h-14 w-auto object-contain" />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-[#120c7a] print:text-black">
            End Semester Examination – {effectiveExamSession} {setLabel}
          </h1>
          <h2 className="text-base font-bold mt-1 text-zinc-800 print:text-black">
            {assignment?.subjectCode} - {assignment?.subjectTitle}
          </h2>
          <div className="flex justify-between text-xs mt-3 font-sans font-medium text-zinc-700 px-4">
            <span>Batch: {assignment?.batch}</span>
            <span>Regulation: R-{assignment?.regulation}</span>
            <span>Max Marks: {paper?.maxMarks || 100}</span>
            <span>Duration: {paper?.duration || "3 Hours"}</span>
          </div>
          {(() => {
            const mat = paper?.permittedMaterials || (paper === qpDataB ? permittedMaterialsB : permittedMaterialsA);
            const matNotice = formatPermittedMaterialsNotice(mat);
            if (!matNotice) return null;
            return (
              <div className="mt-2.5 py-1.5 px-3 bg-zinc-50 border border-zinc-400 text-center text-xs font-bold font-sans text-zinc-900 rounded tracking-wide">
                {matNotice}
              </div>
            );
          })()}
          {(() => {
            const mat = paper?.permittedMaterials || (paper === qpDataB ? permittedMaterialsB : permittedMaterialsA);
            if (!mat?.enabled || !mat?.specialInstructions?.trim()) return null;
            return (
              <div className="text-[11px] font-sans italic text-zinc-700 text-center mt-1">
                Note for Hall Superintendent: {mat.specialInstructions.trim()}
              </div>
            );
          })()}
        </div>

        {paper?.sections?.map((sec) => (
          <div key={sec.id} className="space-y-3 my-6">
            <div className="border-b-2 border-black pb-1">
              <h3 className="font-bold text-sm uppercase font-sans text-zinc-900">{sec.name}</h3>
              <p className="text-xs italic text-zinc-700">{sec.instructions}</p>
            </div>

            <table className="w-full border-collapse border border-black text-xs font-serif my-2">
              <thead>
                <tr className="bg-zinc-200 border-b border-black text-center font-bold font-sans">
                  <th className="border border-black p-2 w-16 text-center">Q. No.</th>
                  <th className="border border-black p-2 text-center">Question</th>
                  <th className="border border-black p-2 w-16 text-center">Marks</th>
                  <th className="border border-black p-2 w-20 text-center">K-Level</th>
                  <th className="border border-black p-2 w-16 text-center">CO</th>
                </tr>
              </thead>
              <tbody>
                {sec.questions?.map((q, qIdx) => {
                  const isEitherOr = q.optionB !== undefined;
                  const isPartA = !isEitherOr && (q.marks === 2 || !q.marks);
                  const qNoDisplay = isPartA ? (String(q.qNo).padStart(2, '0') + '.') : String(q.qNo);

                  if (!isEitherOr) {
                    return (
                      <tr key={qIdx} className="border-b border-black">
                        <td className="border border-black p-2 text-center font-bold font-sans align-top whitespace-nowrap">
                          {qNoDisplay}
                        </td>
                        <td className="border border-black p-2.5 align-top">
                          {q.isSplit && q.subParts?.length > 0 ? (
                            <div className="space-y-2 font-serif text-xs leading-relaxed">
                              {q.subParts.map((sub, sIdx) => (
                                <div key={sIdx} className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <span className="font-bold font-sans text-xs w-6 shrink-0">{sub.label || getRomanLabel(sIdx)}</span>
                                    <div
                                      className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif flex-1"
                                      dangerouslySetInnerHTML={{ __html: sub.text || `(Sub-part ${sub.label || getRomanLabel(sIdx)} text pending)` }}
                                    />
                                  </div>
                                  <span className="font-sans font-bold text-xs text-zinc-900 shrink-0 ml-2">
                                    ({sub.marks})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                              dangerouslySetInnerHTML={{
                                __html: !isQuestionTextEmpty(q.text)
                                  ? q.text
                                  : "<span class='text-rose-600 font-sans font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-300 text-xs'>[MISSING: Question text not entered - Please edit to fill]</span>"
                              }}
                            />
                          )}
                        </td>
                        <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                          {q.marks || 2}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.blooms || "K1"}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.co || "CO1"}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <Fragment key={qIdx}>
                      {/* Option A Row */}
                      <tr className="border-b border-black">
                        <td className="border border-black p-2 text-center font-bold font-sans align-top whitespace-nowrap">
                          {q.qNo}(a)
                        </td>
                        <td className="border border-black p-2.5 align-top">
                          {q.isSplit && q.subParts?.length > 0 ? (
                            <div className="space-y-2 font-serif text-xs leading-relaxed">
                              {q.subParts.map((sub, sIdx) => (
                                <div key={sIdx} className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <span className="font-bold font-sans text-xs w-6 shrink-0">{sub.label || getRomanLabel(sIdx)}</span>
                                    <div
                                      className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif flex-1"
                                      dangerouslySetInnerHTML={{ __html: sub.text || `(Sub-part ${sub.label || getRomanLabel(sIdx)} text pending)` }}
                                    />
                                  </div>
                                  <span className="font-sans font-bold text-xs text-zinc-900 shrink-0 ml-2">
                                    ({sub.marks})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                              dangerouslySetInnerHTML={{ __html: q.text || "(Question text pending)" }}
                            />
                          )}
                        </td>
                        <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                          {q.marks || 16}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.blooms || "K1"}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.co || "CO1"}
                        </td>
                      </tr>

                      {/* Centered (OR) Divider Row */}
                      <tr className="border-b border-black">
                        <td className="border border-black p-1 bg-zinc-50"></td>
                        <td className="border border-black p-1.5 text-center font-bold font-sans text-xs tracking-widest text-zinc-900 bg-zinc-50">
                          (OR)
                        </td>
                        <td className="border border-black p-1 bg-zinc-50"></td>
                        <td className="border border-black p-1 bg-zinc-50"></td>
                        <td className="border border-black p-1 bg-zinc-50"></td>
                      </tr>

                      {/* Option B Row */}
                      <tr className="border-b border-black">
                        <td className="border border-black p-2 text-center font-bold font-sans align-top whitespace-nowrap">
                          {q.qNo}(b)
                        </td>
                        <td className="border border-black p-2.5 align-top">
                          {q.isSplitOptionB && q.subPartsOptionB?.length > 0 ? (
                            <div className="space-y-2 font-serif text-xs leading-relaxed">
                              {q.subPartsOptionB.map((sub, sIdx) => (
                                <div key={sIdx} className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <span className="font-bold font-sans text-xs w-6 shrink-0">{sub.label || getRomanLabel(sIdx)}</span>
                                    <div
                                      className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif flex-1"
                                      dangerouslySetInnerHTML={{ __html: sub.text || `(Sub-part ${sub.label || getRomanLabel(sIdx)} text pending)` }}
                                    />
                                  </div>
                                  <span className="font-sans font-bold text-xs text-zinc-900 shrink-0 ml-2">
                                    ({sub.marks})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                              dangerouslySetInnerHTML={{
                                __html: !isQuestionTextEmpty(q.optionB)
                                  ? q.optionB
                                  : "<span class='text-rose-600 font-sans font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-300 text-xs'>[MISSING: Option (b) text not entered - Please edit to fill]</span>"
                              }}
                            />
                          )}
                        </td>
                        <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                          {q.marks || 16}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.blooms || "K1"}
                        </td>
                        <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                          {q.co || "CO1"}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="pt-8 border-t flex items-end justify-between text-xs font-sans text-zinc-600">
          <div>
            <span className="block font-bold">External Setter Signature:</span>
            {signatureUrl && (
              <img src={signatureUrl} alt="Signature" className="h-10 object-contain mt-1" />
            )}
          </div>
          <div className="text-right">
            <span>Submitted to COE</span>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: MAIN WORKBENCH (ORIGINAL 1ST COLOR PALETTE - CRISP LIGHT THEME)
  // -------------------------------------------------------------------------
  return (
    <div 
      className={`min-h-screen font-sans flex flex-col selection:bg-amber-400 selection:text-slate-950 ${isSubmitted
        ? "bg-gradient-to-br from-[#0c0852] via-[#120c7a] to-[#1c1488] justify-center items-center"
        : "bg-gradient-to-br from-[#f0f0fa] via-[#e8f0fe] to-[#BBDEFB] text-zinc-800 pb-12"
      }`}
      style={!isSubmitted ? { zoom: 0.88 } : undefined}
    >

      {/* ========================================================================= */}
      {/* 1. TOP ACADEMIC NAVBAR (Omitted after submission) */}
      {/* ========================================================================= */}
      {!isSubmitted && (
        <header className="relative z-20 bg-white/95 backdrop-blur-md border-b border-zinc-200 shadow-xs px-4 sm:px-6 py-2.5 sticky top-0 print:hidden no-print">
          <div className="w-full flex items-center justify-between gap-4">

            <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
              <div className="h-12 sm:h-14 lg:h-16 flex items-center shrink-0">
                <img
                  src="/ckcet_logo_badge.png"
                  alt="CKCET Logo"
                  className="h-full w-auto object-contain shrink-0 drop-shadow-2xs rounded-lg"
                  onError={(e) => { e.currentTarget.src = '/logo.png'; }}
                />
              </div>
              <div className="h-10 w-px bg-zinc-200 hidden sm:block shrink-0" />
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-[#120c7a] text-sm sm:text-base leading-tight tracking-tight whitespace-nowrap">
                    QP Setter Workbench
                  </h3>
                  <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold text-emerald-800">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" /> Authenticated
                  </span>
                </div>
                <p className="text-xs text-zinc-500 font-semibold flex items-center gap-2 whitespace-nowrap">
                  <span>Welcome, <strong className="text-zinc-900 font-bold">{authenticatedSetter.name}</strong></span>
                  <span className="text-zinc-300 hidden sm:inline">•</span>
                  <span className="text-zinc-600 hidden sm:inline-flex items-center gap-1 font-medium text-[11px]">
                    <Building2 className="h-3 w-3 text-zinc-400" /> {authenticatedSetter.collegeName || "Invited Senior Professor"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* 1. Quick Guidelines Drawer / Side-by-Side Button */}
              <button
                onClick={() => {
                  if (viewState === "editor") {
                    setEditorRefPanel(editorRefPanel === "guidelines" ? null : "guidelines");
                  } else {
                    setShowGuidelinesDrawer(true);
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer shadow-2xs ${viewState === "editor" && editorRefPanel === "guidelines"
                  ? "bg-purple-700 text-white border-purple-800 ring-2 ring-purple-300 font-black shadow-sm"
                  : "bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200"
                  }`}
                title={viewState === "editor" ? "Toggle Guidelines Side-by-Side View" : "View Guidelines"}
              >
                <ShieldCheck className={`h-4 w-4 ${viewState === "editor" && editorRefPanel === "guidelines" ? "text-white" : "text-purple-700"}`} />
                <span className="hidden md:inline">
                  {viewState === "editor" && editorRefPanel === "guidelines" ? "Guidelines (Side-by-Side)" : "View Guidelines"}
                </span>
              </button>

              {/* 2. Quick Syllabus Drawer / Side-by-Side Button */}
              <button
                onClick={() => {
                  if (viewState === "editor") {
                    setEditorRefPanel(editorRefPanel === "syllabus" ? null : "syllabus");
                  } else {
                    setShowSyllabusDrawer(true);
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer shadow-2xs ${viewState === "editor" && editorRefPanel === "syllabus"
                  ? "bg-[#120c7a] text-white border-[#120c7a] ring-2 ring-blue-300 font-black shadow-sm"
                  : "bg-blue-50 hover:bg-blue-100 text-[#120c7a] border-blue-200"
                  }`}
                title={viewState === "editor" ? "Toggle Syllabus Side-by-Side View" : "View Syllabus & Outcomes"}
              >
                <BookOpen className={`h-4 w-4 ${viewState === "editor" && editorRefPanel === "syllabus" ? "text-white" : "text-[#120c7a]"}`} />
                <span className="hidden md:inline">
                  {viewState === "editor" && editorRefPanel === "syllabus" ? "Syllabus (Side-by-Side)" : "View Syllabus & Outcomes"}
                </span>
              </button>

              {/* 3. Quick Question Bank Drawer / Side-by-Side Button */}
              <button
                onClick={() => {
                  if (viewState === "editor") {
                    setEditorRefPanel(editorRefPanel === "qb" ? null : "qb");
                  } else {
                    setShowQbDrawer(true);
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer shadow-2xs ${viewState === "editor" && editorRefPanel === "qb"
                  ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300 font-black shadow-sm"
                  : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
                  }`}
                title={viewState === "editor" ? "Toggle Question Bank Side-by-Side View" : "View Question Bank"}
              >
                <FileText className={`h-4 w-4 ${viewState === "editor" && editorRefPanel === "qb" ? "text-white" : "text-amber-700"}`} />
                <span className="hidden md:inline">
                  {viewState === "editor" && editorRefPanel === "qb" ? "Question Bank (Side-by-Side)" : "View Question Bank"}
                </span>
              </button>

              {viewState !== "acceptance" && (
                <button
                  onClick={() => setViewState("acceptance")}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-zinc-600" />
                  <span>Acceptance & Order</span>
                </button>
              )}

              <button
                onClick={() => setAuthenticatedSetter(null)}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ========================================================================= */}
      {/* 2. STEP PROGRESS TRACKER BAR (Omitted after submission) */}
      {/* ========================================================================= */}
      {!isSubmitted && (
        <div className="relative z-10 bg-white/80 border-b border-zinc-200/80 py-2 px-4 sm:px-6 shadow-xs print:hidden no-print">
          <div className="w-full flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">

            {[
              { step: 1, title: "1. Order & Verification", desc: "Review Appointment Copy" },
              { step: 2, title: "2. Willingness Declaration", desc: "Digital Acceptance & Signature" },
              { step: 3, title: "3. Frame Question Paper", desc: "Pattern & Blooms Taxonomies" },
              { step: 4, title: "4. Confidential Submit", desc: "Encrypted COE Handoff" }
            ].map((s) => {
              const isPassed = activeStep > s.step;
              const isCurrent = activeStep === s.step;
              return (
                <div
                  key={s.step}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all shrink-0 ${isCurrent
                    ? "bg-[#120c7a] text-white shadow-md font-bold"
                    : isPassed
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200 font-extrabold"
                      : "bg-zinc-100 text-zinc-400 opacity-80"
                    }`}
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center font-black text-xs ${isPassed
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                      ? "bg-amber-400 text-slate-950 font-black"
                      : "bg-zinc-200 text-zinc-500"
                    }`}>
                    {isPassed ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : s.step}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black leading-tight">{s.title}</div>
                    <div className="text-[10px] font-semibold opacity-85">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MAIN WORKBENCH CONTENT */}
      {/* ========================================================================= */}
      <main className={`relative z-10 w-full transition-all ${isSubmitted
          ? "flex flex-col items-center justify-center max-w-4xl mx-auto py-8 px-4"
          : `py-3.5 space-y-3.5 flex-1 ${editorRefPanel && viewState === "editor" ? "px-2 sm:px-4 lg:px-6" : "px-4 sm:px-6"}`
        } ${showClaimBillModal ? "print:hidden" : ""}`}>

        {!isSubmitted ? (
          <>
            {/* Floating Draft Saved Notification Toast */}
            {draftToast && (
              <div className="fixed bottom-6 right-6 z-[9999] max-w-md bg-emerald-950 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="p-1.5 rounded-xl bg-emerald-500 text-slate-950 shrink-0 mt-0.5">
                  <BookmarkCheck className="h-5 w-5" />
                </div>
                <div className="flex-1 text-xs font-semibold leading-relaxed">
                  <p className="font-extrabold text-emerald-300 text-sm mb-0.5 flex items-center gap-1.5">
                    <span>Draft Saved</span>
                    <span className="text-[10px] bg-emerald-800 text-emerald-200 px-1.5 py-0.2 rounded font-mono font-normal">
                      {lastDraftSavedAt}
                    </span>
                  </p>
                  <p className="text-emerald-100/90">{draftToast}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftToast(null)}
                  className="text-emerald-400 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}


            {/* ASSIGNED SUBJECT BANNER CARD (1st Palette Rich Gradient) */}
            {assignment ? (
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-[#120c7a] to-indigo-950 p-4 sm:p-5 lg:p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 sm:gap-6 border border-blue-800/40">

                {/* Background Decorative Crest Accent */}
                <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 opacity-10 pointer-events-none">
                  <Landmark className="h-96 w-96 text-white" />
                </div>

                <div className="space-y-2 relative z-10 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                      <Award className="h-3.5 w-3.5 text-amber-300" /> End Semester Examination {effectiveExamSession}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                      Batch: {assignment.batch}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                      Regulation: R-{assignment.regulation}
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                    <span className="text-amber-300 font-mono mr-2">{assignment.subjectCode}</span>
                    {assignment.subjectTitle}
                  </h2>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-100/90 font-medium pt-1 border-t border-white/15">
                    <span className="flex items-center gap-1.5">
                      <strong className="text-blue-200 font-semibold">Department:</strong>
                      <span className="text-white font-bold">{assignment.department}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="text-blue-200 font-semibold">Total Marks:</strong>
                      <span className="text-amber-300 font-bold">{currentQp.maxMarks} Marks</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="text-blue-200 font-semibold">Duration:</strong>
                      <span className="text-white font-bold">{currentQp.duration}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="text-blue-200 font-semibold">Assigned Sets:</strong>
                      <span className="text-emerald-300 font-bold">
                        {Number(assignment.numSets) === 2 ? "2 Sets (Set A & B)" : "1 Set (Set A)"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="text-blue-200 font-semibold">Remuneration:</strong>
                      <span className="text-amber-300 font-bold">
                        {Number(assignment.numSets) === 2 ? "₹3,000" : "₹2,000"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* IN-PAGE ACTIONS */}
                <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">

                  <button
                    type="button"
                    onClick={() => setShowOrderModal(true)}
                    className="px-5 py-3 rounded-xl bg-white hover:bg-blue-50 text-[#120c7a] font-black text-xs flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer shrink-0 active:scale-95 border border-white/40"
                  >
                    <Eye className="h-4.5 w-4.5 text-[#120c7a] stroke-[2.5]" />
                    <span>View Appointment Order Copy</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <span>No active setter assignment document found for this session token. Please verify link from Controller of Examinations.</span>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: ACCEPTANCE FORM & APPOINTMENT DECLARATION */}
            {/* ========================================================================= */}
            {viewState === "acceptance" && assignment && (
              <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 shadow-sm space-y-8">

                <div className="border-b border-zinc-100 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black text-[#120c7a] flex items-center gap-2.5">
                      <FileText className="h-6 w-6 text-indigo-600" />
                      End Semester Examination ({effectiveExamSession}) Question Setter Acceptance Form
                    </h2>
                    <p className="text-zinc-500 text-xs font-semibold mt-1">
                      Please review the assignment details, upload your signature, and confirm your interest.
                    </p>
                  </div>

                  {acceptanceSubmitted && (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Acceptance Submitted & Locked
                    </span>
                  )}
                </div>

                {/* Official Acceptance Document Preview Card (1st Palette Crisp White Paper) */}
                <div className="bg-white text-zinc-900 rounded-2xl p-6 sm:p-10 shadow-md border border-zinc-300 font-serif max-w-3xl mx-auto space-y-6 relative overflow-hidden">

                  <div className="text-center border-b border-zinc-200 pb-5 space-y-1.5 flex flex-col items-center">
                    <img
                      src="/logo.png"
                      alt="CKCET Logo"
                      className="h-11 sm:h-12 w-auto max-w-[260px] object-contain mb-1 drop-shadow-2xs"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <h3 className="text-lg font-bold uppercase tracking-wide text-zinc-900 font-serif">Office of The Controller of Examinations</h3>
                    <h4 className="text-xs font-bold text-zinc-600 font-sans">Question Paper Setter Willingness & Acceptance Declaration</h4>
                    <p className="font-sans text-[11px] text-zinc-400 pt-1">
                      Ref No: <span className="font-mono text-zinc-700">COE/ESE-QP/2026/ACC-{assignment.id?.slice(0, 8).toUpperCase() || "78912"}</span>
                    </p>
                  </div>

                  <div className="text-xs space-y-3 leading-relaxed text-zinc-800 font-serif">
                    <p>
                      I, <strong className="text-zinc-900 font-semibold">{authenticatedSetter.name}</strong>,
                      working as Faculty at <strong className="text-zinc-900 font-semibold">{authenticatedSetter.collegeName || "Invited Institution"}</strong>,
                      hereby acknowledge receipt of the appointment order for setting the End Semester Examination ({effectiveExamSession}) Question Paper
                      ({Number(assignment.numSets) === 2 ? "2 Sets - Set A & Set B" : "1 Set - Set A"})
                      for the course <strong className="text-zinc-900 font-semibold">{assignment.subjectCode} - {assignment.subjectTitle}</strong>
                      (Regulation R-{assignment.regulation}, Batch {assignment.batch}).
                    </p>
                    <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-sans font-semibold text-[11px]">
                      Remuneration Rate: {Number(assignment.numSets) === 2
                        ? "Rs. 3,000/- for setting two Question Papers (Set A & Set B)"
                        : "Rs. 2,000/- for setting a single Question Paper (Set A)"}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-sans italic border-l-2 border-[#120c7a] pl-3">
                      I undertake to maintain complete secrecy and confidentiality of the question paper framed by me in accordance with the regulations prescribed by the Controller of Examinations.
                    </p>
                  </div>

                  {/* Willingness Option Radios */}
                  <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3 font-sans">
                    <span className="text-xs font-extrabold text-zinc-900 block uppercase tracking-wider">
                      Willingness Option:
                    </span>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all flex-1 text-xs font-bold ${interestStatus === "Interested"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs"
                        : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300"
                        }`}>
                        <input
                          type="radio"
                          name="interest"
                          value="Interested"
                          checked={interestStatus === "Interested"}
                          onChange={(e) => setInterestStatus(e.target.value)}
                          disabled={acceptanceSubmitted}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Yes, I am Interested to set the End Semester Examination ({effectiveExamSession}) Question Paper</span>
                      </label>

                      <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all flex-1 text-xs font-bold ${interestStatus === "Not Interested"
                        ? "bg-rose-50 border-rose-500 text-rose-950 shadow-xs"
                        : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300"
                        }`}>
                        <input
                          type="radio"
                          name="interest"
                          value="Not Interested"
                          checked={interestStatus === "Not Interested"}
                          onChange={(e) => setInterestStatus(e.target.value)}
                          disabled={acceptanceSubmitted}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span>No, Not Interested</span>
                      </label>
                    </div>
                  </div>

                  {/* Digital Signature Upload & Display */}
                  {interestStatus === "Interested" && (
                    <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3 font-sans">
                      <span className="text-xs font-bold text-zinc-900 block">
                        Upload Signature Image:
                      </span>

                      {!acceptanceSubmitted && (
                        <div>
                          <input
                            type="file"
                            id="sig-upload-input"
                            accept="image/*"
                            onChange={handleSignatureFileChange}
                            className="hidden"
                          />
                          <label
                            htmlFor="sig-upload-input"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#120c7a] hover:bg-[#0e0a60] text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-md transition-all"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Upload Signature</span>
                          </label>

                          <p className="text-[11px] text-slate-500 font-medium mt-1">
                            Supports PNG, JPG and JPEG formats only
                          </p>

                          <p className="text-[11px] text-zinc-500 font-semibold italic mt-1 flex items-center justify-between">
                            <span>It is used for question paper purpose only</span>
                            <span className="text-amber-700 font-bold not-italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Max size: 30 KB</span>
                          </p>
                        </div>
                      )}

                      {/* Render Signature Image */}
                      {signatureUrl && (
                        <div className="pt-2">
                          <span className="text-[10px] text-zinc-500 block uppercase font-bold">Uploaded Signature Preview:</span>
                          <div className="mt-1 p-2 bg-white rounded-lg border border-zinc-300 inline-block">
                            <img
                              src={signatureUrl}
                              alt="Signature Preview"
                              className="h-14 object-contain max-w-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Acceptance Action Footer */}
                  <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
                    {acceptanceSubmitted ? (
                      <div className="flex items-center gap-2 text-emerald-800 text-xs font-extrabold bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 w-full justify-center">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Acceptance Form Submitted & Saved</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleSubmitAcceptance}
                        disabled={uploadingSig}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                      >
                        {uploadingSig ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Submitting Acceptance...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Submit Acceptance Form</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* UNLOCK START TO PREPARE QUESTION PAPER BUTTON */}
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setViewState(assignment?.status === "submitted" ? "preview" : "editor")}
                    disabled={!acceptanceSubmitted || interestStatus !== "Interested"}
                    className={`px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center gap-3 shadow-xl cursor-pointer ${acceptanceSubmitted && interestStatus === "Interested"
                      ? "bg-[#120c7a] hover:bg-[#0e0a60] text-white shadow-indigo-900/30 active:scale-95"
                      : "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                      }`}
                  >
                    <Sparkles className="h-5 w-5 text-amber-400" />
                    <span>
                      {assignment?.status === "submitted"
                        ? "View Submitted Question Paper"
                        : "Start to Prepare Question Paper"}
                    </span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: QUESTION PAPER PREPARATION WORKBENCH (SIDE-BY-SIDE DUAL PANE) */}
            {/* ========================================================================= */}
            {viewState === "editor" && (
              <div className={`w-full mx-auto transition-all duration-300 ${editorRefPanel ? "max-w-none w-full" : "max-w-7xl"}`}>
                <div className="flex flex-col lg:flex-row items-start gap-5 w-full">

                  {/* Left Column: ESE Question Paper Editor */}
                  <div className={`space-y-5 min-w-0 transition-all ${editorRefPanel ? "w-full lg:w-[52%] xl:w-[53%] 2xl:w-[54%] shrink-0" : "flex-1 w-full"}`}>

                    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-6">
                      {/* Image Limit Guideline Banner matching Image 1 */}
                      <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/90 text-blue-900 text-xs font-semibold flex items-center gap-2.5 shadow-2xs">
                        <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
                          <Camera className="h-4 w-4" />
                        </div>
                        <span>
                          <strong>Image Limit Guideline:</strong> Question diagrams & images are automatically optimized to <strong>≤30KB</strong> per image to keep paper generation fast and reliable.
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
                        <div>
                          <h2 className="text-lg font-black text-[#120c7a] flex items-center gap-2">
                            <Edit3 className="h-5 w-5 text-indigo-600" />
                            ESE Question Paper Editor
                          </h2>
                          <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                            Structured text editor according to ESE Pattern ({currentQp.maxMarks} Marks). Fill questions and proceed to Preview below.
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                          {/* Side-by-Side Reference Toggle Button */}
                          {editorRefPanel ? (
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel(null)}
                              className={`text-[11px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border ${
                                editorRefPanel === "guidelines"
                                  ? "text-purple-950 bg-purple-50 hover:bg-purple-100 border-purple-300"
                                  : editorRefPanel === "syllabus"
                                    ? "text-[#120c7a] bg-blue-50 hover:bg-blue-100 border-blue-300"
                                    : "text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300"
                              }`}
                              title="Click to hide reference panel for full-width editor"
                            >
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>
                                Side-by-Side: {editorRefPanel === "guidelines" ? "Guidelines" : editorRefPanel === "syllabus" ? "Syllabus" : "Question Bank"} (Active)
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel("guidelines")}
                              className="text-[11px] font-bold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-300 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                              title="Open Guidelines side-by-side with Editor"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                              <span>Open Side-by-Side Guidelines</span>
                            </button>
                          )}

                          {lastDraftSavedAt ? (
                            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Draft saved at {lastDraftSavedAt}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                              <BookmarkCheck className="h-3.5 w-3.5 text-zinc-400" />
                              <span>Auto-draft enabled • Ctrl+S to save</span>
                            </span>
                          )}

                          <span className="text-[11px] font-extrabold text-[#120c7a] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl shadow-2xs">
                            Regulation: {assignment?.regulation || "AU - R2021"}
                          </span>
                        </div>
                      </div>

                      {/* Dual Paper Switcher for Editor (Set A vs Set B) */}
                      {isNumSetsTwo && (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2 p-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 shadow-2xs">
                            <span className="text-xs font-black text-[#120c7a] px-2 flex items-center gap-1.5">
                              <Layers className="h-4 w-4" /> Active Question Paper:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSwitchSet("setA")}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeSet === "setA" ? "bg-[#120c7a] text-white shadow-sm ring-2 ring-blue-400/30" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"}`}
                            >
                              <span>Paper Set A (Paper 1)</span>
                              {paperStatusA.isAllComplete ? (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {paperStatusA.totalQuestions}/{paperStatusA.totalQuestions} Complete ✓
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                                  {paperStatusA.missedQuestions.length} Missed
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSwitchSet("setB")}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeSet === "setB" ? "bg-[#120c7a] text-white shadow-sm ring-2 ring-blue-400/30" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"}`}
                            >
                              <span>Paper Set B (Paper 2)</span>
                              {paperStatusB?.isAllComplete ? (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {paperStatusB.totalQuestions}/{paperStatusB.totalQuestions} Complete ✓
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                                  {paperStatusB?.missedQuestions.length || 0} Missed
                                </span>
                              )}
                            </button>
                            <span className="ml-auto text-[11px] font-bold text-indigo-900 bg-white px-2.5 py-1 rounded-lg border border-indigo-100">
                              Currently Editing: <strong className="text-[#120c7a]">{activeSet === "setA" ? "Set A" : "Set B"}</strong>
                            </span>
                          </div>

                          {/* Guidance banner for dual sets */}
                          {activeSet === "setB" && isChecklistCompleteA && (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between gap-3 shadow-2xs">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span>Question Paper Set A is verified (12/12) ✓. Currently generating & preparing <strong>Question Paper Set B</strong>.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSwitchSet("setA")}
                                className="text-[11px] underline text-[#120c7a] font-extrabold hover:text-indigo-800 cursor-pointer shrink-0"
                              >
                                Switch back to Edit Set A
                              </button>
                            </div>
                          )}
                          {activeSet === "setA" && isChecklistCompleteA && (
                            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-[#120c7a] flex items-center justify-between gap-3 shadow-2xs">
                              <div className="flex items-center gap-2">
                                <Info className="h-4 w-4 text-[#120c7a] shrink-0" />
                                <span>Set A checklist is verified ✓. You can modify Set A questions anytime before final submission to COE.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSwitchSet("setB")}
                                className="px-3 py-1 bg-[#120c7a] text-white rounded-lg text-xs font-black shadow-xs hover:bg-[#0e0a60] cursor-pointer shrink-0"
                              >
                                Switch to Set B →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Real-time Missed Questions Indicator & Quick Jump Palette */}
                      {!paperStatus.isAllComplete && paperStatus.missedQuestions.length > 0 ? (
                        <div className="p-4 rounded-3xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-xs space-y-3 animate-in fade-in duration-300 font-sans">
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 bg-amber-200 text-amber-900 rounded-xl shrink-0">
                                <AlertTriangle className="h-4 w-4 text-amber-800" />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-amber-950">
                                  {paperStatus.missedQuestions.length} Missed Question(s) Detected in {activeSet === "setA" ? "Set A" : "Set B"}
                                </h4>
                                <p className="text-[11px] text-amber-800 font-medium">
                                  Please complete question text, choices, or marks to avoid submission blocks to COE.
                                </p>
                              </div>
                            </div>
                            <span className="text-[11px] font-mono font-bold bg-amber-200/80 text-amber-950 px-2.5 py-1 rounded-xl border border-amber-300/80">
                              {paperStatus.completedCount} of {paperStatus.totalQuestions} Questions Completed
                            </span>
                          </div>

                          {/* Interactive Jump Pills */}
                          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-amber-200/80">
                            <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 shrink-0">
                              Click to Jump & Fill:
                            </span>
                            {paperStatus.missedQuestions.map((mq) => (
                              <button
                                key={mq.qNo}
                                type="button"
                                onClick={() => scrollToQuestion(mq.qNo)}
                                className="px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100 text-amber-950 text-xs font-black border border-amber-300 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 hover:border-amber-400"
                                title={mq.missingReasons.join(" • ")}
                              >
                                <span className="font-mono text-[#120c7a]">Q.{mq.qNo}</span>
                                <span className="text-[10px] text-amber-800 font-medium">({mq.missingReasons[0]})</span>
                                <ArrowRight className="h-3 w-3 text-amber-600" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : paperStatus.isAllComplete ? (
                        <div className="p-3 px-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>All {paperStatus.totalQuestions} questions in {activeSet === "setA" ? "Set A" : "Set B"} are complete and ready for review! ✓</span>
                          </div>
                          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md font-extrabold">
                            100% Filled
                          </span>
                        </div>
                      ) : null}

                      {/* Permitted Materials Configuration Card (Tables, Charts, Data Books, Drawing Sheets, Graph Sheets, Code Books) */}
                      <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-b from-indigo-50/40 via-white to-slate-50/30 p-4 sm:p-5 shadow-xs space-y-4 font-sans">
                        {/* Header Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100 pb-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#120c7a] text-white flex items-center justify-center shadow-xs shrink-0">
                              <Package className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-black text-[#120c7a] text-sm sm:text-base tracking-tight flex items-center gap-2">
                                  <span>Permitted Examination Materials</span>
                                  {isNumSetsTwo && (
                                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                      ({activeSet === "setB" ? "Set B" : "Set A"})
                                    </span>
                                  )}
                                </h3>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  permittedMaterials.enabled
                                    ? "bg-purple-100 text-purple-900 border-purple-300"
                                    : "bg-zinc-100 text-zinc-600 border-zinc-200"
                                }`}>
                                  {permittedMaterials.enabled ? "Active for Exam Hall" : "Standard Exam"}
                                </span>
                              </div>
                              <p className="text-zinc-500 text-xs font-medium mt-0.5">
                                Specify if candidates require Tables, Charts, Data Books, Drawing Sheets, Graph Papers, or Code Books for {isNumSetsTwo ? (activeSet === "setB" ? "Set B" : "Set A") : "this question paper"}.
                              </p>
                            </div>
                          </div>

                          {/* Master Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => handleUpdatePermittedMaterials({ enabled: !permittedMaterials.enabled })}
                            className={`flex items-center gap-3 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer self-start sm:self-auto select-none ${
                              permittedMaterials.enabled
                                ? "bg-[#120c7a] text-white border-[#120c7a] shadow-xs"
                                : "bg-white text-zinc-700 border-zinc-300 hover:border-indigo-300 hover:bg-indigo-50/40"
                            }`}
                          >
                            <span className="font-extrabold tracking-wide">
                              {permittedMaterials.enabled ? "Provide Permitted Materials" : "Provide Permitted Materials"}
                            </span>
                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                              permittedMaterials.enabled ? "bg-white/30" : "bg-zinc-300"
                            }`}>
                              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                                permittedMaterials.enabled ? "translate-x-4" : "translate-x-0"
                              }`} />
                            </div>
                          </button>
                        </div>

                        {!permittedMaterials.enabled ? (
                          <div className="p-3.5 rounded-xl bg-white border border-indigo-100 text-zinc-600 text-xs font-medium flex items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-2.5">
                              <Info className="h-4 w-4 text-indigo-600 shrink-0" />
                              <span>
                                Standard Autonomous Protocol: No external reference materials required for this course. Click <strong>"Provide Permitted Materials"</strong> above if this subject allows specific reference materials in the exam hall.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4 animate-in fade-in duration-300">
                            {/* Materials 2-Column Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                              {/* 1. Tables */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.tables?.allowed
                                  ? "bg-white border-blue-400 ring-2 ring-blue-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-blue-300 hover:bg-blue-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.tables?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      tables: {
                                        ...prev.tables,
                                        allowed: nextAllowed,
                                        details: nextAllowed ? (prev.tables?.details || "Steam Tables (MKS/SI Units)") : prev.tables?.details
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.tables?.allowed)}
                                      onChange={() => {}} // handled by parent div click
                                      className="h-4 w-4 rounded text-blue-600 border-zinc-300 focus:ring-blue-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                                      <TableIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        1. Approved Tables
                                      </span>
                                      {!permittedMaterials.tables?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          Steam, thermodynamic, statistical tables
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.tables?.allowed
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.tables?.allowed ? "Allowed ✓" : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.tables?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={permittedMaterials.tables?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          tables: { ...prev.tables, details }
                                        }));
                                      }}
                                      placeholder="e.g. Steam Tables (MKS/SI Units), Mathematical Tables"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <span className="text-zinc-500 font-bold">Suggestions:</span>
                                      {["Steam Tables", "Statistical Tables (Normal, t, F)", "Mathematical Tables", "Thermodynamic Tables"].map((suggestion) => (
                                        <button
                                          key={suggestion}
                                          type="button"
                                          onClick={() => {
                                            handleUpdatePermittedMaterials((prev) => ({
                                              tables: { ...prev.tables, details: suggestion }
                                            }));
                                          }}
                                          className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-semibold cursor-pointer transition-all"
                                        >
                                          + {suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 2. Charts */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.charts?.allowed
                                  ? "bg-white border-cyan-400 ring-2 ring-cyan-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-cyan-300 hover:bg-cyan-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.charts?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      charts: {
                                        ...prev.charts,
                                        allowed: nextAllowed,
                                        details: nextAllowed ? (prev.charts?.details || "Psychrometric Chart") : prev.charts?.details
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.charts?.allowed)}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded text-cyan-600 border-zinc-300 focus:ring-cyan-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-800 flex items-center justify-center shrink-0">
                                      <LineChart className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        2. Approved Charts
                                      </span>
                                      {!permittedMaterials.charts?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          Psychrometric, Mollier, Smith charts
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.charts?.allowed
                                      ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.charts?.allowed ? "Allowed ✓" : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.charts?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={permittedMaterials.charts?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          charts: { ...prev.charts, details }
                                        }));
                                      }}
                                      placeholder="e.g. Psychrometric Chart, Mollier Diagram"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 bg-white"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <span className="text-zinc-500 font-bold">Suggestions:</span>
                                      {["Psychrometric Chart", "Mollier Diagram", "Smith Chart", "Moody Diagram"].map((suggestion) => (
                                        <button
                                          key={suggestion}
                                          type="button"
                                          onClick={() => {
                                            handleUpdatePermittedMaterials((prev) => ({
                                              charts: { ...prev.charts, details: suggestion }
                                            }));
                                          }}
                                          className="px-2 py-0.5 rounded-md bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 font-semibold cursor-pointer transition-all"
                                        >
                                          + {suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 3. Data Books */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.dataBooks?.allowed
                                  ? "bg-white border-purple-400 ring-2 ring-purple-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-purple-300 hover:bg-purple-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.dataBooks?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      dataBooks: {
                                        ...prev.dataBooks,
                                        allowed: nextAllowed,
                                        details: nextAllowed ? (prev.dataBooks?.details || "Design Data Book (PSG College of Technology)") : prev.dataBooks?.details
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.dataBooks?.allowed)}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded text-purple-600 border-zinc-300 focus:ring-purple-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                                      <BookMarked className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        3. Data Books
                                      </span>
                                      {!permittedMaterials.dataBooks?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          PSG Design Data Book, HMT Data Book
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.dataBooks?.allowed
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.dataBooks?.allowed ? "Allowed ✓" : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.dataBooks?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={permittedMaterials.dataBooks?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          dataBooks: { ...prev.dataBooks, details }
                                        }));
                                      }}
                                      placeholder="e.g. Design Data Book (PSG College of Tech), HMT Data Book"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <span className="text-zinc-500 font-bold">Suggestions:</span>
                                      {["Design Data Book (PSG College of Tech)", "HMT Data Book (Kothandaraman)", "Refrigeration & AC Data Book", "PSG Data Book & Steam Tables"].map((suggestion) => (
                                        <button
                                          key={suggestion}
                                          type="button"
                                          onClick={() => {
                                            handleUpdatePermittedMaterials((prev) => ({
                                              dataBooks: { ...prev.dataBooks, details: suggestion }
                                            }));
                                          }}
                                          className="px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-semibold cursor-pointer transition-all"
                                        >
                                          + {suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 4. Drawing Sheets */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.drawingSheets?.allowed
                                  ? "bg-white border-amber-400 ring-2 ring-amber-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-amber-300 hover:bg-amber-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.drawingSheets?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      drawingSheets: {
                                        ...prev.drawingSheets,
                                        allowed: nextAllowed,
                                        sheetSize: prev.drawingSheets?.sheetSize || "A3",
                                        sheetCount: prev.drawingSheets?.sheetCount || 1,
                                        details: prev.drawingSheets?.details || "For Machine Drawing / Engineering Graphics"
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.drawingSheets?.allowed)}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded text-amber-600 border-zinc-300 focus:ring-amber-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                                      <Grid className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        4. Drawing Sheets
                                      </span>
                                      {!permittedMaterials.drawingSheets?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          A2, A3, A4 sheets for graphics/drawings
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.drawingSheets?.allowed
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.drawingSheets?.allowed
                                      ? `${permittedMaterials.drawingSheets.sheetSize || "A3"} (${permittedMaterials.drawingSheets.sheetCount || 1} No.)`
                                      : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.drawingSheets?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Sheet Size</label>
                                        <select
                                          value={permittedMaterials.drawingSheets?.sheetSize || "A3"}
                                          onChange={(e) => {
                                            const sheetSize = e.target.value;
                                            handleUpdatePermittedMaterials((prev) => ({
                                              drawingSheets: { ...prev.drawingSheets, sheetSize }
                                            }));
                                          }}
                                          className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-zinc-300 bg-white"
                                        >
                                          <option value="A2">A2 Sheet (420 x 594 mm)</option>
                                          <option value="A3">A3 Sheet (297 x 420 mm)</option>
                                          <option value="A4">A4 Sheet</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Sheets Per Student</label>
                                        <select
                                          value={permittedMaterials.drawingSheets?.sheetCount || 1}
                                          onChange={(e) => {
                                            const sheetCount = Number(e.target.value) || 1;
                                            handleUpdatePermittedMaterials((prev) => ({
                                              drawingSheets: { ...prev.drawingSheets, sheetCount }
                                            }));
                                          }}
                                          className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-zinc-300 bg-white"
                                        >
                                          <option value="1">1 Sheet</option>
                                          <option value="2">2 Sheets</option>
                                          <option value="3">3 Sheets</option>
                                          <option value="4">4 Sheets</option>
                                        </select>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={permittedMaterials.drawingSheets?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          drawingSheets: { ...prev.drawingSheets, details }
                                        }));
                                      }}
                                      placeholder="Notes (e.g. For Engineering Graphics / Machine Drawing)"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-amber-500 bg-white"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* 5. Graph Paper */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.graphSheets?.allowed
                                  ? "bg-white border-emerald-400 ring-2 ring-emerald-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.graphSheets?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      graphSheets: {
                                        ...prev.graphSheets,
                                        allowed: nextAllowed,
                                        graphType: prev.graphSheets?.graphType || "Ordinary Graph Sheet (1cm)",
                                        sheetCount: prev.graphSheets?.sheetCount || 1,
                                        details: prev.graphSheets?.details || "For curves / plotting"
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.graphSheets?.allowed)}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded text-emerald-600 border-zinc-300 focus:ring-emerald-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                                      <Grid className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        5. Graph Paper
                                      </span>
                                      {!permittedMaterials.graphSheets?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          Ordinary, Semi-log, Log-log, Polar
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.graphSheets?.allowed
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.graphSheets?.allowed
                                      ? `${permittedMaterials.graphSheets.graphType?.replace("Graph Sheet", "").trim() || "Graph"} (${permittedMaterials.graphSheets.sheetCount || 1} No.)`
                                      : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.graphSheets?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Graph Paper Type</label>
                                        <select
                                          value={permittedMaterials.graphSheets?.graphType || "Ordinary Graph Sheet (1cm)"}
                                          onChange={(e) => {
                                            const graphType = e.target.value;
                                            handleUpdatePermittedMaterials((prev) => ({
                                              graphSheets: { ...prev.graphSheets, graphType }
                                            }));
                                          }}
                                          className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-zinc-300 bg-white"
                                        >
                                          <option value="Ordinary Graph Sheet (1cm)">Ordinary Graph Sheet (1cm / 2mm)</option>
                                          <option value="Semi-log Sheet (1 Cycle)">Semi-log Sheet (1 Cycle)</option>
                                          <option value="Semi-log Sheet (2 Cycle)">Semi-log Sheet (2 Cycles)</option>
                                          <option value="Semi-log Sheet (3 Cycle)">Semi-log Sheet (3 Cycles)</option>
                                          <option value="Log-log Graph Sheet">Log-log Graph Sheet</option>
                                          <option value="Polar Graph Sheet">Polar Graph Sheet</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Sheets Per Student</label>
                                        <select
                                          value={permittedMaterials.graphSheets?.sheetCount || 1}
                                          onChange={(e) => {
                                            const sheetCount = Number(e.target.value) || 1;
                                            handleUpdatePermittedMaterials((prev) => ({
                                              graphSheets: { ...prev.graphSheets, sheetCount }
                                            }));
                                          }}
                                          className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-zinc-300 bg-white"
                                        >
                                          <option value="1">1 Sheet</option>
                                          <option value="2">2 Sheets</option>
                                          <option value="3">3 Sheets</option>
                                        </select>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={permittedMaterials.graphSheets?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          graphSheets: { ...prev.graphSheets, details }
                                        }));
                                      }}
                                      placeholder="Notes (e.g. For Bode plot / Root locus / Frequency response)"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-emerald-500 bg-white"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* 6. Code Books */}
                              <div className={`rounded-xl border transition-all ${
                                permittedMaterials.codeBooks?.allowed
                                  ? "bg-white border-indigo-400 ring-2 ring-indigo-100 shadow-xs p-3.5 space-y-3"
                                  : "bg-white border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/20 p-2.5"
                              }`}>
                                <div
                                  onClick={() => {
                                    const nextAllowed = !permittedMaterials.codeBooks?.allowed;
                                    handleUpdatePermittedMaterials((prev) => ({
                                      codeBooks: {
                                        ...prev.codeBooks,
                                        allowed: nextAllowed,
                                        details: nextAllowed ? (prev.codeBooks?.details || "IS 456 - 2000") : prev.codeBooks?.details
                                      }
                                    }));
                                  }}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(permittedMaterials.codeBooks?.allowed)}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500 cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                                      <FileCode2 className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-zinc-900 block truncate">
                                        6. Standard Code Books
                                      </span>
                                      {!permittedMaterials.codeBooks?.allowed && (
                                        <span className="text-[11px] text-zinc-400 font-medium block truncate">
                                          IS 456, IS 800, SP 16, IRC codes
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                                    permittedMaterials.codeBooks?.allowed
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                  }`}>
                                    {permittedMaterials.codeBooks?.allowed ? "Allowed ✓" : "+ Allow"}
                                  </span>
                                </div>

                                {permittedMaterials.codeBooks?.allowed && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={permittedMaterials.codeBooks?.details || ""}
                                      onChange={(e) => {
                                        const details = e.target.value;
                                        handleUpdatePermittedMaterials((prev) => ({
                                          codeBooks: { ...prev.codeBooks, details }
                                        }));
                                      }}
                                      placeholder="e.g. IS 456 - 2000, IS 800 - 2007, SP 16"
                                      className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <span className="text-zinc-500 font-bold">Suggestions:</span>
                                      {["IS 456 - 2000", "IS 800 - 2007", "SP 16", "IS 875", "IRC 37 / IRC 58", "NBC"].map((suggestion) => (
                                        <button
                                          key={suggestion}
                                          type="button"
                                          onClick={() => {
                                            handleUpdatePermittedMaterials((prev) => ({
                                              codeBooks: { ...prev.codeBooks, details: suggestion }
                                            }));
                                          }}
                                          className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold cursor-pointer transition-all"
                                        >
                                          + {suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Special Instructions for Exam Hall */}
                            <div className="p-3.5 rounded-xl bg-white border border-zinc-200 space-y-1.5">
                              <label className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                                <Info className="h-3.5 w-3.5 text-zinc-500" />
                                Special Instructions for Exam Hall & Chief Superintendent (Optional):
                              </label>
                              <textarea
                                rows={2}
                                value={permittedMaterials.specialInstructions || ""}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  handleUpdatePermittedMaterials({ specialInstructions: text });
                                }}
                                placeholder="e.g. Only approved non-programmable scientific calculators permitted. Data books must not contain any handwritten formulas."
                                className="w-full text-xs font-medium p-2.5 rounded-lg border border-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            {/* Live Notice Banner on Question Paper */}
                            {formatPermittedMaterialsNotice(permittedMaterials) && (
                              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
                                <span className="p-1 bg-amber-200 text-amber-900 rounded-md shrink-0 mt-0.5">
                                  <FileCheck className="h-3.5 w-3.5" />
                                </span>
                                <div>
                                  <span className="font-extrabold uppercase tracking-wider text-[10px] text-amber-800 block">
                                    Official Notice Rendered on Question Paper:
                                  </span>
                                  <span className="font-serif font-bold text-zinc-900 text-xs mt-0.5 block">
                                    {formatPermittedMaterialsNotice(permittedMaterials)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Dynamic Sections & Question Inputs */}
                      <div className="space-y-8">
                        {currentQp.sections?.map((sec, secIdx) => (
                          <div key={sec.id || secIdx} className="p-5 rounded-3xl bg-zinc-50 border border-zinc-200 space-y-4">
                            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                              <div>
                                <h3 className="font-black text-[#120c7a] text-base">{sec.name}</h3>
                                <p className="text-xs font-semibold text-zinc-500">{sec.instructions}</p>
                              </div>
                              <span className="text-xs font-mono bg-white border border-zinc-200 px-3 py-1 rounded-xl text-emerald-700 font-extrabold shadow-xs">
                                {sec.questions?.length || 0} Questions
                              </span>
                            </div>

                            <div className="space-y-4">
                              {sec.questions?.map((q, qIdx) => {
                                const qStatus = getQuestionMissingStatus(q);
                                const isSubpartsAllowed = Boolean(
                                  sec.allowSubparts !== undefined
                                    ? sec.allowSubparts
                                    : (assignedPattern?.sections?.find(s => s.id === sec.id || s.name === sec.name)?.allowSubparts ?? (sec.marksPerQ >= 10))
                                );

                                return (
                                  <div
                                    key={qIdx}
                                    id={`question-card-${q.qNo}`}
                                    className={`p-4 rounded-2xl bg-white border shadow-xs space-y-3 transition-all duration-500 ${!qStatus.isComplete
                                      ? "border-amber-300 ring-2 ring-amber-200/70 bg-amber-50/15"
                                      : "border-zinc-200"
                                      }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold text-[#120c7a] text-xs">
                                          Question #{q.qNo} {q.optionB !== undefined ? "(a)" : ""}
                                        </span>

                                        {/* Live Completion / Missed Question Badge */}
                                        {qStatus.isComplete ? (
                                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                            Complete
                                          </span>
                                        ) : (
                                          <span
                                            className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300 flex items-center gap-1 animate-pulse"
                                            title={qStatus.missingReasons.join(" • ")}
                                          >
                                            <AlertTriangle className="h-3 w-3 text-amber-700" />
                                            Missed: {qStatus.missingReasons[0]}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {/* Bloom's Selector (strictly K1 to K5) */}
                                        <select
                                          value={q.blooms || "K1"}
                                          onChange={(e) => handleUpdateQuestionMeta(secIdx, qIdx, "blooms", e.target.value)}
                                          className="bg-amber-50 border border-amber-200 text-xs text-amber-900 font-extrabold rounded-lg px-2.5 py-1 cursor-pointer hover:border-amber-400 transition-colors shadow-2xs"
                                          title="Select Bloom's Taxonomy Cognitive Level (K1 to K5)"
                                        >
                                          {bloomsLevels.map((lvl) => (
                                            <option key={lvl.code} value={lvl.code}>
                                              {lvl.code} - {lvl.name}
                                            </option>
                                          ))}
                                        </select>

                                        {/* Locked CO Badge (Configured by COE in Pattern - Read Only) */}
                                        <div
                                          className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs font-black text-[#120c7a] flex items-center gap-1 select-none shadow-2xs"
                                          title="Assigned Course Outcome (CO) from Question Pattern (Locked by COE)"
                                        >
                                          <span className="text-[10px] font-bold text-blue-500 uppercase">CO:</span>
                                          <span>{q.co || `CO${(qIdx % 5) + 1}`}</span>
                                          <Lock className="h-3 w-3 text-blue-400 ml-0.5" />
                                        </div>

                                        {/* Locked Question Marks Badge (Configured by COE in Pattern - Read Only) */}
                                        <div
                                          className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-black text-emerald-800 flex items-center gap-1 select-none shadow-2xs"
                                          title="Question Marks assigned by COE (Locked - Mark edits are only applicable for sub-parts)"
                                        >
                                          <span>{q.marks || sec.marksPerQ || 2}</span>
                                          <span className="text-[10px] font-bold text-emerald-600">Marks</span>
                                          <Lock className="h-3 w-3 text-emerald-400 ml-0.5" />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Question Text Area / Sub-parts Area */}
                                    <div className="space-y-3">
                                      {isSubpartsAllowed ? (
                                        /* Split Question Toggle & Controls for Option A when subparts is allowed */
                                        <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-3 font-sans">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <label className="text-xs font-black text-[#120c7a] uppercase flex items-center gap-1.5">
                                              <Split className="h-3.5 w-3.5 text-[#120c7a]" />
                                              Are you willing to split Question {q.qNo}{q.optionB !== undefined ? '(a)' : ''} into sub-parts?
                                            </label>

                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => handleToggleSplitQuestion(secIdx, qIdx, false, false)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${!q.isSplit ? "bg-[#120c7a] text-white shadow-xs" : "bg-white text-zinc-700 border border-zinc-300"
                                                  }`}
                                              >
                                                No (Single Question)
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleToggleSplitQuestion(secIdx, qIdx, false, true)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${q.isSplit ? "bg-emerald-600 text-white shadow-xs" : "bg-white text-zinc-700 border border-zinc-300"
                                                  }`}
                                              >
                                                Yes (Split Sub-Parts)
                                              </button>
                                            </div>
                                          </div>

                                          {q.isSplit ? (
                                            <div className="space-y-4 pt-2.5 border-t border-blue-200/70">
                                              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-blue-200">
                                                <span className="text-xs font-bold text-zinc-800">Select Number of Sub-Parts:</span>
                                                <select
                                                  value={q.subCount || q.subParts?.length || 2}
                                                  onChange={(e) => handleChangeSubCount(secIdx, qIdx, false, Number(e.target.value))}
                                                  className="bg-blue-50 border border-blue-300 text-xs font-bold text-[#120c7a] rounded-lg px-2.5 py-1 cursor-pointer"
                                                >
                                                  <option value={2}>2 Sub-Parts (i, ii)</option>
                                                  <option value={3}>3 Sub-Parts (i, ii, iii)</option>
                                                </select>
                                              </div>

                                              {/* Sub-parts CKEditors & Mark Inputs */}
                                              {q.subParts?.map((sub, sIdx) => (
                                                <div key={sub.id || sIdx} className="p-3 bg-white border border-blue-100 rounded-xl space-y-2.5 shadow-2xs">
                                                  <div className="flex items-center justify-between bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                    <span className="text-xs font-black text-[#120c7a] font-mono">
                                                      Sub-part {sub.label || getRomanLabel(sIdx)}
                                                    </span>

                                                    <div className="flex items-center gap-1.5">
                                                      <span className="text-[11px] font-bold text-zinc-600">Marks:</span>
                                                      <input
                                                        type="number"
                                                        min={1}
                                                        max={q.marks || 16}
                                                        value={sub.marks}
                                                        onChange={(e) => handleUpdateSubPartMark(secIdx, qIdx, false, sIdx, Number(e.target.value))}
                                                        className="w-16 bg-emerald-50 border border-emerald-300 text-xs font-extrabold text-emerald-900 rounded-lg px-2 py-1 text-center font-mono"
                                                      />
                                                      <span className="text-xs font-extrabold text-zinc-500">/ {q.marks || 16}</span>
                                                    </div>
                                                  </div>

                                                  <QuestionCKEditor
                                                    id={`sec_${activeSet}_${secIdx}_q_${qIdx}_sub_${sIdx}`}
                                                    value={sub.text || ""}
                                                    onChange={(val) => handleUpdateSubPartText(secIdx, qIdx, false, sIdx, val)}
                                                    placeholder={`Enter text for Sub-part ${sub.label || getRomanLabel(sIdx)}...`}
                                                  />
                                                </div>
                                              ))}

                                              {/* Sub-parts Validation Alert */}
                                              {getSubPartsValidationMsg(q.subParts, q.marks || 16, `${q.qNo}${q.optionB !== undefined ? '(a)' : ''}`) && (
                                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2 animate-shake">
                                                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                                  <span>{getSubPartsValidationMsg(q.subParts, q.marks || 16, `${q.qNo}${q.optionB !== undefined ? '(a)' : ''}`)}</span>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="pt-1">
                                              <QuestionCKEditor
                                                id={`sec_${activeSet}_${secIdx}_q_${qIdx}_main`}
                                                value={q.text || ""}
                                                onChange={(val) => handleUpdateQuestionText(secIdx, qIdx, val)}
                                                placeholder={`Enter text for Question ${q.qNo}${q.optionB !== undefined ? '(a)' : ''}...`}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        /* When subparts is disabled (e.g. Part A), render single question editor directly */
                                        <div className="pt-1">
                                          <QuestionCKEditor
                                            id={`sec_${activeSet}_${secIdx}_q_${qIdx}_main`}
                                            value={q.text || ""}
                                            onChange={(val) => handleUpdateQuestionText(secIdx, qIdx, val)}
                                            placeholder={`Enter text for Question ${q.qNo}${q.optionB !== undefined ? '(a)' : ''}...`}
                                          />
                                        </div>
                                      )}
                                    </div>

                                    {/* Option B for Either-OR Choice questions */}
                                    {q.optionB !== undefined && (
                                      <div className="pt-4 mt-3 border-t-2 border-dashed border-amber-200/80 space-y-3">
                                        <span className="text-xs font-black text-amber-800 uppercase tracking-wider block bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg w-fit">
                                          OR Choice - Option (b) Question Text:
                                        </span>

                                        {isSubpartsAllowed ? (
                                          /* Split Question Toggle & Controls for Option B when subparts is allowed */
                                          <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3 font-sans">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <label className="text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
                                                <Split className="h-3.5 w-3.5 text-amber-700" />
                                                Are you willing to split Question {q.qNo}(b) into sub-parts?
                                              </label>

                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleSplitQuestion(secIdx, qIdx, true, false)}
                                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${!q.isSplitOptionB ? "bg-amber-700 text-white shadow-xs" : "bg-white text-zinc-700 border border-zinc-300"
                                                    }`}
                                                >
                                                  No (Single Question)
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleSplitQuestion(secIdx, qIdx, true, true)}
                                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${q.isSplitOptionB ? "bg-emerald-600 text-white shadow-xs" : "bg-white text-zinc-700 border border-zinc-300"
                                                    }`}
                                                >
                                                  Yes (Split Sub-Parts)
                                                </button>
                                              </div>
                                            </div>

                                            {q.isSplitOptionB ? (
                                              <div className="space-y-4 pt-2.5 border-t border-amber-200/70">
                                                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-amber-200">
                                                  <span className="text-xs font-bold text-zinc-800">Select Number of Sub-Parts:</span>
                                                  <select
                                                    value={q.subCountOptionB || q.subPartsOptionB?.length || 2}
                                                    onChange={(e) => handleChangeSubCount(secIdx, qIdx, true, Number(e.target.value))}
                                                    className="bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 rounded-lg px-2.5 py-1 cursor-pointer"
                                                  >
                                                    <option value={2}>2 Sub-Parts (i, ii)</option>
                                                    <option value={3}>3 Sub-Parts (i, ii, iii)</option>
                                                  </select>
                                                </div>

                                                {/* Sub-parts CKEditors & Mark Inputs */}
                                                {q.subPartsOptionB?.map((sub, sIdx) => (
                                                  <div key={sub.id || sIdx} className="p-3 bg-white border border-amber-100 rounded-xl space-y-2.5 shadow-2xs">
                                                    <div className="flex items-center justify-between bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                                                      <span className="text-xs font-black text-amber-900 font-mono">
                                                        Sub-part {sub.label || getRomanLabel(sIdx)}
                                                      </span>

                                                      <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-bold text-zinc-600">Marks:</span>
                                                        <input
                                                          type="number"
                                                          min={1}
                                                          max={q.marks || 16}
                                                          value={sub.marks}
                                                          onChange={(e) => handleUpdateSubPartMark(secIdx, qIdx, true, sIdx, Number(e.target.value))}
                                                          className="w-16 bg-emerald-50 border border-emerald-300 text-xs font-extrabold text-emerald-900 rounded-lg px-2 py-1 text-center font-mono"
                                                        />
                                                        <span className="text-xs font-extrabold text-zinc-500">/ {q.marks || 16}</span>
                                                      </div>
                                                    </div>

                                                    <QuestionCKEditor
                                                      id={`sec_${activeSet}_${secIdx}_q_${qIdx}_optB_sub_${sIdx}`}
                                                      value={sub.text || ""}
                                                      onChange={(val) => handleUpdateSubPartText(secIdx, qIdx, true, sIdx, val)}
                                                      placeholder={`Enter text for Option (b) Sub-part ${sub.label || getRomanLabel(sIdx)}...`}
                                                    />
                                                  </div>
                                                ))}

                                                {/* Sub-parts Validation Alert */}
                                                {getSubPartsValidationMsg(q.subPartsOptionB, q.marks || 16, `${q.qNo}(b)`) && (
                                                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2 animate-shake">
                                                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                                    <span>{getSubPartsValidationMsg(q.subPartsOptionB, q.marks || 16, `${q.qNo}(b)`)}</span>
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="pt-1">
                                                <QuestionCKEditor
                                                  id={`sec_${activeSet}_${secIdx}_q_${qIdx}_optB_main`}
                                                  value={q.optionB || ""}
                                                  onChange={(val) => handleUpdateOptionBText(secIdx, qIdx, val)}
                                                  placeholder={`Enter Option (b) text for Question ${q.qNo}...`}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          /* When subparts is disabled, render single Option (b) editor directly */
                                          <div className="pt-1">
                                            <QuestionCKEditor
                                              id={`sec_${activeSet}_${secIdx}_q_${qIdx}_optB_main`}
                                              value={q.optionB || ""}
                                              onChange={(val) => handleUpdateOptionBText(secIdx, qIdx, val)}
                                              placeholder={`Enter Option (b) text for Question ${q.qNo}...`}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bottom Navigation: Back to Acceptance & Preview Question Paper */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200 mt-6 font-sans">
                        <button
                          type="button"
                          onClick={() => setViewState("acceptance")}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span>Review Acceptance & Order</span>
                        </button>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
                          {isNumSetsTwo && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!validateAllSplitQuestions()) return;
                                handleSwitchSet(activeSet === "setA" ? "setB" : "setA");
                              }}
                              className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-300 transition-all cursor-pointer shadow-2xs"
                            >
                              <Layers className="h-4 w-4 text-[#120c7a]" />
                              <span>Switch to {activeSet === "setA" ? "Set B" : "Set A"}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSaveDraft(true)}
                            disabled={isSavingDraft}
                            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                            title="Save your progress as draft to resume setting questions anytime"
                          >
                            {isSavingDraft ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>Saving Draft...</span>
                              </>
                            ) : (
                              <>
                                <BookmarkCheck className="h-4 w-4 text-emerald-200" />
                                <span>Save as Draft</span>
                              </>
                            )}
                          </button>

                          {/* Compare with AI Button - Exclusively beside Save Draft for Set 2 (Set B) */}
                          {isNumSetsTwo && activeSet === "setB" && (
                            isSetBModifiedSinceDraft ? (
                              <div className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-center gap-2 shadow-xs">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                <span>Save Set B draft to enable AI Compare</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRunAiSimilarityCheck(true)}
                                disabled={isComparingAi}
                                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-60 border border-purple-400/30"
                                title="AI Permutation Cross-Comparison (Set A vs Set B)"
                              >
                                {isComparingAi ? (
                                  <RefreshCw className="h-4 w-4 animate-spin text-purple-200" />
                                ) : (
                                  <Sparkles className="h-4 w-4 text-amber-300" />
                                )}
                                <span>Compare Set A and Set B</span>
                                {aiSimilarityResult && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0
                                    ? "bg-emerald-400/25 text-emerald-100 border border-emerald-400/40"
                                    : "bg-rose-500/30 text-rose-100 border border-rose-400/40 animate-pulse"
                                    }`}>
                                    {aiSimilarityResult.overallSimilarityPercent}%
                                  </span>
                                )}
                              </button>
                            )
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (!validateAllSplitQuestions()) return;
                              const activePaper = activeSet === "setA" ? syncAllCkEditorsToPaper(qpData, "setA") : syncAllCkEditorsToPaper(qpDataB, "setB");
                              const missingInfo = getPaperMissingQuestions(activePaper, activeSet === "setA" ? "Set A" : "Set B");
                              if (!missingInfo.isAllComplete) {
                                const missedList = missingInfo.missedQuestions.map(m => `Q.${m.qNo}`).join(", ");
                                const proceed = window.confirm(
                                  `Attention: ${missingInfo.missedQuestions.length} question(s) in ${activeSet === "setA" ? "Set A" : "Set B"} are incomplete/missed (${missedList}).\n\nClick "OK" to preview incomplete paper, or "Cancel" to stay in editor and fill missed questions.`
                                );
                                if (!proceed) {
                                  setTimeout(() => scrollToQuestion(missingInfo.missedQuestions[0]?.qNo), 200);
                                  return;
                                }
                              }
                              setViewState("preview");
                            }}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-black text-xs flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer active:scale-95"
                          >
                            <Eye className="h-4 w-4 text-emerald-400" />
                            <span>Preview {isNumSetsTwo ? (isSetB ? "Set B" : "Set A") : "Question Paper"}</span>
                            {!paperStatus.isAllComplete && (
                              <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded-md font-mono">
                                {paperStatus.missedQuestions.length} Missed
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Docked Side-by-Side Reference Panel */}
                  {editorRefPanel && (
                    <aside className="w-full lg:w-[48%] xl:w-[47%] 2xl:w-[46%] flex-1 min-w-0 sticky top-16 self-start z-20">
                      <div className="bg-white border border-zinc-200 rounded-3xl p-3 sm:p-3.5 shadow-sm flex flex-col space-y-2.5 max-h-[calc(100vh-5rem)] overflow-hidden">

                        {/* Panel Header: Tab Switcher & Full Editor Toggle */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 shrink-0 gap-2">
                          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 text-xs font-bold gap-0.5">
                            {/* 1. View Guidelines */}
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel("guidelines")}
                              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${editorRefPanel === "guidelines"
                                ? "bg-purple-700 text-white shadow-2xs font-black"
                                : "text-zinc-600 hover:text-zinc-900"
                                }`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>View Guidelines</span>
                            </button>

                            {/* 2. Syllabus */}
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel("syllabus")}
                              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${editorRefPanel === "syllabus"
                                ? "bg-[#120c7a] text-white shadow-2xs font-black"
                                : "text-zinc-600 hover:text-zinc-900"
                                }`}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>Syllabus</span>
                            </button>

                            {/* 3. Question Bank */}
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel("qb")}
                              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${editorRefPanel === "qb"
                                ? "bg-amber-600 text-white shadow-2xs font-black"
                                : "text-zinc-600 hover:text-zinc-900"
                                }`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Question Bank</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditorRefPanel(null)}
                              className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                              title="Hide reference panel to expand Question Paper Editor"
                            >
                              <span className="hidden sm:inline">Full Editor</span>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Course / Reference Badge */}
                        <div className={`p-2.5 px-3 border rounded-xl text-xs font-bold flex items-center justify-between shrink-0 ${
                          editorRefPanel === "guidelines"
                            ? "bg-purple-50/80 border-purple-200 text-purple-950"
                            : editorRefPanel === "syllabus"
                              ? "bg-blue-50/80 border-blue-200 text-[#120c7a]"
                              : "bg-amber-50/80 border-amber-200 text-amber-950"
                        }`}>
                          <span className="truncate">
                            {editorRefPanel === "guidelines"
                              ? `${effectiveExamSession} - Official Question Setting Guidelines`
                              : `${assignment?.subjectCode} - ${assignment?.subjectTitle}`}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            editorRefPanel === "guidelines"
                              ? "bg-purple-200 text-purple-950"
                              : editorRefPanel === "syllabus"
                                ? "bg-blue-200 text-blue-950"
                                : "bg-amber-200 text-amber-950"
                          }`}>
                            {editorRefPanel === "guidelines" ? "Official Guidelines" : editorRefPanel === "syllabus" ? "Syllabus" : "Official QB"}
                          </span>
                        </div>

                        {/* Document Embed Body */}
                        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                          {editorRefPanel === "guidelines" ? (
                            sessionGuidelinesPdf?.url ? (
                              <DocumentEmbedViewer
                                docUrl={sessionGuidelinesPdf.url}
                                rawLink={sessionGuidelinesPdf.rawLink}
                                title={`${effectiveExamSession} - Question Setting Guidelines`}
                                fileName={sessionGuidelinesPdf.fileName || "Guidelines Document"}
                                minHeight="calc(100vh - 16rem)"
                              />
                            ) : qpGuidelines && qpGuidelines.length > 0 ? (
                              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                                {qpGuidelines.map((g, idx) => (
                                  <div key={g.id || idx} className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-extrabold text-purple-900 text-xs block">
                                        Rule #{idx + 1}
                                      </span>
                                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-900">
                                        {g.category || "Mandatory"}
                                      </span>
                                    </div>
                                    <p className="text-zinc-700 text-xs leading-relaxed font-semibold">
                                      {g.ruleText || g.rule || g.instruction}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-16 text-center text-zinc-400 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                                <ShieldCheck className="h-8 w-8 text-zinc-300" />
                                <p>No guidelines document or specific rules linked for this examination session.</p>
                              </div>
                            )
                          ) : editorRefPanel === "syllabus" ? (
                            (assignment?.syllabusUrl || assignment?.syllabusFileUrl || assignment?.syllabusRawLink) ? (
                              <DocumentEmbedViewer
                                docUrl={assignment.syllabusUrl || assignment.syllabusFileUrl}
                                rawLink={assignment.syllabusRawLink}
                                title={`${assignment?.subjectCode || syllabusData?.subjectCode} - Course Syllabus`}
                                fileName={assignment.syllabusFileName}
                                minHeight="calc(100vh - 16rem)"
                              />
                            ) : syllabusData ? (
                              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                                {syllabusData.units?.map((u, idx) => (
                                  <div key={idx} className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                                    <span className="font-extrabold text-[#120c7a] text-xs block">
                                      {u.title || `Unit ${u.unit || idx + 1}`}
                                    </span>
                                    <p className="text-zinc-600 text-xs leading-relaxed font-medium">
                                      {u.topics}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-16 text-center text-zinc-400 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                                <BookOpen className="h-8 w-8 text-zinc-300" />
                                <p>No syllabus document uploaded.</p>
                              </div>
                            )
                          ) : (
                            (assignment?.qbUrl || assignment?.qbFileUrl || assignment?.qbRawLink) ? (
                              <DocumentEmbedViewer
                                docUrl={assignment.qbUrl || assignment.qbFileUrl}
                                rawLink={assignment.qbRawLink}
                                title={`${assignment?.subjectCode} - Official Question Bank`}
                                fileName={assignment.qbFileName}
                                minHeight="calc(100vh - 16rem)"
                              />
                            ) : (
                              <div className="py-16 text-center text-zinc-400 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                                <FileText className="h-8 w-8 text-zinc-300" />
                                <p>No Question Bank document linked for this assignment.</p>
                              </div>
                            )
                          )}
                        </div>

                      </div>
                    </aside>
                  )}

                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 3: PREVIEW QUESTION PAPER & MOVE TO COE */}
            {/* ========================================================================= */}
            {viewState === "preview" && (
              <div className="bg-white rounded-3xl border border-zinc-200 p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-[#120c7a] flex items-center gap-2">
                      <Eye className="h-5 w-5 text-emerald-600" />
                      Official ESE Question Paper Preview
                    </h2>
                    <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                      Verify questions formatting. Review checklist to unlock 'Move to COE'.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Return to Editor */}
                    <button
                      type="button"
                      onClick={() => setViewState("editor")}
                      className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold flex items-center gap-1.5 border border-zinc-200 cursor-pointer transition-all"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span>Edit Question Paper</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveDraft(true)}
                      disabled={isSavingDraft}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                      title="Save Question Paper as Draft"
                    >
                      {isSavingDraft ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <BookmarkCheck className="h-4 w-4 text-emerald-200" />
                      )}
                      <span>Save Draft</span>
                    </button>

                    <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-3 py-2 rounded-xl border border-zinc-200 hidden sm:inline-block">
                      Review questions below • Verify checklist at bottom ↓
                    </span>
                  </div>
                </div>

                {/* Permitted Materials Notice Banner in Preview Mode */}
                {permittedMaterials.enabled && (
                  <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs print:hidden">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-[#120c7a] mr-2">
                          Permitted Materials:
                        </span>
                        <span className="text-zinc-700 font-semibold font-serif">
                          {formatPermittedMaterialsNotice(permittedMaterials)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewState("editor")}
                      className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline shrink-0 cursor-pointer self-end sm:self-auto"
                    >
                      Change Materials
                    </button>
                  </div>
                )}

                {/* Dual Paper Switcher for Preview (Set A vs Set B) */}
                {isNumSetsTwo && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 print:hidden">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#120c7a]" />
                      <span className="text-xs font-black text-[#120c7a]">Previewing Question Paper:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSet("setA")}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeSet === "setA" ? "bg-[#120c7a] text-white shadow-xs" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
                          }`}
                      >
                        <span>Question Paper Set A</span>
                        {paperStatusA.isAllComplete ? (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">12/12 ✓</span>
                        ) : (
                          <span className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold">
                            {paperStatusA.missedQuestions.length} Missed
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSet("setB")}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeSet === "setB" ? "bg-[#120c7a] text-white shadow-xs" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
                          }`}
                      >
                        <span>Question Paper Set B</span>
                        {paperStatusB?.isAllComplete ? (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">12/12 ✓</span>
                        ) : (
                          <span className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold">
                            {paperStatusB?.missedQuestions.length || 0} Missed
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Incomplete Questions Indicator in Preview Mode */}
                {!paperStatus.isAllComplete && (
                  <div className="p-3.5 px-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-2xs font-sans print:hidden">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
                      <div>
                        <p className="text-xs font-black">
                          Incomplete Question Paper ({paperStatus.missedQuestions.length} question(s) missed in {isSetB ? "Set B" : "Set A"})
                        </p>
                        <p className="text-[11px] text-amber-800">
                          Missed questions: {paperStatus.missedQuestions.map(m => `Q.${m.qNo}`).join(", ")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setViewState("editor");
                        setTimeout(() => scrollToQuestion(paperStatus.missedQuestions[0]?.qNo), 300);
                      }}
                      className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Jump to Edit Q.{paperStatus.missedQuestions[0]?.qNo}</span>
                    </button>
                  </div>
                )}

                {/* Official Print/Preview Layout Document */}
                {renderPrintablePaper(currentQp, isNumSetsTwo ? (activeSet === "setB" ? "(SET B)" : "(SET A)") : "")}

                {/* BOTTOM VERIFICATION & CONFIDENTIAL COE HANDOFF BAR */}
                {!(submittedSuccess || assignment?.status === "submitted") && (
                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 print:hidden mt-6 w-full">
                    {/* Header & Status Notice */}
                    <div className="space-y-1.5 text-left">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-wider text-[#120c7a]">
                          Step 4: Quality Control & Confidential COE Handoff
                        </span>
                      </div>
                      <h3 className="text-base font-black text-zinc-900">
                        {isNumSetsTwo && isSimilarityOver25 ? (
                          <span className="text-rose-600 flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 animate-pulse" />
                            COE Forwarding Locked: AI Similarity Exceeds 25% Limit!
                          </span>
                        ) : isNumSetsTwo
                          ? (isSetB
                            ? (areAllSetsChecklistComplete
                              ? "Both Set A & Set B Verified (12/12)!"
                              : "Question Paper Set B Review & Verification")
                            : (isChecklistCompleteA
                              ? (isChecklistCompleteB
                                ? "Both Set A & Set B Verified (12/12)!"
                                : "Set A Verified (12/12)! Now Prepare Set B")
                              : "Question Paper Set A Review & Verification"))
                          : (isChecklistComplete
                            ? "12-Point Quality Checklist Verified!"
                            : "Question Paper Review Completed?")}
                      </h3>
                      <p className="text-xs text-zinc-600 font-medium max-w-3xl leading-relaxed">
                        {isNumSetsTwo && isSimilarityOver25 ? (
                          <span className="text-rose-700 font-bold block">
                            Cross-set AI similarity between Set A and Set B is <strong className="font-mono text-rose-950 font-black">{aiSimilarityResult?.overallSimilarityPercent}%</strong> (Allowed maximum is 25.0%). Forwarding to COE is disabled. Please review and reframe duplicate questions in Set B before you can submit.
                          </span>
                        ) : isNumSetsTwo
                          ? (isSetB
                            ? (areAllSetsChecklistComplete
                              ? "Both Question Paper Set A and Set B are 100% verified! Click 'Move to COE' to fill remuneration details and submit both sets."
                              : (isChecklistCompleteB
                                ? "Set B is verified, but Set A checklist is pending. Please verify Set A before submitting to COE."
                                : "Please verify the 12-point quality checklist for Set B."))
                            : (isChecklistCompleteA
                              ? (isChecklistCompleteB
                                ? "Both Question Paper Set A and Set B are 100% verified! Click 'Move to COE' to submit both sets."
                                : "Question Paper Set A is verified and saved! Please click 'Proceed to Prepare Set B' to generate and edit Set B questions.")
                              : "Please verify the 12-point question paper setting checklist for Set A before proceeding to Set B."))
                          : (isChecklistComplete
                            ? "12-point quality checklist verified! Click 'Move to COE' to fill remuneration bank details and submit."
                            : "Please verify the 12-point question paper setting checklist before submitting to the Controller of Examinations.")}
                      </p>
                    </div>

                    {/* Responsive Action Buttons Bar */}
                    <div className="pt-4 border-t border-blue-200/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 w-full">
                      {/* Left Group: Navigation Actions */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Edit Questions button */}
                        <button
                          type="button"
                          onClick={() => setViewState("editor")}
                          className="px-4 py-3 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-zinc-300 transition-all cursor-pointer shadow-2xs"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span>Edit {isNumSetsTwo ? (isSetB ? "Set B" : "Set A") : "Questions"}</span>
                        </button>

                        {/* If on Set B and Set A is not complete -> allow switching to Set A */}
                        {isNumSetsTwo && isSetB && !isChecklistCompleteA && (
                          <button
                            type="button"
                            onClick={() => setActiveSet("setA")}
                            className="px-4 py-3 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 border border-amber-300 cursor-pointer transition-all"
                          >
                            <span>Switch to Set A (Checklist Pending)</span>
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Right Group: Review, AI & Submission Actions */}
                      <div className="flex items-center gap-2.5 flex-wrap justify-start md:justify-end">
                        {/* Verify QP Checklist Button */}
                        <button
                          type="button"
                          onClick={() => setShowChecklistModal(true)}
                          className={`px-5 py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${isChecklistComplete
                            ? "bg-emerald-50 text-emerald-900 border-2 border-emerald-400 hover:bg-emerald-100"
                            : "bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/30 animate-pulse border-2 border-amber-500"
                            }`}
                        >
                          <ClipboardCheck className={`h-4 w-4 ${isChecklistComplete ? "text-emerald-600" : "text-slate-950"}`} />
                          <span>
                            {isChecklistComplete
                              ? `Checklist Verified (12/12) ✓`
                              : `Verify ${isNumSetsTwo ? (isSetB ? "Set B" : "Set A") : "QP"} Checklist (${verifiedCount}/12)`}
                          </span>
                        </button>

                        {/* If 2 sets and Set A is complete but Set B is not yet done -> Show prominent 'Proceed to Prepare Set B' button */}
                        {isNumSetsTwo && !isSetB && !isChecklistCompleteB && isChecklistCompleteA && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSet("setB");
                              setViewState("editor");
                            }}
                            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 hover:from-emerald-700 hover:to-indigo-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-700/25 cursor-pointer transition-all active:scale-95 animate-pulse"
                          >
                            <Sparkles className="h-4 w-4 text-amber-300" />
                            <span>Proceed to Prepare Set B</span>
                            <ArrowRight className="h-4 w-4 text-white" />
                          </button>
                        )}

                        {/* Compare with AI Button - Exclusively visible when previewing Set B */}
                        {isNumSetsTwo && isSetB && (
                          isSetBModifiedSinceDraft ? (
                            <div className="px-5 py-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-center gap-2 shadow-xs">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>Save Set B draft in Editor to enable AI Compare</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRunAiSimilarityCheck(true)}
                              disabled={isComparingAi}
                              className="px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all active:scale-95 border border-purple-400/30"
                              title="Inspect cross-paper semantic duplicate index before COE submission"
                            >
                              {isComparingAi ? (
                                <RefreshCw className="h-4 w-4 animate-spin text-purple-200" />
                              ) : (
                                <Sparkles className="h-4 w-4 text-amber-300" />
                              )}
                              <span> Similarity Check (Set A & B)</span>
                              {aiSimilarityResult && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0
                                  ? "bg-emerald-400/25 text-emerald-100 border border-emerald-400/30"
                                  : "bg-rose-500/30 text-rose-100 border border-rose-400/30 animate-pulse"
                                  }`}>
                                  {aiSimilarityResult.overallSimilarityPercent}%
                                </span>
                              )}
                            </button>
                          )
                        )}

                        {/* Move to COE Button (Only available if ALL assigned sets are 12/12 verified AND AI similarity <= 25.0% AND all questions complete) */}
                        {isNumSetsTwo && isSetB && isSimilarityOver25 ? (
                          <button
                            type="button"
                            onClick={() => setShowAiModal(true)}
                            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-rose-950/20 cursor-pointer transition-all active:scale-95 animate-pulse border-2 border-rose-400"
                            title="Forwarding to COE is locked because AI cross-set duplicate similarity exceeds 25%. Click to view duplicates and jump to edit in Set B."
                          >
                            <ShieldAlert className="h-4 w-4 text-rose-200 shrink-0" />
                            <span>Locked: Fix Duplicates ({aiSimilarityResult.overallSimilarityPercent}% &gt; 25%)</span>
                          </button>
                        ) : (!paperStatusA.isAllComplete || (isNumSetsTwo && !paperStatusB?.isAllComplete)) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const targetSetMissing = !paperStatusA.isAllComplete ? paperStatusA : paperStatusB;
                              const targetSetName = !paperStatusA.isAllComplete ? "Set A" : "Set B";
                              alert(`Submission to COE is Locked!\n\nQuestion Paper ${targetSetName} has ${targetSetMissing.missedQuestions.length} missed/incomplete question(s): ${targetSetMissing.missedQuestions.map(m => `Q.${m.qNo}`).join(", ")}.\n\nPlease complete all questions before forwarding to COE.`);
                              setActiveSet(!paperStatusA.isAllComplete ? "setA" : "setB");
                              setViewState("editor");
                              setTimeout(() => scrollToQuestion(targetSetMissing.missedQuestions[0]?.qNo), 300);
                            }}
                            className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-amber-950/20 cursor-pointer transition-all active:scale-95 border-2 border-amber-600 animate-pulse"
                            title="Questions must be filled before moving to COE"
                          >
                            <AlertTriangle className="h-4 w-4 text-slate-950 shrink-0" />
                            <span>Locked: Fill Missed Questions ({!paperStatusA.isAllComplete ? "Set A" : "Set B"})</span>
                          </button>
                        ) : areAllSetsChecklistComplete && (
                          <button
                            type="button"
                            onClick={handleMoveToCoe}
                            disabled={submittingToCoe || submittedSuccess}
                            className="px-6 py-3 rounded-2xl bg-[#120c7a] hover:bg-[#0e0a60] text-white text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-indigo-950/20 cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                          >
                            {submittingToCoe ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                                <span>Submitting to COE...</span>
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 text-emerald-300" />
                                <span>Move to COE {isNumSetsTwo ? "(Both Sets)" : ""}</span>
                                <ChevronRight className="h-4 w-4 text-white" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ========================================================================= */
          /* DEDICATED COMPLETION SCREEN (AFTER CONFIDENTIAL COE HANDOFF) */
          /* Shows ONLY the Official Greeting Message Card and the 2 Action Buttons */
          /* ========================================================================= */
          <div className="w-full flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-500 font-sans print:p-0 my-auto">
            {/* Top Institutional Branding Header */}
            <div className="flex items-center justify-center gap-4 bg-white/95 backdrop-blur-md px-6 sm:px-8 py-3 rounded-2xl shadow-xl border border-white/50 print:hidden">
              <img
                src="/ckcet_logo_badge.png"
                alt="CKCET Logo"
                className="h-12 sm:h-14 w-auto max-w-[280px] object-contain shrink-0 drop-shadow-xs"
                onError={(e) => { e.currentTarget.src = '/logo.png'; }}
              />
              <div className="h-8 w-px bg-zinc-300 hidden sm:block" />
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-black text-[#120c7a] tracking-tight uppercase">
                  Office of the Controller of Examinations
                </span>
                <span className="text-[10px] font-bold text-zinc-600">
                  Autonomous Confidential Examination Portal
                </span>
              </div>
            </div>

            {/* The Greeting Message Card */}
            <div className="w-full bg-gradient-to-br from-[#120c7a] via-[#18129a] to-[#0a0654] text-white p-8 sm:p-12 rounded-3xl shadow-2xl relative overflow-hidden text-center space-y-6 border border-blue-400/30 print:hidden">
              {/* Decorative background blur glow */}
              <div className="absolute -top-12 -right-12 w-64 h-64 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none" />

              {/* Top Badge & Icon */}
              <div className="relative z-10 flex flex-col items-center justify-center gap-3">
                <div className="h-20 w-20 bg-white/10 backdrop-blur-md rounded-3xl border border-amber-300/40 text-amber-300 flex items-center justify-center shadow-xl mb-1">
                  <Award className="h-10 w-10 text-amber-300" />
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black uppercase tracking-widest shadow-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Official COE Submission Completed
                </div>

                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                  Thank You for Setting the ESE Question Paper!
                </h2>
              </div>

              {/* 4 Paragraphs of Satisfying, Inspiring Gratitude Text */}
              <div className="relative z-10 max-w-2xl mx-auto space-y-3.5 font-serif text-sm sm:text-base leading-relaxed text-blue-100/90 italic border-t border-b border-white/15 py-6 my-2">
                <p>
                  We extend our deepest gratitude to you for setting the End Semester Examination ({effectiveExamSession}) question paper for <strong className="text-amber-300 not-italic font-sans font-black">{assignment?.subjectCode} - {assignment?.subjectTitle}</strong>.
                </p>
                <p>
                  Your distinguished academic expertise, meticulous Bloom's Taxonomy alignment, and dedication to assessment excellence are deeply appreciated.
                </p>
                <p>
                  The confidential question paper, quality control checklist, and your remuneration claim bill have been successfully transmitted to the Controller of Examinations.
                </p>
                <p>
                  Thank you for partnering with our institution to nurture the next generation of engineers and academic leaders.
                </p>
              </div>

              {/* The Action Button: View Claim Bill */}
              <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setClaimBillStep("verify");
                    setShowClaimBillModal(true);
                  }}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl hover:shadow-2xl cursor-pointer transition-all active:scale-95"
                >
                  <Landmark className="h-5 w-5 text-slate-950" />
                  <span>View Claim Bill</span>
                </button>
              </div>

              {/* Subtle Exit/Logout Option */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setAuthenticatedSetter(null)}
                  className="text-xs text-blue-200/70 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Securely Exit & Logout</span>
                </button>
              </div>
            </div>

            {/* Hidden Printable Official Question Paper(s) — Only visible when printing via window.print() and claim bill is not active */}
            {!showClaimBillModal && (
              <div className="hidden print:block print:w-full">
                {renderPrintablePaper(qpData, isNumSetsTwo ? "(SET A)" : "")}
                {isNumSetsTwo && (
                  <div className="break-before-page pt-8">
                    {renderPrintablePaper(qpDataB, "(SET B)")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 4. OFFICIAL APPOINTMENT ORDER COPY PREVIEW MODAL */}
      {/* ========================================================================= */}
      {showOrderModal && (
        <AppointmentOrderCopyModal
          assignment={assignment}
          onClose={() => setShowOrderModal(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* 5. FLOATING QUICK SYLLABUS DRAWER */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* 3. FLOATING GUIDELINES DRAWER / PDF VIEWER */}
      {/* ========================================================================= */}
      {showGuidelinesDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white border-l border-zinc-200 h-full p-6 shadow-2xl flex flex-col space-y-4 overflow-y-auto animate-in slide-in-from-right duration-300">

            <div className="flex items-center justify-between pb-3.5 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2 text-purple-950 font-black text-sm">
                <ShieldCheck className="h-5 w-5 text-purple-700" />
                <span>Question Setting Guidelines & Regulations</span>
              </div>
              <div className="flex items-center gap-2">
                {sessionGuidelinesPdf?.url && (
                  <a
                    href={sessionGuidelinesPdf.rawLink || sessionGuidelinesPdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-purple-700" />
                    Open in New Tab
                  </a>
                )}
                <button
                  onClick={() => setShowGuidelinesDrawer(false)}
                  className="h-8 w-8 rounded-xl bg-zinc-100 text-zinc-500 hover:text-zinc-900 flex items-center justify-center cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Session Title Badge */}
            <div className="p-3 bg-purple-50 border border-purple-200/90 rounded-2xl text-xs font-bold text-purple-900 flex items-center justify-between shrink-0">
              <span>{effectiveExamSession} - Official Question Setting Guidelines</span>
              <span className="text-[10px] bg-purple-200/80 text-purple-950 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                {sessionGuidelinesPdf?.url ? "Official Guidelines Document" : "Configured Rules"}
              </span>
            </div>

            {/* Content Display: DocumentEmbedViewer if linked, or rules list */}
            {sessionGuidelinesPdf?.url ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <DocumentEmbedViewer
                  docUrl={sessionGuidelinesPdf.url}
                  rawLink={sessionGuidelinesPdf.rawLink}
                  title={`${effectiveExamSession} - Question Setting Guidelines`}
                  fileName={sessionGuidelinesPdf.fileName || "Guidelines Document"}
                  minHeight="600px"
                />
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {qpGuidelines && qpGuidelines.length > 0 ? (
                  qpGuidelines.map((g, idx) => (
                    <div key={g.id || idx} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-purple-900 text-xs block">
                          Rule #{idx + 1}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-900">
                          {g.category || "Mandatory"}
                        </span>
                      </div>
                      <p className="text-zinc-700 text-xs leading-relaxed font-medium">
                        {g.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center text-zinc-500 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                    <ShieldCheck className="h-10 w-10 text-zinc-300 stroke-1" />
                    <p>No guidelines PDF or custom rules uploaded yet for this session.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FLOATING QUESTION BANK DRAWER / PDF VIEWER */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* 4. FLOATING QUESTION BANK DRAWER (Non-Editor Views) */}
      {/* ========================================================================= */}
      {showQbDrawer && viewState !== "editor" && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl lg:max-w-2xl bg-white border-l border-zinc-200 h-full p-5 shadow-2xl flex flex-col space-y-3.5 overflow-y-auto animate-in slide-in-from-right duration-300">

            <div className="flex items-center justify-between pb-3.5 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
                <FileText className="h-5 w-5 text-amber-700" />
                <span>Question Bank Reference Document</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowQbDrawer(false)}
                  className="h-8 w-8 rounded-xl bg-zinc-100 text-zinc-500 hover:text-zinc-900 flex items-center justify-center cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Course Title Badge */}
            <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl text-xs font-bold text-amber-900 flex items-center justify-between shrink-0">
              <span>{assignment?.subjectCode} - {assignment?.subjectTitle || "Course Question Bank"}</span>
              <span className="text-[10px] bg-amber-200/80 text-amber-950 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                {(assignment?.qbUrl || assignment?.qbFileUrl) ? "Official QB Document" : "No Document"}
              </span>
            </div>

            {/* Content Display: QB Document Viewer or Empty State */}
            {(assignment?.qbUrl || assignment?.qbFileUrl) ? (
              <DocumentEmbedViewer
                docUrl={assignment.qbUrl || assignment.qbFileUrl}
                rawLink={assignment.qbRawLink}
                title={`${assignment?.subjectCode} - Official Question Bank`}
                fileName={assignment.qbFileName}
                minHeight="680px"
              />
            ) : (
              <div className="py-16 text-center text-zinc-500 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                <FileText className="h-10 w-10 text-zinc-300 stroke-1" />
                <p>No Question Bank document linked for this assignment.</p>
                <p className="text-[11px] text-zinc-400">COE Admin can link the Question Bank document during assignment creation.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FLOATING QUICK SYLLABUS & OUTCOMES DRAWER (Non-Editor Views) */}
      {/* ========================================================================= */}
      {showSyllabusDrawer && viewState !== "editor" && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl lg:max-w-2xl bg-white border-l border-zinc-200 h-full p-5 shadow-2xl flex flex-col space-y-3.5 overflow-y-auto animate-in slide-in-from-right duration-300">

            <div className="flex items-center justify-between pb-3.5 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2 text-[#120c7a] font-black text-sm">
                <BookOpen className="h-5 w-5 text-[#120c7a]" />
                <span>Subject Syllabus & Outcomes Reference</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSyllabusDrawer(false)}
                  className="h-8 w-8 rounded-xl bg-zinc-100 text-zinc-500 hover:text-zinc-900 flex items-center justify-center cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Course Title Badge */}
            <div className="p-3 bg-blue-50 border border-blue-200/90 rounded-2xl text-xs font-bold text-[#120c7a] flex items-center justify-between shrink-0">
              <span>{assignment?.subjectCode || syllabusData?.subjectCode} - {assignment?.subjectTitle || syllabusData?.subjectTitle || "Course Syllabus"}</span>
              <span className="text-[10px] bg-blue-200/80 text-blue-900 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                {(assignment?.syllabusUrl || assignment?.syllabusFileUrl) ? "Official Document" : "Standard Syllabus"}
              </span>
            </div>

            {/* Content Display: PDF Viewer or Unit List */}
            {(assignment?.syllabusUrl || assignment?.syllabusFileUrl) ? (
              <DocumentEmbedViewer
                docUrl={assignment.syllabusUrl || assignment.syllabusFileUrl}
                rawLink={assignment.syllabusRawLink}
                title={`${assignment?.subjectCode || syllabusData?.subjectCode} - Course Syllabus`}
                fileName={assignment.syllabusFileName}
                minHeight="680px"
              />
            ) : syllabusData ? (
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                {syllabusData.units?.map((u, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <span className="font-extrabold text-[#120c7a] text-xs block">
                      {u.title || `Unit ${u.unit || idx + 1}`}
                    </span>
                    <p className="text-zinc-600 text-xs leading-relaxed font-medium">
                      {u.topics}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-zinc-500 text-xs font-semibold flex flex-col items-center justify-center gap-2">
                <BookOpen className="h-10 w-10 text-zinc-300 stroke-1" />
                <p>No syllabus PDF document or unit details uploaded yet for this assignment.</p>
                <p className="text-[11px] text-zinc-400">COE Admin can upload the PDF syllabus during assignment creation.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUESTION PAPER SETTING CHECKLIST & DECLARATION MODAL */}
      {/* ========================================================================= */}
      {showChecklistModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-3xl border border-zinc-300 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden relative print:max-h-none print:shadow-none print:border-none print:rounded-none">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#1a149c] text-white p-5 px-6 flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <ClipboardCheck className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    Question Paper Setting Verification Checklist {isNumSetsTwo ? (isSetB ? "– Set B (Paper 2)" : "– Set A (Paper 1)") : ""}
                  </h3>
                  <p className="text-xs text-blue-200 font-medium">
                    {isNumSetsTwo
                      ? `Verify all 12 quality criteria for ${isSetB ? "Question Paper Set B" : "Question Paper Set A"}`
                      : "Verify all 12 quality control criteria to unlock 'Move to COE' submission"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChecklistResponses(CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: "YES" }), {}))}
                  className="px-3 py-1.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  ✓ Verify All YES
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowChecklistModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-blue-50 px-6 py-2.5 border-b border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0 print:hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-[#120c7a]">
                  {isNumSetsTwo ? (isSetB ? "Set B Checklist:" : "Set A Checklist:") : "Checklist Progress:"}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-white border border-blue-200 text-blue-900 font-mono">
                  {verifiedCount} / 12 Verified (YES)
                </span>
                {isNumSetsTwo && (
                  <span className="text-[11px] text-zinc-600 font-semibold ml-2">
                    (Set A: <strong className={isChecklistCompleteA ? "text-emerald-700 font-mono" : "text-amber-700 font-mono"}>{verifiedCountA}/12 {isChecklistCompleteA ? "✓" : ""}</strong> | Set B: <strong className={isChecklistCompleteB ? "text-emerald-700 font-mono" : "text-amber-700 font-mono"}>{verifiedCountB}/12 {isChecklistCompleteB ? "✓" : ""}</strong>)
                  </span>
                )}
              </div>
              {isChecklistComplete ? (
                <span className="text-xs font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {isNumSetsTwo
                    ? (isSetB ? "Set B Fully Verified!" : "Set A Fully Verified! Click 'Save Set A & Proceed to Set B' below")
                    : "Checklist Fully Verified! Click 'Confirm & Unlock' below"}
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-3 py-0.5 rounded-full">
                  Select "YES" for all 12 items to verify {isNumSetsTwo ? (isSetB ? "Set B" : "Set A") : "this paper"}
                </span>
              )}
            </div>

            {/* Printable Official Document Body */}
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-zinc-900 font-serif text-xs leading-relaxed">

              {/* Document Title Header */}
              <div className="text-center space-y-1 border-b pb-4">
                <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-900">Office of the Controller of Examinations</h2>
                <h1 className="text-base font-black uppercase tracking-wider text-[#120c7a]">QUESTION PAPER SETTING – CHECK LIST</h1>
                <p className="text-xs font-bold text-zinc-700">
                  B.E. / B.Tech. / M.E.– End Semester Examinations {effectiveExamSession} {isNumSetsTwo ? (isSetB ? "– (SET B)" : "– (SET A)") : ""}
                </p>
              </div>

              {/* Header Fields Table */}
              <table className="w-full border-collapse border border-zinc-900 text-left">
                <tbody>
                  <tr>
                    <td className="border border-zinc-900 p-2.5 font-bold w-1/3 bg-zinc-50">Subject Code and Name:</td>
                    <td className="border border-zinc-900 p-2.5 font-extrabold text-[#120c7a]">
                      {assignment?.subjectCode} - {assignment?.subjectTitle}
                    </td>
                  </tr>
                  {isNumSetsTwo && (
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Question Paper Set:</td>
                      <td className="border border-zinc-900 p-2.5 font-black text-[#120c7a]">
                        {isSetB ? "Set B (Paper 2)" : "Set A (Paper 1)"}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Month and Year of Examination:</td>
                    <td className="border border-zinc-900 p-2 font-semibold">
                      <input
                        type="text"
                        value={examMonthYear}
                        onChange={(e) => setExamMonthYear(e.target.value)}
                        className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none font-sans"
                        placeholder="e.g. April / May 2026"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Check List Table (12 Items) */}
              <div>
                <h3 className="font-sans font-black text-xs text-[#120c7a] uppercase mb-2">I. Question Paper Quality Verification Criteria</h3>
                <table className="w-full border-collapse border border-zinc-900 text-left font-sans">
                  <thead>
                    <tr className="bg-zinc-200 text-zinc-900 font-bold uppercase text-[11px] border-b border-zinc-900">
                      <th className="border border-zinc-900 p-2.5">Check Item</th>
                      <th className="border border-zinc-900 p-2.5 text-center w-24">YES</th>
                      <th className="border border-zinc-900 p-2.5 text-center w-24">NO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHECKLIST_ITEMS.map((item, idx) => {
                      const status = checklistResponses[item.id];
                      return (
                        <tr key={item.id} className={status === "YES" ? "bg-emerald-50/40" : status === "NO" ? "bg-rose-50/40" : ""}>
                          <td className="border border-zinc-900 p-2.5 font-semibold text-xs text-zinc-900">
                            <span className="font-bold text-zinc-600 mr-2">{idx + 1}.</span>
                            {item.text}
                          </td>
                          <td className="border border-zinc-900 p-2 text-center">
                            <button
                              type="button"
                              onClick={() => setChecklistResponses(prev => ({ ...prev, [item.id]: "YES" }))}
                              className={`w-full py-1.5 rounded font-black text-xs transition-all cursor-pointer ${status === "YES"
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-zinc-100 hover:bg-emerald-100 text-zinc-700 border border-zinc-300"
                                }`}
                            >
                              YES
                            </button>
                          </td>
                          <td className="border border-zinc-900 p-2 text-center">
                            <button
                              type="button"
                              onClick={() => setChecklistResponses(prev => ({ ...prev, [item.id]: "NO" }))}
                              className={`w-full py-1.5 rounded font-black text-xs transition-all cursor-pointer ${status === "NO"
                                ? "bg-rose-600 text-white shadow-xs"
                                : "bg-zinc-100 hover:bg-rose-100 text-zinc-700 border border-zinc-300"
                                }`}
                            >
                              NO
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Distribution of Questions (Unit-wise) Table */}
              <div className="space-y-3 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase">II. Distribution of Questions (Unit-wise Summary)</h3>

                {/* Part A Table (Q1 - Q10) */}
                <div className="overflow-x-auto">
                  <p className="font-bold text-[11px] text-zinc-700 mb-1">Part A Questions (1 to 10):</p>
                  <table className="w-full border-collapse border border-zinc-900 text-center text-xs">
                    <thead>
                      <tr className="bg-zinc-200 font-bold border-b border-zinc-900">
                        <th className="border border-zinc-900 p-1.5 font-black bg-zinc-300 text-left px-2">Part A Q. No.</th>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                          <th key={num} className="border border-zinc-900 p-1.5 w-10 font-black">{num}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">CO</td>
                        {Array.from({ length: 10 }, (_, i) => {
                          const q = currentQp.sections[0]?.questions?.[i];
                          return (
                            <td key={i} className="border border-zinc-900 p-1.5 font-bold text-indigo-900">
                              {q?.co || `CO${(i % 5) + 1}`}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">KL-Level</td>
                        {Array.from({ length: 10 }, (_, i) => {
                          const q = currentQp.sections[0]?.questions?.[i];
                          return (
                            <td key={i} className="border border-zinc-900 p-1.5 font-bold text-emerald-900">
                              {q?.blooms || "K1"}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Part B Table (Q11 - Q15 A/B) */}
                <div className="overflow-x-auto pt-2">
                  <p className="font-bold text-[11px] text-zinc-700 mb-1">Part B Questions (11 to 15 Either / Or):</p>
                  <table className="w-full border-collapse border border-zinc-900 text-center text-xs">
                    <thead>
                      <tr className="bg-zinc-200 font-bold border-b border-zinc-900">
                        <th rowSpan={2} className="border border-zinc-900 p-1.5 font-black bg-zinc-300 text-left px-2">Part B Q. No.</th>
                        {[11, 12, 13, 14, 15].map(num => (
                          <th key={num} colSpan={2} className="border border-zinc-900 p-1.5 font-black">{num}</th>
                        ))}
                      </tr>
                      <tr className="bg-zinc-100 font-bold border-b border-zinc-900">
                        {[11, 12, 13, 14, 15].map(num => (
                          <React.Fragment key={num}>
                            <th className="border border-zinc-900 p-1 w-8">A</th>
                            <th className="border border-zinc-900 p-1 w-8">B</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">CO</td>
                        {[0, 1, 2, 3, 4].map(idx => {
                          const q = currentQp.sections[1]?.questions?.[idx];
                          return (
                            <React.Fragment key={idx}>
                              <td className="border border-zinc-900 p-1 font-bold text-indigo-900">{q?.co || `CO${idx + 1}`}</td>
                              <td className="border border-zinc-900 p-1 font-bold text-indigo-900">{q?.co || `CO${idx + 1}`}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">KL-Level</td>
                        {[0, 1, 2, 3, 4].map(idx => {
                          const q = currentQp.sections[1]?.questions?.[idx];
                          return (
                            <React.Fragment key={idx}>
                              <td className="border border-zinc-900 p-1 font-bold text-emerald-900">{q?.blooms || "K1"}</td>
                              <td className="border border-zinc-900 p-1 font-bold text-emerald-900">{q?.blooms || "K1"}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-zinc-500 italic font-sans font-medium">
                  Note: Each Part B question includes subdivisions / Either-Or choices as per prescribed regulation structure.
                </p>
              </div>

              {/* Declaration by the Question Paper Setter */}
              <div className="border border-zinc-900 p-4 rounded bg-zinc-50 space-y-4">
                <h3 className="font-sans font-black text-xs text-[#120c7a] uppercase border-b border-zinc-300 pb-1">
                  Declaration by the Question Paper Setter
                </h3>
                <p className="leading-relaxed font-serif text-xs text-zinc-800">
                  This is to certify that I, <span className="font-bold underline px-1">{authenticatedSetter?.name || assignment?.setterName || "External Setter"}</span> (Name),
                  have set the question paper on my own for <span className="font-bold underline px-1">{assignment?.subjectCode} - {assignment?.subjectTitle}</span> (Course Code and Name)
                  as per the guidelines given. The question paper in any form is kept strictly confidential and was not disclosed to any other person(s).
                </p>

                <div className="flex items-end justify-between pt-4 font-sans text-xs">
                  <div>
                    <span className="font-bold text-zinc-600 block text-[10px]">Date:</span>
                    <span className="font-bold text-zinc-900">{new Date().toLocaleDateString("en-IN")}</span>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="font-bold text-zinc-600 block text-[10px]">Signature:</span>
                    {signatureUrl ? (
                      <img src={signatureUrl} alt="Signature" className="h-10 object-contain inline-block border border-zinc-200 rounded p-1 bg-white" />
                    ) : (
                      <span className="font-serif italic font-bold text-indigo-900 border-b border-dashed border-zinc-600 px-3">
                        {authenticatedSetter?.name || assignment?.setterName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-zinc-100 p-3.5 sm:p-4 px-4 sm:px-6 border-t border-zinc-300 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0 print:hidden">
              <div className="text-xs font-semibold text-zinc-600">
                {isChecklistComplete ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    {isNumSetsTwo
                      ? (isSetB
                        ? (isChecklistCompleteA
                          ? "All 12 Checklist Items for Set B Verified! Both sets ready for COE handoff."
                          : "Set B Verified (12/12)! Please ensure Set A checklist is also verified.")
                        : "Set A Checklist Verified (12/12)! Please proceed to generate & prepare Question Paper Set B.")
                      : "All 12 Checklist Items Verified! 'Move to COE' button is now unlocked."}
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold">
                    {12 - verifiedCount} item(s) remaining for {isNumSetsTwo ? (isSetB ? "Set B" : "Set A") : "this paper"}. Select "YES" for all criteria.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5 w-full md:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setShowChecklistModal(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  Close / Return to Preview
                </button>

                {/* In 2-sets mode, if Set A is complete and we are on Set A, direct user to Set B */}
                {isNumSetsTwo && !isSetB ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChecklistModal(false);
                      if (isChecklistCompleteA) {
                        setActiveSet("setB");
                        setViewState("editor");
                      }
                    }}
                    disabled={!isChecklistCompleteA}
                    className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${isChecklistCompleteA
                      ? "bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-lg shadow-emerald-700/20 active:scale-95"
                      : "bg-zinc-300 text-zinc-500 cursor-not-allowed border border-zinc-300"
                      }`}
                  >
                    <span>Save Set A & Proceed to Set B</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                ) : isNumSetsTwo && isSimilarityOver25 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChecklistModal(false);
                      setShowAiModal(true);
                    }}
                    className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-700/20 active:scale-95 animate-pulse"
                    title="Submission is locked because AI similarity exceeds 25%. Click to review duplicates and fix in Set B."
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 text-white" />
                    <span>COE Forwarding Locked: Fix Duplicates ({aiSimilarityResult.overallSimilarityPercent}% &gt; 25%)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChecklistModal(false);
                      if (areAllSetsChecklistComplete) {
                        handleMoveToCoe();
                      } else if (isNumSetsTwo && !isChecklistCompleteA) {
                        setActiveSet("setA");
                      }
                    }}
                    disabled={!isChecklistComplete}
                    className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${(areAllSetsChecklistComplete || (!isNumSetsTwo && isChecklistComplete))
                      ? "bg-[#120c7a] hover:bg-[#0e0a60] text-white shadow-lg shadow-[#120c7a]/20 active:scale-95"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                      }`}
                  >
                    {areAllSetsChecklistComplete || (!isNumSetsTwo && isChecklistComplete) ? (
                      <>
                        <Send className="h-4 w-4 shrink-0" />
                        <span>Confirm & Move to COE</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Confirm & Save Checklist</span>
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUESTION PAPER SETTER – CLAIM BILL MODAL */}
      {/* ========================================================================= */}
      {showClaimBillModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          {/* Scoped Single-Page A4 Print Stylesheet */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm 12mm 8mm 12mm;
              }
              html, body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .qp-template, .qp-template * {
                visibility: visible !important;
              }
              #claim-bill-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                box-shadow: none !important;
                border: none !important;
                overflow: visible !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              #claim-bill-print-area table {
                width: 100% !important;
                border-collapse: collapse !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                margin-bottom: 5px !important;
              }
              #claim-bill-print-area tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              #claim-bill-print-area td, #claim-bill-print-area th {
                padding: 3.5px 7px !important;
                font-size: 11px !important;
                line-height: 1.25 !important;
                border: 1px solid #18181b !important;
              }
              #claim-bill-print-area h1 {
                font-size: 13px !important;
                margin-top: 1px !important;
                margin-bottom: 0 !important;
                color: #000000 !important;
              }
              #claim-bill-print-area h2 {
                font-size: 11px !important;
                margin-top: 1px !important;
                margin-bottom: 0 !important;
                color: #000000 !important;
              }
              #claim-bill-print-area h3 {
                font-size: 11px !important;
                margin-top: 4px !important;
                margin-bottom: 2px !important;
                color: #000000 !important;
              }
              #claim-bill-print-area input, #claim-bill-print-area select {
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                background: transparent !important;
                padding: 0 !important;
                font-size: 11px !important;
                color: #000000 !important;
              }
              .no-print, .print\\:hidden {
                display: none !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-3xl border border-zinc-300 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden relative print:max-h-none print:shadow-none print:border-none print:rounded-none">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#1a149c] text-white p-5 px-6 flex items-center justify-between shrink-0 print:hidden font-sans no-print">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Landmark className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Question Paper Setter Remuneration Claim Bill</h3>
                  <p className="text-xs text-blue-200 font-medium">
                    {isSubmitted
                      ? "Official Remuneration Claim Bill submitted to COE (Read-Only Copy)"
                      : "Fill in your bank account details for remuneration remittance"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintClaimBill}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowClaimBillModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Workflow Step Banner */}
            {isSubmitted ? (
              <div className="bg-emerald-50 px-6 py-2.5 border-b border-emerald-100 flex items-center justify-between shrink-0 print:hidden text-xs font-sans no-print">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-emerald-950">Claim Status:</span>
                  <span className="px-2.5 py-0.5 rounded-full font-black text-[11px] bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" /> Submitted & Locked (Official Copy)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-zinc-500">Subject: {assignment?.subjectCode}</span>
              </div>
            ) : (
              <div className="bg-blue-50 px-6 py-2.5 border-b border-blue-100 flex items-center justify-between shrink-0 print:hidden text-xs font-sans no-print">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-[#120c7a]">Submission Workflow:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${claimBillStep === "form" ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"}`}>
                    {claimBillStep === "form" ? "Step 1: Fill Remuneration & Bank Details" : "Step 2: 1-Time Verification & Final Submit"}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-zinc-500">Subject: {assignment?.subjectCode}</span>
              </div>
            )}

            {/* Printable Document Body - Strictly Constrained for Single A4 Page */}
            <div
              id="claim-bill-print-area"
              className="qp-template p-6 md:p-8 overflow-y-auto space-y-4 print:space-y-1.5 print:p-0 print:overflow-visible text-zinc-900 font-serif text-xs leading-relaxed"
            >

              {/* Document Header Title */}
              <div className="text-center space-y-1 border-b border-zinc-300 pb-3 print:pb-1.5 flex flex-col items-center">
                <img
                  src="/logo.png"
                  alt="CK College of Engineering & Technology"
                  className="h-12 sm:h-14 md:h-16 w-auto max-w-[480px] sm:max-w-[540px] object-contain mb-1 drop-shadow-2xs print:h-12 print:max-w-[460px]"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <h2 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-zinc-800 print:text-[11px] print:tracking-wider print:text-black">
                  Office of the Controller of Examinations
                </h2>
                <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#120c7a] print:text-xs print:font-black print:text-black">
                  QUESTION PAPER SETTER – CLAIM BILL
                </h1>
              </div>

              {/* Step 2 Verification Banner / Read-Only Submitted Banner (Screen Only) */}
              {isSubmitted ? (
                <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 font-sans text-xs flex items-center justify-between gap-3 shadow-xs print:hidden no-print">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-black text-emerald-900 block">Submitted & Digitally Signed Remuneration Claim:</span>
                      <span className="text-emerald-800 font-medium">This claim bill has been officially submitted to the Controller of Examinations and locked. Editing is disabled.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintClaimBill}
                    className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-900 border border-emerald-300 font-bold hover:bg-emerald-100 transition-all flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print Copy
                  </button>
                </div>
              ) : claimBillStep === "verify" ? (
                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 font-sans text-xs font-bold flex items-start gap-3 shadow-xs print:hidden no-print">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-amber-900 block mb-0.5">Please Verify Your Details One Time Before Final Submission:</span>
                    <span>Double-check your Bank Account Number, IFSC Code, and Holder Name below. Once verified, click "Confirm & Final Submit to COE".</span>
                  </div>
                </div>
              ) : null}

              {/* Table 1: Personal & Paper Details */}
              <div className="space-y-1.5 print:space-y-0.5 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase print:text-black print:text-[11px]">
                  I. Setter & Examination Details
                </h3>
                <table className="w-full border-collapse border border-zinc-900 text-left text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold w-2/5 bg-zinc-50 print:bg-zinc-100">Name of the Paper Setter:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-extrabold text-zinc-900 px-1 print:text-black">{claimBillData.setterName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.setterName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, setterName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="Enter Full Name"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Designation:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.designation}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.designation}
                            onChange={(e) => setClaimBillData({ ...claimBillData, designation: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. Professor / Associate Professor"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Department & Institution:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.departmentInstitution}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.departmentInstitution}
                            onChange={(e) => setClaimBillData({ ...claimBillData, departmentInstitution: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. Dept of CSE, IIT Madras"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Mobile Number:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.mobileNumber}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.mobileNumber}
                            onChange={(e) => setClaimBillData({ ...claimBillData, mobileNumber: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. 9876543210"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Email ID:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold font-mono">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.emailId}</span>
                        ) : (
                          <input
                            type="email"
                            value={claimBillData.emailId}
                            onChange={(e) => setClaimBillData({ ...claimBillData, emailId: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. professor@institution.edu"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Subject Code and Name:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-extrabold text-[#120c7a] print:text-black">
                        {assignment?.subjectCode} - {assignment?.subjectTitle}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Examination (Month & Year):</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold text-zinc-900 print:text-black">
                        {examMonthYear}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Date of Submission of QP:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold text-zinc-900 print:text-black">
                        {assignment?.paperSubmittedAt ? new Date(assignment.paperSubmittedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Table 2: Bank Account Details for Remittance */}
              <div className="space-y-1.5 print:space-y-0.5 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase print:text-black print:text-[11px]">
                  II. Bank Account Details for Remittance
                </h3>
                <table className="w-full border-collapse border border-zinc-900 text-left text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold w-2/5 bg-zinc-50 print:bg-zinc-100">Account Holder Name:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-extrabold text-zinc-900 px-1 print:text-black">{claimBillData.accHolderName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.accHolderName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accHolderName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="As per bank passbook"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Bank Name:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-extrabold text-zinc-900 px-1 print:text-black">{claimBillData.bankName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.bankName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, bankName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. State Bank of India"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Branch Name:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.branchName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.branchName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, branchName: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                            placeholder="e.g. Main Branch, Chennai"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Account Number:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold font-mono">
                        {isClaimBillReadOnly ? (
                          <span className="font-extrabold text-emerald-800 print:text-black text-sm tracking-wider px-1">{claimBillData.accountNumber}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.accountNumber}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accountNumber: e.target.value })}
                            className="w-full bg-transparent border-none font-mono font-extrabold text-indigo-900 print:text-black focus:outline-none text-sm tracking-wider"
                            placeholder="Enter Account Number"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">IFSC Code:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold font-mono">
                        {isClaimBillReadOnly ? (
                          <span className="font-extrabold text-indigo-900 print:text-black text-sm tracking-wider px-1">{claimBillData.ifscCode}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.ifscCode}
                            onChange={(e) => setClaimBillData({ ...claimBillData, ifscCode: e.target.value.toUpperCase() })}
                            className="w-full bg-transparent border-none font-mono font-extrabold text-indigo-900 print:text-black uppercase focus:outline-none text-sm tracking-wider"
                            placeholder="e.g. SBIN0001234"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Account Type (SB / CA):</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold">
                        {isClaimBillReadOnly ? (
                          <span className="font-bold text-zinc-900 px-1 print:text-black">{claimBillData.accountType}</span>
                        ) : (
                          <select
                            value={claimBillData.accountType}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accountType: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none print:text-black"
                          >
                            <option value="Savings (SB)">Savings Account (SB)</option>
                            <option value="Current (CA)">Current Account (CA)</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Table 3: Remuneration Claim Calculation */}
              <div className="space-y-1.5 print:space-y-0.5 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase print:text-black print:text-[11px]">
                  III. Remuneration Claim Calculation
                </h3>
                <table className="w-full border-collapse border border-zinc-900 text-left text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold w-2/5 bg-zinc-50 print:bg-zinc-100">No. of Question Paper Sets:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-black text-[#120c7a] print:text-black">
                        {Number(assignment?.numSets) === 2 ? "2 Sets (Set A & Set B)" : "1 Set (Set A)"}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-bold bg-zinc-50 print:bg-zinc-100">Remuneration Rate:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-semibold text-zinc-700 print:text-black">
                        {Number(assignment?.numSets) === 2
                          ? "Rs. 3,000/- (for setting two Question Papers: Set A & Set B)"
                          : "Rs. 2,000/- (for setting a single Question Paper: Set A)"}
                      </td>
                    </tr>
                    <tr className="bg-amber-50 print:bg-amber-50/40">
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-black text-zinc-900 print:text-black">Total Remuneration Claim Payable:</td>
                      <td className="border border-zinc-900 p-2 sm:p-2.5 print:py-1 print:px-2 font-black text-emerald-800 print:text-black text-sm">
                        ₹{Number(assignment?.numSets) === 2 ? "3,000" : "2,000"} /-
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* IV. Declaration & Setter Signature */}
              <div className="pt-3 print:pt-2 border-t border-zinc-300 flex items-end justify-between text-xs font-sans text-zinc-700 print:text-black">
                <div className="space-y-0.5">
                  <span className="block font-bold">Paper Setter Signature:</span>
                  {signatureUrl ? (
                    <img src={signatureUrl} alt="Setter Signature" className="h-9 print:h-8 object-contain mt-0.5" />
                  ) : (
                    <span className="italic text-zinc-400">Digitally Verified & Signed</span>
                  )}
                  <span className="block text-[11px] text-zinc-500 print:text-black font-semibold">{claimBillData.setterName}</span>
                </div>
                <div className="text-right space-y-1">
                  <span className="block text-[11px] text-zinc-500 print:text-black font-semibold">
                    Date: {assignment?.paperSubmittedAt ? new Date(assignment.paperSubmittedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 print:bg-emerald-50/50 print:text-emerald-950 print:border-emerald-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 print:text-emerald-700" />
                    {isSubmitted ? "Transmitted to COE ✓" : "Pending Final Submission"}
                  </span>
                </div>
              </div>

            </div>

            {/* Modal Footer Controls */}
            {isSubmitted ? (
              <div className="bg-zinc-100 p-4 px-6 border-t border-zinc-300 flex items-center justify-between gap-3 shrink-0 print:hidden font-sans">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-zinc-700">Official Claim Bill Submitted & Locked (Read-Only)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintClaimBill}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Print Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClaimBillModal(false)}
                    className="px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-100 p-4 px-6 border-t border-zinc-300 flex items-center justify-between gap-3 shrink-0 print:hidden font-sans">
                <button
                  type="button"
                  onClick={() => {
                    if (claimBillStep === "verify") {
                      setClaimBillStep("form");
                    } else {
                      setShowClaimBillModal(false);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-xs font-bold transition-all cursor-pointer"
                >
                  {claimBillStep === "verify" ? "← Edit Claim Details" : "Cancel / Return"}
                </button>

                {claimBillStep === "form" ? (
                  <button
                    type="button"
                    onClick={handleVerifyClaimDetails}
                    className="px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Verify Details & Proceed</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalSubmitToCoe}
                    disabled={submittingToCoe}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {submittingToCoe ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Transmitting to COE...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Confirm & Final Submit to COE</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. AI QUESTION PAPER CROSS-SET SIMILARITY & DUPLICATE INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in font-sans">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 border-b border-indigo-900/50 relative shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                      <Cpu className="h-3 w-3" /> AI Semantic Engine
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono border border-white/10">
                      Cross-Set Conceptual Matrix
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-300 animate-pulse" />
                    AI-Based Question Paper (Set A & Set B) Similarity Analysis
                  </h2>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Automated semantic evaluation between {assignment?.subjectCode} Set A and Set B to ensure comprehensive syllabus coverage and question uniqueness.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRunAiSimilarityCheck(true)}
                    disabled={isComparingAi}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Re-run permutation similarity analysis"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isComparingAi ? "animate-spin text-amber-300" : ""}`} />
                    <span>{isComparingAi ? "Analyzing..." : "Re-run Analysis"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAiModal(false)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5 bg-slate-50/60">
              {isComparingAi ? (
                <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-3xl bg-indigo-100 flex items-center justify-center animate-pulse">
                      <Cpu className="h-8 w-8 text-[#120c7a] animate-spin" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-slate-950" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">Running Qwen 2.5 Semantic Analysis...</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Evaluating conceptual uniqueness and question independence between Set A and Set B questions.
                    </p>
                  </div>
                </div>
              ) : !aiSimilarityResult ? (
                <div className="py-16 text-center border-2 border-dashed border-zinc-300 rounded-3xl p-8 space-y-3">
                  <Cpu className="h-10 w-10 mx-auto text-indigo-400" />
                  <p className="font-extrabold text-zinc-800 text-sm">No AI Similarity Analysis Recorded Yet</p>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto">
                    Click "Run AI Analysis" below to cross-compare all Set A questions against Set B questions using the Qwen AI model.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRunAiSimilarityCheck(true)}
                    className="mt-2 px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-black text-xs inline-flex items-center gap-2 shadow-md cursor-pointer transition-all"
                  >
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Run AI Analysis Now</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Top Score Cards Grid - 3 Focused Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* 1. Overall Similarity Score Card */}
                    <div className={`p-4 rounded-2xl border transition-all ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0
                      ? "bg-emerald-50/80 border-emerald-200"
                      : "bg-rose-50/80 border-rose-200 shadow-sm"
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                          Overall Similarity
                        </span>
                        {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 ? "text-emerald-700" : "text-rose-700"
                          }`}>
                          {aiSimilarityResult.overallSimilarityPercent}%
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          (Max limit: ≤ 25.0%)
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0
                          ? "bg-emerald-200 text-emerald-900"
                          : "bg-rose-200 text-rose-900"
                          }`}>
                          {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0
                            ? "PASSED • Independent Sets"
                            : "EXCEEDS 25.0% LIMIT"}
                        </span>
                      </div>
                    </div>

                    {/* 2. Duplicate Questions Card (>= 75%) */}
                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                          Duplicate Questions (≥ 90%)
                        </span>
                        <Zap className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${Number(aiSimilarityResult.duplicateCount) === 0 ? "text-emerald-700" : "text-rose-700"
                          }`}>
                          {aiSimilarityResult.duplicateCount || 0}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">Questions</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-slate-500">
                        {Number(aiSimilarityResult.duplicateCount) === 0 ? "Zero duplicate questions ✓" : "Needs revision in Set B"}
                      </div>
                    </div>

                    {/* 3. Autonomous Academic Standards Card */}
                    <div className={`p-4 rounded-2xl border transition-all ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                      ? "bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200"
                      : "bg-amber-50/80 border-amber-200"
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                          Examination Compliance
                        </span>
                        <Award className="h-4 w-4 text-[#120c7a]" />
                      </div>
                      <div className="text-base font-black text-[#120c7a]">
                        {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                          ? "Approved for COE"
                          : "Revision Required"}
                      </div>
                      <div className="mt-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-200 text-amber-900"
                          }`}>
                          {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                            ? "Meets Autonomous Standards"
                            : "Revise Set B to Forward"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Academic Policy Banner */}
                  <div className={`p-4 rounded-2xl border text-xs font-medium flex items-start gap-3 shadow-2xs ${Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                    ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
                    : "bg-amber-50/90 border-amber-300 text-amber-950"
                    }`}>
                    {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-black text-sm mb-0.5">
                        {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                          ? "Autonomous Academic Standards Satisfied"
                          : "Action Required: Conceptual Overlap Exceeds Permitted 25.0% Threshold"}
                      </div>
                      <p className="leading-relaxed">
                        {Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0
                          ? `Both Question Paper Set A and Set B demonstrate conceptual independence and diverse syllabus assessment with an overall similarity of ${aiSimilarityResult.overallSimilarityPercent}%, which strictly satisfies the autonomous 25.0% uniqueness criteria. You may proceed to submit both question papers to the Office of the Controller of Examinations.`
                          : `Autonomous examination regulations require Question Paper Set A and Set B to be mutually distinct and independent assessments with overall similarity strictly below 25.0%. Currently, overall similarity is recorded at ${aiSimilarityResult.overallSimilarityPercent}%. Please review the duplicate question(s) flagged below and reframe or replace them in Set B before final submission.`}
                      </p>
                    </div>
                  </div>

                  {/* Questions Section Title */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Duplicate Questions Requiring Revision (≥ 90% Similarity)
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${(aiSimilarityResult.detailedMatches?.length || 0) === 0
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                        }`}>
                        {aiSimilarityResult.detailedMatches?.length || 0} Flagged
                      </span>
                    </div>
                  </div>

                  {/* Comparisons List (Only Questions >= 90%) */}
                  <div className="space-y-3.5">
                    {(!aiSimilarityResult.detailedMatches || aiSimilarityResult.detailedMatches.length === 0) ? (
                      <div className="py-12 text-center bg-white rounded-2xl border border-emerald-200 p-8 shadow-2xs space-y-2">
                        <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <h4 className="font-extrabold text-slate-800 text-sm">
                          Zero Duplicate Questions Detected (≥ 90%)
                        </h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                          All questions in Set B are conceptually distinct and unique when compared against Set A. Both question papers meet autonomous examination standards.
                        </p>
                      </div>
                    ) : (
                      aiSimilarityResult.detailedMatches.map((match, idx) => {
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl border bg-rose-50/40 border-rose-300 shadow-2xs transition-all"
                          >
                            {/* Card Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-[#120c7a] px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200">
                                  Set B • {match.setB_qNo}
                                </span>
                                <span className="text-slate-400 font-bold text-[11px]">
                                  ({match.setB_part})
                                </span>
                              </div>

                              {/* Center Similarity Metric */}
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-black flex items-center gap-1 shadow-2xs bg-rose-600 text-white">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>{match.similarityPercent}% Similarity</span>
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-bold text-[11px]">
                                  Matched with ({match.matched_setA_part})
                                </span>
                                <span className="font-black text-slate-800 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200">
                                  Set A • {match.matched_setA_qNo}
                                </span>
                              </div>
                            </div>

                            {/* Card Body: Side-by-Side Question Texts */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 text-xs leading-relaxed">
                              {/* Set B Question Text */}
                              <div className="p-3 rounded-xl border bg-rose-100/40 border-rose-200 text-rose-950 font-medium">
                                <div className="text-[10px] font-black uppercase text-rose-900 tracking-wider mb-1 flex items-center justify-between">
                                  <span>Question in Set B:</span>
                                  <span className="text-rose-600 font-bold">Needs Revision</span>
                                </div>
                                <div className="line-clamp-4">{stripHtmlForAi(match.setB_text)}</div>
                              </div>

                              {/* Set A Matched Question Text */}
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                                <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">
                                  Corresponding Question in Set A:
                                </div>
                                <div className="line-clamp-4">{stripHtmlForAi(match.matched_setA_text)}</div>
                              </div>
                            </div>

                            {/* AI Reason for Flagging */}
                            {match.aiReason && (
                              <div className="mt-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                                <span className="font-bold text-[#120c7a] shrink-0">AI Evaluation:</span>
                                <span className="leading-relaxed">{match.aiReason}</span>
                              </div>
                            )}

                            {/* Action Footer */}
                            <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
                              <span className="text-[11px] font-semibold text-slate-500">
                                ⚠️ Highly identical semantics. Reframe or replace this question in Set B.
                              </span>

                              <button
                                type="button"
                                onClick={() => handleJumpToEditQuestion(match.setB_qNo)}
                                className="px-3 py-1.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              >
                                <Edit3 className="h-3.5 w-3.5 text-amber-300" />
                                <span>Edit {match.setB_qNo} in Set B</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0 text-xs">
              <div className="flex items-center gap-2 text-slate-600 font-semibold">
                <ShieldCheck className="h-4 w-4 text-[#120c7a]" />
                <span>Autonomous Exam Board • Automated Plagiarism & Duplicate Prevention</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 transition-all cursor-pointer"
                >
                  Close Inspector
                </button>

                {aiSimilarityResult && Number(aiSimilarityResult.overallSimilarityPercent) > 25.0 ? (
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 font-extrabold text-xs shadow-2xs">
                    <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 animate-pulse" />
                    <span>COE Forwarding Locked ({aiSimilarityResult.overallSimilarityPercent}% &gt; 25.0%) — Fix Duplicates in Set B</span>
                  </div>
                ) : aiSimilarityResult && Number(aiSimilarityResult.overallSimilarityPercent) <= 25.0 && Number(aiSimilarityResult.duplicateCount) === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAiModal(false);
                      setClaimBillStep("form");
                      setShowClaimBillModal(true);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Proceed to Forward Papers to COE</span>
                  </button>
                ) : null}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL-SCREEN SCREEN-LOCKING & BLUR OVERLAY (DURING AI ANALYSIS) */}
      {/* Strictly blocks all user interactions & blurs screen until AI analysis returns */}
      {/* ========================================================================= */}
      {isComparingAi && (
        <div
          className="fixed inset-0 z-[999999] bg-[#0c0852]/80 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-white cursor-wait select-none overflow-hidden animate-in fade-in duration-300"
          style={{ pointerEvents: "all" }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        >
          {/* Ambient Lighting Background Orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

          {/* Central High-Tech Modal Card */}
          <div className="relative z-10 w-full max-w-lg bg-gradient-to-br from-[#120c7a] via-[#1a129e] to-[#0c0852] border border-blue-400/40 rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6">

            {/* Institution Crest Branding */}
            <div className="flex items-center justify-center gap-3 bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-lg border border-white/60 mx-auto w-fit">
              <img
                src="/ckcet_logo_badge.png"
                alt="CKCET Logo"
                className="h-10 sm:h-12 w-auto max-w-[240px] object-contain drop-shadow-xs"
                onError={(e) => { e.currentTarget.src = "/logo.png"; }}
              />
              <div className="h-6 w-px bg-slate-300" />
              <div className="text-left">
                <div className="text-[11px] font-black tracking-tight text-[#120c7a] uppercase">Office of the COE</div>
                <div className="text-[9px] font-bold text-slate-600">Autonomous Examination AI Engine</div>
              </div>
            </div>

            {/* Pulsing AI Neural Ring */}
            <div className="relative flex items-center justify-center py-2">
              <div className="absolute h-24 w-24 rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-amber-400 animate-spin opacity-75 blur-xs" />
              <div className="relative h-20 w-20 rounded-2xl bg-[#0c0852] border border-blue-300/40 flex items-center justify-center shadow-xl">
                <Cpu className="h-10 w-10 text-amber-300 animate-pulse" />
              </div>
            </div>

            {/* Heading & Information */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-black tracking-wider uppercase">
                <Sparkles className="h-3.5 w-3.5 text-amber-300 animate-spin" />
                AI Cross-Paper Analysis in Progress
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2 flex-wrap">
                <span>Evaluating Question Paper Semantics...</span>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-300/40 font-bold">
                  {aiElapsedSeconds}s elapsed
                </span>
              </h3>
              <p className="text-xs text-blue-200/90 leading-relaxed max-w-sm mx-auto">
                Comparing all <strong>Set A</strong> and <strong>Set B</strong> questions using the Qwen 2.5 AI Engine to guarantee autonomous assessment independence and syllabus coverage.
              </p>
            </div>

            {/* Screen Locked Notice Box */}
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Screen Temporarily Locked for Confidentiality</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-blue-100/80 font-medium">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Cross-comparing question permutation vectors ({aiElapsedSeconds}s elapsed)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span>Evaluating Bloom's Taxonomy &amp; Course Outcomes</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                  <span>Computing duplicate similarity index (&le; 25% policy)</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-blue-300/70 font-semibold italic">
              Please do not refresh or close your browser. The results will display automatically once analysis is complete.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}


