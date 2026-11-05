import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { createGpaSimulator } from '../../core/optimiser.js';
import { currentGrade, finalGrade } from '../../core/gradeModel.js';
import { loadOptions } from '../options/optionsStorage.js';

export function GradeLab({ snapshot }: { snapshot: CanvasSnapshot }) {
  const [hours, setHours] = useState<Record<string, number>>({});
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [courseId, setCourseId] = useState(snapshot.courses[0]?.id ?? '');
  const [scenario, setScenario] = useState<Record<string, number>>({});
  useEffect(() => { let mounted = true; loadOptions().then(options => { if (mounted) setCredits(options.courseCreditHours); }).catch(() => {}); return () => { mounted = false; }; }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setScenario(hours)); return () => cancelAnimationFrame(frame); }, [hours]);
  const inputs = useMemo(() => snapshot.courses.map(course => ({ ...course.input, course: { ...course.input.course, creditHours: credits[course.id] ?? 3 } })), [snapshot, credits]);
  const simulate = useMemo(() => createGpaSimulator(inputs, { seed: 42, numSamples: 500, currentTime: snapshot.syncedAt }), [inputs]);
  const chart = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const scale = i / 8; return { scale, ...simulate(Object.fromEntries(snapshot.courses.map(course => [course.id, (scenario[course.id] ?? 4) * scale]))) };
  }), [simulate, scenario]);
  const [renderedChart,setRenderedChart]=useState(chart);
  const displayed=useRef(chart);
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){displayed.current=chart;setRenderedChart(chart);return;}
    const from=displayed.current;const started=performance.now();let frame=0;
    const animate=(now:number)=>{const fraction=Math.min(1,(now-started)/160);const t=1-Math.pow(1-fraction,3);const next=chart.map((point,i)=>{const old=from[i]??point;return {scale:point.scale,mean:old.mean+(point.mean-old.mean)*t,p10:old.p10+(point.p10-old.p10)*t,p25:old.p25+(point.p25-old.p25)*t,median:old.median+(point.median-old.median)*t,p75:old.p75+(point.p75-old.p75)*t,p90:old.p90+(point.p90-old.p90)*t};});displayed.current=next;setRenderedChart(next);if(fraction<1)frame=requestAnimationFrame(animate);};
    frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame);
  },[chart]);
  const last = chart[8]!;
  const totalHours = snapshot.courses.reduce((sum, course) => sum + (hours[course.id] ?? 4), 0);
  const course = snapshot.courses.find(item => item.id === courseId) ?? snapshot.courses[0];
  const grade = useMemo(()=>course ? currentGrade(course.input) : null,[course]);
  const final = useMemo(()=>course ? finalGrade(course.input) : null,[course]);
  const noDrops = useMemo(()=>course ? currentGrade({ ...course.input, groups: course.input.groups.map(group => ({ ...group, rules: { ...group.rules, dropLowest: 0, dropHighest: 0 } })) }) : null,[course]);
  const x = (scale: number) => 40 + scale * 330;
  const maxGpa = Math.max(4, ...inputs.flatMap(input => Object.values(input.course.gradePointScale)));
  const y = (gpa: number) => 205 - gpa / maxGpa * 175;
  const band = (low: 'p10' | 'p25', high: 'p90' | 'p75') => [...renderedChart.map(point => `${x(point.scale)},${y(point[high])}`), ...[...renderedChart].reverse().map(point => `${x(point.scale)},${y(point[low])}`)].join(' ');
  const activeGroups = grade?.groups.filter(group => group.percentage !== null && group.pointsPossible > 0) ?? [];
  const activeWeight = activeGroups.reduce((sum, group) => sum + group.weight, 0);
  let cumulative = 0;
  return <div class="jc"><div><div class="jc-kicker">Local math · no AI required</div><h1>Explore your grades</h1><p class="jc-sub">Drag course hours to compare modeled GPA ranges.</p></div>
    <section class="jc-section"><h2>Possible semester GPA</h2><p class="jc-muted">Remaining study hours · modeled scenarios, not a grade forecast.</p>

    <div class="gl-scenario"><div class="gl-live"><div class="gl-summary" aria-live="polite"><strong>{last.mean.toFixed(2)}<small>mean GPA</small></strong><span>{last.p10.toFixed(2)}–{last.p90.toFixed(2)}<small>10th–90th percentile</small></span><span>{totalHours.toFixed(1)}<small>hours available</small></span></div>
    <svg class="gl-chart" viewBox="0 0 410 250" role="img" aria-label={`Modeled GPA fan chart. Mean ${last.mean.toFixed(2)}. 80 percent interval ${last.p10.toFixed(2)} to ${last.p90.toFixed(2)}.`}>
      {Array.from({length: Math.ceil(maxGpa)+1},(_,i)=>i).map(tick => <g key={tick}><line x1="40" x2="370" y1={y(tick)} y2={y(tick)} stroke="#e6d9c8"/><text x="24" y={y(tick)+4}>{tick}</text></g>)}
      <polygon class="gl-band" points={band('p10','p90')} fill="#ffe7da"/><polygon class="gl-band" points={band('p25','p75')} fill="#f7b694"/>
      <polyline class="gl-line" points={renderedChart.map(point => `${x(point.scale)},${y(point.median)}`).join(' ')} fill="none" stroke="#9a3412" stroke-width="3"/>
      {[0,.5,1].map(scale => <text key={scale} x={x(scale)} y="227" text-anchor="middle">{Math.round(scale*100)}%</text>)}<text x="205" y="246" text-anchor="middle">Share of selected study budget applied</text>
    </svg></div>
    <div class="gl-sliders">{snapshot.courses.map(item => <label class="gl-slider" key={item.id}><span><strong>{item.code}</strong><output>{hours[item.id] ?? 4} hours</output></span><input aria-label={`Study hours for ${item.code}`} type="range" min="0" max="24" step=".5" value={hours[item.id] ?? 4} onInput={event => { const value = Number(event.currentTarget.value); setHours(previous => ({ ...previous, [item.id]: value })); }}/><small>{credits[item.id] ?? 3} credit hours · editable in Settings</small></label>)}</div></div>

    <details><summary>See the numbers and assumptions</summary><p class="jc-muted">Dark line: median · inner band: middle 50% · outer band: middle 80%. 500 samples, fixed seed and common random numbers keep comparisons stable. No timeline is implied.</p><table class="gl-table"><thead><tr><th>Budget</th><th>10%</th><th>Median</th><th>90%</th></tr></thead><tbody>{chart.map(point => <tr key={point.scale}><td>{Math.round(point.scale*100)}%</td><td>{point.p10.toFixed(2)}</td><td>{point.median.toFixed(2)}</td><td>{point.p90.toFixed(2)}</td></tr>)}</tbody></table><p class="jc-muted">Hours are divided equally across eligible assignments; they are remaining hours, not a weekly schedule. Learning ceilings, study pace, Gaussian score noise, and equal time allocation are model assumptions. Past-due work receives no new effort. Unknown/unposted work is not treated as a known earned score. Credits default to 3 unless entered in Settings.</p></details></section>
    <section class="jc-section"><h2>Why is my grade this?</h2><select class="g-select" aria-label="Grade breakdown course" value={course?.id} onChange={event => setCourseId(event.currentTarget.value)}>{snapshot.courses.map(item => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
    {grade?.percentage != null ? <><div class="gl-summary"><strong>{grade.percentage.toFixed(2)}%<small>current computed grade</small></strong><span>{final?.percentage?.toFixed(2) ?? '—'}%<small>if unfinished work scores zero</small></span></div>
    <div class="gl-waterfall" aria-label="Grade contribution waterfall">{activeGroups.map(group => {
      const contribution = grade.groupWeightsApplied ? group.percentage! * group.weight / (activeWeight || 1) : group.pointsEarned / (grade.totalPointsPossible || 1) * 100;
      const start = cumulative; cumulative += contribution;
      return <details key={group.groupId} class="gl-group"><summary><span>{group.groupName}</span><strong>{contribution.toFixed(2)} percentage points</strong><span class="gl-track"><span style={{ marginLeft: `${start / Math.max(100,grade.percentage!)*100}%`, width: `${contribution/Math.max(100,grade.percentage!)*100}%` }}/></span></summary><p>{group.pointsEarned} / {group.pointsPossible} counted points · {group.percentage?.toFixed(2)}% within this group{grade.groupWeightsApplied ? ` · normalized weight ${(group.weight/(activeWeight||1)*100).toFixed(1)}%` : ''}.</p><p class="jc-muted">Dropped: {group.droppedAssignmentIds.map(id => course?.assignments.find(item => item.id === id)?.name ?? id).join(', ') || 'None'}.</p></details>;
    })}<div class="gl-group"><strong>Total: {grade.percentage.toFixed(2)}%</strong></div></div>
    <p class="jc-muted">Drop-rule effect: {noDrops?.percentage != null ? `${grade.percentage-noDrops.percentage >= 0 ? '+' : ''}${(grade.percentage-noDrops.percentage).toFixed(2)} percentage points versus the same work with drop rules disabled.` : 'Not available.'} Never-drop protections remain active.</p><p class="jc-muted">Current grade excludes unposted and ungraded scores. The zero-score scenario is a separate calculation, not your expected final grade. {course?.currentScore != null ? `Canvas currently reports ${course.currentScore.toFixed(2)}%; difference ${Math.abs(course.currentScore-grade.percentage).toFixed(2)} percentage points.` : 'Canvas did not expose a comparison score.'}</p></> : <p class="jc-muted">No posted, graded work is available to explain yet.</p>}</section>
  </div>;
}
