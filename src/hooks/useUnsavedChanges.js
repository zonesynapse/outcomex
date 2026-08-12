import { useEffect } from "react";

/**
 * Custom hook to prevent accidental data loss from browser reloads, back navigation, or tab closing.
 * @param {boolean} isDirty - Set to true when user has unsaved changes in form/page.
 * @param {string} message - Optional message for unload prompt.
 */
export function useUnsavedChanges(isDirty = false, message = "You have unsaved changes! Are you sure you want to leave?") {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = message; // Standard browser beforeunload prompt
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, message]);
}

export default useUnsavedChanges;
