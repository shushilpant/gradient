import { useState, useEffect } from 'preact/hooks';
import { PANEL_STYLES } from './styles.js';
import { DashboardView } from './DashboardView.js';
import { AssignmentView } from './AssignmentView.js';
import { SettingsView } from './SettingsView.js';
import { getFixtureCourses } from '../fixtureData.js';
import {
  type CourseOptimizationInput,
  DEFAULT_TASK_PRIORS,
  type TaskTypePrior,
} from '../../core/optimiser.js';

interface AppProps {
  initialUrl?: string;
  isFixtureMode?: boolean;
}

export function App({ initialUrl = '', isFixtureMode = true }: AppProps) {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'assignment' | 'settings'>('dashboard');
  const [detailLevel, setDetailLevel] = useState<'a_bit' | 'a_bit_more' | 'all_in'>('a_bit_more');

  // Optimization & Preferences state
  const [capacityHours, setCapacityHours] = useState<number>(10.0);
  const [protectMastery, setProtectMastery] = useState<boolean>(true);
  const [masteryFloorHours, setMasteryFloorHours] = useState<number>(0.5);
  const [priors, setPriors] = useState<Record<string, TaskTypePrior>>(DEFAULT_TASK_PRIORS);

  // Credit hours mapping
  const [creditHoursMap, setCreditHoursMap] = useState<Record<string, number>>({
    '99001': 4.0, // CS 101
    '99002': 3.0, // MATH 201
    '99003': 4.0, // BIO 110
  });

  // Selected Assignment Navigation
  const [selectedCourseId, setSelectedCourseId] = useState<string>('99001');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('1008');

  // Load course inputs
  const [courses, setCourses] = useState<CourseOptimizationInput[]>(() =>
    isFixtureMode ? getFixtureCourses() : []
  );

  useEffect(() => {
    if (courses.length === 0) {
      // In fixture mode or sandbox, load synthetic multi-course bundle
      const loaded = getFixtureCourses();
      setCourses(loaded);
    }

    // Auto-detect page URL structure
    const url = initialUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const assignMatch = url.match(/\/courses\/(\d+)\/assignments\/(\d+)/);
    if (assignMatch && assignMatch[1] && assignMatch[2]) {
      setSelectedCourseId(assignMatch[1]);
      setSelectedAssignmentId(assignMatch[2]);
      setActiveTab('assignment');
    }
  }, [initialUrl, isFixtureMode]);

  const handleSelectAssignment = (courseId: string, assignmentId: string) => {
    setSelectedCourseId(courseId);
    setSelectedAssignmentId(assignmentId);
    setActiveTab('assignment');
  };

  const handleCreditHoursChange = (courseId: string, hours: number) => {
    setCreditHoursMap((prev) => ({ ...prev, [courseId]: hours }));
    setCourses((prev) =>
      prev.map((c) =>
        String(c.course.id) === String(courseId)
          ? { ...c, course: { ...c.course, creditHours: hours } }
          : c
      )
    );
  };

  return (
    <div>
      <style>{PANEL_STYLES}</style>
      <div
        id="gradient-panel-shell"
        class={`gradient-shell ${isMinimized ? 'minimized' : ''}`}
        role="complementary"
        aria-label="GRADIENT Study Companion"
      >
        {/* Header */}
        <div class="gradient-header" onClick={() => isMinimized && setIsMinimized(false)}>
          <div class="gradient-brand">
            <span>GRADIENT</span>
            <span class="gradient-brand-pill">v0.1</span>
          </div>
          <div class="header-actions">
            <button
              id="gradient-toggle-minimize"
              class="header-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              aria-label={isMinimized ? 'Expand GRADIENT Side Panel' : 'Minimize GRADIENT Side Panel'}
            >
              {isMinimized ? 'Expand' : '−'}
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Detail Level Selector */}
            <div class="detail-bar" role="region" aria-label="Support Depth Control">
              <div class="detail-bar-header">
                <span>Support Depth</span>
                <span class="detail-disclaimer">Critique only • Zero ghostwriting</span>
              </div>
              <div class="detail-buttons" role="radiogroup" aria-label="Support Depth Selection">
                <button
                  id="gradient-detail-a-bit"
                  class={`detail-btn ${detailLevel === 'a_bit' ? 'active' : ''}`}
                  onClick={() => setDetailLevel('a_bit')}
                  role="radio"
                  aria-checked={detailLevel === 'a_bit'}
                >
                  a bit
                </button>
                <button
                  id="gradient-detail-a-bit-more"
                  class={`detail-btn ${detailLevel === 'a_bit_more' ? 'active' : ''}`}
                  onClick={() => setDetailLevel('a_bit_more')}
                  role="radio"
                  aria-checked={detailLevel === 'a_bit_more'}
                >
                  a bit more
                </button>
                <button
                  id="gradient-detail-all-in"
                  class={`detail-btn ${detailLevel === 'all_in' ? 'active' : ''}`}
                  onClick={() => setDetailLevel('all_in')}
                  role="radio"
                  aria-checked={detailLevel === 'all_in'}
                >
                  all in
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div class="nav-tabs" role="tablist" aria-label="GRADIENT Views">
              <button
                id="tab-dashboard"
                class={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
                role="tab"
                aria-selected={activeTab === 'dashboard'}
              >
                Dashboard
              </button>
              <button
                id="tab-assignment"
                class={`nav-tab ${activeTab === 'assignment' ? 'active' : ''}`}
                onClick={() => setActiveTab('assignment')}
                role="tab"
                aria-selected={activeTab === 'assignment'}
              >
                Assignment
              </button>
              <button
                id="tab-settings"
                class={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
                role="tab"
                aria-selected={activeTab === 'settings'}
              >
                Settings
              </button>
            </div>

            {/* Panel Body */}
            <div class="panel-body">
              {activeTab === 'dashboard' && (
                <DashboardView
                  capacityHours={capacityHours}
                  onCapacityChange={setCapacityHours}
                  detailLevel={detailLevel}
                  courses={courses}
                  protectMastery={protectMastery}
                  masteryFloorHours={masteryFloorHours}
                  customPriors={priors}
                  onSelectAssignment={handleSelectAssignment}
                />
              )}

              {activeTab === 'assignment' && (
                <AssignmentView
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  selectedAssignmentId={selectedAssignmentId}
                  detailLevel={detailLevel}
                  onSelectAssignment={handleSelectAssignment}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  creditHoursMap={creditHoursMap}
                  onCreditHoursChange={handleCreditHoursChange}
                  protectMastery={protectMastery}
                  onProtectMasteryChange={setProtectMastery}
                  masteryFloorHours={masteryFloorHours}
                  onMasteryFloorHoursChange={setMasteryFloorHours}
                  priors={priors}
                  onPriorsChange={setPriors}
                  courses={courses.map((c) => ({ id: String(c.course.id), name: c.course.name }))}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
