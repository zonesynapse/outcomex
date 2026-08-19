/**
 * Utility to trigger MathJax Typeset on DOM containers.
 * Useful for rendering LaTeX math formulas outside of CKEditor (tables, previews, cards).
 */
export const typesetMath = (containerElement = null) => {
  if (typeof window === 'undefined') return;
  const target = containerElement || document.body;
  
  const runTypeset = () => {
    if (window.MathJax && window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
      try {
        window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, target]);
      } catch (e) {
        console.warn('MathJax typesetting error:', e);
      }
    }
  };

  // Immediate attempt
  runTypeset();

  // Short delay attempt in case DOM or MathJax is still rendering/loading
  setTimeout(runTypeset, 150);
  setTimeout(runTypeset, 500);
};
