import { useEffect, useRef, useState } from "react";

const MATH_TEMPLATES = [
  // ── Basics ─────────────────────────────────────────────
  { cat: "Basics", label: "Fraction", icon: "⅟", latex: "\\frac{a}{b}" },
  { cat: "Basics", label: "Square Root", icon: "√", latex: "\\sqrt{x}" },
  { cat: "Basics", label: "n-th Root", icon: "ⁿ√", latex: "\\sqrt[n]{x}" },
  { cat: "Basics", label: "Superscript", icon: "x²", latex: "x^{2}" },
  { cat: "Basics", label: "Subscript", icon: "x₁", latex: "x_{1}" },
  { cat: "Basics", label: "Bracket", icon: "( )", latex: "\\left( a \\right)" },
  { cat: "Basics", label: "Square Brackets", icon: "[ ]", latex: "\\left[ a \\right]" },
  { cat: "Basics", label: "Braces", icon: "{ }", latex: "\\left\\{ a \\right\\}" },
  { cat: "Basics", label: "Absolute Value", icon: "| |", latex: "\\left| a \\right|" },
  { cat: "Basics", label: "Floor", icon: "⌊⌋", latex: "\\lfloor x \\rfloor" },
  { cat: "Basics", label: "Ceiling", icon: "⌈⌉", latex: "\\lceil x \\rceil" },
  { cat: "Basics", label: "Angle Brackets", icon: "⟨ ⟩", latex: "\\langle a \\rangle" },

  // ── Calculus ───────────────────────────────────────────
  { cat: "Calculus", label: "Definite Integral", icon: "∫ₐᵇ", latex: "\\int_{a}^{b} f(x) \\, dx" },
  { cat: "Calculus", label: "Indefinite Integral", icon: "∫", latex: "\\int f(x) \\, dx" },
  { cat: "Calculus", label: "Double Integral", icon: "∬", latex: "\\iint_{R} f(x,y) \\, dA" },
  { cat: "Calculus", label: "Triple Integral", icon: "∭", latex: "\\iiint_{V} f \\, dV" },
  { cat: "Calculus", label: "Line Integral", icon: "∮", latex: "\\oint_{C} f \\, ds" },
  { cat: "Calculus", label: "Derivative", icon: "dy/dx", latex: "\\frac{dy}{dx}" },
  { cat: "Calculus", label: "n-th Derivative", icon: "dⁿy", latex: "\\frac{d^{n}y}{dx^{n}}" },
  { cat: "Calculus", label: "Partial Derivative", icon: "∂", latex: "\\frac{\\partial f}{\\partial x}" },
  { cat: "Calculus", label: "Limit", icon: "lim", latex: "\\lim_{x \\to 0} f(x)" },
  { cat: "Calculus", label: "Limit to ∞", icon: "lim∞", latex: "\\lim_{x \\to \\infty}" },
  { cat: "Calculus", label: "Delta (diff)", icon: "Δy", latex: "\\Delta y" },
  { cat: "Calculus", label: "Nabla", icon: "∇", latex: "\\nabla f" },
  { cat: "Calculus", label: "Prime", icon: "f′", latex: "f'(x)" },

  // ── Matrices & Vectors ─────────────────────────────────
  { cat: "Matrix", label: "Matrix 2×2", icon: "⧛", latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
  { cat: "Matrix", label: "Matrix 3×3", icon: "⧚", latex: "\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}" },
  { cat: "Matrix", label: "Matrix 2×3", icon: "⧚", latex: "\\begin{bmatrix} a & b & c \\\\ d & e & f \\end{bmatrix}" },
  { cat: "Matrix", label: "Matrix 3×2", icon: "⧚", latex: "\\begin{bmatrix} a & b \\\\ c & d \\\\ e & f \\end{bmatrix}" },
  { cat: "Matrix", label: "Matrix 4×4", icon: "⧛", latex: "\\begin{bmatrix} a & b & c & d \\\\ e & f & g & h \\\\ i & j & k & l \\\\ m & n & o & p \\end{bmatrix}" },
  { cat: "Matrix", label: "Determinant", icon: "▌▌", latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}" },
  { cat: "Matrix", label: "Det 3×3", icon: "▌▌", latex: "\\begin{vmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{vmatrix}" },
  { cat: "Matrix", label: "Column Vector", icon: "( )", latex: "\\begin{pmatrix} x \\\\ y \\end{pmatrix}" },
  { cat: "Matrix", label: "Row Vector", icon: "[ ]", latex: "\\begin{bmatrix} x & y & z \\end{bmatrix}" },
  { cat: "Matrix", label: "Augmented", icon: "aug", latex: "\\left[\\begin{array}{cc|c} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\end{array}\\right]" },
  { cat: "Matrix", label: "Cases", icon: "cases", latex: "\\begin{cases} ax+b & x \\ge 0 \\\\ cx+d & x < 0 \\end{cases}" },
  { cat: "Matrix", label: "Vec", icon: "v⃗", latex: "\\vec{v}" },
  { cat: "Matrix", label: "Hat", icon: "x̂", latex: "\\hat{x}" },
  { cat: "Matrix", label: "Bar", icon: "x̄", latex: "\\bar{x}" },
  { cat: "Matrix", label: "Tilde", icon: "x̃", latex: "\\tilde{x}" },
  { cat: "Matrix", label: "Dot", icon: "ẋ", latex: "\\dot{x}" },
  { cat: "Matrix", label: "Double Dot", icon: "ẍ", latex: "\\ddot{x}" },
  { cat: "Matrix", label: "Overline", icon: "x̅", latex: "\\overline{ABC}" },
  { cat: "Matrix", label: "Underline", icon: "x̲", latex: "\\underline{x}" },
  { cat: "Matrix", label: "Tensor Product", icon: "⊗", latex: "A \\otimes B" },
  { cat: "Matrix", label: "Cross Product", icon: "×", latex: "\\vec{a} \\times \\vec{b}" },
  { cat: "Matrix", label: "Dot Product", icon: "·", latex: "\\vec{a} \\cdot \\vec{b}" },

  // ── Greek lowercase ────────────────────────────────────
  { cat: "Greek", label: "α Alpha", icon: "α", latex: "\\alpha" },
  { cat: "Greek", label: "β Beta", icon: "β", latex: "\\beta" },
  { cat: "Greek", label: "γ Gamma", icon: "γ", latex: "\\gamma" },
  { cat: "Greek", label: "δ Delta", icon: "δ", latex: "\\delta" },
  { cat: "Greek", label: "ε Epsilon", icon: "ε", latex: "\\varepsilon" },
  { cat: "Greek", label: "ϝ Digamma", icon: "ϝ", latex: "\\digamma" },
  { cat: "Greek", label: "ζ Zeta", icon: "ζ", latex: "\\zeta" },
  { cat: "Greek", label: "η Eta", icon: "η", latex: "\\eta" },
  { cat: "Greek", label: "θ Theta", icon: "θ", latex: "\\theta" },
  { cat: "Greek", label: "ϑ Vartheta", icon: "ϑ", latex: "\\vartheta" },
  { cat: "Greek", label: "ι Iota", icon: "ι", latex: "\\iota" },
  { cat: "Greek", label: "κ Kappa", icon: "κ", latex: "\\kappa" },
  { cat: "Greek", label: "λ Lambda", icon: "λ", latex: "\\lambda" },
  { cat: "Greek", label: "μ Mu", icon: "μ", latex: "\\mu" },
  { cat: "Greek", label: "ν Nu", icon: "ν", latex: "\\nu" },
  { cat: "Greek", label: "ξ Xi", icon: "ξ", latex: "\\xi" },
  { cat: "Greek", label: "π Pi", icon: "π", latex: "\\pi" },
  { cat: "Greek", label: "ρ Rho", icon: "ρ", latex: "\\rho" },
  { cat: "Greek", label: "σ Sigma", icon: "σ", latex: "\\sigma" },
  { cat: "Greek", label: "τ Tau", icon: "τ", latex: "\\tau" },
  { cat: "Greek", label: "υ Upsilon", icon: "υ", latex: "\\upsilon" },
  { cat: "Greek", label: "φ Phi", icon: "φ", latex: "\\varphi" },
  { cat: "Greek", label: "χ Chi", icon: "χ", latex: "\\chi" },
  { cat: "Greek", label: "ψ Psi", icon: "ψ", latex: "\\psi" },
  { cat: "Greek", label: "ω Omega", icon: "ω", latex: "\\omega" },

  // ── Greek uppercase ────────────────────────────────────
  { cat: "Greek", label: "Γ Gamma", icon: "Γ", latex: "\\Gamma" },
  { cat: "Greek", label: "Δ Delta", icon: "Δ", latex: "\\Delta" },
  { cat: "Greek", label: "Θ Theta", icon: "Θ", latex: "\\Theta" },
  { cat: "Greek", label: "Λ Lambda", icon: "Λ", latex: "\\Lambda" },
  { cat: "Greek", label: "Ξ Xi", icon: "Ξ", latex: "\\Xi" },
  { cat: "Greek", label: "Π Pi", icon: "Π", latex: "\\Pi" },
  { cat: "Greek", label: "Σ Sigma", icon: "Σ", latex: "\\Sigma" },
  { cat: "Greek", label: "Υ Upsilon", icon: "Υ", latex: "\\Upsilon" },
  { cat: "Greek", label: "Φ Phi", icon: "Φ", latex: "\\Phi" },
  { cat: "Greek", label: "Ψ Psi", icon: "Ψ", latex: "\\Psi" },
  { cat: "Greek", label: "Ω Omega", icon: "Ω", latex: "\\Omega" },

  // ── Relations & Operators ──────────────────────────────
  { cat: "Operators", label: "Plus ±", icon: "±", latex: "\\pm" },
  { cat: "Operators", label: "Minus ∓", icon: "∓", latex: "\\mp" },
  { cat: "Operators", label: "Multiply ×", icon: "×", latex: "\\times" },
  { cat: "Operators", label: "Divide ÷", icon: "÷", latex: "\\div" },
  { cat: "Operators", label: "Dot ·", icon: "·", latex: "\\cdot" },
  { cat: "Operators", label: "Star ∗", icon: "∗", latex: "\\ast" },
  { cat: "Operators", label: "Less/Equal ≤", icon: "≤", latex: "\\leq" },
  { cat: "Operators", label: "Greater/Equal ≥", icon: "≥", latex: "\\geq" },
  { cat: "Operators", label: "Not Equal ≠", icon: "≠", latex: "\\neq" },
  { cat: "Operators", label: "Approx ≈", icon: "≈", latex: "\\approx" },
  { cat: "Operators", label: "Congruent ≡", icon: "≡", latex: "\\equiv" },
  { cat: "Operators", label: "Proportional ∝", icon: "∝", latex: "\\propto" },
  { cat: "Operators", label: "Sim ~", icon: "~", latex: "\\sim" },
  { cat: "Operators", label: "Lt ≪", icon: "≪", latex: "\\ll" },
  { cat: "Operators", label: "Gt ≫", icon: "≫", latex: "\\gg" },
  { cat: "Operators", label: "Subset ⊂", icon: "⊂", latex: "\\subset" },
  { cat: "Operators", label: "Superset ⊃", icon: "⊃", latex: "\\supset" },
  { cat: "Operators", label: "SubsetEq ⊆", icon: "⊆", latex: "\\subseteq" },
  { cat: "Operators", label: "SupersetEq ⊇", icon: "⊇", latex: "\\supseteq" },
  { cat: "Operators", label: "Belongs ∈", icon: "∈", latex: "\\in" },
  { cat: "Operators", label: "Not Belongs ∉", icon: "∉", latex: "\\notin" },
  { cat: "Operators", label: "Contains ∋", icon: "∋", latex: "\\ni" },
  { cat: "Operators", label: "Union ∪", icon: "∪", latex: "\\cup" },
  { cat: "Operators", label: "Intersection ∩", icon: "∩", latex: "\\cap" },
  { cat: "Operators", label: "Empty Set ∅", icon: "∅", latex: "\\emptyset" },
  { cat: "Operators", label: "For All ∀", icon: "∀", latex: "\\forall" },
  { cat: "Operators", label: "Exists ∃", icon: "∃", latex: "\\exists" },
  { cat: "Operators", label: "Clubsuit ♣", icon: "♣", latex: "\\clubsuit" },

  // ── Arrows ─────────────────────────────────────────────
  { cat: "Arrows", label: "Arrow →", icon: "→", latex: "\\to" },
  { cat: "Arrows", label: "Left ←", icon: "←", latex: "\\leftarrow" },
  { cat: "Arrows", label: "Both ↔", icon: "↔", latex: "\\leftrightarrow" },
  { cat: "Arrows", label: "Mapsto ↦", icon: "↦", latex: "\\mapsto" },
  { cat: "Arrows", label: "Implies ⇒", icon: "⇒", latex: "\\Rightarrow" },
  { cat: "Arrows", label: "Implied ⇐", icon: "⇐", latex: "\\Leftarrow" },
  { cat: "Arrows", label: "Iff ⇔", icon: "⇔", latex: "\\Leftrightarrow" },
  { cat: "Arrows", label: "Long →", icon: "⟶", latex: "\\longrightarrow" },
  { cat: "Arrows", label: "Up ↑", icon: "↑", latex: "\\uparrow" },
  { cat: "Arrows", label: "Down ↓", icon: "↓", latex: "\\downarrow" },
  { cat: "Arrows", label: "UpDown ↕", icon: "↕", latex: "\\updownarrow" },
  { cat: "Arrows", label: "Right Harpoon", icon: "⇀", latex: "\\rightharpoonup" },
  { cat: "Arrows", label: "Left Harpoon", icon: "↼", latex: "\\leftharpoonup" },
  { cat: "Arrows", label: "Nearrow ↗", icon: "↗", latex: "\\nearrow" },
  { cat: "Arrows", label: "Searrow ↘", icon: "↘", latex: "\\searrow" },
  { cat: "Arrows", label: "Nwarrow ↖", icon: "↖", latex: "\\nwarrow" },
  { cat: "Arrows", label: "Swarrow ↙", icon: "↙", latex: "\\swarrow" },

  // ── Summation & Sequences ──────────────────────────────
  { cat: "Sum", label: "Summation", icon: "∑", latex: "\\sum_{i=1}^{n} x_i" },
  { cat: "Sum", label: "Sum (∞)", icon: "∑∞", latex: "\\sum_{n=1}^{\\infty} a_n" },
  { cat: "Sum", label: "Product", icon: "∏", latex: "\\prod_{i=1}^{n} x_i" },
  { cat: "Sum", label: "Coproduct", icon: "∐", latex: "\\coprod_{i=1}^{n}" },
  { cat: "Sum", label: "Union (char)", icon: "⨆", latex: "\\bigsqcup" },
  { cat: "Sum", label: "Vee (∨)", icon: "∨", latex: "\\bigvee" },
  { cat: "Sum", label: "Wedge (∧)", icon: "∧", latex: "\\bigwedge" },
  { cat: "Sum", label: "nu-mber sum ∑ₙ", icon: "∑", latex: "\\sum_{n=0}^{\\infty} \\frac{x^n}{n!}" },

  // ── Logic ──────────────────────────────────────────────
  { cat: "Logic", label: "And ∧", icon: "∧", latex: "p \\wedge q" },
  { cat: "Logic", label: "Or ∨", icon: "∨", latex: "p \\vee q" },
  { cat: "Logic", label: "Not ¬", icon: "¬", latex: "\\neg p" },
  { cat: "Logic", label: "Xor ⊕", icon: "⊕", latex: "p \\oplus q" },
  { cat: "Logic", label: "Implies →", icon: "→", latex: "p \\to q" },
  { cat: "Logic", label: "Biconditional", icon: "↔", latex: "p \\leftrightarrow q" },
  { cat: "Logic", label: "Therefore", icon: "∴", latex: "\\therefore" },
  { cat: "Logic", label: "Because", icon: "∵", latex: "\\because" },
  { cat: "Logic", label: "Models ⊨", icon: "⊨", latex: "\\vDash" },
  { cat: "Logic", label: "Turnstile ⊢", icon: "⊢", latex: "\\vdash" },

  // ── Geometry ───────────────────────────────────────────
  { cat: "Geometry", label: "Angle ∠", icon: "∠", latex: "\\angle ABC" },
  { cat: "Geometry", label: "Perpendicular ⊥", icon: "⊥", latex: "a \\perp b" },
  { cat: "Geometry", label: "Parallel ∥", icon: "∥", latex: "\\parallel" },
  { cat: "Geometry", label: "Triangle", icon: "△", latex: "\\triangle" },
  { cat: "Geometry", label: "Degree °", icon: "°", latex: "90^{\\circ}" },
  { cat: "Geometry", label: "Similar ∼", icon: "∼", latex: "\\sim" },
  { cat: "Geometry", label: "Arc ⌒", icon: "⌒", latex: "\\frown" },
  { cat: "Geometry", label: "Measured ∡", icon: "∡", latex: "\\measuredangle" },
  { cat: "Geometry", label: "Right Angle ∟", icon: "∟", latex: "\\lrcorner" },

  // ── Combinatorics & Statistics ─────────────────────────
  { cat: "Stats", label: "nCr", icon: "nCr", latex: "\\binom{n}{r}" },
  { cat: "Stats", label: "nPr", icon: "nPr", latex: "{}_nP_r" },
  { cat: "Stats", label: "Factorial", icon: "n!", latex: "n!" },
  { cat: "Stats", label: "Mean", icon: "x̄", latex: "\\bar{x}" },
  { cat: "Stats", label: "Variance", icon: "σ²", latex: "\\sigma^{2}" },
  { cat: "Stats", label: "Std Dev σ", icon: "σ", latex: "\\sigma" },
  { cat: "Stats", label: "Expected E", icon: "E[X]", latex: "E[X]" },
  { cat: "Stats", label: "Probability P", icon: "P(A)", latex: "P(A)" },
  { cat: "Stats", label: "Correlation ρ", icon: "ρ", latex: "\\rho" },
  { cat: "Stats", label: "Normal N", icon: "N", latex: "N(\\mu, \\sigma^{2})" },

  // ── Functions ──────────────────────────────────────────
  { cat: "Fns", label: "sin", icon: "sin", latex: "\\sin x" },
  { cat: "Fns", label: "cos", icon: "cos", latex: "\\cos x" },
  { cat: "Fns", label: "tan", icon: "tan", latex: "\\tan x" },
  { cat: "Fns", label: "cot", icon: "cot", latex: "\\cot x" },
  { cat: "Fns", label: "sec", icon: "sec", latex: "\\sec x" },
  { cat: "Fns", label: "cosec", icon: "cosec", latex: "\\csc x" },
  { cat: "Fns", label: "arcsin", icon: "sin⁻¹", latex: "\\sin^{-1} x" },
  { cat: "Fns", label: "arccos", icon: "cos⁻¹", latex: "\\cos^{-1} x" },
  { cat: "Fns", label: "arctan", icon: "tan⁻¹", latex: "\\tan^{-1} x" },
  { cat: "Fns", label: "sinh", icon: "sinh", latex: "\\sinh x" },
  { cat: "Fns", label: "cosh", icon: "cosh", latex: "\\cosh x" },
  { cat: "Fns", label: "tanh", icon: "tanh", latex: "\\tanh x" },
  { cat: "Fns", label: "log", icon: "log", latex: "\\log x" },
  { cat: "Fns", label: "ln", icon: "ln", latex: "\\ln x" },
  { cat: "Fns", label: "exp", icon: "eˣ", latex: "e^{x}" },
  { cat: "Fns", label: "log_b", icon: "logᵦ", latex: "\\log_{b} x" },
  { cat: "Fns", label: "floor", icon: "⌊x⌋", latex: "\\lfloor x \\rfloor" },
  { cat: "Fns", label: "ceil", icon: "⌈x⌉", latex: "\\lceil x \\rceil" },

  // ── Greek Relation & Misc ──────────────────────────────
  { cat: "Misc", label: "Infinity ∞", icon: "∞", latex: "\\infty" },
  { cat: "Misc", label: "Partial ∂", icon: "∂", latex: "\\partial" },
  { cat: "Misc", label: "Nabla ∇", icon: "∇", latex: "\\nabla" },
  { cat: "Misc", label: "H Bar ħ", icon: "ħ", latex: "\\hbar" },
  { cat: "Misc", label: "Degree °", icon: "°", latex: "^{\\circ}" },
  { cat: "Misc", label: "Percent %", icon: "%", latex: "\\%" },
  { cat: "Misc", label: "Per mille ‰", icon: "‰", latex: "\\text{\\textperthousand}" },
  { cat: "Misc", label: "Prime ′", icon: "′", latex: "^{\\prime}" },
  { cat: "Misc", label: "Minute ′", icon: "′", latex: "^{\\prime}" },
  { cat: "Misc", label: "Second ″", icon: "″", latex: "^{\\prime\\prime}" },
  { cat: "Misc", label: "Real ℜ", icon: "ℜ", latex: "\\Re" },
  { cat: "Misc", label: "Imag ℑ", icon: "ℑ", latex: "\\Im" },
  { cat: "Misc", label: "Natural ℕ", icon: "ℕ", latex: "\\mathbb{N}" },
  { cat: "Misc", label: "Integer ℤ", icon: "ℤ", latex: "\\mathbb{Z}" },
  { cat: "Misc", label: "Rational ℚ", icon: "ℚ", latex: "\\mathbb{Q}" },
  { cat: "Misc", label: "Real ℝ", icon: "ℝ", latex: "\\mathbb{R}" },
  { cat: "Misc", label: "Complex ℂ", icon: "ℂ", latex: "\\mathbb{C}" },
  { cat: "Misc", label: "Ellipsis …", icon: "…", latex: "\\ldots" },
  { cat: "Misc", label: "Cdots ⋯", icon: "⋯", latex: "\\cdots" },
  { cat: "Misc", label: "Vdots ⋮", icon: "⋮", latex: "\\vdots" },
  { cat: "Misc", label: "Ddots ⋱", icon: "⋱", latex: "\\ddots" },
  { cat: "Misc", label: "Sqrt ∛", icon: "∛", latex: "\\sqrt[3]{x}" },
  { cat: "Misc", label: "Sqrt ∜", icon: "∜", latex: "\\sqrt[4]{x}" },
];

const CATEGORY_LABELS = {
  Basics: "Basics",
  Calculus: "Calculus",
  Matrix: "Matrices & Vectors",
  Greek: "Greek Letters",
  Operators: "Relations & Sets",
  Arrows: "Arrows",
  Sum: "Summation & Product",
  Logic: "Logic",
  Geometry: "Geometry",
  Stats: "Combinatorics & Stats",
  Fns: "Functions",
  Misc: "Miscellaneous",
};

const CATEGORY_ORDER = [
  "Basics", "Calculus", "Matrix", "Greek", "Operators", "Arrows",
  "Sum", "Logic", "Geometry", "Stats", "Fns", "Misc",
];

const MathTemplateToolbar = ({ editorId }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      requestAnimationFrame(() => searchRef.current.focus());
    }
  }, [open]);

  const insertTemplate = (latex) => {
    setOpen(false);
    setQuery("");
    const editor = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances[editorId];
    if (!editor || editor.status !== 'ready' || typeof editor.editable !== 'function' || !editor.editable()) return;

    const hasWidget = editor.widgets && editor.widgets.registered && editor.widgets.registered.mathjax;
    const cleanLatex = (window.CKEDITOR && window.CKEDITOR.tools && window.CKEDITOR.tools.htmlEncode)
      ? window.CKEDITOR.tools.htmlEncode(latex)
      : latex;
    const mathHtml = '<span class="math-tex">\\(' + cleanLatex + '\\)</span>';

    try {
      if (editor.focus) editor.focus();
      if (hasWidget) {
        editor.insertHtml(mathHtml);
      } else {
        try { editor.execCommand("mathjax"); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.warn("CKEditor insertHtml error:", err);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredByQuery = normalizedQuery
    ? MATH_TEMPLATES.filter((t) =>
        (t.label + " " + t.latex + " " + t.icon + " " + (t.cat || "")).toLowerCase().includes(normalizedQuery)
      )
    : MATH_TEMPLATES;

  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      cat,
      items: filteredByQuery.filter((t) => t.cat === cat),
    }))
    .filter((g) => g.items.length > 0);

  const totalMatches = filteredByQuery.length;

  return (
    <div className="relative flex items-center gap-1 flex-wrap px-3 py-1.5 bg-slate-50 border-b border-slate-200" ref={panelRef}>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Math:</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); setQuery(""); }}
        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#120c7a] text-white hover:bg-[#2a1f9e] transition-all flex items-center gap-1"
        title="Insert math equation template"
      >
        <span className="text-sm leading-none">Σ</span> Templates
      </button>
      {open && (
        <div className="absolute z-50 mt-2 top-full left-0 w-[720px] max-w-[92vw] max-h-[70vh] overflow-hidden bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbols (alpha, matrix, integral, ≤ …)"
              className="flex-1 min-w-[180px] px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-[10px] text-slate-400 font-semibold">
              {normalizedQuery ? `${totalMatches} matched` : `${MATH_TEMPLATES.length} symbols`}
            </span>
          </div>
          <div className="overflow-y-auto p-2">
            {totalMatches === 0 && (
              <div className="text-xs text-slate-400 text-center py-8">No symbols found. Try "alpha", "matrix", "int".</div>
            )}
            {grouped.map((g) => (
              <div key={g.cat} className="mb-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1 py-1">
                  {CATEGORY_LABELS[g.cat] || g.cat}
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
                  {g.items.map((tpl, i) => (
                    <button
                      key={g.cat + i}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); insertTemplate(tpl.latex); }}
                      className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-all group"
                      title={`${tpl.label}: ${tpl.latex}`}
                    >
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 leading-none">{tpl.icon}</span>
                      <span className="text-[8px] text-slate-400 group-hover:text-blue-600 leading-none text-center">{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MathTemplateToolbar;