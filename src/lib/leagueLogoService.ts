import { LeagueType } from '../types';

const LEAGUE_LOGOS_STORAGE_KEY = 'thaileague_custom_league_logos_v1';

// In-memory cache
const memoryLeagueLogos = new Map<LeagueType, string>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Built-in official SVG badge templates matching the exact BYD Thai League emblems from the user's mockup:
 * - League 1: BYD SEALION 6 LEAGUE I (Red)
 * - League 2: BYD SEAL 5 LEAGUE II (Blue)
 * - League 3: BYD DOLPHIN LEAGUE III (Green)
 */
export const DEFAULT_LEAGUE_SVG_DATA_URLS: Record<LeagueType, string> = {
  'League 1': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 330" width="240" height="330">
  <defs>
    <linearGradient id="l1-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="28%" stop-color="#881337" />
      <stop offset="68%" stop-color="#dc2626" />
      <stop offset="92%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l1-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#64748b" />
    </linearGradient>
    <filter id="l1-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Rounded Arch Badge Shape (Mockup 1 design) -->
  <path d="M 120 12 Q 216 12 216 88 L 216 290 Q 216 318 188 318 L 52 318 Q 24 318 24 290 L 24 88 Q 24 12 120 12 Z" 
        fill="#09090b" stroke="url(#l1-silver)" stroke-width="4.5" filter="url(#l1-shadow)"/>
        
  <!-- Inner Badge Fill -->
  <path d="M 120 18 Q 210 18 210 90 L 210 286 Q 210 312 184 312 L 56 312 Q 30 312 30 286 L 30 90 Q 30 18 120 18 Z" 
        fill="url(#l1-bg)"/>

  <!-- Inner White Accent Outline -->
  <path d="M 120 22 Q 205 22 205 90 L 205 284 Q 205 308 181 308 L 59 308 Q 35 308 35 284 L 35 90 Q 35 22 120 22 Z" 
        fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.85"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="74" r="33" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 110 54 C 128 54 138 64 132 78 C 127 88 116 91 110 91 C 102 91 97 84 101 73 C 105 63 115 58 126 58" 
        fill="none" stroke="#dc2626" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="128" cy="65" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="146" font-family="'Arial Black', system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    BYD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="174" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    SEALION 6
  </text>
  
  <!-- League Badge Bar (Red Solid for League 1) -->
  <rect x="36" y="190" width="168" height="42" rx="5" fill="#cc0000" stroke="#09090b" stroke-width="1.5"/>
  <text x="120" y="217" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE I
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <path d="M 120 260 L 98 268 L 104 271 L 120 266 L 136 271 L 142 268 Z" fill="#94a3b8"/>
  <text x="120" y="286" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="4">
    R Ê V E R
  </text>
</svg>
`)}`,

  'League 2': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 330" width="240" height="330">
  <defs>
    <linearGradient id="l2-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="28%" stop-color="#0369a1" />
      <stop offset="68%" stop-color="#0284c7" />
      <stop offset="92%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l2-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#64748b" />
    </linearGradient>
    <filter id="l2-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Rounded Arch Badge Shape (Mockup 1 design) -->
  <path d="M 120 12 Q 216 12 216 88 L 216 290 Q 216 318 188 318 L 52 318 Q 24 318 24 290 L 24 88 Q 24 12 120 12 Z" 
        fill="#09090b" stroke="url(#l2-silver)" stroke-width="4.5" filter="url(#l2-shadow)"/>
        
  <!-- Inner Badge Fill -->
  <path d="M 120 18 Q 210 18 210 90 L 210 286 Q 210 312 184 312 L 56 312 Q 30 312 30 286 L 30 90 Q 30 18 120 18 Z" 
        fill="url(#l2-bg)"/>

  <!-- Inner White Accent Outline -->
  <path d="M 120 22 Q 205 22 205 90 L 205 284 Q 205 308 181 308 L 59 308 Q 35 308 35 284 L 35 90 Q 35 22 120 22 Z" 
        fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.85"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="74" r="33" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 110 54 C 128 54 138 64 132 78 C 127 88 116 91 110 91 C 102 91 97 84 101 73 C 105 63 115 58 126 58" 
        fill="none" stroke="#0284c7" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="128" cy="65" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="146" font-family="'Arial Black', system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    BYD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="174" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    SEAL 5
  </text>
  
  <!-- League Badge Bar (Blue Solid for League 2) -->
  <rect x="36" y="190" width="168" height="42" rx="5" fill="#0284c7" stroke="#09090b" stroke-width="1.5"/>
  <text x="120" y="217" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE II
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <path d="M 120 260 L 98 268 L 104 271 L 120 266 L 136 271 L 142 268 Z" fill="#94a3b8"/>
  <text x="120" y="286" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="4">
    R Ê V E R
  </text>
</svg>
`)}`,

  'League 3': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 330" width="240" height="330">
  <defs>
    <linearGradient id="l3-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="28%" stop-color="#047857" />
      <stop offset="68%" stop-color="#15803d" />
      <stop offset="92%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l3-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#64748b" />
    </linearGradient>
    <filter id="l3-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Rounded Arch Badge Shape (Mockup 1 design) -->
  <path d="M 120 12 Q 216 12 216 88 L 216 290 Q 216 318 188 318 L 52 318 Q 24 318 24 290 L 24 88 Q 24 12 120 12 Z" 
        fill="#09090b" stroke="url(#l3-silver)" stroke-width="4.5" filter="url(#l3-shadow)"/>
        
  <!-- Inner Badge Fill -->
  <path d="M 120 18 Q 210 18 210 90 L 210 286 Q 210 312 184 312 L 56 312 Q 30 312 30 286 L 30 90 Q 30 18 120 18 Z" 
        fill="url(#l3-bg)"/>

  <!-- Inner White Accent Outline -->
  <path d="M 120 22 Q 205 22 205 90 L 205 284 Q 205 308 181 308 L 59 308 Q 35 308 35 284 L 35 90 Q 35 22 120 22 Z" 
        fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.85"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="74" r="33" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 110 54 C 128 54 138 64 132 78 C 127 88 116 91 110 91 C 102 91 97 84 101 73 C 105 63 115 58 126 58" 
        fill="none" stroke="#15803d" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="128" cy="65" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="146" font-family="'Arial Black', system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    BYD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="174" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    DOLPHIN
  </text>
  
  <!-- League Badge Bar (Green Solid for League 3) -->
  <rect x="36" y="190" width="168" height="42" rx="5" fill="#15803d" stroke="#09090b" stroke-width="1.5"/>
  <text x="120" y="217" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE III
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <path d="M 120 260 L 98 268 L 104 271 L 120 266 L 136 271 L 142 268 Z" fill="#94a3b8"/>
  <text x="120" y="286" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="4">
    R Ê V E R
  </text>
</svg>
`)}`
};

