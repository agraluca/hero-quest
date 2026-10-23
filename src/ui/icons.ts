/** Inline SVG icons (no icon font, no network). */
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  sword: svg('<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>'),
  flame: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  bow: svg('<path d="M5 3c8 2 14 8 16 16"/><path d="M5 3l16 16"/><path d="M3 21l7-7"/><path d="M3 17v4h4"/>'),
  dagger: svg('<path d="m14 4 6-2-2 6-8 8-4-4z"/><path d="m6 12-3 3 2 2"/><path d="m9 15 -3 3"/><path d="m3 21 2-2"/>'),
  chest: svg('<rect x="3" y="10" width="18" height="10" rx="2"/><path d="M3 10a9 5 0 0 1 18 0"/><path d="M12 13v3"/><rect x="10" y="12" width="4" height="3" rx="1"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  soundOn: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  dash: svg('<path d="M13 5l7 7-7 7"/><path d="M4 12h15"/><path d="M4 7h5"/><path d="M4 17h5"/>'),
  eyeOff: svg('<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3 4.2"/><path d="M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>'),
  spin: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M12 8c1.5 1.6 2 3 1 4.5-.6.9-2 1.1-2.6.2-.5-.8 0-1.6.6-2.2"/>'),
  meteor: svg('<circle cx="15" cy="9" r="5"/><path d="M11 13 3 21"/><path d="M8 9 3 14"/><path d="M15 16l-5 5"/>'),
  snow: svg('<path d="M12 2v20M4 6l16 12M20 6 4 18"/><path d="m9 3 3 3 3-3M9 21l3-3 3 3"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  skull: svg('<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8z"/><circle cx="9" cy="12" r="1.7" fill="currentColor"/><circle cx="15" cy="12" r="1.7" fill="currentColor"/><path d="M10 21v-2.5M14 21v-2.5"/>'),
  check: svg('<path d="m5 12 5 5L20 7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  play: svg('<path d="M7 4v16l13-8z" fill="currentColor"/>'),
};
