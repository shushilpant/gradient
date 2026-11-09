import { FONT_STYLES } from './fontStyles.js';

export { PALETTE_TOKENS as THEME_TOKENS } from './palette.js';
import { PALETTE_TOKENS as THEME_TOKENS } from './palette.js';

/*
 * One layer, no overrides. Scale: 11 / 12 / 13 / 14 / 15 body; 18–28 display serif.
 * Radii: 6 chips, 9 controls, 12 cards, 16 panel. Colour carries meaning only:
 * blue = action, per-course hues = identity, amber/red = deadline pressure, green = done.
 */
export const WORKSPACE_STYLES = FONT_STYLES + `
:host{all:initial;color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
h1,h2,h3,p,dl,dd,ul{margin:0}ul{padding:0;list-style:none}
button,input,select,textarea{font:inherit;color:inherit}
button{border:0;background:none;padding:0;cursor:pointer;text-align:inherit}
a{color:inherit;text-decoration:none}
button:disabled{cursor:not-allowed;opacity:.5}
svg{display:block;flex-shrink:0}
:focus-visible{outline:2px solid var(--g-accent);outline-offset:2px;border-radius:6px}
.gw,.g-launcher{${THEME_TOKENS}font-family:var(--g-body);font-size:14px;line-height:1.5;color:var(--g-ink);-webkit-font-smoothing:antialiased;font-feature-settings:"ss01"}
.gw [hidden]{display:none!important}

/* Shell */
.gw{position:fixed;right:12px;top:12px;bottom:12px;width:min(476px,calc(100vw - 24px));z-index:2147483646;display:flex;flex-direction:column;overflow:hidden;isolation:isolate;background:var(--g-canvas);border:1px solid rgba(22,27,38,.11);border-radius:16px;box-shadow:0 1px 3px rgba(22,27,38,.06),0 24px 60px -24px rgba(22,27,38,.32);transition:width .28s cubic-bezier(.2,.8,.2,1)}
.gw.wide{width:min(1040px,calc(100vw - 24px))}
.wide .g-nav{width:560px;max-width:calc(100% - 24px)}
.g-header{display:flex;align-items:center;gap:4px;padding:12px 10px 10px 16px;flex-shrink:0}
.g-brand{display:flex;align-items:center;gap:9px;flex:1;min-width:0}
.g-logo{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:var(--g-ink);color:#fff}
.g-wordmark{font-family:var(--g-display);font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1}
.g-icon-btn{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:var(--g-muted);transition:background .15s,color .15s}
.g-icon-btn:hover:not(:disabled){background:var(--g-sunken);color:var(--g-ink)}
.g-icon-btn.bordered{width:38px;height:38px;flex-shrink:0;background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);border-radius:9px}
.g-present{position:relative;margin-right:4px}
.g-present-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--g-ink-2);box-shadow:inset 0 0 0 1px var(--g-line-2);background:var(--g-surface);transition:box-shadow .15s,color .15s}
.g-present-btn svg{color:var(--g-accent)}
.g-present-btn:hover,.g-present-btn.open{color:var(--g-ink);box-shadow:inset 0 0 0 1px var(--g-faint)}
.g-present-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:10;width:268px;padding:6px;background:var(--g-surface);border-radius:12px;box-shadow:0 0 0 1px rgba(22,27,38,.08),0 16px 40px -12px rgba(22,27,38,.3);animation:g-pop .16s ease-out both;transform-origin:top right}
.g-present-title{font-size:11px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--g-muted);padding:8px 10px 4px}
.g-present-note{font-size:11.5px;color:var(--g-muted);padding:6px 10px 6px;border-top:1px solid var(--g-line);margin-top:4px}
.g-menu-item{display:flex;gap:10px;align-items:flex-start;width:100%;padding:9px 10px;border-radius:8px;transition:background .12s}
.g-menu-item:hover:not(:disabled){background:var(--g-sunken)}
.g-menu-item svg{margin-top:2px;color:var(--g-accent)}
.g-menu-item strong{display:block;font-size:13px;font-weight:600}
.g-menu-item small{display:block;font-size:12px;color:var(--g-muted)}
.g-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;margin:0 12px;padding:3px;border-radius:10px;background:var(--g-sunken);flex-shrink:0}
.g-tab{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:32px;padding:0 6px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--g-muted);white-space:nowrap;transition:color .15s,background .15s,box-shadow .15s}
.g-tab:hover{color:var(--g-ink)}
.g-tab.active{background:var(--g-surface);color:var(--g-ink);box-shadow:0 1px 2px rgba(22,27,38,.08),0 0 0 1px rgba(22,27,38,.05)}
.g-tab.active svg{color:var(--g-accent)}
.g-demo-banner{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin:8px 12px 0;padding:7px 12px;border-radius:9px;background:var(--g-accent-soft);font-size:12.5px;flex-shrink:0}
.g-demo-label{display:inline-flex;align-items:center;gap:7px;font-weight:600;color:var(--g-accent-hover);flex:1;min-width:0}
.g-demo-label::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--g-accent);animation:g-breathe 1.6s ease-in-out infinite}
.g-tour-chip{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--g-ink-2);font-variant-numeric:tabular-nums}
.g-tour-dots{display:inline-flex;gap:3px}
.g-tour-dots i{width:14px;height:3px;border-radius:2px;background:var(--g-accent-mid)}
.g-tour-dots i.done,.g-tour-dots i.on{background:var(--g-accent)}
.g-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:18px 18px 28px;scrollbar-width:thin;scrollbar-color:var(--g-line-2) transparent}
.g-body[aria-label$="saved demo"]{overflow-x:hidden}
.g-statusbar{display:flex;align-items:center;gap:6px;height:30px;padding:0 14px;border-top:1px solid var(--g-line);background:var(--g-surface);font-size:11.5px;color:var(--g-muted);flex-shrink:0;white-space:nowrap;overflow:hidden}
.g-statusbar-right{margin-left:auto;overflow:hidden;text-overflow:ellipsis}
.g-status-dot{width:6px;height:6px;border-radius:50%;background:var(--g-mint)}
.g-status-dot.demo{background:var(--g-sun)}
.g-launcher{position:fixed;right:20px;bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:9px;height:42px;padding:0 16px 0 8px;border-radius:12px;background:var(--g-ink);color:#fff;font-family:var(--g-display);font-size:18px;font-weight:600;letter-spacing:-.02em;box-shadow:0 12px 30px -10px rgba(22,27,38,.55);transition:transform .15s}
.g-launcher:hover{transform:translateY(-1px)}
.g-launcher .g-logo{background:rgba(255,255,255,.14)}

/* Type */
.g-stack{display:flex;flex-direction:column;gap:16px;animation:g-fade .22s ease-out both}
.g-after{margin-top:16px}
.g-eyebrow{display:block;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--g-muted);margin-bottom:4px}
.g-title{font-family:var(--g-display);font-size:30px;font-weight:500;letter-spacing:-.022em;line-height:1.1;color:var(--g-ink)}
.wide .g-title{font-size:34px}
.g-subtitle{font-size:14px;color:var(--g-muted);margin-top:6px;max-width:60ch}
.g-lede{font-size:15px;line-height:1.55;color:var(--g-ink-2);margin-top:10px;max-width:62ch;text-wrap:pretty}
.g-lede strong{color:var(--g-ink);font-weight:650}
.g-small{font-size:13px;line-height:1.5;color:var(--g-muted)}
.g-small strong{color:var(--g-ink-2);font-weight:650;font-variant-numeric:tabular-nums}
.g-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.g-section-head>div{min-width:0}
.g-section-head h2{font-family:var(--g-display);font-size:19px;font-weight:500;letter-spacing:-.012em;line-height:1.25;color:var(--g-ink);text-wrap:balance}
.g-section-head h2.g-h-sans,.g-h-sans{font-family:var(--g-body);font-size:14px;font-weight:650;letter-spacing:0}
.g-section-head h3{font-size:14px;font-weight:600;line-height:1.45}
.g-section-head>svg{color:var(--g-faint);margin-top:2px}
.g-label-count{font-size:11.5px;font-weight:600;color:var(--g-muted);background:var(--g-sunken);border-radius:6px;padding:2px 7px;white-space:nowrap;font-variant-numeric:tabular-nums}
.g-accent{color:var(--g-accent)}

/* Surfaces and controls */
.g-card{background:var(--g-surface);border:1px solid var(--g-line);border-radius:12px;padding:16px 18px;box-shadow:var(--g-shadow);min-width:0}
.g-card.soft{background:var(--g-canvas)}
.g-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 15px;border-radius:9px;background:var(--g-accent);color:var(--g-on-accent);font-size:14px;font-weight:600;white-space:nowrap;transition:background .15s,transform .1s}
.g-primary:hover:not(:disabled){background:var(--g-accent-hover)}
.g-primary:active:not(:disabled),.g-secondary:active:not(:disabled){transform:translateY(1px)}
.g-primary.big{width:100%;height:44px}
.g-secondary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:0 13px;border-radius:9px;background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);color:var(--g-ink);font-size:13.5px;font-weight:600;transition:background .15s,box-shadow .15s}
.g-secondary:hover:not(:disabled){background:var(--g-canvas);box-shadow:inset 0 0 0 1px var(--g-faint)}
.g-secondary svg{color:var(--g-muted)}
.g-full{width:100%;margin-top:12px}
.g-link-btn{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--g-accent);white-space:nowrap}
.g-link-btn:hover:not(:disabled){color:var(--g-accent-hover);text-decoration:underline;text-underline-offset:3px}
.g-row-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.g-select{width:100%;height:38px;padding:0 34px 0 12px;border:0;border-radius:9px;background:var(--g-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%235d6475' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E") no-repeat right 12px center;box-shadow:inset 0 0 0 1px var(--g-line-2);font-size:13.5px;font-weight:500;color:var(--g-ink);appearance:none;-webkit-appearance:none;cursor:pointer;text-overflow:ellipsis}
.g-select:hover{box-shadow:inset 0 0 0 1px var(--g-faint)}
.g-field-label{display:block;font-size:12.5px;font-weight:600;color:var(--g-ink-2);margin-top:12px}
.g-field-label .g-select{margin-top:6px}
.g-search{display:flex;align-items:center;gap:9px;height:38px;padding:0 12px;border-radius:9px;background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);color:var(--g-muted)}
.g-search:focus-within{box-shadow:inset 0 0 0 1.5px var(--g-accent)}
.g-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:13.5px;color:var(--g-ink)}
.g-search input::placeholder{color:var(--g-muted)}
.g-chips{display:flex;flex-wrap:wrap;gap:6px}
.g-filter{margin:10px 0 12px}
.g-chip{height:30px;padding:0 11px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--g-ink-2);background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);transition:background .15s,color .15s}
.g-chip:hover{color:var(--g-ink);background:var(--g-canvas)}
.g-chip.active{background:var(--g-ink);color:#fff;box-shadow:none}
.g-notice{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border-radius:10px;background:var(--g-warning-soft);color:var(--g-warning);font-size:13.5px;line-height:1.5}
.g-notice svg{margin-top:2px}
.g-notice p{margin-top:4px}
.g-notice .g-link-btn{margin-top:6px;color:inherit}
.g-notice.info{background:var(--g-accent-soft);color:var(--g-accent-hover)}
.g-notice.success{background:var(--g-success-soft);color:var(--g-success)}
.g-rubric-criterion .g-notice{margin-bottom:10px}
.g-empty{text-align:center;padding:26px 12px;color:var(--g-muted);font-size:13.5px}
.g-empty-icon{display:grid;place-items:center;width:40px;height:40px;margin:0 auto 12px;border-radius:10px;background:var(--g-sunken);color:var(--g-muted)}
.g-empty h2{font-family:var(--g-display);font-size:19px;font-weight:500;color:var(--g-ink);margin-bottom:4px}
.g-empty p{max-width:300px;margin:0 auto}
.g-skeleton{height:84px;border-radius:12px;background:linear-gradient(100deg,var(--g-surface) 30%,var(--g-sunken) 50%,var(--g-surface) 70%);background-size:220% 100%;animation:g-sheen 1.4s linear infinite;border:1px solid var(--g-line)}
.g-skeleton.short{height:48px}
.g-sync-loading{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--g-accent)}
.g-spinner{animation:g-spin 1s linear infinite}

/* Disclosure: one chevron for every native details element in the workspace */
.gw summary{cursor:pointer;list-style:none}
.gw summary::-webkit-details-marker{display:none}
.gw details:not(.g-more):not(.ja-settings):not(.ja-context):not(.ja-more)>summary{display:flex;align-items:center;gap:8px}
.gw details:not(.g-more):not(.ja-settings):not(.ja-context):not(.ja-more)>summary::before{content:"";flex-shrink:0;width:6px;height:6px;margin:0 3px 2px 1px;border-right:1.6px solid var(--g-muted);border-bottom:1.6px solid var(--g-muted);transform:rotate(-45deg);transition:transform .18s}
.gw details[open]:not(.g-more):not(.ja-settings):not(.ja-context):not(.ja-more)>summary::before{transform:rotate(45deg);margin-bottom:5px}
.g-disclosure>summary{font-size:14px;font-weight:600;color:var(--g-ink)}
.g-disclosure[open]>summary{margin-bottom:10px}
.g-disclosure>.g-small,.g-disclosure>p{margin-bottom:10px}

/* Overview */
.g-greeting{padding:2px 2px 0}
.g-explain{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:12px}
.g-explain-btn{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px;border-radius:8px;background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);font-size:12.5px;font-weight:600;color:var(--g-ink-2);transition:box-shadow .15s,color .15s}
.g-explain-btn svg{color:var(--g-accent)}
.g-explain-btn:hover:not(:disabled){color:var(--g-ink);box-shadow:inset 0 0 0 1px var(--g-accent-mid)}
.g-explain-btn:disabled{opacity:1;cursor:progress;color:var(--g-accent-hover)}
.g-explain-note{flex-basis:100%;font-size:12.5px;color:var(--g-muted)}
.g-explain-result{flex-basis:100%;padding:12px 14px;border-radius:10px;background:var(--g-surface);border:1px solid var(--g-accent-mid);box-shadow:inset 3px 0 0 var(--g-accent);animation:g-fade .25s ease-out both}
.g-explain-result p{font-size:14.5px;line-height:1.6;color:var(--g-ink)}
.g-explain-result small{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11.5px;color:var(--g-muted)}
.g-explain-result small svg{color:var(--g-mint-ink)}
.g-dots{display:inline-flex;gap:3px}
.g-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:g-breathe 1s ease-in-out infinite}
.g-dots i:nth-child(2){animation-delay:.15s}.g-dots i:nth-child(3){animation-delay:.3s}
.g-dash{display:flex;flex-direction:column;gap:16px}
.g-dash-col{display:contents}
.g-dash .g-next{order:1}.g-dash .g-workload{order:2}.g-dash .g-standing{order:3}.g-dash .g-status{order:4}.g-dash .g-courses{order:5}.g-dash .g-after-list{order:6}.g-dash [aria-label="Canvas change radar"]{order:7}.g-dash .g-ai-rules{order:8}
.wide .g-dash{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
.wide .g-dash-col{display:flex;flex-direction:column;gap:16px;min-width:0}

.g-next{display:grid;grid-template-columns:58px minmax(0,1fr);gap:16px;padding:18px;background:var(--g-surface);border:1px solid var(--g-line);border-radius:12px;box-shadow:var(--g-shadow);position:relative;overflow:hidden}
.g-next::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--course,var(--g-accent))}
.g-next.empty{display:block}
.g-next.empty h2{font-family:var(--g-display);font-size:20px;font-weight:500}
.g-next.empty p{font-size:13px;color:var(--g-muted);margin-top:4px}
.g-next-when{display:flex;flex-direction:column;align-items:center;justify-content:center;height:62px;border-radius:10px;background:var(--g-sunken);text-align:center}
.g-next-when strong{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--g-muted)}
.g-next-when span{font-family:var(--g-display);font-size:17px;font-weight:500;line-height:1.2;color:var(--g-ink);font-variant-numeric:lining-nums}
.g-next.soon .g-next-when{background:var(--g-coral-soft)}
.g-next.soon .g-next-when strong,.g-next.soon .g-next-when span{color:var(--g-coral-ink)}
.g-next-main{min-width:0}
.g-next-main .g-eyebrow{color:var(--course,var(--g-muted))}
.g-next-title{display:block;font-family:var(--g-display);font-size:21px;font-weight:500;letter-spacing:-.015em;line-height:1.2;color:var(--g-ink);text-wrap:balance;transition:color .15s}
.g-next-title:hover{color:var(--g-accent)}
.g-next-main p{font-size:13px;color:var(--g-muted);margin-top:5px}
.g-next .g-hero-cta{margin-top:14px}
.g-next .g-hero-cta svg:last-child{transition:transform .15s}
.g-next .g-hero-cta:hover svg:last-child{transform:translateX(2px)}

.g-chart-frame{position:relative;height:150px;margin-top:4px}
.g-workload-grid{position:absolute;left:0;right:0;top:0;bottom:38px;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
.g-workload-grid span{border-top:1px dashed var(--g-line)}
.g-workload-grid span:last-child{border-top:1px solid var(--g-line-2)}
.g-workload-cols{position:relative;display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:3px;height:100%}
.g-wl-col{display:flex;flex-direction:column;align-items:stretch;min-width:0;border-radius:7px;padding:0 0 4px;transition:background .12s}
.g-wl-col.weekend{background:repeating-linear-gradient(135deg,transparent 0 5px,rgba(22,27,38,.025) 5px 6px)}
.g-wl-col:hover,.g-wl-col.active{background:var(--g-sunken)}
.g-wl-area{flex:1;display:flex;align-items:flex-end;justify-content:center;min-height:0;padding-top:6px}
.g-wl-stack{display:flex;flex-direction:column-reverse;gap:2px;width:min(18px,72%);min-height:0;transform-origin:bottom;animation:g-grow .5s cubic-bezier(.2,.8,.2,1) both}
.g-wl-stack i{display:block;min-height:5px;border-radius:3px}
.g-wl-col.empty .g-wl-area::after{content:"";width:6px;height:2px;border-radius:1px;background:var(--g-line-2)}
.g-wl-day{margin-top:6px;text-align:center;font-size:10.5px;font-weight:600;color:var(--g-faint);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;overflow:hidden}
.g-wl-date{text-align:center;font-size:12px;font-weight:600;color:var(--g-ink-2);font-variant-numeric:tabular-nums}
.g-wl-col.today .g-wl-day{color:var(--g-accent);text-transform:none;letter-spacing:0}
.g-wl-col.today .g-wl-date{color:var(--g-accent)}
.g-wl-col.weekend .g-wl-date{color:var(--g-muted);font-weight:500}
.g-tooltip{position:absolute;top:-6px;transform:translate(-50%,-100%);z-index:5;width:232px;padding:10px 12px;border-radius:10px;background:var(--g-ink);color:#fff;font-size:12.5px;box-shadow:0 12px 32px -10px rgba(22,27,38,.5);pointer-events:none;animation:g-fade .12s ease-out both}
.g-tooltip strong{display:block;font-weight:600;margin-bottom:6px;color:#fff}
.g-tooltip span{display:flex;align-items:center;gap:7px;padding:2px 0;color:rgba(255,255,255,.88)}
.g-tooltip span i{width:7px;height:7px;border-radius:2px;flex-shrink:0}
.g-tooltip span em{margin-left:auto;font-style:normal;color:rgba(255,255,255,.6);font-variant-numeric:tabular-nums;white-space:nowrap}
.g-tooltip span.none{color:rgba(255,255,255,.7)}
.g-chart-foot{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--g-line)}
.g-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;font-weight:600;color:var(--g-ink-2)}
.g-legend li{display:inline-flex;align-items:center;gap:6px}
.g-legend li>i{width:8px;height:8px;border-radius:2px}

.g-status-bar{display:flex;gap:2px;height:10px;border-radius:5px;overflow:hidden;background:var(--g-sunken);margin:4px 0 14px}
.g-status-bar i{display:block;min-width:4px;transform-origin:left;animation:g-fill .6s cubic-bezier(.2,.8,.2,1) both}
.g-status-bar i.overdue,.g-status-legend li.overdue>i{background:var(--g-coral)}
.g-status-bar i.todo,.g-status-legend li.todo>i{background:var(--g-sun)}
.g-status-bar i.submitted,.g-status-legend li.submitted>i{background:var(--g-accent-mid)}
.g-status-bar i.graded,.g-status-legend li.graded>i{background:var(--g-mint)}
.g-status-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px}
.wide .g-status-legend{grid-template-columns:repeat(2,minmax(0,1fr))}
.g-status-legend li{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--g-ink-2);padding:3px 0;cursor:help}
.g-status-legend li>i{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.g-status-legend li strong{margin-left:auto;font-weight:650;color:var(--g-ink);font-variant-numeric:tabular-nums}

.g-standing-rows{display:flex;flex-direction:column}
.g-standing-row{display:grid;grid-template-columns:96px minmax(0,1fr) 30px;align-items:center;gap:12px;margin:0 -8px;padding:6px 8px;border-radius:8px;transition:background .12s}
.g-standing-row:hover{background:var(--g-canvas)}
.g-standing-row+.g-standing-row{border-top:1px solid var(--g-line);border-radius:0}
.g-standing-name{display:grid;grid-template-columns:8px 1fr;column-gap:8px;align-items:center;min-width:0}
.g-standing-name i{width:8px;height:8px;border-radius:2px}
.g-standing-name strong{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-standing-name small{grid-column:2;font-size:11.5px;color:var(--g-muted)}
.g-standing-letter{font-family:var(--g-display);font-size:18px;font-weight:500;text-align:right;color:var(--g-ink)}
.g-track{position:relative;height:34px}
.g-track-bands{position:absolute;left:0;right:0;top:19px;height:8px;display:flex;border-radius:4px;overflow:hidden;gap:1px}
.g-track-bands i{display:block;height:100%}
.g-track-bands .d{width:40%;background:var(--g-band-d)}.g-track-bands .c{width:20%;background:var(--g-band-c)}.g-track-bands .b{width:20%;background:var(--g-band-b)}.g-track-bands .a{width:20%;background:var(--g-band-a)}
.g-track-range{position:absolute;top:21.5px;height:3px;border-radius:2px;background:var(--course);opacity:.7;min-width:2px}
.g-track-range::before,.g-track-range::after{content:"";position:absolute;top:-4px;width:2px;height:12px;border-radius:1px;background:var(--course)}
.g-track-range::before{left:-1px}.g-track-range::after{right:-1px}
.g-track-dot{position:absolute;top:23px;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:var(--course);box-shadow:0 0 0 2.5px var(--g-surface),0 1px 4px rgba(22,27,38,.3);animation:g-pop .4s cubic-bezier(.2,.8,.2,1) both}
.g-track-dot b{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);font-size:11.5px;font-weight:650;color:var(--g-ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.g-track-axis{position:relative;height:16px;font-size:10.5px;color:var(--g-faint);font-variant-numeric:tabular-nums}
.g-track-axis span{position:absolute;top:2px;transform:translateX(-50%)}
.g-track-axis span[style*="100%"]{transform:translateX(-100%)}
.g-standing .g-track-axis{margin:2px 42px 0 108px}
.g-standing-key{margin-top:12px;padding-top:12px;border-top:1px solid var(--g-line);font-weight:500;color:var(--g-muted)}
.g-standing-key i.dot{width:9px;height:9px;border-radius:50%;background:var(--g-ink-2)}
.g-standing-key i.range{width:16px;height:4px;border-radius:2px;background:var(--g-faint)}
.g-standing-key i.bands{width:20px;height:8px;border-radius:2px;background:linear-gradient(90deg,var(--g-band-d) 0 25%,var(--g-band-c) 25% 50%,var(--g-band-b) 50% 75%,var(--g-band-a) 75%)}

.g-course-list{display:flex;flex-direction:column;gap:8px}
.g-course{display:grid;grid-template-columns:minmax(0,1fr) auto 64px;align-items:center;gap:14px;width:100%;padding:12px 14px 12px 16px;background:var(--g-surface);border:1px solid var(--g-line);border-radius:12px;box-shadow:inset 3px 0 0 var(--course,var(--g-accent)),var(--g-shadow);transition:border-color .15s,background .15s}
.g-course:hover{border-color:var(--g-line-2);background:#fcfcfb}
.g-course-info{display:flex;flex-direction:column;min-width:0}
.g-course-code{font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--course)}
.g-course-info strong{font-size:14px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-course-info small{font-size:12px;color:var(--g-muted);margin-top:1px}
.g-course-score{text-align:right}
.g-course-score strong{display:block;font-family:var(--g-display);font-size:20px;font-weight:500;letter-spacing:-.01em;line-height:1.1;font-variant-numeric:lining-nums tabular-nums}
.g-course-score small{font-size:11.5px;color:var(--g-muted);font-weight:600}
.g-strip{display:inline-flex;align-items:flex-end;gap:2px;height:28px}
.g-strip i{display:block;width:5px;border-radius:1.5px;transform-origin:bottom;animation:g-grow .45s cubic-bezier(.2,.8,.2,1) both;opacity:.85}
.g-strip i.low{background:var(--g-coral)}
.g-strip.empty{font-size:11px;color:var(--g-faint);align-items:center}

.g-task{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--g-line)}
.g-task:first-of-type{padding-top:2px}.g-task:last-child{border-bottom:0;padding-bottom:2px}
.g-task-marker{width:3px;align-self:stretch;min-height:30px;border-radius:2px;background:var(--course,var(--g-line-2));flex-shrink:0}
.g-task-main{flex:1;min-width:0}
.g-task-main strong{display:block;font-size:14px;font-weight:600;line-height:1.35}
.g-task-main strong button,.g-task-main strong a{font-weight:600;text-align:left;transition:color .15s}
.g-task-main strong button:hover,.g-task-main strong a:hover{color:var(--g-accent)}
.g-task-meta{display:flex;flex-wrap:wrap;gap:0 6px;margin-top:2px;font-size:12px;color:var(--g-muted)}
.g-task-meta span+span::before{content:"·";margin-right:6px;color:var(--g-faint)}
.g-due{flex-shrink:0;font-size:11.5px;font-weight:650;padding:3px 8px;border-radius:6px;color:var(--g-coral-ink);background:var(--g-coral-soft);white-space:nowrap}
.g-due.normal{color:var(--g-ink-2);background:var(--g-sunken)}
.g-due.late{color:#fff;background:var(--g-coral)}
.g-list{padding-top:12px;padding-bottom:12px}

.g-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.g-tools button{display:grid;grid-template-columns:32px minmax(0,1fr) 14px;align-items:center;gap:10px;padding:12px;background:var(--g-surface);border:1px solid var(--g-line);border-radius:12px;text-align:left;transition:border-color .15s}
.g-tools button:hover{border-color:var(--g-line-2)}
.g-tools button>svg:first-child{width:32px;height:32px;padding:8px;border-radius:8px;background:var(--g-accent-soft);color:var(--g-accent)}
.g-tools button>svg:last-child{color:var(--g-faint)}
.g-tools strong{display:block;font-size:13.5px;font-weight:600}
.g-tools small{display:block;font-size:12px;color:var(--g-muted);line-height:1.35}

/* Coursework */
.g-course-menu{display:flex;gap:8px;align-items:center}
.g-course-menu .g-select{flex:1;min-width:0}
.g-grade-card{padding:18px 18px 16px}
.g-grade-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px}
.g-grade-hero .g-eyebrow{color:var(--course)}
.g-grade-figure{display:flex;align-items:center;gap:10px}
.g-grade-figure strong{font-family:var(--g-display);font-size:44px;font-weight:400;letter-spacing:-.03em;line-height:1;font-variant-numeric:lining-nums tabular-nums}
.g-letter{font-size:13px;font-weight:700;padding:3px 8px;border-radius:6px;background:var(--g-ink);color:#fff}
.g-grade-hero-top p{font-size:12.5px;color:var(--g-muted);margin-top:6px}
.g-grade-facts{display:flex;gap:18px;text-align:right}
.g-grade-facts dt{font-size:10.5px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--g-muted)}
.g-grade-facts dd{font-family:var(--g-display);font-size:22px;font-weight:500;line-height:1.2;font-variant-numeric:lining-nums}
.g-track.large{height:46px}
.g-track.large .g-track-bands{top:22px;height:12px;border-radius:6px}
.g-track.large .g-track-range{top:40px;height:2px;opacity:.85}
.g-track.large .g-track-range::before,.g-track.large .g-track-range::after{top:-4px;height:6px;width:2px}
.g-track.large .g-track-dot{top:28px;width:17px;height:17px;margin:-8.5px 0 0 -8.5px}
.g-track.large .g-track-dot b{font-size:12.5px}
.g-track.large .g-track-bands i{position:relative}
.g-track.large .g-track-bands i::after{position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:8.5px;font-weight:700;letter-spacing:.04em;color:rgba(22,27,38,.42)}
.g-track.large .g-track-bands .d::after{content:"D or below"}.g-track.large .g-track-bands .c::after{content:"C"}.g-track.large .g-track-bands .b::after{content:"B"}.g-track.large .g-track-bands .a::after{content:"A"}
.g-range-note{margin-top:8px}
.g-grade-explain{margin-top:14px;padding-top:14px;border-top:1px solid var(--g-line)}
.g-whatif .g-section-head h2{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.g-big-number{font-family:var(--g-display);font-size:24px;font-weight:500;color:var(--g-accent);font-variant-numeric:lining-nums tabular-nums}
.g-range{--fill:50%;width:100%;height:20px;margin:12px 0 2px;background:transparent;appearance:none;-webkit-appearance:none;cursor:pointer}
.g-range::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--g-accent) 0 var(--fill),var(--g-line-2) var(--fill))}
.g-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-6px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--g-accent),0 2px 6px rgba(22,27,38,.25)}
.g-range:focus-visible{outline:none}.g-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--g-accent),0 0 0 6px var(--g-focus)}
.g-whatif-result{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.g-whatif-result>div{padding:12px 14px;border-radius:10px;background:var(--g-canvas);border:1px solid var(--g-line)}
.g-whatif-result small{display:block;font-size:12px;font-weight:600;color:var(--g-muted)}
.g-whatif-result strong{display:flex;align-items:baseline;gap:8px;font-family:var(--g-display);font-size:26px;font-weight:500;letter-spacing:-.02em;line-height:1.2;font-variant-numeric:lining-nums tabular-nums}
.g-whatif-result em{font-family:var(--g-body);font-style:normal;font-size:12px;font-weight:650;letter-spacing:0;padding:1px 6px;border-radius:5px}
.g-whatif-result .up em{color:var(--g-mint-ink);background:var(--g-mint-soft)}
.g-whatif-result .down em{color:var(--g-coral-ink);background:var(--g-coral-soft)}
.g-whatif-result>div.hot{background:var(--g-surface);border-color:var(--g-accent-mid)}
.g-mini-bar,.g-course-bar{display:block;height:4px;margin-top:8px;border-radius:2px;background:var(--g-line);overflow:hidden}
.g-mini-bar>i,.g-course-bar>i{display:block;height:100%;border-radius:inherit;background:var(--g-faint);transform-origin:left;animation:g-fill .5s ease-out both;transition:width .2s}
.g-whatif-result .hot .g-mini-bar>i,.g-plan-row .g-mini-bar>i{background:var(--g-accent)}
.g-assignment-brief{white-space:pre-wrap;max-height:220px;overflow:auto}
.g-plan-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.g-hours{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:9px;background:var(--g-surface);box-shadow:inset 0 0 0 1px var(--g-line-2);font-size:13px;color:var(--g-muted)}
.g-hours input{width:42px;border:0;outline:0;background:transparent;font-size:16px;font-weight:650;color:var(--g-ink);font-variant-numeric:tabular-nums}
.g-plan-result{margin-top:14px}
.g-plan-row{display:grid;grid-template-columns:minmax(0,1fr) 72px 44px;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--g-line)}
.g-plan-row strong{display:block;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-plan-row small{font-size:12px;color:var(--g-muted)}
.g-plan-row .g-mini-bar{margin:0}
.g-plan-hours{font-size:13px;font-weight:650;text-align:right;font-variant-numeric:tabular-nums}
.g-plan-total{margin-top:10px}
.g-feedback-summary{font-size:14px}
.g-rubric-list{margin-top:4px}
.g-rubric-criterion{padding:12px 0;border-top:1px solid var(--g-line)}
.g-rubric-criterion .g-section-head{margin-bottom:8px}
.g-ratings-summary{font-size:13px!important;color:var(--g-accent)!important}
.g-rubric-ratings{margin-top:8px;border-radius:9px;background:var(--g-canvas);border:1px solid var(--g-line);overflow:hidden}
.g-rubric-ratings li{display:flex;gap:12px;padding:10px 12px;font-size:13px;color:var(--g-ink-2);border-bottom:1px solid var(--g-line)}
.g-rubric-ratings li:last-child{border:0}
.g-rubric-ratings li>span{flex:1}
.g-rubric-ratings strong{white-space:nowrap;color:var(--g-ink);font-variant-numeric:tabular-nums}
.g-feedback-comments{margin-top:12px;padding-top:12px;border-top:1px solid var(--g-line)}
.g-feedback-comments h3{font-size:13px;font-weight:650}
.g-instructor-comment{padding:10px 0;border-bottom:1px solid var(--g-line)}
.g-instructor-comment:last-child{border:0}
.g-comment-author{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--g-muted)}
.g-comment-author strong{color:var(--g-ink);font-weight:600}
.g-instructor-comment p{font-size:13.5px;line-height:1.55;color:var(--g-ink-2);white-space:pre-line;margin-top:4px}

/* Resources and preferences */
.g-resource{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--g-line);color:var(--g-faint)}
.g-resource:last-of-type{border-bottom:0}
.g-resource>span:nth-child(2){flex:1;min-width:0}
.g-resource strong{display:block;font-size:13.5px;font-weight:600;color:var(--g-ink);transition:color .15s}
.g-resource small{font-size:12px;color:var(--g-muted);text-transform:capitalize}
.g-resource:hover strong{color:var(--g-accent)}
.g-resource-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--g-sunken);color:var(--g-ink-2);flex-shrink:0}
.g-announcement{padding:11px 0;border-bottom:1px solid var(--g-line)}
.g-announcement:last-child{border-bottom:0}
.g-announcement summary{font-size:13.5px!important}
.g-announcement summary time{margin-left:auto;font-size:12px;font-weight:500;color:var(--g-muted);white-space:nowrap}
.g-announcement p{font-size:13.5px;line-height:1.6;color:var(--g-ink-2);white-space:pre-line;max-height:220px;overflow:auto}
.g-announcement a{display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:13px;font-weight:600;color:var(--g-accent)}
.g-syllabus{font-size:13.5px;line-height:1.65;color:var(--g-ink-2);white-space:pre-line;max-height:320px;overflow:auto}
.g-course-link{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--g-accent)}
.g-profile{display:flex;align-items:center;gap:12px}
.g-user{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--g-ink);color:#fff;font-size:14px;font-weight:650}
.g-setting-row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--g-line);font-size:13.5px}
.g-setting-row:last-of-type{border-bottom:0}
.g-setting-row span{color:var(--g-muted)}
.g-setting-row strong{font-weight:600;text-align:right;overflow-wrap:anywhere}
.g-credits label{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 0;font-size:13.5px;font-weight:600}
.g-credit{width:70px;height:34px;border:0;border-radius:8px;box-shadow:inset 0 0 0 1px var(--g-line-2);background:var(--g-surface);text-align:center;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums}
.g-credit:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--g-accent)}
.g-scale-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 14px;margin-top:12px}
.g-scale-grid label{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:13px;font-weight:600}
.g-scale-grid .g-credit{width:58px}
.g-issue-details{padding:12px 14px;border-radius:10px;background:var(--g-warning-soft);color:var(--g-warning);font-size:13px}
.g-issue-details summary{color:var(--g-warning)!important}
.g-issue-details ul{margin-top:8px;padding-left:16px;list-style:disc;line-height:1.6}
.g-change+.g-change{margin-top:12px;padding-top:12px;border-top:1px solid var(--g-line)}
.g-change>strong{font-size:13.5px;font-weight:600}
.g-change p{margin-top:3px;white-space:pre-wrap}
.g-change .g-link-btn{margin-top:6px}
.g-more{border-radius:12px;background:var(--g-surface);border:1px solid var(--g-line)}
.g-more>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;font-size:14px;font-weight:600}
.g-more>summary::after{content:"+";font-size:18px;line-height:1;color:var(--g-muted)}
.g-more[open]>summary::after{content:"\\2212"}
.g-more>div{display:flex;flex-direction:column;gap:14px;padding:0 16px 16px}

/* AI rules */
.g-ai-rules ul{margin-top:6px}
.g-ai-rules li{padding:11px 0;border-top:1px solid var(--g-line)}
.g-ai-rule-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.g-ai-rule-head strong{font-size:13px;font-weight:650}
.g-ai-stance{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:650;padding:2px 8px;border-radius:6px;white-space:nowrap}
.g-ai-stance::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.g-ai-stance.restricted{color:var(--g-coral-ink);background:var(--g-coral-soft)}
.g-ai-stance.conditional{color:var(--g-sun-ink);background:var(--g-sun-soft)}
.g-ai-stance.allowed{color:var(--g-mint-ink);background:var(--g-mint-soft)}
.g-ai-stance.unstated{color:var(--g-muted);background:var(--g-sunken)}
.g-ai-rules q{display:block;margin-top:6px;font-family:var(--g-display);font-size:15px;font-style:italic;line-height:1.45;color:var(--g-ink-2);quotes:"\\201C" "\\201D"}
.g-ai-rules q.none{font-family:var(--g-body);font-size:13px;font-style:normal;color:var(--g-muted)}
.g-ai-rules q.none::before,.g-ai-rules q.none::after{content:none}

/* Subnavigation */
.g-subnav{display:flex;gap:2px;margin:-4px 0 18px;border-bottom:1px solid var(--g-line);overflow-x:auto;scrollbar-width:none}
.g-subnav button{position:relative;padding:8px 10px 11px;font-size:13px;font-weight:600;color:var(--g-muted);white-space:nowrap;transition:color .15s}
.g-subnav button:hover{color:var(--g-ink)}
.g-subnav button.active{color:var(--g-ink)}
.g-subnav button.active::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--g-accent)}

/* Presentation demo runs */
.g-run{display:flex;flex-direction:column;gap:14px}
.g-run-head{display:flex;align-items:center;gap:10px}
.g-run-head strong{flex:1;min-width:0;font-family:var(--g-display);font-size:18px;font-weight:500;letter-spacing:-.01em}
.g-run-pulse{width:8px;height:8px;border-radius:50%;background:var(--g-accent);flex-shrink:0;animation:g-breathe 1.2s ease-in-out infinite}
.g-run.finished .g-run-pulse{background:var(--g-mint);animation:none}
.g-run-clock{font-size:12px;font-weight:600;color:var(--g-muted);font-variant-numeric:tabular-nums}
.g-run-progress{height:3px;border-radius:2px;background:var(--g-line);overflow:hidden}
.g-run-progress>i{display:block;height:100%;background:var(--g-accent);transition:width .5s ease-out}
.g-run.finished .g-run-progress>i{background:var(--g-mint)}
.g-run-steps{display:flex;flex-direction:column}
.g-run-steps li{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--g-line);transition:opacity .2s}
.g-run-steps li:first-child{border-top:0}
.g-run-steps li.waiting{opacity:.45}
.g-run-steps li>div{flex:1;min-width:0}
.g-run-steps strong{display:block;font-size:13.5px;font-weight:600}
.g-run-steps small{display:block;font-size:12.5px;color:var(--g-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-run-dot{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex-shrink:0;font-size:11px;font-weight:650;color:var(--g-muted);box-shadow:inset 0 0 0 1px var(--g-line-2);font-variant-numeric:tabular-nums}
.g-run-steps li.active .g-run-dot{color:var(--g-accent);box-shadow:inset 0 0 0 1.5px var(--g-accent)}
.g-run-steps li.done .g-run-dot{background:var(--g-ink);color:#fff;box-shadow:none}
.g-run-time{min-width:38px;text-align:right;font-size:12px;color:var(--g-muted);font-variant-numeric:tabular-nums}
.g-run-result{animation:g-fade .25s ease-out both}
.g-demo-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--g-line)}
.g-demo-row:last-of-type{border-bottom:0}
.g-demo-row-main{flex:1;min-width:0}
.g-demo-row-main strong{display:block;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-demo-row-main small{display:block}
.g-demo-score{font-family:var(--g-display);font-size:18px;font-weight:500;font-variant-numeric:lining-nums tabular-nums}
.g-demo-ok{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:650;color:var(--g-mint-ink);background:var(--g-mint-soft);border-radius:6px;padding:2px 8px;white-space:nowrap}
.g-demo-rank{width:18px;font-size:13px;font-weight:650;color:var(--g-muted);font-variant-numeric:tabular-nums}
.g-demo-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.g-demo-chip{font-size:12.5px;font-weight:500;padding:3px 9px;border-radius:6px;background:var(--g-surface);color:var(--g-ink-2);box-shadow:inset 0 0 0 1px var(--g-line-2)}
.g-demo-chip.topic{text-transform:capitalize;background:var(--g-accent-soft);color:var(--g-accent-hover);box-shadow:none}
.g-demo-match{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--g-line)}
a.g-demo-match{margin:0 -8px;padding:12px 8px;border-radius:8px;border-bottom-color:transparent;box-shadow:0 1px 0 var(--g-line);transition:background .15s}
a.g-demo-match:hover{background:var(--g-canvas)}
a.g-demo-match:hover strong{color:var(--g-accent)}
.g-demo-match .g-demo-row-main strong{white-space:normal;line-height:1.35}
.g-demo-why{display:block;margin-top:3px;font-size:12px;color:var(--g-muted)}
.g-demo-open{color:var(--g-faint);flex-shrink:0;transition:color .15s}
a.g-demo-match:hover .g-demo-open{color:var(--g-accent)}
.g-demo-match-score{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;flex-shrink:0;background:radial-gradient(closest-side,var(--g-surface) 82%,transparent 84%),conic-gradient(var(--g-accent) calc(var(--score)*1%),var(--g-line) 0)}
.g-demo-match-score strong{font-size:12.5px;font-weight:650;font-variant-numeric:tabular-nums}
.g-demo-match-score small{display:none}

/* Earlier layout, kept for the legacy regression build only */
.g-modes{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:0 12px 10px;padding:3px;border-radius:10px;background:var(--g-sunken)}
.g-modes button{height:34px;border-radius:8px;font-weight:600;color:var(--g-muted)}
.g-modes button.active{background:var(--g-surface);color:var(--g-ink)}
.g-hero-cta{display:inline-flex;align-items:center;gap:10px}
.g-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.g-metric{padding:12px 14px;border:1px solid var(--g-line);border-radius:12px;background:var(--g-surface)}
.g-metric strong{display:block;font-size:24px;font-weight:650}
.g-metric small,.g-metric-icon{font-size:12px;color:var(--g-muted)}
.g-overview-grid{display:flex;flex-direction:column;gap:16px}
.g-grade-ring{display:none}

@keyframes g-fade{from{opacity:0}to{opacity:1}}
@keyframes g-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes g-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes g-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes g-breathe{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes g-sheen{to{background-position:-220% 0}}
@keyframes g-spin{to{transform:rotate(360deg)}}

@media(max-width:600px){
  .gw,.gw.wide{inset:0;width:100vw;border-radius:0;border:0;transition:none}
  .g-hide-mobile{display:none}
  .g-body{padding:16px 14px 24px}
  .g-title,.wide .g-title{font-size:26px}
  .g-tools{grid-template-columns:1fr}
  .g-launcher{right:14px;bottom:14px}
}
@media(max-width:420px){
  .g-tab svg{display:none}
  .g-course{grid-template-columns:minmax(0,1fr) 60px}
  .g-course .g-strip{display:none}
  .g-standing-row{grid-template-columns:76px minmax(0,1fr) 26px}
  .g-standing .g-track-axis{margin-left:88px;margin-right:38px}
  .g-present-btn{padding:0 8px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
