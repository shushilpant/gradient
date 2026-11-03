import { FONT_STYLES } from './fontStyles.js';

/** Citrus Lagoon: porcelain light, one tangerine accent, no magenta/AI-purple. */
export const THEME_TOKENS = `
--g-ink:#171410;--g-ink-2:#3d342c;--g-muted:#6b6056;--g-line:#f0e6d8;--g-line-2:#e6d9c8;--g-surface:#ffffff;--g-canvas:#fff8f1;
--g-mango:#ffb224;--g-coral:#ff4a12;--g-pink:#ff4a12;--g-berry:#c2410c;--g-mint:#0c9b88;--g-sky:#2a6bff;
--g-accent:#ff4a12;--g-accent-soft:#ffe7da;
--g-grad:linear-gradient(135deg,#ff6a1a 0%,#ff2d00 100%);
--g-grad-soft:linear-gradient(135deg,#fff3e4 0%,#ffe8d0 52%,#e7f8f3 100%);
--g-shadow:0 1px 2px rgba(70,36,8,.05),0 16px 36px -16px rgba(255,74,18,.22);
--g-shadow-pop:0 22px 44px -12px rgba(255,45,0,.55);
--g-display:"Bricolage Grotesque",Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
--g-body:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
`;

export const WORKSPACE_STYLES = FONT_STYLES + `
:host{all:initial;color-scheme:light;font-family:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171410;font-size:16px;line-height:1.5}
*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button,a,input,select{touch-action:manipulation}button,a,select,summary{cursor:pointer}button{color:inherit;border:0;background:none;transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s,border-color .2s,color .2s,box-shadow .22s}a{color:inherit;text-decoration:none}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,textarea:focus-visible{outline:3px solid #ff4a1255;outline-offset:2px}svg{display:block;flex-shrink:0}h1,h2,h3,p{margin:0}input,select{max-width:100%}
.gw,.g-launcher{${THEME_TOKENS}font-family:var(--g-body)}
.gw{position:fixed;right:14px;top:14px;bottom:14px;width:min(500px,calc(100vw - 28px));z-index:2147483646;display:flex;flex-direction:column;overflow:hidden;isolation:isolate;color:var(--g-ink);font-size:16px;line-height:1.5;border-radius:32px;border:1px solid #fff;box-shadow:0 32px 80px -24px rgba(90,30,8,.28),0 0 0 1px rgba(255,74,18,.08);
background:radial-gradient(420px 240px at 100% 0%,#ffd0a0 0%,transparent 72%),radial-gradient(340px 220px at 0% 10%,#ffe7b8 0%,transparent 70%),radial-gradient(480px 300px at 12% 100%,#c5f3e6 0%,transparent 72%),radial-gradient(320px 260px at 100% 80%,#d7e6ff 0%,transparent 72%),var(--g-canvas)}
.gw.wide{width:min(920px,calc(100vw - 28px))}
.g-header{display:flex;align-items:center;gap:8px;padding:20px 20px 12px 24px;flex-shrink:0}
.g-brand{display:flex;gap:12px;align-items:center;flex:1;min-width:0}
.g-logo{display:grid;place-items:center;width:44px;height:44px;background:var(--g-grad);color:#fff;border-radius:16px;box-shadow:var(--g-shadow-pop)}
.g-wordmark{font-family:var(--g-display);font-weight:800;letter-spacing:-.05em;font-size:30px;line-height:1}
.g-wordmark span{color:var(--g-accent)}
.g-chip-status{font-size:14px;font-weight:700;color:#c2410c;background:#ffe7da;border-radius:999px;padding:6px 12px;white-space:nowrap}
.g-icon-btn{width:44px;height:44px;display:grid;place-items:center;color:var(--g-ink-2);border-radius:999px;background:rgba(255,255,255,.78);box-shadow:0 0 0 1px var(--g-line)}
.g-icon-btn:hover{background:#fff;color:var(--g-accent);transform:translateY(-1px)}
.g-icon-btn:active{transform:scale(.95)}
.g-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 20px 12px;padding:6px;border-radius:999px;background:rgba(255,255,255,.78);box-shadow:inset 0 0 0 1px var(--g-line);flex-shrink:0}
.g-modes button{display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:999px;font-weight:800;font-size:16px;color:var(--g-muted)}
.g-modes button:hover{color:var(--g-ink)}
.g-modes button.active{background:var(--g-grad);color:#fff;box-shadow:var(--g-shadow-pop)}
.g-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:0 20px 6px;padding:6px;border-radius:24px;background:rgba(255,255,255,.78);box-shadow:inset 0 0 0 1px var(--g-line);flex-shrink:0}
.g-tab{min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;align-items:center;padding:10px 2px;border-radius:18px;color:var(--g-muted);font-size:14px;font-weight:700;white-space:nowrap}
.g-tab:hover{color:var(--g-ink);background:#fff}
.g-tab.active{background:#fff;color:var(--g-accent);box-shadow:var(--g-shadow)}
.g-body{padding:18px 24px 32px;overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#f0c4a4 transparent}
.g-stack{display:flex;flex-direction:column;gap:22px;animation:g-rise .5s cubic-bezier(.16,1,.3,1) both}
.g-title{font-family:var(--g-display);font-size:36px;letter-spacing:-.045em;line-height:1.04;font-weight:800;color:var(--g-ink)}
.g-title .g-accent{color:#c2410c}
.g-subtitle{font-size:16px;line-height:1.5;color:var(--g-muted);margin-top:8px}
.g-hero-cta{position:relative;display:flex;align-items:center;gap:16px;width:100%;text-align:left;padding:24px;min-height:96px;border-radius:28px;color:#fff;background-color:#ff3d00;background-image:linear-gradient(135deg,#ff6a1a 0%,#ff2d00 100%);box-shadow:var(--g-shadow-pop);overflow:hidden}
.g-hero-cta::after{content:"";position:absolute;inset:0;background:radial-gradient(220px 110px at 90% -10%,rgba(255,255,255,.22),transparent 62%);pointer-events:none}
.g-hero-cta:hover{transform:translateY(-2px);filter:saturate(1.08) brightness(1.04)}
.g-hero-cta:active{transform:scale(.985)}
.g-hero-cta>span:nth-child(2){flex:1;min-width:0}
.g-hero-cta strong{display:block;font-family:var(--g-display);font-size:26px;line-height:1.08;letter-spacing:-.03em;font-weight:800;color:#fff}
.g-hero-cta small{display:block;margin-top:6px;font-size:15px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-hero-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:20px;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);flex-shrink:0}
.g-hero-go{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;background:#fff;color:var(--g-accent);flex-shrink:0}
.g-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.g-metric{padding:18px 16px;border-radius:24px;background:#fff;box-shadow:var(--g-shadow)}
.g-metric strong{display:block;font-family:var(--g-display);font-size:38px;letter-spacing:-.05em;line-height:1;font-weight:800;color:var(--g-ink)}
.g-metric small{display:block;margin-top:8px;font-size:14px;color:var(--g-ink-2);font-weight:700}
.g-metric.peach{background:#fff}.g-metric.peach strong{color:#e03a00}
.g-metric.pink{background:#fff}.g-metric.pink strong{color:#0a7a6a}
.g-metric.mint{background:#fff}.g-metric.mint strong{color:#1d4ed8}
.g-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.g-section-head h2{font-family:var(--g-display);font-size:22px;letter-spacing:-.03em;font-weight:800}
.g-section-head h3{font-size:16px;font-weight:700}
.g-label-count{font-size:13px;font-weight:700;color:var(--g-ink-2);background:#f6efe6;border-radius:999px;padding:5px 11px;white-space:nowrap}
.g-link-btn{font-size:15px;font-weight:700;color:var(--g-accent);display:flex;align-items:center;gap:5px;padding:4px 0}
.g-link-btn:hover{gap:8px}
.g-course-list{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
.g-course{width:100%;min-width:0;text-align:left;display:flex;gap:14px;align-items:center;padding:16px 16px 16px 14px;border-radius:24px;background:#fff;box-shadow:var(--g-shadow)}
.g-course:hover{transform:translateY(-2px)}
.g-course:active{transform:scale(.985)}
.g-course-symbol{white-space:nowrap;height:52px;width:52px;border-radius:18px;display:grid;place-items:center;font-family:var(--g-display);font-weight:800;font-size:15px;background:var(--tint);color:var(--ink);flex-shrink:0}
.g-course-info{min-width:0;flex:1}
.g-course-info strong{display:block;font-size:16px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-course-info small{display:block;margin-top:4px;font-size:14px;color:var(--g-muted)}
.g-course-score{flex-shrink:0;font-family:var(--g-display);font-weight:800;font-size:24px;letter-spacing:-.03em;color:var(--ink)}
.g-task{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--g-line)}
.g-task:last-child{border-bottom:0;padding-bottom:0}.g-task:first-child{padding-top:0}
.g-task-marker{height:44px;width:44px;display:grid;place-items:center;background:var(--g-grad-soft);color:var(--g-accent);border-radius:16px;flex-shrink:0}
.g-task-main{flex:1;min-width:0}
.g-task-main strong{display:block;font-size:16px;font-weight:700;line-height:1.35}
.g-task-main strong button{font-size:16px;font-weight:700;text-align:left;color:inherit;padding:0}
.g-task-main strong button:hover,.g-task-main a:hover{color:var(--g-accent)}
.g-task-meta{font-size:14px;color:var(--g-muted);display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
.g-due{font-size:14px;font-weight:700;color:#c2410c;background:#ffeadf;padding:6px 12px;border-radius:999px;white-space:nowrap}
.g-due.normal{color:var(--g-ink-2);background:#f6efe6}
.g-card{background:#fff;border-radius:26px;padding:22px;box-shadow:var(--g-shadow)}
.g-card.soft{background:var(--g-grad-soft);box-shadow:none}
.g-primary{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:0 26px;height:56px;background:linear-gradient(135deg,#ff6a1a 0%,#ff2d00 100%);color:#fff;border-radius:999px;font-size:17px;font-weight:800;box-shadow:var(--g-shadow-pop);white-space:nowrap}
.g-primary:hover:not(:disabled){transform:translateY(-2px);filter:saturate(1.08) brightness(1.04)}
.g-primary:active:not(:disabled){transform:scale(.97)}
.g-primary.big{width:100%;height:64px;font-size:18px}
.g-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;box-shadow:0 0 0 1.5px var(--g-line-2);color:var(--g-ink);border-radius:999px;padding:0 20px;height:52px;font-size:16px;font-weight:700;white-space:nowrap}
.g-secondary:hover:not(:disabled){box-shadow:0 0 0 1.5px #ffb089;color:var(--g-accent);transform:translateY(-1px)}
.g-secondary:active:not(:disabled){transform:scale(.97)}
.g-row-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.g-notice{display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.5;padding:14px 16px;border-radius:18px;background:#fff1e3;color:#9a3f0e}
.g-notice svg{margin-top:2px}
.g-notice.info{background:#e8f0ff;color:#1d4ed8}
.g-notice.success{background:#ddf7ed;color:#0b7353}
.g-small{font-size:15px;color:var(--g-muted);line-height:1.5}
.g-select{width:100%;height:54px;padding:0 16px;background:#fff;border:0;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:18px;color:var(--g-ink);font-size:16px;font-weight:600}
.g-field-label{font-size:14px;font-weight:700;color:var(--g-ink-2);margin-bottom:8px;display:block}
.g-search{display:flex;gap:10px;align-items:center;flex:1;background:#fff;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:18px;padding:0 16px;height:54px;color:var(--g-muted)}
.g-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--g-ink);font-size:16px;padding:0}
.g-search input::placeholder{color:#9a8d80}
.g-chips{display:flex;gap:8px;flex-wrap:wrap}
.g-chip{font-size:15px;font-weight:700;border-radius:999px;padding:0 16px;height:42px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--g-line-2);color:var(--g-ink-2)}
.g-chip:hover{color:var(--g-accent)}
.g-chip.active{background:var(--g-ink);box-shadow:none;color:#fff}
.g-grade-card{position:relative;overflow:hidden;background:var(--g-grad);color:#fff;display:flex;align-items:center;gap:22px;padding:24px;border-radius:28px;box-shadow:var(--g-shadow-pop)}
.g-grade-card::after{content:"";position:absolute;inset:0;background:radial-gradient(260px 140px at 90% 0%,rgba(255,255,255,.3),transparent 70%);pointer-events:none}
.g-grade-ring{height:108px;width:108px;border-radius:50%;padding:8px;background:conic-gradient(#fff calc(var(--grade,0)*1%),rgba(255,255,255,.25) 0);flex-shrink:0}
.g-grade-ring>div{height:100%;width:100%;border-radius:50%;background:#ff3d00;display:flex;flex-direction:column;align-items:center;justify-content:center}
.g-grade-ring strong{font-family:var(--g-display);font-size:24px;letter-spacing:-.03em;white-space:nowrap;font-weight:800}
.g-grade-ring small{font-size:13px;opacity:.9;font-weight:600}
.g-grade-info{min-width:0}
.g-grade-info h2{font-family:var(--g-display);font-size:28px;line-height:1.1;letter-spacing:-.03em;font-weight:800}
.g-grade-info p{font-size:15px;opacity:.94;margin-top:6px}
.g-range{width:100%;accent-color:#ff4a12;cursor:pointer;margin:14px 0 4px;height:8px}
.g-whatif-result{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.g-whatif-result>div{background:#f8f1e8;border-radius:18px;padding:14px 16px}
.g-whatif-result>div.hot{background:var(--g-grad-soft)}
.g-whatif-result strong{display:block;font-family:var(--g-display);font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.g-whatif-result>div.hot strong{color:var(--g-accent)}
.g-whatif-result small{font-size:14px;color:var(--g-muted);font-weight:600}
.g-big-number{font-family:var(--g-display);font-size:32px;font-weight:800;letter-spacing:-.03em;color:var(--g-accent)}
.g-resource{display:flex;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid var(--g-line)}
.g-resource:last-child{border:0;padding-bottom:0}.g-resource:first-child{padding-top:0}
.g-resource:hover strong{color:var(--g-accent)}
.g-resource-icon{height:44px;width:44px;background:#e4f0ff;color:var(--g-sky);border-radius:16px;display:grid;place-items:center;flex-shrink:0}
.g-resource>span:nth-child(2){flex:1;min-width:0}
.g-resource strong{font-size:16px;display:block;font-weight:700}
.g-resource small{font-size:14px;color:var(--g-muted);text-transform:capitalize}
.g-announcement{padding:14px 0;border-bottom:1px solid var(--g-line)}
.g-announcement:first-child{padding-top:0}.g-announcement:last-child{padding-bottom:0;border:0}
.g-announcement summary{font-size:16px;font-weight:700;line-height:1.4}
.g-announcement p{font-size:15px;color:var(--g-ink-2);white-space:pre-line;margin-top:8px;max-height:220px;overflow:auto;line-height:1.55}
.g-announcement a{font-size:15px;color:var(--g-accent);display:inline-block;margin-top:8px;font-weight:700}
.g-empty{text-align:center;padding:32px 16px;color:var(--g-muted);font-size:15px}
.g-empty-icon{display:grid;place-items:center;height:60px;width:60px;margin:0 auto 14px;background:var(--g-grad);border-radius:22px;color:#fff;box-shadow:var(--g-shadow-pop)}
.g-empty h2{font-family:var(--g-display);font-size:22px;color:var(--g-ink);letter-spacing:-.02em;margin-bottom:6px}
.g-empty p{line-height:1.5;max-width:300px;margin:0 auto}
.g-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483646;border-radius:999px;background:var(--g-grad);color:#fff;padding:0 24px 0 16px;height:62px;display:flex;align-items:center;gap:10px;box-shadow:0 18px 40px -12px rgba(255,61,0,.5);font-family:var(--g-display);font-weight:800;font-size:20px;letter-spacing:-.02em}
.g-launcher:hover{transform:translateY(-2px) scale(1.02)}
.g-setting-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--g-line);font-size:16px}
.g-setting-row:last-of-type{border:0}
.g-setting-row span{color:var(--g-muted)}
.g-setting-row strong{font-weight:700;overflow-wrap:anywhere;text-align:right}
.g-user{height:48px;width:48px;background:var(--g-grad);color:#fff;border-radius:18px;display:grid;place-items:center;font-family:var(--g-display);font-weight:800;font-size:16px}
.g-credit{width:76px;height:44px;border:0;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:14px;padding:0 10px;font-size:16px;font-weight:700;text-align:center;color:var(--g-ink)}
.g-credits label{font-size:16px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0}
.g-plan-controls{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
.g-hours{display:flex;align-items:center;gap:8px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:999px;padding:0 16px;height:56px;font-size:16px;font-weight:600;color:var(--g-muted)}
.g-hours input{width:48px;border:0;background:transparent;color:var(--g-ink);font-family:var(--g-display);font-weight:800;font-size:22px;padding:0;outline:0}
.g-plan-result{margin-top:16px}
.g-skeleton{height:96px;border-radius:24px;background:linear-gradient(100deg,#fff 20%,#ffe8d4 50%,#fff 80%);background-size:200% 100%;animation:g-sheen 1.4s linear infinite}
.g-sync-loading{display:flex;gap:9px;align-items:center;color:var(--g-accent);font-size:15px;font-weight:700;margin-bottom:14px}
.g-spinner{animation:g-spin 1s linear infinite}
.g-syllabus{font-size:15px;line-height:1.65;color:var(--g-ink-2);white-space:pre-line;max-height:330px;overflow:auto}
.g-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px}
.g-overview-grid>section{min-width:0;width:100%}
.g-overview-grid{display:flex;flex-direction:column;gap:20px}
.wide .g-overview-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start;gap:20px}
.wide .g-title{font-size:42px}
.g-issue-details{font-size:15px;color:#9a3f0e;background:#fff1e3;border-radius:18px;padding:14px 16px}
.g-issue-details summary{font-weight:700}
.g-issue-details ul{margin:10px 0 0;padding-left:18px;line-height:1.6}
.g-course-link{font-size:15px;font-weight:700;color:var(--g-accent);display:inline-flex;gap:5px;align-items:center}
.g-course-menu{display:flex;gap:10px;align-items:center}
.g-course-menu .g-select{flex:1;min-width:0}
.g-course-menu .g-icon-btn{height:54px;width:54px;background:#fff}
.g-more{border-radius:22px;background:rgba(255,255,255,.7);box-shadow:inset 0 0 0 1px var(--g-line)}
.g-more>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;font-weight:700;font-size:16px}
.g-more>summary::-webkit-details-marker{display:none}
.g-more>summary::after{content:"+";font-family:var(--g-display);font-size:24px;line-height:1;color:var(--g-accent)}
.g-more[open]>summary::after{content:"\\2212"}
.g-more>div{padding:0 18px 18px;display:flex;flex-direction:column;gap:16px}
.g-feedback-summary{font-family:var(--g-display);font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.3}
.g-rubric-list{margin-top:12px}
.g-rubric-criterion{padding:14px 0;border-top:1px solid var(--g-line)}
.g-rubric-criterion:last-child{padding-bottom:0}
.g-rubric-criterion h3{font-size:16px;font-weight:700;line-height:1.45}
.g-rubric-criterion .g-section-head{align-items:flex-start;margin-bottom:8px}
.g-rubric-criterion .g-label-count{flex-shrink:0}
.g-ratings-summary{font-size:15px;color:var(--g-accent);font-weight:700}
.g-rubric-ratings{list-style:none;margin:10px 0 0;padding:0;background:#f8f1e8;border-radius:16px;overflow:hidden}
.g-rubric-ratings li{padding:12px 14px;border-bottom:1px solid var(--g-line);font-size:15px;line-height:1.5;display:flex;gap:12px;align-items:flex-start;color:var(--g-ink-2)}
.g-rubric-ratings li:last-child{border:0}
.g-rubric-ratings li>span{flex:1;min-width:0}
.g-rubric-ratings strong{white-space:nowrap;font-weight:700;color:var(--g-ink)}
.g-feedback-comments{margin-top:16px;padding-top:14px;border-top:1px solid var(--g-line)}
.g-feedback-comments h3{font-size:16px;font-weight:700}
.g-instructor-comment{padding:12px 0;border-bottom:1px solid var(--g-line)}
.g-instructor-comment:last-child{border:0;padding-bottom:0}
.g-comment-author{display:flex;gap:10px;justify-content:space-between;font-size:14px;color:var(--g-muted)}
.g-comment-author strong{font-weight:700;color:var(--g-ink)}
.g-instructor-comment p{font-size:15px;line-height:1.55;color:var(--g-ink-2);white-space:pre-line;margin-top:6px}
@keyframes g-rise{from{transform:translateY(8px)}to{transform:none}}
@keyframes g-sheen{to{background-position:-200% 0}}
@keyframes g-spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.gw,.gw.wide{right:0;top:0;bottom:0;width:100vw;border-radius:0;border:0}.g-header{padding:16px 14px 12px 18px}.g-modes,.g-nav{margin-left:14px;margin-right:14px}.g-body{padding:16px 18px 24px}.g-title,.wide .g-title{font-size:30px}.wide .g-overview-grid{display:flex}.g-hide-mobile{display:none}.g-launcher{right:14px;bottom:14px}.g-tab{font-size:12px}.g-metric{padding:14px 12px}.g-metric strong{font-size:30px}}
@media(max-width:400px){.g-grade-card{gap:14px;padding:18px}.g-grade-ring{height:92px;width:92px}.g-grade-ring strong{font-size:20px}.g-tab svg{display:none}.g-hero-cta strong{font-size:22px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
