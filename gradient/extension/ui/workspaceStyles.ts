export const WORKSPACE_STYLES = `
:host{all:initial;color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#182037;font-size:14px;line-height:1.5}
*,*::before,*::after{box-sizing:border-box}
button,input,select,textarea{font:inherit}
button,a,input,select{touch-action:manipulation}
button,a,select{cursor:pointer}
button{color:inherit}
button{transition:background .18s,border-color .18s,color .18s,box-shadow .18s}
a{color:inherit;text-decoration:none}
button:disabled{cursor:wait;opacity:.6}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #2855e8;outline-offset:3px}
svg{display:block;flex-shrink:0}
h1,h2,h3,p{margin:0}
button{border:0}
input,select{max-width:100%}
 .gw,.g-launcher{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.gw{position:fixed;right:14px;top:14px;bottom:14px;width:min(480px,calc(100vw - 28px));z-index:2147483646;display:flex;flex-direction:column;background:#f7f8fc;border:1px solid #fff;border-radius:24px;box-shadow:0 14px 80px #111c3e30,0 0 0 1px #1c2b4d10;overflow:hidden;color:#182037;font-size:14px;line-height:1.5;isolation:isolate}
.gw.wide{width:min(860px,calc(100vw - 28px))}
.g-header{display:flex;align-items:center;gap:10px;padding:21px 24px 18px;background:#fff;border-bottom:1px solid #e9edf5;flex-shrink:0}
.g-brand{display:flex;gap:10px;align-items:center;flex:1}
.g-logo{display:grid;place-items:center;width:35px;height:35px;background:#2855e8;color:white;border-radius:11px}
.g-wordmark{font-weight:850;letter-spacing:-1.2px;font-size:23px;line-height:1}
.g-brand-sub{font-size:9px;font-weight:700;letter-spacing:1.7px;color:#667085;margin-top:5px;text-transform:uppercase}
.g-icon-btn{width:32px;height:32px;display:grid;place-items:center;background:transparent;color:#657087;border-radius:8px}
.g-icon-btn:hover{background:#eef2fa;color:#2855e8}
.g-status{padding:12px 24px 0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;color:#536079;font-size:11px}
.g-live{display:flex;gap:6px;align-items:center;font-size:10px;font-weight:750;letter-spacing:.6px;text-transform:uppercase}
.g-dot{height:6px;width:6px;border-radius:50%;background:#16825c;box-shadow:0 0 0 3px #d9f8e8}
.g-demo-dot{background:#a66a12;box-shadow:0 0 0 3px #fff0cb}
.g-nav{display:flex;gap:3px;padding:15px 16px 16px;background:#fff;border-bottom:1px solid #e5e9f1;flex-shrink:0}
.g-tab{flex:1;min-width:0;display:flex;justify-content:center;gap:6px;align-items:center;padding:9px 4px;border-radius:9px;background:transparent;color:#657087;font-size:11px;font-weight:700;white-space:nowrap}
.g-tab.active{color:#2855e8;background:#edf2ff}
.g-tab:hover{background:#f2f5fb}
.g-body{padding:24px;overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#ccd5e6 transparent}
.g-stack{display:flex;flex-direction:column;gap:20px}
.g-eyebrow{color:#66738b;font-size:10px;font-weight:750;letter-spacing:1.5px;text-transform:uppercase}
.g-title{font-size:29px;letter-spacing:-1.3px;line-height:1.14;font-weight:800;margin-top:6px}
.g-title .g-accent{color:#2855e8}
.g-subtitle{font-size:12px;line-height:1.65;color:#647087;margin-top:9px}
.g-greeting{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.g-date{font-size:10px;color:#58647b;background:#fff;border:1px solid #e4e9f3;border-radius:8px;padding:6px 8px;white-space:nowrap;margin-top:3px;font-weight:600}
.g-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.g-metric{background:#fff;padding:16px 12px;border-radius:13px;border:1px solid #e5e9f1}
.g-metric strong{display:block;font-size:27px;font-weight:800;letter-spacing:-1px;line-height:1.25;margin-bottom:5px}
.g-metric small{font-size:10px;color:#5c6880;font-weight:600}
.g-metric.blue{background:#2855e8;border-color:#2855e8;color:#fff}
.g-metric.blue small{color:#e5ebff}
.g-metric.peach{background:#ffede6;border-color:#ffe2d6}
.g-metric.peach strong{color:#a83f20}
.g-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.g-section-head h2{font-size:15px;letter-spacing:-.3px;font-weight:750}
.g-label-count{font-size:10px;color:#647087;background:#eaf0f7;border-radius:6px;padding:3px 6px;font-weight:700}
.g-link-btn{background:transparent;font-size:11px;font-weight:700;color:#2855e8;display:flex;align-items:center;gap:4px;padding:3px 0}
.g-course-list{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;min-width:0}
.g-course{width:100%;min-width:0;text-align:left;display:flex;gap:12px;align-items:center;padding:15px;background:white;border:1px solid #e5e9f1;border-radius:13px}
.g-course:hover{border-color:#a5b9f7;background:#fcfdff}
.g-course-symbol{white-space:nowrap;height:37px;width:37px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:800;background:var(--tint);color:var(--ink);flex-shrink:0}
.g-course-info{min-width:0;flex:1}
.g-course-info strong{display:block;font-size:12px;font-weight:750;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-course-info small{font-size:10px;color:#647087}
.g-track{height:4px;background:#edf0f6;border-radius:99px;margin-top:8px;overflow:hidden}
.g-track span{display:block;height:100%;background:var(--ink,#2855e8);border-radius:99px}
.g-course-score{flex-shrink:0;font-weight:800;font-size:17px;letter-spacing:-.5px}
.g-course-score small{display:block;font-size:9px;font-weight:500;color:#647087;text-align:right;letter-spacing:0}
.g-task{display:flex;align-items:flex-start;gap:12px;padding:13px 0;border-bottom:1px solid #e9edf4}
.g-task:last-child{border-bottom:0;padding-bottom:0}
.g-task:first-child{padding-top:0}
.g-task-marker{height:30px;width:30px;display:grid;place-items:center;background:#edf2ff;color:#2855e8;border-radius:8px;flex-shrink:0;margin-top:2px}
.g-task-main{flex:1;min-width:0}
.g-task-main strong{display:block;font-size:12px;font-weight:650;line-height:1.5}
.g-task-main a:hover{color:#2855e8}
.g-task-meta{font-size:10px;color:#66738b;display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:4px}
.g-due{font-size:9px;font-weight:750;color:#9c411d;background:#ffecdf;padding:3px 6px;border-radius:5px;white-space:nowrap}
.g-due.normal{color:#426080;background:#edf2f7}
.g-card{background:#fff;border:1px solid #e5e9f1;border-radius:16px;padding:19px}
.g-plan{border:0;background:#edf3ff;position:relative;overflow:hidden}
.g-plan h2{font-size:20px;letter-spacing:-.7px;line-height:1.2;max-width:220px}
.g-plan .g-subtitle{max-width:270px;font-size:11px}
.g-plan-mark{position:absolute;right:20px;top:17px;height:52px;width:52px;border-radius:16px;background:#dbe6ff;color:#2855e8;display:grid;place-items:center;transform:rotate(-9deg)}
.g-plan-controls{display:flex;align-items:center;gap:10px;margin-top:18px}
.g-hours{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #dbe3f5;border-radius:9px;padding:7px 9px;font-size:11px;color:#5b6880}
.g-hours input{width:38px;border:0;background:transparent;color:#182037;font-weight:750;padding:0}
.g-primary{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;background:#2855e8;border:1px solid #2855e8;color:#fff;border-radius:9px;font-size:11px;font-weight:700;min-height:37px}
.g-primary:hover{background:#1740c8;border-color:#1740c8}
.g-secondary{display:flex;align-items:center;justify-content:center;gap:7px;background:#fff;border:1px solid #dbe1ed;border-radius:9px;padding:9px 12px;font-size:11px;font-weight:700;min-height:36px}
.g-secondary:hover{background:#f0f4ff;border-color:#b7c8fa}
.g-notice{display:flex;align-items:flex-start;gap:8px;font-size:11px;line-height:1.6;padding:11px 12px;border-radius:9px;background:#fff4df;color:#7f5520}
.g-notice.info{background:#eaf2ff;color:#345276}
.g-notice.success{background:#e7f6ed;color:#276345}
.g-small{font-size:10px;color:#647087;line-height:1.7}
.g-select{width:100%;padding:11px 12px;background:#fff;border:1px solid #dce3ee;border-radius:10px;color:#182037;font-size:12px}
.g-field-label{font-size:11px;font-weight:700;margin-bottom:7px;display:block}
.g-toolbar{display:flex;gap:8px}
.g-search{display:flex;gap:8px;align-items:center;flex:1;background:#fff;border:1px solid #dce3ee;border-radius:10px;padding:10px 12px;color:#647087}
.g-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#182037;font-size:12px;padding:0}
.g-chips{display:flex;gap:6px;flex-wrap:wrap}
.g-chip{font-size:10px;font-weight:700;border-radius:7px;padding:6px 9px;background:#fff;border:1px solid #e2e7f0;color:#5e6c84}
.g-chip.active{background:#2855e8;border-color:#2855e8;color:white}
.g-grade-card{background:#2855e8;color:#fff;display:flex;align-items:center;gap:24px;padding:24px;border-radius:16px}
.g-grade-ring{height:98px;width:98px;border-radius:50%;padding:7px;background:conic-gradient(#c4f69c calc(var(--grade,0)*1%),#ffffff30 0);flex-shrink:0}
.g-grade-ring>div{height:100%;width:100%;border-radius:50%;background:#2855e8;display:flex;flex-direction:column;align-items:center;justify-content:center}
.g-grade-ring strong{font-size:20px;letter-spacing:-.7px;white-space:nowrap}
.g-grade-ring small{font-size:7px;white-space:nowrap;color:#e0e8ff;text-transform:uppercase;font-weight:700;letter-spacing:.5px}
.g-grade-info h2{font-size:15px;line-height:1.4;font-weight:700;letter-spacing:-.3px}
.g-grade-info p{font-size:10px;color:#dce5ff;margin-top:7px}
.g-grade-info span{font-size:9px;background:#ffffff20;display:inline-flex;gap:4px;align-items:center;padding:3px 6px;border-radius:5px;margin-top:9px}
.g-range{width:100%;accent-color:#2855e8;cursor:pointer;margin:17px 0 8px}
.g-whatif-result{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.g-whatif-result>div{background:#f4f6fb;border-radius:9px;padding:12px}
.g-whatif-result strong{display:block;font-size:22px;font-weight:750;letter-spacing:-.8px}
.g-whatif-result small{font-size:10px;color:#647087}
.g-resource{display:flex;gap:11px;padding:14px 0;border-bottom:1px solid #e9edf4}
.g-resource:last-child{border:0;padding-bottom:0}
.g-resource:first-child{padding-top:0}
.g-resource:hover strong{color:#2855e8}
.g-resource-icon{height:34px;width:34px;background:#f0f3fa;color:#5b6c8d;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
.g-resource>span:nth-child(2){flex:1;min-width:0}
.g-resource strong{font-size:12px;display:block;font-weight:650}
.g-resource small{font-size:10px;color:#647087;text-transform:capitalize}
.g-announcement{padding:13px 0;border-bottom:1px solid #e9edf4}
.g-announcement:first-child{padding-top:0}
.g-announcement:last-child{padding-bottom:0;border:0}
.g-announcement summary{font-size:12px;font-weight:650;cursor:pointer;line-height:1.5}
.g-announcement p{font-size:11px;color:#5e6b81;white-space:pre-line;margin-top:9px;max-height:220px;overflow:auto}
.g-announcement a{font-size:10px;color:#2855e8;display:inline-block;margin-top:8px;font-weight:700}
.g-empty{text-align:center;padding:32px 18px;color:#66738b;font-size:12px}
.g-empty-icon{display:grid;place-items:center;height:48px;width:48px;margin:0 auto 14px;background:#edf2ff;border-radius:14px;color:#2855e8}
.g-empty h2{font-size:16px;color:#182037;letter-spacing:-.4px;margin-bottom:6px}
.g-empty p{line-height:1.7;max-width:280px;margin:0 auto}
.g-footer{border-top:1px solid #e5e9f1;padding:11px 24px;background:#fff;display:flex;align-items:center;justify-content:space-between;color:#66738b;font-size:9px;flex-shrink:0}
.g-footer>span{display:flex;gap:5px;align-items:center}
.g-user{height:22px;width:22px;background:#f6e9dc;color:#785733;border-radius:50%;display:grid;place-items:center;font-size:9px;font-weight:750}
.g-launcher{position:fixed;right:20px;bottom:22px;z-index:2147483646;border-radius:18px;background:#2855e8;color:white;padding:14px 19px;display:flex;align-items:center;gap:10px;box-shadow:0 6px 32px #173bbc50;font-weight:750;font-size:14px;border:1px solid #ffffff45}
.g-launcher:hover{background:#1740c8}
.g-setting-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #e9edf4;font-size:11px}
.g-setting-row:last-child{border:0}
.g-setting-row span{color:#647087}
.g-setting-row strong{font-weight:650;overflow-wrap:anywhere;text-align:right}
.g-credit{width:55px;border:1px solid #dce3ee;border-radius:7px;padding:5px 7px;font-size:11px}
.g-credits label{font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0}
.g-plan-result{margin-top:14px}
.g-plan-result .g-task{border-color:#dce5f7}
.g-plan-result .g-task-marker{background:white}
.g-skeleton{height:92px;border-radius:13px;background:linear-gradient(100deg,#e9edf5 20%,#f8faff 45%,#e9edf5 70%);background-size:220% 100%;animation:g-shimmer 1.6s infinite}
.g-sync-loading{display:flex;gap:8px;align-items:center;color:#2855e8;font-size:11px;margin-bottom:12px}
.g-spinner{animation:g-spin 1.2s linear infinite}
.g-resource-count{font-size:29px;font-weight:800;letter-spacing:-1px;color:#2855e8}
.g-syllabus{font-size:12px;line-height:1.8;color:#536079;white-space:pre-line;max-height:330px;overflow:auto}
.g-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px}
.g-version{font-size:9px;color:#647087;letter-spacing:.5px}
.g-overview-grid>section{min-width:0;width:100%}.g-overview-grid{display:flex;flex-direction:column;gap:20px}
.wide .g-overview-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
.wide .g-overview-grid>section:first-child{grid-row:span 2}
.wide .g-title{font-size:34px}
.wide .g-metric{padding:20px}
.wide .g-nav{gap:12px}
.wide .g-tab{font-size:12px}
.wide .g-course{padding:17px}
.wide .g-plan h2{max-width:210px}
.g-issue-details{font-size:11px;color:#7f5520;background:#fff4df;border-radius:10px;padding:11px 13px}
.g-issue-details summary{cursor:pointer;font-weight:650}
.g-issue-details ul{margin:9px 0 0;padding-left:16px;line-height:1.7}
.g-assignment-description{font-size:12px;color:#536079;line-height:1.8;white-space:pre-line;max-height:230px;overflow:auto;margin-top:13px}
.g-legend{display:flex;justify-content:space-between;font-size:10px;color:#647087}
.g-gradient-art{display:flex;align-items:flex-end;gap:4px;position:absolute;right:18px;bottom:23px;pointer-events:none;opacity:.3}
.g-gradient-art i{display:block;width:8px;border-radius:3px;background:#2855e8}
.g-gradient-art i:nth-child(1){height:14px}
.g-gradient-art i:nth-child(2){height:24px}
.g-gradient-art i:nth-child(3){height:36px}
.g-gradient-art i:nth-child(4){height:50px}
.g-gradient-art i:nth-child(5){height:63px}
.g-plan-controls{position:relative;z-index:1}
.g-bottom-note{font-size:10px;color:#647087;display:flex;gap:6px;align-items:center}
.g-loading-sub{font-size:11px;color:#647087;margin-top:9px}
.g-course-link{font-size:10px;font-weight:700;color:#2855e8;display:inline-flex;gap:4px;align-items:center}
.g-bold-number{font-variant-numeric:tabular-nums}
.g-course-menu{display:flex;gap:9px;align-items:center}
.g-course-menu .g-select{flex:1;min-width:0}

.g-feedback-summary{cursor:pointer;font-size:13px;font-weight:750;line-height:1.6}.g-feedback-summary>span:last-child{margin-left:10px;vertical-align:middle}.g-rubric-list{margin-top:14px}.g-rubric-criterion{padding:15px 0;border-top:1px solid #e9edf4}.g-rubric-criterion:last-child{padding-bottom:0}.g-rubric-criterion h3{font-size:12px;font-weight:700;line-height:1.6}.g-rubric-criterion .g-section-head{align-items:flex-start}.g-rubric-criterion .g-label-count{flex-shrink:0}.g-ratings-summary{font-size:11px;color:#2855e8;font-weight:650;cursor:pointer}.g-rubric-ratings{list-style:none;margin:9px 0 0;padding:0;background:#f7f8fc;border:1px solid #e9edf4;border-radius:9px;overflow:hidden}.g-rubric-ratings li{padding:10px 11px;border-bottom:1px solid #e9edf4;font-size:11px;line-height:1.65;display:flex;gap:12px;align-items:flex-start;color:#536079}.g-rubric-ratings li:last-child{border:0}.g-rubric-ratings li>span{flex:1;min-width:0}.g-rubric-ratings strong{white-space:nowrap;font-size:10px;font-weight:700;color:#34425d}.g-feedback-comments{margin-top:17px;padding-top:15px;border-top:1px solid #e9edf4}.g-feedback-comments h3{font-size:12px;font-weight:750}.g-instructor-comment{padding:12px 0;border-bottom:1px solid #e9edf4}.g-instructor-comment:last-child{border:0;padding-bottom:0}.g-comment-author{display:flex;gap:10px;justify-content:space-between;font-size:10px;color:#536079}.g-comment-author strong{font-weight:700;color:#34425d}.g-comment-author time{flex-shrink:0}.g-instructor-comment p{font-size:12px;line-height:1.75;color:#536079;white-space:pre-line;margin-top:6px}
@keyframes g-shimmer{to{background-position:-220% 0}
}
@keyframes g-spin{to{transform:rotate(360deg)}
}
@media(max-width:600px){.gw,.gw.wide{right:0;top:0;bottom:0;width:100vw;border-radius:0;border:0}
.g-header{padding:17px 18px}
.g-status{padding:11px 18px 0}
.g-nav{padding:13px 18px}
.g-body{padding:21px 18px}
.g-footer{padding:11px 18px}
.g-title{font-size:28px}
.g-date{display:none}
.wide .g-overview-grid{display:flex}
.g-tab{gap:4px;font-size:10px}
.g-tab svg{width:14px}
.g-grade-card{padding:20px;gap:17px}
.g-plan-mark{right:15px}
.g-metric{padding:14px 11px}
.g-wordmark{font-size:22px}
.g-launcher{right:14px;bottom:14px}
.g-hide-mobile{display:none}
}
@media(max-width:400px){.g-tab svg{display:none}.g-grade-card{gap:13px}.g-grade-ring{height:88px;width:88px}.g-grade-ring strong{font-size:20px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}
}

`;

export const ASSISTANT_ENTRY_STYLES = `
.g-assistant-entry{display:flex;align-items:center;gap:12px;text-align:left;border-radius:14px;border:1px solid #dbe3f5;background:#edf3ff;color:#182037;padding:17px 16px;width:100%}
.g-assistant-entry:hover{background:#e5edff;border-color:#b7c8fa}.g-assistant-entry>span:nth-child(2){flex:1;min-width:0}
.g-assistant-entry strong{display:block;font-size:12px;line-height:1.5}.g-assistant-entry small{display:block;margin-top:4px;color:#647087;font-size:10px;line-height:1.6}
.g-assistant-entry-icon{display:grid;place-items:center;width:38px;height:38px;background:#2855e8;border:1px solid #2855e8;border-radius:12px;color:#fff;flex-shrink:0}
@media(max-width:420px){.g-nav{padding-left:10px;padding-right:10px;gap:1px}.g-tab{font-size:10px;gap:3px}.g-tab svg{width:13px;height:13px}}
`;
