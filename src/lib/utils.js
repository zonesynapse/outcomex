import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging tailwind classes
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function sanitizeKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]]/g, '_');
}

export function formatProgrammeKey(p) {
  if (!p) return "";
  if (p === 'B.E.') return 'B_E';
  if (p === 'B.Tech.') return 'B_Tech';
  if (p === 'M.E.') return 'M_E';
  if (p === 'M.Tech.') return 'M_Tech';
  return String(p).replace(/[.#$[\]]/g, '_');
}

export function formatProgDisplay(prog) {
  if (prog === 'B_E') return 'B.E.';
  if (prog === 'B_Tech') return 'B.Tech.';
  if (prog === 'M_E') return 'M.E.';
  if (prog === 'M_Tech') return 'M.Tech.';
  return prog;
}

export function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatBatchDisplay(batch) {
  if (!batch) return "";
  const parts = batch.split("-");
  const startYear = parseInt(parts[0]);
  if (isNaN(startYear)) return batch;
  const lastTwo = startYear % 100;
  
  let range = batch;
  if (parts.length === 2) {
    const endYear = parts[1];
    if (endYear.length === 4) {
      range = `${parts[0]}-${endYear.slice(-2)}`;
    }
  }
  
  return `${lastTwo} Batch (${range})`;
}

export function getRecentBatches(duration = 4) {
  const currentYear = new Date().getFullYear();
  const batches = [];
  // Show batches from 4 years ago to 1 year ahead
  for (let start = currentYear - 4; start <= currentYear + 1; start++) {
    const end = start + (parseInt(duration) || 4);
    batches.push(`${start}-${end}`);
  }
  return batches;
}

export function getAcademicYears(batch) {
  if (!batch) return [];
  const parts = batch.split("-").map(Number);
  const start = parts[0];
  const end = parts[1];
  const duration = end - start;
  return Array.from({ length: duration }, (_, i) => `${start + i}-${start + i + 1}`);
}
