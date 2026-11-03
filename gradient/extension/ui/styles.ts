/**
 * GRADIENT Shadow-DOM Isolated Stylesheet
 * 
 * Strict encapsulation inside Shadow Root:
 * Zero CSS bleed into or from Canvas LMS.
 * High-contrast, WCAG AA compliant palette, keyboard accessibility focus rings.
 */

export const PANEL_STYLES = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #0f172a;
    -webkit-font-smoothing: antialiased;
  }

  .gradient-shell {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 440px;
    max-height: calc(100vh - 32px);
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483647;
    transition: width 0.2s ease, max-height 0.2s ease;
  }

  .gradient-shell.minimized {
    width: 240px;
    max-height: 48px;
  }

  /* Header */
  .gradient-header {
    padding: 10px 14px;
    background: #0f172a;
    color: #ffffff;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    border-bottom: 1px solid #1e293b;
  }

  .gradient-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
  }

  .gradient-brand-pill {
    font-size: 10px;
    font-weight: 700;
    background: #2563eb;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #cbd5e1;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .header-btn:hover, .header-btn:focus-visible {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
    outline: 2px solid #38bdf8;
  }

  /* Detail Level Selector */
  .detail-bar {
    background: #f1f5f9;
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-bar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #475569;
  }

  .detail-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    background: #e2e8f0;
    padding: 2px;
    border-radius: 6px;
  }

  .detail-btn {
    border: none;
    background: transparent;
    padding: 4px 6px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .detail-btn.active {
    background: #ffffff;
    color: #0f172a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .detail-btn:hover:not(.active) {
    background: rgba(255, 255, 255, 0.5);
  }

  .detail-disclaimer {
    font-size: 10px;
    color: #64748b;
    font-style: italic;
  }

  /* View Navigation Tabs */
  .nav-tabs {
    display: flex;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
  }

  .nav-tab {
    flex: 1;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-tab:hover {
    color: #0f172a;
    background: #f8fafc;
  }

  .nav-tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
    background: #ffffff;
  }

  .nav-tab:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  /* Panel Body */
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: #f8fafc;
  }

  /* Cards & Sections */
  .card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
  }

  /* Assumption Tooltip Underline */
  .assumption-val {
    border-bottom: 1px dotted #475569;
    cursor: help;
    font-weight: 600;
    color: #0f172a;
    transition: color 0.15s ease;
  }

  .assumption-val:hover {
    color: #2563eb;
    border-bottom-color: #2563eb;
  }

  /* Badges */
  .badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    line-height: 1.2;
  }

  .badge-success {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }

  .badge-warning {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }

  .badge-danger {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .badge-info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }

  /* Capacity Control */
  .capacity-control {
    background: #f1f5f9;
    padding: 10px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid #e2e8f0;
  }

  .capacity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .capacity-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .capacity-slider {
    flex: 1;
    cursor: pointer;
    accent-color: #2563eb;
  }

  .capacity-num-input {
    width: 60px;
    padding: 4px 6px;
    font-size: 13px;
    font-weight: 700;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    text-align: right;
  }

  /* Recommendation List */
  .rec-item {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.15s ease;
  }

  .rec-item:hover {
    border-color: #94a3b8;
  }

  .rec-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .rec-title {
    font-weight: 700;
    font-size: 12px;
    color: #0f172a;
  }

  .rec-course {
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
  }

  .rec-metrics {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #334155;
  }

  .rec-reason {
    font-size: 11px;
    color: #475569;
    line-height: 1.4;
    background: #ffffff;
    padding: 6px 8px;
    border-radius: 4px;
    border-left: 3px solid #2563eb;
  }

  /* Threshold Alerts */
  .alert-box {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-left: 4px solid #f59e0b;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 11px;
    color: #92400e;
    line-height: 1.4;
  }

  /* Course Grades Table */
  .grade-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .grade-table th {
    text-align: left;
    padding: 6px 8px;
    background: #f1f5f9;
    color: #475569;
    font-weight: 700;
    border-bottom: 1px solid #e2e8f0;
  }

  .grade-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: #0f172a;
  }

  /* Roadmap Placeholder */
  .roadmap-box {
    border: 1px dashed #94a3b8;
    background: #f8fafc;
    border-radius: 6px;
    padding: 10px;
    font-size: 11px;
    color: #64748b;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .roadmap-tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #2563eb;
    letter-spacing: 0.05em;
  }

  /* Rubric Table */
  .rubric-criteria {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rubric-card {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px;
    background: #ffffff;
  }

  .rubric-ratings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 6px;
    margin-top: 6px;
  }

  .rating-pill {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 6px;
    font-size: 10px;
  }

  /* Settings Form */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .form-label {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
  }

  .form-input {
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
  }

  .form-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    cursor: pointer;
  }

  /* Audit Log Drawer */
  .audit-log-container {
    max-height: 160px;
    overflow-y: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    background: #0f172a;
    color: #f8fafc;
    padding: 8px;
    border-radius: 6px;
  }

  .audit-log-row {
    padding: 2px 0;
    border-bottom: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
  }
`;

