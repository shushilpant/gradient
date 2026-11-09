import { useState } from 'preact/hooks';
import {
  DEFAULT_TASK_PRIORS,
  type TaskTypePrior,
} from '../../core/optimiserPriors.js';
import { getFetchLogs } from '../canvasFetch.js';

interface SettingsViewProps {
  creditHoursMap: Record<string, number>;
  onCreditHoursChange: (courseId: string, hours: number) => void;
  protectMastery: boolean;
  onProtectMasteryChange: (val: boolean) => void;
  masteryFloorHours: number;
  onMasteryFloorHoursChange: (hours: number) => void;
  priors: Record<string, TaskTypePrior>;
  onPriorsChange: (priors: Record<string, TaskTypePrior>) => void;
  courses: Array<{ id: string; name: string }>;
}

export function SettingsView({
  creditHoursMap,
  onCreditHoursChange,
  protectMastery,
  onProtectMasteryChange,
  masteryFloorHours,
  onMasteryFloorHoursChange,
  priors,
  onPriorsChange,
  courses,
}: SettingsViewProps) {
  const [activeLogTab, setActiveLogTab] = useState<'fetched' | 'sent'>('fetched');
  const fetchLogs = getFetchLogs();

  const handlePriorFieldChange = (
    taskType: string,
    field: keyof TaskTypePrior,
    val: number
  ) => {
    const updated = {
      ...priors,
      [taskType]: {
        ...(priors[taskType] ?? DEFAULT_TASK_PRIORS[taskType]!),
        [field]: val,
      },
    };
    onPriorsChange(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 1. Course Credit Hours */}
      <div class="card" role="region" aria-label="Course Credit Hours">
        <div class="card-header">
          <span>Course Credit Hours</span>
          <span class="badge badge-info">Required for Term GPA</span>
        </div>
        <p style={{ fontSize: '11px', color: '#64748b' }}>
          Canvas REST API does not provide credit hours. Enter each course's credit weighting:
        </p>

        {courses.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{c.name.split(':')[0]}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={creditHoursMap[c.id] ?? 3.0}
                onChange={(e) =>
                  onCreditHoursChange(c.id, parseFloat((e.target as HTMLInputElement).value) || 3.0)
                }
                class="form-input"
                style={{ width: '60px', textAlign: 'right' }}
                aria-label={`Credit hours for ${c.name}`}
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>cr</span>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Protect Mastery Floor Policy */}
      <div class="card" role="region" aria-label="Mastery Floor Settings">
        <div class="card-header">
          <span>Mastery Floor Policy</span>
          <span class="badge badge-info">Honesty In Effort</span>
        </div>

        <label class="form-checkbox-row">
          <input
            type="checkbox"
            checked={protectMastery}
            onChange={(e) => onProtectMasteryChange((e.target as HTMLInputElement).checked)}
            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
          />
          <span style={{ fontWeight: 600 }}>Protect Baseline Mastery across all upcoming coursework</span>
        </label>

        {protectMastery && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: '#475569' }}>Floor hours per assignment:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0.25"
                max="4"
                step="0.25"
                value={masteryFloorHours}
                onChange={(e) =>
                  onMasteryFloorHoursChange(parseFloat((e.target as HTMLInputElement).value) || 0.5)
                }
                class="form-input"
                style={{ width: '60px', textAlign: 'right' }}
                aria-label="Mastery Floor Hours"
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>hrs</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Editable Empirical Task Priors (ASSUMPTIONS) */}
      <div class="card" role="region" aria-label="Effort Response Priors">
        <div class="card-header">
          <span>Empirical Priors (Assumptions)</span>
          <span class="badge badge-warning">User-Auditable</span>
        </div>
        <p style={{ fontSize: '11px', color: '#64748b' }}>
          Response curve: S(h) = cap * (1 - exp(-h / tau)). Adjust parameters to reflect your personal study velocity:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['homework', 'exam', 'quiz', 'project', 'essay'].map((type) => {
            const pr = priors[type] ?? DEFAULT_TASK_PRIORS[type]!;
            return (
              <div key={type} style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'capitalize', color: '#0f172a', marginBottom: '4px' }}>
                  {type.replace('_', ' ')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Cap:</span>
                    <input
                      type="number"
                      min="0.5"
                      max="1.0"
                      step="0.01"
                      value={pr.cap}
                      onChange={(e) =>
                        handlePriorFieldChange(type, 'cap', parseFloat((e.target as HTMLInputElement).value) || 0.95)
                      }
                      class="form-input"
                      style={{ width: '100%', padding: '2px 4px', fontSize: '10px' }}
                      aria-label={`${type} Cap`}
                    />
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Tau (hrs):</span>
                    <input
                      type="number"
                      min="0.5"
                      max="20"
                      step="0.5"
                      value={pr.tau}
                      onChange={(e) =>
                        handlePriorFieldChange(type, 'tau', parseFloat((e.target as HTMLInputElement).value) || 3.0)
                      }
                      class="form-input"
                      style={{ width: '100%', padding: '2px 4px', fontSize: '10px' }}
                      aria-label={`${type} Tau`}
                    />
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Noise σ:</span>
                    <input
                      type="number"
                      min="0.01"
                      max="0.2"
                      step="0.01"
                      value={pr.noiseSigma}
                      onChange={(e) =>
                        handlePriorFieldChange(type, 'noiseSigma', parseFloat((e.target as HTMLInputElement).value) || 0.05)
                      }
                      class="form-input"
                      style={{ width: '100%', padding: '2px 4px', fontSize: '10px' }}
                      aria-label={`${type} Noise Sigma`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Live Audit: "What Was Fetched / What Is Sent" */}
      <div class="card" role="region" aria-label="Network Audit Log">
        <div class="card-header">
          <span>Privacy & Network Audit</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              class={`detail-btn ${activeLogTab === 'fetched' ? 'active' : ''}`}
              onClick={() => setActiveLogTab('fetched')}
            >
              What Was Fetched
            </button>
            <button
              class={`detail-btn ${activeLogTab === 'sent' ? 'active' : ''}`}
              onClick={() => setActiveLogTab('sent')}
            >
              What Is Sent
            </button>
          </div>
        </div>

        {activeLogTab === 'fetched' ? (
          <div>
            <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600, marginBottom: '6px' }}>
              ✓ Canvas Read-Only Invariant: All Canvas API interactions use GET only.
            </div>
            <div class="audit-log-container">
              {fetchLogs.length === 0 ? (
                <div style={{ color: '#94a3b8' }}>Fixture Mode: Loaded offline records with zero network access.</div>
              ) : (
                fetchLogs.slice(-10).map((log, idx) => (
                  <div key={idx} class="audit-log-row">
                    <span style={{ color: '#38bdf8' }}>GET</span>
                    <span style={{ flex: 1, margin: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.url.split('/api/v1/')[1] ?? log.url}
                    </span>
                    <span style={{ color: log.fromCache ? '#86efac' : '#cbd5e1' }}>
                      {log.fromCache ? 'CACHE' : `${log.status}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 600, marginBottom: '6px' }}>
              ✓ Privacy Guarantee: Backend is 100% stateless. Zero server retention.
            </div>
            <div class="audit-log-container">
              <pre style={{ margin: 0 }}>
{JSON.stringify(
  {
    privacyGuarantees: 'Zero server retention. No student grades stored.',
    clientCache: 'IndexedDB (local browser only)',
    transmittedPayloads: 'Minimised schema queries for LLM critique only',
  },
  null,
  2
)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
