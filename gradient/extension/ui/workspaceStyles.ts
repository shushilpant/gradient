import { FONT_STYLES } from './fontStyles.js';

export { PALETTE_TOKENS as THEME_TOKENS } from './palette.js';
import { PALETTE_TOKENS as THEME_TOKENS } from './palette.js';

export const WORKSPACE_STYLES = FONT_STYLES + `
:host{all:initial;color-scheme:light;font-family:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--g-ink);font-size:16px;line-height:1.5}
*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button,a,input,select{touch-action:manipulation}button,a,select,summary{cursor:pointer}button{color:inherit;border:0;background:none;transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s,border-color .2s,color .2s,box-shadow .22s}a{color:inherit;text-decoration:none}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,textarea:focus-visible{outline:3px solid var(--g-focus);outline-offset:2px}svg{display:block;flex-shrink:0}h1,h2,h3,p{margin:0}input,select{max-width:100%}
.gw,.g-launcher{${THEME_TOKENS}font-family:var(--g-body)}
.gw{position:fixed;right:14px;top:14px;bottom:14px;width:min(500px,calc(100vw - 28px));z-index:2147483646;display:flex;flex-direction:column;overflow:hidden;isolation:isolate;color:var(--g-ink);font-size:16px;line-height:1.5;border-radius:32px;border:1px solid var(--g-surface);box-shadow:0 32px 80px -24px rgba(16,24,40,.22),0 0 0 1px rgba(16,24,40,.10);
background:var(--g-canvas)}
.gw.wide{width:min(920px,calc(100vw - 28px))}
.g-header{display:flex;align-items:center;gap:8px;padding:20px 20px 12px 24px;flex-shrink:0}
.g-brand{display:flex;gap:12px;align-items:center;flex:1;min-width:0}
.g-logo{display:grid;place-items:center;width:44px;height:44px;background:var(--g-grad);color:var(--g-on-accent);border-radius:16px;box-shadow:var(--g-shadow-pop)}
.g-wordmark{font-family:var(--g-display);font-weight:800;letter-spacing:-.05em;font-size:30px;line-height:1}
.g-wordmark span{color:var(--g-accent)}
.g-chip-status{font-size:14px;font-weight:700;color:var(--g-accent);background:var(--g-accent-soft);border-radius:999px;padding:6px 12px;white-space:nowrap}
.g-icon-btn{width:44px;height:44px;display:grid;place-items:center;color:var(--g-ink-2);border-radius:999px;background:rgba(255,255,255,.78);box-shadow:0 0 0 1px var(--g-line)}
.g-icon-btn:hover{background:var(--g-surface);color:var(--g-accent);transform:translateY(-1px)}
.g-icon-btn:active{transform:scale(.95)}
.g-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 20px 12px;padding:6px;border-radius:999px;background:rgba(255,255,255,.78);box-shadow:inset 0 0 0 1px var(--g-line);flex-shrink:0}
.g-modes button{display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:999px;font-weight:800;font-size:16px;color:var(--g-muted)}
.g-modes button:hover{color:var(--g-ink)}
.g-modes button.active{background:var(--g-grad);color:var(--g-on-accent);box-shadow:var(--g-shadow-pop)}
.g-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:0 20px 6px;padding:6px;border-radius:24px;background:rgba(255,255,255,.78);box-shadow:inset 0 0 0 1px var(--g-line);flex-shrink:0}
.g-tab{min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;align-items:center;padding:10px 2px;border-radius:18px;color:var(--g-muted);font-size:14px;font-weight:700;white-space:nowrap}
.g-tab:hover{color:var(--g-ink);background:var(--g-surface)}
.g-tab.active{background:var(--g-surface);color:var(--g-accent);box-shadow:var(--g-shadow)}
.g-body{padding:18px 24px 32px;overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:var(--g-accent-mid) transparent}
.g-stack{display:flex;flex-direction:column;gap:22px;animation:g-rise .5s cubic-bezier(.16,1,.3,1) both}
.g-title{font-family:var(--g-display);font-size:36px;letter-spacing:-.045em;line-height:1.04;font-weight:800;color:var(--g-ink)}
.g-title .g-accent{color:var(--g-accent)}
.g-subtitle{font-size:16px;line-height:1.5;color:var(--g-muted);margin-top:8px}
.g-hero-cta{position:relative;display:flex;align-items:center;gap:16px;width:100%;text-align:left;padding:24px;min-height:96px;border-radius:28px;color:var(--g-on-accent);background-color:var(--g-accent);background-image:var(--g-grad);box-shadow:var(--g-shadow-pop);overflow:hidden}
.g-hero-cta::after{content:"";position:absolute;inset:0;background:radial-gradient(220px 110px at 90% -10%,rgba(255,255,255,.22),transparent 62%);pointer-events:none}
.g-hero-cta:hover{transform:translateY(-2px);filter:saturate(1.08) brightness(1.04)}
.g-hero-cta:active{transform:scale(.985)}
.g-hero-cta>span:nth-child(2){flex:1;min-width:0}
.g-hero-cta strong{display:block;font-family:var(--g-display);font-size:26px;line-height:1.08;letter-spacing:-.03em;font-weight:800;color:var(--g-on-accent)}
.g-hero-cta small{display:block;margin-top:6px;font-size:15px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-hero-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:20px;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);flex-shrink:0}
.g-hero-go{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;background:var(--g-surface);color:var(--g-accent);flex-shrink:0}
.g-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.g-metric{padding:18px 16px;border-radius:24px;background:var(--g-surface);box-shadow:var(--g-shadow)}
.g-metric strong{display:block;font-family:var(--g-display);font-size:38px;letter-spacing:-.05em;line-height:1;font-weight:800;color:var(--g-ink)}
.g-metric small{display:block;margin-top:8px;font-size:14px;color:var(--g-ink-2);font-weight:700}
.g-metric.peach{background:var(--g-surface)}.g-metric.peach strong{color:var(--g-accent)}
.g-metric.pink{background:var(--g-surface)}.g-metric.pink strong{color:var(--g-success)}
.g-metric.mint{background:var(--g-surface)}.g-metric.mint strong{color:var(--g-accent)}
.g-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.g-section-head h2{font-family:var(--g-display);font-size:22px;letter-spacing:-.03em;font-weight:800}
.g-section-head h3{font-size:16px;font-weight:700}
.g-label-count{font-size:13px;font-weight:700;color:var(--g-ink-2);background:var(--g-accent-soft);border-radius:999px;padding:5px 11px;white-space:nowrap}
.g-link-btn{font-size:15px;font-weight:700;color:var(--g-accent);display:flex;align-items:center;gap:5px;padding:4px 0}
.g-link-btn:hover{gap:8px}
.g-course-list{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
.g-course{width:100%;min-width:0;text-align:left;display:flex;gap:14px;align-items:center;padding:16px 16px 16px 14px;border-radius:24px;background:var(--g-surface);box-shadow:var(--g-shadow)}
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
.g-due{font-size:14px;font-weight:700;color:var(--g-accent);background:var(--g-accent-soft);padding:6px 12px;border-radius:999px;white-space:nowrap}
.g-due.normal{color:var(--g-ink-2);background:var(--g-accent-soft)}
.g-card{background:var(--g-surface);border-radius:26px;padding:22px;box-shadow:var(--g-shadow)}
.g-card.soft{background:var(--g-grad-soft);box-shadow:none}
.g-primary{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:0 26px;height:56px;background:var(--g-grad);color:var(--g-on-accent);border-radius:999px;font-size:17px;font-weight:800;box-shadow:var(--g-shadow-pop);white-space:nowrap}
.g-primary:hover:not(:disabled){transform:translateY(-2px);filter:saturate(1.08) brightness(1.04)}
.g-primary:active:not(:disabled){transform:scale(.97)}
.g-primary.big{width:100%;height:64px;font-size:18px}
.g-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--g-surface);box-shadow:0 0 0 1.5px var(--g-line-2);color:var(--g-ink);border-radius:999px;padding:0 20px;height:52px;font-size:16px;font-weight:700;white-space:nowrap}
.g-secondary:hover:not(:disabled){box-shadow:0 0 0 1.5px var(--g-accent-mid);color:var(--g-accent);transform:translateY(-1px)}
.g-secondary:active:not(:disabled){transform:scale(.97)}
.g-row-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.g-notice{display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.5;padding:14px 16px;border-radius:18px;background:var(--g-warning-soft);color:var(--g-warning)}
.g-notice svg{margin-top:2px}
.g-notice.info{background:var(--g-accent-soft);color:var(--g-accent)}
.g-notice.success{background:var(--g-success-soft);color:var(--g-success)}
.g-small{font-size:15px;color:var(--g-muted);line-height:1.5}
.g-select{width:100%;height:54px;padding:0 16px;background:var(--g-surface);border:0;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:18px;color:var(--g-ink);font-size:16px;font-weight:600}
.g-field-label{font-size:14px;font-weight:700;color:var(--g-ink-2);margin-bottom:8px;display:block}
.g-search{display:flex;gap:10px;align-items:center;flex:1;background:var(--g-surface);box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:18px;padding:0 16px;height:54px;color:var(--g-muted)}
.g-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--g-ink);font-size:16px;padding:0}
.g-search input::placeholder{color:var(--g-muted)}
.g-chips{display:flex;gap:8px;flex-wrap:wrap}
.g-chip{font-size:15px;font-weight:700;border-radius:999px;padding:0 16px;height:42px;background:var(--g-surface);box-shadow:inset 0 0 0 1.5px var(--g-line-2);color:var(--g-ink-2)}
.g-chip:hover{color:var(--g-accent)}
.g-chip.active{background:var(--g-ink);box-shadow:none;color:var(--g-on-accent)}
.g-grade-card{position:relative;overflow:hidden;background:var(--g-grad);color:var(--g-on-accent);display:flex;align-items:center;gap:22px;padding:24px;border-radius:28px;box-shadow:var(--g-shadow-pop)}
.g-grade-card::after{content:"";position:absolute;inset:0;background:radial-gradient(260px 140px at 90% 0%,rgba(255,255,255,.3),transparent 70%);pointer-events:none}
.g-grade-ring{height:108px;width:108px;border-radius:50%;padding:8px;background:conic-gradient(var(--g-surface) calc(var(--grade,0)*1%),rgba(255,255,255,.25) 0);flex-shrink:0}
.g-grade-ring>div{height:100%;width:100%;border-radius:50%;background:var(--g-accent);display:flex;flex-direction:column;align-items:center;justify-content:center}
.g-grade-ring strong{font-family:var(--g-display);font-size:24px;letter-spacing:-.03em;white-space:nowrap;font-weight:800}
.g-grade-ring small{font-size:13px;opacity:.9;font-weight:600}
.g-grade-info{min-width:0}
.g-grade-info h2{font-family:var(--g-display);font-size:28px;line-height:1.1;letter-spacing:-.03em;font-weight:800}
.g-grade-info p{font-size:15px;opacity:.94;margin-top:6px}
.g-range{width:100%;accent-color:var(--g-accent);cursor:pointer;margin:14px 0 4px;height:8px}
.g-whatif-result{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.g-whatif-result>div{background:var(--g-accent-soft);border-radius:18px;padding:14px 16px}
.g-whatif-result>div.hot{background:var(--g-grad-soft)}
.g-whatif-result strong{display:block;font-family:var(--g-display);font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.g-whatif-result>div.hot strong{color:var(--g-accent)}
.g-whatif-result small{font-size:14px;color:var(--g-muted);font-weight:600}
.g-big-number{font-family:var(--g-display);font-size:32px;font-weight:800;letter-spacing:-.03em;color:var(--g-accent)}
.g-resource{display:flex;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid var(--g-line)}
.g-resource:last-child{border:0;padding-bottom:0}.g-resource:first-child{padding-top:0}
.g-resource:hover strong{color:var(--g-accent)}
.g-resource-icon{height:44px;width:44px;background:var(--g-accent-soft);color:var(--g-sky);border-radius:16px;display:grid;place-items:center;flex-shrink:0}
.g-resource>span:nth-child(2){flex:1;min-width:0}
.g-resource strong{font-size:16px;display:block;font-weight:700}
.g-resource small{font-size:14px;color:var(--g-muted);text-transform:capitalize}
.g-announcement{padding:14px 0;border-bottom:1px solid var(--g-line)}
.g-announcement:first-child{padding-top:0}.g-announcement:last-child{padding-bottom:0;border:0}
.g-announcement summary{font-size:16px;font-weight:700;line-height:1.4}
.g-announcement p{font-size:15px;color:var(--g-ink-2);white-space:pre-line;margin-top:8px;max-height:220px;overflow:auto;line-height:1.55}
.g-announcement a{font-size:15px;color:var(--g-accent);display:inline-block;margin-top:8px;font-weight:700}
.g-empty{text-align:center;padding:32px 16px;color:var(--g-muted);font-size:15px}
.g-empty-icon{display:grid;place-items:center;height:60px;width:60px;margin:0 auto 14px;background:var(--g-grad);border-radius:22px;color:var(--g-on-accent);box-shadow:var(--g-shadow-pop)}
.g-empty h2{font-family:var(--g-display);font-size:22px;color:var(--g-ink);letter-spacing:-.02em;margin-bottom:6px}
.g-empty p{line-height:1.5;max-width:300px;margin:0 auto}
.g-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483646;border-radius:999px;background:var(--g-grad);color:var(--g-on-accent);padding:0 24px 0 16px;height:62px;display:flex;align-items:center;gap:10px;box-shadow:var(--g-shadow-pop);font-family:var(--g-display);font-weight:800;font-size:20px;letter-spacing:-.02em}
.g-launcher:hover{transform:translateY(-2px) scale(1.02)}
.g-setting-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--g-line);font-size:16px}
.g-setting-row:last-of-type{border:0}
.g-setting-row span{color:var(--g-muted)}
.g-setting-row strong{font-weight:700;overflow-wrap:anywhere;text-align:right}
.g-user{height:48px;width:48px;background:var(--g-grad);color:var(--g-on-accent);border-radius:18px;display:grid;place-items:center;font-family:var(--g-display);font-weight:800;font-size:16px}
.g-credit{width:76px;height:44px;border:0;box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:14px;padding:0 10px;font-size:16px;font-weight:700;text-align:center;color:var(--g-ink)}
.g-credits label{font-size:16px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0}
.g-plan-controls{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
.g-hours{display:flex;align-items:center;gap:8px;background:var(--g-surface);box-shadow:inset 0 0 0 1.5px var(--g-line-2);border-radius:999px;padding:0 16px;height:56px;font-size:16px;font-weight:600;color:var(--g-muted)}
.g-hours input{width:48px;border:0;background:transparent;color:var(--g-ink);font-family:var(--g-display);font-weight:800;font-size:22px;padding:0;outline:0}
.g-plan-result{margin-top:16px}
.g-skeleton{height:96px;border-radius:24px;background:linear-gradient(100deg,var(--g-surface) 20%,var(--g-accent-soft) 50%,var(--g-surface) 80%);background-size:200% 100%;animation:g-sheen 1.4s linear infinite}
.g-sync-loading{display:flex;gap:9px;align-items:center;color:var(--g-accent);font-size:15px;font-weight:700;margin-bottom:14px}
.g-spinner{animation:g-spin 1s linear infinite}
.g-syllabus{font-size:15px;line-height:1.65;color:var(--g-ink-2);white-space:pre-line;max-height:330px;overflow:auto}
.g-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px}
.g-overview-grid>section{min-width:0;width:100%}
.g-overview-grid{display:flex;flex-direction:column;gap:20px}
.wide .g-overview-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start;gap:20px}
.wide .g-title{font-size:42px}
.g-issue-details{font-size:15px;color:var(--g-warning);background:var(--g-warning-soft);border-radius:18px;padding:14px 16px}
.g-issue-details summary{font-weight:700}
.g-issue-details ul{margin:10px 0 0;padding-left:18px;line-height:1.6}
.g-course-link{font-size:15px;font-weight:700;color:var(--g-accent);display:inline-flex;gap:5px;align-items:center}
.g-course-menu{display:flex;gap:10px;align-items:center}
.g-course-menu .g-select{flex:1;min-width:0}
.g-course-menu .g-icon-btn{height:54px;width:54px;background:var(--g-surface)}
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
.g-rubric-ratings{list-style:none;margin:10px 0 0;padding:0;background:var(--g-accent-soft);border-radius:16px;overflow:hidden}
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
/* Consolidated product shell retains the existing brand with quieter surfaces. */
.gw.consolidated{background:var(--g-canvas);border:1px solid var(--g-line-2);border-radius:20px}
.consolidated .g-header{padding:18px 18px 10px 22px}
.consolidated .g-logo{width:36px;height:36px;border-radius:11px}
.consolidated .g-wordmark{font-size:28px}
.g-context-bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;padding:0 24px 16px;font-size:12px;color:var(--g-muted)}
.g-demo-label{font-weight:800;color:var(--g-accent)}
.consolidated .g-nav{grid-template-columns:repeat(4,minmax(0,1fr));background:var(--g-surface);border-radius:14px;margin:0 18px 4px;padding:4px;border:1px solid var(--g-line-2);box-shadow:none}
.consolidated .g-tab{font-size:12px;border-radius:10px;padding:10px 2px;gap:6px}
.consolidated .g-tab.active{background:var(--g-accent-soft);box-shadow:none;color:var(--g-accent)}
.g-subnav{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:22px;border-bottom:1px solid var(--g-line-2);padding-bottom:12px}
.g-subnav button{font-size:12px;font-weight:700;padding:7px 9px;border-radius:8px;color:var(--g-muted)}
.g-subnav button.active{background:var(--g-ink);color:var(--g-on-accent)}
.consolidated .g-title{font-size:32px;line-height:1.12}
.consolidated .g-hero-cta{padding:18px;min-height:86px;border-radius:16px;background:var(--g-accent);box-shadow:none}
.consolidated .g-hero-cta strong{font-size:23px;line-height:1.18}
.consolidated .g-hero-icon{width:42px;height:42px;border-radius:12px}
.consolidated .g-hero-go{width:34px;height:34px}
.consolidated .g-card,.consolidated .g-course,.consolidated .g-metric{border-radius:16px;border:1px solid var(--g-line);box-shadow:none}
.consolidated .g-card{padding:20px}
.consolidated .g-course-symbol{width:44px;height:44px;border-radius:12px}
.consolidated .g-metric strong{font-size:30px;color:var(--g-accent)}
.consolidated .g-metric small{font-size:12px}
.consolidated .g-section-head h2{font-size:20px}
.consolidated .g-primary{background:var(--g-accent);border-radius:12px;box-shadow:none;font-size:15px;padding:0 18px;height:48px;white-space:normal}
.consolidated .g-secondary{border-radius:12px;font-size:14px;padding:0 15px;height:auto;min-height:44px;white-space:normal}
.consolidated .g-grade-card{background:var(--g-accent);border-radius:16px;box-shadow:none}
.consolidated .g-grade-ring>div{background:var(--g-accent)}
.consolidated .g-select,.consolidated .g-search{border-radius:12px;font-size:14px}
.consolidated .g-due{font-size:12px;padding:5px 8px}
.g-change+.g-change{margin-top:14px;padding-top:14px;border-top:1px solid var(--g-line)}
.g-change>strong{font-size:14px}.g-change p{margin-top:5px;white-space:pre-wrap}
.g-assignment-brief{white-space:pre-wrap;max-height:240px;overflow:auto}
.g-scale-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
.g-scale-grid label{display:flex;justify-content:space-between;align-items:center;gap:5px;font-size:13px}
.g-scale-grid .g-credit{width:58px;min-width:0}
.consolidated [hidden]{display:none!important}
@media(max-width:600px){.gw.consolidated{border-radius:0}.g-context-bar{padding-left:18px;padding-right:18px}.consolidated .g-nav{margin-left:12px;margin-right:12px}.consolidated .g-hero-cta strong{font-size:20px}.consolidated .g-hero-icon{display:none}}
@keyframes g-rise{from{transform:translateY(8px)}to{transform:none}}
@keyframes g-sheen{to{background-position:-200% 0}}
@keyframes g-spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.gw,.gw.wide{right:0;top:0;bottom:0;width:100vw;border-radius:0;border:0}.g-header{padding:16px 14px 12px 18px}.g-modes,.g-nav{margin-left:14px;margin-right:14px}.g-body{padding:16px 18px 24px}.g-title,.wide .g-title{font-size:30px}.wide .g-overview-grid{display:flex}.g-hide-mobile{display:none}.g-launcher{right:14px;bottom:14px}.g-tab{font-size:12px}.g-metric{padding:14px 12px}.g-metric strong{font-size:30px}}
@media(max-width:400px){.g-grade-card{gap:14px;padding:18px}.g-grade-ring{height:92px;width:92px}.g-grade-ring strong{font-size:20px}.g-tab svg{display:none}.g-hero-cta strong{font-size:22px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

/* Sky and coral light theme. */
.gw.consolidated{border-color:var(--g-line-2);background:radial-gradient(560px 280px at 100% -60px,#dbeafc 0%,transparent 70%),radial-gradient(420px 260px at -80px 260px,#ffefe7 0%,transparent 72%),var(--g-canvas)}
.consolidated .g-logo{background:var(--g-grad);color:var(--g-on-accent);box-shadow:var(--g-shadow-pop)}
.consolidated .g-wordmark span{color:var(--g-coral)}
.g-demo-label{color:var(--g-coral-ink)}
.consolidated .g-icon-btn{background:var(--g-surface)}
.consolidated .g-nav{box-shadow:var(--g-shadow)}
.consolidated .g-tab.active{background:var(--g-accent-soft);color:var(--g-accent);box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.g-subnav button:hover{color:var(--g-accent);background:var(--g-accent-soft)}
.g-subnav button.active{background:var(--g-accent);color:var(--g-on-accent);box-shadow:0 4px 10px -4px rgba(26,115,201,.6)}
.consolidated .g-hero-cta{background:var(--g-grad);color:var(--g-on-accent);box-shadow:var(--g-shadow-pop)}
.consolidated .g-hero-cta::before{content:"";position:absolute;right:-40px;bottom:-70px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(255,196,170,.32) 0%,transparent 66%);pointer-events:none}
.consolidated .g-hero-cta strong{color:var(--g-on-accent)}
.consolidated .g-hero-cta small{color:rgba(255,255,255,.9)}
.consolidated .g-hero-icon{background:rgba(255,255,255,.2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.consolidated .g-hero-cta>*,.consolidated .g-grade-card>*{position:relative;z-index:1}
.consolidated .g-hero-go{color:var(--g-accent);box-shadow:0 4px 12px -4px rgba(15,39,66,.35)}
.consolidated .g-hero-cta:hover .g-hero-go{transform:translateX(3px)}
.consolidated .g-card,.consolidated .g-course,.consolidated .g-metric{border-color:var(--g-line);box-shadow:var(--g-shadow)}
.consolidated .g-metric{position:relative;overflow:hidden}
.consolidated .g-metric::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:var(--bar,var(--g-accent))}
.consolidated .g-metric.peach{--bar:var(--g-accent);background:linear-gradient(180deg,var(--g-accent-soft),var(--g-surface) 80%)}
.consolidated .g-metric.peach strong{color:var(--g-accent)}
.consolidated .g-metric.pink{--bar:var(--g-coral);background:linear-gradient(180deg,var(--g-coral-soft),var(--g-surface) 80%)}
.consolidated .g-metric.pink strong{color:var(--g-coral-ink)}
.consolidated .g-metric.mint{--bar:var(--g-mint-ink);background:linear-gradient(180deg,var(--g-mint-soft),var(--g-surface) 80%)}
.consolidated .g-metric.mint strong{color:var(--g-mint-ink)}
.consolidated .g-course:hover{border-color:var(--g-accent-mid);box-shadow:0 12px 26px -14px rgba(15,39,66,.28)}
.consolidated .g-course-symbol{box-shadow:inset 0 0 0 1px rgba(15,39,66,.05)}
.g-due{color:var(--g-coral-ink);background:var(--g-coral-soft)}
.g-due.normal{color:var(--g-accent);background:var(--g-accent-soft)}
.g-label-count{color:var(--g-accent);background:var(--g-accent-soft)}
.g-chip.active{background:var(--g-accent);color:var(--g-on-accent)}
.g-task-marker{box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.consolidated .g-primary{background:var(--g-grad);box-shadow:var(--g-shadow-pop)}
.consolidated .g-secondary:hover:not(:disabled){background:var(--g-accent-soft)}
.consolidated .g-grade-card{background:var(--g-grad);box-shadow:var(--g-shadow-pop)}
.consolidated .g-grade-card::before{content:"";position:absolute;right:-50px;bottom:-80px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,196,170,.3) 0%,transparent 66%);pointer-events:none}
.consolidated .g-grade-ring>div{background:#1f7fd8}
.g-whatif-result>div{box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.g-whatif-result>div.hot{box-shadow:inset 0 0 0 1px #ffc9b8}
.g-whatif-result>div.hot strong{color:var(--g-coral-ink)}
.g-range{accent-color:var(--g-accent)}
.consolidated .g-select:hover,.consolidated .g-search:focus-within{box-shadow:inset 0 0 0 1.5px var(--g-accent-mid)}
.g-notice{box-shadow:inset 0 0 0 1px rgba(138,91,12,.14)}
.g-notice.info{box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.g-notice.success{box-shadow:inset 0 0 0 1px rgba(29,122,82,.2)}
.g-section-head h2{color:var(--g-ink)}
.g-launcher{box-shadow:0 14px 34px -12px rgba(26,115,201,.6)}
.consolidated .g-hero-cta::after,.consolidated .g-grade-card::after{background:radial-gradient(rgba(255,255,255,.28) 1.2px,transparent 1.7px) 0 0/14px 14px;-webkit-mask-image:linear-gradient(100deg,transparent 35%,#000 95%);mask-image:linear-gradient(100deg,transparent 35%,#000 95%)}
.g-metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;margin-bottom:10px;background:var(--g-surface);color:var(--bar,var(--g-accent));box-shadow:0 2px 6px -2px rgba(15,39,66,.18)}
.g-course-bar,.g-mini-bar{display:block;height:6px;border-radius:999px;background:var(--g-line);overflow:hidden;margin-top:8px}
.g-course-bar>i,.g-mini-bar>i{display:block;height:100%;border-radius:inherit;background:var(--ink,var(--g-accent));transition:width .6s cubic-bezier(.16,1,.3,1)}
.g-course-bar{max-width:220px}
.g-whatif-result .g-mini-bar>i{background:var(--g-accent)}
.g-whatif-result .hot .g-mini-bar>i{background:var(--g-coral)}
.g-plan-result .g-mini-bar>i{background:var(--g-grad)}
.g-task-marker.urgent{background:var(--g-coral-soft);color:var(--g-coral-ink);box-shadow:inset 0 0 0 1px #ffc9b8}
.g-task-marker.soon{background:var(--g-sun-soft);color:var(--g-sun-ink);box-shadow:inset 0 0 0 1px #f6dc9c}
.g-task-marker.done{background:var(--g-mint-soft);color:var(--g-mint-ink);box-shadow:inset 0 0 0 1px #b5e3cd}
.g-week-bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:end;height:132px;margin:4px 0 12px}
.g-week-day{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;min-width:0}
.g-week-count{font-family:var(--g-display);font-weight:800;font-size:14px;line-height:1;color:var(--g-ink);min-height:14px}
.g-week-track{flex:1;width:100%;max-width:34px;display:flex;align-items:flex-end;border-radius:10px;background:repeating-linear-gradient(180deg,var(--g-canvas) 0 6px,transparent 6px 12px);box-shadow:inset 0 0 0 1px var(--g-line)}
.g-week-track>i{display:block;width:100%;border-radius:10px;background:var(--g-accent-mid);transition:height .6s cubic-bezier(.16,1,.3,1)}
.g-week-track>i.lvl-1{background:linear-gradient(180deg,#7fb9f2,var(--g-accent))}
.g-week-track>i.lvl-2{background:linear-gradient(180deg,#f8cf74,var(--g-sun))}
.g-week-track>i.lvl-3{background:linear-gradient(180deg,#f59a80,var(--g-coral))}
.g-week-label{font-size:12px;font-weight:700;color:var(--g-muted);white-space:nowrap}
.g-week-day.today .g-week-label{color:var(--g-accent)}
.g-week-day.today .g-week-track{box-shadow:inset 0 0 0 1.5px var(--g-accent-mid)}

.g-presentation-controls{width:100%;min-width:0;padding:0 24px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--g-line);flex:none}
.g-presentation-controls .g-small{width:100%;margin:0;font-size:12px}
.g-presentation-controls .g-secondary{padding:8px 14px;min-height:36px;border:1px solid var(--g-line-2);border-radius:10px;background:var(--g-accent-soft);font-size:13px}

.g-body[aria-label$="saved demo"]{width:100%;min-width:0;overflow-x:hidden}
.g-presentation-controls .g-demo-btn{gap:7px;background:var(--g-surface);color:var(--g-accent);border-color:var(--g-accent-mid);font-weight:800}
.g-presentation-controls .g-demo-btn:hover:not(:disabled){background:var(--g-accent);color:var(--g-on-accent)}
.g-run{display:flex;flex-direction:column;gap:14px}
.g-run-head{display:flex;align-items:center;gap:10px}
.g-run-head strong{font-family:var(--g-display);font-size:18px;letter-spacing:-.02em;flex:1;min-width:0}
.g-run-pulse{width:10px;height:10px;border-radius:50%;background:var(--g-accent);box-shadow:0 0 0 0 rgba(26,115,201,.5);animation:g-pulse 1.4s ease-out infinite;flex-shrink:0}
.g-run.finished .g-run-pulse{background:var(--g-mint-ink);animation:none;box-shadow:0 0 0 4px var(--g-mint-soft)}
.g-run-clock{font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--g-muted);background:var(--g-canvas);border-radius:999px;padding:4px 10px}
.g-run-progress{height:8px;border-radius:999px;background:var(--g-line);overflow:hidden}
.g-run-progress>i{display:block;height:100%;border-radius:inherit;background:var(--g-grad);background-size:200% 100%;transition:width .7s cubic-bezier(.16,1,.3,1)}
.g-run:not(.finished) .g-run-progress>i{background-image:linear-gradient(90deg,#2b8ef0,#7fc0ff,#2b8ef0);animation:g-sheen 1.6s linear infinite}
.g-run.finished .g-run-progress>i{background:linear-gradient(90deg,#2fa77a,var(--g-mint-ink))}
.g-run-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.g-run-steps li{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:12px;transition:background .3s,opacity .3s}
.g-run-steps li.waiting{opacity:.5}
.g-run-steps li.active{background:var(--g-accent-soft)}
.g-run-steps li>div{flex:1;min-width:0}
.g-run-steps strong{display:block;font-size:14px;font-weight:700;color:var(--g-ink)}
.g-run-steps small{display:block;font-size:13px;color:var(--g-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-run-steps li.active small{color:var(--g-accent)}
.g-run-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-size:12px;font-weight:800;background:var(--g-surface);color:var(--g-muted);box-shadow:inset 0 0 0 1.5px var(--g-line-2)}
.g-run-steps li.active .g-run-dot{background:var(--g-accent);color:var(--g-on-accent);box-shadow:none}
.g-run-steps li.done .g-run-dot{background:var(--g-mint-soft);color:var(--g-mint-ink);box-shadow:inset 0 0 0 1px #b5e3cd}
.g-run-time{font-variant-numeric:tabular-nums;font-size:12px;font-weight:700;color:var(--g-muted);min-width:38px;text-align:right}
.g-run-result{animation:g-reveal .6s cubic-bezier(.16,1,.3,1) both}
.g-demo-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--g-line)}
.g-demo-row:last-of-type{border-bottom:0}
.g-demo-row-main{flex:1;min-width:0}
.g-demo-row-main strong{display:block;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-demo-row-main small{display:block}
.g-demo-score{font-family:var(--g-display);font-weight:800;font-size:20px;color:var(--g-accent)}
.g-demo-ok{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--g-mint-ink);background:var(--g-mint-soft);border-radius:999px;padding:4px 9px;white-space:nowrap}
.g-demo-rank{font-family:var(--g-display);font-weight:800;font-size:17px}
.g-demo-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.g-demo-chip{font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;background:var(--g-surface);color:var(--g-ink-2);box-shadow:inset 0 0 0 1px var(--g-line-2)}
.g-demo-chip.topic{text-transform:capitalize;background:var(--g-accent-soft);color:var(--g-accent);box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.g-demo-match{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--g-line)}
a.g-demo-match{color:inherit;text-decoration:none;margin:0 -10px;padding:12px 10px;border-radius:14px;transition:background .2s,transform .2s}
a.g-demo-match:hover{background:var(--g-accent-soft);transform:translateX(2px)}
a.g-demo-match:hover strong{color:var(--g-accent)}
.g-demo-match .g-demo-row-main strong{white-space:normal;line-height:1.35}
.g-demo-why{display:block;font-size:12px;font-weight:700;color:var(--g-mint-ink);margin-top:3px}
.g-demo-open{color:var(--g-muted);flex-shrink:0}
a.g-demo-match:hover .g-demo-open{color:var(--g-accent)}
.g-demo-match-score{width:62px;height:62px;border-radius:50%;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(closest-side,var(--g-surface) 78%,transparent 80%),conic-gradient(var(--g-coral) calc(var(--score)*1%),var(--g-line) 0)}
.g-demo-match-score strong{font-family:var(--g-display);font-size:16px;font-weight:800;line-height:1;color:var(--g-coral-ink)}
.g-demo-match-score small{font-size:10px;color:var(--g-muted);font-weight:700}
@keyframes g-pulse{0%{box-shadow:0 0 0 0 rgba(26,115,201,.5)}100%{box-shadow:0 0 0 10px rgba(26,115,201,0)}}
@keyframes g-reveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
`;
