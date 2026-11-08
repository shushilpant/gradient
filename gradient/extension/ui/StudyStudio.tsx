import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { readCanvasMaterials } from '../canvasMaterials.js';
import { generateStudyPacket, generateSpeech, getAssistantHealth, loadAssistantSettings, safeBrowserUrl } from '../assistantClient.js';
import { assistantRequest } from '../assistantTransport.js';
import { accountKey, missionCalendar, planMission } from '../commandCenter.js';
import { emptyStudio, loadStudio, parseDeck, practiceOrder, reviewCard, saveStudio, type StudioData, type StudioSource } from '../studyStudio.js';

type Mode = 'sources' | 'cards' | 'practice' | 'map' | 'listen' | 'read';
export function StudyStudio({ snapshot, active }: { snapshot: CanvasSnapshot; active: boolean }) {
  const [data, setData] = useState<StudioData>(emptyStudio);
  const [loaded, setLoaded] = useState(false);
  const [courseId, setCourseId] = useState(snapshot.courses[0]?.id ?? '');
  const key = `${accountKey(snapshot)}:studio:${courseId}`;
  const [mode, setMode] = useState<Mode>('sources');
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [readingId, setReadingId] = useState('');
  const [section, setSection] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState('af_heart');
  const [speechBusy, setSpeechBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRun = useRef<AbortController | null>(null);
  const audioCache = useRef(new Map<string, string>());
  const [audioIndex, setAudioIndex] = useState(0);
  const [candidates, setCandidates] = useState<StudioSource[]>([]);
  const run = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const persistence = useRef(false);
  const loadEpoch = useRef(0);
  const course = snapshot.courses.find(item => item.id === courseId);
  const deck = data.deck;
  const card = deck?.cards.find(item => item.id === queue[index]);
  const source = data.sources.find(item => item.id === readingId) ?? data.sources[0];
  const paragraphs = source?.text.split(/\n\s*\n|(?<=\.)\s+(?=[A-Z])/).map(text => text.trim()).filter(Boolean) ?? [];
  const passage = paragraphs[section] ?? '';
  const node = deck?.concepts.find(item => item.id === nodeId);
  const audio = deck?.cards.map(item => `${item.topic}. ${item.question} ${item.answer}. ${item.explanation}`) ?? [];
  // Reset course-bound state before the form is interactive, so a delayed
  // first effect cannot erase a topic the student has already typed.
  useLayoutEffect(() => {
    const currentLoad = ++loadEpoch.current;
    alive.current = true; persistence.current = false;
    setLoaded(false); setData(emptyStudio()); setSelected([]); setQueue([]);
    setIndex(0); setFlipped(false); setChoice(null); setEvidenceId(''); setNodeId('');
    setReadingId(''); setSection(0); setAudioIndex(0); setAudioUrl('');
    setBusy(false); setSpeechBusy(false); setPlaying(false); setPaused(false);
    setStatus(''); setError(''); setCandidates([]); setTopic('');
    loadStudio(key).then(saved => {
      if (alive.current && currentLoad === loadEpoch.current) {
        setData(saved); setSelected(saved.sources.map(source => source.id));
        setQueue(saved.deck ? practiceOrder(saved.deck, saved.reviews) : []);
        persistence.current = true; setLoaded(true);
      }
    }).catch(() => {
      if (alive.current && currentLoad === loadEpoch.current) setError('Saved study materials could not be loaded. Reload before making changes.');
    });
    return () => {
      loadEpoch.current++; alive.current = false; run.current?.abort(); run.current = null;
      speechRun.current?.abort(); audioRef.current?.pause();
      for (const url of audioCache.current.values()) URL.revokeObjectURL(url);
      audioCache.current.clear();
    };
  }, [key]);
  useEffect(() => { if (loaded && persistence.current) saveStudio(key, data).catch(() => { if (alive.current) setError('Could not save study materials. They remain available this session.'); }); }, [data, loaded]);
  useEffect(() => { if (!active) stopAudio(); }, [active]);
  function stopAudio() { speechRun.current?.abort(); audioRef.current?.pause(); setAudioUrl(''); setSpeechBusy(false); setPlaying(false); setPaused(false); }
  function evidence(id: string) { setEvidenceId(id); }
  function startPractice(next: Mode, missed = false) {
    setMode(next);
    if (!deck) return;
    let ids = practiceOrder(deck, data.reviews);
    if (missed) ids = ids.filter(id => data.reviews[id]?.lastCorrect === false);
    setQueue(ids); setIndex(0); setFlipped(false); setChoice(null); setMode(next);
  }
  function grade(correct: boolean) {
    if (!card) return;
    setData(previous => ({ ...previous, reviews: { ...previous.reviews, [card.id]: reviewCard(previous.reviews[card.id], correct) } }));
  }
  async function work(action: (signal: AbortSignal) => Promise<void>) {
    run.current?.abort(); const controller = new AbortController(); run.current = controller;
    setBusy(true); setError('');
    try { await action(controller.signal); } catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The operation failed.'); }
    finally { if (alive.current && run.current === controller) { setBusy(false); setStatus(''); } }
  }
  async function settings() {
    const saved = await loadAssistantSettings(); const health = await getAssistantHealth(saved);
    if (!health.ok || !health.ollamaConnected) throw new Error('Start the local AI service with make assistant, then try again.');
    return { ...saved, studioVersion: health.studioVersion, reasoningModel: health.models.includes(saved.reasoningModel) ? saved.reasoningModel : health.recommended?.reasoningModel ?? health.models[0] ?? saved.reasoningModel };
  }
  useEffect(() => {
    if (audioUrl && audioRef.current) { audioRef.current.playbackRate = rate; void audioRef.current.play().catch(() => setPlaying(false)); }
  }, [audioUrl]);
  async function speak(at = audioIndex) {
    stopAudio(); if (!audio[at]) return;
    const controller = new AbortController(); speechRun.current = controller;
    setSpeechBusy(true); setError('');
    try {
      const cacheKey = `${voice}:${audio[at]}`;
      let url = audioCache.current.get(cacheKey);
      if (!url) {
        const result = await generateSpeech(audio[at]!, voice, controller.signal);
        controller.signal.throwIfAborted();
        const bytes = Uint8Array.from(atob(result.data), character => character.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], {type:'audio/wav'}));
        if (audioCache.current.size >= 6) { const oldest = audioCache.current.keys().next().value!; URL.revokeObjectURL(audioCache.current.get(oldest)!); audioCache.current.delete(oldest); }
        audioCache.current.set(cacheKey, url);
      }
      if (alive.current && !controller.signal.aborted) { setAudioIndex(at); setAudioUrl(url);
        if (audioRef.current?.src === url) { audioRef.current.currentTime = 0; audioRef.current.playbackRate = rate; void audioRef.current.play().catch(() => setPlaying(false)); } }
    } catch (reason) { if (!controller.signal.aborted && alive.current) setError(reason instanceof Error ? reason.message : 'Narration failed. Please retry.'); }
    finally { if (speechRun.current === controller) setSpeechBusy(false); }
  }

  async function importSelected(signal: AbortSignal): Promise<StudioSource[]> {
    if (!course) throw new Error('Choose a course first.');
    const chosen = data.sources.filter(item => selected.includes(item.id));
    const resources = course.resources.filter(item => selected.includes(item.url) && !chosen.some(source => source.url === item.url));
    if (!resources.length) {
      if (!chosen.length) throw new Error('Choose at least one page or file below.');
      return chosen;
    }
    setStatus('Reading your selected course material…');
    const config = await loadAssistantSettings();
    const materials = await readCanvasMaterials(resources, snapshot.origin, course.id,
      file => assistantRequest(config.backendUrl, '/api/v1/assistant/materials/extract', 'POST', file), signal);
    signal.throwIfAborted();
    const imported: StudioSource[] = materials.resources.filter(item => item.text?.trim()).map(item => ({ id: `src-${encodeURIComponent(item.url)}`, title: item.title, url: item.url, text: item.text!.slice(0, 22000), kind: 'canvas' }));
    const sources = [...chosen, ...imported];
    if (!sources.length) throw new Error(materials.warnings.join('\n') || 'These materials have no readable text. Try another page or file.');
    setData(previous => ({ ...previous, sources: [...previous.sources.filter(item => !imported.some(source => source.id === item.id)), ...imported].slice(-20) }));
    setSelected(sources.map(item => item.id));
    if (materials.warnings.length) setError(materials.warnings.join('\n'));
    return sources;
  }
  async function generate(signal: AbortSignal, suppliedSources?: StudioSource[], destination: Mode = 'cards') {
    const sources = suppliedSources ?? data.sources.filter(item => selected.includes(item.id));
    if (!course || !sources.length) throw new Error('Import material and select at least one readable source.');
    const config = await settings();
    if (config.studioVersion !== 1) throw new Error('The running assistant is an older version without Study Studio support. From the project folder run make assistant-restart, then retry. Your sources and previous study set are preserved.');
    signal.throwIfAborted(); setStatus('Building questions and concepts from selected evidence…');
    const packet = await generateStudyPacket(config, { studio: true, course, assignment: { id: 'studio', title: `Study studio: ${course.code}`, description: 'Create study aids only from the selected source excerpts.', url: course.url, dueAt: null }, resources: sources.map(item => ({ title: `${item.id}: ${item.title}`, url: item.url, text: item.text })), level: 'all_in', mode: 'explain', model: config.reasoningModel, webResearch: false,
      prompt: `Focus on ${topic || "the main concepts in the selected sources"}. Generate original revision questions, not actual assessment solutions.`
    }, progress => { if (!signal.aborted) setStatus(progress.label); }, signal);
    signal.throwIfAborted(); const next = parseDeck(packet.markdown, sources);
    setData(previous => ({ ...previous, deck: next, reviews: {} })); setQueue(next.cards.map(item => item.id)); setIndex(0); setFlipped(false); setChoice(null); setNodeId(''); setEvidenceId(''); setAudioIndex(0); setMode(destination);
  }
  function exportReviews() {
    if (!deck || !course) return;
    const due = Object.entries(data.reviews).filter(([, review]) => !review.lastCorrect || Date.parse(review.due) <= Date.now() + 86400000);
    if (!due.length) { setError('No missed or due cards need a review block yet.'); return; }
    let start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
    const deadline = course.assignments.map(item => Date.parse(item.dueAt ?? '')).filter(time => time > Date.now()).sort((a, b) => a - b)[0];
    if (deadline && start.getTime() + 15 * 60000 > deadline) start = new Date(Date.now() + 5 * 60000);
    if (deadline && start.getTime() + 15 * 60000 > deadline) { setError('A 15-minute review will not fit before the next deadline. Review the missed cards now.'); return; }
    const block = { id: `review-${course.id}-${start.toISOString().slice(0, 10)}`, title: `Review ${due.length} concepts: ${deck.title}`, courseId: course.id, assignmentId: 'review', url: course.url, start: start.toISOString(), end: new Date(start.getTime() + 15 * 60000).toISOString(), completed: false };
    const assignment = { id: 'review', groupId: 'review', name: block.title, pointsPossible: 0, dueAt: deadline ? new Date(deadline).toISOString() : null, htmlUrl: course.url, descriptionHtml: '', submission: null, submissionTypes: [], omitFromFinalGrade: true, hasRubric: false };
    const result = planMission([{ course, assignment }], 15, snapshot, [], start);
    if (!result.blocks.length || result.unscheduledMinutes) { setError('No review slot fits around known Canvas events before the deadline. Review the missed cards now.'); return; }
    download(missionCalendar(result.blocks, key), 'gradient-review.ics', 'text/calendar');
  }
  function download(text: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function sourceLink(url: string) { try { return safeBrowserUrl(url); } catch { return undefined; } }
  const evidenceItem = deck?.cards.find(item => item.id === evidenceId) ?? deck?.concepts.find(item => item.id === evidenceId);
  const evidenceSource = data.sources.find(item => item.id === evidenceItem?.sourceId);
  return <div class="jc ss"><div><div class="jc-kicker">Grounded learning workspace</div><h1>Study studio</h1><p class="jc-sub">Read, recall, connect, and revisit—with the evidence beside you.</p></div>
    <select class="g-select" aria-label="Studio course" value={courseId} onChange={event => { stopAudio(); setCourseId(event.currentTarget.value); }} disabled={busy}>{snapshot.courses.map(item => <option value={item.id} key={item.id}>{item.code}</option>)}</select>
    <nav class="jc-examples" aria-label="Study tools">{(['sources', 'cards', 'practice', 'map', 'listen', 'read'] as Mode[]).map(item => <button key={item} aria-pressed={mode === item} onClick={() => { stopAudio(); if (loaded) setError(''); if (busy) { run.current?.abort(); setBusy(false); setStatus(''); } if (item === 'cards' || item === 'practice') startPractice(item); else setMode(item); }}>{({ sources: 'Sources', cards: 'Flashcards', practice: 'Practice', map: 'Concept map', listen: 'Listen', read: 'Guided reading' })[item]}</button>)}</nav>
    {error && <p class="jc-error" role="alert">{error}</p>}{busy && <div class="jc-alert" role="status">{status || 'Reading sources…'} <button class="jc-btn" onClick={() => { run.current?.abort(); setBusy(false); setStatus(''); }}>Cancel</button></div>}
    {mode === 'sources' && <><section class="jc-section"><h2>Course library</h2><p class="jc-muted">Import up to 12 readable Canvas resources. Locked or unreadable files stay excluded.</p><div class="ss-library">{course?.resources.filter(item => item.type !== 'module').slice(0, 40).map(item => <label key={item.id} class="jc-block"><input type="checkbox" checked={selected.includes(item.url)} disabled={busy || !loaded} onChange={event => { const checked = event.currentTarget.checked; setSelected(previous => checked ? [...previous, item.url] : previous.filter(id => id !== item.url)); }}/><span>{item.title}</span></label>)}</div><button class="jc-btn" disabled={busy || !loaded || !selected.length} onClick={() => void work(async signal => {
      await importSelected(signal);
    })}>Import selected material</button></section>
    <section class="jc-section"><h2>Selected evidence</h2>{data.sources.map(item => <label class="jc-block" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event => { const checked = event.currentTarget.checked; setSelected(previous => checked ? [...previous, item.id] : previous.filter(id => id !== item.id)); }}/><span class="jc-block-main">{item.title}<small>{item.kind === 'web' ? 'Web excerpt · not the complete page' : 'Readable Canvas text'} · {item.text.length.toLocaleString()} characters</small></span><button class="jc-btn" onClick={event => { event.preventDefault(); setReadingId(item.id); setSection(0); setMode('read'); }}>Read</button></label>)}{!data.sources.length && <p class="jc-muted">Import a source to begin. Your study tools will use only the sources you select.</p>}<input class="g-select" aria-label="Study topic" value={topic} onInput={event => setTopic(event.currentTarget.value)} placeholder="Focus topic or research question"/><button class="jc-btn primary" disabled={busy || !selected.some(id => data.sources.some(item => item.id === id))} onClick={() => void work(signal => generate(signal))}>Build study set</button><p class="jc-muted">Generation replaces the current set and its review history. Exact quotes are checked; answers still require your judgment.</p></section>
    <section class="jc-section"><h2>Discover web sources</h2><p class="jc-muted">Research a topic, inspect the returned excerpts, then explicitly add useful evidence.</p><button class="jc-btn" disabled={busy || !topic.trim()} onClick={() => void work(async signal => {
      if (!course) return; const config = await settings();
      const result = await generateStudyPacket(config, { course, assignment: { id: 'research', title: topic, description: `Find educational sources for ${topic}`, url: course.url, dueAt: null }, prompt: `Research ${topic}. Return relevant sources with verbatim excerpts. Distinguish inaccessible sources.`, level: 'a_bit_more', mode: 'explain', model: config.reasoningModel, webResearch: true, resources: [] }, progress => { if (!signal.aborted) setStatus(progress.label); }, signal);
      signal.throwIfAborted(); setCandidates(result.sources.filter(item => item.excerpt?.trim() && sourceLink(item.url)).map(item => ({ id: `web-${encodeURIComponent(item.url)}`, title: item.title, url: item.url, text: item.excerpt!.slice(0, 22000), kind: 'web' }))); if (result.warnings.length) setError(result.warnings.join('\n'));
    })}>Research topic</button>{candidates.map(item => <article class="jc-message" key={item.id}><a class="jc-source" href={sourceLink(item.url)} target="_blank" rel="noopener noreferrer">{item.title}</a><p>{item.text}</p><button class="jc-btn" disabled={data.sources.some(source => source.id === item.id)} onClick={() => { setData(previous => ({ ...previous, sources: [...previous.sources, item].slice(-20) })); setSelected(previous => [...previous, item.id]); }}>Import excerpt</button></article>)}</section></>}
    {mode !== 'sources' && <section class="jc-section ss-tool-setup" aria-label="Tool materials">
      <h2>{({cards:'Flashcards',practice:'Practice',map:'Concept map',listen:'Audio revision',read:'Guided reading'})[mode]}</h2>
      <p class="jc-muted">{mode === 'read' ? 'Choose a page or file and start reading. No AI generation is needed.' : deck ? 'Your study set is ready below. To use different material, select it here and create a new set.' : 'Choose course material below. We’ll read it and prepare this tool in one step.'}</p>
      <details open={!deck || (mode === 'read' && !data.sources.length)}><summary>Choose material · {selected.length} selected</summary>
      <div class="ss-library">
        {data.sources.map(item => <label class="jc-block" key={item.id}><input type="checkbox" aria-label={`Use ${item.title}`} checked={selected.includes(item.id)} disabled={busy} onChange={event => { const checked = event.currentTarget.checked; setSelected(previous => checked ? [...previous, item.id] : previous.filter(id => id !== item.id)); }}/><span class="jc-block-main">{item.title}<small>Already imported · ready to use</small></span></label>)}
        {course?.resources.filter(item => item.type !== 'module' && !data.sources.some(source => source.url === item.url)).map(item => <label class="jc-block" key={item.url}><input type="checkbox" aria-label={`Use ${item.title}`} checked={selected.includes(item.url)} disabled={busy} onChange={event => { const checked = event.currentTarget.checked; setSelected(previous => checked ? [...previous, item.url] : previous.filter(id => id !== item.url)); }}/><span class="jc-block-main">{item.title}<small>{item.type === 'file' ? 'Course file' : 'Course page'}</small></span></label>)}
      </div>
      {!data.sources.length && !course?.resources.some(item => item.type !== 'module') && <p class="jc-muted">No readable pages or files were found for this course. Choose another course, or add a researched excerpt in Sources.</p>}
      </details>
      {mode !== 'read' && <input class="g-select" aria-label="Tool focus topic" value={topic} onInput={event => setTopic(event.currentTarget.value)} placeholder="Optional: focus on a particular topic"/>}
      <button class="jc-btn primary" disabled={busy || !loaded || !selected.length} onClick={() => {
        const destination = mode;
        void work(async signal => {
          const sources = await importSelected(signal);
          if (destination === 'read') { setReadingId(sources[0]!.id); setSection(0); setMode('read'); }
          else await generate(signal, sources, destination);
        });
      }}>{busy ? 'Preparing…' : ({cards:'Create flashcards',practice:'Create practice questions',map:'Create concept map',listen:'Create audio lesson',read:'Open selected material'})[mode]}</button>
      {deck && mode !== 'read' && <p class="jc-muted">Creating a new set replaces this course’s current questions and review history.</p>}
    </section>}
    {(mode === 'cards' || mode === 'practice') && deck && <section class="jc-section"><div class="jc-section-head"><h2>{deck.title}</h2><span class="jc-muted">{Math.min(index + 1, queue.length)} / {queue.length}</span></div>{card ? <article class="ss-study-card"><span class="jc-kicker">{card.topic}</span><h2>{card.question}</h2>{mode === 'cards' ? <>{flipped && <p>{card.answer}</p>}<button class="jc-btn primary" onClick={() => setFlipped(!flipped)}>{flipped ? 'Hide answer' : 'Reveal answer'}</button>{flipped && <div class="jc-tools"><button class="jc-btn" onClick={() => { grade(false); setIndex(index + 1); setFlipped(false); }}>Missed it</button><button class="jc-btn" onClick={() => { grade(true); setIndex(index + 1); setFlipped(false); }}>Got it</button></div>}</> : <><div class="ss-options">{card.options.map(option => <button class="jc-btn" disabled={choice !== null} key={option} onClick={() => { setChoice(option); grade(option === card.answer); }}>{option}</button>)}</div>{choice !== null && <div class="jc-alert"><strong>{choice === card.answer ? 'Correct' : `Correct answer: ${card.answer}`}</strong><p>{card.explanation}</p><button class="jc-btn" onClick={() => { setIndex(index + 1); setChoice(null); }}>Next question</button></div>}</>}<button class="jc-btn" onClick={() => evidence(card.id)}>Show supporting passage</button></article> : <div class="jc-message"><h2>Session complete</h2><p>Your responses are saved. Missed concepts return sooner.</p><div class="jc-tools"><button class="jc-btn" disabled={!deck.cards.some(item => data.reviews[item.id]?.lastCorrect === false)} onClick={() => startPractice(mode, true)}>Review missed cards</button><button class="jc-btn" onClick={() => startPractice(mode)}>Review all cards</button></div></div>}<div class="jc-tools"><button class="jc-btn" onClick={exportReviews}>Schedule 15-minute review</button><button class="jc-btn" onClick={() => { const csv = ['Question,Answer', ...deck.cards.map(item => [item.question, item.answer].map(value => `"${value.replace(/"/g, '""')}"`).join(','))].join('\r\n'); download(csv, 'gradient-cards.csv', 'text/csv'); }}>Export cards</button></div><p class="jc-muted">Review spacing: missed cards in 10 minutes; successful reviews after 1, 2, 4 days, up to 30 days. Calendar export proposes a block; check personal conflicts.</p></section>}
    {mode === 'map' && deck && <section class="jc-section"><h2>Explore the connections</h2>{!deck.concepts.length && <p class="jc-muted">No source-backed concepts were returned for this set. Select material above and create a new concept map.</p>}<div class="ss-map">{deck.concepts.map(item => <button key={item.id} class={`ss-node ${item.parentId ? 'ss-child' : ''}`} aria-pressed={nodeId === item.id} onClick={() => { setNodeId(item.id); evidence(item.id); }}><small>{item.parentId ? deck.concepts.find(parent => parent.id === item.parentId)?.label : 'Core concept'}</small><strong>{item.label}</strong></button>)}</div>{node && <article class="jc-message"><h2>{node.label}</h2><p>{node.explanation}</p><button class="jc-btn" onClick={() => { const cards = deck.cards.filter(item => item.topic.toLowerCase().includes(node.label.toLowerCase()) || item.sourceId === node.sourceId); setQueue(cards.map(item => item.id)); setIndex(0); setChoice(null); setMode('practice'); }}>Practice related concepts</button></article>}</section>}
    {mode === 'listen' && deck && <section class="jc-section"><h2>Audio revision</h2><p class="jc-muted">Kokoro-82M neural narration, generated locally. Choose a voice and chapter, then play.</p><select class="g-select" aria-label="Audio chapter" value={audioIndex} onChange={event => { stopAudio(); setAudioIndex(Number(event.currentTarget.value)); }}>{deck.cards.map((item, i) => <option key={item.id} value={i}>{i + 1}. {item.topic}</option>)}</select><label class="jc-muted">Narrator<select class="g-select" aria-label="Narrator voice" value={voice} onChange={event => { stopAudio(); setVoice(event.currentTarget.value); }}>{[['af_heart','Heart · American'],['af_bella','Bella · American'],['am_michael','Michael · American'],['bf_emma','Emma · British'],['bm_george','George · British']].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>{speechBusy && <p class="jc-muted" role="status">Generating natural narration…</p>}{audioUrl && <audio ref={audioRef} controls src={audioUrl} aria-label="Generated narration" onPlay={() => { setPlaying(true); setPaused(false); }} onPause={() => { setPlaying(false); setPaused(true); }} onEnded={() => { setPlaying(false); setPaused(false); }}/>}<div class="jc-tools"><button class="jc-btn primary" onClick={() => void speak()} disabled={playing || speechBusy}>Play chapter</button><button class="jc-btn" disabled={!audioUrl} onClick={() => { if (paused) void audioRef.current?.play(); else audioRef.current?.pause(); }}>{paused ? 'Resume' : 'Pause'}</button><button class="jc-btn" onClick={stopAudio}>Stop</button><select aria-label="Audio speed" value={rate} onChange={event => { const speed = Number(event.currentTarget.value); setRate(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}>{[0.75, 1, 1.25, 1.5].map(speed => <option value={speed}>{speed}×</option>)}</select></div><article class="jc-message"><p>{audio[audioIndex]}</p><button class="jc-btn" onClick={() => { stopAudio(); const item = deck.cards[audioIndex]; if (item) { evidence(item.id); setQueue([item.id]); setIndex(0); setChoice(null); setMode('practice'); } }}>Pause & explore this concept</button></article><>{audioUrl && <a class="jc-btn" href={audioUrl} download="gradient-narration.wav">Download audio</a>}</><button class="jc-btn" onClick={() => download(audio.join('\n\n'), 'gradient-audio-transcript.txt', 'text/plain')}>Download transcript</button></section>}
    {mode === 'read' && <section class="jc-section"><h2>Read with the source</h2><select class="g-select" aria-label="Reading source" value={source?.id ?? ''} onChange={event => { setReadingId(event.currentTarget.value); setSection(0); }}>{data.sources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{source ? <><p class="jc-muted">Passage {section + 1} of {paragraphs.length} · original source text</p><blockquote class="ss-passage">{passage}</blockquote><div class="jc-tools"><button class="jc-btn" disabled={section === 0} onClick={() => setSection(section - 1)}>Previous</button><button class="jc-btn" disabled={section >= paragraphs.length - 1} onClick={() => setSection(section + 1)}>Next passage</button></div>{deck?.cards.filter(item => item.sourceId === source.id && passage.includes(item.quote)).map(item => <details class="jc-message" key={item.id}><summary>{item.question}</summary><p>{item.answer}</p><button class="jc-btn" onClick={() => evidence(item.id)}>Evidence</button></details>)}<p class="jc-muted">Explain this passage in your own words before continuing. Build a study set to see questions attached to matching passages.</p></> : <p class="jc-muted">Select material above, then choose “Open selected material”.</p>}</section>}
    {evidenceItem && evidenceSource && <aside class="ss-evidence" aria-label="Supporting evidence"><div class="jc-section-head"><h2>Supporting passage</h2><button class="jc-btn" onClick={() => setEvidenceId('')}>Close evidence</button></div><blockquote>{evidenceItem.quote}</blockquote><a class="jc-source" href={sourceLink(evidenceSource.url)} target="_blank" rel="noopener noreferrer">{evidenceSource.title} ↗</a><p class="jc-muted">Exact quote verified against imported text. This verifies provenance, not the correctness of the generated explanation.</p></aside>}
    <details class="jc-section"><summary>Manage saved study data</summary><p class="jc-muted">Sources, generated questions, and review history are saved on this device for your Canvas account.</p><button class="jc-btn" onClick={() => { stopAudio(); setData(emptyStudio()); setSelected([]); setQueue([]); setEvidenceId(''); setMode('sources'); }}>Delete saved study data</button></details>
  </div>;
}
