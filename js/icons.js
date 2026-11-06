// Icônes au trait (24×24, couleur du texte). Utilisées par l'app mobile et la vue ordinateur.
const P = {
  today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  progress: '<path d="M4 17l5-5 4 4 7-8"/><path d="M14 8h6v6"/>',
  goals: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  cart: '<path d="M3 4h2l2 11h11l2-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 10a5 5 0 0 1 7 0"/><path d="M12 10l1.5-1.5"/>',
  bars: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sport: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2.2 0-4 2.5-4 6v4h4"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
};

export function icon(name, size = 22, width = 2) {
  return `<svg class="ic" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
}
