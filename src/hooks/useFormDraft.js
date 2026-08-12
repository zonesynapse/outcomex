import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook to auto-save and restore form draft state to localStorage.
 * Prevents data loss during unexpected page reloads, browser crashes, or power cuts.
 * 
 * @param {string} draftKey - Unique storage key for this form/context (e.g. 'draft_qp_123')
 * @param {Object|Array} initialData - Initial empty or loaded form data
 * @param {boolean} enabled - Whether autosave is active
 * @returns {{ draftData: any, saveDraft: Function, clearDraft: Function, hasRestoredDraft: boolean }}
 */
export function useFormDraft(draftKey, initialData, enabled = true) {
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Restore draft on initial mount
  const getSavedDraft = useCallback(() => {
    if (!draftKey || typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(`outcomex_draft_${draftKey}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Ensure draft isn't older than 7 days
      if (parsed.timestamp && Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`outcomex_draft_${draftKey}`);
        return null;
      }
      return parsed.data;
    } catch (e) {
      console.warn("[FormDraft] Failed to parse saved draft:", e);
      return null;
    }
  }, [draftKey]);

  // Save current data into localStorage
  const saveDraft = useCallback((data) => {
    if (!draftKey || !enabled || typeof window === "undefined") return;
    try {
      const payload = JSON.stringify({
        timestamp: Date.now(),
        data
      });
      localStorage.setItem(`outcomex_draft_${draftKey}`, payload);
    } catch (e) {
      console.warn("[FormDraft] Storage write quota exceeded or failed:", e);
    }
  }, [draftKey, enabled]);

  // Clear draft after successful save/submit
  const clearDraft = useCallback(() => {
    if (!draftKey || typeof window === "undefined") return;
    try {
      localStorage.removeItem(`outcomex_draft_${draftKey}`);
    } catch (e) {
      console.warn("[FormDraft] Failed to clear draft:", e);
    }
  }, [draftKey]);

  return {
    getSavedDraft,
    saveDraft,
    clearDraft,
    hasRestoredDraft
  };
}

export default useFormDraft;