function initLeagueLogos() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LEAGUE_LOGOS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([league, url]) => {
          if (url && typeof url === 'string') {
            memoryLeagueLogos.set(league as LeagueType, url);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load custom league logos from localStorage:', e);
  }
}

initLeagueLogos();

/**
 * Get active league logo (custom uploaded, static public JPG, or default official SVG)
 */
export function getLeagueLogo(league: LeagueType): string {
  if (memoryLeagueLogos.has(league)) {
    return memoryLeagueLogos.get(league)!;
  }
  // Default to official image file in public/crests/ (user uploaded Logo League X.png)
  if (league === 'League 1') return '/crests/Logo%20League%201.png';
  if (league === 'League 2') return '/crests/Logo%20League%202.png';
  if (league === 'League 3') return '/crests/Logo%20League%203.png';

  return DEFAULT_LEAGUE_SVG_DATA_URLS[league];
}

/**
 * Check if a custom logo has been uploaded for this league
 */
export function hasCustomLeagueLogo(league: LeagueType): boolean {
  return memoryLeagueLogos.has(league);
}

/**
 * Save custom logo for a league
 */
export async function saveLeagueLogo(league: LeagueType, dataUrl: string): Promise<void> {
  memoryLeagueLogos.set(league, dataUrl);
  notifyListeners();

  if (typeof localStorage !== 'undefined') {
    try {
      const obj: Record<string, string> = {};
      memoryLeagueLogos.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(LEAGUE_LOGOS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save league logo to localStorage:', e);
    }
  }
}

/**
 * Reset a league logo to official built-in default
 */
export async function resetLeagueLogo(league: LeagueType): Promise<void> {
  memoryLeagueLogos.delete(league);
  notifyListeners();

  if (typeof localStorage !== 'undefined') {
    try {
      const obj: Record<string, string> = {};
      memoryLeagueLogos.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(LEAGUE_LOGOS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to reset league logo in localStorage:', e);
    }
  }
}

/**
 * Subscribe to league logo changes
 */
export function subscribeToLeagueLogos(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
