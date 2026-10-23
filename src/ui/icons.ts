/** Inline SVG icons (no icon font, no network). */
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  soundOn: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  skull: svg('<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8z"/><circle cx="9" cy="12" r="1.7" fill="currentColor"/><circle cx="15" cy="12" r="1.7" fill="currentColor"/><path d="M10 21v-2.5M14 21v-2.5"/>'),
  // pointing hand for the tutorial hint (filled, so it reads on any background)
  hand: `<svg viewBox="0 0 24 24" fill="#FFF6E8" stroke="#201338" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5A1.5 1.5 0 0 1 11 4v6.5l5.2.8a2.2 2.2 0 0 1 1.8 2.4l-.6 5a3.5 3.5 0 0 1-3.5 3.1H11a3.5 3.5 0 0 1-2.8-1.4l-3.4-4.6a1.5 1.5 0 0 1 2.3-1.9L8 15V4a1.5 1.5 0 0 1 1.5-1.5z"/></svg>`,
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  play: svg('<path d="M7 4v16l13-8z" fill="currentColor"/>'),
};
