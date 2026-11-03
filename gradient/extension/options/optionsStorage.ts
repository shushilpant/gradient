/**
 * Options Storage for GRADIENT Extension
 * 
 * Persists:
 * - Canvas host(s) list
 * - Credit hours per course
 * - Grade-point scale
 * - Selected detail level
 */

import { DEFAULT_GRADE_POINT_SCALE } from '../../core/schema.js';

export interface GradientOptions {
  canvasHosts: string[];
  courseCreditHours: Record<string, number>;
  gradePointScale: Record<string, number>;
  detailLevel: 'a_bit' | 'a_bit_more' | 'all_in';
}

export const DEFAULT_GRADIENT_OPTIONS: GradientOptions = {
  canvasHosts: [
    '*.instructure.com',
    'localhost',
    '127.0.0.1',
    'canvas.usm.edu',
  ],
  courseCreditHours: {
    'CS-101': 4.0,
    'MATH-201': 3.0,
    'BIO-110': 4.0,
  },
  gradePointScale: { ...DEFAULT_GRADE_POINT_SCALE },
  detailLevel: 'a_bit_more',
};

const STORAGE_KEY = 'gradient_user_options';

export async function loadOptions(): Promise<GradientOptions> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEY, (res) => {
        if (res && res[STORAGE_KEY]) {
          resolve({ ...DEFAULT_GRADIENT_OPTIONS, ...res[STORAGE_KEY] });
        } else {
          resolve({ ...DEFAULT_GRADIENT_OPTIONS });
        }
      });
    });
  }

  // Fallback to localStorage / in-memory
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return { ...DEFAULT_GRADIENT_OPTIONS, ...JSON.parse(raw) };
      } catch {
        // Fallback
      }
    }
  }

  return { ...DEFAULT_GRADIENT_OPTIONS };
}

export async function saveOptions(options: Partial<GradientOptions>): Promise<GradientOptions> {
  const current = await loadOptions();
  const updated: GradientOptions = { ...current, ...options };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    await new Promise<void>((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: updated }, () => resolve());
    });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return updated;
}

