/**
 * Utility to trigger MathJax Typeset on DOM containers.
 * Useful for rendering LaTeX math formulas outside of CKEditor (tables, previews, cards)
 * and inside CKEditor iframe body containers.
 */
export const typesetMath = (containerElement = null) => {
  if (typeof window === 'undefined') return;

  const getTargets = () => {
    return containerElement ? [containerElement] : [document.body];
  };

  const runTypeset = () => {
    const targets = getTargets();
    targets.forEach(target => {
      if (!target) return;

      // MathJax 2.x
      if (window.MathJax?.Hub && typeof window.MathJax.Hub.Queue === 'function') {
        try {
          window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, target]);
        } catch (e) {
          console.warn('MathJax 2.x typesetting error:', e);
        }
      }
      // MathJax 3.x
      else if (window.MathJax?.typesetPromise && typeof window.MathJax.typesetPromise === 'function') {
        try {
          window.MathJax.typesetPromise([target]).catch(e => console.warn('MathJax 3.x error:', e));
        } catch (e) {}
      } else if (window.MathJax?.typeset && typeof window.MathJax.typeset === 'function') {
        try {
          window.MathJax.typeset([target]);
        } catch (e) {}
      }
    });
  };

  // Immediate attempt
  runTypeset();

  // Retry with staggered delays to handle async DOM rendering, CKEditor iframe updates, and Firestore draft fetches
  setTimeout(runTypeset, 100);
  setTimeout(runTypeset, 350);
  setTimeout(runTypeset, 800);
  setTimeout(runTypeset, 1500);
};
