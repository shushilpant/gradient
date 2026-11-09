/** Shared light palette for the workspace, standalone exports, and settings. */
export const PALETTE_TOKENS = `
--g-ink:#161b26;--g-ink-2:#3d4453;--g-muted:#5d6475;--g-faint:#9aa0ad;
--g-line:#e7e8ec;--g-line-2:#d6d8df;--g-surface:#ffffff;--g-canvas:#f6f6f3;--g-sunken:#eff0ec;
--g-accent:#2f46b0;--g-accent-hover:#243894;--g-accent-soft:#eef0fb;--g-accent-mid:#bcc5ee;
--g-focus:rgba(47,70,176,.38);--g-on-accent:#ffffff;
--g-coral:#c4372f;--g-coral-ink:#a32a23;--g-coral-soft:#fcedeb;
--g-sun:#d9961a;--g-sun-ink:#80510a;--g-sun-soft:#fbf2df;
--g-mint:#2d8a5b;--g-mint-ink:#1d6b45;--g-mint-soft:#e7f3ec;
--g-success:#1d6b45;--g-success-soft:#e7f3ec;--g-warning:#80510a;--g-warning-soft:#fbf2df;
--g-error:#a32a23;--g-error-soft:#fcedeb;--g-highlight:#fff3c4;
--g-c1:#3550c4;--g-c2:#0f8a7a;--g-c3:#c7871a;--g-c4:#b2457a;--g-c5:#6a58c9;--g-c6:#4b7d9e;
--g-band-a:#d8ede0;--g-band-b:#dfe5f7;--g-band-c:#f7eacb;--g-band-d:#f6dfda;
--g-mango:var(--g-warning);--g-pink:var(--g-coral);--g-berry:var(--g-accent);--g-sky:var(--g-accent);
--g-grad:linear-gradient(var(--g-accent),var(--g-accent));--g-grad-soft:linear-gradient(var(--g-accent-soft),var(--g-accent-soft));
--g-shadow:0 1px 2px rgba(22,27,38,.04);--g-shadow-pop:0 1px 2px rgba(22,27,38,.06),0 8px 24px -12px rgba(22,27,38,.22);
--g-display:Newsreader,Georgia,"Times New Roman",serif;
--g-body:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
`;

/** Course identity colours, assigned by position so a course keeps its colour across every chart. */
export const COURSE_COLOURS = ['var(--g-c1)', 'var(--g-c2)', 'var(--g-c3)', 'var(--g-c4)', 'var(--g-c5)', 'var(--g-c6)'];
