/**
 * Canvas REST API Client
 * 
 * High-level typed client implementing the read-only Canvas LMS interface.
 * Delegates all network calls to canvasFetch, enforcing:
 * - Read-only GET invariant
 * - Rate-limit backoff
 * - IndexedDB caching with TTL
 * - Transparent request logging
 */

import {
  canvasFetch,
  canvasFetchAllPages,
  CanvasFetchOptions,
  CanvasReadOnlyViolationError,
} from './canvasFetch.js';

export {
  canvasFetch,
  canvasFetchAllPages,
  CanvasReadOnlyViolationError,
};

export const safeCanvasFetch = canvasFetch;

export class CanvasClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private resolveUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const origin = typeof window !== 'undefined' && window.location.origin.startsWith('http')
      ? window.location.origin
      : 'https://canvas.instructure.com';

    const url = new URL(
      endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`,
      origin
    );

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, String(value));
      }
    }

    return url.toString();
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options?: CanvasFetchOptions
  ): Promise<T> {
    const targetUrl = this.resolveUrl(endpoint, params);
    const { data } = await canvasFetch<T>(targetUrl, options);
    return data;
  }

  async getAllPages<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options?: CanvasFetchOptions & { maxPages?: number }
  ): Promise<T[]> {
    const targetUrl = this.resolveUrl(endpoint, params);
    return canvasFetchAllPages<T>(targetUrl, options);
  }

  // --- Verified Canvas REST API Methods ---

  async fetchCourse(courseId: string | number, options?: CanvasFetchOptions): Promise<unknown> {
    return this.get(`/api/v1/courses/${courseId}`, {
      include: 'grading_scheme,total_scores,syllabus_body',
    }, options);
  }

  async fetchAssignmentGroups(courseId: string | number, options?: CanvasFetchOptions): Promise<unknown[]> {
    return this.getAllPages(`/api/v1/courses/${courseId}/assignment_groups`, {
      include: 'assignments,rules',
      per_page: 50,
    }, options);
  }

  async fetchAssignments(courseId: string | number, options?: CanvasFetchOptions): Promise<unknown[]> {
    return this.getAllPages(`/api/v1/courses/${courseId}/assignments`, {
      include: 'rubric,submission',
      per_page: 50,
    }, options);
  }

  async fetchSubmissions(courseId: string | number, options?: CanvasFetchOptions): Promise<unknown[]> {
    return this.getAllPages(`/api/v1/courses/${courseId}/students/submissions`, {
      student_ids: 'self',
      include: 'rubric_assessment',
      per_page: 50,
    }, options);
  }
}
